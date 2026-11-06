import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseTokens, shadowLayers, tokenRegion, syncSvg } from '../src/toolkit/tokens.mjs';
import { compareInstance, matchTexts, textDelta } from '../src/toolkit/text.mjs';
import { discoverRoot, loadConfig, satisfies, viewport } from '../src/toolkit/config.mjs';
import { init, starterTokens, selectAssets, svgSize } from '../src/toolkit/project.mjs';
import { parseCli, help } from '../src/cli.mjs';
import { check, measureFont } from '../src/toolkit/commands.mjs';
import { compare, compareReport } from '../src/toolkit/compare.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { implementationTexts } from '../src/toolkit/document.mjs';

const temporary = t => { const root = mkdtempSync(path.join(tmpdir(), 'sdg-test-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const tokens = parseTokens(starterTokens), region = tokenRegion(tokens);
const svg = body => syncSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect data-canvas="" width="300" height="200" style="fill:var(--canvas)"/>${body}</svg>`, region);
const text = (value, x = 10, y = 20, extra = '') => `<text x="${x}" y="${y}" style="fill:var(--text-tertiary);font-size:var(--text-caption);font-weight:400;${extra}">${value}</text>`;
const component = (body = text('Sample'), rect = '') => `<g data-component="card" data-form="default"><rect width="200" height="50" rx="4" style="fill:var(--canvas)" ${rect}/>${body}</g>`;

test('tokens parse required light values and dark overrides', () => {
  assert.equal(tokens.light.get('--text-caption'), '11px');
  assert.equal(tokens.dark.get('--canvas'), '#171717');
  assert.throws(() => parseTokens(starterTokens.replace('  --canvas: #ffffff;\n', '')), /missing --canvas/);
  assert.throws(() => parseTokens(starterTokens + ':root {}'), /exactly/);
  assert.throws(() => parseTokens(starterTokens.replace('11px;', '11px; --x: 2px;')), /own line/);
  assert.throws(() => parseTokens(starterTokens.replace('--canvas: #171717', '--new: #171717')), /no light value/);
});
test('shadows split functional colors and reject spread/inset', () => {
  assert.deepEqual(shadowLayers('0 1px 4px rgba(0, 0, 0, .2), -2 3 8 #000'), [{ dx: 0, dy: 1, blur: 4, color: 'rgba(0, 0, 0, .2)' }, { dx: -2, dy: 3, blur: 8, color: '#000' }]);
  for (const value of ['0 1px 4px 2px red', 'inset 0 1px 4px red', '0 1px 4px red inset', '0 1 -1 red']) assert.throws(() => shadowLayers(value));
});
test('region includes theme visibility, fonts and both shadow filters', () => {
  const input = parseTokens(starterTokens.replace('--canvas: #ffffff;', '--canvas: #ffffff;\n  --shadow-panel: 0 2px 8px #000;'));
  const result = tokenRegion(input);
  assert.match(result, /stdDeviation="4"/); assert.match(result, /elev-panel-dark/);
  assert.match(result, /:root:not\(\[data-theme\]\) .only-light/);
  assert.match(result, /dominant-baseline:central/);
});
test('sync inserts/replaces only its region and is idempotent', () => {
  const raw = '<svg width="10"><rect/></svg>', synced = syncSvg(raw, region);
  assert.equal(syncSvg(synced, region), synced);
  assert.equal(synced.replace('\n' + region, ''), raw);
  assert.equal(syncSvg(synced, 'replacement'), '<svg width="10">\nreplacement<rect/></svg>');
  assert.throws(() => syncSvg('<svg><!-- design:tokens --></svg>', region), /markers/);
});
test('pairing follows content, reading order and ARC prefix fallback', () => {
  const a = { text: 'A', x: 1, y: 2, width: 10, height: 10 };
  const b = { ...a, text: 'B', y: 20 };
  const result = matchTexts([b, a, { ...a, text: 'missing' }], [{ ...b, text: 'B suffix' }, a, { ...a, text: 'extra' }]);
  assert.deepEqual(result.pairs.map(pair => pair[0].text), ['A', 'B']);
  assert.equal(result.missing[0].text, 'missing'); assert.equal(result.extra[0].text, 'extra');
  assert.deepEqual(textDelta({ ...a, anchor: 'end' }, { ...a, x: 3, width: 12 }), { dx: 4, dy: 0, dw: 2 });
  const report = compareReport('a', 'frame-a', 'a', { box: a, texts: [a] }, { box: a, texts: [{ ...a, x: 3 }] });
  assert.equal(report.offBy2px.length, 0);
});
test('fluid permits height only; text styles and other geometry still match', () => {
  const base = { container: { height: '20', rx: '4', fill: 'red', stroke: '', filter: '', fluid: true }, text: ['a'] };
  assert.deepEqual(compareInstance(base, { ...base, container: { ...base.container, height: '30' } }), []);
  assert.equal(compareInstance(base, { container: { ...base.container, rx: '8' }, text: ['b'] }).length, 2);
});
test('CLI dispatch preserves directories and validates command options', () => {
  assert.equal(parseCli(['project']).command, 'open');
  assert.equal(parseCli(['open', 'check']).positionals[0], 'check');
  assert.equal(parseCli(['check']).command, 'check');
  assert.deepEqual(parseCli(['compare', 'a.svg', '--frame=a', '--click=A', '--click', 'B']).values.click, ['A', 'B']);
  assert.throws(() => parseCli(['sync', '--scale=2']), /help/);
  assert.throws(() => parseCli(['compare', 'a.svg']), /help/);
  for (const name of ['open', 'init', 'sync', 'check', 'render', 'measure', 'compare']) assert.match(help(name), new RegExp(`Usage: sdg ${name}`));
});
test('root discovery prefers nearest config over package and defaults to nearest package', async t => {
  const root = temporary(t), nested = path.join(root, 'a/b'); mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{}'); writeFileSync(path.join(root, 'a/package.json'), '{}');
  assert.equal(discoverRoot(nested), path.join(root, 'a'));
  writeFileSync(path.join(root, 'sdg.config.mjs'), "export default { design: 'drawings' };");
  assert.equal(discoverRoot(nested), root);
  const config = await loadConfig(nested); assert.equal(config.design, path.join(root, 'drawings')); assert.equal(config.compare.port, 5188);
  writeFileSync(path.join(root, 'a/sdg.config.mjs'), 'export default {};'); assert.equal(discoverRoot(nested), path.join(root, 'a'));
});
test('requires compares releases, prereleases and supported ranges explicitly', () => {
  for (const range of ['>=0.3.0', '^0.3.0', '~0.3.0', '>= 0.2.0 < 0.4.0', '0.2.0 || 0.3.0', '*']) assert.equal(satisfies('0.3.0', range), true, range);
  for (const range of ['>0.3.0', '^0.2.0', '<0.3.0']) assert.equal(satisfies('0.3.0', range), false, range);
  assert.equal(satisfies('0.3.0-beta.2', '>=0.3.0-beta.1'), true);
  assert.equal(satisfies('0.3.0-beta.2', '>=0.2.0'), false);
  assert.throws(() => satisfies('0.3.0', '0.3.x'), /Unsupported/);
});
test('asset arguments, viewport and measurement token sizes', t => {
  const root = temporary(t); init({ root }, () => {}); const file = path.join(root, 'design/a.svg'); writeFileSync(file, svg(''));
  const config = { root, design: path.join(root, 'design') };
  assert.deepEqual(selectAssets(config, ['a.svg', 'design/a.svg']), [file, file]);
  assert.throws(() => selectAssets(config, ['../outside.svg']));
  assert.deepEqual(viewport('300x200'), { width: 300, height: 200 });
  assert.throws(() => viewport('0x2'));
  assert.deepEqual(svgSize(svg('')), { width: 300, height: 200 });
  assert.throws(() => svgSize('<svg width="3px" height="2"/>'));
  assert.match(measureFont(tokens.light, { size: 'caption', mono: true }), /11px ui-monospace/);
  assert.match(measureFont(tokens.light, { size: '14px' }), /14px/);
  assert.throws(() => measureFont(tokens.light, { size: 'unknown' }), /--size/);
});
test('CLI usage and requires failures return 2 with actionable single-line stderr', async t => {
  const root = temporary(t); writeFileSync(path.join(root, 'sdg.config.mjs'), "export default { requires: '>=99.0.0' };");
  const run = promisify(execFile), cli = path.resolve('src/cli.mjs');
  await assert.rejects(run(process.execPath, [cli, 'sync'], { cwd: root }), error => error.code === 2 && error.stderr.trim().split('\n').length === 1 && error.stderr.includes('npm install -g @whzxc/svg-design-gallery'));
  await assert.rejects(run(process.execPath, [cli, 'measure'], { cwd: root }), error => error.code === 2 && error.stderr.includes('--help'));
});
test('installed symlink runs version, init and failing requires', async t => {
  const root = temporary(t), bin = path.join(root, 'sdg'), run = promisify(execFile);
  symlinkSync(path.resolve('src/cli.mjs'), bin);
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  assert.equal((await run(bin, ['--version'], { cwd: root })).stdout.trim(), version);
  const initialized = await run(bin, ['init'], { cwd: root });
  assert.match(initialized.stdout, /created sdg.config.mjs/);
  assert.ok(readFileSync(path.join(root, 'design/tokens.css'), 'utf8').includes('--canvas:'));
  writeFileSync(path.join(root, 'sdg.config.mjs'), "export default { requires: '>=99.0.0' };");
  await assert.rejects(run(bin, ['sync'], { cwd: root }), error => {
    assert.equal(error.code, 2);
    assert.equal(error.stdout, '');
    assert.equal(error.stderr.trim().split('\n').length, 1);
    assert.match(error.stderr, /does not satisfy requires >=99.0.0; run npm install -g @whzxc\/svg-design-gallery/);
    return true;
  });
});
test('init is non-destructive and a scaffold passes check', async t => {
  const root = temporary(t), messages = []; init({ root }, line => messages.push(line));
  assert.equal(messages.filter(x => x.startsWith('created')).length, 4);
  init({ root }, line => messages.push(line)); assert.equal(messages.filter(x => x.startsWith('skipped')).length, 4);
  assert.equal(readFileSync(path.join(root, 'design/tokens.css'), 'utf8'), starterTokens);
  const config = await loadConfig(root);
  writeFileSync(path.join(config.design, 'components/card.svg'), svg(component()));
  writeFileSync(path.join(config.design, 'surfaces/valid.svg'), svg(`<g data-part="frame-valid" data-viewport="300x200" data-origin="20 20">${component()}</g>`));
  assert.equal(await check(config, [], {}, () => {}, () => {}), 0);
});
test('check catches every contract rule on small synthetic assets in both themes', async t => {
  const root = temporary(t); init({ root }, () => {}); const config = await loadConfig(root);
  writeFileSync(path.join(config.design, 'components/card.svg'), svg(component()));
  const samples = {
    stale: '<svg width="300" height="200" viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg"/>',
    css: svg('<style>:root{color:red}</style>'),
    paint: svg('<rect width="2" height="2" fill="red"/>'),
    undefined: svg('<rect width="2" height="2" fill="var(--absent)"/>'),
    canvas: svg(text('Outside', 290)),
    overlap: svg(text('First') + text('Second')),
    overflow: svg(component(text('Too wide', 195))),
    unknown: svg(component().replace('data-component="card"', 'data-component="absent"')),
    form: svg(component().replace('data-form="default"', 'data-form="absent"')),
    height: svg(component().replace('height="50"', 'height="51"')),
    radius: svg(component().replace('rx="4"', 'rx="5"')),
    fill: svg(component().replace('fill:var(--canvas)', 'fill:var(--text-tertiary)')),
    stroke: svg(component().replace('fill:var(--canvas)', 'fill:var(--canvas);stroke:var(--text-tertiary)')),
    filter: svg(component().replace('fill:var(--canvas)', 'fill:var(--canvas);filter:blur(1px)')),
    style: svg(component(text('Sample', 10, 20, 'font-weight:600;'))),
    shell: svg('<g data-part="frame-bad"><rect width="100" height="100"/></g>'),
    viewport: svg(`<g data-part="frame-bad" data-viewport="100x100" data-origin="0 0">${component()}</g>`),
    dark: svg(`<g class="only-dark">${text('Dark', 290)}</g>`),
  };
  for (const [name, source] of Object.entries(samples)) writeFileSync(path.join(config.design, 'surfaces', `${name}.svg`), source);
  const problems = []; assert.equal(await check(config, [], {}, () => {}, line => problems.push(line)), 1);
  for (const name of Object.keys(samples)) assert.ok(problems.some(line => line.startsWith(`design/surfaces/${name}.svg:`)), `${name} not caught`);
  assert.ok(problems.some(line => /height .*should be/.test(line)));
  assert.ok(problems.some(line => /text style/.test(line)));
});
test('theme region follows explicit theme before system; DOM extraction handles lines, clipping and placeholders', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ colorScheme: 'dark' });
    await page.setContent(svg('<g class="only-light"><text>Light</text></g><g class="only-dark"><text>Dark</text></g>'));
    // Standalone SVG root selectors are tested in an SVG document, not an HTML wrapper.
    await page.goto(`data:image/svg+xml,${encodeURIComponent(svg('<g class="only-light"><text>Light</text></g><g class="only-dark"><text>Dark</text></g>'))}`);
    assert.equal(await page.locator('.only-light').evaluate(el => getComputedStyle(el).display), 'none');
    await page.locator('svg').evaluate(el => el.dataset.theme = 'light');
    assert.equal(await page.locator('.only-dark').evaluate(el => getComputedStyle(el).display), 'none');
    await page.goto('about:blank');
    await page.setContent('<div id="panel" style="width:200px;height:150px;overflow:hidden"><div style="width:50px;font:14px monospace">One two three four</div><input placeholder="Empty" style="width:100px"><div style="position:relative;left:300px">Clipped</div><span hidden>Hidden</span></div>');
    const result = await page.locator('#panel').evaluate(implementationTexts);
    assert.ok(result.texts.length >= 4); assert.ok(result.texts.some(t => t.text === 'Empty'));
    assert.ok(!result.texts.some(t => /Clipped|Hidden/.test(t.text)));
  } finally { await browser.close(); }
});
test('compare reads centered clipped labels and one value or placeholder per text field', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<div id="panel" style="width:600px;height:300px;font:13px/12px Arial">
      <span id="label" style="display:block;width:120px;height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Centered label</span>
      <span style="display:block;width:10px;height:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Horizontal clipping</span>
      <div style="height:4px;overflow:hidden"><span style="position:relative;top:8px">Below clip</span></div>
      <input type="search" value="pill" placeholder="Find assets…" style="display:block;width:220px">
      <input value="~/projects/empty" placeholder="/path/to/design" style="display:block;width:260px">
      <input type="text" placeholder="Empty field" style="display:block;width:220px">
      <textarea style="display:block;width:400px">First line
Second line</textarea>
      <textarea placeholder="Empty textarea" style="display:block;width:400px"></textarea>
    </div>`);
    const boxes = await page.locator('#label').evaluate(el => {
      const range=document.createRange();range.selectNodeContents(el);
      return [range.getBoundingClientRect().height,el.getBoundingClientRect().height];
    });
    assert.ok(boxes[0] > boxes[1], 'the glyph box must exceed its clipping span');
    const result = await page.locator('#panel').evaluate(implementationTexts);
    assert.deepEqual(result.texts.map(t=>t.text), ['Centered label','pill','~/projects/empty','Empty field','First line Second line','Empty textarea']);
  } finally { await browser.close(); }
});
test('compare runs a static adapter with clip/region/selector, fixed environment and exact output files', async t => {
  const root = temporary(t); init({ root }, () => {});
  const { createServer } = await import('node:net');
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const html = `<!doctype html><html><head><style>body{margin:0;font:11px system-ui}.panel{position:absolute;left:20px;top:20px;width:200px;height:50px}span{position:absolute;left:10px;top:10px}button{position:absolute;top:100px}</style></head><body><div role="region" aria-label="Panel" class="panel"><span>Hello</span></div><button onclick="window.order='A'">First</button><button style="left:100px" onclick="window.order+='B'">Second</button><script>fetch('/blocked').then(()=>window.blocked=false).catch(()=>window.blocked=true);setTimeout(()=>window.timer=true,1)</script></body></html>`;
  writeFileSync(path.join(root, 'page.html'), html);
  writeFileSync(path.join(root, 'sdg.config.mjs'), `
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export default { compare: {
 port: ${port}, viewport: '300x200', block: ['**/blocked'],
 async start({port,root}) {
  const server = createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(readFileSync(path.join(root,'page.html')))});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return async()=>{await new Promise(resolve=>server.close(resolve));writeFileSync(path.join(root,'stopped'),'yes')};
 },
 fixture(name) { if (!['sample','override'].includes(name)) throw Error('wrong fixture'); return {url:'/',theme:'dark',locale:'fr-FR',clock:'2026-01-01T00:00:00Z'} },
 async ready(page) {
  await page.waitForFunction(()=>window.blocked && window.timer);
  if (!await page.evaluate(()=>Date.now()===1767225600000 && new Date().getTime()===1767225600000 && navigator.language==='fr-FR' && matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme==='dark')) throw Error('fixture environment failed');
 },
 async texts(page) { if (!await page.evaluate(()=>window.order==='AB')) throw Error('click order failed'); return [{text:'Canvas',x:40,y:30,width:20,height:10,fill:'black',size:'11px',weight:'400',family:'system-ui'}] }
} };
`);
  const asset = name => path.join(root, 'design/surfaces', name + '.svg');
  writeFileSync(asset('clip'), svg(`<g data-part="frame-demo" data-fixture="sample" data-viewport="300x200" data-origin="20 20">${component(text('Hello'))}</g>`));
  writeFileSync(asset('panel'), svg(`<g data-part="frame-demo" data-fixture="sample">${component(text('Hello'))}</g>`));
  const config = await loadConfig(root);
  for (const [name, options] of [ ['clip', {}], ['panel', { region: 'Panel' }], ['panel', { selector: '.panel', fixture: 'override' }] ]) {
    assert.equal(await compare(config, [`surfaces/${name}.svg`], { frame: 'demo', click: ['First', 'Second'], ...options }), 1);
    const target = path.join(config.output, 'compare', `${name}-demo-${options.fixture ?? 'sample'}`);
    assert.deepEqual(readdirSync(target).sort(), ['design.png', 'implementation.png', 'index.html', 'overlay.png', 'report.json']);
    const report = JSON.parse(readFileSync(path.join(target, 'report.json')));
    assert.equal(report.matched, 1); assert.ok(report.extra.includes('Canvas'));
    assert.deepEqual(report.size.implementation, [200, 50]);
    assert.equal(readFileSync(path.join(root, 'stopped'), 'utf8'), 'yes');
    assert.equal(readFileSync(path.join(target, 'overlay.png')).subarray(1, 4).toString(), 'PNG');
  }
});

