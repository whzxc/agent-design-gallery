import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseCli, main, help } from '../src/cli.mjs';
import { owner, fileRank, compareRanks } from '../src/toolkit/owner.mjs';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { frameOwners } from '../src/toolkit/source-facts.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { nextActions } from '../src/cli-output.mjs';
import { settleOwnerObservation } from '../src/toolkit/owner-observation.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-owner-file-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return file; };
  await put('adg.config.mjs', 'export default {};');
  await put('design/tokens.css', starterTokens.replace('--text: #171717;', '--text: #171717;\n  --accent: var(--text);'));
  for (const name of ['control.ts', 'unmapped.ts', 'stale.ts']) await put(`ui/${name}`, '// before\n\nexport function Button() {}\nconst helper=1;\nexport const Unmapped=2;\nexport class Toggle {}\n');
  await put('ui/style.css', 'button {}');
  await put('ui/panel.ts', 'function Panel() {}');
  await put('design/components/button.tsx', `import {Frame} from 'adg';export function Button(){return <button class="text-accent">Save</button>}
export default()=>['primary','secondary','unbound'].map(name=><Frame name={name}><Button/></Frame>);`);
  await put('design/components/toggle.tsx', `import {Frame} from 'adg';export function Toggle(){return <button>Toggle</button>}export default()=> <Frame name="toggle"><Toggle/></Frame>;`);
  await put('design/surfaces/fallback.tsx', `import {Frame} from 'adg';export default()=> <Frame name="fallback"><div>Fallback</div></Frame>;`);
  await put('design/components/broken.tsx', 'deliberately invalid source');
  const mappings = [
    { implementation: { file: 'ui/control.ts', symbol: 'Button' }, design: [{ source: 'design/components/button.tsx', part: 'Button', frames: ['secondary', 'primary'] }] },
    { implementation: { file: 'ui/control.ts', symbol: 'Toggle' }, design: [{ source: 'design/components/toggle.tsx', part: 'Toggle' }] },
    { implementation: { file: 'ui/control.ts' }, design: [{ source: 'design/surfaces/fallback.tsx' }] },
    { implementation: { file: 'ui/style.css' }, design: [{ source: 'design/components/button.tsx', part: 'Button', frames: ['primary', 'secondary'] }] },
    { implementation: { file: 'ui/stale.ts', symbol: 'Missing' }, design: [{ source: 'design/components/broken.tsx' }] },
    { implementation: { file: 'ui/panel.ts', symbol: 'Panel', anchor: 'function Panel()' }, design: [{ source: 'design/surfaces/fallback.tsx' }] },
  ];
  await put('design/implementation.json', JSON.stringify({ version: 1, mappings }));
  return { root, put, mappings, config: await loadConfig(root), state: path.join(root, 'state') };
}

function browserDouble({ failRead = false, failClose = false, onRead = () => {} } = {}) {
  const counts = { browser: 0, page: 0, loads: 0, reads: 0, pageClosed: 0, browserClosed: 0 }, documents = [];
  let html = '';
  const page = { context: () => ({ browser: () => browser }), emulateMedia: async () => {}, setViewportSize: async () => {},
    setContent: async value => { counts.loads++; html = value; documents.push(value); }, locator: () => ({ boundingBox: async () => ({ width: 100, height: 40 }) }),
    evaluate: async (fn, args) => {
      if (fn.name !== 'collectOwnerObservation') return undefined;
      counts.reads++; await onRead(); if (failRead) throw Error('observation failed');
      const owners = frameOwners(html), box = { x: 0, y: 0, width: 100, height: 40 };
      return { nodes: [{ path: '0', ancestors: ['0'], owners, box }],
        references: owners.length ? [{ path: '0', ancestors: ['0'], owners, box, token: '--accent', property: 'color', declaration: 'var(--accent)', via: [], matchKind: 'token_reference' }] : [],
        palette: args.tokens.map(token => ({ name: token.name, resolved: '#171717', rgba: [23, 23, 23, 255] })) };
    }, close: async () => { counts.pageClosed++; if (failClose) throw Error('page close failed'); } };
  const browser = { isConnected: () => true, newPage: async () => { counts.page++; return page; }, close: async () => { counts.browserClosed++; } };
  return { counts, documents, launch: async () => { counts.browser++; return browser; } };
}
const options = (f, file, extra = {}) => ({ file, 'state-dir': f.state, json: true, ...extra });
const deps = double => ({ launchBrowser: double.launch, environment: async () => 'deterministic-test-environment' });

