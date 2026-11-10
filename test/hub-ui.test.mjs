import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { startHub } from '../src/hub.mjs';
import { startServer } from '../src/server.mjs';
import { addRoot, listProjects } from '../src/hub/registry.mjs';
import { listInstances, registerInstance } from '../src/hub/instances.mjs';
import { launch } from '../src/toolkit/browser.mjs';

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'sdg-hub-ui-'));
  const stateDirectory = path.join(root, 'state');
  const hub = await startHub({ port: 0, stateDirectory });
  const browser = await launch();
  t.after(async () => { await browser.close(); await hub.close(); await rm(root, { recursive: true, force: true }); });
  return { root, stateDirectory, hub, browser };
}

async function project(root, name, requires) {
  const directory = path.join(root, name.toLowerCase());
  await mkdir(path.join(directory, 'design/components'), { recursive: true });
  await copyFile(new URL('../design/tokens.css', import.meta.url), path.join(directory, 'design/tokens.css'));
  await writeFile(path.join(directory, 'sdg.config.mjs'), `export default ${JSON.stringify({ name, ...(requires ? { requires } : {}) })};`);
  await writeFile(path.join(directory, 'design/components/sample.tsx'), `import { Frame } from 'sdg'; export default () => <Frame name="sample" width={40} height={40}><div>Sample</div></Frame>;`);
  return directory;
}

test('hub empty roots and rescan pending recover to the discovered project list', async t => {
  const { root, stateDirectory, hub, browser } = await setup(t);
  const page = await browser.newPage();
  await page.goto(hub.url);
  await page.getByRole('heading', { name: 'No roots registered' }).waitFor();
  const projectsRoot = path.join(root, 'projects');
  await mkdir(projectsRoot);
  await addRoot(projectsRoot, 1, stateDirectory);
  await page.reload();
  await page.getByRole('heading', { name: 'No projects found' }).waitFor();
  await project(projectsRoot, 'Atlas');
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/rescan', async route => { await pending; await route.continue(); });
  await page.getByRole('button', { name: 'Rescan', exact: true }).click();
  const rescan = page.getByRole('button', { name: 'Rescanning…', exact: true });
  await rescan.waitFor();
  assert.equal(await rescan.isDisabled(), true);
  release();
  await page.getByRole('link', { name: 'Atlas', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Rescan', exact: true }).isEnabled(), true);
});

test('prefixed viewer switcher searches branches, restores keyboard focus and navigates to an instance', async t => {
  const { root, stateDirectory, hub, browser } = await setup(t);
  const projectsRoot = path.join(root, 'projects');
  await mkdir(projectsRoot);
  const atlas = await project(projectsRoot, 'Atlas');
  await project(projectsRoot, 'Folio');
  await project(projectsRoot, 'Lumen');
  await project(projectsRoot, 'Orbit', '>=99.0.0');
  execFileSync('git', ['init', '-b', 'review/needle', atlas], { stdio: 'ignore' });
  await addRoot(projectsRoot, 1, stateDirectory);
  const instance = await startServer({ directory: path.join(atlas, 'design'), port: 0, stateDirectory: path.join(root, 'viewer'), instanceId: 'review' });
  t.after(() => instance.close());
  await registerInstance({ directory: atlas, port: new URL(instance.url).port * 1, stateDirectory, id: 'review' });
  const [atlasRecord] = (await listProjects(stateDirectory)).filter(item => item.name === 'Atlas');
  const page = await browser.newPage();
  await page.goto(new URL(`/p/${atlasRecord.slug}/?asset=components%2Fsample.tsx&frame=sample`, hub.url).href);
  await page.waitForFunction(() => window.__sdg?.ready);
  assert.equal(await page.locator('#frame-name').textContent(), 'sample');
  const trigger = page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true });
  await trigger.waitFor();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('navigation', { name: 'Project switcher' });
  await menu.waitFor();
  await menu.getByRole('link', { name: 'All projects', exact: true }).waitFor();
  await menu.getByRole('searchbox', { name: 'Find project or instance', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await menu.getByRole('link', { name: 'All projects', exact: true }).evaluate(element => element === document.activeElement), true);
  assert.equal(await menu.getByRole('link', { name: /Orbit/ }).count(), 0);
  const search = menu.getByRole('searchbox', { name: 'Find project or instance', exact: true });
  await search.fill('needle');
  await menu.getByRole('link', { name: /Atlas/ }).first().waitFor();
  assert.equal(await menu.getByRole('link', { name: /Folio/ }).count(), 0);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  await search.fill('nothing-matches');
  assert.equal(await menu.getByRole('link', { name: /Atlas/ }).count(), 0);
  await search.fill('');
  const live = menu.getByRole('group', { name: 'Live instances', exact: true }).getByRole('link', { name: /Atlas/ });
  await live.click();
  await page.waitForURL(url => url.pathname.startsWith('/i/review/'));
  await page.waitForFunction(() => window.__sdg?.ready);
  await page.reload();
  await page.waitForFunction(() => window.__sdg?.ready);
  await page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true }).click();
  await page.getByRole('navigation', { name: 'Project switcher' }).getByRole('link', { name: 'All projects', exact: true }).click();
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
});

