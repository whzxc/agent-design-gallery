import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/toolkit/config.mjs';
import { migrate, rewriteImports } from '../src/toolkit/migrate.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { service, renderLaunchAgent, SERVICE_LABEL } from '../src/service.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
async function temporary(t) {
  const base = new URL('../output/adg-rename/tests/', import.meta.url);
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(fileURLToPath(base), 'case-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function put(root, name, content) {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

test('migrate renames each config suffix, imports, editor paths and nested ignores, then rebuilds types', async t => {
  for (const ext of ['mjs', 'js', 'ts']) {
    const root = await temporary(t), changes = [];
    await put(root, 'package.json', '{"type":"module"}');
    await put(root, `sdg.config.${ext}`, "export default { design: 'drawings' };");
    const file = await put(root, 'drawings/components/button.tsx', "import { Frame } from 'sdg'; export default () => <Frame name='a'><button>OK</button></Frame>;");
    await put(root, 'drawings/components/helper.ts', "export { jsx } from 'sdg/jsx-runtime';\n");
    await put(root, 'drawings/tokens.css', starterTokens);
    await put(root, 'drawings/tsconfig.json', '{"compilerOptions":{"jsxImportSource":"sdg","paths":{"sdg":["./.sdg/runtime.d.ts"],"sdg/jsx-runtime":["./.sdg/runtime.d.ts"]}},"include":[".sdg/*.d.ts"]}');
    await put(root, '.gitignore', '/drawings/.sdg/\n# keep sdg notes\nother\n');
    await put(root, 'drawings/.gitignore', '.sdg/\n');
    await put(root, 'drawings/.sdg/stale.js', 'stale');
    await migrate(root, change => changes.push(change));
    assert.ok((await readdir(root)).includes(`adg.config.${ext}`));
    assert.ok(!(await readdir(root)).includes(`sdg.config.${ext}`));
    assert.match(await readFile(file, 'utf8'), /from 'adg'/);
    assert.match(await readFile(path.join(root, 'drawings/components/helper.ts'), 'utf8'), /from 'adg\/jsx-runtime'/);
    assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), '/drawings/.adg/\n# keep sdg notes\nother\n');
    assert.equal(await readFile(path.join(root, 'drawings/.gitignore'), 'utf8'), '.adg/\n');
    assert.doesNotMatch(await readFile(path.join(root, 'drawings/tsconfig.json'), 'utf8'), /sdg/);
    assert.ok(!(await readdir(path.join(root, 'drawings'))).includes('.sdg'));
    assert.match(await readFile(path.join(root, 'drawings/.adg/runtime.d.ts'), 'utf8'), /namespace JSX/);
    assert.ok(changes.some(line => line.startsWith('Renamed')));
    assert.ok(changes.some(line => line.startsWith('Deleted')));
    const before = await readFile(file, 'utf8'), config = await loadConfig(root);
    assert.equal((await buildSource(config, file)).frames.length, 1);
    const again = [];
    await migrate(root, line => again.push(line));
    assert.equal(await readFile(file, 'utf8'), before);
    assert.deepEqual(again, ['Regenerated drawings/.adg/']);
  }
});

test('import rewriting covers runtime subpaths and special specifiers while preserving comments and literals', () => {
  const original = `// import x from 'sdg';
const text = "import x from 'sdg'";
/* export * from 'sdg'; */
import /* runtime */ { Frame } from /* origin */ 'sdg';
import 'sdg/jsx-runtime';
import { Icon } from "sdg";
export { jsxDEV } from "sdg/jsx-dev-runtime";
export * from 'sdg:self';
const runtime = import(/* lazy */ 'sdg');
const unrelated = import('sdg-other');`;
  const result = rewriteImports(original);
  assert.match(result, /from \/\* origin \*\/ 'adg'/);
  assert.match(result, /import 'adg\/jsx-runtime'/);
  assert.match(result, /from "adg"/);
  assert.match(result, /from "adg\/jsx-dev-runtime"/);
  assert.match(result, /from 'adg:self'/);
  assert.match(result, /import\(\/\* lazy \*\/ 'adg'\)/);
  assert.match(result, /\/\/ import x from 'sdg'/);
  assert.match(result, /const text = "import x from 'sdg'"/);
  assert.match(result, /import\('sdg-other'\)/);
  assert.equal(rewriteImports(result), result);
});

