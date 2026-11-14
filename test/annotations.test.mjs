import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { main } from '../src/cli.mjs';
import { annotations, annotationFile } from '../src/annotations.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { sha256Hex } from '../public/frame-identity.js';

async function makeSyntheticProject(t, { git = false } = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-annotations-r2-')));
  t.after(() => rm(root, { recursive: true, force: true }));
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
      <span data-adg-id="action-label">{label}</span>
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
  return { root, design, state };
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
  const { root, design, state } = await makeSyntheticProject(t);
  const inspected = await runCli(['inspect', 'design/surfaces/workspace.tsx', '--frame=ready', '--expand'], root);
  assert.equal(inspected.code, 0);
  const inspectElements = inspected.envelope.data.baseline.elements;
  const labelInspect = inspectElements.find(e => e.identity?.anchor === 'action-label');
  const statusInspect = inspectElements.find(e => e.identity?.anchor === 'status-tag');
  assert.ok(labelInspect?.id.startsWith('e1_'));
  assert.ok(statusInspect?.id.startsWith('e1_'));

  const { launch } = await import('../src/toolkit/browser.mjs');
  const server = await startServer({ directory: design, stateDirectory: state });
  t.after(() => server.close());
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(server.url + '?scope=all');
  await page.waitForFunction(() => window.__adg?.ready);

  const viewerIds = await page.evaluate(async () => {
    const { prepare } = await import('/assets.js');
    const m = await (await fetch('/manifest?scope=all')).json();
    const ws = m.assets.find(a => a.path === 'surfaces/workspace.tsx');
    const prepared = await prepare(ws, 'light');
    return prepared.parts.find(p => p.name === 'ready').elements;
  });
  assert.ok(viewerIds.some(e => e.id === labelInspect.id && e.owner.export === 'ActionButton' && e.owner.source === 'components/action.tsx'));
  assert.ok(viewerIds.some(e => e.id === statusInspect.id && e.owner.export === null && e.owner.source === 'surfaces/workspace.tsx'));
});

