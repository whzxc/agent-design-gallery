import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { buildReview } from '../public/review.js';

async function viewer(t, { savedTheme, colorScheme = 'dark' } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-review-browser-'));
  let server, browser;
  const pending = [];
  t.after(async () => {
    for (const request of pending) request.resolve({ error: 'Test finished' });
    await browser?.close();
    await server?.close();
    await rm(directory, { recursive: true, force: true });
  });
  await writeFile(path.join(directory, 'sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>');
  server = await startServer({ directory, stateDirectory: path.join(directory, 'state') });
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript(savedTheme => {
    if (savedTheme) localStorage.setItem('adg-theme', savedTheme);
    // Deliver live updates deterministically without the server's initial SSE message.
    window.EventSource = class extends EventTarget {
      constructor() { super(); window.reviewEvents = this; }
      close() {}
    };
  }, savedTheme);
  await page.route('**/review?*', async route => {
    let resolve;
    const result = new Promise(done => { resolve = done; });
    const theme = new URL(route.request().url()).searchParams.get('theme');
    pending.push({ resolve, theme });
    const payload = await result;
    await route.fulfill({ status: payload.error ? 500 : 200, json: payload }).catch(() => {});
  });
  const manifestRequests = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/manifest') manifestRequests.push(request.url());
  });
  await page.goto(server.url + '?base=HEAD');
  async function request(index) {
    await page.waitForFunction(() => document.querySelector('#review-page')?.getAttribute('aria-busy') === 'true');
    // Request interception runs in Node, so await its count through the event loop.
    const deadline = Date.now() + 5000;
    while (!pending[index]) {
      assert.ok(Date.now() < deadline, `review request ${index} must start`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return pending[index];
  }
  function response(theme, revision = 1, count = 12) {
    const comparisons = Array.from({ length: count }, (_, index) => ({
      id: `${theme}-${index}`, source: 'design/components/sample.tsx', frame: `sample-${index}`,
      status: 'matched', theme, verdict: 'changed', pixels: { differentPixels: revision },
    }));
    return {
      directory, scope: 'review', label: 'Review Demo', layers: ['components'],
      revision, theme: 'system', assets: [],
      review: buildReview({ project: directory, base: { rev: 'HEAD', sha: 'abc123' }, complete: true, comparisons }, new Map(), { label: 'Review Demo' }),
    };
  }
  async function settle(request, revision = 1, count = 12) {
    request.resolve(response(request.theme, revision, count));
    await page.waitForFunction(revision => window.__adg?.ready && window.__adg.revision === revision, revision);
    assert.equal(await page.locator('#review-page').getAttribute('aria-busy'), 'false');
    assert.equal(await page.locator('.review-progress').count(), 0);
  }
  async function switchTheme(theme) {
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.locator(`#themes [data-theme="${theme}"]`).click();
    await page.getByRole('button', { name: 'More', exact: true }).click();
  }
  async function refresh() {
    await page.evaluate(() => window.reviewEvents.onmessage({ data: JSON.stringify({ revision: Date.now() }) }));
  }
  return { page, request, response, settle, switchTheme, refresh, pending, manifestRequests };
}

test('review shows immediate chrome and progress, requests the current theme, and loads the other on switch', { timeout: 30000 }, async t => {
  const { page, request, settle, switchTheme, pending, manifestRequests } = await viewer(t);
  const first = await request(0);
  assert.equal(first.theme, 'dark');
  assert.equal(await page.locator('#app-bar').isVisible(), true);
  assert.equal(await page.locator('#tools').isVisible(), true);
  assert.equal(await page.getByRole('tab', { name: 'Review', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#review-title').textContent(), 'Design review');
  assert.equal(await page.getByRole('progressbar', { name: 'Review progress' }).isVisible(), true);
  assert.equal(await page.locator('.review-progress').textContent(), 'Loading dark review…');
  assert.deepEqual(await page.evaluate(() => [window.__adg.ready, window.__adg.metadataComplete]), [false, false]);
  const progressMark = await page.evaluate(() => performance.getEntriesByName('adg-review-progress', 'mark').map(entry => entry.startTime));
  assert.equal(progressMark.length, 1);
  assert.deepEqual(await page.evaluate(() => performance.getEntriesByName('adg-review-content', 'mark')), []);
  await settle(first);
  const contentMark = await page.evaluate(() => performance.getEntriesByName('adg-review-content', 'mark').map(entry => entry.startTime));
  assert.equal(contentMark.length, 1);
  assert.ok(contentMark[0] >= progressMark[0]);
  assert.deepEqual(pending.map(request => request.theme), ['dark']);
  assert.equal(await page.locator('[data-theme-row="dark"]').count(), 12);
  assert.equal(await page.locator('[data-theme-row="light"]').count(), 0);
  assert.deepEqual(manifestRequests, []);

  await switchTheme('light');
  const light = await request(1);
  assert.equal(light.theme, 'light');
  assert.equal(await page.locator('[data-theme-row="dark"]').count(), 12);
  assert.equal(await page.locator('.review-progress').textContent(), 'Updating light review…');
  assert.equal(await page.evaluate(() => window.__adg.ready), false);
  await settle(light, 2);
  assert.deepEqual(await page.evaluate(() => performance.getEntriesByName('adg-review-progress', 'mark').map(entry => entry.startTime)), progressMark);
  assert.deepEqual(await page.evaluate(() => performance.getEntriesByName('adg-review-content', 'mark').map(entry => entry.startTime)), contentMark);
  assert.equal(await page.locator('[data-theme-row="light"]').count(), 12);
  assert.equal(await page.locator('[data-theme-row="dark"]').count(), 0);
  await switchTheme('light');
  assert.equal(pending.length, 2, 'selecting the current theme must not issue another review request');

  await page.reload();
  const reloaded = await request(2);
  assert.equal(await page.evaluate(() => performance.getEntriesByName('adg-review-progress', 'mark').length), 1);
  assert.equal(await page.evaluate(() => performance.getEntriesByName('adg-review-content', 'mark').length), 0);
  await settle(reloaded, 3);
  assert.equal(await page.evaluate(() => performance.getEntriesByName('adg-review-content', 'mark').length), 1);
});

test('review refresh preserves result nodes and scroll, recovers from failure, and keeps busy through queued updates', { timeout: 30000 }, async t => {
  const { page, request, settle, refresh, response } = await viewer(t);
  await settle(await request(0));
  await page.waitForFunction(() => !!window.reviewEvents);
  await page.evaluate(() => {
    window.previousReviewFrame = document.querySelector('.review-frame');
    document.querySelector('.review-scroll').scrollTop = 400;
  });
  await refresh();
  const failed = await request(1);
  assert.deepEqual(await page.evaluate(() => ({
    retained: window.previousReviewFrame === document.querySelector('.review-frame'),
    scroll: document.querySelector('.review-scroll').scrollTop,
    ready: window.__adg.ready,
    metadataComplete: window.__adg.metadataComplete,
  })), { retained: true, scroll: 400, ready: false, metadataComplete: false });
  failed.resolve({ error: 'Review capture failed' });
  await page.getByRole('alert').filter({ hasText: 'Review capture failed' }).waitFor();
  await page.waitForFunction(() => document.querySelector('#review-page').getAttribute('aria-busy') === 'false');
  assert.equal(await page.evaluate(() => window.previousReviewFrame === document.querySelector('.review-frame')), true);

  await refresh();
  await settle(await request(2), 2);
  assert.equal(await page.locator('.review-scroll').evaluate(element => element.scrollTop), 400);

  await refresh();
  const superseded = await request(3);
  await refresh();
  const latest = await request(4);
  superseded.resolve(response('dark', 8, 1));
  assert.equal(await page.getByRole('progressbar').isVisible(), true);
  assert.equal(await page.locator('.review-frame').count(), 12);
  await settle(latest, 9, 2);
  assert.equal(await page.locator('.review-frame').count(), 2);
  assert.equal(await page.locator('#error').isVisible(), false);
});

test('saved theme and system appearance changes drive review requests even before the first result', { timeout: 30000 }, async t => {
  const { page, request, settle, switchTheme, response, pending } = await viewer(t, { savedTheme: 'light' });
  const light = await request(0);
  assert.equal(light.theme, 'light');
  await switchTheme('dark');
  const dark = await request(1);
  assert.equal(dark.theme, 'dark');
  light.resolve(response('light', 4));
  await settle(dark, 5);
  assert.equal(await page.locator('[data-theme-row="light"]').count(), 0);
  await switchTheme('system');
  assert.equal(pending.length, 2, 'system with the same effective theme must reuse the displayed result');
  await page.emulateMedia({ colorScheme: 'light' });
  const systemLight = await request(2);
  assert.equal(systemLight.theme, 'light');
  await settle(systemLight, 6);
  assert.equal(await page.evaluate(() => localStorage.getItem('adg-theme')), 'system');
});

test('initial review failure keeps navigation usable and a theme switch can retry', { timeout: 30000 }, async t => {
  const { page, request, settle, switchTheme } = await viewer(t);
  (await request(0)).resolve({ error: 'Base revision unavailable' });
  await page.getByRole('alert').filter({ hasText: 'Base revision unavailable' }).waitFor();
  assert.equal(await page.locator('#app-bar').isVisible(), true);
  assert.equal(await page.locator('#review-page').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__adg.ready), false);
  assert.equal(await page.locator('.review-progress').count(), 0);
  await switchTheme('light');
  await settle(await request(1));
  assert.equal(await page.locator('#error').isVisible(), false);
});