async function compareFixture(t, html) {
  const root = temporary(t); init({ root }, () => {});
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const fixture = { url: `http://127.0.0.1:${server.address().port}`, theme: 'light', locale: 'en-US', clock: '2026-01-01T00:00:00Z' };
  const config = await loadConfig(root);
  config.compare.fixture = () => fixture;
  const asset = path.join(config.design, 'surfaces/demo.svg');
  const report = () => JSON.parse(readFileSync(path.join(config.output, 'compare/demo-demo-sample/report.json')));
  return { root, config, fixture, asset, report };
}

test('compare applies fixture time zones and defaults to the system zone', async t => {
  const sample = await compareFixture(t, `<div id="panel" style="width:200px;height:50px"></div><script>
    document.querySelector('#panel').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone + ' ' + new Date().getHours();
  </script>`);
  for (const timezone of ['Asia/Shanghai', undefined]) {
    sample.fixture.timezone = timezone;
    const label = timezone ? 'Asia/Shanghai 8' : `${Intl.DateTimeFormat().resolvedOptions().timeZone} ${new Date(sample.fixture.clock).getHours()}`;
    writeFileSync(sample.asset, svg(`<g data-part="frame-demo" data-fixture="sample">${component(text(label))}</g>`));
    await compare(sample.config, ['surfaces/demo.svg'], { frame: 'demo', selector: '#panel' });
    assert.equal(sample.report().matched, 1);
    assert.deepEqual(sample.report().missing, []);
    assert.deepEqual(sample.report().extra, []);
    assert.equal(sample.report().settled, true);
  }
});

