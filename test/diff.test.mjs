import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { diff } from '../src/toolkit/diff.mjs';
import { pixelComparator } from '../src/toolkit/pixel-diff.mjs';
import { prepareDiffInputs } from '../src/toolkit/diff-inputs.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { migrate } from '../src/toolkit/migrate.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { createOutput, classifyError, nextActions, withHumanOutput } from '../src/cli-output.mjs';
import { main, parseCli } from '../src/cli.mjs';

const exec = promisify(execFile);
const git = (root, ...args) => exec('git', ['-C', root, '-c', 'user.name=ADG Test', '-c', 'user.email=adg-test@example.invalid', ...args]);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');
async function put(root, name, value) {
  const target = path.join(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
}
async function project(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-exact-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, 'init', '-q');
  await put(root, '.gitignore', '/output/\n');
  await put(root, 'adg.config.mjs', 'export default {};');
  await put(root, 'design/tokens.css', starterTokens);
  return root;
}
const source = (name, width = 10, runtime = 'adg') => `import {Frame} from '${runtime}'; export default()=> <Frame name="${name}" width={${width}} height={10}><div/></Frame>;`;
const image = (width, height, values) => ({ width, height, data: new Uint8ClampedArray(values) });

test('exact pixels preserve channel changes, transparency, union dimensions and absent sides', () => {
  const compare = pixelComparator();
  const a = image(1, 1, [10, 20, 30, 255]);
  assert.equal(compare(a, a).pixels.differentPixels, 0);
  const changed = compare(a, image(1, 1, [11, 20, 30, 255]));
  assert.equal(changed.pixels.differentPixels, 1);
  assert.equal(changed.pixels.classes.other.maxChannelDelta, 1);
  assert.deepEqual([...changed.difference], [255, 0, 255, 255]);
  assert.equal(compare(image(1, 1, [255, 0, 0, 0]), image(1, 1, [0, 255, 0, 0])).pixels.differentPixels, 0);
  const union = compare(image(2, 1, [10, 20, 30, 255, 0, 0, 0, 255]), image(1, 2, [10, 20, 30, 255, 0, 0, 0, 255]));
  assert.equal(union.pixels.areaPixels, 4);
  assert.equal(union.pixels.equalPixels, 2);
  assert.equal(union.pixels.differentPixels, 2);
  for (const result of [compare(null, a), compare(a, null)]) {
    assert.equal(result.pixels.classes.other.pixels, 1);
    assert.equal(result.pixels.classes.other.maxChannelDelta, 255);
  }
});

