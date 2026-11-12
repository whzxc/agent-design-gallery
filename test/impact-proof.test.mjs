import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { frameDocument } from '../src/toolkit/frame-document.mjs';
import { materializedProjection, architectureProjection, canonicalBytes, capturePolicy, entryProjection, equalEntryProof, equalProof } from '../src/toolkit/impact-proof.mjs';
import { createEligibilityChecker } from '../src/toolkit/impact-eligibility.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { tokenReachability, entryTokenReachability } from '../src/toolkit/token-reachability.mjs';
import { impact } from '../src/toolkit/impact.mjs';

const tokens = starterTokens.replace('--text: #171717;', '--text: #171717;\n  --used: var(--missing, #123456);\n  --unused: 5px;');
const config = { root: '/work/project', arch: '/work/project/arch', check: { archMaxEdges: 30 }, diff: { thresholds: {} } };
function built(sheet = tokens) {
  const value = { cssBeforeTokens: 'body{color:var(--used)}\n', tokenCss: sheet, cssAfterTokens: '\n[data-adg-frame]{display:flex}', frames: [] };
  value.css = value.cssBeforeTokens + value.tokenCss + value.cssAfterTokens;
  return value;
}

test('projection replaces only builder-owned token bytes, retains metadata/policy, and records absence', () => {
  const frame = { name: 'one', html: '<div>Text</div>' }, before = built(), after = built(tokens.replace('--unused: 5px;', '--unused: 9px;'));
  const project = (build, theme = 'light', current = frame, policy = capturePolicy(config)) => materializedProjection(build, current, theme, policy).bytes;
  assert.equal(project(before), project(after), 'unreachable token declaration does not affect P');
  assert.notEqual(project(before), project(built(tokens.replace('--used: var(--missing, #123456);', '--used: #abcdef;'))));
  assert.notEqual(project(before), project(built(tokens.replace('--unused: 5px;', '--unused: 5px;\n  --missing: #000000;'))), 'absence becomes a declaration');
  assert.notEqual(project(before), project(before, 'light', { ...frame, parent: { source: 'design/a.tsx', frame: 'parent', selector: '#part' } }));
  assert.notEqual(project(before), project(before, 'light', frame, { ...capturePolicy(config), caret: 'initial' }));
  const duplicate = { ...frame, html: `<pre>${tokens}</pre>` };
  const document = JSON.parse(project(before, 'light', duplicate)).document;
  assert.ok(document.includes(duplicate.html), 'token-like text elsewhere is never removed');
  assert.ok(document.includes('"--missing":null'));
  const darkSheet = tokens.replace(':root[data-theme="dark"] {', ':root[data-theme="dark"] {\n  --used: #ffffff;');
  assert.equal(project(before, 'light'), project(built(darkSheet), 'light'));
  assert.notEqual(project(before, 'dark'), project(built(darkSheet), 'dark'));
  const invalid = built(tokens + '\n@property --test {syntax:"*";inherits:false;}');
  assert.equal(materializedProjection(invalid, frame, 'light', {}).tokenMode, 'full_sheet');
  assert.equal(JSON.parse(materializedProjection(invalid, frame, 'light', {}).bytes).document, frameDocument(frame, 'light', invalid.css));
});

test('parsed eligibility checks script-capable content and all resource URL contexts without a browser', () => {
  const eligible = createEligibilityChecker();
  for (const document of [
    '<div>https://example.invalid</div><a href="https://example.invalid">Link</a>',
    '<div title="javascript:example">Literal label</div>',
    '<style>x{animation:spin 2s;transition:all 1s;background:url(#local)}</style><canvas></canvas><video src="data:video/mp4;base64,AA=="></video>',
    '<img srcset="data:image/png;base64,AA== 1x, data:image/png;base64,BB== 2x"><svg><use href="#part"/></svg>',
    '<style>@font-face{font-family:Demo;src:local("System")}x{background:image-set("data:image/png;base64,AA==" 1x)}</style>',
  ]) assert.deepEqual(eligible(document), [], document);
  for (const document of ['<script>x()</script>', '<svg><script/></svg>', '<div onclick="x()"/>', '<a href="java&#x73;cript:x()">x</a>', '<iframe/>', '<object/>', '<embed/>']) assert.ok(eligible(document).includes('dynamic_document'), document);
  for (const document of [
    '<img src="https://example.invalid/a.png">', '<base href="https://example.invalid/">',
    '<img srcset="data:image/png;base64,AA== 1x, /remote.png 2x">', '<link imagesrcset="a.png 1x">',
    '<video poster="/poster.png"/>', '<svg><image xlink:href="/image.svg"/></svg>',
    '<svg><path fill="url(https://example.invalid/paint.svg#color)"/></svg>',
    '<style>@import "https://example.invalid/a.css"; @font-face{font-family:X;src:url(/x.woff)}</style>',
    '<div style="background: image-set(url(data:image/png;base64,AA==) 1x, &quot;/b.png&quot; 2x)"></div>',
    String.raw`<style>x{background:u\72l(https://example.invalid/a.png)}</style>`,
    '<meta http-equiv="refresh" content="0;url=https://example.invalid">',
  ]) assert.ok(eligible(document).includes('external_resource'), document);
  const nestedSvg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="/remote.png"/></svg>').toString('base64');
  assert.ok(eligible(`<img src="${nestedSvg}">`).includes('external_resource'));
  const nestedCss = 'data:text/css,' + encodeURIComponent('@import "/remote.css";');
  assert.ok(eligible(`<link rel="stylesheet" href="${nestedCss}">`).includes('external_resource'));
  assert.ok(eligible('<style>x{background:url("unterminated)}</style>').includes('unsupported_css'));
  assert.ok(eligible('<style>:root{--asset:"/a.png"}x{background:image-set(var(--asset) 1x)}</style>').includes('unsupported_css'));
  assert.ok(eligible('<svg><image href="#local"><animate attributeName="href" to="https://example.invalid/a.svg"/></image></svg>').includes('external_resource'));
  assert.deepEqual(eligible('<svg><animate attributeName="x" values="0;10"/></svg>'), []);
});

