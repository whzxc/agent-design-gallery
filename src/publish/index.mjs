import path from 'node:path';
import { readFile, writeFile, mkdir, rename, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaultStateDirectory } from '../hub/registry.mjs';
import { CliError, asCliError, nextActions } from '../cli-output.mjs';
import { prepareDiffInputs } from '../toolkit/diff-inputs.mjs';
import { deriveDocuments, measureDocuments, placeDocuments, hash, layers } from './documents.mjs';
import { carryAnchors } from './anchors.mjs';
import { doopClient } from './doop.mjs';
const exec = promisify(execFile);
async function git(root, args, optional = false) {
  try { return (await exec('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 })).stdout.trim(); }
  catch (cause) {
    if (optional) return null;
    throw new CliError(cause.code === 'ENOENT' ? 'GIT_UNAVAILABLE' : 'GIT_BASE_INVALID', 'Cannot resolve publishing branch and revision; inspect the project Git repository.', { cause, context: { project: root } });
  }
}
export async function branchContext(root) {
  const revision = await git(root, ['rev-parse', 'HEAD']);
  const branch = await git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
  if (!branch) throw new CliError('GIT_BASE_INVALID', 'Publishing requires a named branch; check out the default branch or a draft branch.', { context: { project: root } });
  const remote = await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], true);
  let defaultBranch = remote?.replace(/^origin\//, '');
  if (!defaultBranch) for (const candidate of ['main', 'master']) {
    if (await git(root, ['rev-parse', '--verify', `refs/heads/${candidate}`], true)) { defaultBranch = candidate; break; }
  }
  if (!defaultBranch) throw new CliError('GIT_BASE_INVALID', 'Set origin/HEAD to the default branch before publishing.', { context: { project: root } });
  const defaultRef = await git(root, ['rev-parse', '--verify', `refs/heads/${defaultBranch}`], true) ? defaultBranch : remote;
  const draft = branch !== defaultBranch;
  return { branch, revision, defaultBranch, defaultRef, draft, base: draft ? await git(root, ['merge-base', 'HEAD', defaultRef]) : null };
}
const idOf = value => value.id ?? value.frame?.id ?? value.page?.id ?? value.canvas?.id;
const commentsOf = value => Array.isArray(value) ? value : value.comments ?? [];
export async function publish(config, options = {}, dependencies = {}) {
  const client = dependencies.client ?? doopClient();
  const stateDirectory = path.resolve(options['state-dir'] ?? defaultStateDirectory);
  const root = await realpath(config.root);
  const file = path.join(stateDirectory, 'publish', `${hash(`${client.origin}\n${root}`)}.json`);
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new CliError('STATE_INVALID', `Cannot read publishing state ${file}.`, { cause: error }); }
  state ??= { version: 1, project: root, origin: client.origin, canvasId: null, pages: {}, documents: {}, drafts: {} };
  if (state.version !== 1 || !state.pages || !state.documents || !state.drafts) throw new CliError('STATE_INVALID', `Invalid publishing state ${file}.`);
  const save = async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2));
    await rename(`${file}.tmp`, file);
  };
  const branch = await branchContext(root);
  const data = { project: root, complete: false, stateFile: file, canvas: null, branch, pages: [], documents: [], removed: [], orphaned: [], removedDrafts: [], summary: { created: 0, updated: 0, skipped: 0, removed: 0 } };
  try {
    let documents = await deriveDocuments(config, branch.revision);
    if (branch.draft) {
      const session = await prepareDiffInputs(config, [], { base: branch.base });
      try {
        const previous = new Map((await deriveDocuments(session.before.config, branch.base)).map(doc => [doc.key, doc.hash]));
        documents = documents.filter(doc => previous.get(doc.key) !== doc.hash);
      } finally { await session.close(); }
    }
    const scope = branch.draft ? `draft:${branch.branch}` : 'default';
    const previous = state.documents[scope] ??= {};
    const pending = documents.filter(doc => previous[doc.key]?.hash !== doc.hash);
    // Finish builds and measurement before touching the remote canvas.
    await (dependencies.measure ?? measureDocuments)(pending);
    for (const doc of documents) if (!pending.includes(doc)) Object.assign(doc, { width: previous[doc.key].width, height: previous[doc.key].height });
    placeDocuments(documents);
    if (branch.draft) {
      let offset = 0;
      for (const layer of layers) {
        const rows = documents.filter(doc => doc.layer === layer);
        const extent = Math.max(0, ...rows.map(doc => doc.y + doc.height));
        for (const doc of rows) doc.y += offset;
        if (rows.length) offset += extent + 160;
      }
    }
    if (!state.canvasId) {
      state.canvasId = idOf(await client.call('create_canvas', { name: config.name }));
      if (!state.canvasId) throw new CliError('PUBLISH_DOOP_FAILED', 'Doop did not return a canvas id.');
      await save();
    }
    data.canvas = { id: state.canvasId, url: `${client.origin}/c/${state.canvasId}` };
    let canvas = await client.call('get_canvas', { canvas_id: state.canvasId });
    canvas = canvas.canvas ?? canvas;
    await client.call('set_guidelines', { canvas_id: state.canvasId, name: 'adg-generated', title: 'ADG design sources', markdown: '# Generated by ADG\n\nThis canvas is generated from the project’s TSX design library and tokens.css. Do not edit generated frames in Doop. Make changes in the source files, then run `adg publish`. Use comments for feedback; data-specimen identifies the owning source and frame. ADG replaces documents in place and preserves matching comment anchors. Layer pages track the default branch; Draft pages show branch changes.' });
    const ensurePage = async name => {
      if (!state.pages[name]) {
        const existing = (canvas.pages ?? []).find(page => page.name === name);
        state.pages[name] = existing?.id ?? idOf(await client.call('create_canvas_page', { canvas_id: state.canvasId, name }));
        if (!state.pages[name]) throw new CliError('PUBLISH_DOOP_FAILED', 'Doop did not return a page id.');
        await save();
      }
      return state.pages[name];
    };
    if (!branch.draft) for (const layer of layers) await ensurePage(layer);
    else {
      await ensurePage(`Draft: ${branch.branch}`);
      state.drafts[branch.branch] = { revision: branch.revision, page: `Draft: ${branch.branch}` };
      await save();
    }
    const frameIds = new Set((canvas.frames ?? []).map(frame => frame.id));
    for (const doc of documents) {
      const pageName = branch.draft ? `Draft: ${branch.branch}` : doc.layer;
      const pageId = await ensurePage(pageName);
      let record = previous[doc.key];
      if (!record) {
        // Recover a create whose response was lost before its id reached local state.
        const candidates = (canvas.frames ?? []).filter(frame => frame.name === doc.name && frame.pageId === pageId);
        if (candidates.length > 1) throw new CliError('PUBLISH_DOOP_FAILED', `Multiple remote frames match ${doc.key}; inspect the canvas before retrying.`);
        if (candidates.length === 1) {
          const remote = await client.call('get_frame', { frame_id: candidates[0].id, expand_components: true });
          const html = remote.html ?? remote.frame?.html ?? '';
          if (!html.includes('name="adg-provenance"')) throw new CliError('PUBLISH_DOOP_FAILED', `Remote frame ${doc.name} is not generated by ADG; inspect the canvas before retrying.`);
          record = { id: candidates[0].id, source: doc.source };
        }
      }
      const placement = { pageId, name: doc.name, x: doc.x, y: doc.y, width: doc.width, height: doc.height };
      let frameId = record?.id, action;
      if (record && !frameIds.has(frameId)) throw new CliError('PUBLISH_DOOP_FAILED', `Published frame ${frameId} is missing from Doop; inspect ${file} before republishing.`);
      if (record?.hash === doc.hash) {
        action = 'skipped';
        if (JSON.stringify(record.placement) !== JSON.stringify(placement)) await client.call('update_frame', { frame_id: frameId, ...placement });
      } else if (record) {
        const old = await client.call('get_frame', { frame_id: frameId, expand_components: true });
        const carried = carryAnchors(old.html ?? old.frame?.html ?? '', doc.html);
        const comments = carried.orphaned.length ? commentsOf(await client.call('get_comments', { canvas_id: state.canvasId, frame_id: frameId, include_resolved: true })) : [];
        data.orphaned.push(...carried.orphaned.map(anchor => ({ ...anchor, frameId, source: doc.source, comments: comments.filter(comment => (comment.elementId ?? comment.element_id) === anchor.id) })));
        await client.call('set_frame_html', { frame_id: frameId, html: carried.html });
        await client.call('update_frame', { frame_id: frameId, ...placement });
        action = 'updated';
      } else {
        frameId = idOf(await client.call('create_frame', { canvas_id: state.canvasId, html: doc.html, ...placement }));
        if (!frameId) throw new CliError('PUBLISH_DOOP_FAILED', 'Doop did not return a frame id.');
        action = 'created';
      }
      previous[doc.key] = { id: frameId, hash: doc.hash, source: doc.source, width: doc.width, height: doc.height, placement };
      await save();
      data.summary[action]++;
      data.documents.push({ key: doc.key, source: doc.source, frame: doc.frame ?? null, frameId, pageId, action, url: `${data.canvas.url}?page=${pageId}&frame=${frameId}` });
    }
    const remove = async (key, record, records) => {
      const comments = commentsOf(await client.call('get_comments', { canvas_id: state.canvasId, frame_id: record.id, include_resolved: true }));
      await client.call('delete_frame', { frame_id: record.id });
      data.removed.push({ key, source: record.source, frameId: record.id, comments });
      data.summary.removed++;
      delete records[key]; await save();
    };
    const currentKeys = new Set(documents.map(doc => doc.key));
    for (const [key, record] of Object.entries(previous)) if (!currentKeys.has(key)) await remove(key, record, previous);
    if (!branch.draft) for (const [name, draft] of Object.entries(state.drafts)) {
      if (await git(root, ['merge-base', '--is-ancestor', draft.revision, branch.defaultRef], true) === null) continue;
      const records = state.documents[`draft:${name}`] ?? {};
      for (const [key, record] of Object.entries(records)) await remove(key, record, records);
      delete state.documents[`draft:${name}`]; delete state.pages[draft.page]; delete state.drafts[name];
      data.removedDrafts.push(name);
    }
    canvas = await client.call('get_canvas', { canvas_id: state.canvasId }); canvas = canvas.canvas ?? canvas;
    const orderedNames = [...layers, ...Object.keys(state.drafts).map(name => `Draft: ${name}`)];
    const ownedIds = new Set(Object.values(state.pages));
    const desired = [...orderedNames.filter(name => state.pages[name]).map(name => ({ id: state.pages[name], name })), ...(canvas.pages ?? []).filter(page => !ownedIds.has(page.id) && !data.removedDrafts.some(name => page.name === `Draft: ${name}`))];
    // A new canvas has one empty default page. Reuse it by dropping it only when all frames are owned.
    if (!Object.keys(state.documents).some(key => key !== scope) && (canvas.frames ?? []).every(frame => Object.values(previous).some(record => record.id === frame.id))) {
      const names = new Set(orderedNames); for (let i = desired.length - 1; i >= 0; i--) if (!names.has(desired[i].name) && desired[i].name === 'Page 1') desired.splice(i, 1);
    }
    if (JSON.stringify(canvas.pages) !== JSON.stringify(desired)) await client.call('set_canvas_pages', { canvas_id: state.canvasId, expectedPages: canvas.pages ?? [], pages: desired });
    await save();
    data.pages = desired.map(page => ({ ...page, url: `${data.canvas.url}?page=${page.id}` }));
    data.complete = true;
    const warnings = data.orphaned.length ? [{ code: 'PUBLISH_ORPHANED_ANCHORS', message: `${data.orphaned.length} comment/link anchors have no matching element; inspect data.orphaned.`, next: nextActions('PUBLISH_ORPHANED_ANCHORS', { project: root, stateDirectory }) }] : [];
    return { data, warnings };
  } catch (error) {
    const failure = asCliError(error); failure.data = data; failure.context = { ...failure.context, project: root, stateDirectory }; throw failure;
  }
}
