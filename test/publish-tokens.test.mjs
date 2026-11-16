import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tokenBoard, paginateTokenBoard } from '../src/publish/token-board.mjs';
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
  const board = tokenBoard(source, css, 'revision', { projectName: 'Fixture' });
  assert.equal(board.kind, 'board');
  assert.equal(board.width, 1680);
  assert.match(board.html, /<h3>Surfaces<\/h3>/);
  assert.match(board.html, /<h3>Text and actions<\/h3>/);
  assert.doesNotMatch(board.html, /<h3>This heading must not/);
  assert.match(board.html, /data-specimen="design\/tokens.css#--accent"[^]*?background:#111111[^]*?background:#efefef/);
  assert.match(board.html, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(board.html, /height:72px/);
  assert.match(board.html, /font-size:var\(--text-body\);line-height:var\(--line-body\);font-weight:var\(--weight-body\)/);
  for (const marker of ['data-adg-family', 'data-adg-radius', 'data-adg-shadow', 'data-adg-size', 'data-adg-easing', 'data-adg-duration']) assert.ok(board.html.includes(marker), marker);
  assert.match(board.html, /data-adg-duration style="width:40%"/);
  assert.match(board.html, /data-adg-duration style="width:100%"/);
  assert.match(board.html, /The quick brown fox/);
  const landmarks = [...board.html.matchAll(/data-adg-section="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(landmarks).size, landmarks.length);
  assert.ok(landmarks.includes('design/tokens.css#colour'));
  assert.match(board.html, /data-specimen="design\/tokens.css#--line-body"/);
});

test('Tokens board falls back to colour name prefixes and supports the ADG token vocabulary', async () => {
  const styles = await readFile(new URL('../design/tokens.css', import.meta.url), 'utf8');
  const board = tokenBoard(source, styles, 'revision');
  assert.match(board.html, /<h3>canvas<\/h3>/);
  assert.match(board.html, /<h3>surface<\/h3>/);
  assert.match(board.html, /data-specimen="design\/tokens.css#--shadow-float"/);
  assert.match(board.html, /data-specimen="design\/tokens.css#--radius-dialog"/);
  assert.match(board.html, /data-specimen="design\/tokens.css#--text-title"/);
  assert.match(board.html, /data-specimen="design\/tokens.css#--font-ui"/);
  assert.doesNotMatch(board.html, /undefined|NaN/);
});

test('Tokens board supports step easing and custom font-size names', () => {
  const styles = css.replace('--ease-enter: cubic-bezier(.2,0,0,1);', '--ease-enter: steps(4, end);').replaceAll('--text-body', '--font-size-body');
  const board = tokenBoard(source, styles, 'revision');
  assert.match(board.html, /data-specimen="design\/tokens.css#--font-size-body"/);
  assert.match(board.html, /M16 112 H40 V88 H64 V64 H88 V40 H112 V16/);
});


test('Tokens continue at section boundaries and preserve stable first-board identity', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1680, height: 900 } });
    const styles = css.replace('--control-height: 32px;', '--control-height: 2100px;');
    const doc = tokenBoard(source, styles, 'revision');
    const boards = await paginateTokenBoard(doc, page, { heightBudget: 3500 });
    assert.equal(boards.length, 2);
    assert.deepEqual(boards.map(board => board.key), [source, `${source}:2`]);
    assert.deepEqual(boards.map(board => board.name), ['Tokens', 'Tokens · 2']);
    assert.deepEqual(boards.map(board => board.part), [1, 2]);
    assert.ok(boards.every(board => board.height <= 3500));
    assert.ok(boards.every(board => !('_tokenBoard' in board)));
    const sections = boards.flatMap(board => [...board.html.matchAll(/data-adg-section="([^"]+)"/g)].map(match => match[1]));
    assert.equal(new Set(sections).size, 6);
    assert.equal(sections.length, 6);
    assert.match(boards[1].html, /data-adg-section="design\/tokens.css#sizing"/);
  } finally {
    await browser.close();
  }
});
