import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { implementationTexts } from './src/toolkit/document.mjs';
import { startServer } from './src/server.mjs';
import { states, recent, assetModifiedAt } from './fixtures/viewer.mjs';
import { commentFile } from './src/comments.mjs';
import { loadConfig } from './src/toolkit/config.mjs';
import recentPeriods from './design/fixtures/recent-updates.json' with { type: 'json' };
import comments from './design/fixtures/comments.json' with { type: 'json' };
import { hubFixtures, readyFixtureHub, startFixtureHub } from './fixtures/hub-compare.mjs';
import { readyReviewFixture, reviewFixtureTexts, reviewFixtures, startReviewFixture } from './fixtures/review-compare.mjs';

const clock = '2026-01-01T00:00:00Z';
const fixtureStates = {
  ...states,
  [comments.commentCanvas.fixture]: { ...states['scope-layer'], sidebar: false, camera: 'origin', origin: [48, 100], scale: 2 },
};
export const playerFixtureURL='/?asset=modules%2Fproject-switcher.tsx&frame=project-picker';
export const playbackFixture = (name) => /^(?:recent-updates-|flow-|board-play-|board-playable-|board-frame-filters$)/.test(name);
export const playbackURL = (name) =>
  name.startsWith('flow-') ? playerFixtureURL : '/?fixture=' + encodeURIComponent(name);
