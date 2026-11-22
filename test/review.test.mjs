import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { main } from '../src/cli.mjs';

test('diff overwrites artifacts and retains exact comparisons across both themes', { timeout: 60000 }, async t => {
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

  const standalone = path.join(root, 'standalone', 'review.html');
  let stdout = '';
  const code = await main(['review', `--base=${baseSha}`, '--theme=dark', `--out=${standalone}`, '--json',
    '--viewer-url=https://design.example/p/project/?key=discard'], project,
  { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
  assert.equal(code, 0, stdout);
  const { data: report } = JSON.parse(stdout);
  assert.equal(report.path, standalone);
  assert.equal(report.format, 'html');
  assert.equal(report.mode, 'hybrid');
  assert.equal(report.complete, true);
  assert.equal(report.theme, 'dark');
  assert.deepEqual(report.counts, { added: 1, removed: 1, moved: 0, changed: 1, direct: 1, inherited: 0 });
  assert.deepEqual(await readdir(path.dirname(standalone)), ['review.html']);
  const document = await readFile(standalone, 'utf8');
  assert.match(document, /https:\/\/design\.example\/p\/project\/\?asset=components%2Fcard\.tsx&amp;frame=themed/);
  assert.doesNotMatch(document, /key=discard/);

  stdout = '';
  const pngCode = await main(['review', `--base=${baseSha}`, '--theme=dark', '--format=png', '--json'], project,
    { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
  assert.equal(pngCode, 0, stdout);
  const { data: png } = JSON.parse(stdout);
  assert.equal(png.path, path.join(config.output, 'review.png'));
  assert.equal(png.format, 'png');
  assert.equal(png.theme, report.theme);
  assert.equal(png.mode, report.mode);
  assert.equal(png.complete, true);
  assert.deepEqual(png.counts, report.counts);
  assert.deepEqual(png.groups, report.groups);
  const image = await readFile(png.path);
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.length, png.bytes);

  stdout = '';
  const embedCode = await main(['review', `--base=${baseSha}`, '--theme=dark', '--format=embed', '--json'], project,
    { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
  assert.equal(embedCode, 0, stdout);
  const { data: embed } = JSON.parse(stdout);
  assert.equal(embed.path, path.join(config.output, 'review-embed.html'));
  assert.equal(embed.format, 'embed');
  assert.equal(embed.target, 'antigravity');
  assert.equal(embed.theme, report.theme);
  assert.equal(embed.complete, true);
  assert.deepEqual(embed.counts, report.counts);
  assert.deepEqual(embed.groups, report.groups);
  const embedHtml = await readFile(embed.path, 'utf8');
  assert.match(embedHtml, /^<!doctype html>/i);
  assert.doesNotMatch(embedHtml, /(?:src|href)=["'](?:https?:|\/)/i);
  assert.doesNotMatch(embedHtml, /Content-Security-Policy/i);
  assert.doesNotMatch(embedHtml, /<template id="difference-/i);

  stdout = '';
  const badOutCode = await main(['review', `--base=${baseSha}`, '--format=embed', '--out=bad.png', '--json'], project,
    { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
  assert.equal(badOutCode, 2);
  assert.equal(JSON.parse(stdout).error.code, 'USAGE_INVALID');

  stdout = '';
  const codexCode = await main(['review', `--base=${baseSha}`, '--theme=dark', '--format=embed', '--target=codex', '--json'], project,
    { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
  assert.equal(codexCode, 0, stdout);
  const { data: codex } = JSON.parse(stdout);
  assert.equal(codex.path, path.join(config.output, 'review-codex-embed.html'));
  assert.equal(codex.target, 'codex');
  assert.deepEqual(codex.counts, embed.counts);
  assert.ok(codex.bytes < 1_000_000);
  const fragment = await readFile(codex.path, 'utf8');
  assert.doesNotMatch(fragment, /<!doctype|<(?:html|head|body)(?:\s|>)/i);

  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 720 }, offline: true });
    const errors = [], network = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('request', req => { if (/^https?:/.test(req.url())) network.push(req.url()); });
    await page.goto(pathToFileURL(embed.path).href);
    assert.equal(await page.locator('#embed-root').getAttribute('data-preview-theme'), 'dark');
    assert.equal(await page.getByRole('article').count(), 2);
    const themedCard = page.getByRole('article', { name: 'Themed', exact: true });
    const after = themedCard.locator('.curtain-layer[data-side="after"] .specimen [data-adg-frame] > div');
    assert.equal(await after.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(40, 24, 56)');
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    assert.notEqual(await after.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(40, 24, 56)');
    const slider = themedCard.getByRole('slider');
    await slider.fill('25');
    assert.equal(await themedCard.locator('.curtain').evaluate(el => el.style.getPropertyValue('--split')), '25%');
    await page.getByRole('button', { name: 'Split view', exact: true }).click();
    assert.equal(await themedCard.getByRole('slider').count(), 0);
    assert.equal(await themedCard.getByRole('figure').count(), 2);
    assert.equal(await page.getByRole('article').count(), 2);
    await themedCard.getByRole('button', { name: 'Enlarge Themed', exact: true }).click();
    const zoom = page.getByRole('dialog', { name: 'Themed', exact: true });
    await zoom.getByRole('button', { name: 'Slider view', exact: true }).click();
    await zoom.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.equal(await zoom.locator('output').textContent(), '125%');
    await zoom.getByRole('button', { name: 'Fit to width', exact: true }).click();
    assert.equal(await zoom.locator('output').textContent(), 'Fit');
    await zoom.getByRole('button', { name: 'Close enlarged view', exact: true }).click();
    assert.equal(await zoom.isVisible(), false);

    await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
    await page.locator('iframe').evaluate((iframe, content) => {
      iframe.srcdoc = '<script>window.openai={sendFollowUpMessage:async ({prompt})=>{document.body.dataset.prompt=prompt}}</script>' + content;
    }, fragment);
    const chat = page.frameLocator('iframe');
    await chat.getByRole('article', { name: 'Themed', exact: true }).getByRole('button', { name: 'Use this frame in Codex' }).click();
    const prompt = await chat.locator('body').getAttribute('data-prompt');
    assert.match(prompt, /Source: design\/components\/card\.tsx\nFrame: themed/);
    assert.ok(prompt.includes(baseSha));
    assert.equal(await chat.getByRole('article').count(), 2);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
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