test('owner parsing, JSON identities, deferred modes, help and recovery preserve argv', async () => {
  for (const mode of ['file', 'text', 'color', 'token']) assert.equal(parseCli(['owner', `--${mode}=value`]).command, 'owner');
  for (const argv of [[], ['--file=a', '--text=b'], ['--file=a', '--file=b'], ['--file='], ['--file=a', '--line=0'], ['--file=a', '--line=1.5'], ['--text=a', '--symbol=B'], ['--color=red', '--contains'], ['--file=a', 'extra'], ['--file=a', '--theme=no']]) assert.throws(() => parseCli(['owner', ...argv]), { code: 'USAGE_INVALID' });
  assert.match(help('owner'), /preceding export/); assert.equal(parseCli(['owner', '--help']).values.help, true);
  for (const mode of ['text', 'color', 'token']) {
    let stdout = ''; const exits = [];
    await main(['owner', `--${mode}=value`, '--json'], '/does/not/exist', { stdout: text => { stdout += text; }, stderr: () => {}, exit: code => exits.push(code) });
    const envelope = JSON.parse(stdout); assert.equal(envelope.command, 'owner'); assert.equal(envelope.error.code, 'USAGE_INVALID'); assert.match(envelope.error.message, /not implemented until segment 3/); assert.deepEqual(exits, [2]);
    assert.deepEqual(envelope.error.next[0].argv, ['adg', 'owner', '--help', '--json']);
  }
  const argv = nextActions('OWNER_UNSETTLED', { command: 'owner', values: { file: 'ui/control.ts', line: '4', symbol: 'Button', theme: 'dark', 'state-dir': '/tmp/state with spaces' } })[0].argv;
  assert.deepEqual(argv, ['adg', 'owner', '--file=ui/control.ts', '--line=4', '--symbol=Button', '--theme=dark', '--state-dir=/tmp/state with spaces', '--json']);
  assert.equal(parseCli(argv.slice(1)).values.line, '4');
  assert.deepEqual(nextActions('OWNER_UNSETTLED', { command: 'owner', values: { file: 'Bearer secret' } })[0].argv, ['adg', 'owner', '--help', '--json']);
});

test('file ranking orders exact selectors, directory/glob specificity and symbol regions', () => {
  const ranks = [fileRank({ file: 'ui/a.ts' }, 'mapping_symbol'), fileRank({ file: 'ui/a.ts' }, 'mapping_symbol_region'), fileRank({ file: 'ui/a.ts' }), fileRank({ directory: 'ui/deep/' }), fileRank({ directory: 'ui/' }), fileRank({ glob: 'ui/deep/*.ts' }), fileRank({ glob: 'ui/**/*.ts' })];
  for (let i = 1; i < ranks.length; i++) assert.ok(compareRanks(ranks[i - 1], ranks[i]) < 0);
  assert.deepEqual(ranks[1], [0, 0, 0, 0, 1]);
});