// Capture/decoder boundary double keeps lifecycle and CLI contract checks independent of Chromium startup.
function browserDouble({ failClose = false } = {}) {
  const counts = { opened: 0, closed: 0, browserClosed: 0 };
  return {
    version: () => 'test-browser', isConnected: () => true,
    close: async () => { counts.browserClosed++; if (failClose) throw Error('Close failed'); },
    newPage: async () => {
      counts.opened++;
      let document = '', width = 10;
      return {
        context: () => ({ browser: () => ({ isConnected: () => true }) }),
        emulateMedia: async () => {}, setViewportSize: async () => {},
        setContent: async value => { document = value; width = Number(value.match(/style="width:(\d+)px/)?.[1] ?? 10); },
        locator: () => ({
          boundingBox: async () => ({ x: 0, y: 0, width, height: 10 }),
          screenshot: async () => { if (document.includes('data-adg-frame="fail"')) throw Error('Capture failed'); return png; },
        }),
        evaluateHandle: async factory => ({ value: factory(), dispose: async () => {} }),
        evaluate: async (fn, args) => {
          if (fn.name !== 'imageDifference') return;
          const decode = value => value === null ? null : image(1, 1, [10, 20, 30, 255]);
          return { pixels: args.compare.value(decode(args.before), decode(args.after)).pixels, png: png.toString('base64') };
        },
        close: async () => { counts.closed++; },
      };
    }, counts,
  };
}

test('diff gates size changes and additions/removals, advertises finished artifacts and preserves partial failures', async t => {
  const root = await project(t);
  await put(root, 'design/components/a.tsx', source('same'));
  await put(root, 'design/components/deleted.tsx', source('gone'));
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'feat(test): add base');
  await put(root, 'design/components/a.tsx', source('same', 11));
  await rm(path.join(root, 'design/components/deleted.tsx'));
  await put(root, 'design/components/added.tsx', source('fresh'));
  const config = await loadConfig(root), browser = browserDouble();
  const options = { base: 'HEAD', theme: 'both', scale: '1', 'out-dir': 'output/changed', json: true };
  const error = await diff(config, [], options, { launchBrowser: async () => browser }).then(() => assert.fail('Expected a changed gate'), error => error);
  {
    assert.equal(error.code, 'DIFF_FAILED'); assert.equal(error.data.complete, true);
    assert.equal(error.data.summary.comparisons, 6);
    assert.equal(error.data.summary.changed, 6);
    for (const row of error.data.comparisons) {
      if (row.status === 'matched') {
        assert.equal(row.pixels.differentPixels, 0);
        assert.ok(row.reasons.includes('size_changed'));
      }
      if (row.status === 'added') { assert.equal(row.before, null); assert.equal(row.paths.before, null); assert.equal(row.beforeSize, null); }
      if (row.status === 'removed') { assert.equal(row.after, null); assert.equal(row.paths.after, null); assert.equal(row.afterSize, null); }
      assert.equal(row.snapshots, null);
      assert.deepEqual(await readFile(row.paths.difference), png);
      assert.equal(JSON.parse(await readFile(row.paths.report, 'utf8')).comparison.id, row.id);
    }
    assert.deepEqual(JSON.parse(await readFile(error.data.reportPath, 'utf8')), error.data);
    let stdout = '';
    const output = createOutput({ json: true, command: 'diff', stdout: text => { stdout += text; }, stderr: () => assert.fail('Unexpected stderr') });
    assert.equal(output.failure(error, { command: 'diff', values: options, positionals: [] }), 1);
    const envelope = JSON.parse(stdout);
    assert.equal(envelope.error.code, 'DIFF_FAILED');
    assert.equal(envelope.data.complete, true);
    assert.equal(parseCli(envelope.error.next[0].argv.slice(1)).values.base, 'HEAD');
  }
  assert.equal(browser.counts.opened, browser.counts.closed);
  assert.equal(browser.counts.browserClosed, 1);
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'refactor(test): update frames');
  const identical = await diff(config, ['components/a'], { base: 'HEAD', theme: 'light', json: true }, { launchBrowser: async () => browserDouble() });
  assert.equal(identical.data.verdict, 'identical');
  assert.equal(identical.data.selection.existingCoverage, 'partial');
  await put(root, 'design/components/fail.tsx', source('fail'));
  for (const failClose of [false, true]) {
    await assert.rejects(diff(config, failClose ? ['components/a'] : ['components/a', 'components/fail'], { base: 'HEAD', theme: 'light', json: true }, { launchBrowser: async () => browserDouble({ failClose }) }), error => {
      assert.equal(error.code, failClose ? 'SHUTDOWN_FAILED' : 'RENDER_FAILED');
      assert.equal(error.data.complete, false); assert.equal(error.data.verdict, null);
      assert.equal(error.data.comparisons.length, 1);
      assert.equal(classifyError(error).exitCode, 2);
      if (!failClose) assert.match(error.message, /design\/components\/fail.tsx: fail: light:/);
      return true;
    });
  }
  const action = nextActions('DIFF_FAILED', { command: 'diff', values: { ...options, frame: 'same' }, positionals: ['components/a', '--literal'] })[0];
  assert.deepEqual(action.argv, ['adg', 'diff', '--base=HEAD', '--frame=same', '--theme=both', '--scale=1', '--out-dir=output/changed', '--json', '--', 'components/a', '--literal']);
});

test('legacy bases migrate in the disposable tree, stream binary assets and translate actionable diagnostics', async t => {
  const root = await project(t);
  await rm(path.join(root, 'adg.config.mjs'));
  await put(root, 'sdg.config.mjs', 'console.log(import.meta.url); export default {};');
  await put(root, 'design/components/a.tsx', source('same', 10, 'sdg'));
  const bytes = Buffer.alloc(1024 * 1024 + 3, 0xab); bytes[65536] = 10;
  await put(root, 'design/art/binary.dat', bytes);
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'feat(test): add legacy base');
  let logs = '';
  const current = await withHumanOutput(async () => { await migrate(root, () => {}); return loadConfig(root); }, text => { logs += text; });
  const inputs = await withHumanOutput(() => prepareDiffInputs(current, [], { base: 'HEAD' }), text => { logs += text; });
  try {
    assert.equal(inputs.environment.baseMigration.applied, true);
    assert.ok(inputs.warnings.some(warning => warning.code === 'DIFF_BASE_MIGRATED'));
    assert.deepEqual(await readFile(path.join(inputs.before.config.design, 'art/binary.dat')), bytes);
    assert.match((await inputs.buildFrames()).frames[0].before.html, /<div>/);
    assert.ok(!JSON.stringify(inputs.environment).includes(inputs.before.config.root));
    assert.ok(!logs.includes(inputs.before.config.root));
    assert.ok(logs.includes(root));
  } finally { await inputs.close(); }

  await rm(path.join(root, 'adg.config.mjs'));
  await put(root, 'sdg.config.mjs', 'throw Error(import.meta.url); export default {};');
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'test(config): record historical failure');
  await rm(path.join(root, 'sdg.config.mjs'));
  await put(root, 'adg.config.mjs', 'export default {};');
  await assert.rejects(prepareDiffInputs(await loadConfig(root), [], { base: 'HEAD' }), error => {
    const diagnostic = classifyError(error, { command: 'diff', values: { base: 'HEAD' } });
    assert.equal(diagnostic.error.code, 'CONFIG_INVALID');
    assert.ok(diagnostic.error.message.includes(root));
    assert.doesNotMatch(JSON.stringify(diagnostic), /adg-diff-[^/]+\//);
    assert.equal(diagnostic.data, null);
    return true;
  });
});

test('empty diff CLI emits one complete envelope without a browser', async t => {
  const root = await project(t);
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'feat(test): add empty project');
  let stdout = '', stderr = '', exit;
  await main(['--json', 'diff', '--base=HEAD'], root, { stdout: text => { stdout += text; }, stderr: text => { stderr += text; }, exit: code => { exit = code; } });
  const result = JSON.parse(stdout);
  assert.equal(stdout.trimEnd().split('\n').length, 1);
  assert.equal(stderr, ''); assert.equal(exit, 0);
  assert.equal(result.command, 'diff'); assert.equal(result.ok, true);
  assert.equal(result.data.complete, true); assert.equal(result.data.verdict, 'identical');
  assert.equal(result.warnings[0].code, 'EMPTY_SELECTION');
});
