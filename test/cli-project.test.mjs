import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main, parseCli } from '../src/cli.mjs';
import { CliError, classifyError } from '../src/cli-output.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { loadTokens, readGroups, rejectLegacy, selectSources, sourceDirectories, starterTokens } from '../src/toolkit/project.mjs';
import { parseTokens } from '../src/toolkit/tokens.mjs';
import { launch } from '../src/toolkit/browser.mjs';
import { addRoot, listRoots } from '../src/hub/registry.mjs';
import { startServer } from '../src/server.mjs';
import { compare } from '../src/toolkit/compare.mjs';

async function temporary(t) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-cli-project-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function put(root, name, text) {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return file;
}
async function invoke(args, cwd) {
  const result = { stdout: '', stderr: '', exits: [] };
  await main(args, cwd, {
    stdout: value => { result.stdout += value; }, stderr: value => { result.stderr += value; },
    exit: code => { result.exits.push(code); },
  });
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  result.envelope = JSON.parse(result.stdout);
  assert.equal(result.envelope.schemaVersion, 1);
  assert.equal(result.envelope.ok, result.exits[0] === 0);
  return result;
}
const typed = (code, pattern) => error => {
  assert.ok(error instanceof CliError);
  assert.equal(error.code, code);
  if (pattern) assert.match(error.message, pattern);
  return true;
};

test('link emits structured locators and typed usage failures without network access', async () => {
  const result = await invoke(['link', 'http://127.0.0.1:4311/?key=private', '--asset=components/button.tsx', '--frame=default', '--json'], '/missing/project');
  assert.equal(result.envelope.command, 'link');
  assert.deepEqual(result.envelope.data, { url: 'http://127.0.0.1:4311/?asset=components%2Fbutton.tsx&frame=default' });
  assert.equal(result.stderr, '');
  const failure = await invoke(['link', 'invalid', '--json'], '/missing/project');
  assert.equal(failure.envelope.error.code, 'USAGE_INVALID');
  assert.deepEqual(failure.exits, [2]);
});

test('init records created/skipped files, declarations and ignores in one result', async t => {
  const root = await temporary(t);
  const result = await invoke(['--json', 'init'], root);
  const data = result.envelope.data;
  assert.equal(result.envelope.command, 'init');
  assert.equal(data.project, root); assert.equal(data.complete, true);
  assert.ok(data.changes.every(change => path.isAbsolute(change.path) && change.from === null));
  assert.ok(data.changes.some(change => change.path === path.join(root, '.gitignore') && change.action === 'created'));
  assert.ok(data.changes.some(change => change.path.endsWith('/.adg/runtime.d.ts') && change.action === 'regenerated'));
  assert.match(result.stderr, /created design\/tokens.css/);
  const second = await invoke(['init', '--json'], root);
  assert.ok(second.envelope.data.changes.some(change => change.action === 'skipped' && change.path === path.join(root, 'design/tokens.css')));
  assert.equal(await readFile(path.join(root, 'design/tokens.css'), 'utf8'), starterTokens);
});

test('migrate records changes and retains a completed rename when config loading later fails', async t => {
  const root = await temporary(t);
  const old = await put(root, 'sdg.config.mjs', "export default { design: 'drawings' };");
  const source = await put(root, 'drawings/components/a.tsx', "import {Frame} from 'sdg';");
  await put(root, 'drawings/.sdg/old.js', 'old');
  await put(root, '.gitignore', '/drawings/.sdg/\n');
  const result = await invoke(['migrate', root, '--json'], '/missing/project');
  const data = result.envelope.data;
  assert.equal(data.complete, true);
  assert.deepEqual(data.changes[0], { action: 'renamed', path: path.join(root, 'adg.config.mjs'), from: old });
  assert.ok(data.changes.some(change => change.path === source && change.action === 'updated'));
  assert.ok(data.changes.some(change => change.path === path.join(root, '.gitignore') && change.action === 'updated'));
  assert.ok(data.changes.some(change => change.action === 'deleted'));
  const again = await invoke(['migrate', root, '--json'], root);
  assert.ok(again.envelope.data.changes.every(change => change.action === 'regenerated'));

  const broken = await temporary(t);
  await put(broken, 'sdg.config.mjs', 'export default { name: 42 };');
  const failure = await invoke(['migrate', broken, '--json'], root);
  assert.equal(failure.envelope.error.code, 'CONFIG_INVALID');
  assert.deepEqual(failure.exits, [2]);
  assert.equal(failure.envelope.data.complete, false);
  assert.equal(failure.envelope.data.changes[0].action, 'renamed');
  assert.ok((await readdir(broken)).includes('adg.config.mjs'));
});