test('file ownership observes only bound frames, returns provenance/tokens, preserves order and reuses warm shards', async t => {
  const f = await fixture(t), double = browserDouble();
  const result = await owner(f.config, options(f, 'ui/control.ts', { symbol: 'Button' }), deps(double));
  const data = result.data;
  assert.equal(data.complete, true); assert.equal(data.coverage.builtSources, 2, 'only refined owner and file fallback sources are built');
  assert.equal(data.coverage.requestedObservations, 6); assert.equal(double.counts.loads, 6);
  assert.ok(!double.documents.some(html => html.includes('data-adg-frame="unbound"')));
  assert.equal(data.owners[0].part, 'Button'); assert.equal(data.owners[0].matchKind, 'mapping_symbol');
  assert.deepEqual(data.owners[0].frames.map(frame => [frame.frame, frame.theme]), [['primary', 'light'], ['primary', 'dark'], ['secondary', 'light'], ['secondary', 'dark']]);
  assert.deepEqual(data.owners[0].tokens, ['--accent']); assert.equal(data.tokens[0].source, 'design/tokens.css'); assert.equal(data.tokens[0].values[0].line, 6);
  assert.ok(data.owners[0].evidence.some(evidence => evidence.detail.kind === 'mapping' && evidence.owners.some(owner => owner.part === 'Button')));
  assert.equal(data.ambiguous, false); assert.deepEqual([double.counts.pageClosed, double.counts.browserClosed], [1, 1]);
  const warm = await owner(f.config, options(f, 'ui/control.ts', { symbol: 'Button' }), { ...deps(double), launchBrowser: async () => assert.fail('warm query launched a browser') });
  assert.deepEqual(warm, result);
  f.mappings[0].design[0].frames = ['secondary'];
  await f.put('design/implementation.json', JSON.stringify({ version: 1, mappings: f.mappings }));
  const remapped = await owner(f.config, options(f, 'ui/control.ts', { symbol: 'Button' }), { ...deps(double), launchBrowser: async () => assert.fail('mapping edit invalidated unchanged observations') });
  assert.deepEqual(remapped.data.owners[0].frames.map(frame => frame.frame), ['secondary', 'secondary']);
});

test('regions select mapped exports and helpers, with fallback at unmapped and pre-export lines', async t => {
  const f = await fixture(t), double = browserDouble();
  for (const line of ['3', '4']) {
    const { data } = await owner(f.config, options(f, 'ui/control.ts', { line }), deps(double));
    assert.equal(data.owners[0].part, 'Button'); assert.equal(data.owners[0].matchKind, 'mapping_symbol_region');
    const mapping = data.owners[0].evidence.find(evidence => evidence.detail.kind === 'mapping');
    assert.equal(mapping.detail.anchorLine, 3); assert.equal(mapping.detail.nextBoundaryLine, 5);
  }
  for (const line of ['1', '5']) {
    const { data, warnings } = await owner(f.config, options(f, 'ui/control.ts', { line }), deps(double));
    assert.equal(data.owners.length, 1); assert.equal(data.owners[0].part, null); assert.equal(data.coverage.builtSources, 1);
    assert.equal(warnings[0].code, 'OWNER_LOCATOR_UNMAPPED'); assert.equal(data.owners[0].evidence[0].detail.locatorMatched, false);
  }
  const contradictory = await owner(f.config, options(f, 'ui/control.ts', { line: '6', symbol: 'Button' }), deps(double));
  assert.equal(contradictory.data.owners[0].part, null); assert.ok(contradictory.warnings.some(w => w.code === 'OWNER_LOCATOR_UNMAPPED'));
  await assert.rejects(owner(f.config, options(f, 'ui/control.ts', { line: '7' }), deps(double)), { code: 'USAGE_INVALID' });
});

