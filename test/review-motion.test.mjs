import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { main } from '../src/cli.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { prepareMotionReview } from '../fixtures/review-motion.mjs';

async function fixture(t, options) {
  const dir = await mkdtemp(path.join(tmpdir(), 'review-motion-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fixture = await prepareMotionReview(dir, options);
  const browser = await launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ offline: true });
  const network = [], errors = [];
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  page.on('pageerror', error => errors.push(error.message));
  async function generate(expectedExit = 0) {
    let stdout = '';
    const out = path.join(dir, 'review.html');
    const exit = await main(['review', '--json', '--base=HEAD', '--theme=light', '--out=' + out], fixture.project,
      { stdout: v => { stdout += v; }, stderr() {}, exit() {} });
    assert.equal(exit, expectedExit, stdout);
    await page.goto(pathToFileURL(out).href);
    return JSON.parse(stdout).data;
  }
  return { ...fixture, page, generate, network, errors };
}

test('review contract: a duration-token edit survives static equality and supports offline playback and seek', async t => {
  const f = await fixture(t);
  assert.equal((await f.generate()).motion, undefined);
  await f.edges([{ ...f.edge, duration: '--fast' }]);
  const receipt = await f.generate();
  assert.equal(receipt.counts.changed, 0);
  assert.deepEqual(receipt.motion, {added:0, changed:1, removed:0});
  const { page } = f;
  const card = page.getByRole('article');
  assert.match(await card.innerText(), /Direct declaration/);
  const samples = () => card.locator('.filmstrip img').evaluateAll(images => images.map(i => i.src));
  const first = await samples();
  assert.ok(first.every(src => src.startsWith('data:image/png;base64,')));
  assert.deepEqual(await card.locator('.filmstrip figcaption').allTextContents(),
    ['From 0 ms',' 70 ms',' 100 ms','To 140 ms','From 0 ms',' 40 ms','To 80 ms']);
  assert.equal(first[0], first[4]);
  assert.equal(first[3], first[6]);
  assert.notEqual(first[1], first[3]);
  await page.getByRole('button', {name:'Play before'}).click();
  await page.waitForFunction(() => document.querySelector('[data-elapsed=before]').value === '140 ms');
  await page.getByRole('slider').fill('50');
  assert.deepEqual(await card.locator('output').allTextContents(), ['70 ms', '40 ms']);
  await page.getByRole('button', {name:'Preview after'}).click();
  await page.frameLocator('iframe').getByText('Ready').first().waitFor({state:'attached'});
  assert.equal(await card.locator('iframe').count(), 1);
  assert.equal(await card.locator('iframe').getAttribute('sandbox'), 'allow-same-origin');
  await page.getByRole('button', {name:'Play after'}).click();
  await page.waitForFunction(() => document.querySelector('[data-elapsed=after]').value === '80 ms');
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.network, []);
  await f.generate();
  assert.deepEqual(await samples(), first);
});

test('review contract: resolved alias changes are inherited and coalesce with direct edits', async t => {
  const f = await fixture(t);
  await f.tokens(220);
  assert.equal((await f.generate()).motion.changed, 1);
  const card = f.page.getByRole('article');
  assert.match(await card.innerText(), /Inherited timing · --details/);
  assert.doesNotMatch(await card.innerText(), /Direct declaration/);
  await f.edges([{...f.edge, label:'Show details'}]);
  assert.equal((await f.generate()).motion.changed, 1);
  assert.match(await card.innerText(), /Direct declaration · Inherited timing/);
});

test('review contract: an unavailable historical endpoint identifies the partial side and retains current playback', async t => {
  const f = await fixture(t, {brokenBase:true});
  const receipt = await f.generate(2);
  assert.equal(receipt.complete, false);
  assert.equal(receipt.motion.changed, 1);
  assert.equal(receipt.failures[0].side, 'base');
  assert.match(await f.page.getByRole('article').innerText(), /Partial · base · design\/components\/details.tsx/);
  assert.equal(await f.page.getByRole('button', {name:'Play before'}).count(), 0);
  await f.page.getByRole('button', {name:'Play after'}).click();
  await f.page.waitForFunction(() => document.querySelector('[data-elapsed=after]').value === '140 ms');
});

test('review contract: replacing an ID keeps the removed side and the unsupported addition with its reason', async t => {
  const f = await fixture(t);
  await f.edges([{ ...f.edge, id:'jump-details', unsupported:[{effect:'spring', reason:'Gesture velocity determines timing.'}] }]);
  assert.deepEqual((await f.generate()).motion, {added:1, changed:0, removed:1});
  const [added, removed] = await f.page.getByRole('article').all();
  assert.match(await added.innerText(), /Gesture velocity determines timing/);
  assert.deepEqual(await added.locator('figcaption').allTextContents(), ['From 0 ms', 'To 0 ms']);
  assert.equal(await added.getByRole('button', {name:'Play before'}).count(), 0);
  assert.equal(await removed.getByRole('button', {name:'Play after'}).count(), 0);
});

test('review contract: an established move preserves the edge, then a key-only edit changes it once', async t => {
  const f = await fixture(t);
  const oldSource = f.edge.from.source, newSource = 'design/components/panel.tsx';
  const file = name => path.join(f.project, name);
  const sidecar = name => name.replace('.tsx', '.motion.json');
  await rename(file(oldSource), file(newSource));
  await rm(file(sidecar(oldSource)));
  const moved = { ...f.edge, from: { ...f.edge.from, source: newSource }, to: { ...f.edge.to, source: newSource } };
  await writeFile(file(sidecar(newSource)), JSON.stringify({version:1, edges:[moved]}));
  assert.equal((await f.generate()).motion, undefined);
  const content = await readFile(file(newSource), 'utf8');
  await writeFile(file(newSource), content.replace('<button data-adg-id', '<button key="details" data-adg-id'));
  const report = await f.generate();
  assert.deepEqual(report.motion, {added:0, changed:1, removed:0});
  const card = f.page.getByRole('article').filter({hasText:'open-details'});
  assert.match(await card.innerText(), /Inherited from endpoint/);
  assert.doesNotMatch(await card.innerText(), /Direct declaration/);
});
