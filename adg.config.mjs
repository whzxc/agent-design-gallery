import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from './src/server.mjs';
import { states, recent, assetModifiedAt, commentThreadState } from './fixtures/viewer.mjs';
import { commentFile } from './src/comments.mjs';
import { loadConfig } from './src/toolkit/config.mjs';
import comments from './design/fixtures/comments.json' with { type: 'json' };
import { hubFixtures, readyFixtureHub, startFixtureHub } from './fixtures/hub-compare.mjs';

const clock = '2026-01-01T00:00:00Z';
const fixtureStates = {
  ...states,
  [comments.commentCanvas.fixture]: commentThreadState,
};
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

export default {
  requires: '>=0.5.0',
  check: { strictLayers: true, lifecycle: true },
  compare: {
    port: 5188,
    viewport: '1440x900',
    async start({ port, root }) {
      const temporary = await mkdtemp(path.join(tmpdir(), 'adg-fixture-'));
      try {
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
      if (Object.hasOwn(hubFixtures, name)) return { url: hubFixtures[name], theme: 'light', locale: 'en-US', timezone: 'UTC', clock };
      const state = fixtureStates[name];
      if (!state) throw new Error(`Unknown ADG fixture ${name}; choose ${Object.keys(fixtureStates).join(', ')}`);
      return { url: `/?fixture=${encodeURIComponent(name)}`, theme: state.theme, locale: 'en-US', timezone: 'UTC', clock };
    },
    async ready(page, name) {
      if (Object.hasOwn(hubFixtures, name)) return readyFixtureHub(page, name);
      await page.waitForFunction(name => document.documentElement.dataset.fixtureError || document.documentElement.dataset.fixtureReady === name, name, { timeout: 15000 });
      const error = await page.evaluate(() => document.documentElement.dataset.fixtureError);
      if (error) throw new Error(`ADG fixture ${name}: ${error}`);
      const state = fixtureStates[name];
      if (name === comments.commentCanvas.fixture) await prepareCommentThread(page, state);
      if (state.tooltip || state.hoverScope) {
        await page.getByRole('button', { name: state.hoverScope ?? 'Inspector', exact: true }).hover();
        await page.getByRole('tooltip').waitFor({ state: 'visible' });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
    },
  },
};
