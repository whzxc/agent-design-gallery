import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { parseImplementationMap, loadImplementationMap, implementationFiles, validateImplementationMap } from '../src/toolkit/implementation-map.mjs';
import { exportBoundaries, resolveLocator, symbolRegions, regionAt, globPattern } from '../src/toolkit/owner-locators.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { check } from '../src/toolkit/commands.mjs';
import { createOutput } from '../src/cli-output.mjs';

const target = { source: 'design/components/button.tsx', part: 'Button', frames: ['primary'] };
const mapping = (implementation = { file: 'ui/controls.tsx', symbol: 'Button' }, design = [target]) => ({ implementation, design });
const json = mappings => JSON.stringify({ version: 1, mappings });
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-owner-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { root, design: path.join(root, 'design'), output: path.join(root, 'output'), sources: ['components', 'surfaces'], check: {} };
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return file; };
  await put('design/tokens.css', starterTokens);
  await put('ui/controls.tsx', 'export function Button() {}\nfunction helper() {}\nexport const Other = 1;\n');
  await put(target.source, `import {Frame} from 'adg';
export function Button(){return <button>Save</button>}
export function Unobserved(){return <i/>}
export const count=1;
export default()=>[<Frame name="primary"><Button/></Frame>,<Frame name="empty"><div/></Frame>];`);
  return { config, put };
}

test('mapping v1 is strict, optional and portable, with no authored line ranges', async t => {
  const { config, put } = await fixture(t);
  assert.equal((await loadImplementationMap(config)).present, false);
  const valid = [mapping(), mapping({ directory: 'ui/' }), mapping({ glob: 'ui/**/*.tsx' }), mapping({ file: 'native/control.rs', symbol: 'Control', anchor: 'fn Control(' })];
  assert.equal(parseImplementationMap(json(valid)).mappings.length, 4);
  const bad = [
    '{', '{}', '{"version":2,"mappings":[]}', '{"version":1,"mappings":[],"extra":true}',
    ...[
      { file: 'ui/a.ts', lines: [1, 2] }, { file: '../a.ts' }, { file: '/a.ts' }, { file: 'C:/a.ts' },
      { file: 'ui\\a.ts' }, { file: 'ui/a.ts#Button' }, { file: './ui/a.ts' }, { file: 'ui//a.ts' },
      { file: 'ui/a.ts', directory: 'ui/' }, { directory: 'ui' }, { glob: 'ui/**x/a.ts' }, { glob: 'ui/[ab].ts' },
      { file: 'native/a.rs', symbol: 'A' }, { file: 'ui/a.ts', symbol: '' }, { file: 'ui/a.ts', anchor: 'a' },
    ].map(selector => json([mapping(selector)])),
    json([mapping(undefined, [])]), json([mapping(undefined, [{ ...target, frames: [] }])]),
    json([mapping(undefined, [{ ...target, source: 'design/fixture.ts' }])]),
    json([mapping(undefined, [{ ...target, extra: true }])]),
  ];
  for (const text of bad) assert.throws(() => parseImplementationMap(text), { code: 'OWNER_MAP_INVALID' });
  await put('design/implementation.json', json(valid));
  assert.equal((await loadImplementationMap(config)).source, 'design/implementation.json');
});

