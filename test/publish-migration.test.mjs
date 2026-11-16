import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { carryAnchors } from '../src/publish/anchors.mjs';
import { publish } from '../src/publish/index.mjs';
const exec = promisify(execFile);

test('section and specimen anchors survive chapter section reordering', () => {
  const before = '<main><section data-adg-section="components/a.tsx" data-doop-id="section"><header><h2 data-doop-id="title">A</h2></header><div data-specimen="components/a.tsx#ready"><button data-doop-id="button">Save</button></div></section><section data-adg-section="components/b.tsx"><h2>B</h2></section></main>';
  const after = '<main><section data-adg-section="components/b.tsx"><h2>B</h2></section><section data-adg-section="components/a.tsx"><header><h2>A updated</h2></header><div data-specimen="components/a.tsx#ready"><button>Save now</button></div></section></main>';
  const result = carryAnchors(before, after);
  assert.equal(result.kept.length, 3);
  assert.equal(result.orphaned.length, 0);
  assert.match(result.html, /data-adg-section="components\/a.tsx" data-doop-id="section"/);
  assert.match(result.html, /<h2 data-doop-id="title">A updated/);
  assert.match(result.html, /<button data-doop-id="button">Save now/);
  assert.deepEqual(carryAnchors(before, '<main></main>').orphaned.map(anchor => anchor.source), ['components/a.tsx', 'components/a.tsx', 'components/a.tsx']);
});

async function publishingProject(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-chapter-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['components', 'modules', 'surfaces']) await mkdir(path.join(root, 'design', directory), { recursive: true });
  await writeFile(path.join(root, 'adg.config.mjs'), 'export default {};');
  await writeFile(path.join(root, 'design/tokens.css'), starterTokens);
  await writeFile(path.join(root, 'design/components/button.tsx'), 'import {Frame} from "adg";export default()=> <Frame name="ready"><button>Save</button></Frame>;');
  await writeFile(path.join(root, 'design/surfaces/home.tsx'), 'import {Frame} from "adg";export default()=> <Frame name="home" width={400} height={300}><main>Home</main></Frame>;');
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'ADG Test'], ['config', 'user.email', 'test@example.test'], ['add', '.'], ['commit', '-m', 'test: initial design']]) await exec('git', ['-C', root, ...args]);
  const config = await loadConfig(root);
  const frames = new Map(), comments = new Map();
  const canvas = { id: 'canvas', pages: [] };
  let sequence = 0, interrupted = false, failDeletion = false;
  const client = { origin: 'https://doop.test', async call(name, args) {
    switch (name) {
      case 'create_canvas': return { id: canvas.id };
      case 'get_canvas': return { ...canvas, frames: [...frames.values()] };
      case 'set_guidelines': return {};
      case 'create_canvas_page': { const page = { id: `page-${++sequence}`, name: args.name }; canvas.pages.push(page); return page; }
      case 'set_canvas_pages': canvas.pages = args.pages; return {};
      case 'create_frame': { const frame = { ...args, id: `frame-${++sequence}` }; frames.set(frame.id, frame); return frame; }
      case 'get_frame': return frames.get(args.frame_id);
      case 'set_frame_html': frames.get(args.frame_id).html = args.html; return {};
      case 'update_frame': Object.assign(frames.get(args.frame_id), args); return {};
      case 'get_comments': assert.ok(frames.has(args.frame_id)); return comments.get(args.frame_id) ?? [];
      case 'delete_frame': frames.delete(args.frame_id); if (failDeletion && !interrupted) { interrupted = true; throw Error('Lost deletion response'); } return {};
      default: throw Error(`Unexpected call ${name}`);
    }
  } };
  const run = () => publish(config, { 'state-dir': path.join(root, 'state') }, { client });
  return { root, run, frames, comments, failNextDeletion() { failDeletion = true; } };
}

