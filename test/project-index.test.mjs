import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { createIndexStore, indexDigest } from '../src/toolkit/index-store.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { sourceRelationships } from '../public/relationships.js';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-index-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { root, design: path.join(root, 'drawings'), output: path.join(root, 'output'), arch: path.join(root, 'arch'), sources: ['components', 'surfaces'] };
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return file; };
  await put('drawings/tokens.css', starterTokens.replace('--text: #171717;', '--text: #171717;\n  --accent: var(--text);'));
  await put('drawings/fixtures/value.ts', 'export const text="First";');
  await put('drawings/components/button.tsx', `import {Frame} from 'adg';import {text} from '../fixtures/value';
export function Button(){return <button>{text}</button>}
export function Unobserved(){return <span/>}
export default()=> <Frame name="primary"><Button/></Frame>;`);
  await put('drawings/surfaces/home.tsx', `import {Frame} from 'adg';import {Button} from '../components/button';export {Button};export default()=> <Frame name="home"><main><Button/></main></Frame>;`);
  await put('arch/example.mmd', 'flowchart LR\n a-->b');
  await put('arch/example.md', '---\nowners:\n  - ui/**\nstatus: Reviewed\n---\nNotes');
  await put('ui/control.ts', 'export function Button() {}\nexport const Unmapped=1;');
  await put('drawings/implementation.json', JSON.stringify({ version: 1, mappings: [{ implementation: { file: 'ui/control.ts', symbol: 'Button' }, design: [{ source: 'drawings/components/button.tsx', part: 'Button' }] }] }));
  return { config, put, stateDirectory: path.join(root, 'external-state') };
}

test('lazy projections preserve provenance, tokens, graph shape and architecture owners without rendering diagrams', async t => {
  const f = await fixture(t), index = await openProjectIndex(f.config, { persist: false, stateDirectory: f.stateDirectory }); t.after(() => index.close());
  assert.deepEqual(index.inventory.tsx, ['drawings/components/button.tsx', 'drawings/surfaces/home.tsx']);
  assert.equal((await index.stats()).builds, null);
  const facts = await index.source('drawings/surfaces/home.tsx');
  assert.deepEqual(facts.parts, [], 're-export is owned by its defining source');
  assert.deepEqual(facts.frames[0].parts, [{ source: 'drawings/components/button.tsx', part: 'Button' }]);
  assert.ok(facts.dependencies.includes('drawings/fixtures/value.ts')); assert.equal(facts.frames[0].html, undefined);
  const tokens = index.tokens(); assert.deepEqual(tokens.find(t => t.name === '--accent').values[1], { theme: 'dark', declaration: 'var(--text)', inherited: true, line: 6, references: ['--text'] });
  const architecture = await index.architecture('arch/example.mmd');
  assert.deepEqual(architecture.owners, ['ui/**']); assert.deepEqual(architecture.ownerLines, [3]); assert.equal(architecture.status, 'Reviewed');
  const graph = await index.relationships();
  assert.deepEqual(graph, sourceRelationships([{ path: 'components/button.tsx', imports: [] }, { path: 'surfaces/home.tsx', imports: ['components/button.tsx'] }, { path: 'arch/example.mmd', imports: [] }]));
  const mappings = await index.mappings(); assert.deepEqual(mappings.findings, []);
  assert.deepEqual(mappings.bindings[0].frames, ['primary']);
  assert.equal(existsSync(f.stateDirectory), false); assert.equal(existsSync(path.join(f.config.design, '.adg')), false);
});

