import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/toolkit/config.mjs';
import { prepareDiffInputs, matchDiffFrames } from '../src/toolkit/diff-inputs.mjs';
import { classifyError } from '../src/cli-output.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

const exec = promisify(execFile);
const git = (root, ...args) => exec('git', ['-C', root, '-c', 'user.name=ADG Test', '-c', 'user.email=adg-test@example.invalid', ...args]);
async function temporary(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-diff-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, 'init', '-q');
  return root;
}
async function put(root, name, value) {
  const file = path.join(root, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
  return file;
}
const source = (...names) => `import {Frame} from 'adg'; export default () => ${JSON.stringify(names)}.map(name => <Frame name={name}><div>{name}</div></Frame>);`;
const picture = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');

// Architecture builds exercise Pele with a supplied font-measurement boundary, without launching Chromium.
function measurementBrowser() {
  return {
    isConnected: () => true,
    newPage: async () => ({
      setContent: async () => {},
      evaluate: async (fn, requests) => requests ? requests.map(item => item.text.length * item.size * 0.5) : { ui: 'sans-serif', mono: 'monospace' },
      close: async () => {},
    }),
  };
}

test('diff rebuilds revision-local config, imports, tokens, artwork and diagrams with current dependencies', async t => {
  const repository = await temporary(t), root = path.join(repository, 'project');
  await put(repository, '.gitignore', 'node_modules/\n');
  await put(repository, 'package.json', '{"type":"module","dependencies":{"diff-fixture":"1.0.0"}}');
  await put(repository, 'package-lock.json', '{"lockfileVersion":3,"version":"before"}');
  await put(repository, 'node_modules/diff-fixture/package.json', '{"name":"diff-fixture","type":"module","exports":"./index.js"}');
  await put(repository, 'node_modules/diff-fixture/index.js', 'export default "installed";');
  await put(repository, 'config-value.json', '"before"');
  await put(repository, 'config-helper.mjs', "import {readFileSync} from 'node:fs'; export default JSON.parse(readFileSync(new URL('./config-value.json', import.meta.url), 'utf8'));");
  const config = (sources, arch) => `import value from '../config-helper.mjs'; import dependency from 'diff-fixture'; export default {name:value+'-'+dependency,design:'visuals',sources:${JSON.stringify(sources)},arch:${JSON.stringify(arch)},compare:{start(){throw Error('Adapter must not start');}}};`;
  await put(root, 'adg.config.mjs', config(['parts', 'legacy'], 'diagrams'));
  await put(root, 'visuals/tokens.css', starterTokens);
  await put(root, 'visuals/fixtures/value.ts', 'export const value = "before";');
  await put(root, 'visuals/art/picture.png', picture);
  const card = names => `import {Frame} from 'adg'; import {value} from '../fixtures/value'; import image from '../art/picture.png'; export default () => ${JSON.stringify(names)}.map(name => <Frame name={name} width={80} height={40}><div class="bg-canvas"><img src={image}/>{value}</div></Frame>);`;
  await put(root, 'visuals/parts/card.tsx', card(['keep', 'old-state']));
  await put(root, 'visuals/parts/deleted.tsx', source('gone'));
  await put(root, 'visuals/parts/old-name.tsx', source('moved'));
  await put(root, 'visuals/legacy/old.tsx', source('legacy'));
  await put(root, 'diagrams/work.mmd', 'flowchart LR\nA[Before] --> B');
  await put(root, 'diagrams/work.md', 'Historical note');
  await put(repository, 'binary\nname.dat', Buffer.from([0, 10, 255, 0, 13]));
  await symlink('value.ts', path.join(root, 'visuals/fixtures/alias.ts'));
  await put(repository, '.gitattributes', 'project/visuals/art/picture.png export-ignore\n');
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'feat(test): add historical design');
  const base = (await git(repository, 'rev-parse', 'HEAD')).stdout.trim();

  await put(root, 'adg.config.mjs', config(['parts', 'modern'], 'arch'));
  await put(repository, 'package.json', '{"type":"module","dependencies":{"diff-fixture":"2.0.0"}}');
  await put(repository, 'package-lock.json', '{"lockfileVersion":3,"version":"after"}');
  await put(repository, 'config-value.json', '"after"');
  await put(root, 'visuals/tokens.css', starterTokens.replace('#ffffff', '#eeeeee'));
  await put(root, 'visuals/fixtures/value.ts', 'export const value = "committed";');
  const afterPicture = Buffer.concat([picture, Buffer.from([0, 10, 255])]);
  await put(root, 'visuals/art/picture.png', afterPicture);
  await put(root, 'visuals/parts/card.tsx', card(['keep', 'new-state']));
  await rm(path.join(root, 'visuals/parts/deleted.tsx'));
  await git(repository, 'mv', 'project/visuals/parts/old-name.tsx', 'project/visuals/parts/new-name.tsx');
  await put(root, 'arch/work.mmd', 'flowchart LR\nA[After] --> B');
  await put(root, 'arch/work.md', 'Current note');
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'refactor(test): reorganize design');
  await put(root, 'visuals/fixtures/value.ts', 'export const value = "working";');
  await put(root, 'visuals/modern/untracked.tsx', source('untracked'));
  const originalStatus = (await git(repository, 'status', '--porcelain=v1', '-z')).stdout;
  const current = await loadConfig(root);
  const inputs = await prepareDiffInputs(current, [], { base });
  t.after(() => inputs.close());
  assert.equal(inputs.before.config.name, 'before-installed');
  assert.equal(inputs.after.config.name, 'after-installed');
  assert.deepEqual(inputs.environment.configDependencies, { reused: true, changedFiles: ['package-lock.json', 'package.json'] });
  assert.equal(inputs.warnings[0].code, 'DIFF_BASE_ENVIRONMENT_REUSED');
  const beforeRepository = path.dirname(inputs.before.config.root);
  assert.deepEqual(await readFile(path.join(beforeRepository, 'binary\nname.dat')), Buffer.from([0, 10, 255, 0, 13]));
  assert.deepEqual(await readFile(path.join(inputs.before.config.design, 'fixtures/alias.ts')), Buffer.from('export const value = "before";'));
  assert.ok(inputs.sources.includes('visuals/legacy/old.tsx'));
  assert.ok(inputs.sources.includes('visuals/modern/untracked.tsx'));

  const { frames } = await inputs.buildFrames({ browser: measurementBrowser() });
  const keep = frames.find(row => row.source === 'visuals/parts/card.tsx' && row.frame === 'keep');
  assert.equal(keep.status, 'matched');
  assert.match(keep.before.html, /before/);
  assert.match(keep.after.html, /working/);
  assert.ok(keep.before.html.includes(picture.toString('base64')));
  assert.ok(keep.after.html.includes(afterPicture.toString('base64')));
  assert.match(keep.before.document('light'), /#ffffff/);
  assert.match(keep.after.document('light'), /#eeeeee/);
  assert.equal(frames.find(row => row.frame === 'gone').status, 'removed');
  assert.equal(frames.find(row => row.frame === 'legacy').status, 'removed');
  assert.equal(frames.find(row => row.frame === 'untracked').status, 'added');
  const moved = frames.find(row => row.source === 'visuals/parts/old-name.tsx');
  assert.equal(moved.status, 'removed');
  assert.deepEqual(moved.matchCandidates, [{ source: 'visuals/parts/new-name.tsx', frame: 'moved' }]);
  const oldState = frames.find(row => row.frame === 'old-state');
  assert.deepEqual(oldState.matchCandidates, [{ source: 'visuals/parts/card.tsx', frame: 'new-state' }]);
  const oldDiagram = frames.find(row => row.source === 'diagrams/work.mmd');
  assert.equal(oldDiagram.status, 'removed');
  assert.match(oldDiagram.before.html, /Before/);
  assert.match(oldDiagram.before.note, /Historical note/);
  assert.match(frames.find(row => row.source === 'arch/work.mmd').after.html, /After/);
  assert.equal((await git(repository, 'status', '--porcelain=v1', '-z')).stdout, originalStatus);
  assert.equal(existsSync(path.join(root, 'visuals/.adg')), false);
  assert.equal(existsSync(current.output), false);

  for (const name of ['visuals/parts/deleted.tsx', 'parts/deleted', path.join(root, 'visuals/parts/deleted.tsx')]) {
    const selected = await prepareDiffInputs(current, [name, name], { base, frame: 'gone' });
    try {
      assert.deepEqual(selected.sources, ['visuals/parts/deleted.tsx']);
      assert.deepEqual((await selected.buildFrames()).frames.map(row => row.status), ['removed']);
    } finally { await selected.close(); }
  }
  await inputs.close();
  assert.equal(existsSync(beforeRepository), false);
});

test('base config defaults stay at the nested project and dependency errors require an actual failed import', async t => {
  const repository = await temporary(t), root = path.join(repository, 'project');
  await put(repository, 'adg.config.mjs', 'export default {name:"ancestor",design:"unrelated"};');
  await put(root, 'design/tokens.css', starterTokens);
  await put(root, 'design/components/example.tsx', source('default'));
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'feat(test): add default design');
  await put(root, 'adg.config.ts', "export default {design:'drawings'};");
  await put(root, 'drawings/tokens.css', starterTokens);
  await put(root, 'drawings/components/example.tsx', source('default'));
  const config = await loadConfig(root);
  const inputs = await prepareDiffInputs(config, ['design/components/example.tsx', 'drawings/components/example.tsx'], { base: 'HEAD' });
  try {
    assert.equal(inputs.before.config.root.endsWith('/project'), true);
    assert.equal(inputs.before.config.name, 'project');
    assert.deepEqual(inputs.before.config.sources, ['components', 'modules', 'surfaces']);
    assert.deepEqual((await inputs.buildFrames()).frames.map(row => row.status), ['removed', 'added']);
  } finally { await inputs.close(); }
  await assert.rejects(prepareDiffInputs(config, ['missing'], { base: 'HEAD' }), { code: 'SOURCE_NOT_FOUND' });
  const missingFrame = await prepareDiffInputs(config, [], { base: 'HEAD', frame: 'missing' });
  try { await assert.rejects(missingFrame.buildFrames(), { code: 'FRAME_NOT_FOUND' }); }
  finally { await missingFrame.close(); }

  await put(root, 'adg.config.mjs', "import dependency from 'missing-diff-dependency'; export default {name:dependency};");
  await git(repository, 'add', 'project/adg.config.mjs');
  await git(repository, 'commit', '-qm', 'test(config): record unavailable import');
  await rm(path.join(root, 'adg.config.mjs'));
  await assert.rejects(prepareDiffInputs(config, [], { base: 'HEAD' }), error => {
    assert.equal(error.code, 'DIFF_BASE_DEPENDENCIES_UNAVAILABLE');
    assert.match(error.message, /missing-diff-dependency/);
    assert.equal(classifyError(error).exitCode, 2);
    assert.ok(classifyError(error).error.next.length);
    return true;
  });
});

