import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { CliError } from './cli-output.mjs';
import { isFeatureInternal, listSources, readGroups } from './toolkit/project.mjs';
import { currentHead } from './toolkit/arch-git.mjs';
import { groupAssets } from '../public/assets.js';

const defaultStateDirectory = path.join(os.homedir(), '.agent-design-gallery');
const statuses = ['open', 'resolved', 'all'];
const kinds = ['element', 'frame', 'source', 'chapter'];
const viewerActions = ['create', 'reply', 'edit', 'delete', 'delete-thread', 'move', 'resolve', 'reopen'];
const user = { kind: 'user' };
const invalid = message => new CliError('USAGE_INVALID', message);
const string = value => typeof value === 'string' && value.trim().length > 0;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim().slice(0, 120) || null;

export async function commentFile(root, stateDirectory = defaultStateDirectory) {
  const key = createHash('sha256').update(await realpath(root)).digest('hex');
  return path.join(stateDirectory, 'comments', key + '.json');
}

export async function commentRevision(root) {
  try { return await currentHead({ root }); }
  catch (error) {
    if (error.code === 'GIT_UNAVAILABLE') return null;
    throw error;
  }
}

// Each contender publishes a nonempty lock directory in one rename. Releasing
// or recovering it removes only its unique owner entry and then an empty directory.
async function withProjectLock(file, mutate) {
  const lock = file + '.lock', folder = path.dirname(file);
  const owner = `${process.pid}-${randomUUID()}`;
  await mkdir(folder, { recursive: true });
  const candidate = await mkdtemp(path.join(folder, '.lock-'));
  const removeEmptyLock = async () => {
    try { await rmdir(lock); }
    catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM'].includes(error.code)) throw error; }
  };
  const removeOwner = async name => {
    await rm(path.join(lock, name), { force: true });
    await removeEmptyLock();
  };
  const deadline = Date.now() + 5000;
  try {
    await writeFile(path.join(candidate, owner), '');
    for (;;) {
      try { await rename(candidate, lock); break; }
      catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
        let entries;
        try { entries = await readdir(lock); }
        catch (cause) { if (cause.code !== 'ENOENT') throw error; entries = []; }
        if (!entries.length) await removeEmptyLock();
        for (const entry of entries) {
          const pid = Number(/^(\d+)-[\da-f-]+$/.exec(entry)?.[1]);
          if (!pid) continue;
          try { process.kill(pid, 0); }
          catch (cause) { if (cause.code === 'ESRCH') await removeOwner(entry); }
        }
        if (Date.now() >= deadline) throw new CliError('IO_FAILED', `Timed out waiting to write comments at ${file}; retry.`);
        await delay(25);
      }
    }
    try { return await mutate(); }
    finally { await removeOwner(owner); }
  } finally { await rm(candidate, { recursive: true, force: true }); }
}

async function readStore(file) {
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { nextNumber: 1, threads: [] };
    if (error instanceof SyntaxError) throw new CliError('STATE_INVALID', `Invalid comments file: ${file}`, { cause: error });
    throw error;
  }
  if (!object(data) || !Number.isSafeInteger(data.nextNumber) || data.nextNumber < 1 || !Array.isArray(data.threads))
    throw new CliError('STATE_INVALID', `Invalid comments file: ${file}`);
  return data;
}

