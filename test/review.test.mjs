import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { main } from '../src/cli.mjs';
import { startHub } from '../src/hub.mjs';
import { hubKey } from '../src/hub/auth.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const forwarded = { 'X-Forwarded-Proto': 'https' };

function rawStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

test('diff writes a self-contained overwritten review index.html and hub viewer serves ?base=<rev> review', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-review-'));
  const project = path.join(root, 'project');
  const stateDirectory = path.join(root, 'state');
  t.after(() => rm(root, { recursive: true, force: true }));

  const put = async (name, text) => {
    const file = path.join(project, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8' }).trim();

  await put('adg.config.mjs', 'export default { name: "Review Demo" };\n');
  await put('.gitignore', 'output/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  await put(
    'design/modules/banner/part.tsx',
    `export function BannerPart() {
  return <div style={{ width: 96, height: 32, background: '#224466', color: '#ffffff' }}>Banner</div>;
}\n`,
  );
  await put(
    'design/modules/banner/index.tsx',
    `import { Frame } from 'adg';
import { BannerPart } from './part';
export { BannerPart } from './part';
export default () => [
  <Frame name="default">
    <BannerPart />
  </Frame>,
];\n`,
  );
  await put(
    'design/components/card.tsx',
    `import { Frame } from 'adg';
export default () => [
  <Frame name="steady">
    <div style={{ width: 96, height: 48, background: '#336699', color: '#ffffff' }}>Steady</div>
  </Frame>,
  <Frame name="legacy">
    <div style={{ width: 96, height: 48, background: '#663333', color: '#ffffff' }}>Legacy</div>
  </Frame>,
  <Frame name="themed">
    <div style={{ width: 96, height: 48, background: 'var(--canvas)', color: 'var(--text)' }}>Themed</div>
  </Frame>,
];\n`,
  );

  git('init', '-q');
  git('config', 'user.name', 'Review Test');
  git('config', 'user.email', 'review@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'base');
  const baseSha = git('rev-parse', 'HEAD');

  // Modify dark-only --canvas token so `themed` changes only in dark theme,
  // remove `legacy`, add `fresh`, and leave `steady` untouched.
  const [lightTokens, darkTokens] = starterTokens.split(':root[data-theme="dark"]');
  await put(
    'design/tokens.css',
    lightTokens + ':root[data-theme="dark"]' + darkTokens.replace(/(--canvas:)[^;]+;/, '$1 #281838;'),
  );
  await put(
    'design/components/card.tsx',
    `import { Frame } from 'adg';
export default () => [
  <Frame name="steady">
    <div style={{ width: 96, height: 48, background: '#336699', color: '#ffffff' }}>Steady</div>
  </Frame>,
  <Frame name="themed">
    <div style={{ width: 96, height: 48, background: 'var(--canvas)', color: 'var(--text)' }}>Themed</div>
  </Frame>,
  <Frame name="fresh">
    <div style={{ width: 96, height: 48, background: '#1f6f54', color: '#ffffff' }}>Fresh</div>
  </Frame>,
];\n`,
  );

  // Seed a stale file inside output/design/diff/frames to confirm overwrite cleanup.
  const stalePath = path.join(project, 'output/design/diff/frames/stale/old/light/after.png');
  await mkdir(path.dirname(stalePath), { recursive: true });
  await writeFile(stalePath, 'stale');

  const config = await loadConfig(project);
  let diffError = null;
  const logs = [];
  await assert.rejects(
    diff(config, [], { base: baseSha, impacted: true, 'state-dir': stateDirectory }, { log: line => logs.push(line) }),
    error => {
      diffError = error;
      return error.code === 'DIFF_FAILED';
    },
  );
  assert.ok(diffError?.data);
  const { added, removed, moved, changed } = diffError.data.review;
  assert.deepEqual({ added, removed, moved, changed }, { added: 1, removed: 1, moved: 0, changed: 1 });
  assert.equal(diffError.data.indexPath, path.join(project, 'output/design/diff/index.html'));
  assert.match(logs[0] ?? '', /^changed: 1 added, 1 removed, 0 moved, 1 changed \(\d+ frames\)\./);

  await assert.rejects(access(stalePath));
  const indexHtml = await readFile(diffError.data.indexPath, 'utf8');
  assert.match(indexHtml, /^<!doctype html>/i);
  assert.doesNotMatch(indexHtml, /https?:\/\/|src="\/|href="\//i);
  assert.match(indexHtml, /data:image\/png;base64,/);
  assert.match(indexHtml, /<strong>1<\/strong> added/);
  assert.match(indexHtml, /<strong>1<\/strong> removed/);
  assert.match(indexHtml, /<strong>1<\/strong> changed \(direct 1, inherited 0\)/);
  assert.doesNotMatch(indexHtml, /data-frame="steady"/);
  assert.match(indexHtml, /data-frame="fresh" data-status="added"/);
  assert.match(indexHtml, /data-frame="legacy" data-status="removed"/);
  assert.match(indexHtml, /data-frame="themed" data-status="changed"/);

  // Verify `themed` captured both light and dark even though only a dark token changed.
  const themedRows = diffError.data.comparisons.filter(row => row.frame === 'themed');
  assert.deepEqual(themedRows.map(row => [row.theme, row.verdict]), [
    ['light', 'identical'],
    ['dark', 'changed'],
  ]);

  // Verify hub viewer + `adg link <viewer-url> --base=<rev>`.
  await addRoot(project, 0, stateDirectory);
  const hub = await startHub({ port: 0, stateDirectory });
  t.after(() => hub.close());
  const key = await hubKey(stateDirectory);
  const auth = { ...forwarded, Authorization: `Bearer ${key}` };
  const [registered] = await (await fetch(new URL('api/projects', hub.url), { headers: auth })).json();
  const projectViewerUrl = new URL(registered.url, hub.url).href;

  let linkStdout = '';
  const linkExit = await main(
    ['link', `${projectViewerUrl}?key=${key}`, `--base=${baseSha}`],
    project,
    { stdout: chunk => { linkStdout += chunk; }, stderr: () => {} },
  );
  assert.equal(linkExit, 0);
  const reviewUrl = linkStdout.trim();
  assert.equal(reviewUrl, `${projectViewerUrl}?base=${baseSha}`);

  const shellJs = await fetch(new URL(`${registered.url}review.js`, hub.url), { headers: forwarded });
  assert.equal(shellJs.status, 200);
  assert.doesNotMatch(await shellJs.text(), /Review Demo/);
  assert.equal(await rawStatus(new URL(`${registered.url}review?base=${baseSha}`, hub.url), forwarded), 401);

  const statusBefore = git('status', '--porcelain');
  const browser = await launch();
  try {
    const unauthContext = await browser.newContext({ extraHTTPHeaders: forwarded });
    const unauthPage = await unauthContext.newPage();
    await unauthPage.goto(reviewUrl);
    await unauthPage.getByRole('heading', { name: 'Key required' }).waitFor();
    await unauthContext.close();

    const context = await browser.newContext({ extraHTTPHeaders: forwarded, colorScheme: 'dark' });
    const page = await context.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${projectViewerUrl}?key=${key}&base=${baseSha}`);
    await page.waitForFunction(() => window.__adg?.ready && window.__adg?.scope === 'review');
    assert.equal(page.url(), reviewUrl);

    const counts = await page.evaluate(() => window.__adg.review?.counts);
    assert.deepEqual(counts, { added: 1, removed: 1, moved: 0, changed: 1, direct: 1, inherited: 0 });
    assert.equal(await page.locator('#review-page').isVisible(), true);
    assert.equal(await page.locator('.review-frame').count(), 2);
    assert.equal(await page.locator('[data-section="removed"] img').count(), 0);
    assert.equal(await page.locator('[data-section="direct"] .review-frame').count(), 1);
    // The viewer requests its current theme with Before / After / Difference panes.
    const themedCard = page.locator('.review-frame[data-frame="themed"]');
    assert.deepEqual(
      await themedCard.locator('.review-theme').evaluateAll(nodes => nodes.map(node => node.dataset.themeRow)),
      ['dark'],
    );
    assert.equal(await themedCard.locator('img[src^="data:image/png;base64,"]').count(), 3);
    assert.equal(git('status', '--porcelain'), statusBefore, 'hub review must not dirty the consumer checkout');

    // Live SSE update when working-tree source changes: restore `legacy` so removed drops to 0.
    await put(
      'design/components/card.tsx',
      `import { Frame } from 'adg';
export default () => [
  <Frame name="steady">
    <div style={{ width: 96, height: 48, background: '#336699', color: '#ffffff' }}>Steady</div>
  </Frame>,
  <Frame name="legacy">
    <div style={{ width: 96, height: 48, background: '#663333', color: '#ffffff' }}>Legacy</div>
  </Frame>,
  <Frame name="themed">
    <div style={{ width: 96, height: 48, background: 'var(--canvas)', color: 'var(--text)' }}>Themed</div>
  </Frame>,
  <Frame name="fresh">
    <div style={{ width: 96, height: 48, background: '#1f6f54', color: '#ffffff' }}>Fresh</div>
  </Frame>,
];\n`,
    );
    await page.waitForFunction(() => window.__adg?.ready && window.__adg?.review?.counts?.removed === 0);
    assert.deepEqual(await page.evaluate(() => window.__adg.review.counts), { added: 1, removed: 0, moved: 0, changed: 1, direct: 1, inherited: 0 });
    await context.close();
  } finally {
    await browser.close();
  }

  // Commit changes and run diff against HEAD to verify output directory overwrite removes old frames/.
  git('add', '.');
  git('commit', '-qm', 'settled');
  const settled = await diff(config, [], { base: 'HEAD', impacted: true, 'state-dir': stateDirectory, json: true }, { log: () => {} });
  assert.equal(settled.data.verdict, 'identical');
  const settledCounts = settled.data.review;
  assert.deepEqual(
    { added: settledCounts.added, removed: settledCounts.removed, moved: settledCounts.moved, changed: settledCounts.changed },
    { added: 0, removed: 0, moved: 0, changed: 0 },
  );
  await assert.rejects(access(path.join(project, 'output/design/diff/frames')));
  const settledHtml = await readFile(settled.data.indexPath, 'utf8');
  assert.match(settledHtml, /No added, removed, moved, or changed frames/);
});
