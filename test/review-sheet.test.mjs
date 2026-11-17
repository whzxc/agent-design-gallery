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
    counts: { added: 24, removed: 1, moved: 0, changed: 1, direct: 1, inherited: 0 }, movePairs: [],
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

test('sheet orders sections and preserves declaration order for frames in the same source', () => {
  const model = reviewFixture();
  const entries = ['changed', 'removed', 'added'].map(status => ({ source: 'assets/a.tsx', frame: status, status, themes: [themeRow('dark')] }));
  entries[1].source = 'old-design/a.tsx';
  model.sections = Object.fromEntries(entries.map(entry => [entry.status, [entry]]));
  const firstAdded = { ...entries[2], frame: 'first' };
  model.sections.added.push(firstAdded);
  const html = reviewSheetHtml(model, 'dark', [firstAdded, ...entries], { before: 'old-design', after: 'assets' });
  assert.deepEqual([...html.matchAll(/<code>([^<]+)<\/code>/g)].map(match => match[1]), ['a#first', 'a#added', 'a#changed', 'a#removed']);
  assert.deepEqual([...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map(match => match[1]), ['Added', 'Changed', 'Removed']);
});

test('sheet uses one theme, a 12-cell budget and a DPR2 PNG', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-sheet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const model = reviewFixture();
  assert.deepEqual(reviewForTheme(model, 'light').counts, { added: 24, removed: 1, moved: 0, changed: 0, direct: 0, inherited: 0 });
  assert.ok(Object.values(reviewForTheme(model, 'dark').sections).flat().every(entry => entry.themes.length === 1));
  const html = reviewSheetHtml(model, 'dark');
  assert.match(html, /Review &lt;Demo&gt;/);
  assert.match(html, /\+13 more in the review page/);
  assert.match(html, /data-source="design\/z-10/);
  assert.doesNotMatch(html, /data-source="design\/z-11/);
  assert.match(html, /data-frame="changed" data-priority="1"/);
  assert.equal([...html.matchAll(/<img /g)].length, 13);
  const browser = await launch();
  try {
    const file = path.join(root, 'review.png');
    assert.deepEqual(await renderReviewSheet(browser, model, 'dark', file), { path: file, theme: 'dark' });
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), 3200);
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
    await page.setContent(html);
    assert.equal(await page.locator('article').count(), 12);
    assert.equal(await page.locator('article').first().getAttribute('data-source'), 'design/z-00.tsx');
    assert.equal(await page.locator('article').first().locator('img').count(), 1);
    assert.equal(await page.locator('.removed img').count(), 0);
    assert.equal(await page.locator('article').nth(2).locator('img').count(), 1);
    assert.equal(await page.locator('body').evaluate(body => body.scrollWidth), 1600);
    assert.equal(await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor), 'rgb(18, 18, 18)');
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const sections = await page.locator('body > section').evaluateAll(sections => sections.map(section => {
        const cells = section.querySelector('.cells');
        const { color } = getComputedStyle(section.querySelector('h2'));
        const { backgroundColor, borderColor } = getComputedStyle(cells.firstElementChild);
        return { color, backgroundColor, borderColor, columns: getComputedStyle(cells).gridTemplateColumns.split(' ').length,
          headingBottom: section.querySelector('h2').getBoundingClientRect().bottom, firstCellTop: cells.getBoundingClientRect().top,
          bottom: section.getBoundingClientRect().bottom };
      }));
      assert.ok(sections.every(section => section.columns === 2 && section.firstCellTop > section.headingBottom));
      assert.ok(sections.slice(1).every((section, index) => section.headingBottom > sections[index].bottom));
      for (const token of ['color', 'borderColor']) assert.equal(new Set(sections.map(section => section[token])).size, 3);
      assert.ok(sections.every(section => section.backgroundColor === 'rgba(0, 0, 0, 0)'));
      assert.deepEqual(await page.locator('.arrow').evaluate(arrow => {
        const style = getComputedStyle(arrow);
        const footer = getComputedStyle(document.querySelector('footer'));
        return [style.backgroundColor, style.color === footer.color];
      }), ['rgba(0, 0, 0, 0)', true]);
    }
    const images = await page.locator('.changed .images > *').evaluateAll(items => items.map(item => ({
      text: item.textContent, left: item.getBoundingClientRect().left, right: item.getBoundingClientRect().right,
    })));
    assert.deepEqual(images.map(item => item.text), ['', '→', '']);
    assert.ok(images[0].right < images[1].left && images[1].right < images[2].left);
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
  assert.deepEqual(cached.counts, { added: 0, removed: 0, moved: 0, changed: 1, direct: 1, inherited: 0 });
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
  assert.deepEqual((await readReviewCache(customKey)).counts, { added: 0, removed: 0, moved: 0, changed: 1, direct: 1, inherited: 0 });
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
  assert.deepEqual(review.counts, { added: 1, removed: 1, moved: 0, changed: 4, direct: 1, inherited: 3 });
  assert.deepEqual(review.sections.changed[1].change, model.sections.changed[1].change);
  assert.equal(review.groups.length, 1);
  assert.equal(review.groups[0].representative.frame, 'median');
  assert.deepEqual(review.groups[0].outliers.map(entry => entry.frame), ['large']);
});