test('lexical symbols handle declaration forms, ambiguity, explicit overrides and CRLF', () => {
  const text = ['// before', 'export function Button() {}', 'function helper() {}', 'export default async function Other() {}',
    'export function* Generator() {}', 'export class Model {}', 'export const Value=1;', 'export let Mutable=2;', 'export var Legacy=3;', '  export const Indented=4;'].join('\r\n');
  const names = exportBoundaries(text, 'ui/controls.tsx').map(boundary => boundary.symbol);
  assert.deepEqual(names, ['Button', 'Other', 'Generator', 'Model', 'Value', 'Mutable', 'Legacy']);
  for (const name of names) assert.equal(resolveLocator(text, { file: 'ui/controls.tsx', symbol: name }).stale, false);
  for (const extension of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs']) assert.equal(resolveLocator(text, { file: `ui/controls.${extension}`, symbol: 'Button' }).line, 2);
  assert.equal(resolveLocator(text, { file: 'ui/controls.tsx', symbol: 'helper' }).stale, true);
  assert.equal(resolveLocator(text, { file: 'ui/controls.tsx', symbol: 'ButtonLonger' }).stale, true);
  assert.deepEqual(resolveLocator(text + '\r\nexport const Button=1;', { file: 'ui/controls.tsx', symbol: 'Button' }).candidates, [2, 11]);
  assert.equal(resolveLocator(text, { file: 'ui/controls.tsx', symbol: 'Helper', anchor: 'function helper() {}\r\nexport default' }).line, 3);
  assert.equal(resolveLocator('aaaa', { file: 'native/a.rs', symbol: 'A', anchor: 'aa' }).stale, true);
  assert.equal(resolveLocator('fn A() {}', { file: 'native/a.rs', symbol: 'A', anchor: 'fn A()' }).line, 1);
});

test('regions stop at unmapped exports and preserve preceding-export helper ownership', () => {
  const text = '// before\nexport function Button() {}\nfunction helper() {}\nexport const Other=1;\n// tail';
  const selectors = [{ file: 'ui/a.ts', symbol: 'Button' }];
  const regions = symbolRegions(text, 'ui/a.ts', selectors);
  assert.equal(regionAt(regions, 1), null);
  assert.deepEqual(regionAt(regions, 3), { line: 2, symbol: 'Button', mapped: ['Button'], nextBoundaryLine: 4 });
  assert.deepEqual(regionAt(regions, 5).mapped, []);
  const explicit = symbolRegions(text, 'ui/a.ts', [...selectors, { file: 'ui/a.ts', symbol: 'helper', anchor: 'function helper()' }]);
  assert.deepEqual(regionAt(explicit, 3).mapped, ['helper']);
  const native = symbolRegions('intro\nfn A(){}\nbody\nfn B(){}', 'native/a.rs', [{ file: 'native/a.rs', symbol: 'A', anchor: 'fn A()' }]);
  assert.deepEqual(regionAt(native, 4).mapped, ['A']);
});

test('selector expansion includes zero-depth ** and excludes generated/vendor paths and escapes', async t => {
  const { config, put } = await fixture(t);
  await put('ui/nested/view.tsx', 'view');
  for (const name of ['ui/.git/a.tsx', 'ui/node_modules/a.tsx', 'ui/.adg/a.tsx', 'output/a.tsx']) await put(name, 'excluded');
  assert.deepEqual(await implementationFiles(config, { glob: 'ui/**/*.tsx' }), ['ui/controls.tsx', 'ui/nested/view.tsx']);
  assert.deepEqual(await implementationFiles(config, { directory: 'ui/nested/' }), ['ui/nested/view.tsx']);
  assert.deepEqual(await implementationFiles(config, { glob: 'ui/controls.tsx' }), ['ui/controls.tsx']);
  assert.deepEqual(await implementationFiles(config, { file: 'ui/missing.tsx' }), []);
  assert.deepEqual(await implementationFiles(config, { directory: 'ui/controls.tsx/' }), []);
  assert.ok(!(await implementationFiles(config, { glob: '**/*.tsx' })).includes('output/a.tsx'));
  assert.equal(globPattern('ui/?.tsx').test('ui/a.tsx'), true);
  const outside = await mkdtemp(path.join(tmpdir(), 'adg-outside-')); t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'escape.tsx'), 'outside');
  await symlink(path.join(outside, 'escape.tsx'), path.join(config.root, 'ui/escape.tsx'));
  await assert.rejects(implementationFiles(config, { glob: 'ui/**/*.tsx' }), { code: 'OWNER_MAP_INVALID' });
});

test('semantic mapping validation distinguishes missing bindings, part coverage and duplicates', async t => {
  const { config, put } = await fixture(t);
  await put('design/implementation.json', json([
    mapping(), mapping(), mapping({ file: 'ui/missing.tsx' }), mapping({ file: 'ui/controls.tsx', symbol: 'Renamed' }),
    mapping(undefined, [{ ...target, source: 'design/components/missing.tsx' }]),
    mapping(undefined, [{ ...target, part: 'Missing' }]), mapping(undefined, [{ ...target, frames: ['missing'] }]),
    mapping(undefined, [{ ...target, frames: ['empty'] }]), mapping(undefined, [{ ...target, part: 'Unobserved', frames: undefined }]),
  ]));
  const built = await buildSource(config, path.join(config.root, target.source), { write: false });
  assert.deepEqual(built.parts, ['Button', 'Unobserved']);
  const result = await validateImplementationMap(config, await loadImplementationMap(config), { sources: [target.source], getBuild: async () => built });
  assert.deepEqual(result.findings.map(f => f.code), ['OWNER_MAPPING_DUPLICATE', 'OWNER_IMPLEMENTATION_MISSING', 'OWNER_LOCATOR_STALE', 'OWNER_SOURCE_MISSING', 'OWNER_PART_MISSING', 'OWNER_FRAME_MISSING', 'OWNER_PART_FRAME_MISMATCH']);
  assert.equal(result.bindings[0].active, true);
  assert.deepEqual(result.bindings.at(-1).frames, []);
  assert.equal(result.bindings.at(-1).active, true);
  assert.equal(result.findings.every(f => f.source === 'design/implementation.json' && f.message.includes(f.pointer)), true);
  assert.ok(result.findings.every(f => f.line === 1 && f.column > 0), 'loaded JSON findings identify their value tokens');
  assert.equal(existsSync(path.join(config.design, '.adg')), false);
});