test('live instance buttons stop only the selected process from the hub home and proxied switcher', { timeout: 30000 }, async t => {
  const { root, stateDirectory, hub, browser } = await setup(t);
  const atlas = await project(root, 'Atlas');
  const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
  const children = await Promise.all([0, 1, 2].map(async () => {
    const child = spawn(process.execPath, [cli, 'open', atlas, '--no-open', '--state-dir', stateDirectory]);
    const exited = once(child, 'exit');
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; });
    await Promise.race([once(child.stdout, 'data'), exited.then(([code]) => { throw new Error(`Viewer exited (${code}): ${stderr.trim()}`); })]);
    return { pid: child.pid, exited };
  }));
  const instances = await listInstances(stateDirectory);
  assert.equal(instances.length, 3);
  assert.ok(instances.every(instance => instance.stoppable));
  const [home, current, other] = instances;
  const stopURL = id => new URL(`api/instances/${id}/stop`, hub.url);
  const closed = instance => children.find(child => child.pid === instance.pid).exited;
  const label = instance => `Close instance: Atlas (:${instance.port})`;
  const post = (id, headers) => fetch(stopURL(id), { method: 'POST', headers });
  assert.equal((await post(home.id, { 'X-Forwarded-Proto': 'https' })).status, 401);
  assert.equal((await post(home.id, { Origin: 'https://other.example' })).status, 403);
  await writeFile(path.join(stateDirectory, 'instances/mismatched.json'), JSON.stringify({...home, id:'mismatched'}));
  assert.equal((await post('mismatched')).status, 404);
  assert.equal((await listInstances(stateDirectory)).length, 3);

  const page = await browser.newPage();
  await page.goto(hub.url);
  const upload = request(`http://127.0.0.1:${home.port}/preferences`, {
    method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': '100'},
  });
  upload.on('error', () => {});
  t.after(() => upload.destroy());
  upload.write('{');
  const [socket] = await once(upload, 'socket');
  await once(socket, 'connect');
  await page.getByRole('button', { name: label(home), exact: true }).click();
  await page.getByRole('button', { name: label(home), exact: true }).waitFor({ state: 'hidden' });
  await closed(home);
  assert.deepEqual((await listInstances(stateDirectory)).map(instance => instance.id), [current.id, other.id]);
  await page.getByRole('link', { name: 'Atlas', exact: true }).first().click();
  await page.waitForURL(url => url.pathname.startsWith(current.url));
  await page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true }).click();
  const menu = page.getByRole('navigation', { name: 'Project switcher' });
  await menu.getByRole('button', { name: label(other), exact: true }).click();
  await menu.getByRole('button', { name: label(other), exact: true }).waitFor({ state: 'hidden' });
  await closed(other);
  assert.equal(new URL(page.url()).pathname, `${current.url}view/layer/components`);
  assert.deepEqual((await listInstances(stateDirectory)).map(instance => instance.id), [current.id]);
  await menu.getByRole('button', { name: label(current), exact: true }).click();
  await page.waitForURL(hub.url);
  await closed(current);
  assert.deepEqual(await listInstances(stateDirectory), []);
  assert.equal((await fetch(new URL('api/health', hub.url))).status, 200);
});