test('init failure includes completed changes, while migration conflicts remain preflight failures', async t => {
  const root = await temporary(t);
  await mkdir(path.join(root, '.gitignore'));
  const failed = await invoke(['init', '--json'], root);
  assert.equal(failed.envelope.error.code, 'IO_FAILED');
  assert.equal(failed.envelope.data.complete, false);
  assert.ok(failed.envelope.data.changes.some(change => change.action === 'created'));
  await put(root, 'sdg.config.mjs', 'export default {};');
  const conflict = await invoke(['migrate', '--json'], root);
  assert.equal(conflict.envelope.error.code, 'MIGRATION_CONFLICT');
  assert.equal(conflict.envelope.data, null);
});

test('root add/list/scan/remove emit full snapshots and actual affected paths', async t => {
  const base = await temporary(t), root = path.join(base, 'projects'), state = path.join(base, 'state');
  await mkdir(root);
  await put(root, 'one/adg.config.mjs', 'export default {};');
  const run = (...args) => invoke(['root', ...args, '--state-dir=state', '--json'], base);
  const empty = await run('list');
  assert.deepEqual(empty.envelope.data, { stateDirectory: state, roots: [], affected: [] });
  const added = await run('add', 'projects', '--depth=1');
  assert.equal(added.envelope.command, 'root add');
  assert.deepEqual(added.envelope.data.affected, [root]);
  assert.equal(added.envelope.data.roots[0].projectCount, 1);
  assert.ok(Number.isFinite(Date.parse(added.envelope.data.roots[0].scannedAt)));
  assert.deepEqual((await run('list')).envelope.data.affected, []);
  await put(root, 'two/adg.config.mjs', 'export default {};');
  const scanned = await run('scan', 'projects');
  assert.equal(scanned.envelope.data.roots[0].projectCount, 2);
  assert.deepEqual(scanned.envelope.data.affected, [root]);
  const removed = await run('remove', 'projects');
  assert.deepEqual(removed.envelope.data.roots, []);
  assert.deepEqual(removed.envelope.data.affected, [root]);
  const absent = await run('remove', 'projects');
  assert.equal(absent.envelope.error.code, 'ROOT_NOT_REGISTERED');
  assert.equal(absent.envelope.data, null);
  const missing = await run('add', 'missing');
  assert.equal(missing.envelope.error.code, 'DIRECTORY_NOT_FOUND');
  await put(base, 'state/registry.json', '{invalid');
  const malformed = await run('list');
  assert.equal(malformed.envelope.error.code, 'STATE_INVALID');
});

test('config logging stays on stderr and root config warnings carry executable rescan actions', async t => {
  const base = await temporary(t), root = path.join(base, 'projects');
  const originalOut = process.stdout.write, originalErr = process.stderr.write;
  await put(root, 'bad/adg.config.mjs', "console.log('config stdout'); console.error('config stderr'); process.stdout.write('raw stdout\\n'); export default {name:42};");
  const result = await invoke(['root', 'add', root, '--state-dir', path.join(base, 'state'), '--json'], base);
  assert.equal(result.envelope.data.roots[0].projectCount, 1);
  const [warning] = result.envelope.warnings;
  assert.equal(warning.code, 'PROJECT_CONFIG_INVALID');
  assert.match(result.stderr, /config stdout\nconfig stderr\nraw stdout\n/);
  assert.match(result.stderr, /adg: .*Set name to a non-empty project name in the ADG config; fix the project config and rescan./);
  const parsed = parseCli(warning.next[0].argv.slice(1));
  assert.deepEqual(parsed.positionals, ['scan', root]);
  assert.equal(parsed.values.json, true);
  assert.equal(process.stdout.write, originalOut); assert.equal(process.stderr.write, originalErr);
});

