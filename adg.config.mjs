import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './src/server.mjs';
import { states, recent, assetModifiedAt } from './fixtures/viewer.mjs';
import { commentFile } from './src/comments.mjs';
import { loadConfig } from './src/toolkit/config.mjs';
import comments from './design/fixtures/comments.json' with { type: 'json' };
import { hubFixtures, readyFixtureHub, startFixtureHub } from './fixtures/hub-compare.mjs';
import { readyReviewFixture, reviewFixtureTexts, reviewFixtures, startReviewFixture } from './fixtures/review-compare.mjs';

const clock = '2026-01-01T00:00:00Z';
const fixtureStates = {
  ...states,
  [comments.commentCanvas.fixture]: { ...states['scope-layer'], sidebar: false, camera: 'origin', origin: [48, 100], scale: 2 },
};
export const playerFixtureURL='/?asset=modules%2Fproject-switcher.tsx&frame=project-picker';
let fixtureStore;
let selectedFixture;

async function prepareCommentThread(page, state) {
  const { clip, pin } = comments.commentCanvas;
  const { number, target, messages } = comments.commentExample;
  const [left, top] = state.origin;
  const first = '2025-12-31T23:58:00Z', second = '2025-12-31T23:59:00Z';
  const thread = {
    id: 'fixture-thread', number, status: 'open', revision: null,
    anchor: { kind: 'chapter', source: null, frame: null, layer: 'components', chapter: state.group, element: null,
      x: (clip.x + pin.x - left) / state.scale, y: (clip.y + pin.y - top) / state.scale, frameX: null, frameY: null },
    target: { label: target, tag: null, text: null, owner: null, displayName: target },
    messages: [
      { id: 'fixture-message', author: { kind: 'user' }, text: messages[0].text, at: first, editedAt: null },
      { id: 'fixture-reply', author: { kind: 'agent', name: messages[1].author }, text: messages[1].text, at: second, editedAt: null },
    ],
    createdAt: first, updatedAt: second, resolvedAt: null, resolvedBy: null,
  };
  await mkdir(path.dirname(fixtureStore), { recursive: true });
  await writeFile(fixtureStore, JSON.stringify({ nextNumber: number + 1, threads: [thread] }));
  // Keep the locator click from applying the pin's hover outline in the capture.
  await page.getByRole('button', { name: `Comment #${number}, ${target}`, exact: true }).click();
  await page.mouse.move(0, 0);
  await page.getByRole('heading', { name: `#${number} ${target}`, exact: true }).waitFor();
}

async function prepareBoardComments(page, state) {
  const { commentExample, changedExample } = comments;
  const [left, top] = state.origin;
  const first = '2025-12-31T23:58:00Z', second = '2025-12-31T23:59:00Z', older = '2025-12-31T23:46:00Z';
  const threads = [
    {
      id: 'fixture-board-open', number: commentExample.number, status: 'open', revision: null,
      anchor: { kind: 'chapter', source: null, frame: null, layer: 'components', chapter: state.group, element: null,
        x: (536 - left) / state.scale, y: (244 + 26 - top) / state.scale, frameX: null, frameY: null },
      target: { label: commentExample.target, tag: null, text: null, owner: null, displayName: commentExample.displayName },
      messages: [
        { id: 'fixture-board-m1', author: { kind: 'user' }, text: commentExample.messages[0].text, at: first, editedAt: null },
        { id: 'fixture-board-m2', author: { kind: 'agent', name: commentExample.messages[1].author }, text: commentExample.messages[1].text, at: second, editedAt: null },
      ],
      createdAt: first, updatedAt: second, resolvedAt: null, resolvedBy: null,
    },
    {
      id: 'fixture-board-changed', number: changedExample.number, status: 'open', state: 'changed', revision: null,
      anchor: { kind: 'chapter', source: null, frame: null, layer: 'components', chapter: state.group, element: null,
        x: (486 - left) / state.scale, y: (280 + 26 - top) / state.scale, frameX: null, frameY: null },
      target: { label: changedExample.target, tag: null, text: null, owner: null, displayName: null },
      messages: [
        { id: 'fixture-board-m3', author: { kind: 'user' }, text: changedExample.messages[0].text, at: older, editedAt: null },
      ],
      createdAt: older, updatedAt: older, resolvedAt: null, resolvedBy: null,
    },
  ];
  await mkdir(path.dirname(fixtureStore), { recursive: true });
  await writeFile(fixtureStore, JSON.stringify({ nextNumber: changedExample.number + 1, threads }));
  await page.getByRole('button', { name: `Comment #${commentExample.number}, ${commentExample.target}`, exact: true }).waitFor();
  await page.getByRole('button', { name: `Comment #${changedExample.number}, ${changedExample.target}, changed`, exact: true }).waitFor();
  await page.locator('#comments-toggle').click();
  await page.locator('#comment-tool').click();
  await page.mouse.move(0, 0);
  await page.locator('#comments-panel').getByText(`#${changedExample.number}`, { exact: true }).waitFor();
}

