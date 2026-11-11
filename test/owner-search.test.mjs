import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { owner } from '../src/toolkit/owner.mjs';
import { fastColor, colorHex, installColorResolver, resolveQueryColor } from '../src/toolkit/owner-colors.mjs';
import { normalizeOwnerText } from '../src/toolkit/owner-observation.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { validateFrame } from '../src/toolkit/build.mjs';
import { jsonLocations } from '../src/toolkit/json-locations.mjs';

test('text normalization, locale validation, JSON locations and fast color syntax are deterministic', async () => {
  assert.equal(normalizeOwnerText(' \r\nCafe\u0301\u00a0changes\t'), 'Café changes');
  assert.equal(normalizeOwnerText('A\u200bB'), 'A\u200bB');
  assert.deepEqual(fastColor('#3698'), [51,102,153,136]);
  assert.deepEqual(fastColor('rgb(51 102 153 / 50%)'), [51,102,153,128]);
  assert.deepEqual(fastColor('hsl(120 100% 50%)'), [0,255,0,255]);
  assert.equal(colorHex(fastColor('transparent')), '#00000000');
  assert.equal(fastColor('rgb(1 2 3 .5)'), null); assert.equal(fastColor('hsl(0, 100% 50%)'), null);
  await assert.rejects(resolveQueryColor('var(--accent)', () => assert.fail('context-dependent color used browser')), { code: 'OWNER_COLOR_INVALID' });
  const frame = { frame: true, name: 'demo', locale: 'en-us' }; validateFrame(frame); assert.equal(frame.locale, 'en-US');
  assert.throws(() => validateFrame({ ...frame, locale: 'bad_locale' }), /Frame locale/);
  const text = '{\n  "a": [ {"x":1}, {"y":"escaped\\\""} ]\n}';
  assert.deepEqual(jsonLocations(text)['/a/1'], { line: 2, column: 19 });
});

