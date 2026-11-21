import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { loadConfig } from '../src/toolkit/config.mjs';
import { implementationTexts } from '../src/toolkit/document.mjs';
import { review } from '../src/toolkit/review.mjs';
import { prepareAtlas } from './hub-compare.mjs';
import { prepareMotionCompare } from './review-motion.mjs';

const motionFixtures = new Set(['standalone-motion-review', 'standalone-motion-card']);
export const reviewFixtures = new Set(['standalone-review', 'standalone-review-zoom', ...motionFixtures]);

export async function startReviewFixture(port, directory, name) {
  const project = motionFixtures.has(name) ? await prepareMotionCompare(directory) : await prepareAtlas(directory);
  const output = path.join(directory, 'review.html');
  await review(await loadConfig(project), { base: 'HEAD~1', theme: 'dark', json: true, out: output,
    'viewer-url': `http://127.0.0.1:${port}/p/atlas/` });
  const document = await readFile(output);
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
  const frames = await page.locator('.specimen review-document').all();
  const samples = await Promise.all(frames.map(frame => frame.evaluate(implementationTexts)));
  return samples.flatMap(({ box, texts }) => texts.map(({ x, y, ...text }) => ({ ...text, x: box.x + x, y: box.y + y })));
}