test('inaccessible child directories produce warnings without changing existing human scan output', async t => {
  const base = await temporary(t), blocked = path.join(base, 'projects/blocked'), root = path.dirname(blocked), state = path.join(base, 'state');
  await mkdir(blocked, { recursive: true });
  const lines = [];
  const result = await addRoot(root, 1, state, {
    error: line => lines.push(line),
    readDirectory: (directory, options) => {
      if (directory === blocked) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
      return readdir(directory, options);
    },
  });
  assert.deepEqual(lines, []);
  assert.equal(result.warnings[0].code, 'SCAN_DIRECTORY_SKIPPED');
  assert.ok(result.warnings[0].message.includes(blocked));
  assert.equal(parseCli(result.warnings[0].next[0].argv.slice(1)).command, 'root');
  await put(base, 'bad-state/registry.json', '{"roots":null}');
  await assert.rejects(listRoots(path.join(base, 'bad-state')), typed('STATE_INVALID', /Cannot read registry/));
});

test('config, version, migration, tokens and source discovery classify at their owning boundaries', async t => {
  const root = await temporary(t);
  await put(root, 'adg.config.mjs', "export default {requires: '>=99.0.0'};");
  await assert.rejects(loadConfig(root), typed('VERSION_UNSATISFIED', /does not satisfy/));
  const bad = await temporary(t);
  await put(bad, 'adg.config.mjs', 'export default ;');
  await assert.rejects(loadConfig(bad), typed('CONFIG_INVALID', /Cannot load/));
  const legacy = await temporary(t);
  await put(legacy, 'sdg.config.mjs', 'export default {};');
  await assert.rejects(loadConfig(legacy), error => {
    typed('MIGRATION_REQUIRED', /adg migrate/)(error);
    assert.deepEqual(classifyError(error).error.next[0].argv, ['adg', 'migrate', legacy, '--json']);
    return true;
  });
  const config = await loadConfig(root, { checkVersion: false });
  assert.throws(() => sourceDirectories({ sources: ['nested/path'] }), typed('CONFIG_INVALID'));
  assert.throws(() => parseTokens('invalid'), typed('TOKENS_INVALID'));
  assert.throws(() => loadTokens(config), typed('TOKENS_INVALID', /fix design\/tokens.css/));
  assert.throws(() => selectSources(config, ['missing'], { write: false }), typed('SOURCE_NOT_FOUND'));
  await put(root, 'design/components/legacy.svg', '<svg/>');
  assert.throws(() => rejectLegacy(config), typed('LEGACY_SOURCE', /convert this SVG source/));
  await put(root, 'design/gallery.json', '{invalid');
  assert.throws(() => readGroups(config.design), typed('CONFIG_INVALID', /gallery.json/));
});

test('browser launch boundaries are tested without spawning a browser', async () => {
  await assert.rejects(launch({ importPlaywright: async () => { throw new Error('Module absent'); } }), typed('PLAYWRIGHT_UNAVAILABLE', /Playwright is missing/));
  for (const [message, code] of [["Executable doesn't exist", 'CHROMIUM_UNAVAILABLE'], ['Launch failed\ndetails', 'BROWSER_FAILED']]) {
    await assert.rejects(launch({ importPlaywright: async () => ({ chromium: { launch: async () => { throw new Error(message); } } }) }), typed(code));
  }
});

test('viewer startup and frame selection retain typed discovery errors', async t => {
  const root = await temporary(t), state = path.join(root, 'state');
  await put(state, 'state.json', '{invalid');
  await assert.rejects(startServer({ stateDirectory: state }), typed('STATE_INVALID', /Cannot read preferences/));
  await assert.rejects(startServer({ directory: path.join(root, 'absent'), stateDirectory: path.join(root, 'fresh-state') }), typed('DIRECTORY_NOT_FOUND', /Directory not found/));
  await put(root, 'adg.config.mjs', 'export default { compare: { fixture() {} } };');
  await put(root, 'design/tokens.css', starterTokens);
  const source = await put(root, 'design/components/a.tsx', "import {Frame} from 'adg'; export default () => <Frame name='default'><div/></Frame>;");
  await assert.rejects(compare(await loadConfig(root), [source], { frame: 'missing' }), typed('FRAME_NOT_FOUND', /Unknown frame missing/));
});