test('annotation API, round-1 rows, status filters, threads and CLI read context package work end-to-end', { timeout: 60000 }, async t => {
  const { root, design, state } = await makeSyntheticProject(t, { git: true });
  const initialHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

  // Seed a legacy round-1 row (no replies field, element: null) to verify backward compatibility.
  const storeFile = annotationFile(root, state);
  await mkdir(path.dirname(storeFile), { recursive: true });
  await writeFile(storeFile, JSON.stringify([{
    id: 'legacy-1',
    number: 1,
    source: 'surfaces/workspace.tsx',
    frame: 'ready',
    x: 0.25,
    y: 0.3,
    element: null,
    note: 'Legacy frame note',
    revision: initialHead,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }], null, 2));

  const inspected = await runCli(['inspect', 'design/surfaces/workspace.tsx', '--frame=ready', '--expand'], root);
  const targetEl = inspected.envelope.data.baseline.elements.find(e => e.identity?.anchor === 'action-label');
  assert.ok(targetEl);

  let server = await startServer({ directory: design, stateDirectory: state });
  t.after(() => server.close());
  const api = async (action, payload = {}) => {
    const r = await fetch(new URL('api/annotations', server.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    return [r.status, await r.json()];
  };

  // Legacy row loads with replies normalized to [].
  const initialRows = await (await fetch(new URL('api/annotations', server.url))).json();
  assert.equal(initialRows.length, 1);
  assert.deepEqual(initialRows[0].replies, []);

  // Create an element-anchored note.
  const [createStatus, created] = await api('create', {
    source: 'surfaces/workspace.tsx',
    frame: 'ready',
    x: 0.2,
    y: 0.2,
    element: {
      id: targetEl.id,
      owner: { source: 'components/action.tsx', export: 'ActionButton' },
      x: 0.5,
      y: 0.5,
    },
    note: 'Make label contrast stronger',
  });
  assert.equal(createStatus, 200);
  assert.equal(created.number, 2);
  assert.equal(created.revision, initialHead);

  // Validation errors preserve USAGE_INVALID (HTTP 400 on server, exit 2 on CLI).
  assert.equal((await api('create', { note: 'missing fields' }))[0], 400);
  assert.equal((await api('create', { source: 'surfaces/workspace.tsx', frame: 'ready', x: 0.2, y: 0.2, note: 'bad anchor', element: { id: '' } }))[0], 400);
  assert.equal((await runCli(['annotations', 'reply', created.id, `--state-dir=${state}`], root)).envelope.error.code, 'USAGE_INVALID');
  assert.equal((await runCli(['annotations', 'list', '--status=invalid', `--state-dir=${state}`], root)).envelope.error.code, 'USAGE_INVALID');

  // Advance Git HEAD so creation revision !== current head.
  await writeFile(path.join(root, 'README.md'), '# Synthetic test\n');
  execFileSync('git', ['add', 'README.md'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'docs: advance head'], { cwd: root });
  const nextHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.notEqual(nextHead, initialHead);

  // CLI read <id> --json returns the complete context package.
  const readRes = await runCli(['annotations', 'read', created.id, `--state-dir=${state}`], root);
  assert.equal(readRes.code, 0);
  const ctx = readRes.envelope.data;
  assert.equal(ctx.note, 'Make label contrast stronger');
  assert.equal(ctx.status, 'open');
  assert.equal(ctx.project, root);
  assert.equal(ctx.sourcePath, 'design/surfaces/workspace.tsx');
  assert.equal(ctx.ownerSourcePath, 'design/components/action.tsx');
  assert.equal(ctx.export, 'ActionButton');
  assert.equal(ctx.frame, 'ready');
  assert.equal(ctx.elementId, targetEl.id);
  assert.equal(ctx.stale, false);
  assert.ok(ctx.frameBox && ctx.frameBox.width === 420 && ctx.frameBox.height === 240);
  assert.ok(ctx.elementBox && ctx.elementBox.width > 0 && ctx.elementBox.height > 0);
  assert.equal(ctx.revision, initialHead);
  assert.equal(ctx.head, nextHead);
  assert.match(ctx.commands.inspect, /adg inspect design\/surfaces\/workspace\.tsx --frame=ready --element=e1_/);
  assert.match(ctx.commands.render, /adg render design\/surfaces\/workspace\.tsx --frame=ready --json/);

  // Verify the reported inspect command runs directly via CLI (both compact default and --expand).
  const inspectArgs = ctx.commands.inspect.replace(/^adg\s+/, '').replace(/\s+--json$/, '').split(/\s+/);
  const verifyCompact = await runCli(inspectArgs, root);
  assert.equal(verifyCompact.code, 0);
  assert.equal(verifyCompact.envelope.data.matches.length, 1);
  const verifyInspect = await runCli([...inspectArgs, '--expand'], root);
  assert.equal(verifyInspect.code, 0);
  assert.equal(verifyInspect.envelope.data.matches[0].element, targetEl.id);

  // Reply, address, list filters, resolve and reopen via CLI.
  const replied = await runCli(['annotations', 'reply', created.id, '--message=Checking tokens now', `--state-dir=${state}`], root);
  assert.equal(replied.code, 0);
  assert.equal(replied.envelope.data.replies.length, 1);
  assert.equal(replied.envelope.data.replies[0].author, 'agent');

  const addressed = await runCli(['annotations', 'address', created.id, '--message=Updated button foreground token', `--state-dir=${state}`], root);
  assert.equal(addressed.code, 0);
  assert.equal(addressed.envelope.data.status, 'addressed');
  assert.equal(addressed.envelope.data.replies.length, 2);

  // Default CLI list returns only open annotations.
  const openList = await runCli(['annotations', `--state-dir=${state}`], root);
  assert.deepEqual(openList.envelope.data.map(r => r.id), ['legacy-1']);
  const addressedList = await runCli(['annotations', 'list', '--status=addressed', `--state-dir=${state}`], root);
  assert.deepEqual(addressedList.envelope.data.map(r => r.id), [created.id]);
  const allList = await runCli(['annotations', 'list', '--status=all', `--state-dir=${state}`], root);
  assert.equal(allList.envelope.data.length, 2);

  const resolved = await runCli(['annotations', 'resolve', created.id, `--state-dir=${state}`], root);
  assert.equal(resolved.envelope.data.status, 'resolved');
  const reopened = await runCli(['annotations', 'reopen', created.id, `--state-dir=${state}`], root);
  assert.equal(reopened.envelope.data.status, 'open');

  // Removing the anchored element marks the context package stale while keeping frameBox.
  await writeFile(
    path.join(design, 'surfaces/workspace.tsx'),
    `import { Frame } from 'adg';
export default () => <Frame name="ready" width={420} height={240}><main class="w-[420px] h-[240px] p-6"><p>Empty</p></main></Frame>;
`,
  );
  const staleCtx = (await runCli(['annotations', 'read', created.id, `--state-dir=${state}`], root)).envelope.data;
  assert.equal(staleCtx.stale, true);
  assert.equal(staleCtx.elementBox, null);
  assert.ok(staleCtx.frameBox);
  assert.doesNotMatch(staleCtx.commands.inspect, /--element=/);
});

test('browser check 1 & 2: right-click Annotate here anchors deepest element and follows reload, zoom, theme, movement and removal', { timeout: 90000 }, async t => {
  const { launch } = await import('../src/toolkit/browser.mjs');
  const { root, design, state } = await makeSyntheticProject(t);
  const inspected = await runCli(['inspect', 'design/surfaces/workspace.tsx', '--frame=ready', '--expand'], root);
  const expectedLabelId = inspected.envelope.data.baseline.elements.find(e => e.identity?.anchor === 'action-label').id;

  const server = await startServer({ directory: design, stateDirectory: state });
  t.after(() => server.close());
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(server.url + '?scope=all');
  await page.waitForFunction(() => window.__adg?.ready);
  // Fit the 'ready' frame so zoom >= 0.45 and elements are clearly visible.
  await page.evaluate(async () => {
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    const cx = v.x + (item.x + 30) * v.scale;
    const cy = v.y + (item.y + 30) * v.scale;
    document.querySelector('.gallery-viewport').dispatchEvent(new MouseEvent('dblclick', { clientX: cx, clientY: cy, bubbles: true }));
  });
  await page.waitForFunction(() => window.__adg?.ready && window.__adg.view.scale >= 0.5);

  // Locate the deepest element ('action-label' span inside ActionButton) on screen.
  const labelScreen = await page.evaluate(async labelId => {
    const m = await (await fetch('/manifest?scope=all&metadata=1&theme=dark')).json();
    const { prepare } = await import('/assets.js');
    const asset = await prepare(m.assets.find(a => a.path === 'surfaces/workspace.tsx'), document.documentElement.dataset.theme);
    const part = asset.parts.find(p => p.name === 'ready');
    const el = part.elements.find(e => e.id === labelId);
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    // Flow item has 16px frame crop offset (crop.x = -16, crop.y = -16 => frameBox = item.x + 16).
    const fx = item.x + 16 + el.x + el.width * 0.5;
    const fy = item.y + 16 + el.y + el.height * 0.5;
    return { x: v.x + fx * v.scale, y: v.y + fy * v.scale, el };
  }, expectedLabelId);

  // Click 1: right-click on deepest element -> selects element and opens context menu.
  await page.mouse.click(labelScreen.x, labelScreen.y, { button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  assert.deepEqual((await page.evaluate(() => window.__adg.selection)).element, { source: 'components/action.tsx', export: 'ActionButton' });

  // Click 2 + typing + Enter: choose Annotate here, type, press Enter.
  await page.getByRole('menuitem', { name: 'Annotate here', exact: true }).click();
  const editorBox = page.getByRole('textbox', { name: 'Annotation note' });
  await editorBox.waitFor();
  await editorBox.fill('按钮内边距需要微调');
  await editorBox.press('Enter');

  await page.locator('.annotation-card').waitFor();
  assert.equal(await page.locator('.annotation-point').textContent(), '1');
  assert.equal(await page.locator('.annotation-note').textContent(), '按钮内边距需要微调');

  const savedRows = await annotations(root, state);
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].element.id, expectedLabelId);
  assert.deepEqual(savedRows[0].element.owner, { source: 'components/action.tsx', export: 'ActionButton' });

  const readPointOffset = () => page.evaluate(() => {
    const pt = document.querySelector('.annotation-point');
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    return {
      dx: ( parseFloat(pt.style.left) - (v.x + (item.x + 16) * v.scale) ) / v.scale,
      dy: ( parseFloat(pt.style.top) - (v.y + (item.y + 16) * v.scale) ) / v.scale,
    };
  });
  const beforeMove = await readPointOffset();

  // Stays on element across reload, zoom and theme switch.
  await page.reload();
  await page.waitForFunction(() => window.__adg?.ready && document.querySelector('.annotation-point'));
  const afterReload = await readPointOffset();
  assert.ok(Math.abs(afterReload.dx - beforeMove.dx) < 1 && Math.abs(afterReload.dy - beforeMove.dy) < 1);

  await page.locator('#plus').click();
  await page.waitForFunction(() => window.__adg?.ready);
  const afterZoom = await readPointOffset();
  assert.ok(Math.abs(afterZoom.dx - beforeMove.dx) < 1 && Math.abs(afterZoom.dy - beforeMove.dy) < 1);

  await page.locator('#more').click();
  await page.locator('#themes button[data-theme="light"]').click();
  await page.waitForFunction(() => window.__adg?.ready && document.documentElement.dataset.theme === 'light' && document.querySelector('.annotation-point'));
  const afterTheme = await readPointOffset();
  assert.ok(Math.abs(afterTheme.dx - beforeMove.dx) < 1 && Math.abs(afterTheme.dy - beforeMove.dy) < 1);

  // Edit fixture to move ActionButton by (+160, +80) inside the frame -> note follows automatically!
  const surfaceFile = path.join(design, 'surfaces/workspace.tsx');
  const originalSource = await readFile(surfaceFile, 'utf8');
  await writeFile(surfaceFile, originalSource.replace('marginLeft: 12, marginTop: 16', 'marginLeft: 172, marginTop: 96'));
  await page.waitForFunction(prev => {
    const pt = document.querySelector('.annotation-point');
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    if (!pt || !item || !window.__adg?.ready) return false;
    const v = window.__adg.view;
    const dx = (parseFloat(pt.style.left) - (v.x + (item.x + 16) * v.scale)) / v.scale;
    return Math.abs(dx - (prev.dx + 160)) < 2;
  }, beforeMove);
  const afterElementMove = await readPointOffset();
  assert.ok(Math.abs(afterElementMove.dx - (beforeMove.dx + 160)) < 2);
  assert.ok(Math.abs(afterElementMove.dy - (beforeMove.dy + 80)) < 2);
  assert.equal(await page.locator('.annotation-card').getAttribute('data-stale'), 'false');

  // Remove ActionButton -> note marks stale, falls back to original frame point, and stays in panel list!
  await writeFile(
    surfaceFile,
    `import { Frame } from 'adg';
export default () => [
  <Frame name="ready" width={420} height={240}>
    <main class="w-[420px] h-[240px] p-6 bg-[var(--surface)] text-[var(--text)]">
      <p data-adg-id="status-tag">Only status left</p>
    </main>
  </Frame>,
];
`,
  );
  await page.waitForFunction(() => document.querySelector('.annotation-card')?.dataset.stale === 'true');
  assert.equal(await page.locator('.annotation-point').getAttribute('data-stale'), 'true');
  await page.locator('#annotate').click();
  await page.locator('#annotations-panel:not([hidden])').waitFor();
  assert.equal(await page.locator('#annotations-panel .annotation-row').getAttribute('data-stale'), 'true');
  assert.match(await page.locator('#annotations-panel .annotation-row').textContent(), /stale/i);
  assert.deepEqual(pageErrors, []);
});

test('browser check 4, 5, 6 & 7: live CLI updates within 5s, card & menu lifecycle, list filters, overview badges, keyboard menu and agent prompt', { timeout: 90000 }, async t => {
  const { launch } = await import('../src/toolkit/browser.mjs');
  const { root, design, state } = await makeSyntheticProject(t);
  const server = await startServer({ directory: design, stateDirectory: state });
  t.after(() => server.close());
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(server.url).origin });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));

  await page.goto(server.url + '?scope=all');
  await page.waitForFunction(() => window.__adg?.ready);

  // Zoom into ready frame so scale >= 0.45.
  await page.evaluate(() => {
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    document.querySelector('.gallery-viewport').dispatchEvent(new MouseEvent('dblclick', {
      clientX: v.x + (item.x + 40) * v.scale,
      clientY: v.y + (item.y + 40) * v.scale,
      bubbles: true,
    }));
  });
  await page.waitForFunction(() => window.__adg?.ready && window.__adg.view.scale >= 0.5);

  // Click an element on ready frame, then operate context menu 100% by keyboard (Check 6).
  const clickTarget = await page.evaluate(() => {
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    return { x: v.x + (item.x + 16 + 70) * v.scale, y: v.y + (item.y + 16 + 52) * v.scale };
  });
  await page.mouse.click(clickTarget.x, clickTarget.y);
  await page.waitForFunction(() => window.__adg.selection.element?.export === 'ActionButton');

  // Open context menu via Shift+F10, test Escape restores focus to .gallery-viewport.
  await page.keyboard.press('Shift+F10');
  await page.locator('#context-menu:popover-open').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Annotate here');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#context-menu:popover-open'));
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.gallery-viewport')), true);

  // Open via ContextMenu key, ArrowDown -> Copy element reference -> Enter.
  await page.keyboard.press('ContextMenu');
  await page.locator('#context-menu:popover-open').waitFor();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Copy element reference');
  await page.keyboard.press('Enter');
  const copiedRef = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copiedRef.includes('\n'), false);
  assert.match(copiedRef, /source=design\/surfaces\/workspace\.tsx/);
  assert.match(copiedRef, /export=design\/components\/action\.tsx#ActionButton/);
  assert.match(copiedRef, /frame="ready"/);
  assert.match(copiedRef, /element=e1_/);

  // Create Note #1 via keyboard Shift+F10 -> Enter on Annotate here -> Shift+Enter newline -> Enter save.
  await page.keyboard.press('Shift+F10');
  await page.locator('#context-menu:popover-open').waitFor();
  await page.keyboard.press('Enter');
  const noteInput = page.getByRole('textbox', { name: 'Annotation note' });
  await noteInput.waitFor();
  await noteInput.type('Line one');
  await noteInput.press('Shift+Enter');
  await noteInput.type('Line two');
  await noteInput.press('Enter');
  await page.locator('.annotation-card').waitFor();
  assert.equal(await page.locator('.annotation-note').textContent(), 'Line one\nLine two');

  // Also add a second note on 'secondary' frame via API so we can test multi-frame callouts, panel filters & navigation.
  const allRows = await annotations(root, state);
  const note1 = allRows[0];
  await fetch(new URL('api/annotations', server.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', source: 'surfaces/workspace.tsx', frame: 'secondary', x: 0.4, y: 0.4, note: 'Secondary spacing note' }),
  });

  // Check 4: Run `adg annotations address <id> --message=...` from CLI and verify open viewer updates in < 5s without reload!
  const addressStart = performance.now();
  const cliAddress = await runCli(['annotations', 'address', note1.id, '--message=Fixed line-height and padding', `--state-dir=${state}`], root);
  assert.equal(cliAddress.code, 0);
  await page.waitForFunction(
    id => {
      const card = document.querySelector(`.annotation-card[data-annotation-id="${id}"]`);
      return card?.dataset.state === 'addressed' && card.textContent.includes('Fixed line-height and padding');
    },
    note1.id,
    { timeout: 4500 },
  );
  assert.ok(performance.now() - addressStart < 5000, 'CLI write must update open viewer within 5 s');

  // Reopen from card, address again via CLI, then Resolve from card.
  await page.locator(`.annotation-card[data-annotation-id="${note1.id}"]`).getByRole('button', { name: 'Reopen', exact: true }).click();
  await page.waitForFunction(id => document.querySelector(`.annotation-card[data-annotation-id="${id}"]`)?.dataset.state === 'open', note1.id);

  await runCli(['annotations', 'address', note1.id, '--message=Re-verified in dark theme', `--state-dir=${state}`], root);
  await page.waitForFunction(id => document.querySelector(`.annotation-card[data-annotation-id="${id}"]`)?.dataset.state === 'addressed', note1.id, { timeout: 4500 });

  await page.locator(`.annotation-card[data-annotation-id="${note1.id}"]`).getByRole('button', { name: 'Resolve', exact: true }).click();
  // Resolved notes disappear from canvas but stay in #annotations-panel!
  await page.waitForFunction(id => !document.querySelector(`.annotation-card[data-annotation-id="${id}"]`), note1.id);

  // Open #annotations-panel, verify filters, reopen via context menu, and resolve via context menu.
  await page.locator('#annotate').click();
  await page.locator('#annotations-panel:not([hidden])').waitFor();
  assert.equal(await page.locator('#annotations-panel .annotation-row').count(), 2);

  await page.locator('#annotations-panel [data-filter-status="resolved"]').click();
  assert.equal(await page.locator('#annotations-panel .annotation-row').count(), 1);
  // Right-click resolved row in panel -> Reopen via Note context menu!
  await page.locator('#annotations-panel .annotation-row').click({ button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  await page.getByRole('menuitem', { name: 'Reopen', exact: true }).click();
  await page.waitForFunction(id => document.querySelector(`.annotation-card[data-annotation-id="${id}"]`)?.dataset.state === 'open', note1.id);

  // Right-click card on canvas -> Copy as agent prompt (Check 7), then Resolve from context menu!
  await page.locator(`.annotation-card[data-annotation-id="${note1.id}"]`).click({ button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  await page.getByRole('menuitem', { name: 'Copy as agent prompt', exact: true }).click();
  const promptText = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(promptText.includes(root));
  assert.ok(promptText.includes('Line one\nLine two'));
  assert.ok(promptText.includes('design/surfaces/workspace.tsx'));
  assert.ok(promptText.includes('ActionButton'));
  assert.ok(promptText.includes(`adg annotations read ${note1.id} --json`));
  assert.ok(promptText.includes(`adg annotations reply ${note1.id}`));
  assert.ok(promptText.includes(`adg annotations address ${note1.id}`));

  // Filter panel to All, click Note #2 ('secondary' frame) to navigate camera and highlight it (Check 5).
  await page.locator('#annotations-panel [data-filter-status="all"]').click();
  assert.equal(await page.locator('#annotations-panel .annotation-row').count(), 2);
  await page.locator('#annotations-panel .annotation-row').nth(1).click();
  await page.waitForFunction(() => window.__adg?.ready && window.__adg.selection.frame === 'secondary');
  assert.equal(await page.locator('.annotation-card[data-highlighted="true"]').count(), 1);

  // Scope filter: Current frame shows only 'secondary' (1 row).
  await page.locator('#annotations-panel [data-filter-scope="frame"]').click();
  assert.equal(await page.locator('#annotations-panel .annotation-row').count(), 1);
  await page.locator('#annotations-panel [data-filter-scope="all"]').click();

  // Panel "Copy open annotations as agent prompt" copies both open notes!
  await page.locator('#copy-open-annotations').click();
  const batchPrompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(batchPrompt.includes('annotations (2)'));
  assert.ok(batchPrompt.includes('Line one\nLine two'));
  assert.ok(batchPrompt.includes('Secondary spacing note'));

  // Zoom out below 0.45 -> overview count badges appear on frames with open/addressed notes, clicking zooms in!
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) document.querySelector('#minus').click();
  });
  await page.waitForFunction(() => window.__adg?.ready && window.__adg.view.scale < 0.45);
  assert.equal(await page.locator('.annotation-card').count(), 0);
  assert.ok((await page.locator('.annotation-frame-badge').count()) >= 1);
  await page.locator('.annotation-frame-badge[data-frame="ready"]').click();
  await page.waitForFunction(() => window.__adg?.ready && window.__adg.view.scale >= 0.45 && document.querySelectorAll('.annotation-card').length >= 1);

  // Reply from card as user, then Resolve Note #1 via right-click context menu on its point.
  await page.locator(`.annotation-card[data-annotation-id="${note1.id}"]`).getByRole('button', { name: 'Reply', exact: true }).click();
  const replyInput = page.getByRole('textbox', { name: 'Reply message' });
  await replyInput.waitFor();
  await replyInput.fill('Looks good, thanks!');
  await replyInput.press('Enter');
  await page.waitForFunction(id => document.querySelector(`.annotation-card[data-annotation-id="${id}"]`)?.textContent.includes('Looks good, thanks!'), note1.id);

  await page.locator(`.annotation-point[data-annotation-id="${note1.id}"]`).click({ button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  await page.getByRole('menuitem', { name: 'Resolve', exact: true }).click();
  await page.waitForFunction(id => !document.querySelector(`.annotation-point[data-annotation-id="${id}"]`), note1.id);

  // Verify Element menu Inspector actions ('Select owning component' & 'Show usages'), Frame-no-element menu, and Empty-canvas menu.
  const elScreen = await page.evaluate(() => {
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    return { x: v.x + (item.x + 16 + 70) * v.scale, y: v.y + (item.y + 16 + 52) * v.scale };
  });
  await page.mouse.click(elScreen.x, elScreen.y, { button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  await page.getByRole('menuitem', { name: 'Select owning component', exact: true }).click();
  await page.locator('#source:not([hidden])').waitFor();
  assert.equal(await page.locator('#forms-heading').textContent(), 'Frames using this export');
  assert.equal(await page.locator('#forms .frame-row').count(), 2);

  await page.mouse.click(elScreen.x, elScreen.y, { button: 'right' });
  await page.locator('#context-menu:popover-open').waitFor();
  await page.getByRole('menuitem', { name: 'Show usages', exact: true }).click();
  assert.ok((await page.locator('#used-by .relationship-row').count()) >= 1);

  // Frame, no element: select frame only, press Shift+F10, verify exact items.
  await page.evaluate(() => {
    const item = window.__adg.items.find(i => i.id === 'surfaces/workspace.tsx#0');
    const v = window.__adg.view;
    // Click frame label / margin crop area where part hits without element:
    document.querySelector('.gallery-viewport').dispatchEvent(new MouseEvent('contextmenu', {
      clientX: v.x + (item.x + 4) * v.scale,
      clientY: v.y + (item.y + 4) * v.scale,
      bubbles: true,
      cancelable: true,
    }));
  });
  await page.locator('#context-menu:popover-open').waitFor();
  assert.deepEqual(
    await page.locator('#context-menu [role="menuitem"]').allTextContents(),
    ['Annotate frame', 'Copy frame name', 'Copy source path', 'Show in Inspector', 'Fit frame', 'Copy open annotations as agent prompt'],
  );
  await page.keyboard.press('Escape');

  // Empty canvas: clear selection, press Shift+F10, verify exact items.
  await page.evaluate(() => {
    document.querySelector('.gallery-viewport').dispatchEvent(new MouseEvent('contextmenu', {
      clientX: 4,
      clientY: 4,
      bubbles: true,
      cancelable: true,
    }));
  });
  await page.locator('#context-menu:popover-open').waitFor();
  assert.deepEqual(
    await page.locator('#context-menu [role="menuitem"]').allTextContents(),
    ['Fit all', 'Arrange current group'],
  );
  await page.keyboard.press('Escape');

  assert.deepEqual(pageErrors, []);
});

test('hub proxies annotation writes and shares standalone project storage', async t => {
  const { startHub } = await import('../src/hub.mjs');
  const { addRoot, listProjects } = await import('../src/hub/registry.mjs');
  const state = await mkdtemp(path.join(tmpdir(), 'adg-annotation-hub-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const consumer = path.join(state, 'consumer');
  await mkdir(path.join(consumer, 'design'), { recursive: true });
  await writeFile(path.join(consumer, 'adg.config.mjs'), 'export default {}');
  await addRoot(consumer, 0, state);
  const project = (await listProjects(state))[0];
  assert.ok(project);
  const hub = await startHub({ port: 0, stateDirectory: state });
  t.after(() => hub.close());
  const response = await fetch(new URL(`p/${project.slug}/api/annotations`, hub.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', source: 'components/button.tsx', frame: 'primary', note: 'Hub note', x: 0.1, y: 0.2 }),
  });
  assert.equal(response.status, 200);
  assert.equal((await annotations(project.path, state))[0].note, 'Hub note');
  const denied = await fetch(new URL(`p/${project.slug}/api/annotations`, hub.url), { headers: { 'X-Forwarded-Host': 'example.test' } });
  assert.equal(denied.status, 401);
});