export default {
  requires: '>=0.16.0',
  check: { strictLayers: true, strictMotion: true, lifecycle: true },
  compare: {
    port: 5188,
    viewport: '1440x900',
    async start({ port, root }) {
      const temporary = await mkdtemp(path.join(tmpdir(), 'adg-fixture-'));
      try {
        if (selectedFixture === 'motion-player') {
          const server=await startServer({directory:path.join(root,'design'),port,stateDirectory:temporary});
          return async()=>{try{await server.close();}finally{await rm(temporary,{recursive:true,force:true});}};
        }
        if (reviewFixtures.has(selectedFixture)) {
          const close = await startReviewFixture(port, temporary);
          return async () => { try { await close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
        }
        if (Object.hasOwn(hubFixtures, selectedFixture)) {
          const hub = await startFixtureHub(port, temporary);
          return async () => { try { await hub.close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
        }
        const directory = path.join(root, 'fixtures/arc-sample/design');
        fixtureStore = await commentFile((await loadConfig(directory)).root, temporary);
        const server = await startServer({ directory, port, stateDirectory: temporary,
          fixtures: { states: fixtureStates, recent, assetModifiedAt } });
        return async () => { try { await server.close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
      } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
    },
    fixture(name) {
      selectedFixture = name;
      if (name === 'motion-player') return {url:playerFixtureURL,theme:'light',locale:'en-US',timezone:'UTC',clock};
      if (reviewFixtures.has(name)) return { url: '/', theme: 'dark', locale: 'en-US', timezone: 'UTC', clock };
      if (Object.hasOwn(hubFixtures, name)) return { url: hubFixtures[name], theme: 'light', locale: 'en-US', timezone: 'UTC', clock };
      const state = fixtureStates[name];
      if (!state) throw new Error(`Unknown ADG fixture ${name}; choose ${Object.keys(fixtureStates).join(', ')}`);
      return { url: `/?fixture=${encodeURIComponent(name)}`, theme: state.theme, locale: 'en-US', timezone: 'UTC', clock };
    },
    async texts(page) {
      return reviewFixtures.has(selectedFixture) ? reviewFixtureTexts(page) : [];
    },
    async ready(page, name) {
      if (name === 'motion-player') {
        await page.getByRole('button',{name:'Play',exact:true}).click();
        await page.getByRole('button',{name:'click → switcher-open',exact:true}).waitFor();
        return;
      }
      if (reviewFixtures.has(name)) return readyReviewFixture(page, name);
      if (Object.hasOwn(hubFixtures, name)) return readyFixtureHub(page, name);
      await page.waitForFunction(name => document.documentElement.dataset.fixtureError || document.documentElement.dataset.fixtureReady === name, name, { timeout: 15000 });
      const error = await page.evaluate(() => document.documentElement.dataset.fixtureError);
      if (error) throw new Error(`ADG fixture ${name}: ${error}`);
      const state = fixtureStates[name];
      if (name === comments.commentCanvas.fixture) await prepareCommentThread(page, state);
      if (name === 'viewer-board-comments') await prepareBoardComments(page, state);
      if (name === 'viewer-tokens-list') {
        if (await page.locator('#sidebar').isHidden()) await page.locator('#sidebar-toggle').click();
        const toggle = page.locator('#token-view-toggle');
        if (await toggle.isVisible()) await toggle.click();
        else { await page.locator('#more').click(); await page.locator('#token-list-toggle').click(); }
        await page.mouse.move(0, 0);
        await page.locator('#token-table').waitFor({ state: 'visible' });
      }
      if (name === 'sample-inspect-component') {
        const point = await page.evaluate(() => {
          const item = window.__adg.items.find(entry => entry.path === 'surfaces/mcp-hub.tsx');
          const view = window.__adg.view;
          return item ? { x: view.x + (item.x + 80) * view.scale, y: view.y + (item.y + 80) * view.scale } : null;
        });
        if (point) {
          await page.mouse.click(point.x, point.y);
          await page.mouse.move(0, 0);
          await page.getByText('Frames using this export', { exact: true }).waitFor();
        }
      }
      if (state.tooltip || state.hoverScope) {
        await page.getByRole('button', { name: state.hoverScope ?? 'Inspector', exact: true }).hover();
        await page.getByRole('tooltip').waitFor({ state: 'visible' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
    },
  },
};
