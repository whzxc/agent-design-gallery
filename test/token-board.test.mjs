import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { tokenBoard } from '../src/boards/token-board.mjs';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const source = 'design/tokens.css';
const css = `:root {
  --font-ui: sans-serif;
  --font-mono: monospace;
  /* Surfaces */
  --canvas: #fafafa;
  --surface: #ffffff;
  /* Text and actions */
  --text: #111111;
  --accent: var(--text);
  --text-body: 14px;
  --line-body: 20px;
  --weight-body: 600;
  --radius-card: 12px;
  --shadow-card: 0 2px 8px #0002;
  --control-height: 32px;
  --ease-enter: cubic-bezier(.2,0,0,1);
  --motion-fast: 120ms;
  --motion-slow: .3s;
}
:root[data-theme="dark"] {
  /* This heading must not rename the light groups. */
  --canvas: #141414;
  --surface: #202020;
  --text: #efefef;
}`;

test('Tokens board groups root colour headings, resolves both theme values and renders every visual family', () => {
  const board = tokenBoard(source, css, { projectName: 'Fixture' });
  assert.equal(board.kind, 'board');
  assert.equal(board.width, 1680);
  assert.match(board.body, /<h3>Surfaces<\/h3>/);
  assert.match(board.body, /<h3>Text and actions<\/h3>/);
  assert.doesNotMatch(board.body, /<h3>This heading must not/);
  assert.match(board.body, /data-specimen="design\/tokens.css#--accent"[^]*?background:#111111[^]*?background:#efefef/);
  assert.match(board.css, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(board.css, /height:72px/);
  assert.match(board.body, /font-size:var\(--text-body\);line-height:var\(--line-body\);font-weight:var\(--weight-body\)/);
  for (const marker of ['data-adg-family', 'data-adg-radius', 'data-adg-shadow', 'data-adg-size', 'data-adg-easing', 'data-adg-duration']) assert.ok(board.body.includes(marker), marker);
  assert.match(board.body, /data-adg-duration style="width:40%"/);
  assert.match(board.body, /data-adg-duration style="width:100%"/);
  assert.match(board.body, /The quick brown fox/);
  const landmarks = [...board.body.matchAll(/data-adg-section="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(landmarks).size, landmarks.length);
  assert.ok(landmarks.includes('design/tokens.css#colour'));
  assert.match(board.body, /data-specimen="design\/tokens.css#--line-body"/);
});

test('Tokens board falls back to colour name prefixes and supports the ADG token vocabulary', async () => {
  const styles = await readFile(new URL('../design/tokens.css', import.meta.url), 'utf8');
  const board = tokenBoard(source, styles);
  assert.match(board.body, /<h3>canvas<\/h3>/);
  assert.match(board.body, /<h3>surface<\/h3>/);
  assert.match(board.body, /data-specimen="design\/tokens.css#--shadow-float"/);
  assert.match(board.body, /data-specimen="design\/tokens.css#--radius-dialog"/);
  assert.match(board.body, /data-specimen="design\/tokens.css#--text-title"/);
  assert.match(board.body, /data-specimen="design\/tokens.css#--font-ui"/);
  assert.doesNotMatch(board.body, /undefined|NaN/);
});

test('Tokens board supports step easing and custom font-size names', () => {
  const styles = css.replace('--ease-enter: cubic-bezier(.2,0,0,1);', '--ease-enter: steps(4, end);').replaceAll('--text-body', '--font-size-body');
  const board = tokenBoard(source, styles);
  assert.match(board.body, /data-specimen="design\/tokens.css#--font-size-body"/);
  assert.match(board.body, /M16 112 H40 V88 H64 V64 H88 V40 H112 V16/);
});

test('colour groups preserve first appearance and declaration order with prefix fallbacks', () => {
  const styles = css.replace('  /* Surfaces */', `  --brand-primary: #123456;
  --brand-secondary: var(--brand-primary);
  /* Surfaces */`).replace('  --text-body: 14px;', `  /* Surfaces */
  --surface-raised: #eeeeee;
  /* Focus & selection */
  --focus: #00aaff;
  --text-body: 14px;`);
  const board = tokenBoard(source, styles);
  const colourSection = board.body.split('data-adg-section="design/tokens.css#colour"')[1].split('</section>')[0];
  assert.deepEqual([...colourSection.matchAll(/<h3>(.*?)<\/h3>/g)].map(match => match[1]),
    ['brand', 'Surfaces', 'Text and actions', 'Focus &amp; selection']);
  const groups = [...board.body.matchAll(/<h3>(.*?)<\/h3><div data-adg-token-grid>(.*?)<\/div><\/div>/g)];
  const names = group => [...group.matchAll(/<code>(.*?)<\/code>/g)].map(match => match[1]);
  assert.deepEqual(names(groups[0][2]), ['--brand-primary', '--brand-secondary']);
  assert.deepEqual(names(groups[1][2]), ['--canvas', '--surface', '--surface-raised']);
  assert.deepEqual(names(groups[2][2]), ['--text', '--accent']);
});

test('every token section groups by root headings, with prefix fallbacks and repeated headings merged', () => {
  const styles = `:root {
  --font-ui: sans-serif;
  --font-mono: monospace;
  --canvas: #fff;
  --text: #111;
  --radius-plain: 0px;
  --shadow-plain: none;
  --gap-plain: 8px;
  --ease-plain: linear;
  --motion-plain: 100ms;
  /* Compact & calm */
  --accent-compact: #123;
  --text-compact: 12px;
  --line-compact: 16px;
  --weight-compact: 400;
  --font-compact: sans-serif;
  --tracking-compact: 0px;
  --radius-compact: 4px;
  --shadow-compact: 0 1px 2px #0002;
  --gap-compact: 16px;
  --motion-compact: 120ms;
  --ease-compact: ease;
  /* Spacious */
  --accent-spacious: #456;
  --text-spacious: 20px;
  --font-spacious: serif;
  --tracking-spacious: 1px;
  --radius-spacious: 12px;
  --shadow-spacious: 0 2px 8px #0002;
  --gap-spacious: 32px;
  --ease-spacious: ease-out;
  --motion-spacious: 240ms;
  /* Compact & calm */
  --gap-compact-end: 24px;
}
:root[data-theme="dark"] {
  /* Dark-only heading */
  --canvas: #111;
}`;
  const board = tokenBoard(source, styles);
  const headings = {
    colour: ['canvas', 'text', 'Compact &amp; calm', 'Spacious'],
    type: ['font', 'Compact &amp; calm', 'Spacious'],
    shape: ['radius', 'Compact &amp; calm', 'Spacious'],
    elevation: ['shadow', 'Compact &amp; calm', 'Spacious'],
    sizing: ['gap', 'Compact &amp; calm', 'Spacious'],
    motion: ['ease', 'motion', 'Compact &amp; calm', 'Spacious'],
  };
  for (const [section, expected] of Object.entries(headings)) {
    const content = board.body.split(`data-adg-section="${source}#${section}"`)[1].split('</section>')[0];
    assert.deepEqual([...content.matchAll(/<h3>([^<]*)/g)].map(match => match[1]), expected, section);
  }
  assert.doesNotMatch(board.body, /Dark-only heading/);
  assert.equal([...board.body.matchAll(/<article[^>]*data-specimen=/g)].length, 28);
  assert.match(board.body, /font-size:var\(--text-compact\);line-height:var\(--line-compact\);font-weight:var\(--weight-compact\)/);
  const sizing = board.body.split(`data-adg-section="${source}#sizing"`)[1].split('</section>')[0];
  const compact = sizing.split('<h3>Compact &amp; calm')[1].split('<h3>Spacious')[0];
  assert.deepEqual([...compact.matchAll(/<code>(.*?)<\/code>/g)].map(match => match[1]), ['--gap-compact', '--gap-compact-end']);
});

test('size bars share a group scale, resolve aliases and update the scale and heading with the theme', async t => {
  const styles = css.replace('--control-height: 32px;', `
  /* Spacing */
  --space-zero: 0;
  --space-small: 16px;
  --space-rem: 2rem;
  --space-em: 2em;
  --space-percent: 50%;
  --space-alias: var(--space-small);
  --space-auto: auto;
  /* Layout */
  --layout-wide: 1152px;
  --layout-half: 576px;
  /* Theme growth */
  --grow-wide: 288px;
  --grow-half: 144px;
  /* Track boundary */
  --boundary-wide: 576px;
  --boundary-half: 288px;
  /* Viewport */
  --viewport-wide: 100vw;
  --viewport-half: 50vw;
  --viewport-height: 100vh;`).replace('--canvas: #141414;', `--canvas: #141414;
  --space-small: 8px;
  --layout-wide: 288px;
  --layout-half: 144px;
  --grow-wide: 1152px;
  --grow-half: 576px;`);
  const board = tokenBoard(source, styles);
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent(`<html data-theme="light"><head><style>html{font-size:20px}${board.css}</style></head><body>${board.body}</body></html>`);
  const measurements = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-adg-size-group]')].map(group => {
    const heading = group.querySelector('h3');
    const scale = heading.querySelector('[data-adg-size-scale]');
    const bars = [...group.querySelectorAll('[data-adg-token]')].map(token => {
      const bar = token.querySelector('[data-adg-size]');
      return [token.querySelector('code').textContent, bar ? {
        width: parseFloat(getComputedStyle(bar).width),
        height: parseFloat(getComputedStyle(bar).height),
        track: bar.parentElement.getBoundingClientRect().width,
      } : null];
    });
    return [heading.firstChild.textContent, {
      headingWidth: scale.getBoundingClientRect().width,
      headingCounter: getComputedStyle(scale).counterReset,
      bars: Object.fromEntries(bars),
    }];
  })));
  const light = await measurements();
  const assertBar = (group, name, width) => {
    const bar = group.bars[name];
    assert.ok(Math.abs(bar.width - width) < .1, `${name}: ${bar.width} instead of ${width}`);
    assert.equal(bar.height, 16);
    assert.equal(bar.track, 576);
    assert.ok(bar.width <= bar.track);
  };
  for (const [name, width] of Object.entries({ '--space-zero': 0, '--space-small': 16, '--space-rem': 40, '--space-em': 32, '--space-percent': 288, '--space-alias': 16 })) {
    assertBar(light.Spacing, name, width);
  }
  assert.equal(light.Spacing.bars['--space-auto'], null);
  assert.equal(light.Spacing.headingWidth, 0);
  assert.equal(light['Theme growth'].headingWidth, 0);
  assert.equal(light['Track boundary'].headingWidth, 0);
  assertBar(light['Track boundary'], '--boundary-wide', 576);
  assertBar(light['Track boundary'], '--boundary-half', 288);
  assertBar(light.Layout, '--layout-wide', 576);
  assertBar(light.Layout, '--layout-half', 288);
  assert.ok(light.Layout.headingWidth > 0);
  assert.equal(light.Layout.headingCounter, 'adg-size-scale 50');
  assertBar(light.Viewport, '--viewport-wide', 576);
  assertBar(light.Viewport, '--viewport-half', 288);
  assertBar(light.Viewport, '--viewport-height', 360);
  assert.equal(light.Viewport.headingCounter, 'adg-size-scale 40');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const dark = await measurements();
  assertBar(dark.Spacing, '--space-small', 8);
  assertBar(dark.Spacing, '--space-alias', 8);
  assertBar(dark.Layout, '--layout-wide', 288);
  assertBar(dark.Layout, '--layout-half', 144);
  assert.equal(dark.Layout.headingWidth, 0);
  assertBar(dark['Theme growth'], '--grow-wide', 576);
  assertBar(dark['Theme growth'], '--grow-half', 288);
  assert.ok(dark['Theme growth'].headingWidth > 0);
  assert.equal(dark['Theme growth'].headingCounter, 'adg-size-scale 50');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  assert.deepEqual(await measurements(), light, 'switching back restores widths and scale headings');
});