test('frame matching preserves declaration order, exact identity and ambiguous additions/removals', () => {
  const built = names => ({ frames: names.map(name => ({ name })) });
  const before = new Map([['parts/a.tsx', built(['same', 'old'])], ['parts/b.tsx', built(['shared'])], ['parts/c.tsx', built(['shared'])]]);
  const after = new Map([['parts/a.tsx', built(['new', 'same'])], ['parts/d.tsx', built(['shared'])]]);
  const sources = ['parts/a.tsx', 'parts/b.tsx', 'parts/c.tsx', 'parts/d.tsx'];
  const rows = matchDiffFrames(sources, before, after);
  assert.deepEqual(rows.map(row => [row.source, row.frame, row.status]), [
    ['parts/a.tsx', 'new', 'added'], ['parts/a.tsx', 'same', 'matched'], ['parts/a.tsx', 'old', 'removed'],
    ['parts/b.tsx', 'shared', 'removed'], ['parts/c.tsx', 'shared', 'removed'], ['parts/d.tsx', 'shared', 'added'],
  ]);
  assert.equal(rows[1].matchKind, 'exact');
  assert.equal(rows[2].matchKind, 'renamed_or_unknown');
  assert.equal(rows[3].matchKind, 'unmatched');
  assert.deepEqual(matchDiffFrames([], new Map(), new Map()), []);
});