test('compare rejects invalid fixture time zones with exit 2 and one stderr line', async t => {
  const root = temporary(t); init({ root }, () => {});
  writeFileSync(path.join(root, 'design/surfaces/demo.svg'), svg(`<g data-part="frame-demo" data-fixture="sample" data-viewport="300x200" data-origin="0 0">${component()}</g>`));
  const run = promisify(execFile), cli = path.resolve('src/cli.mjs');
  for (const timezone of ['Invalid/Zone', '+08:00', '', 8]) {
    writeFileSync(path.join(root, 'sdg.config.mjs'), `export default { compare: { fixture() { return { url: 'http://127.0.0.1:1', theme: 'light', locale: 'en-US', clock: '2026-01-01', timezone: ${JSON.stringify(timezone)} }; } } };`);
    await assert.rejects(run(process.execPath, [cli, 'compare', 'surfaces/demo.svg', '--frame=demo'], { cwd: root }), error => {
      assert.equal(error.code, 2);
      assert.equal(error.stdout, '');
      assert.equal(error.stderr.trim().split('\n').length, 1);
      assert.match(error.stderr, /timezone must be a valid IANA time zone.*fix sdg.config.mjs/);
      return true;
    });
  }
});

test('compare settles delayed post-click text and reflow in clips, regions and selectors', async t => {
  const sample = await compareFixture(t, `<style>
    body{margin:0;font:11px system-ui}.panel{position:absolute;left:20px;top:20px;width:200px;height:50px}
    #label{position:absolute;left:10px;top:10px}button{position:absolute;top:100px}#outside{position:absolute;top:150px}
  </style><div class="panel" role="region" aria-label="Panel"><span id="label">Before</span></div>
  <button onclick="window.clicked=performance.now();setTimeout(()=>label.textContent='After',200);setTimeout(()=>label.style.left='40px',400)">Open board</button>
  <span id="outside"></span><script>setInterval(()=>outside.textContent=String(performance.now()),50)</script>`);
  let elapsed;
  sample.config.compare.texts = async page => { elapsed = await page.evaluate(() => performance.now() - window.clicked); return []; };
  for (const options of [{}, { region: 'Panel' }, { selector: '.panel' }]) {
    const clip = !options.region && !options.selector ? 'data-viewport="300x200" data-origin="20 20"' : '';
    writeFileSync(sample.asset, svg(`<g data-part="frame-demo" data-fixture="sample" ${clip}>${component(text('After'))}</g>`));
    await compare(sample.config, ['surfaces/demo.svg'], { frame: 'demo', click: ['Open board'], ...options });
    const report = sample.report();
    assert.equal(report.settled, true);
    assert.equal(report.matched, 1);
    assert.deepEqual(report.missing, []);
    assert.deepEqual(report.extra, []);
    assert.ok(report.offBy2px.some(row => row.text === 'After' && row.dx === 30), 'capture must use the final text box');
    assert.ok(elapsed >= 690 && elapsed < 3000, `settled after ${elapsed}ms`);
  }
});

