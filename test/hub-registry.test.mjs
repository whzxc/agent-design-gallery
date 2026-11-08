import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, realpath, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { addRoot, removeRoot, listRoots, scanRoots, listProjects, projectSlug } from '../src/hub/registry.mjs';
import { loadConfig, discoverRoot } from '../src/toolkit/config.mjs';

async function fixture(t) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sdg-registry-')));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'roots'), state = path.join(temporary, 'state');
  await mkdir(root);
  const project = async (relative, extension = 'mjs', config = '{}') => {
    const directory = path.join(root, relative);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `sdg.config.${extension}`), `export default ${config};`);
    return directory;
  };
  return { root, state, project };
}

test('root scans only config projects within depth and skips hidden, node_modules, symlinks and worktrees', async t => {
  const { root, state, project } = await fixture(t);
  const expected = [await project('one'), await project('group/two', 'js')];
  await project('group/deep/three', 'ts');
  await project('.hidden/project');
  await project('node_modules/project');
  const worktree = await project('worktree');
  await writeFile(path.join(worktree, '.git'), 'gitdir: /unused/path');
  await project('worktree/nested');
  await symlink(worktree, path.join(root, 'linked-project'));
  await mkdir(path.join(root, 'design-only/design'), { recursive: true });
  await writeFile(path.join(root, 'design-only/design/sample.tsx'), '<div/>');
  await addRoot(root, 2, state);
  assert.deepEqual((await listProjects(state)).map(project => project.path), expected.sort());
  assert.equal((await listRoots(state))[0].projectCount, 2);
  await scanRoots(root, state);
  assert.equal((await listRoots(state))[0].depth, 2);
  await addRoot(root, 3, state);
  assert.equal((await listProjects(state)).length, 3);
  await assert.rejects(addRoot(root, 4, state), /0 to 3/);
  await assert.rejects(addRoot(root, -1, state), /0 to 3/);
  await removeRoot(root, state);
  assert.deepEqual(await listProjects(state), []);
});

test('registry changes only on explicit scans, deduplicates overlapping roots and preserves deterministic routes', async t => {
  const { root, state, project } = await fixture(t), first = await project('first');
  await addRoot(root, undefined, state);
  const original = await listProjects(state);
  await project('second');
  assert.equal((await listProjects(state)).length, 1);
  await scanRoots(undefined, state);
  assert.equal((await listProjects(state)).length, 2);
  await addRoot(first, 0, state);
  assert.equal((await listProjects(state)).length, 2);
  assert.equal((await listProjects(state)).find(item => item.path === first).slug, original[0].slug);
  assert.equal(original[0].slug, projectSlug(first));
  assert.notEqual(projectSlug(first), projectSlug(path.join(root, 'other/first')));
  await assert.rejects(scanRoots(path.dirname(root), state), /not registered/);
});

test('TypeScript config loads via esbuild without generated files and metadata reports incompatible requirements', async t => {
  const { root, state, project } = await fixture(t);
  const typed = await project('typed', 'ts', "{ name: 'Typed project', requires: '>=99.0.0', design: 'drawings' } satisfies Record<string, string>");
  await mkdir(path.join(typed, 'drawings/components'), { recursive: true });
  await writeFile(path.join(typed, 'drawings/components/button.tsx'), 'export default () => null;');
  assert.equal(discoverRoot(path.join(typed, 'drawings')), typed);
  await assert.rejects(loadConfig(typed), /does not satisfy/);
  const config = await loadConfig(typed, { checkVersion: false });
  assert.equal(config.name, 'Typed project');
  assert.equal(config.compatible, false);
  assert.deepEqual((await readdir(typed)).sort(), ['drawings', 'sdg.config.ts']);
  await addRoot(root, 2, state);
  const [metadata] = await listProjects(state);
  assert.equal(metadata.sourceCount, 1);
  assert.equal(metadata.frameCount, null);
  assert.equal(metadata.compatibility.compatible, false);
  assert.equal(metadata.compatibility.requires, '>=99.0.0');
});