async function readyPlayback(page, name) {
  await page.emulateMedia({ reducedMotion: name === 'flow-reduced-motion' ? 'reduce' : 'no-preference' });
  if (!name.startsWith('flow-')) {
    await page.waitForFunction((n) => document.documentElement.dataset.fixtureReady === n, name);
    if (name === 'board-play-affordance') {
      const point = await page.evaluate(() => {
        const frame = window.__adg.items.find(item => item.path === 'modules/project-switcher.tsx');
        const view = window.__adg.view;
        return { x: view.x + (frame.x + frame.width / 2) * view.scale, y: view.y + (frame.y + frame.height / 2) * view.scale };
      });
      await page.mouse.move(point.x, point.y);
      await page.getByRole('button', { name: 'Play from project-picker', exact: true }).waitFor();
      return;
    }
    await page.locator('#filter-toggle').click();
    if (name.startsWith('recent-updates-')) {
      const head = '1'.repeat(40), branch = 'fixture';
      await page.route('**/api/recent-visit',route=>route.fulfill({json:{head,branch}}));
      await page.route('**/api/recent-state',route=>route.fulfill({json:{head,branch,generation:'fixture'}}));
      await page.evaluate(() => {
        const directory = document.querySelector('#app-directory').title;
        localStorage.setItem('adg-visit:'+JSON.stringify([directory,'fixture']),JSON.stringify({started:0,head:'2'.repeat(40)}));
      });
      await page.route('**/api/recent-updates?*',route=>{
        const since = new URL(route.request().url()).searchParams.has('since');
        const periods = recentPeriods.filter(period => !since || period.title !== 'Earlier this week');
        return route.fulfill({json:{available:true,complete:true,head,branch,generation:'fixture',periods:periods.map(p=>({...p,complete:true}))}});
      });
      await page.locator('[data-filter=recent]').click();
      await page.getByRole('heading', { name: 'Uncommitted' }).waitFor();
      if (name.endsWith('on-board')) {
        await page.getByRole('button',{name:'Since my last visit'}).click();
        await page.getByRole('heading', { name: 'Today', exact: true }).waitFor();
        await page.locator('.recent-global summary').evaluate(summary => summary.click());
        await page.getByRole('heading', { name: 'Project root', exact: true }).waitFor();
        await page.locator('.recent-source').filter({ has: page.getByRole('heading', { name: 'modules/project-switcher.tsx' }) })
          .locator('summary').evaluate(summary => summary.click());
        await page.getByText('Affected by shared input', { exact: true }).waitFor();
      }
    }
    if (name === 'board-playable-filter') await page.locator('[data-filter=playable]').click();
    if (name !== 'board-frame-filters') {
      await page.waitForFunction(() => [...document.querySelectorAll('#view-board canvas')].some(canvas => canvas.dataset.preview === 'ready'));
    }
    return;
  }
  await page.getByRole('button', { name: 'Play from project-picker', exact: true }).click();
  const player = page.locator('#motion-player');
  const scene = player.frameLocator('iframe');
  const picker = scene.locator('[data-adg-id=picker]');
  await picker.waitFor();
  if (name === 'flow-at-rest') return;
  if (['flow-playing', 'flow-paused'].includes(name)) {
    const time = new Date('2025-01-01T00:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(+time + 1000));
    await picker.evaluate((el) => el.click());
    await player.locator('[data-control=inspector]:enabled').evaluate((el) => el.click());
    await player.locator('[data-control=state]').filter({ hasText: 'Playing transition' }).waitFor();
    // Set the approved 64 ms sample directly, independent of the browser's first animation tick.
    await player.getByRole('slider').evaluate((slider) => {
      slider.value = '40';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    if (name === 'flow-playing') await player.locator('[data-control=pause]').evaluate((b) => b.click());
    return;
  }
  await picker.click();
  const current = (frame) =>
    player
      .locator('[data-control=current]')
      .filter({ hasText: new RegExp('^' + frame + '$') })
      .waitFor({ state: 'attached' });
  await current('switcher-open');
  if (name === 'flow-terminal') {
    await scene.locator('[data-adg-id=live-instance]').click();
    await current('project-picker-instance');
  }
  if (name === 'flow-reduced-motion') {
    await player.frameLocator('iframe').getByRole('searchbox').fill('Nova');
    await current('switcher-empty');
  }
  if (['flow-completed', 'flow-terminal'].includes(name)) {
    await player.locator('[data-control=flow]').click();
    if (name === 'flow-completed') await player.locator('[data-control=inspector]').click();
  }
  if (name === 'flow-settings') await player.locator('[data-control=settings]').click();
}
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
    port: Number(process.env.ADG_COMPARE_PORT ?? 5188),
    viewport: '1440x900',
    async start({ port, root }) {
      const temporary = await mkdtemp(path.join(tmpdir(), 'adg-fixture-'));
      try {
        if (playbackFixture(selectedFixture)) {
          const fixture = {theme:'light',scope:'layer:modules',group:'Project access',sidebar:false,
            camera:'origin',origin:[190,70],scale:.63};
          const server=await startServer({directory:path.join(root,'design'),port,stateDirectory:temporary,
            fixtures:selectedFixture.startsWith('flow-') ? null : {label:'agent-design-gallery',states:{[selectedFixture]:fixture},recent,assetModifiedAt}});
          return async()=>{try{await server.close();}finally{await rm(temporary,{recursive:true,force:true});}};
        }
        if (reviewFixtures.has(selectedFixture)) {
          const close = await startReviewFixture(port, temporary, selectedFixture);
          return async () => { try { await close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
        }
        if (Object.hasOwn(hubFixtures, selectedFixture)) {
          const hub = await startFixtureHub(port, temporary);
          return async () => { try { await hub.close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
        }
        const directory = path.join(root, selectedFixture === 'viewer-motion-patterns' ? 'design' : 'fixtures/arc-sample/design');
        fixtureStore = await commentFile((await loadConfig(directory)).root, temporary);
        const server = await startServer({ directory, port, stateDirectory: temporary,
          fixtures: { states: fixtureStates, recent, assetModifiedAt } });
        return async () => { try { await server.close(); } finally { await rm(temporary, { recursive: true, force: true }); } };
      } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
    },
    fixture(name) {
      selectedFixture = name;
      if (playbackFixture(name)) return {url:playbackURL(name),theme:'light',locale:'en-US',timezone:'UTC',clock};
      if (reviewFixtures.has(name)) return { url: '/', theme: 'dark', locale: 'en-US', timezone: 'UTC', clock };
      if (Object.hasOwn(hubFixtures, name)) return { url: hubFixtures[name], theme: 'light', locale: 'en-US', timezone: 'UTC', clock };
      const state = fixtureStates[name];
      if (!state) throw new Error(`Unknown ADG fixture ${name}; choose ${Object.keys(fixtureStates).join(', ')}`);
      return { url: `/?fixture=${encodeURIComponent(name)}`, theme: state.theme, locale: 'en-US', timezone: 'UTC', clock };
    },
    async texts(page) {
      if (selectedFixture?.startsWith('flow-')) {
        const iframe = page.locator('#motion-player iframe');
        const origin = await iframe.boundingBox();
        const { box, texts } = await iframe.contentFrame().locator('body').evaluate(implementationTexts);
        return texts.map(({ x, y, ...text }) => ({ ...text, x: origin.x + box.x + x, y: origin.y + box.y + y }));
      }
      return reviewFixtures.has(selectedFixture) ? reviewFixtureTexts(page) : [];
    },
    async ready(page, name) {
      if (playbackFixture(name)) return readyPlayback(page,name);
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
