import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { startHub } from '../src/hub.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { startServer } from '../src/server.mjs';
import { VERSION } from '../src/toolkit/config.mjs';

const exec = promisify(execFile);
const tokensFile = path.resolve(import.meta.dirname, '../design/tokens.css');

export const hubFixtures = {
  'hub-home-desktop': '/',
  'hub-home-phone': '/',
  'hub-switcher': '/p/atlas/',
  'hub-key-required': '/',
};

async function git(directory, args, date) {
  const env = date ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : process.env;
  await exec('git', ['-C', directory, ...args], { env });
}

export async function commit(directory, message, date) {
  await git(directory, ['add', '.'], date);
  await git(directory, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', message], date);
}

function startUnproxyableStub() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      close: () => new Promise(done => { server.closeAllConnections(); server.close(() => done()); }),
    }));
  });
}

export async function prepareAtlas(projects, tokensCss) {
  tokensCss ??= await readFile(tokensFile, 'utf8');
  const atlas = path.join(projects, 'atlas');
  await mkdir(path.join(atlas, 'design/components'), { recursive: true });
  await writeFile(path.join(atlas, 'adg.config.mjs'), "export default { name: 'Atlas' };\n");
  await writeFile(path.join(atlas, 'design/tokens.css'), tokensCss);
  await writeFile(
    path.join(atlas, 'design/components/button.tsx'),
    "import { Frame } from 'adg';\nexport default () => <Frame name=\"primary\"><button class=\"rounded-field border border-border bg-surface px-3 py-2 text-text\">Save changes</button></Frame>;\n",
  );
  await writeFile(
    path.join(atlas, 'design/components/toolbar.tsx'),
    "import { Frame } from 'adg';\nexport default () => [\n  <Frame name=\"zoom-bar\"><div class=\"rounded-field bg-surface-sunken px-3 py-2 text-text\">48%</div></Frame>,\n  <Frame name=\"viewer-tools\"><div class=\"rounded-field bg-surface-sunken px-3 py-2 text-text\">Comments</div></Frame>,\n];\n",
  );
  await git(atlas, ['init', '-q', '-b', 'feat/navigation']);
  await commit(atlas, 'feat: initial design baselines', '2025-12-31T23:40:00Z');
  await writeFile(
    path.join(atlas, 'design/components/button.tsx'),
    "import { Frame } from 'adg';\nexport default () => <Frame name=\"primary\"><button class=\"rounded-field bg-accent px-3 py-2 text-on-accent\">Save changes</button></Frame>;\n",
  );
  await writeFile(
    path.join(atlas, 'design/components/status.tsx'),
    "import { Frame } from 'adg';\nexport default () => <Frame name=\"ready\"><div class=\"rounded-panel border border-border bg-surface px-4 py-3 text-text\">Ready</div></Frame>;\n",
  );
  await commit(atlas, 'feat(design): add status and accent primary button', '2025-12-31T23:48:00Z');
  await writeFile(path.join(atlas, 'design/tokens.css'), tokensCss.replace('--surface-sunken: #f1f1ee;', '--surface-sunken: #e9e9e4;'));

  return atlas;
}

export async function startFixtureHub(port, stateDirectory) {
  const tokensCss = await readFile(tokensFile, 'utf8');
  const projects = path.join(stateDirectory, 'fixture-projects');

  const atlas = await prepareAtlas(projects, tokensCss);

  const folio = path.join(projects, 'folio');
  await mkdir(path.join(folio, 'design/components'), { recursive: true });
  await writeFile(path.join(folio, 'adg.config.mjs'), "export default { name: 'Folio' };\n");
  await writeFile(path.join(folio, 'design/tokens.css'), tokensCss);
  await writeFile(
    path.join(folio, 'design/components/sample.tsx'),
    "import { Frame } from 'adg';\nexport default () => <Frame name=\"default\"><button class=\"rounded-field bg-accent px-3 py-2 text-on-accent\">Open</button></Frame>;\n",
  );
  await git(folio, ['init', '-q', '-b', 'main']);
  await commit(folio, 'feat: initial folio components', '2025-12-31T21:00:00Z');

  const orbit = path.join(projects, 'orbit');
  await mkdir(path.join(orbit, 'design/components'), { recursive: true });
  await writeFile(path.join(orbit, 'adg.config.mjs'), "export default { name: 'Orbit', requires: '>=99.0.0' };\n");
  await writeFile(path.join(orbit, 'design/tokens.css'), tokensCss);
  await writeFile(
    path.join(orbit, 'design/components/sample.tsx'),
    "import { Frame } from 'adg';\nexport default () => <Frame name=\"default\"><button class=\"rounded-field bg-accent px-3 py-2 text-on-accent\">Open</button></Frame>;\n",
  );
  await git(orbit, ['init', '-q', '-b', 'main']);
  await commit(orbit, 'feat: initial orbit components', '2025-12-30T00:00:00Z');

  await addRoot(projects, 1, stateDirectory);

  const liveViewer = await startServer({
    directory: path.join(atlas, 'design'),
    stateDirectory: path.join(stateDirectory, 'instance-hub-review'),
    instanceId: 'hub-review',
  });
  const unproxyable = await startUnproxyableStub();
  try {
    const instancesFolder = path.join(stateDirectory, 'instances');
    await mkdir(instancesFolder, { recursive: true });
    const atlasDesign = await realpath(path.join(atlas, 'design'));
    const folioDesign = await realpath(path.join(folio, 'design'));
    const stoppablePid = process.ppid > 0 && process.ppid !== process.pid ? process.ppid : process.pid;
    await writeFile(path.join(instancesFolder, 'hub-review.json'), JSON.stringify({
      id: 'hub-review', pid: stoppablePid, port: liveViewer.port, directory: atlasDesign,
      name: 'atlas.wt/hub-review', branch: 'design/hub-review', worktree: true,
      startedAt: '2025-12-31T23:36:00Z', version: VERSION,
    }, null, 2) + '\n');
    await writeFile(path.join(instancesFolder, 'folio-review.json'), JSON.stringify({
      id: 'folio-review', pid: process.pid, port: unproxyable.port, directory: folioDesign,
      name: 'folio.wt/review', branch: 'fix/inspector', worktree: true,
      startedAt: '2026-01-01T00:00:00+02:00', version: VERSION,
    }, null, 2) + '\n');

    const hub = await startHub({ port, stateDirectory });
    return {
      ...hub,
      async close() {
        const results = await Promise.allSettled([liveViewer.close(), unproxyable.close(), hub.close()]);
        const rejected = results.find(item => item.status === 'rejected');
        if (rejected) throw rejected.reason;
      },
    };
  } catch (error) {
    await Promise.allSettled([liveViewer.close(), unproxyable.close()]);
    throw error;
  }
}

export async function readyFixtureHub(page, name) {
  if (name === 'hub-key-required') {
    await page.setExtraHTTPHeaders({ 'X-Forwarded-Proto': 'https' });
    await page.reload();
    await page.getByRole('heading', { name: 'Key required' }).waitFor();
  } else if (name === 'hub-switcher') {
    await page.waitForFunction(() => window.__adg?.ready);
    await page.getByRole('button', { name: 'Switch project: Atlas' }).click();
    await page.getByRole('navigation', { name: 'Project switcher' }).waitFor();
    await page.getByPlaceholder('Find project or instance…').waitFor();
  } else {
    await page.locator('#projects').getByText('Atlas', { exact: true }).waitFor();
    await page.locator('#instances').getByText('atlas.wt/hub-review', { exact: true }).waitFor();
  }
}
