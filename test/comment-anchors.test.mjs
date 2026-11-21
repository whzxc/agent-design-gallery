import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { main } from '../src/cli.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { sha256Hex } from '../public/frame-identity.js';
import { attachComment, commentLabel, placeComment } from '../public/comment-anchors.js';

test('placement records target and frame offsets, and attachment clamps and falls back', () => {
  const source = { x: 5, y: 8, width: 260, height: 140 };
  const frame = { x: 20, y: 30, width: 210, height: 100 };
  const element = { id: 'e1_abc', tag: 'button', commentName: 'button', text: 'Open', x: 40, y: 10, width: 80, height: 40 };
  const thread = placeComment({ source: 'design/modules/files.tsx', frame: 'source-local', layer: 'modules', chapter: 'Files',
    box: { ...element, x: 60, y: 40 }, frameBox: frame, element, owner: 'design/components/button.tsx#Button',
    label: commentLabel('modules/files.tsx', 'source-local') }, { x: 122, y: 76 });
  assert.deepEqual(thread.anchor, { kind: 'element', source: 'design/modules/files.tsx', frame: 'source-local', layer: 'modules',
    chapter: 'Files', element: { id: 'e1_abc' }, x: 62, y: 36, frameX: 102, frameY: 46 });
  assert.deepEqual(thread.target, { label: 'modules/files#source-local', tag: 'button', text: 'Open',
    owner: 'design/components/button.tsx#Button', displayName: 'Button “Open”' });
  assert.equal(thread.hint, 'Button “Open”');
  const moved = attachComment(thread, { frame: { ...frame, x: 50, y: 55 }, source, elements: [{ ...element, width: 20, height: 12 }] });
  assert.deepEqual([moved.x, moved.y, moved.changed], [110, 77, false]);
  const replaced = attachComment(thread, { frame, source, elements: [{ ...element, text: 'Open file' }] });
  assert.deepEqual([replaced.x, replaced.y, replaced.changed], [122, 76, true]);
  assert.deepEqual(attachComment(thread, { source }), { x: 5, y: 8, box: source, changed: true });
  assert.equal(attachComment(thread, {}), null);
});

async function makeSyntheticProject(t, { git = false } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-comment-identity-')));
  const cleanup = [];
  t.after(async () => {
    try { for (const close of cleanup.reverse()) await close(); }
    finally { await rm(root, { recursive: true, force: true }); }
  });
  const design = path.join(root, 'design');
  const state = path.join(root, 'state');
  await mkdir(path.join(design, 'components'), { recursive: true });
  await mkdir(path.join(design, 'surfaces'), { recursive: true });
  await writeFile(path.join(root, 'adg.config.mjs'), "export default { design: 'design', sources: ['components', 'surfaces'] };\n");
  await writeFile(path.join(design, 'tokens.css'), starterTokens);
  await writeFile(
    path.join(design, 'components/action.tsx'),
    `import { Frame, Icon } from 'adg';
export function ActionButton({ label = 'Save changes' }: { label?: string }) {
  return (
    <button class="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-field)] bg-[var(--accent)] text-[var(--on-accent)]">
      <Icon name="check" size={14} />
      <span {...(label === 'Publish draft' ? {'data-adg-id': 'action-label'} : {})}>{label}</span>
    </button>
  );
}
export default () => [
  <Frame name="primary" width={240} height={100}><div class="p-4"><ActionButton /></div></Frame>,
  <Frame name="compact" width={240} height={100}><div class="p-4"><ActionButton label="Apply" /></div></Frame>,
];
`,
  );
  await writeFile(
    path.join(design, 'surfaces/workspace.tsx'),
    `import { Frame } from 'adg';
import { ActionButton } from '../components/action';
export default () => [
  <Frame name="ready" width={420} height={240}>
    <main class="w-[420px] h-[240px] p-6 bg-[var(--surface)] text-[var(--text)]">
      <div style={{ marginLeft: 12, marginTop: 16 }}>
        <ActionButton label="Publish draft" />
      </div>
      <p class="mt-6 text-[13px] text-[var(--text-secondary)]">Status bar <strong data-adg-id="status-tag">Synced</strong></p>
    </main>
  </Frame>,
  <Frame name="secondary" width={420} height={240}>
    <main class="w-[420px] h-[240px] p-6 bg-[var(--surface)] text-[var(--text)]">
      <div style={{ width: 45.5, overflow: 'hidden', visibility: 'hidden' }}>
        <div style={{ visibility: 'visible', width: 100 }}>
          <button style={{ width: 80, height: 20 }}>Clipped action</button>
        </div>
        <div style={{ opacity: 0 }}><button>Transparent action</button></div>
      </div>
      <ActionButton label="Retry sync" />
    </main>
  </Frame>,
];
`,
  );
  if (git) {
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-qm', 'chore: initial synthetic fixture'], { cwd: root });
  }
  return { root, design, state, cleanup };
}