test('architecture proof input equality is byte-exact, presence-aware and config-aware', () => {
  const input = { source: Buffer.from('flowchart LR\na-->b'), sidecar: null, tokens: Buffer.from(tokens), config };
  const before = architectureProjection(input);
  assert.equal(before, architectureProjection({ ...input, config: { ...config, root: '/tmp/copy', arch: '/tmp/copy/arch' } }));
  for (const other of [{ sidecar: Buffer.alloc(0) }, { tokens: Buffer.from(tokens + '\n') }, { source: Buffer.from('changed') }, { config: { ...config, check: { archMaxEdges: 10 } } }]) assert.notEqual(before, architectureProjection({ ...input, ...other }));
  assert.notEqual(architectureProjection({ ...input, source: Buffer.from([255]) }), architectureProjection({ ...input, source: Buffer.from([254]) }));
});

async function fixture(t, source) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-proof-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return file; };
  await put('adg.config.mjs', 'export default {};'); await put('.gitignore', 'state/\n');
  await put('design/tokens.css', tokens); await put('design/components/a.tsx', source);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture'); git('add', '.'); git('commit', '-qm', 'fixture base');
  const state = path.join(root, 'state');
  return { root, put, git, state, config: await loadConfig(root), values: { json: true, base: 'HEAD', 'state-dir': state } };
}
const all = data => data.frames.flatMap(group => group.frames.flatMap(frame => group.rows.flatMap(row => row.themes.map(theme => ({ source: group.source, frame, theme, ...row })))));

test('fresh index execution runs each TSX once per operation and reconstructs the exact builder document', async t => {
  const f = await fixture(t, `import {Frame} from 'adg';const value=Date.now()+':'+Math.random();export default()=> <Frame name="a"><div>{value}</div></Frame>;`);
  const source = 'design/components/a.tsx';
  const cache = await openProjectIndex(f.config, { stateDirectory: f.state }); await cache.source(source); await cache.close();
  const index = await openProjectIndex(f.config, { stateDirectory: f.state, persist: false, fresh: true });
  try {
    const first = await index.materialize(source), again = await index.materialize(source);
    assert.equal(first, again); assert.equal((await index.stats()).materializations.attempts, 1);
    for (const theme of ['light', 'dark']) assert.equal(first.frames[0].document(theme), frameDocument(first.frames[0], theme, first.cssBeforeTokens + first.tokenCss + first.cssAfterTokens));
  } finally { await index.close(); }
  const result = await impact(f.config, f.values);
  assert.equal(result.data.coverage.renderRows, 2); assert.equal(result.data.coverage.provenRows, 0);
  assert.equal(result.data.coverage.proofComplete, true); assert.equal(result.data.coverage.unassessedRows, 0);
  assert.ok(all(result.data).every(row => row.disposition === 'render' && row.candidate === false));
  const human = [];
  await impact(f.config, { ...f.values, json: false }, { log: line => human.push(line) });
  assert.match(human[0], /1 listed frames/);
});

test('Git lifecycle rows never prove, parents always render, and proven candidates retain grouped metadata', async t => {
  const source = `import {Frame} from 'adg';export default()=> ['a','b'].map(name=><Frame name={name}><div id="part">Same</div></Frame>);`;
  const f = await fixture(t, source);
  await f.put('design/components/a.tsx', source + '\n// comment\n');
  const result = await impact(f.config, f.values);
  assert.equal(result.data.coverage.provenRows, 4); assert.equal(result.data.coverage.renderRows, 0);
  assert.deepEqual(result.data.frames[0].frames, ['a', 'b']);
  assert.deepEqual(result.data.frames[0].rows[0].themes, ['light', 'dark']);
  assert.deepEqual(result.data.frames[0].rows[0].proof, { kind: 'materialized_inputs_equal', version: 1, tokenMode: 'reachable_declarations' });
  assert.ok((await impact(f.config, { ...f.values, explain: true })).data.frames[0].rows[0].proof.projection);
  await f.put('design/components/part.tsx', `import {Frame} from 'adg';export default()=> <Frame name="new" parent={{source:'design/components/a.tsx',frame:'a',selector:'#part'}}><div>Same</div></Frame>;`);
  const lifecycle = await impact(f.config, f.values);
  const rows = all(lifecycle.data);
  assert.ok(rows.filter(row => row.frame === 'new' || row.frame === 'a').every(row => row.disposition === 'render' && !row.proof));
  assert.ok(rows.filter(row => row.frame === 'new').every(row => row.unassessedReasons.includes('missing_side')));
  assert.ok(rows.filter(row => row.frame === 'a').every(row => row.reasons.some(reason => reason.scope === 'support')));
  const hypothetical = await impact(f.config, { ...f.values, base: undefined, source: ['components/a'] });
  assert.equal(hypothetical.data.coverage.provenRows, 0); assert.equal(hypothetical.data.coverage.proofComplete, false);
});

