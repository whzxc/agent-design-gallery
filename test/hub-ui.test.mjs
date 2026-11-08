import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { startHub } from '../src/hub.mjs';
import { startServer } from '../src/server.mjs';
import { addRoot, listProjects } from '../src/hub/registry.mjs';
import { registerInstance } from '../src/hub/instances.mjs';
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
  await page.goto(new URL(`/p/${atlasRecord.slug}/`, hub.url).href);
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
  await page.waitForURL('**/i/review/');
  await page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true }).waitFor();
  await page.getByRole('button', { name: 'Switch project: Atlas', exact: true }).filter({ visible: true }).click();
  await page.getByRole('navigation', { name: 'Project switcher' }).getByRole('link', { name: 'All projects', exact: true }).click();
  await page.getByRole('heading', { name: 'Projects', exact: true }).waitFor();
});