async function writeStore(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

function findThread(threads, id) {
  const number = (typeof id === 'number' || typeof id === 'string' && /^#?[1-9]\d*$/.test(id)) ? Number(String(id).replace(/^#/, '')) : null;
  const index = threads.findIndex(thread => thread.id === id || thread.number === number);
  if (index === -1) throw new CliError('COMMENT_NOT_FOUND', `Unknown comment thread ${JSON.stringify(id ?? null)}.`);
  return index;
}

const sourcePath = value => string(value) && /\.(tsx|svg)$/i.test(value) && !/[\\:\0]/.test(value) &&
  value.split('/').every(part => part && part !== '.' && part !== '..');

function placement(input, revision) {
  const { anchor, target } = input;
  if (!object(anchor) || !kinds.includes(anchor.kind) || !object(target) || !string(target.label))
    throw invalid('Provide a comment anchor and target label.');
  const { kind, layer = null, chapter = null, x, y } = anchor;
  const hasFrame = kind === 'frame' || kind === 'element';
  const source = kind === 'chapter' ? null : anchor.source;
  const frame = hasFrame ? anchor.frame : null;
  const element = kind === 'element' ? anchor.element : null;
  const frameX = hasFrame ? anchor.frameX : null, frameY = hasFrame ? anchor.frameY : null;
  if (source !== null && !sourcePath(source) || kind !== 'chapter' && !source ||
    hasFrame && (!string(frame) || !Number.isFinite(frameX) || !Number.isFinite(frameY)) ||
    kind === 'element' && (typeof element?.id !== 'string' || !/^e1_[\da-f]+$/.test(element.id)) ||
    !Number.isFinite(x) || !Number.isFinite(y) ||
    layer !== null && !string(layer) || chapter !== null && !string(chapter) ||
    kind === 'chapter' && (!layer || !chapter || ['tokens', 'arch'].includes(layer)))
    throw invalid('Provide a valid target identity and point for the comment anchor.');
  if (revision !== null && (!string(revision) || revision.length > 128 || /[\r\n]/.test(revision)))
    throw invalid('Provide a Git revision or null.');
  const snapshot = { label: target.label, tag: null, text: null, owner: null };
  if (element) {
    if (!string(target.tag) || target.text != null && typeof target.text !== 'string' ||
      target.owner != null && !string(target.owner)) throw invalid('Provide a valid element snapshot.');
    Object.assign(snapshot, { tag: target.tag, text: target.text?.slice(0, 120) || null, owner: target.owner ?? null });
  }
  return { anchor: { kind, source, frame, layer, chapter, element: element ? { id: element.id } : null, x, y, frameX, frameY }, target: snapshot, revision };
}

function messageText(text) {
  if (!string(text) || Array.from(text).length > 10000) throw invalid('Provide a message between 1 and 10,000 characters.');
  return text;
}

function addMessage(thread, text, author, at) {
  thread.messages.push({ id: randomUUID(), author, text: messageText(text), at, editedAt: null });
}

function reopen(thread) {
  Object.assign(thread, { status: 'open', resolvedAt: null, resolvedBy: null });
}

function linked(thread, viewerURL) {
  if (!viewerURL) return thread;
  return { ...thread, link: new URL(`?comment=${thread.number}`, viewerURL).href };
}

export async function listComments(root, stateDirectory, { status = 'all', source, frame, viewerURL } = {}) {
  if (!statuses.includes(status)) throw invalid('Choose --status=open, --status=resolved or --status=all.');
  const { threads } = await readStore(await commentFile(root, stateDirectory));
  return { threads: threads.filter(thread => (status === 'all' || thread.status === status) &&
    (source === undefined || thread.anchor.source === source) && (frame === undefined || thread.anchor.frame === frame))
    .map(thread => linked(thread, viewerURL)) };
}

export async function readComment(root, stateDirectory, id, viewerURL) {
  const { threads } = await readStore(await commentFile(root, stateDirectory));
  return { thread: linked(threads[findThread(threads, id)], viewerURL) };
}

export async function changeComment(root, stateDirectory, input, { viewerURL, author } = {}) {
  if (!object(input) || !viewerActions.includes(input.action) || !viewerURL && !['reply', 'resolve'].includes(input.action))
    throw invalid('Choose a supported comment action.');
  const { action, id, message, messageId } = input;
  const actor = viewerURL ? user : { kind: 'agent', name: author?.trim() };
  if (!viewerURL && !string(actor.name)) throw invalid('Set --author to the agent name.');
  const file = await commentFile(root, stateDirectory);
  const placed = ['create', 'move'].includes(action)
    ? placement(input, input.revision === undefined ? await commentRevision(root) : input.revision)
    : null;
  return withProjectLock(file, async () => {
    const store = await readStore(file), { threads } = store, now = new Date().toISOString();
    if (action === 'create') {
      const thread = linked({ id: randomUUID(), number: store.nextNumber++, status: 'open', ...placed, messages: [],
        createdAt: now, updatedAt: now, resolvedAt: null, resolvedBy: null }, viewerURL);
      addMessage(thread, message, actor, now);
      threads.push(thread);
      await writeStore(file, store);
      return { thread };
    }
    const index = findThread(threads, id), thread = threads[index];
    switch (action) {
      case 'reply':
        addMessage(thread, message, actor, now);
        if (viewerURL && thread.status === 'resolved') reopen(thread);
        break;
      case 'resolve':
        if (message !== undefined) addMessage(thread, message, actor, now);
        Object.assign(thread, { status: 'resolved', resolvedAt: now, resolvedBy: actor });
        break;
      case 'reopen':
        reopen(thread);
        break;
      case 'edit':
      case 'delete': {
        const index = thread.messages.findIndex(entry => entry.id === messageId);
        if (index === -1) throw new CliError('COMMENT_NOT_FOUND', 'Unknown comment message.');
        const entry = thread.messages[index];
        if (entry.author.kind !== 'user') throw new CliError('COMMENT_FORBIDDEN', 'Only your own messages can be edited or deleted.');
        if (action === 'edit') Object.assign(entry, { text: messageText(message), editedAt: now });
        else thread.messages.splice(index, 1);
        break;
      }
      case 'move':
        Object.assign(thread, placed);
        break;
    }
    const removed = action === 'delete-thread' || !thread.messages.length;
    if (removed) threads.splice(index, 1);
    else thread.updatedAt = now;
    await writeStore(file, store);
    return { thread: removed ? null : linked(thread, viewerURL) };
  });
}

const quote = value => /^[\w/.#=-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
const inspectArgv = ({ source, frame }, element) => ['adg', 'inspect',
  ...(frame ? [`--frame=${frame}`] : []), ...(element ? [`--element=${element}`] : []), '--json', '--', source];

export async function readCommentContext(config, stateDirectory, id) {
  const { thread } = await readComment(config.root, stateDirectory, id);
  const { anchor, target } = thread;
  const result = { ...thread, state: 'attached', elementBox: null, commands: { inspect: null } };
  if (anchor.kind === 'chapter') {
    const assets = listSources(config.design, config.sources)
      .map(file => path.relative(config.design, file).split(path.sep).join('/'))
      .filter(file => !isFeatureInternal(file, config.sources))
      .map(file => ({ path: file }));
    const groups = readGroups(config.design, config.sources);
    if (!groupAssets({ assets, groups }).some(group => group.layer === anchor.layer && group.title === anchor.chapter)) result.state = 'gone';
  } else {
    const file = path.resolve(config.root, anchor.source);
    const candidates = listSources(config.design, config.sources);
    if (!candidates.includes(file)) {
      const legacy = file.endsWith('.svg') && file.startsWith(config.design + path.sep) && (await stat(file).catch(error => {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }))?.isFile();
      if (!legacy) result.state = 'gone';
    }
    let elementId = null;
    if (result.state === 'attached' && anchor.frame && file.endsWith('.tsx')) {
      const { inspect } = await import('./toolkit/inspect.mjs');
      try {
        const { data } = await inspect(config, [anchor.source], {
          frame: anchor.frame, ...(anchor.element ? {} : { theme: 'light' }),
          wrappers: 'all', fields: 'structure,layout,text',
          json: true, expand: true, ...(stateDirectory ? { 'state-dir': stateDirectory } : {}),
        });
        if (anchor.element) {
          const scenes = [data.baseline, ...Object.values(data.additionalThemes)];
          const matches = scenes.flatMap(scene => scene.elements.filter(entry => entry.id === anchor.element.id).map(element => ({ scene, element })));
          const match = matches.find(({ element }) => element.geometry?.box?.width && element.geometry?.box?.height) ?? matches[0];
          if (match) {
            const { scene, element } = match;
            elementId = element.id;
            result.elementBox = element.geometry?.box ?? null;
            const direct = scene.runs.filter(run => run.element === element.id && run.kind === 'dom').map(run => run.raw).join('');
            if (element.tag !== target.tag || normalizeText((element.role && element.name) || direct) !== target.text) result.state = 'changed';
          } else result.state = 'changed';
        }
      } catch (error) {
        if (error.code === 'SOURCE_NOT_FOUND') result.state = 'gone';
        else if (error.code === 'FRAME_NOT_FOUND') result.state = 'changed';
        else throw error;
      }
    }
    if (file.endsWith('.tsx')) result.commands.inspect = inspectArgv(anchor, elementId).map(quote).join(' ');
  }
  return { thread: result };
}
