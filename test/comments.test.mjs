import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { startServer } from '../src/server.mjs';
import { startHub } from '../src/hub.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { registerInstance } from '../src/hub/instances.mjs';
import { hubKey } from '../src/hub/auth.mjs';
import { commentFile } from '../src/comments.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

const exec = promisify(execFile);
const cliFile = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const source = 'design/components/control.tsx';
const chapter = 'Controls';
const position = {
  anchor: { kind: 'frame', source, frame: 'Ready', layer: 'components', chapter, element: null, x: 5, y: 7, frameX: 5, frameY: 7 },
  target: { label: 'components/control#Ready', tag: null, text: null, owner: null, displayName: 'components/control#Ready' },
};

function design(label, frame = 'Ready') {
  return `import { Frame } from 'adg';
export function Control() { return <button data-adg-id="control" style={{ width: '80px', height: '30px' }}>${label}</button> }
export default () => <Frame name="${frame}" width={240} height={160}><main><Control /></main></Frame>;`;
}

async function fixture(t, { git = false } = {}) {
  const folder = await mkdtemp(path.join(tmpdir(), 'adg-comments-'));
  const project = path.join(folder, 'project'), stateDirectory = path.join(folder, 'state');
  const designDirectory = path.join(project, 'design'), file = path.join(project, source);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(path.join(project, 'adg.config.mjs'), 'export default {};');
  await writeFile(path.join(designDirectory, 'tokens.css'), starterTokens);
  await writeFile(path.join(designDirectory, 'gallery.json'), JSON.stringify({ groups: [{ title: chapter, assets: ['components/control.tsx'] }] }));
  await writeFile(file, design('Open'));
  let revision = null;
  if (git) {
    const run = (...args) => exec('git', args, { cwd: project });
    await run('init', '-q');
    await run('add', '.');
    await run('-c', 'user.name=Fixture', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    revision = (await run('rev-parse', 'HEAD')).stdout.trim();
  }
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => server.close()));
    await rm(folder, { recursive: true, force: true });
  });
  const serve = async () => {
    const viewer = await startServer({ directory: designDirectory, stateDirectory, readOnly: true });
    servers.push(viewer);
    return viewer;
  };
  const cli = async (...args) => JSON.parse((await exec(process.execPath, [cliFile, ...args], { cwd: project })).stdout);
  const comments = (...args) => cli('comments', ...args, '--state-dir', stateDirectory, '--json');
  const hub = async publicOrigin => {
    const { data } = await addRoot(project, 0, stateDirectory);
    assert.ok(data);
    const server = await startHub({ port: 0, stateDirectory, publicOrigin });
    servers.push(server);
    const [item] = await (await fetch(new URL('/api/projects', server.url))).json();
    return { server, base: new URL(item.url, server.url) };
  };
  return { project, designDirectory, stateDirectory, revision, file, serve, cli, comments, hub };
}

const endpoint = base => new URL('api/comments', base);
const post = (base, input, headers) => fetch(endpoint(base), { method: 'POST', body: JSON.stringify(input), headers });
async function ok(response) {
  assert.equal(response.status, 200);
  return response.json();
}

