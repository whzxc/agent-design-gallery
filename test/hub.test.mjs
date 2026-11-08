import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { launch } from '../src/toolkit/browser.mjs';
import { startHub } from '../src/hub.mjs';
import { startServer } from '../src/server.mjs';
import { addRoot, listProjects } from '../src/hub/registry.mjs';

test('hub routes existing viewers by stable slug and keeps browser paths read-only', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'sdg-hub-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), stateDirectory = path.join(root, 'state');
  await mkdir(project);
  await writeFile(path.join(project, 'sdg.config.mjs'), 'export default { name: "Test" };');
  await cp(new URL('../fixtures/arc-sample/design', import.meta.url), path.join(project, 'design'), { recursive: true });
  await addRoot(project, 0, stateDirectory);
  const hub = await startHub({ port: 0, stateDirectory, idleTimeout: 40 });
  t.after(() => hub.close());
  const list = await (await fetch(new URL('/api/projects', hub.url))).json();
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Test'); assert.equal(list[0].frameCount, null);
  const base = new URL(list[0].url, hub.url);
  assert.equal((await fetch(base)).status, 200);
  const manifest = await (await fetch(new URL('manifest', base))).json();
  assert.ok(manifest.assets.length);
  assert.equal((await fetch(new URL('app.js', base))).status, 200);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base.href);
    await page.waitForFunction(() => window.__sdg?.ready);
    assert.equal(await page.locator('#directories').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  assert.equal((await fetch(new URL('asset/' + encodeURIComponent(manifest.assets[0].path), base))).status, 200);
  for (const endpoint of ['open', 'reveal']) {
    const response = await fetch(new URL(endpoint, base), { method: 'POST', body: JSON.stringify({directory:root,path:root}) });
    assert.equal(response.status, 404);
  }
  assert.equal((await fetch(new URL('preferences', base), {method:'POST',body:JSON.stringify({theme:'dark',view:{x:0,y:0,scale:1}})})).status,200);
  assert.equal((await fetch(new URL('/api/root/add', hub.url), {method:'POST',body:JSON.stringify({directory:root})})).status,405);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await fetch(new URL('manifest', base))).status, 200); // Restarts after idle release.
  await mkdir(path.join(project,'new-project'));
  await writeFile(path.join(project,'new-project/sdg.config.mjs'),'export default {};');
  assert.equal((await listProjects(stateDirectory)).length, 1); // No implicit scan.
});

test('ephemeral server has no browser directory or reveal mutations', async t => {
  const stateDirectory = await mkdtemp(path.join(tmpdir(),'sdg-readonly-'));
  t.after(() => rm(stateDirectory,{recursive:true,force:true}));
  const server = await startServer({directory:new URL('../fixtures/arc-sample/design',import.meta.url).pathname,stateDirectory});
  t.after(() => server.close());
  for (const endpoint of ['open','reveal']) assert.equal((await fetch(new URL(endpoint,server.url),{method:'POST',body:JSON.stringify({directory:stateDirectory})})).status,404);
  const shell=await (await fetch(server.url)).text();
  assert.doesNotMatch(shell,/directory-form|id="directories"/);
});
