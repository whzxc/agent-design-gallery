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
  assert.match(board.body, /font-size:var\(--text-compact\);line-height:var\(--line-compact\);font-weight:var\(--weight-compact\)/);
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
    assert.equal(data.tokenBoard.source, data.tokenSource);
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