test('Comments HTTP and CLI share thread lifecycle, authors, filters, revision and links', async t => {
  const f = await fixture(t, { git: true });
  const viewer = await f.serve();
  assert.deepEqual(await ok(await fetch(endpoint(viewer.url))), { threads: [], revision: f.revision });

  assert.equal((await post(viewer.url, { action: 'create', ...position, message: ' ' })).status, 400);
  assert.equal((await post(viewer.url, { action: 'create', ...position, message: 'x'.repeat(10001) })).status, 400);
  assert.equal((await post(viewer.url, { action: 'create', ...position, anchor: { ...position.anchor, source: '../control.tsx' }, message: 'no' })).status, 400);
  assert.equal((await post(viewer.url, { action: 'create', ...position, message: 'no' }, { Origin: 'https://example.invalid' })).status, 403);
  const long = '🙂'.repeat(10000);
  const first = (await ok(await post(viewer.url, { action: 'create', ...position, message: long, author: 'ignored' }))).thread;
  assert.equal(first.number, 1);
  assert.equal(first.revision, f.revision);
  assert.deepEqual(first.anchor, position.anchor);
  assert.deepEqual(first.target, position.target);
  assert.equal(first.link, null);
  const original = first.messages[0];
  assert.deepEqual(original.author, { kind: 'user' });
  assert.equal(original.text, long);
  const details = new URL(endpoint(viewer.url));
  details.searchParams.set('id', first.id);
  assert.deepEqual(await ok(await fetch(details)), { thread: first });

  const list = await f.comments('--source=' + source, '--frame=Ready');
  assert.equal(list.schemaVersion, 2);
  assert.equal(list.command, 'comments list');
  assert.deepEqual(list.data.threads, [first]);
  assert.deepEqual((await f.comments('--source=design/components/other.tsx')).data.threads, []);
  const edited = (await ok(await post(viewer.url, { action: 'edit', id: 1, messageId: original.id, message: 'Edit\nline two' }))).thread;
  assert.equal(edited.messages[0].text, 'Edit\nline two');
  assert.ok(edited.messages[0].editedAt);

  const resolve = await f.comments('resolve', '#1', '--author=codex', '--message=Fixed');
  assert.equal(resolve.command, 'comments resolve');
  const resolved = resolve.data.thread;
  assert.equal(resolved.status, 'resolved');
  assert.deepEqual(resolved.resolvedBy, { kind: 'agent', name: 'codex' });
  assert.deepEqual(resolved.messages[1].author, resolved.resolvedBy);
  assert.equal(resolved.messages[1].at, resolved.resolvedAt);
  assert.deepEqual((await f.comments()).data.threads, []);
  assert.equal((await f.comments('--status=resolved')).data.threads.length, 1);
  const reply = await f.comments('reply', first.id, '--author=codex', '--message=Also checked');
  assert.equal(reply.command, 'comments reply');
  const replied = reply.data.thread;
  assert.equal(replied.status, 'resolved');
  assert.equal((await post(viewer.url, { action: 'delete', id: 1, messageId: replied.messages[1].id })).status, 403);
  assert.equal((await post(viewer.url, { action: 'edit', id: 1, messageId: replied.messages[1].id, message: 'No' })).status, 403);
  const reopened = (await ok(await post(viewer.url, { action: 'reply', id: 1, message: 'Recheck' }))).thread;
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.resolvedBy, null);
  assert.equal(reopened.resolvedAt, null);
  const userResolved = (await ok(await post(viewer.url, { action: 'resolve', id: '1' }))).thread;
  assert.deepEqual(userResolved.resolvedBy, { kind: 'user' });
  assert.equal((await ok(await post(viewer.url, { action: 'reopen', id: '#1' }))).thread.status, 'open');

  const moved = (await ok(await post(viewer.url, {
    action: 'move', id: 1, revision: null,
    anchor: { kind: 'chapter', layer: 'components', chapter, x: 10, y: 20 },
    target: { label: chapter },
  }))).thread;
  assert.equal(moved.number, 1);
  assert.equal(moved.revision, null);
  assert.deepEqual(moved.anchor, { kind: 'chapter', source: null, frame: null, layer: 'components', chapter, element: null, x: 10, y: 20, frameX: null, frameY: null });
  const readResult = await f.comments('read', '1');
  assert.equal(readResult.command, 'comments read');
  const read = readResult.data.thread;
  assert.equal(read.state, 'attached');
  assert.deepEqual(read.commands, { inspect: null });
  assert.deepEqual(await ok(await post(viewer.url, { action: 'delete-thread', id: 1 })), { thread: null });
  assert.equal((await fetch(details)).status, 404);
  await assert.rejects(f.comments('read', '1'), error => {
    assert.equal(error.code, 2);
    const result = JSON.parse(error.stdout);
    assert.equal(result.error.code, 'COMMENT_NOT_FOUND');
    assert.deepEqual(result.error.next[0].argv, ['adg', 'comments', '--state-dir', f.stateDirectory, '--json']);
    return true;
  });
  const second = (await ok(await post(viewer.url, { action: 'create', ...position, message: 'Next' }))).thread;
  assert.equal(second.number, 2);
  assert.deepEqual(await ok(await post(viewer.url, { action: 'delete', id: 2, messageId: second.messages[0].id })), { thread: null });
  const preview = viewer.url + 'view/all?key=discard&base=HEAD#discard';
  assert.equal((await f.cli('link', preview, '--comment=#2', '--json')).data.url, viewer.url + '?comment=2');
  await assert.rejects(f.cli('link', viewer.url, '--comment=2', '--frame=Ready', '--json'), { code: 2 });
  await assert.rejects(f.comments('reply', '1', '--message=missing author'), { code: 2 });
  assert.equal((await fetch(new URL('api/annotations', viewer.url))).status, 404);
});

