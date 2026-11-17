import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { systemTheme, resolveThemes } from '../src/toolkit/theme.mjs';
import { renderReviewSheet, reviewSheetHtml, reviewForTheme } from '../src/toolkit/review-sheet.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { render } from '../src/toolkit/commands.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { readReviewCache, reviewCacheKey } from '../src/review-cache.mjs';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=';
const themeRow = theme => ({ theme, verdict: theme === 'light' ? 'identical' : 'changed', images: { before: pixel, after: pixel } });
function reviewFixture() {
  return {
    label: 'Review <Demo>', base: { rev: 'HEAD~1', sha: 'base-sha' }, current: { head: 'current-sha' }, complete: true,
    counts: { added: 24, removed: 1, changed: 1 },
    sections: {
      added: Array.from({ length: 24 }, (_, i) => ({ source: `design/z-${String(i).padStart(2, '0')}.tsx`, frame: 'new', status: 'added', themes: [themeRow('light'), themeRow('dark')] })),
      removed: [{ source: 'design/a.tsx', frame: 'removed', status: 'removed', themes: [themeRow('light'), themeRow('dark')] }],
      changed: [{ source: 'design/b.tsx', frame: 'changed', status: 'changed', themes: [themeRow('light'), themeRow('dark')] }],
    },
  };
}

test('system theme reads macOS appearance and falls back to light', () => {
  assert.equal(systemTheme({ platform: 'darwin', readAppearance: () => 'Dark\n' }), 'dark');
  assert.equal(systemTheme({ platform: 'darwin', readAppearance: () => 'Light\n' }), 'light');
  assert.equal(systemTheme({ platform: 'darwin', readAppearance: () => { throw Error('Unset'); } }), 'light');
  assert.equal(systemTheme({ platform: 'linux', readAppearance: () => assert.fail('non-macOS defaults') }), 'light');
  assert.deepEqual(resolveThemes('system', () => 'dark'), ['dark']);
  assert.deepEqual(resolveThemes(undefined), ['light', 'dark']);
  assert.deepEqual(resolveThemes('light', () => assert.fail('explicit theme reads system')), ['light']);
  assert.throws(() => resolveThemes('invalid'), { code: 'USAGE_INVALID' });
});

test('system theme executes a stubbed defaults command', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-defaults-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'defaults');
  await writeFile(file, '#!/bin/sh\n[ "$1 $2 $3" = "read -g AppleInterfaceStyle" ] || exit 2\nprintf "Dark\\n"\n');
  await chmod(file, 0o755);
  const originalPath = process.env.PATH;
  t.after(() => { process.env.PATH = originalPath; });
  process.env.PATH = directory;
  assert.equal(systemTheme({ platform: 'darwin' }), 'dark');
  await writeFile(file, '#!/bin/sh\nexit 1\n');
  assert.equal(systemTheme({ platform: 'darwin' }), 'light');
});

test('sheet retains declared frame order across change statuses within a source', () => {
  const model = reviewFixture();
  const entries = ['changed', 'removed', 'added'].map(status => ({ source: 'design/a.tsx', frame: status, status, themes: [themeRow('dark')] }));
  model.sections = Object.fromEntries(entries.map(entry => [entry.status, [entry]]));
  const html = reviewSheetHtml(model, 'dark', entries);
  assert.deepEqual([...html.matchAll(/data-frame="([^"]+)"/g)].map(match => match[1]), ['changed', 'removed', 'added']);
});

test('sheet uses one theme, source ordering, first 24 frames and a DPR2 PNG', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-sheet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const model = reviewFixture();
  assert.deepEqual(reviewForTheme(model, 'light').counts, { added: 24, removed: 1, changed: 0 });
  assert.ok(Object.values(reviewForTheme(model, 'dark').sections).flat().every(entry => entry.themes.length === 1));
  const html = reviewSheetHtml(model, 'dark');
  assert.match(html, /Review &lt;Demo&gt;/);
  assert.match(html, /2 more frames in the review URL/);
  assert.doesNotMatch(html, /data-source="design\/z-22/);
  const browser = await launch();
  try {
    const file = path.join(root, 'review.png');
    assert.deepEqual(await renderReviewSheet(browser, model, 'dark', file), { path: file, theme: 'dark' });
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), 3200);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
    await page.setContent(html);
    assert.equal(await page.locator('article').count(), 24);
    assert.equal(await page.locator('article').first().getAttribute('data-source'), 'design/a.tsx');
    assert.equal(await page.locator('article').first().locator('img').count(), 0);
    assert.equal(await page.locator('article').nth(1).locator('img').count(), 2);
    assert.equal(await page.locator('article').nth(2).locator('img').count(), 1);
    assert.equal(await page.locator('body').evaluate(body => body.scrollWidth), 1600);
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(18, 18, 18)');
  } finally { await browser.close(); }
});

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-sheet-command-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  await put('adg.config.mjs', 'export default {name:"Theme Demo"};');
  await put('.gitignore', 'output/\nstate/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  const source = text => `import {Frame} from 'adg';export default()=> <Frame name="sample" width={100} height={40}><div class="bg-canvas text-text">${text}</div></Frame>;`;
  await put('design/components/card.tsx', source('Base'));
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid'); git('add', '.'); git('commit', '-qm', 'test: base');
  return { root, put, source, config: await loadConfig(root), state: path.join(root, 'state') };
}

