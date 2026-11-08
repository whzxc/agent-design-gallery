import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { registerInstance, listInstances } from '../src/hub/instances.mjs';
import { VERSION } from '../src/toolkit/config.mjs';

async function fixture(t) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdg-instances-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'project'), stateDirectory = path.join(temporary, 'state');
  await mkdir(directory);
  await writeFile(path.join(directory, 'sdg.config.mjs'), "export default {name:'Instance project'};");
  return { directory, stateDirectory };
}
async function server(t, handler) {
  const service = createServer(handler);
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    service.closeAllConnections();
    await new Promise(resolve => service.close(resolve));
  });
  return service.address().port;
}
const respond = health => (_request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(health));
};

test('instance registration records the running viewer and health identity controls proxyability', async t => {
  const input = await fixture(t), port = await server(t, respond({ id: 'viewer-a', capabilities: { keyAuth: 1 } }));
  const { record, remove } = await registerInstance({ ...input, port, id: 'viewer-a' });
  assert.equal(record.pid, process.pid);
  assert.equal(record.port, port);
  assert.equal(record.name, 'Instance project');
  assert.equal(record.directory, input.directory);
  assert.equal(record.branch, null);
  assert.equal(record.worktree, false);
  assert.equal(record.version, VERSION);
  assert.ok(Number.isFinite(Date.parse(record.startedAt)));
  assert.deepEqual(JSON.parse(await readFile(path.join(input.stateDirectory, 'instances/viewer-a.json'), 'utf8')), record);
  const [live] = await listInstances(input.stateDirectory);
  assert.equal(live.proxyable, true);
  assert.equal(live.url, '/i/viewer-a/');
  await remove();
  await remove();
  assert.deepEqual(await listInstances(input.stateDirectory), []);
});

test('legacy health, missing proxy capability and unavailable health remain listed without proxy access', async t => {
  const input = await fixture(t);
  const cases = [
    ['legacy', respond({ status: 'ok' }), 'health-contract-missing'],
    ['old-auth', respond({ id: 'old-auth' }), 'proxy-auth-unsupported'],
    ['no-health', (_request, response) => { response.writeHead(404); response.end(); }, 'health-unavailable'],
  ];
  for (const [id, handler] of cases) await registerInstance({ ...input, id, port: await server(t, handler) });
  const listed = await listInstances(input.stateDirectory);
  assert.equal(listed.length, cases.length);
  for (const [id, , reason] of cases) {
    const instance = listed.find(item => item.id === id);
    assert.equal(instance.proxyable, false);
    assert.equal(instance.url, null);
    assert.equal(instance.reason, reason);
  }
});

test('stale pid, reused port identity, invalid records and malformed JSON are pruned', async t => {
  const input = await fixture(t), port = await server(t, respond({ id: 'new-viewer', capabilities: { keyAuth: 1 } }));
  const { record } = await registerInstance({ ...input, id: 'old-viewer', port });
  const folder = path.join(input.stateDirectory, 'instances');
  await writeFile(path.join(folder, 'dead.json'), JSON.stringify({ ...record, id: 'dead', pid: 2147483647 }));
  await writeFile(path.join(folder, 'unsafe.json'), JSON.stringify({ ...record, id: '../unsafe' }));
  await writeFile(path.join(folder, 'bad-port.json'), JSON.stringify({ ...record, id: 'bad-port', port: 0 }));
  await writeFile(path.join(folder, 'invalid.json'), '{');
  assert.deepEqual(await listInstances(input.stateDirectory), []);
  assert.deepEqual(await readdir(folder), []);
  await assert.rejects(registerInstance({ ...input, id: '../escape', port }), /Instance id/);
});
