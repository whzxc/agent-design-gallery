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
import { buildReview, renderReviewBody } from '../public/review.js';
import { groupReview } from '../public/review-groups.js';
import { readReviewCache, reviewCacheKey } from '../src/review-cache.mjs';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=';
const themeRow = theme => ({ theme, verdict: theme === 'light' ? 'identical' : 'changed', differentPixels: 1, images: { before: pixel, after: pixel } });
function reviewFixture() {
  return {
    label: 'Review <Demo>', base: { rev: 'HEAD~1', sha: 'base-sha' }, current: { head: 'current-sha' }, complete: true,
    counts: { added: 24, removed: 1, changed: 1, direct: 1, inherited: 0 },
    sections: {
      added: Array.from({ length: 24 }, (_, i) => ({ source: `design/z-${String(i).padStart(2, '0')}.tsx`, frame: 'new', status: 'added', themes: [themeRow('light'), themeRow('dark')] })),
      removed: [{ source: 'design/a.tsx', frame: 'removed', status: 'removed', themes: [themeRow('light'), themeRow('dark')] }],
      changed: [{ source: 'design/b.tsx', frame: 'changed', status: 'changed', change: { kind: 'direct', causes: ['design/b.tsx'] }, themes: [themeRow('light'), themeRow('dark')] }],
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

test('sheet orders added, direct and removed and retains declared order within each section', () => {
  const model = reviewFixture();
  const entries = ['changed', 'removed', 'added'].map(status => ({ source: 'design/a.tsx', frame: status, status, themes: [themeRow('dark')] }));
  model.sections = Object.fromEntries(entries.map(entry => [entry.status, [entry]]));
  const html = reviewSheetHtml(model, 'dark', entries);
  assert.deepEqual([...html.matchAll(/data-frame="([^"]+)"/g)].map(match => match[1]), ['added', 'changed', 'removed']);
});

test('sheet uses one theme, a 24-PNG budget and a DPR2 PNG', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-sheet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const model = reviewFixture();
  assert.deepEqual(reviewForTheme(model, 'light').counts, { added: 24, removed: 1, changed: 0, direct: 0, inherited: 0 });
  assert.ok(Object.values(reviewForTheme(model, 'dark').sections).flat().every(entry => entry.themes.length === 1));
  const html = reviewSheetHtml(model, 'dark');
  assert.match(html, /Review &lt;Demo&gt;/);
  assert.match(html, /1 more frames in the review URL/);
  assert.match(html, /data-source="design\/z-23/);
  assert.doesNotMatch(html, /data-frame="changed"/);
  assert.equal([...html.matchAll(/<img /g)].length, 24);
  const browser = await launch();
  try {
    const file = path.join(root, 'review.png');
    assert.deepEqual(await renderReviewSheet(browser, model, 'dark', file), { path: file, theme: 'dark' });
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), 3200);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
    await page.setContent(html);
    assert.equal(await page.locator('article').count(), 24);
    assert.equal(await page.locator('article').first().getAttribute('data-source'), 'design/z-00.tsx');
    assert.equal(await page.locator('article').first().locator('img').count(), 1);
    assert.equal(await page.locator('.removed img').count(), 0);
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
  assert.deepEqual(cached.counts, { added: 0, removed: 0, changed: 1, direct: 1, inherited: 0 });
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
  assert.deepEqual((await readReviewCache(customKey)).counts, { added: 0, removed: 0, changed: 1, direct: 1, inherited: 0 });
});

test('failed sources appear escaped above built frames in HTML and the sheet header', async () => {
  const { buildReview, renderReviewBody } = await import('../public/review.js');
  const failures = [
    { source: 'design/broken.tsx', side: 'before', code: 'SOURCE_BUILD_FAILED', message: 'Unexpected <token>' },
    { source: 'design/other.tsx', side: 'after', code: 'SOURCE_BUILD_FAILED', message: 'Missing default export' },
  ];
  const review = { ...reviewFixture(), complete: false, failures };
  for (const entry of Object.values(review.sections).flat()) for (const row of entry.themes) row.differentPixels = 1;
  const body = renderReviewBody(review);
  const sheet = reviewSheetHtml(review, 'dark');
  assert.ok(body.indexOf('review-failures') < body.indexOf('review-section-list'));
  assert.ok(sheet.indexOf('Some sources could not be built') < sheet.indexOf('</header>'));
  for (const html of [body, sheet]) {
    assert.match(html, /design\/broken.tsx/);
    assert.match(html, /Unexpected &lt;token&gt;/);
    assert.match(html, /\(before\)/);
    assert.match(html, /\(after\)/);
  }
  assert.deepEqual(buildReview({ complete: false, failures, comparisons: [] }).failures, failures);
});

function groupedFixture() {
  const added = { source: 'design/components/new.tsx', frame: 'added', status: 'added', themes: [themeRow('dark')] };
  const removed = { ...added, frame: 'removed', status: 'removed' };
  const changed = (source, frame, kind, area) => ({
    source, frame, status: 'changed', change: { kind, causes: ['design/components/base<token>.tsx'] },
    themes: [{ ...themeRow('dark'), differentPixels: area }],
  });
  const direct = changed('design/components/base.tsx', 'direct', 'direct', 10);
  const inherited = [
    changed('design/surfaces/a.tsx', 'small', 'inherited', 10),
    changed('design/surfaces/b.tsx', 'median', 'inherited', 20),
    changed('design/surfaces/c.tsx', 'large', 'inherited', 100),
  ];
  const model = { ...reviewFixture(), sections: { added: [added], removed: [removed], changed: [direct, ...inherited] } };
  return { ...model, ...groupReview(model) };
}

test('buildReview propagates change classification and groups only visible changed frames', () => {
  const model = groupedFixture();
  const entries = Object.values(model.sections).flat();
  const comparisons = entries.flatMap((entry, index) => entry.themes.map(row => ({
    id: String(index), source: entry.source, frame: entry.frame, status: entry.status === 'changed' ? 'matched' : entry.status,
    change: entry.change, ...row, pixels: { differentPixels: row.differentPixels },
  })));
  comparisons.push({ id: 'unchanged', source: 'design/surfaces/a.tsx', frame: 'unchanged', status: 'matched', theme: 'dark', verdict: 'identical', change: { kind: 'inherited', causes: ['x'] } });
  const review = buildReview({ comparisons, complete: true });
  assert.deepEqual(review.counts, { added: 1, removed: 1, changed: 4, direct: 1, inherited: 3 });
  assert.deepEqual(review.sections.changed[1].change, model.sections.changed[1].change);
  assert.equal(review.groups.length, 1);
  assert.equal(review.groups[0].representative.frame, 'median');
  assert.deepEqual(review.groups[0].outliers.map(entry => entry.frame), ['large']);
});

test('grouped page shows added, direct, representative, other names, outlier and removed names', () => {
  const body = renderReviewBody(groupedFixture());
  assert.match(body, /changed \(direct 1, inherited 3\)/);
  assert.match(body, /base&lt;token&gt;\.tsx/);
  assert.deepEqual([...body.matchAll(/data-section="([^"]+)"/g)].map(match => match[1]), ['added', 'direct', 'inherited', 'removed']);
  assert.match(body, /<summary role="button">Show all 3 frames<\/summary>/);
  const inherited = body.slice(body.indexOf('data-section="inherited"'), body.indexOf('data-section="removed"'));
  assert.doesNotMatch(inherited, /data-side="difference"/);
  assert.match(inherited, /Representative/);
  assert.match(inherited, /Outlier/);
  assert.match(inherited, /design\/surfaces\/a\.tsx#small/);
  assert.doesNotMatch(body.slice(body.indexOf('data-section="removed"')), /<img/);
});

test('grouped sheet counts representative and outlier pairs individually and lists other members', () => {
  const html = reviewSheetHtml(groupedFixture(), 'dark');
  assert.deepEqual([...html.matchAll(/<article data-source="[^"]+" data-frame="([^"]+)"/g)].map(match => match[1]), ['added', 'direct', 'median', 'large']);
  assert.equal([...html.matchAll(/<img /g)].length, 7);
  assert.match(html, /base&lt;token&gt;\.tsx/);
  assert.match(html, /3 frames/);
  assert.match(html, /design\/surfaces\/a\.tsx#small/);
  assert.match(html, /1 more frames in the review URL/);
  assert.doesNotMatch(html, /Difference/);
});

test('sheet never splits a pair to fill the remaining image budget', () => {
  const model = groupedFixture();
  model.sections.added = Array.from({ length: 21 }, (_, index) => ({ ...model.sections.added[0], frame: `added-${index}` }));
  const html = reviewSheetHtml(model, 'dark');
  assert.equal([...html.matchAll(/<img /g)].length, 23);
  assert.match(html, /data-frame="direct"/);
  assert.doesNotMatch(html, /data-frame="median"/);
  assert.match(html, /3 more frames in the review URL/);
  assert.match(html, /#removed/);
});

test('sheet counts missing captures as zero PNGs while retaining the error placeholder', () => {
  const model = groupedFixture();
  model.sections.added = Array.from({ length: 23 }, (_, index) => ({ ...model.sections.added[0], frame: `added-${index}` }));
  model.sections.changed = [{ ...model.sections.changed[0], themes: [{ ...themeRow('dark'), images: { before: pixel, after: null } }] }];
  const html = reviewSheetHtml(model, 'dark');
  assert.equal([...html.matchAll(/<img /g)].length, 24);
  assert.match(html, /Capture unavailable/);
  assert.doesNotMatch(html, /more frames/);
});

test('theme filtering recomputes groups, median representative and outliers', () => {
  const model = groupedFixture();
  for (const [index, entry] of model.sections.changed.entries()) {
    entry.themes.push({ ...themeRow('light'), verdict: index === 1 ? 'identical' : 'changed', differentPixels: index * 10 });
  }
  const themed = reviewForTheme(model, 'light');
  assert.deepEqual(themed.counts, { added: 0, removed: 0, changed: 3, direct: 1, inherited: 2 });
  assert.deepEqual(themed.groups[0].frames.map(entry => entry.frame), ['median', 'large']);
  assert.ok(themed.groups[0].frames.every(entry => entry.themes.length === 1));
});
