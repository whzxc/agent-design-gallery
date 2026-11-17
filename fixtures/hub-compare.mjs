import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startHub } from '../src/hub.mjs';
import { addRoot } from '../src/hub/registry.mjs';

export const hubFixtures = {
  'hub-home-desktop': '/',
  'hub-home-phone': '/',
  'hub-switcher': '/p/atlas/',
  'hub-key-required': '/',
};

export async function startFixtureHub(port, stateDirectory) {
  const projects = path.join(stateDirectory, 'fixture-projects');
  for (const name of ['Atlas', 'Folio', 'Orbit']) {
    const project = path.join(projects, name.toLowerCase());
    const design = path.join(project, 'design', 'components');
    await mkdir(design, { recursive: true });
    await writeFile(path.join(project, 'adg.config.mjs'), `export default { name: ${JSON.stringify(name)} };\n`);
    await writeFile(path.join(design, 'sample.tsx'), "import { Frame } from 'adg';\nexport default () => <Frame name=\"default\"><button>Open</button></Frame>;\n");
  }
  await addRoot(projects, 1, stateDirectory);
  return startHub({ port, stateDirectory });
}

export async function readyFixtureHub(page, name) {
  if (name === 'hub-key-required') {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-Proto': 'https' });
    await page.reload();
    await page.getByRole('heading', { name: 'Key required' }).waitFor();
  } else if (name === 'hub-switcher') {
    await page.getByRole('button', { name: 'Switch project: Atlas' }).click();
    await page.getByRole('navigation', { name: 'Project switcher' }).waitFor();
  } else {
    await page.locator('#projects').getByText('Atlas', { exact: true }).waitFor();
  }
}