test('chapter migration replaces legacy sheets and retains removed comment reports across a delete retry', async t => {
  const { run, frames, comments, failNextDeletion } = await publishingProject(t);
  const initial = (await run()).data;
  const board = initial.documents.find(document => document.layer === 'Components');
  const surface = initial.documents.find(document => document.kind === 'surface');
  const state = JSON.parse(await readFile(initial.stateFile, 'utf8'));
  const legacyKey = 'design/components/button.tsx';
  state.documents.default[legacyKey] = { ...state.documents.default[board.key], source: legacyKey, kind: 'sheet' };
  delete state.documents.default[board.key];
  frames.get(board.frameId).name = legacyKey;
  comments.set(board.frameId, [{ id: 'old-comment', elementId: 'old-anchor', content: 'Existing feedback' }]);
  await writeFile(initial.stateFile, JSON.stringify(state));
  failNextDeletion();
  await assert.rejects(run, /Lost deletion response/);
  const migrated = (await run()).data;
  assert.equal(migrated.canvas.id, initial.canvas.id);
  assert.equal(migrated.removed.length, 1);
  assert.equal(migrated.removed[0].frameId, board.frameId);
  assert.equal(migrated.removed[0].comments[0].id, 'old-comment');
  assert.equal(migrated.documents.find(document => document.kind === 'surface').frameId, surface.frameId);
  assert.equal(migrated.pages.find(page => page.name === 'Components').boardCount, 1);
  assert.equal(migrated.pages.find(page => page.name === 'Surfaces').surfaceCount, 1);
  assert.equal(frames.has(board.frameId), false);
  const skipped = (await run()).data;
  assert.equal(skipped.summary.skipped, skipped.documents.length);
  assert.equal(skipped.summary.removed, 0);
});


test('reordering gallery chapters keeps frame IDs and moves their placement', async t => {
  const { root, run, frames } = await publishingProject(t);
  await writeFile(path.join(root, 'design/components/field.tsx'), 'import {Frame} from "adg";export default()=> <Frame name="ready"><input placeholder="Name"/></Frame>;');
  const groups = [{ title: 'Controls', assets: ['components/button.tsx'] }, { title: 'Fields', assets: ['components/field.tsx'] }];
  const gallery = path.join(root, 'design/gallery.json');
  await writeFile(gallery, JSON.stringify({ groups }));
  const first = (await run()).data;
  const controls = first.documents.find(document => document.name === 'Controls');
  const fields = first.documents.find(document => document.name === 'Fields');
  assert.ok(frames.get(controls.frameId).x < frames.get(fields.frameId).x);
  await writeFile(gallery, JSON.stringify({ groups: groups.reverse() }));
  const reordered = (await run()).data;
  assert.equal(reordered.documents.find(document => document.name === 'Controls').frameId, controls.frameId);
  assert.equal(reordered.documents.find(document => document.name === 'Fields').frameId, fields.frameId);
  assert.ok(frames.get(fields.frameId).x < frames.get(controls.frameId).x);
  assert.equal(reordered.summary.removed, 0);
  assert.equal(reordered.summary.created, 0);
  assert.equal((await run()).data.summary.skipped, first.documents.length);
});

test('recovering a board from an earlier state key does not delete its current frame', async t => {
  const { run, frames, comments } = await publishingProject(t);
  const initial = (await run()).data;
  const board = initial.documents.find(document => document.layer === 'Components');
  const state = JSON.parse(await readFile(initial.stateFile, 'utf8'));
  state.documents.default['chapter:legacy:0:Controls:1'] = state.documents.default[board.key];
  delete state.documents.default[board.key];
  comments.set(board.frameId, [{ id: 'retained', content: 'Board feedback' }]);
  await writeFile(initial.stateFile, JSON.stringify(state));
  const recovered = (await run()).data;
  assert.equal(recovered.documents.find(document => document.layer === 'Components').frameId, board.frameId);
  assert.equal(frames.has(board.frameId), true);
  assert.equal(recovered.removed.length, 0);
  assert.equal(comments.get(board.frameId)[0].id, 'retained');
  const saved = JSON.parse(await readFile(initial.stateFile, 'utf8'));
  assert.equal(saved.documents.default[board.key].id, board.frameId);
  assert.equal('chapter:legacy:0:Controls:1' in saved.documents.default, false);
  assert.equal((await run()).data.summary.skipped, initial.documents.length);
});