test('move pairs survive theme projection and appear in the page only', () => {
  const previousSource = 'old/<card>.tsx';
  const source = 'new/card.tsx';
  const comparisons = ['one', 'two', 'edited'].flatMap(frame => ['light', 'dark'].map(theme => ({
    id: `${frame}-${theme}`, source, previousSource, frame, theme,
    status: frame === 'edited' ? 'matched' : 'moved',
    verdict: frame === 'edited' && theme === 'dark' ? 'changed' : 'identical',
    ...(frame === 'two' ? { before: { source: previousSource, frame: 'old<two>' } } : {}),
    ...(frame === 'edited' ? { change: { kind: 'direct', causes: [source] } } : {}),
  })));
  const images = new Map(comparisons.map(row => [row.id, { before: pixel, after: pixel }]));
  const review = buildReview({ comparisons, complete: true }, images);
  assert.deepEqual(review.movePairs, ['one', 'two'].map(frame => ({
    before: { source: previousSource, frame: frame === 'two' ? 'old<two>' : frame }, after: { source, frame },
  })));
  assert.deepEqual(review.counts, { added: 0, removed: 0, moved: 2, changed: 1, direct: 1, inherited: 0 });
  const light = reviewForTheme(review, 'light');
  assert.deepEqual(light, buildReview({ comparisons: comparisons.filter(row => row.theme === 'light'), complete: true }, images));
  assert.deepEqual(light.counts, review.counts);
  assert.equal(light.sections.changed[0].themes[0].verdict, 'identical');

  const page = renderReviewBody(light);
  assert.match(page, /data-section="moved"/);
  assert.match(page, /old\/&lt;card&gt;\.tsx#old&lt;two&gt;<\/code> → <code>new\/card\.tsx#two<\/code>/);
  assert.match(page, /Before · <code>old\/&lt;card&gt;\.tsx<\/code>/);
  const sheet = reviewSheetHtml(light, 'light');
  assert.match(sheet, /<code>new\/card#edited<\/code>/);
  assert.doesNotMatch(sheet, /Moved|old\/|Before|After|#two/);
  assert.equal([...sheet.matchAll(/<img /g)].length, 2);
  assert.match(sheet, /<footer data-more="0" hidden><\/footer>/);

  const movedOnly = buildReview({ comparisons: comparisons.filter(row => row.status === 'moved'), complete: true });
  const emptySheet = reviewSheetHtml(movedOnly, 'light');
  assert.doesNotMatch(emptySheet, /<section|<img|more in the review page/);
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

test('grouped sheet uses only the title, section names, frame labels and the representative suffix', () => {
  const html = reviewSheetHtml(groupedFixture(), 'dark');
  assert.deepEqual([...html.matchAll(/<article data-source="[^"]+" data-frame="([^"]+)"/g)].map(match => match[1]), ['added', 'direct', 'median', 'large']);
  assert.equal([...html.matchAll(/<img /g)].length, 7);
  assert.match(html, /<header><h1>Review &lt;Demo&gt;<\/h1><\/header>/);
  assert.match(html, /<code>surfaces\/b#median<\/code><span>\+2<\/span>/);
  assert.match(html, /<code>surfaces\/c#large<\/code><\/div>/);
  assert.doesNotMatch(html, /base-sha|current-sha|HEAD~1|base&lt;token&gt;|surfaces\/a#small|Representative|Outlier|Direct|Before|After|Difference|more in the review page/);
});

test('sheet reserves the first addition, first direct change and group representatives before filling cells', () => {
  const model = groupedFixture();
  const [direct, inherited] = model.sections.changed;
  model.sections.changed = [direct, ...Array.from({ length: 13 }, (_, i) => ({ ...inherited, frame: `member-${i}` }))];
  model.sections.added = Array.from({ length: 14 }, (_, i) => ({ ...model.sections.added[0], frame: `added-${i}` }));
  const html = reviewSheetHtml(model, 'dark');
  assert.equal([...html.matchAll(/<article /g)].length, 12);
  assert.equal([...html.matchAll(/<img /g)].length, 14);
  assert.match(html, /data-frame="added-0" data-priority="0"/);
  assert.match(html, /data-frame="direct" data-priority="1"/);
  assert.match(html, /data-frame="member-0" data-priority="2"/);
  assert.ok(html.indexOf('data-frame="added-0"') < html.indexOf('data-frame="member-0"'));
  assert.match(html, /<code>surfaces\/a#member-0<\/code><span>\+12<\/span>/);
  assert.match(html, /\+4 more in the review page/);
  assert.match(html, /#removed/);

  model.sections.changed.push(...Array.from({ length: 10 }, (_, i) => ({ ...inherited,
    frame: `other-group-${i}`, change: { kind: 'inherited', causes: [`cause-${i}`] },
  })));
  const saturated = reviewSheetHtml(model, 'dark');
  assert.deepEqual([...saturated.matchAll(/data-frame="([^"]+)" data-priority="\d+"/g)].map(match => match[1]),
    ['added-0', 'direct', 'member-0', ...Array.from({ length: 9 }, (_, i) => `other-group-${i}`)]);
});

test('sheet never upscales captures, caps frame height and drops whole entries at the height limit', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-sheet-height-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme: 'dark' });
    const image = async (width, height) => {
      await page.setContent(`<div style="width:${width}px;height:${height}px;background:#394459"></div>`);
      return 'data:image/png;base64,' + (await page.locator('div').screenshot()).toString('base64');
    };
    const small = await image(80, 40), tall = await image(120, 900);
    const model = groupedFixture();
    const sample = model.sections.added[0];
    model.sections = { added: [
      { ...sample, themes: [{ ...themeRow('dark'), afterSize: { width: 40, height: 20 }, images: { after: small } }] },
      { ...sample, frame: 'tall', themes: [{ ...themeRow('dark'), afterSize: { width: 120, height: 900 }, images: { after: tall } }] },
    ], changed: [], removed: [] };
    await page.setContent(reviewSheetHtml(model, 'dark'));
    const boxes = await page.locator('img').evaluateAll(images => images.map(img => [img.clientWidth, img.clientHeight]));
    assert.deepEqual(boxes, [[40, 20], [64, 480]]);
    const row = { ...themeRow('dark'), afterSize: { width: 120, height: 900 }, beforeSize: { width: 120, height: 900 }, images: { before: tall, after: tall } };
    model.sections = { added: [], removed: Array.from({ length: 100 }, (_, i) => ({ ...sample, status: 'removed', frame: `removed-${i}` })), changed: Array.from({ length: 12 }, (_, i) => ({
      ...sample, status: 'changed', frame: `group-${i}`, themes: [row],
      change: { kind: 'inherited', causes: [`design/${i}/${'long-cause-'.repeat(75)}.tsx`] },
    })) };
    model.movePairs = ['first', 'second'].map(frame => ({ before: { source: 'old.tsx', frame }, after: { source: 'new.tsx', frame } }));
    model.counts.moved = model.movePairs.length;
    const html = reviewSheetHtml(model, 'dark');
    await page.setContent(html);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    assert.ok((await page.locator('body').boundingBox()).height > 4000);
    const file = path.join(root, 'review.png');
    await renderReviewSheet({ newPage: async options => {
      const sheetPage = await browser.newPage(options);
      return {
        setContent: html => sheetPage.setContent(html), evaluate: fn => sheetPage.evaluate(fn), close: () => sheetPage.close(),
        locator: selector => ({ screenshot: async options => {
          const removed = await sheetPage.locator('.removed li').count();
          assert.ok(removed > 0 && removed < 100);
          assert.equal(await sheetPage.locator('article').count(), 12);
          assert.equal(await sheetPage.locator('footer').textContent(), `+${100 - removed} more in the review page`);
          await sheetPage.locator(selector).screenshot(options);
        } }),
      };
    } }, model, 'dark', file);
    const png = await readFile(file);
    assert.equal(png.readUInt32BE(16), 3200);
    assert.ok(png.readUInt32BE(20) <= 8000);
  } finally { await browser.close(); }
});

test('theme filtering recomputes groups, median representative and outliers', () => {
  const model = groupedFixture();
  for (const [index, entry] of model.sections.changed.entries()) {
    entry.themes.push({ ...themeRow('light'), verdict: index === 1 ? 'identical' : 'changed', differentPixels: index * 10 });
  }
  const themed = reviewForTheme(model, 'light');
  assert.deepEqual(themed.counts, { added: 0, removed: 0, moved: 0, changed: 3, direct: 1, inherited: 2 });
  assert.deepEqual(themed.groups[0].frames.map(entry => entry.frame), ['median', 'large']);
  assert.ok(themed.groups[0].frames.every(entry => entry.themes.length === 1));
});
