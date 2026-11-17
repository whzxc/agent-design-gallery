import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const colors = ['#ff0000', '#00ff00', '#0000ff'];
const rgb = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];

async function viewer(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-backdrop-'));
  let server, browser;
  t.after(async () => {
    try { await browser?.close(); }
    finally {
      try { await server?.close(); }
      finally { await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    }
  });
  const directory = path.join(root, 'design');
  await writeFile(path.join(root, 'adg.config.mjs'), "export default { design: 'design' };\n");
  for (const layer of ['components', 'modules', 'surfaces']) await mkdir(path.join(directory, layer), { recursive: true });
  const tokens = `
  --font-ui: system-ui;
  --font-mono: monospace;
  --canvas: #fafafa;
  --surface: #fff;
  --text: #111;
  --border: #777;
  --radius-card: 12px;
`;
  await writeFile(path.join(directory, 'tokens.css'), `:root {${tokens}}\n:root[data-theme="dark"] {${tokens}}`);
  const source = `import {Frame} from 'adg';
    export default () => [900,700,500].map((width,index) => <Frame name={'frame-'+index} width={width} height={80}>
      <div style={{width,height:80,background:${JSON.stringify(colors)}[index],boxShadow:'0 0 0 12px #000,0 0 0 80px '+${JSON.stringify(colors)}[index]}} />
    </Frame>);`;
  await writeFile(path.join(directory, 'components/shadows.tsx'), source);
  await writeFile(path.join(directory, 'modules/shadows.tsx'), source);
  await writeFile(path.join(directory, 'surfaces/shadows.tsx'), source);
  await writeFile(path.join(directory, 'components/auto.tsx'), `import {Frame} from 'adg';
    export default () => <Frame name="frame-0"><button style={{display:'block',width:120,height:40,padding:0,border:0,background:'#ff0000',boxShadow:'0 0 0 12px #000'}}>Auto width</button></Frame>;`);
  // Eight-pixel gaps put neighbour bodies inside the normal 24/32px paint window.
  const positions = [[40, 40], [128, 40], [40, 108]];
  await writeFile(path.join(directory, 'components/legacy.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="248" height="208" data-design="component">
    <defs><filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#000" flood-opacity="1"/></filter></defs>
    ${positions.map(([x, y], index) => `<g data-component="legacy" data-form="frame-${index}" transform="translate(${x} ${y})"><rect width="80" height="60" fill="${colors[index]}" filter="url(#shadow)"/></g>`).join('')}
  </svg>`);
  server = await startServer({ directory, stateDirectory: path.join(root, 'state') });
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return { page, url: server.url, errors };
}

async function focus(page, url, source, index, raster = false, scope = `asset:${source}`) {
  const query = new URLSearchParams({ scope, asset: source, frame: `frame-${index}` });
  await page.goto(`${url}?${query}`);
  await page.waitForFunction(() => window.__adg?.ready || document.querySelector('#error')?.textContent);
  const error = await page.locator('#error').textContent();
  assert.equal(error, '', error && `${source}: ${await (await page.request.get(new URL(`/asset/${encodeURIComponent(source)}?theme=light`, url).href)).text()}`);
  await page.keyboard.press('1');
  if (raster) {
    await page.keyboard.press('-');
    await page.keyboard.press('-');
  }
  await page.waitForFunction(() => window.__adg.ready);
  await page.keyboard.press('Escape');
  await page.mouse.move(10, 80);
  await page.waitForFunction(() => window.__adg.ready);
}

async function pixels(page, source, index, points = []) {
  const screenshot = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ source, index, points, screenshot }) => {
    const item = window.__adg.items.find(item => item.id === `${source}#${index}`);
    const view = window.__adg.view;
    const image = new Image();
    image.src = `data:image/png;base64,${screenshot}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const viewport = document.querySelector('.gallery-viewport').getBoundingClientRect();
    const pixel = (x, y) => Array.from(context.getImageData(
      Math.floor(viewport.x + view.x + (item.x + x) * view.scale),
      Math.floor(viewport.y + view.y + (item.y + y) * view.scale), 1, 1).data);
    const region = [];
    for (let y = -28; y < item.height + 28; y += 2) {
      for (let x = -20; x < item.width + 20; x += 2) region.push(pixel(x, y));
    }
    return { item, scale: view.scale, points: points.map(([x, y]) => pixel(x, y)), region };
  }, { source, index, points, screenshot });
}

function noNeighbourColors(region, index, label) {
  for (const [neighbour, color] of rgb.entries()) {
    if (neighbour === index) continue;
    assert.equal(region.some(pixel => color.every((value, channel) => Math.abs(value - pixel[channel]) < 4)), false,
      `${label} contains neighbour ${neighbour} body or shadow`);
  }
}

test('TSX component and module shadows cross native frame edges without horizontal or next-row neighbour bleed', { timeout: 60000 }, async t => {
  const { page, url, errors } = await viewer(t);
  for (const layer of ['components', 'modules']) {
    const source = `${layer}/shadows.tsx`;
    for (const raster of [false, true]) for (let index = 0; index < 3; index++) {
      await focus(page, url, source, index, raster);
      const width = [900, 700, 500][index];
      const result = await pixels(page, source, index, [[-6, 40], [width + 6, 40], [width / 2, -6], [width / 2, 86], [width / 2, 40]]);
      assert.equal(result.scale, raster ? .64 : 1);
      for (const pixel of result.points.slice(0, 4)) assert.ok(pixel.slice(0, 3).every(value => value < 8), `${source} ${index} shadow missing at ${pixel}`);
      assert.deepEqual(result.points[4].slice(0, 3), rgb[index]);
      noNeighbourColors(result.region, index, `${source} ${index} ${raster ? 'raster' : 'vector'}`);
    }
  }
  assert.deepEqual(errors, []);
});

test('legacy shared previews bound horizontal and next-row neighbour bodies at gap midpoints', { timeout: 30000 }, async t => {
  const { page, url, errors } = await viewer(t);
  for (const raster of [false, true]) for (let index = 0; index < 3; index++) {
    await focus(page, url, 'components/legacy.svg', index, raster);
    const result = await pixels(page, 'components/legacy.svg', index, [[40, 30], [82, 30], [40, 62]]);
    assert.deepEqual(result.points[0].slice(0, 3), rgb[index]);
    noNeighbourColors(result.region, index, `legacy ${index} ${raster ? 'raster' : 'vector'}`);
    if (index === 0) {
      assert.ok(result.points[1][0] < 240, 'horizontal shadow remains visible before the midpoint');
      assert.ok(result.points[2][0] < 240, 'vertical shadow remains visible before the midpoint');
    }
  }
  assert.deepEqual(errors, []);
});

test('surface edges remain bounded and frame hover and source selection outlines retain native bounds', { timeout: 30000 }, async t => {
  const { page, url, errors } = await viewer(t);
  for (const raster of [false, true]) {
    await focus(page, url, 'surfaces/shadows.tsx', 0, raster);
    const result = await pixels(page, 'surfaces/shadows.tsx', 0, [[450, 40], [-6, 40], [906, 40], [450, -6], [450, 86], [0, 40]]);
    assert.deepEqual(result.points[0].slice(0, 3), rgb[0]);
    for (const pixel of result.points.slice(1, 5)) assert.ok(pixel.slice(0, 3).every(value => value > 230), `surface overflow leaked ${pixel}`);
    assert.notDeepEqual(result.points[5].slice(0, 3), rgb[0], 'surface boundary has a visible stroke');
  }
  await focus(page, url, 'components/legacy.svg', 0);
  const box = await page.evaluate(() => {
    const item = window.__adg.items.find(item => item.id === 'components/legacy.svg#0');
    const view = window.__adg.view, rect = document.querySelector('.gallery-viewport').getBoundingClientRect();
    return { x: rect.x + view.x + item.x * view.scale, y: rect.y + view.y + item.y * view.scale,
      width: item.width * view.scale, height: item.height * view.scale };
  });
  await page.mouse.move(box.x + 40, box.y + 30);
  await page.locator('#hover-outline').waitFor({ state: 'visible' });
  const nearBox = async selector => {
    const actual = await page.locator(selector).boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - box[key]) < .1, `${selector} ${key}`);
  };
  await nearBox('#hover-outline');
  await page.mouse.click(box.x + 40, box.y + 30);
  await nearBox('#selection-outline');
  await page.mouse.move(box.x - 6, box.y + 30);
  assert.equal(await page.locator('#hover-outline').isVisible(), false, 'shadow padding is outside frame hit bounds');
  await page.locator('[data-source="components/legacy.svg"]').evaluate(button => button.click());
  assert.equal((await page.evaluate(() => window.__adg.selection)).frame, null);
  await nearBox('#selection-outline');
  assert.deepEqual(errors, []);
});