test('persistent projections invalidate dependencies, tokens, mappings and sidecars without rebuilding unrelated designs', async t => {
  const f = await fixture(t); let index;
  async function reopen() { await index?.close(); index = await openProjectIndex(f.config, { stateDirectory: f.stateDirectory }); return index; }
  t.after(() => index?.close());
  await reopen(); await index.source('drawings/components/button.tsx'); await index.architecture('arch/example.mmd');
  assert.equal((await index.stats()).builds.builds, 1);
  await reopen(); const before = await index.source('drawings/components/button.tsx');
  assert.equal((await index.stats()).builds.builds, 0); assert.equal((await index.stats()).shards.diskHits, 1);
  await f.put('ui/control.ts', '// unrelated insertion\nexport function Button() {}\nexport const Other=2;');
  await f.put('arch/example.md', '---\nowners:\n  - ui/control.ts\n---\nChanged');
  await reopen(); const map = await index.mappings(); assert.equal(map.bindings[0].anchorLine, 2);
  assert.deepEqual((await index.architecture('arch/example.mmd')).owners, ['ui/control.ts']);
  assert.equal((await index.stats()).builds.builds, 0);
  await f.put('drawings/fixtures/value.ts', 'export const text="Changed";');
  await reopen(); assert.match((await index.getBuild('drawings/components/button.tsx')).frames[0].html, /Changed/);
  assert.equal((await index.stats()).builds.builds, 1);
  await f.put('drawings/tokens.css', starterTokens.replace('#171717', '#222222'));
  await reopen(); assert.notDeepEqual(index.tokens().find(t => t.name === '--text').values[0].declaration, '#171717');
  await index.source('drawings/components/button.tsx'); assert.equal((await index.stats()).builds.builds, 1);
  await f.put('drawings/implementation.json', JSON.stringify({ version: 1, mappings: [{ implementation: { file: 'ui/control.ts', symbol: 'Missing' }, design: [{ source: 'drawings/components/button.tsx' }] }] }));
  await reopen(); assert.equal((await index.mappings()).findings[0].code, 'OWNER_LOCATOR_STALE');
  assert.equal((await index.stats()).builds.builds, 0);
  await f.put('drawings/components/new.tsx', `import {Frame} from 'adg';export default()=> <Frame name="new"><div/></Frame>;`);
  await unlink(path.join(f.config.design, 'surfaces/home.tsx'));
  await reopen(); assert.deepEqual(index.inventory.tsx, ['drawings/components/button.tsx', 'drawings/components/new.tsx']);
  assert.equal(before.source, 'drawings/components/button.tsx');
});

test('index shards are atomic, bounded, disposable and safe across concurrent writers', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-shards-')); let store;
  t.after(async () => { await store?.close(); await rm(directory, { recursive: true, force: true }); });
  const options = { directory, memoryLimit: 160, diskLimit: 250 };
  store = await createIndexStore(options); const other = await createIndexStore(options);
  await Promise.all([store.put('first', { value: 'a'.repeat(70) }), other.put('second', { value: 'b'.repeat(70) })]);
  await other.close(); await store.close(); store = await createIndexStore(options);
  const blobs = (await readdir(directory)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
  const bytes = await Promise.all(blobs.map(name => readFile(path.join(directory, name)))); assert.ok(bytes.reduce((n, b) => n + b.length, 0) <= 250);
  assert.ok(!(await readdir(directory)).some(name => name.endsWith('.tmp')));
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); assert.equal(manifest.version, 1);
  await store.put('huge', { value: 'x'.repeat(500) }); assert.equal(await store.get('huge'), null);
  await writeFile(path.join(directory, indexDigest('broken') + '.json'), '{'); assert.equal(await store.get('broken'), null);
  await store.put('broken', { repaired: true }); assert.deepEqual(await store.get('broken'), { repaired: true });
  assert.ok(store.stats().memoryBytes <= 160);
});

test('cold shard batches inventory the directory once and publish one manifest at close', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-batch-'));
  const store = await createIndexStore({ directory });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  for (let i = 0; i < 100; i++) await store.put(`key-${i}`, { i });
  assert.equal(store.stats().directoryScans, 1); assert.equal(store.stats().manifestWrites, 0);
  await store.close(); assert.equal(store.stats().directoryScans, 2); assert.equal(store.stats().manifestWrites, 1);
});

test('palette queries reuse their environment and bound standalone color entries to 128', async t => {
  const f = await fixture(t), index = await openProjectIndex(f.config, { persist: false, stateDirectory: f.stateDirectory });
  t.after(() => index.close()); let collected = 0;
  const read = async () => { collected++; return [1,2,3,255]; };
  await index.color('first','font-a',read); await index.color('first','font-a',read); assert.equal(collected,1);
  await index.color('first','font-b',read); assert.equal(collected,2);
  for(let i=0;i<128;i++)await index.color(`color-${i}`,'font-a',read);
  await index.color('first','font-a',read); assert.equal(collected,131,'oldest expression was evicted');
  let palettes=0;const tokens=index.tokens();
  await index.palette(tokens,'light','font-a',async()=>{palettes++;return[];});
  await index.palette(tokens,'light','font-a',async()=>assert.fail('palette cache missed'));
  await index.palette(tokens,'dark','font-a',async()=>{palettes++;return[];});assert.equal(palettes,2);
});