test('unchanged ineligible documents render with existing reasons and no proof', async t => {
  const f = await fixture(t, `import {Frame} from 'adg';export default()=> <Frame name="a"><div><img src="https://example.invalid/a.png"/></div></Frame>;`);
  const result = await impact(f.config, f.values);
  assert.equal(result.data.coverage.renderRows, 2); assert.ok(all(result.data).every(row => row.unassessedReasons.includes('external_resource')));
});

test('generation validation rejects config-result, token and resolution changes, discarding proofs', async t => {
  for (const mutation of ['config', 'invalid_config_result', 'token', 'resolution', 'shutdown', 'syntax']) {
    const f = await fixture(t, `import {Frame} from 'adg';export default()=> <Frame name="a"><div>Same</div></Frame>;`);
    if (['config', 'invalid_config_result'].includes(mutation)) { await f.put('adg.config.mjs', 'export default {name:globalThis.adgProofFixtureName??"before"};'); f.config = await loadConfig(f.root); }
    let changed = false;
    await assert.rejects(impact(f.config, f.values, { openIndex: async (cfg, options) => {
      const index = await openProjectIndex(cfg, options), verify = index.verifyInputs;
      if (['shutdown', 'syntax'].includes(mutation) && cfg.root === await import('node:fs/promises').then(fs => fs.realpath(f.root))) {
        const close = index.close;
        index.close = async () => { await close(); await f.put(mutation === 'syntax' ? 'adg.config.mjs' : 'design/tokens.css', mutation === 'syntax' ? 'invalid code' : tokens + '\n'); };
      }
      if (path.resolve(cfg.root) === path.resolve(await import('node:fs/promises').then(fs => fs.realpath(f.root)))) index.verifyInputs = async () => {
        if (!changed) {
          changed = true;
          if (mutation === 'config') globalThis.adgProofFixtureName = 'after';
          if (mutation === 'invalid_config_result') globalThis.adgProofFixtureName = '';
          if (mutation === 'token') await f.put('design/tokens.css', tokens + '\n');
          if (mutation === 'resolution') await f.put('design/fixtures/new.ts', 'export const value=1;');
        }
        await verify();
      };
      return index;
    } }), error => {
      assert.equal(error.code, 'IMPACT_INPUT_CHANGED'); assert.equal(error.data.complete, false);
      assert.equal(error.data.coverage.proofComplete, false); assert.equal(error.data.coverage.provenRows, 0);
      assert.ok(all(error.data).every(row => !row.proof)); return true;
    });
    delete globalThis.adgProofFixtureName;
  }
});


test('entry-level scans and segmented comparison preserve the original fixture proof bytes', async t => {
  const f = await fixture(t, `import {Frame} from 'adg';export default()=> ['a','b'].map(name=><Frame name={name}><div class="gap-(--used)" style={{color:'var(--used)'}}>{name}</div></Frame>);`);
  const index = await openProjectIndex(f.config, { persist: false, fresh: true });
  try {
    const build = await index.materialize('design/components/a.tsx'), checker = createEligibilityChecker();
    const fast = entryProjection(build, capturePolicy(f.config));
    const css = (build.cssBeforeTokens + build.cssAfterTokens).replace(/<\/style/gi, '<\\/style');
    const check = checker.withCss(build.css.replace(/<\/style/gi, '<\\/style'));
    for (const theme of ['light', 'dark']) {
      const scan = entryTokenReachability(css, build.tokenCss);
      for (const frame of build.frames) {
        const markup = frameDocument(frame, theme, '');
        const oldReach = tokenReachability(frameDocument(frame, theme, build.cssBeforeTokens + build.cssAfterTokens), build.tokenCss, theme);
        const reach = scan(markup)(theme);
        assert.deepEqual(reach, oldReach);
        assert.deepEqual(check(markup), checker(frame.document(theme)));
        assert.deepEqual(check(frame.html), checker(frame.document(theme)));
        const old = materializedProjection(build, frame, theme, capturePolicy(f.config), oldReach);
        const next = fast(frame, theme, reach);
        assert.equal(next.canonical(), old.bytes);
        assert.deepEqual(equalEntryProof(next, next, true), equalProof(old.bytes, old.bytes, 'materialized_inputs_equal', old.tokenMode, true));
      }
    }
  } finally { await index.close(); }
});