test('directory/glob queries retain all matches and ambiguity, while empty and stale queries launch no browser', async t => {
  const f = await fixture(t), double = browserDouble();
  const exact = await owner(f.config, options(f, path.join(f.root, 'ui/control.ts')), deps(double));
  assert.equal(exact.data.ambiguous, true); assert.ok(exact.warnings.some(w => w.code === 'OWNER_AMBIGUOUS'));
  for (const file of ['ui/', 'ui/*.ts']) {
    const result = await owner(f.config, options(f, file), deps(double));
    assert.ok(result.data.matchedImplementationFiles.includes('ui/control.ts')); assert.ok(result.data.owners.length >= 3);
  }
  for (const file of ['ui/unmapped.ts', 'ui/nothing-*.ts', 'ui/stale.ts']) {
    const result = await owner(f.config, options(f, file), { environment: async () => assert.fail('empty query computed browser environment'), launchBrowser: async () => assert.fail('empty query launched browser') });
    assert.deepEqual(result.data.owners, []); assert.equal(result.data.coverage.builtSources, 0); assert.ok(result.warnings.some(w => w.code === 'OWNER_NO_MATCH'));
    if (file === 'ui/stale.ts') assert.equal(result.data.mappingFindings[0].code, 'OWNER_LOCATOR_STALE');
  }
  await assert.rejects(owner(f.config, options(f, 'ui/missing.ts')), { code: 'OWNER_INPUT_NOT_FOUND' });
  await assert.rejects(owner(f.config, options(f, '../outside')), { code: 'USAGE_INVALID' });
  await assert.rejects(owner(f.config, options(f, 'ui/', { line: '1' })), { code: 'USAGE_INVALID' });
});

test('owner returns one JSON envelope for missing input with exit 2 and for unmapped input with exit 0', async t => {
  const f = await fixture(t);
  for (const [file, code] of [['ui/missing.ts', 2], ['ui/unmapped.ts', 0]]) {
    let stdout = '', stderr = ''; const exits = [];
    await main(['--json', 'owner', `--file=${file}`, `--state-dir=${f.state}`], f.root, { stdout: text => { stdout += text; }, stderr: text => { stderr += text; }, exit: value => exits.push(value) });
    assert.equal(stdout.trimEnd().split('\n').length, 1); const envelope = JSON.parse(stdout);
    assert.equal(envelope.command, 'owner'); assert.equal(envelope.ok, code === 0); assert.deepEqual(exits, [code]);
    assert.equal(stderr, ''); if (code) assert.equal(envelope.data, null); else assert.equal(envelope.data.complete, true);
  }
});

test('directory/glob declarations apply to exact input files with their ranked evidence', async t => {
  const f = await fixture(t), double = browserDouble();
  f.mappings.push({ implementation: { directory: 'ui/' }, design: [{ source: 'design/surfaces/fallback.tsx' }] }, { implementation: { glob: 'ui/*.ts' }, design: [{ source: 'design/components/toggle.tsx' }] });
  await f.put('design/implementation.json', JSON.stringify({ version: 1, mappings: f.mappings }));
  const result = await owner(f.config, options(f, 'ui/unmapped.ts'), deps(double));
  assert.deepEqual(result.data.owners.map(row => row.matchKind), ['mapping_directory', 'mapping_glob']);
  assert.deepEqual(result.data.owners[0].evidence.filter(e => e.detail.kind === 'mapping').map(e => e.detail.implementation), ['ui/unmapped.ts', 'ui/unmapped.ts']);
});

test('absent mappings and parts without a specimen do not start an observation browser', async t => {
  const f = await fixture(t), noBrowser = { launchBrowser: async () => assert.fail('empty frame selection launched a browser'), environment: async () => assert.fail('empty frame selection inspected browser environment') };
  await rm(path.join(f.config.design, 'implementation.json'));
  const absent = await owner(f.config, options(f, 'ui/control.ts'), noBrowser);
  assert.ok(absent.warnings.some(w => w.code === 'OWNER_MAPPING_MISSING')); assert.equal(absent.data.coverage.builtSources, 0);
  await f.put('design/components/button.tsx', `import {Frame} from 'adg';export function Unobserved(){return <i/>}export default()=> <Frame name="specimen"><div/></Frame>;`);
  await f.put('design/implementation.json', JSON.stringify({ version: 1, mappings: [{ implementation: { file: 'ui/control.ts' }, design: [{ source: 'design/components/button.tsx', part: 'Unobserved' }] }] }));
  const part = await owner(f.config, options(f, 'ui/control.ts'), noBrowser);
  assert.equal(part.data.owners[0].part, 'Unobserved'); assert.deepEqual(part.data.owners[0].frames, []); assert.equal(part.data.coverage.requestedObservations, 0);
  assert.ok(part.warnings.some(w => w.code === 'OWNER_PART_UNOBSERVED'));
});

