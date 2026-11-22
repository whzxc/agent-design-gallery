import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { loadConfig } from '../src/toolkit/config.mjs';
import { implementationTexts } from '../src/toolkit/document.mjs';
import { review } from '../src/toolkit/review.mjs';
import { prepareAtlas } from './hub-compare.mjs';
import { prepareMotionCompare } from './review-motion.mjs';

const motionFixtures = new Set(['standalone-motion-review', 'standalone-motion-card']);
const embedFixtures = new Set(['embed-review-codex', 'embed-review-antigravity', 'embed-review-zoom']);
export const reviewFixtures = new Set(['standalone-review', 'standalone-review-zoom', ...motionFixtures, ...embedFixtures]);

export async function startReviewFixture(port, directory, name) {
  const project = motionFixtures.has(name) ? await prepareMotionCompare(directory) : await prepareAtlas(directory);
  const output = path.join(directory, 'review.html');
  const embed = embedFixtures.has(name);
  const codex = name === 'embed-review-codex';
  await review(await loadConfig(project), { base: 'HEAD~1', theme: 'dark', json: true, out: output,
    ...(embed ? { format: 'embed', target: codex ? 'codex' : 'antigravity' } : {}),
    'viewer-url': `http://127.0.0.1:${port}/p/atlas/` });
  const artifact = await readFile(output, 'utf8');
  const document = codex
    ? `<!doctype html><meta charset="utf-8"><style>body{margin:8px}</style><script>window.openai={sendFollowUpMessage:async()=>{}}</script>${artifact}`
    : artifact;
  const server = createServer((request, response) => {
    if (request.url !== '/') { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(document);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
}

export async function readyReviewFixture(page, name) {
  if (embedFixtures.has(name)) {
    await page.locator('[data-embed-card] .specimen:visible').first().waitFor();
    if (name === 'embed-review-zoom') await page.getByRole('button', { name: 'Enlarge Primary', exact: true }).click();
    return;
  }
  if (motionFixtures.has(name)) {
    await page.getByRole('button', {name:'Play after'}).waitFor();
    return;
  }
  if (name === 'standalone-review-zoom') {
    await page.getByRole('button', { name: 'Enlarge Primary', exact: true }).click();
    await page.getByRole('button', { name: 'After', exact: true }).click();
    await page.getByRole('button', { name: '100%', exact: true }).click();
  }
  await page.waitForFunction(() => document.querySelector('#direct [data-card]')?.dataset.ready === 'true');
}

export async function reviewFixtureTexts(page) {
  const zoom = page.locator('#embed-zoom[open]');
  const frames = await (await zoom.count() ? zoom : page).locator('.specimen review-document:visible').all();
  const samples = await Promise.all(frames.map(frame => frame.evaluate(implementationTexts)));
  const clips = await Promise.all(frames.map(frame => frame.evaluate(el => {
    const layer = el.getRootNode().host?.closest('.curtain-layer');
    if (!layer) return null;
    const { left, width } = layer.getBoundingClientRect();
    const split = layer.closest('.curtain').querySelector('input').valueAsNumber;
    return { side: layer.dataset.side, x: scrollX + left + width * split / 100 };
  })));
  return samples.flatMap(({ box, texts }, index) => {
    const clip = clips[index];
    return texts
      .filter(({ x, width }) => !clip || (clip.side === 'before' ? box.x + x + width <= clip.x + .5 : box.x + x >= clip.x - .5))
      .map(({ x, y, ...text }) => ({ ...text, x: box.x + x, y: box.y + y }));
  });
}