async function liveStream(t, base, headers) {
  const deadline = AbortSignal.timeout(12_000);
  const response = await fetch(new URL('events', base), { headers, signal: deadline });
  assert.equal(response.status, 200);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  t.after(() => reader.cancel().catch(() => {}));
  let pending = '';
  async function event() {
    while (!pending.includes('\n\n')) {
      const { value, done } = await reader.read();
      assert.ok(!done, 'Event stream closed before notification.');
      pending += value;
    }
    const separator = pending.indexOf('\n\n');
    const raw = pending.slice(0, separator);
    pending = pending.slice(separator + 2);
    const lines = raw.split('\n');
    return { event: lines.find(line => line.startsWith('event: '))?.slice(7),
      data: JSON.parse(lines.find(line => line.startsWith('data: ')).slice(6)) };
  }
  assert.equal(typeof (await event()).data.revision, 'number');
  return event;
}

test('authenticated hub links use the configured public origin and cross-process writes notify both viewers', { timeout: 15_000 }, async t => {
  const f = await fixture(t);
  const viewer = await f.serve();
  const { server, base } = await f.hub('https://design.example.invalid');
  const registered = await registerInstance({ directory: f.designDirectory, port: viewer.port, id: viewer.id, stateDirectory: f.stateDirectory });
  t.after(() => registered.remove());
  const instanceBase = new URL('/i/' + viewer.id + '/', server.url);
  const forwarded = { 'X-Forwarded-Proto': 'https' };
  const headers = { ...forwarded, Authorization: 'Bearer ' + await hubKey(f.stateDirectory) };
  assert.equal((await fetch(endpoint(base), { headers: forwarded })).status, 401);
  assert.equal((await post(base, { action: 'create', ...position, message: 'no' }, forwarded)).status, 401);
  assert.equal((await post(base, { action: 'create', ...position, message: 'no' }, { ...headers, Origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await fetch(endpoint(instanceBase), { headers: forwarded })).status, 401);
  const created = (await ok(await post(base, { action: 'create', ...position, message: 'Hub comment' }, headers))).thread;
  const expected = new URL(base.pathname + '?comment=1', 'https://design.example.invalid');
  assert.equal(created.link, expected.href);
  assert.equal(created.revision, null);
  assert.equal((await f.comments()).data.threads[0].link, expected.href);
  const direct = await ok(await fetch(endpoint(viewer.url)));
  assert.equal(direct.threads[0].link, expected.href);
  const instance = await ok(await fetch(endpoint(instanceBase), { headers }));
  assert.equal(instance.threads[0].link, expected.href);
  for (const route of ['comments.js', 'comments.css', 'comment-anchors.js', 'context-menu.js']) {
    for (const origin of [viewer.url, base, instanceBase]) {
      const response = await fetch(new URL(route, origin));
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), route.endsWith('.css') ? /text\/css/ : /text\/javascript/);
      await response.text();
    }
  }

  const [hubEvent, directEvent] = await Promise.all([liveStream(t, base, headers), liveStream(t, viewer.url)]);
  const deadline = performance.now() + 2000;
  const [reply, hubChange, directChange] = await Promise.all([
    f.comments('reply', '1', '--author=codex', '--message=Outside either viewer'),
    hubEvent(), directEvent(),
  ]);
  assert.ok(performance.now() < deadline, 'Both viewers should receive the CLI change within 2 seconds.');
  assert.equal(reply.data.thread.messages.length, 2);
  assert.equal(reply.data.thread.link, expected.href);
  assert.deepEqual(hubChange, { event: 'comments', data: { comments: true } });
  assert.deepEqual(directChange, { event: 'comments', data: { comments: true } });

  // Recover an owner whose process exited, with concurrent HTTP and CLI writers.
  const lock = await commentFile(f.project, f.stateDirectory) + '.lock';
  const stalePid = (await exec(process.execPath, ['-p', 'process.pid'])).stdout.trim();
  await mkdir(lock, { recursive: true });
  await writeFile(path.join(lock, stalePid + '-dead'), '');
  await Promise.all([
    ...Array.from({ length: 8 }, (_, i) => post(i % 2 ? base : viewer.url, { action: 'create', ...position, message: 'Concurrent ' + i }, i % 2 ? headers : undefined).then(ok)),
    ...Array.from({ length: 5 }, (_, i) => f.comments('reply', '1', '--author=codex', '--message=CLI ' + i)),
  ]);
  const { threads } = await ok(await fetch(endpoint(base), { headers }));
  assert.deepEqual(threads.map(thread => thread.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(new Set(threads[0].messages.slice(2).map(message => message.text)), new Set(['CLI 0', 'CLI 1', 'CLI 2', 'CLI 3', 'CLI 4']));
});

test('CLI links follow live registration and replace a stored transient link', async t => {
  const f = await fixture(t);
  const viewer = await f.serve();
  const { thread } = await ok(await post(viewer.url, { action: 'create', ...position, message: 'Open this later' }));
  const file = await commentFile(f.project, f.stateDirectory);
  const store = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(Object.hasOwn(store.threads[0], 'link'), false);
  store.threads[0].link = viewer.url + '?comment=1';
  delete store.threads[0].target.displayName;
  await writeFile(file, JSON.stringify(store));
  await viewer.close();
  assert.equal((await f.comments('read', thread.id)).data.thread.link, null);

  const { server, base } = await f.hub();
  const listed = (await f.comments('list')).data.threads[0];
  assert.equal(listed.target.displayName, null);
  assert.equal(listed.link, new URL('?comment=1', base).href);
  await server.close();
  assert.equal((await f.comments('list')).data.threads[0].link, null);
});

test('CLI read reports observed element geometry, stable-ID text changes and missing targets', { timeout: 45_000 }, async t => {
  const f = await fixture(t);
  const viewer = await f.serve();
  const inspect = () => f.cli('inspect', source, '--frame=Ready', '--theme=light', '--expand', '--json', '--state-dir', f.stateDirectory);
  const initial = (await inspect()).data.baseline.elements.find(element => element.tag === 'button');
  assert.ok(initial?.id.startsWith('e1_'));
  const { thread } = await ok(await post(viewer.url, {
    action: 'create', anchor: { ...position.anchor, kind: 'element', element: { id: initial.id } },
    target: { ...position.target, tag: 'button', text: 'Open', owner: source + '#Control' }, message: 'Check this control',
  }));
  const read = async () => (await f.comments('read', thread.id)).data.thread;
  let context = await read();
  assert.equal(context.state, 'attached');
  assert.deepEqual(context.elementBox, initial.geometry.box);
  assert.ok(context.commands.inspect.includes('--element=' + initial.id));
  assert.ok(context.commands.inspect.includes(source));
  await writeFile(f.file, design('Close'));
  context = await read();
  assert.equal(context.state, 'changed');
  assert.ok(context.elementBox?.width > 0);
  assert.ok(context.commands.inspect.includes('--element=' + initial.id), 'A stable but changed element is still inspectable.');
  await writeFile(f.file, design('Close').replace('data-adg-id="control"', 'data-adg-id="new-control"'));
  context = await read();
  assert.equal(context.state, 'changed');
  assert.equal(context.elementBox, null);
  assert.ok(!context.commands.inspect.includes('--element='));
  await writeFile(f.file, design('Close', 'Other'));
  assert.equal((await read()).state, 'changed');
  await rm(f.file);
  assert.equal((await read()).state, 'gone');
});
