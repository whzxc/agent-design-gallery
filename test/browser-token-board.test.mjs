import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const tokens = `:root {
  --font-ui: system-ui;
  --font-mono: monospace;
  --canvas: #f1f2f3;
  --surface: #fefdfc;
  --text: #123456;
  --radius-card: 12px;
  --control-height: 2400px;
}
:root[data-theme="dark"] {
  --canvas: #112233;
  --surface: #223344;
  --text: #ddeeff;
}`;

async function viewer(t, { assets = true } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-token-browser-'));
  let server, browser;
  t.after(async () => {
    try {
      await browser?.close();
    } finally {
      try {
        await server?.close();
      } finally {
        await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    }
  });
  await writeFile(path.join(directory, 'tokens.css'), tokens);
  if (assets) {
    await mkdir(path.join(directory, 'components'));
    await writeFile(path.join(directory, 'components/button.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="48"><rect width="120" height="48" fill="#123456"/></svg>');
  }
  server = await startServer({ directory, stateDirectory: path.join(directory, 'state') });
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, [], 'viewer must not raise page errors'));
  return { page, directory, server };
}

async function settled(page, scope) {
  await page.waitForFunction(scope => window.__adg?.ready && window.__adg.scope === scope, scope);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function toggleTheme(page, theme) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator(`#themes [data-theme="${theme}"]`).click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme && window.__adg.ready, theme);
}

async function toggleList(page) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator('#token-list-toggle').click();
  await page.getByRole('button', { name: 'More', exact: true }).click();
}

test('Tokens board measures unscaled DOM height and preserves camera and list choice on save and theme change', { timeout: 30000 }, async t => {
  const { page, directory, server } = await viewer(t);
  const previewRequests = [];
  page.on('request', request => {
    if (/^\/(?:asset|preview|metadata)\//.test(new URL(request.url()).pathname)) previewRequests.push(request.url());
  });
  await page.goto(server.url + '?scope=tokens');
  await settled(page, 'tokens');
  assert.deepEqual(previewRequests, [], 'Tokens board must not request or decode specimen previews');
  const board = page.locator('[data-adg-board]');
  assert.equal(await board.count(), 1);
  const height = await board.evaluate(node => node.offsetHeight);
  assert.ok(height > 2400);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await settled(page, 'tokens');
  const camera = await page.evaluate(() => window.__adg.view);
  const rect = await board.boundingBox();
  assert.ok(Math.abs(rect.height / camera.scale - height) < 1, 'board height stays in world pixels at every zoom');
  const revision = await page.evaluate(() => window.__adg.revision);
  await writeFile(path.join(directory, 'tokens.css'), tokens.replace('2400px', '2600px'));
  await page.waitForFunction(revision => window.__adg.ready && window.__adg.revision > revision, revision);
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera, 'saving tokens preserves camera');
  assert.ok(await board.evaluate(node => node.offsetHeight) > height);
  await toggleTheme(page, 'dark');
  await settled(page, 'tokens');
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera, 'theme change preserves camera');
  assert.equal(await board.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(34, 51, 68)');
  await toggleList(page);
  assert.equal(await page.locator('#token-catalog').isVisible(), true);
  await toggleTheme(page, 'light');
  await settled(page, 'tokens');
  assert.equal(await page.locator('#token-catalog').isVisible(), true, 'theme change preserves list view');
  const listRevision = await page.evaluate(() => window.__adg.revision);
  await writeFile(path.join(directory, 'tokens.css'), tokens.replace('2400px', '2800px'));
  await page.waitForFunction(revision => window.__adg.ready && window.__adg.revision > revision, listRevision);
  assert.equal(await page.locator('#token-catalog').isVisible(), true, 'saving tokens preserves list view');
});

test('All mode stacks specimens below measured Tokens board and keeps camera on token resize', { timeout: 30000 }, async t => {
  const { page, directory, server } = await viewer(t);
  await page.goto(server.url + '?scope=all');
  await settled(page, 'all');
  const board = page.locator('[data-adg-board]');
  const height = await board.evaluate(node => node.offsetHeight);
  const y = await page.locator('.chapter-board').evaluate(node => parseFloat(node.style.top));
  assert.equal(y, height + 480);
  assert.ok((await page.evaluate(() => window.__adg.items[0].y)) > y);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await settled(page, 'all');
  const camera = await page.evaluate(() => window.__adg.view);
  const revision = await page.evaluate(() => window.__adg.revision);
  await writeFile(path.join(directory, 'tokens.css'), tokens.replace('2400px', '2700px'));
  await page.waitForFunction(revision => window.__adg.ready && window.__adg.revision > revision, revision);
  await settled(page, 'all');
  assert.equal(await page.locator('.chapter-board').evaluate(node => parseFloat(node.style.top)), await board.evaluate(node => node.offsetHeight) + 480);
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera, 'All mode token resize preserves camera');
  await toggleTheme(page, 'dark');
  await settled(page, 'all');
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera);
  assert.equal(await page.locator('#board-chrome').evaluate(node => getComputedStyle(node).getPropertyValue('--surface').trim()), '#223344');
});

test('All mode with only tokens hides the empty state', { timeout: 30000 }, async t => {
  const { page, server } = await viewer(t, { assets: false });
  await page.goto(server.url + '?scope=all');
  await settled(page, 'all');
  assert.equal(await page.locator('[data-adg-board]').isVisible(), true);
  assert.equal(await page.locator('#empty').isVisible(), false);
});

test('returning from Tokens restores the All camera after its board measurement', { timeout: 30000 }, async t => {
  const { page, server } = await viewer(t);
  await page.goto(server.url + '?scope=tokens');
  await settled(page, 'tokens');
  await toggleList(page);
  await page.getByRole('tab', { name: 'All designs', exact: true }).click();
  await settled(page, 'all');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await settled(page, 'all');
  const camera = await page.evaluate(() => window.__adg.view);
  await page.getByRole('tab', { name: 'Tokens', exact: true }).click();
  await settled(page, 'tokens');
  await page.getByRole('tab', { name: 'All designs', exact: true }).click();
  await settled(page, 'all');
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera);
  await page.reload();
  await settled(page, 'all');
  assert.deepEqual(await page.evaluate(() => window.__adg.view), camera, 'cold All measurement preserves the saved camera');
});