test('one long token board measures in the DOM and scopes theme variables to itself', async t => {
  const board = tokenBoard(source, css.replace('--line-body: 20px;', '--line-body: 5100px;'));
  assert.equal(board.height, null);
  assert.equal(board.sourceCount, 1);
  assert.equal(board.frameCount, 15);
  assert.doesNotMatch(board.body, /<script|<html|<style|Light \/ Dark|Tokens · 2/);
  assert.doesNotMatch(board.css, /:root|html,body/);
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<html data-theme="light"><head><style>:root{--canvas:hotpink}</style></head><body><div id="overlay"></div></body></html>');
  await page.evaluate(({ body, css }) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    document.querySelector('#overlay').innerHTML = body;
  }, board);
  const element = page.locator('[data-adg-board]');
  const box = await element.boundingBox();
  assert.equal(box.width, 1680);
  assert.ok(box.height > 5100);
  assert.equal(await element.count(), 1);
  assert.equal(await element.evaluate(node => getComputedStyle(node).getPropertyValue('--canvas').trim()), '#fafafa');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  assert.equal(await element.evaluate(node => getComputedStyle(node).getPropertyValue('--canvas').trim()), '#141414');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()), 'hotpink');
  const colours = await page.locator('[data-specimen="design/tokens.css#--accent"] [data-adg-token-swatch]>span')
    .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  assert.deepEqual(colours, ['rgb(17, 17, 17)', 'rgb(239, 239, 239)']);
});