test('render and cleanup failures retain partial results and release page, browser and index', async t => {
  const f = await fixture(t);
  for (const failure of [{ failRead: true }, { failClose: true }, { failRead: true, failClose: true }]) {
    await rm(f.state, { recursive: true, force: true }); const double = browserDouble(failure); let indexClosed = 0;
    await assert.rejects(owner(f.config, options(f, 'ui/style.css'), { ...deps(double), openIndex: async (...args) => {
      const index = await openProjectIndex(...args); const close = index.close; index.close = async () => { indexClosed++; await close(); }; return index;
    } }), error => { assert.equal(error.code, failure.failRead ? 'RENDER_FAILED' : 'SHUTDOWN_FAILED'); assert.equal(error.data.complete, false); assert.equal(error.data.coverage.mappingState, 'valid'); assert.equal(error.data.coverage.builtSources, 1); return true; });
    assert.deepEqual([double.counts.pageClosed, double.counts.browserClosed, indexClosed], [1, 1, 1]);
  }
});

test('mid-query mapping edits fail with OWNER_INDEX_CHANGED and settlement uses a fake clock', async t => {
  const f = await fixture(t); let changed = false;
  const double = browserDouble({ onRead: async () => { if (!changed) { changed = true; await f.put('design/implementation.json', JSON.stringify({ version: 1, mappings: [] })); } } });
  await assert.rejects(owner(f.config, options(f, 'ui/style.css'), deps(double)), { code: 'OWNER_INDEX_CHANGED' });
  let time = 0;
  await assert.rejects(settleOwnerObservation(async () => ({ value: time++ }), async () => { time += 5000; }, () => time), { code: 'OWNER_UNSETTLED' });
});

test('real Chromium scopes related tokens to the bound part and resolves aliases in both themes', async t => {
  const f = await fixture(t);
  await f.put('design/tokens.css', starterTokens.replace('--text: #171717;', '--text: #171717;\n  --accent: var(--text);\n  --sibling: #123456;\n  --fallback: #abcdef;\n  --pseudo: #112233;'));
  await f.put('design/components/button.tsx', `import {Frame} from 'adg';export function Button(){return <button data-free class="before:content-['x'] before:text-pseudo" style={{color:'var(--accent, var(--fallback))'}}>Save</button>}
export default()=>['primary','secondary'].map(name=><Frame name={name} width={160} height={60}><div class="flex h-[60px] w-[160px]"><Button/><span data-free style={{color:'var(--sibling)'}}>Sibling</span></div></Frame>);`);
  const result = await owner(f.config, options(f, 'ui/style.css'), { environment: async () => 'real-chromium-test' });
  const tokens = result.data.owners[0].tokens;
  assert.ok(tokens.includes('--accent')); assert.ok(tokens.includes('--text')); assert.ok(tokens.includes('--fallback')); assert.ok(!tokens.includes('--sibling'));
  assert.ok(tokens.includes('--pseudo'), 'nested Tailwind pseudo rules retain token references');
  assert.deepEqual(result.data.tokens.find(token => token.name === '--accent').values.map(value => value.rgba), [[23, 23, 23, 255], [255, 255, 255, 255]]);
  assert.ok(result.data.owners[0].evidence.some(evidence => evidence.matchKind === 'token_fallback_reference'));
  assert.equal(result.data.coverage.completedObservations, 4);
});