function browserDouble() {
  let closed = false;
  const browser = { isConnected: () => true, close: async () => { closed = true; }, newPage: async () => ({
    context: () => ({ browser: () => browser }), emulateMedia: async () => {}, setViewportSize: async () => {}, setContent: async () => {},
    locator: () => ({ boundingBox: async () => ({ width: 10, height: 10 }) }), evaluate: async fn => fn.name === 'inspectFrame' ? [] : undefined,
  }) };
  return { browser, closed: () => closed };
}

test('read-only check reports semantic OWNER findings at exit 1 and malformed shape at exit 2', async t => {
  const { config, put } = await fixture(t), double = browserDouble();
  await put('design/implementation.json', json([mapping({ file: 'ui/controls.tsx', symbol: 'Missing' })]));
  let output = '';
  const sink = createOutput({ json: true, command: 'check', stdout: text => { output += text; }, stderr: () => {} });
  await assert.rejects(check(config, [], { 'read-only': true }, () => {}, () => {}, { launchBrowser: async () => double.browser }), error => {
    assert.equal(sink.failure(error), 1); assert.equal(error.data.complete, true);
    assert.deepEqual(error.data.findings.map(f => f.code), ['OWNER_LOCATOR_STALE']);
    return true;
  });
  assert.equal(JSON.parse(output).error.code, 'CHECK_FAILED'); assert.equal(double.closed(), true);
  assert.equal(existsSync(path.join(config.design, '.adg')), false);
  assert.deepEqual((await readFile(path.join(config.root, 'ui/controls.tsx'), 'utf8')).split('\n')[0], 'export function Button() {}');
  await put('design/implementation.json', json([mapping({ file: 'ui/controls.tsx', lines: [1, 2] })]));
  await assert.rejects(check(config, [], { 'read-only': true }, () => {}, () => {}, { launchBrowser: async () => assert.fail('syntax rejection launched browser') }), error => {
    output = ''; assert.equal(sink.failure(error), 2);
    const envelope = JSON.parse(output); assert.equal(envelope.error.code, 'OWNER_MAP_INVALID');
    assert.deepEqual(envelope.error.next[0].argv, ['adg', 'check', '--read-only', '--json']);
    assert.equal(envelope.data.complete, false); return true;
  });
});

test('source-qualified check scopes semantic mappings but validates global syntax', async t => {
  const { config, put } = await fixture(t);
  await put('design/components/other.tsx', `import {Frame} from 'adg';export default()=> <Frame name="other"><div/></Frame>;`);
  await put('design/implementation.json', json([mapping(), mapping({ file: 'ui/missing.tsx' }, [{ source: 'design/components/other.tsx' }])]));
  const double = browserDouble();
  const result = await check(config, ['components/button'], { 'read-only': true }, () => {}, () => {}, { launchBrowser: async () => double.browser });
  assert.equal(result.data.complete, true); assert.deepEqual(result.data.findings, []);
  await assert.rejects(check(config, [], { 'read-only': true }, () => {}, () => {}, { launchBrowser: async () => browserDouble().browser }), { code: 'CHECK_FAILED' });
});

test('mapping check retains earlier findings when a target build cannot complete', async t => {
  const { config, put } = await fixture(t);
  await put(target.source, 'export default()=> broken syntax');
  await put('design/implementation.json', json([mapping({ file: 'ui/missing.tsx' })]));
  await assert.rejects(check(config, [], { 'read-only': true }, () => {}, () => {}, { launchBrowser: async () => browserDouble().browser }), error => {
    assert.equal(error.code, 'SOURCE_BUILD_FAILED'); assert.equal(error.data.complete, false);
    assert.deepEqual(error.data.findings.map(f => f.code), ['OWNER_IMPLEMENTATION_MISSING']);
    return true;
  });
});