test('token and all manifests expose reusable board data and retain token rows across saves', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-token-board-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const tokenFile = path.join(directory, 'tokens.css');
  await writeFile(tokenFile, css);
  const diagnostics = [];
  const server = await startServer({ directory, stateDirectory: path.join(directory, 'state'), onDiagnostic: error => diagnostics.push(error) });
  t.after(() => server.close());
  const manifest = async scope => {
    const response = await fetch(new URL(`manifest?scope=${scope}`, server.url));
    assert.equal(response.status, 200);
    return response.json();
  };
  for (const scope of ['tokens', 'all']) {
    const data = await manifest(scope);
    assert.equal(data.scope, scope);
    assert.equal(data.tokenBoard.width, 1680);
    assert.equal(data.tokenBoard.source, data.tokenSource);
    assert.equal(data.tokenBoard.height, null);
    assert.match(data.tokenBoard.body, /<main data-adg-board>/);
    assert.ok(data.tokenBoard.css.includes('[data-adg-board]'));
    assert.deepEqual(data.tokens.find(([name]) => name === '--text'), ['--text', '#111111', '#efefef']);
    assert.deepEqual(data.assets, []);
  }
  await writeFile(tokenFile, css.replace('--surface: #ffffff;', '--surface: #fefefe;'));
  assert.match((await manifest('tokens')).tokenBoard.body, /Light: #fefefe/);
  await writeFile(tokenFile, ':root {}');
  const invalid = await manifest('tokens');
  assert.equal(typeof invalid.tokenError, 'string');
  assert.equal(invalid.tokenBoard, undefined);
  assert.ok(diagnostics.length > 0);
});

