import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, truncate, utimes } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createBuildStore } from '../src/toolkit/build-store.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-build-store-'));
  const config = { root, design: path.join(root, 'design'), output: path.join(root, 'output'), sources: ['components', 'surfaces'] };
  await mkdir(path.join(config.design, 'components'), { recursive: true });
  await mkdir(path.join(config.design, 'fixtures'));
  await writeFile(path.join(config.design, 'tokens.css'), starterTokens);
  await writeFile(path.join(config.design, 'fixtures/value.json'), '{"label":"first"}');
  const source = "import {Frame} from 'adg';import value from '../fixtures/value.json';export default()=> <Frame name=\"sample\" width={120} height={40}><div>{value.label}</div></Frame>;\n";
  await writeFile(path.join(config.design, 'components/example.tsx'), source);
  t.after(() => rm(root, { recursive: true, force: true }));
  return { config, source, cacheDirectory: path.join(root, 'cache') };
}

test('worker cache preserves exact build bytes, dependency invalidation and restart metadata', async t => {
  const f = await fixture(t), name = 'components/example.tsx';
  let store = await createBuildStore(f); t.after(() => store.close());
  const first = await store.get(name), direct = await buildSource(f.config, path.join(f.config.design, name), { write: false });
  assert.deepEqual(first.frames, JSON.parse(JSON.stringify(direct.frames.map(({ document, ...frame }) => frame))));
  assert.equal(first.css, direct.css);
  assert.ok(first.dependencies.includes('fixtures/value.json'));
  assert.equal(store.stats().workers, 1);
  await writeFile(path.join(f.config.design, name), f.source + '// comment-only save\n');
  assert.deepEqual(store.invalidate([name]), [name]);
  const comment = await store.get(name);
  assert.equal(comment.hash, first.hash);
  assert.notEqual(comment.inputHash, first.inputHash);
  await store.close(); store = await createBuildStore(f);
  const metadata = await store.metadata();
  assert.equal(metadata[0].hash, first.hash); assert.equal(metadata[0].frames[0].html, undefined);
  assert.equal((await store.get(name)).hash, first.hash); assert.equal(store.stats().attempts, 0);
  await writeFile(path.join(f.config.design, 'fixtures/value.json'), '{"label":"second"}');
  await store.close(); store = await createBuildStore(f);
  assert.deepEqual(await store.metadata(), []);
  const changed = await store.get(name);
  assert.notEqual(changed.hash, first.hash); assert.match(changed.frames[0].html, /second/);
  assert.equal(store.stats().attempts, 1);
  // Sparse data makes the real blob exceed the disk budget without adding IO.
  const filler=path.join(f.cacheDirectory,'0'.repeat(64)+'.json');
  await writeFile(filler,'');await truncate(filler,256*1024*1024);
  const future=new Date(Date.now()+60000);await utimes(filler,future,future);
  store.invalidate([name]);await store.get(name);
  assert.equal((await store.metadata()).length,1,'blob eviction keeps learned source metadata');
  assert.deepEqual(store.invalidate(['fixtures/value.json']),[name],'blob eviction keeps reverse dependency edges');
});

test('repeated builds recycle module lifetime and cancel unknown superseded consumers', async t => {
  const f = await fixture(t), store = await createBuildStore(f), name = 'components/example.tsx';
  t.after(() => store.close());
  const pending = store.get(name);
  assert.ok(store.invalidate(['fixtures/value.json']).includes(name));
  await assert.rejects(pending, { name: 'AbortError' });
  for (let revision = 0; revision < 33; revision++) {
    await writeFile(path.join(f.config.design, name), f.source + `// revision ${revision}\n`);
    store.invalidate([name]); await store.get(name);
  }
  assert.ok(store.stats().recycled >= 1);
  assert.ok(store.stats().workers <= 2);
  assert.ok(store.stats().memoryBytes <= 32 * 1024 * 1024);
  const current = await store.get(name);
  assert.deepEqual(store.invalidate(['fixtures/value.json']), [name]);
  assert.deepEqual(store.invalidate(['fixtures/value.json']), [name], 'reverse edges survive invalidation before a replacement build');
  assert.equal((await store.get(name)).hash, current.hash);
});