async function runCli(args, cwd) {
  let out = '', err = '', code = null;
  await main([...args, '--json'], cwd, {
    stdout: v => { out += v; },
    stderr: v => { err += v; },
    exit: c => { code = c; },
  });
  return { code, err, envelope: JSON.parse(out) };
}

test('browser SHA-256 and viewer element identities match Node SHA-256 and adg inspect', { timeout: 60000 }, async t => {
  for (const sample of ['', 'abc', 'a'.repeat(55), 'b'.repeat(56), 'c'.repeat(64), 'd'.repeat(129), '按钮间距偏紧 🚀 e1_test']) {
    assert.equal(sha256Hex(sample), createHash('sha256').update(sample).digest('hex'));
  }
  const { root, design, state, cleanup } = await makeSyntheticProject(t);
  const inspected = await runCli(['inspect', 'design/surfaces/workspace.tsx', '--frame=ready', '--expand'], root);
  assert.equal(inspected.code, 0);
  const inspectElements = inspected.envelope.data.baseline.elements;
  const labelInspect = inspectElements.find(e => e.identity?.anchor === 'action-label');
  const statusInspect = inspectElements.find(e => e.identity?.anchor === 'status-tag');
  assert.ok(labelInspect?.id.startsWith('e1_'));
  assert.ok(statusInspect?.id.startsWith('e1_'));

  const { launch } = await import('../src/toolkit/browser.mjs');
  const server = await startServer({ directory: design, stateDirectory: state });
  cleanup.push(() => server.close());
  const browser = await launch();
  cleanup.push(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(server.url + '?scope=all');
  await page.waitForFunction(() => window.__adg?.ready);

  const { viewerIds, secondary } = await page.evaluate(async () => {
    const { prepare } = await import('/assets.js');
    const m = await (await fetch('/manifest?scope=all')).json();
    const ws = m.assets.find(a => a.path === 'surfaces/workspace.tsx');
    const prepared = await prepare(ws, 'light');
    return {
      viewerIds: prepared.parts.find(p => p.name === 'ready').elements,
      secondary: prepared.parts.find(p => p.name === 'secondary').elements,
    };
  });
  assert.equal(secondary.find(e => e.tag === 'button' && e.text === 'Clipped action')?.width, 45.5);
  assert.equal(secondary.some(e => e.tag === 'button' && e.text === 'Transparent action'), false);
  assert.ok(viewerIds.some(e => e.id === labelInspect.id && e.owner.export === 'ActionButton' && e.owner.source === 'components/action.tsx'));
  assert.ok(viewerIds.some(e => e.id === statusInspect.id && e.owner.export === null && e.owner.source === 'surfaces/workspace.tsx'));
});

test('the bottom Comment tool places touch pins and keeps them attached through live edits and scope links', { timeout: 60000 }, async t => {
  const { root, design, state, cleanup } = await makeSyntheticProject(t, { git: true });
  const { launch } = await import('../src/toolkit/browser.mjs');
  const server = await startServer({ directory: design, stateDirectory: state });
  cleanup.push(() => server.close());
  const browser = await launch();
  cleanup.push(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  await page.goto(server.url + '?asset=components/action.tsx');
  await page.waitForFunction(() => window.__adg?.ready);
  const point = await page.evaluate(async () => {
    const { prepare } = await import('/assets.js');
    const path = 'components/action.tsx';
    const loaded = await prepare({ path, onlyFrame: 'primary', version: '' }, document.documentElement.dataset.theme);
    const element = loaded.parts[0].elements.findLast(element => element.text === 'Save changes');
    const item = window.__adg.items.find(item => item.id.includes(path) && item.id.endsWith('#0'));
    const { x, y, scale } = window.__adg.view;
    const rect = document.querySelector('.gallery-viewport').getBoundingClientRect();
    return { x: rect.left + x + (item.x + element.x + element.width / 2) * scale,
      y: rect.top + y + (item.y + element.y + element.height / 2) * scale };
  });
  await page.keyboard.press('c');
  await page.mouse.move(point.x, point.y);
  const highlight = page.locator('.adg-comment-highlight-label');
  await highlight.filter({ hasText: 'Button “Save changes”' }).waitFor();
  const outline = page.locator('.adg-comment-outline');
  const buttonBox = await outline.boundingBox();
  await page.keyboard.down('Alt');
  await highlight.filter({ hasText: 'ActionButton “Save changes”' }).waitFor();
  assert.ok((await outline.boundingBox()).width < buttonBox.width);
  await page.keyboard.up('Alt');
  await highlight.filter({ hasText: 'Button “Save changes”' }).waitFor();
  await page.touchscreen.tap(point.x, point.y);
  const composer = page.locator('.adg-comment-composer');
  assert.equal(await composer.locator('textarea').getAttribute('placeholder'), 'Comment on Button “Save changes”…');
  await composer.locator('textarea').fill('Check the save label.');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByText('Check the save label.', { exact: true }).waitFor();
  const pin = page.getByRole('button', { name: /^Comment #1,/ });
  const initial = await pin.boundingBox();
  assert.ok(initial);
  const chosen = await runCli(['comments', 'list', '--state-dir=' + state], root);
  const [thread] = chosen.envelope.data.threads;
  assert.equal(thread.anchor.kind, 'element');
  assert.match(thread.anchor.element.id, /^e1_/);
  assert.equal(thread.target.text, 'Save changes');
  assert.equal(thread.target.tag, 'button');
  assert.equal(thread.target.displayName, 'Button “Save changes”');
  const pinStyle = () => pin.evaluate(element => {
    const style = getComputedStyle(element);
    return { fill: style.backgroundColor, clip: style.backgroundClip, edge: style.borderTopStyle };
  });
  const openStyle = await pinStyle();
  assert.equal((await runCli(['comments', 'reply', '#1', '--author=codex', '--message=Checked.', '--state-dir=' + state], root)).code, 0);
  await page.getByText('Checked.', { exact: true }).waitFor({ timeout: 2000 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('1');
  const actual = await pin.boundingBox();
  assert.ok(actual);
  assert.equal(actual.width, initial.width);
  assert.equal(actual.height, initial.height);
  await page.keyboard.press('Shift+c');
  await pin.waitFor({ state: 'hidden' });
  await page.keyboard.press('Shift+c');
  await pin.waitFor();
  const file = path.join(design, 'components/action.tsx');
  await writeFile(file, (await readFile(file, 'utf8')).replace('Save changes', 'Save draft'));
  await page.locator('.adg-comment-pin[data-changed]').waitFor({ timeout: 15_000 });
  assert.match(openStyle.fill, /^rgb\(/);
  assert.deepEqual(await pinStyle(), { ...openStyle, edge: 'dashed' });
  await page.goto(server.url + '?comment=1');
  await page.getByText('Checked.', { exact: true }).waitFor();
  assert.ok(await page.locator('.adg-comment-pin[data-changed]').isVisible());

  await page.goto(server.url + '?asset=components/action.tsx');
  await page.waitForFunction(() => window.__adg?.ready);
  await page.keyboard.press('c');
  await page.keyboard.down('Alt');
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up('Alt');
  assert.equal(await composer.locator('textarea').getAttribute('placeholder'), 'Comment on ActionButton “Save draft”…');
  await composer.locator('textarea').fill('Anchor the text itself.');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await page.getByText('Anchor the text itself.', { exact: true }).waitFor();
  const second = (await runCli(['comments', 'list', '--state-dir=' + state], root)).envelope.data.threads[1];
  assert.equal(second.target.tag, 'span');
  assert.notEqual(second.anchor.element.id, thread.anchor.element.id);
});