test('board chrome receives scoped project tokens in every manifest scope', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-board-palette-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'components'));
  await writeFile(path.join(directory, 'components/button.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>');
  await writeFile(path.join(directory, 'gallery.json'), JSON.stringify({ groups: [{ title: 'Controls', assets: ['components/button.svg'] }] }));
  await writeFile(path.join(directory, 'tokens.css'), css);
  const server = await startServer({ directory, stateDirectory: path.join(directory, 'state') });
  t.after(() => server.close());
  let palette;
  for (const scope of ['all', 'tokens', 'layer:components', 'group:Controls', 'asset:components/button.svg']) {
    const response = await fetch(new URL(`manifest?scope=${encodeURIComponent(scope)}`, server.url));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.scope, scope);
    assert.match(data.boardCss, /^#board-chrome\{/);
    assert.match(data.boardCss, /:where\(\[data-theme="dark"\]\) #board-chrome, #board-chrome\[data-theme="dark"\]/);
    assert.doesNotMatch(data.boardCss, /:root|(?:^|\})\s*(?:html|body)\b/);
    palette ??= data.boardCss;
    assert.equal(data.boardCss, palette);
    if (scope !== 'all' && scope !== 'tokens') assert.equal(data.tokenBoard, undefined);
  }
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<html data-theme="light"><head><style>:root{--text:hotpink;--canvas:yellow}</style></head><body><div id="board-chrome"><span id="chapter-title" style="color:var(--accent)">Title</span></div><span id="viewer-title" style="color:var(--text)">Viewer</span></body></html>');
  await page.addStyleTag({ content: palette });
  assert.equal(await page.locator('#chapter-title').evaluate(node => getComputedStyle(node).color), 'rgb(17, 17, 17)');
  assert.equal(await page.locator('#board-chrome').evaluate(node => getComputedStyle(node).getPropertyValue('--canvas').trim()), '#fafafa');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  assert.equal(await page.locator('#chapter-title').evaluate(node => getComputedStyle(node).color), 'rgb(239, 239, 239)');
  assert.equal(await page.locator('#board-chrome').evaluate(node => getComputedStyle(node).getPropertyValue('--canvas').trim()), '#141414');
  assert.equal(await page.locator('#viewer-title').evaluate(node => getComputedStyle(node).color), 'rgb(255, 105, 180)');
  await writeFile(path.join(directory, 'tokens.css'), css.replace('--text: #111111;', '--text: #222222;'));
  const refreshed = await (await fetch(new URL('manifest?scope=layer:components', server.url))).json();
  assert.match(refreshed.boardCss, /--text:#222222;/);
});