test('compare captures after the settling timeout and reports settled false', { timeout: 15000 }, async t => {
  const sample = await compareFixture(t, `<div id="panel" style="width:200px;height:50px"><span id="label">Before</span></div>
    <button onclick="window.clicked=performance.now();setInterval(()=>label.textContent='Tick '+(++window.tick),75)">Open board</button><script>window.tick=0</script>`);
  writeFileSync(sample.asset, svg(`<g data-part="frame-demo" data-fixture="sample">${component(text('Before'))}</g>`));
  let elapsed;
  sample.config.compare.texts = async page => { elapsed = await page.evaluate(() => performance.now() - window.clicked); return []; };
  assert.equal(await compare(sample.config, ['surfaces/demo.svg'], { frame: 'demo', selector: '#panel', click: ['Open board'] }), 1);
  const report = sample.report();
  assert.equal(report.settled, false);
  assert.ok(report.extra.some(label => /^Tick \d+$/.test(label)));
  assert.ok(elapsed >= 4900 && elapsed < 7000, `captured after ${elapsed}ms`);
  const destination = path.join(sample.config.output, 'compare/demo-demo-sample');
  assert.deepEqual(readdirSync(destination).sort(), ['design.png', 'implementation.png', 'index.html', 'overlay.png', 'report.json']);
  assert.equal(readFileSync(path.join(destination, 'implementation.png')).subarray(1, 4).toString(), 'PNG');
});