test('one real-browser fixture covers painted runs, themes, palettes, token evidence and warm reuse', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-search-'));
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); };
  const browser = await launch();
  t.after(async () => { await browser.close(); await rm(root, { recursive: true, force: true }); });
  await put('adg.config.mjs', 'export default {};');
  await put('design/tokens.css', `:root {
--font-ui: system-ui;
--font-mono: monospace;
--canvas: #ffffff;
--text: #111111;
--accent: #336699;
--alias: var(--accent);
--alpha: rgba(51,102,153,.5);
--shape: #00ff00;
--pseudo: #ff0000;
--size: 12px;
--cycle: var(--cycle);
--absent-paint: #102938;
}
:root[data-theme="dark"] {
--accent: #99ccff;
--text: #ffffff;
}`);
  await put('design/components/sample.tsx', `import {Frame} from 'adg';
export function Label({zh=false}) {return <button data-free style={{color:'var(--alias)'}}><span>{zh?'保存':'Save'}</span> <b>{zh?'更改':'changes'}</b></button>}
export function Other(){return <button>OK</button>}
export function Third(){return <button>OK</button>}
export function Sample({zh=false}) {return <section class="flex h-[320px] w-[640px] flex-col bg-canvas text-text">
<Label zh={zh}/><Other/><Third/>
<span aria-hidden="true">Visible hidden-ARIA</span><span class="hidden">Not painted</span><span data-free style={{opacity:0}}>Transparent text</span>
<label>Field <input placeholder="Placeholder"/></label><input type="password" value="fixture-secret-value"/>
<div class="relative h-5 w-12 overflow-hidden"><span class="absolute left-[300px]">Clipped away</span></div>
<span data-free class="before:content-(--fixture-prefix) before:text-pseudo" style={{'--fixture-prefix':'"Prefix"'}}>Body</span>
<svg width="80" height="24"><rect width="12" height="12" fill="var(--shape)"/><text x="14" y="18" fill="var(--shape)">SVG</text></svg>
<div class="h-4 w-4" data-free style={{backgroundColor:'var(--alpha)'}}/>
<div class="h-4 w-4" data-free style={{textShadow:'0 0 2px var(--absent-paint)'}}/>
</section>}
export default()=>[<Frame name="english" locale="en" width={640} height={320}><Sample/></Frame>,<Frame name="chinese" locale="zh-CN" width={640} height={320}><Sample zh/></Frame>];`);
  const config = await loadConfig(root), state = path.join(root, 'state');
  const sharedBrowser = { newPage: (...args) => browser.newPage(...args), isConnected: () => browser.isConnected(), close: async () => {} };
  const deps = { environment: async () => 'fixture-font-environment', launchBrowser: async () => sharedBrowser };
  const run = flags => owner(config, { ...flags, json: true, 'state-dir': state }, deps);
  const english = await run({ text: ' Save\u00a0 changes ', locale: 'en' });
  assert.equal(english.data.owners[0].part, 'Label'); assert.equal(english.data.owners[0].matchKind, 'text_exact');
  assert.deepEqual(english.data.owners[0].frames.map(frame => frame.theme), ['light','dark']);
  assert.ok(english.data.owners[0].tokens.includes('--alias')); assert.ok(english.data.owners[0].tokens.includes('--accent'));
  const chinese = await run({ text: '保存 更改', locale: 'zh-cn' }); assert.equal(chinese.data.query.locale, 'zh-CN'); assert.ok(chinese.data.owners.every(row => row.frames.every(frame => frame.locale === 'zh-CN')));
  assert.equal((await run({ text: 'Save changes', locale: 'zh-CN' })).data.owners.length, 0);
  const repeated = await run({ text: 'OK' }); assert.equal(repeated.data.ambiguous, true); assert.deepEqual(repeated.data.owners.map(row => row.part).sort(), ['Other','Third']);
  assert.equal((await run({ text: 'changes', contains: true })).data.owners[0].matchKind, 'text_contains');
  for (const text of ['Visible hidden-ARIA','Placeholder','Prefix','SVG']) assert.ok((await run({ text })).data.owners.length, text);
  for (const text of ['Not painted','Transparent text','Clipped away','fixture-secret-value']) assert.equal((await run({ text })).data.owners.length, 0, text);
  const rgba = await run({ color: 'rgba(51,102,153,.5)' }); assert.equal(rgba.data.query.normalized, '#33669980');
  assert.ok(rgba.data.owners.some(row => row.evidence.some(e => e.matchKind === 'color_value' && e.detail.usage === 'computed_value')));
  const hex = await run({ color: '#336699' }), rgb = await run({ color: 'rgb(51 102 153)' });
  assert.deepEqual(hex.data.owners, rgb.data.owners); assert.equal(hex.data.tokenAmbiguous, true);
  assert.ok(hex.data.tokens.some(token => token.name === '--alias'));
  const token = await run({ token: '--accent' }); assert.equal(token.data.tokens.length, 1); assert.equal(token.data.tokens[0].name, '--accent');
  assert.deepEqual(token.data.tokens[0].values.map(value => value.rgba), [[51,102,153,255],[153,204,255,255]]);
  assert.ok(token.data.owners.some(row => row.evidence.some(e => e.matchKind === 'token_alias_reference')));
  assert.ok(token.data.owners.every(row => row.evidence.every(e => e.matchKind !== 'color_value')));
  assert.equal((await run({color:'#102938'})).data.owners.length,0,'an empty element does not paint a text shadow');
  assert.equal((await run({ token: '--size' })).data.tokens[0].values[0].rgba, null);
  const cycle = await run({ token: '--cycle' }); assert.equal(cycle.data.tokens[0].values[0].resolved, null); assert.ok(cycle.warnings.some(w => w.code === 'OWNER_TOKEN_UNRESOLVED'));
  const missing = await owner(config, { token: '--missing', json: true, 'state-dir': state }, { ...deps, launchBrowser: async () => assert.fail('unknown token launched browser') }); assert.equal(missing.data.coverage.requestedObservations, 0);
  const warm = await owner(config, { text: 'OK', json: true, 'state-dir': state }, { ...deps, launchBrowser: async () => assert.fail('warm shards launched browser') }); assert.deepEqual(warm, repeated);
  await run({ color:'color(display-p3 1 0 0)' });
  const modernWarm = await owner(config,{color:'color(display-p3 1 0 0)',json:true,'state-dir':state},{...deps,launchBrowser:async()=>assert.fail('cached modern color launched browser')});assert.equal(modernWarm.data.query.normalized,'#ff0000ff');
  await assert.rejects(run({ color: 'currentColor' }), { code: 'OWNER_COLOR_INVALID' });
  const page = await browser.newPage(); await page.setContent('<html><body></body></html>'); await page.evaluate(installColorResolver);
  for (const input of ['#3698','rgb(51 102 153 / 50%)','rgba(1,2,3,.1)','hsl(120 100% 50%)','transparent']) assert.deepEqual(await page.evaluate(value => globalThis.__adgOwnerColor(value), input), fastColor(input));
  for (const input of ['red','oklch(0.5 0.1 30)','color(display-p3 1 0 0)']) assert.ok(await page.evaluate(value => globalThis.__adgOwnerColor(value), input));
  await page.close();
});