test('migrate refuses mixed config names before making any changes', async t => {
  const root = await temporary(t);
  await put(root, 'sdg.config.ts', 'export default {};');
  await put(root, 'adg.config.mjs', 'export default {};');
  const source = await put(root, 'design/components/a.tsx', "import { Frame } from 'sdg';");
  await assert.rejects(migrate(root, () => assert.fail('no mutation output expected')), /Both old and new config names/);
  assert.equal(await readFile(source, 'utf8'), "import { Frame } from 'sdg';");
  assert.ok((await readdir(root)).includes('sdg.config.ts'));
});

test('old-only config produces actionable CLI error, and migration runs from outside the project', async t => {
  const root = await temporary(t);
  await put(root, 'sdg.config.mjs', 'export default {};');
  await assert.rejects(exec(process.execPath, [cli, 'check'], { cwd: root }), error => error.code === 2 && /adg migrate/.test(error.stderr));
  const result = await exec(process.execPath, [cli, 'migrate', root]);
  assert.match(result.stdout, /Renamed sdg.config.mjs -> adg.config.mjs/);
  await assert.rejects(exec(process.execPath, [cli, 'migrate', root, root]), /Invalid arguments/);
});

test('old runtime specifier is unavailable after rename', async t => {
  const root = await temporary(t);
  await put(root, 'adg.config.mjs', 'export default {};');
  await put(root, 'design/tokens.css', starterTokens);
  const file = await put(root, 'design/components/old.tsx', "import {Frame} from 'sdg'; export default () => <Frame name='a'/>;");
  await assert.rejects(buildSource(await loadConfig(root), file), /Bare import sdg is unavailable/);
});

test('service migrate refuses an existing target without launchctl or state changes', async t => {
  const home = await temporary(t), target = path.join(home, 'target');
  await put(target, 'untouched', 'preserved');
  await assert.rejects(service('migrate', { 'state-dir': target }, {
    home, platform: 'darwin', run: () => assert.fail('launchctl must not run'), output: () => assert.fail('no changes'),
  }), /Migration target already exists/);
  assert.equal(await readFile(path.join(target, 'untouched'), 'utf8'), 'preserved');
});

test('service migrate moves whole state, replaces job, preserves port and lists other agents without keys', async t => {
  const home = await temporary(t), oldState = path.join(home, 'old-state'), target = path.join(home, 'new-state');
  const agents = path.join(home, 'Library/LaunchAgents');
  const key = `sdg_${'a'.repeat(64)}`;
  await put(oldState, 'hub.key', key + '\n');
  await put(oldState, 'nested/cache', 'cached');
  await put(oldState, 'registry.json', '{"roots":[]}');
  const oldAgent = await put(agents, 'org.svg-design-gallery.hub.plist', renderLaunchAgent({ nodePath: '/old/node', cliPath: '/old/cli', stateDirectory: oldState, port: 4567 }).replace(SERVICE_LABEL, 'org.svg-design-gallery.hub'));
  const other = await put(agents, 'other.plist', `<string>${oldState}</string><string>${key}</string>`);
  const calls = [], lines = [];
  const result=await service('migrate', { 'state-dir': target }, {
    home, platform: 'darwin', uid: 999, nodePath: process.execPath, cliPath: cli,
    run: async (command, args) => { calls.push([command, ...args]); return { stdout: '' }; },
    output: line => lines.push(line),
  });
  await assert.rejects(readFile(oldAgent), { code: 'ENOENT' });
  await assert.rejects(readdir(oldState), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(target, 'nested/cache'), 'utf8'), 'cached');
  assert.equal(await readFile(path.join(target, 'registry.json'), 'utf8'), '{"roots":[]}');
  assert.equal(await readFile(path.join(target, 'hub.key'), 'utf8'), key.replace('sdg_', 'adg_') + '\n');
  const plist = await readFile(path.join(agents, `${SERVICE_LABEL}.plist`), 'utf8');
  assert.match(plist, /org.agent-design-gallery.hub/);
  assert.ok(plist.includes(target)); assert.ok(plist.includes('<string>4567</string>'));
  assert.ok(lines.includes(other)); assert.ok(!lines.join('\n').includes(key));
  assert.deepEqual(calls.map(call => call[1]), ['print', 'bootout', 'bootstrap', 'print']);
  assert.equal(result.data.complete,true);assert.equal(result.data.service.loaded,true);
  assert.equal(result.data.keyPrefixUpdated,true);assert.deepEqual(result.data.references,[other]);
  assert.equal(result.warnings[0].code,'MIGRATION_REFERENCES_REMAIN');
  assert.equal(await readFile(other, 'utf8'), `<string>${oldState}</string><string>${key}</string>`);
});