test('render and impacted diff resolve system before selection and publish full single-theme models', async t => {
  const f = await project(t);
  await f.put('design/components/card.tsx', f.source('Changed'));
  const options = { base: 'HEAD', impacted: true, theme: 'system', json: true, 'state-dir': f.state };
  const rendered = await render(f.config, [], options, () => {}, { readSystemTheme: () => 'dark' });
  assert.deepEqual(rendered.data.themes, ['dark']);
  assert.deepEqual(rendered.data.captures.map(row => row.theme), ['dark']);
  const key = await reviewCacheKey(f.config, 'HEAD', 'dark', f.state);
  const error = await diff(f.config, [], options, { readSystemTheme: () => 'dark' }).catch(error => error);
  assert.equal(error.code, 'DIFF_FAILED');
  assert.deepEqual(error.data.selection.themes, ['dark']);
  assert.deepEqual(error.data.review.sheet, { path: path.join(f.config.output, 'diff/review-sheet.png'), theme: 'dark' });
  assert.equal((await readFile(error.data.review.sheet.path)).readUInt32BE(16), 3200);
  const cached = await readReviewCache(key);
  assert.deepEqual(cached.counts, { added: 0, removed: 0, changed: 1 });
  assert.deepEqual(cached.sections.changed[0].themes.map(row => row.theme), ['dark']);
  const repeated = await diff(f.config, [], options, { readSystemTheme: () => 'dark', renderSheet: async (...args) => {
    assert.equal(await readReviewCache(key) !== null, true);
    return renderReviewSheet(...args);
  } }).catch(error => error);
  assert.equal(repeated.data.summary.comparisons, 1, 'warm CLI still computes verdicts');
  const both = await diff(f.config, [], { ...options, theme: 'both' }, { readSystemTheme: () => 'dark' }).catch(error => error);
  assert.equal(both.code, 'DIFF_FAILED');
  assert.deepEqual(both.data.selection.themes, ['light', 'dark']);
  assert.equal(both.data.review.sheet.theme, 'dark');
  for (const theme of ['light', 'dark']) {
    const cachedTheme = await readReviewCache(await reviewCacheKey(f.config, 'HEAD', theme, f.state));
    assert.deepEqual(cachedTheme.sections.changed[0].themes.map(row => row.theme), [theme]);
  }
});

test('generation validation failures never publish review cache', async t => {
  const f = await project(t);
  await f.put('design/components/card.tsx', f.source('Changed'));
  const key = await reviewCacheKey(f.config, 'HEAD', 'light', f.state);
  const result = await diff(f.config, [], { base: 'HEAD', impacted: true, theme: 'light', json: true, 'state-dir': f.state }, {
    renderSheet: async (...args) => {
      const sheet = await renderReviewSheet(...args);
      await f.put('design/components/card.tsx', f.source('Changed during capture'));
      return sheet;
    },
  }).catch(error => error);
  assert.equal(result.code, 'IMPACT_INPUT_CHANGED');
  assert.equal(result.data.complete, false);
  assert.equal(await readReviewCache(key), null);
});

test('restricted scope and scale skip publishing while configured policy publishes', async t => {
  const f = await project(t);
  await f.put('design/components/card.tsx', f.source('Changed'));
  const options = { base: 'HEAD', impacted: true, theme: 'light', json: true, 'state-dir': f.state };
  const key = await reviewCacheKey(f.config, 'HEAD', 'light', f.state);
  for (const [args, extra, config] of [
    [['components/card'], {}, f.config],
    [[], { frame: 'sample' }, f.config],
    [[], { scale: 1 }, f.config],
  ]) {
    const result = await diff(config, args, { ...options, ...extra }).catch(error => error);
    assert.equal(result.code, 'DIFF_FAILED');
    assert.equal(await readReviewCache(key), null);
    assert.equal(result.data.review.sheet.theme, 'light');
  }
  await f.put('adg.config.mjs', 'export default {name:"Theme Demo",diff:{thresholds:{imperceptible:{maxChannelDelta:3}}}};');
  const config = await loadConfig(f.root);
  const customKey = await reviewCacheKey(config, 'HEAD', 'light', f.state);
  const result = await diff(config, [], options).catch(error => error);
  assert.equal(result.code, 'DIFF_FAILED');
  assert.deepEqual((await readReviewCache(customKey)).counts, { added: 0, removed: 0, changed: 1 });
});
