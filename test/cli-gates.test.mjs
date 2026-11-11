import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { check, render } from '../src/toolkit/commands.mjs';
import { compare, settle } from '../src/toolkit/compare.mjs';
import { main, parseCli } from '../src/cli.mjs';
import { createOutput, classifyError, nextActions, withHumanOutput } from '../src/cli-output.mjs';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { diff } from '../src/toolkit/diff.mjs';
import { pixelComparator } from '../src/toolkit/pixel-diff.mjs';
import { resolveDiffPolicy } from '../src/toolkit/diff-policy.mjs';
import { snapshotFindings, settlePart } from '../src/toolkit/part-snapshot.mjs';
import { validateFrame } from '../src/toolkit/build.mjs';
import { prepareDiffInputs, matchDiffFrames } from '../src/toolkit/diff-inputs.mjs';
import { migrate } from '../src/toolkit/migrate.mjs';

async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-gates-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'design/components'), { recursive: true });
  await writeFile(path.join(root, 'adg.config.mjs'), 'export default {};');
  await writeFile(path.join(root, 'design/tokens.css'), starterTokens);
  return loadConfig(root);
}
const source = "import {Frame} from 'adg';export default()=> <Frame name='sample' width={96} height={96}><div/></Frame>;";
const put = (config, name, content) => writeFile(path.join(config.design, 'components', name), content);

// Unit boundary double: no browser process or raster suite is started here.
function browserDouble({ findings = [], evaluationFailure = false, disconnected = false, failCapture = -1 } = {}) {
  let pages = 0, closedPages = 0, closedBrowsers = 0;
  const browser = {
    isConnected: () => !disconnected,
    close: async () => { closedBrowsers++; },
    newPage: async () => {
      const index = pages++;
      const element = {
        boundingBox: async () => ({ x: 0, y: 0, width: 96, height: 96 }),
        screenshot: async ({ path: target }) => {
          if (index === failCapture) { await writeFile(target, 'partial'); throw Error('Screenshot failed'); }
          const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');
          await writeFile(target, png); return png;
        },
      };
      return {
        context: () => ({ browser: () => browser }),
        emulateMedia: async () => {}, setViewportSize: async () => {}, setContent: async () => {},
        evaluate: async fn => {
          if (fn.name !== 'inspectFrame') return;
          if (evaluationFailure) throw Error('Evaluation failed');
          return findings;
        },
        locator: () => element,
        close: async () => { closedPages++; },
      };
    },
    counts: () => ({ pages, closedPages, closedBrowsers }),
  };
  return browser;
}

test('check rule failures are complete and build failures retain observed findings with exit 2', async t => {
  const config = await project(t);
  await put(config, 'a.tsx', source);
  const browser = browserDouble({ findings: [{code:'FRAME_OVERFLOW',message:'Content overflows the frame',line:null,column:null}] });
  const options = { launchBrowser: async () => browser };
  const run = () => check(config, [], {'read-only':true}, () => {}, () => {}, options);
  await assert.rejects(run(), error => {
    assert.equal(error.code, 'CHECK_FAILED'); assert.equal(error.data.complete, true);
    assert.deepEqual(error.data.summary, {sources:1,frames:1,evaluations:2,problems:2});
    assert.deepEqual(error.data.findings.map(finding => [finding.source,finding.frame,finding.theme,finding.code,finding.line,finding.column]), [
      ['design/components/a.tsx','sample','light','FRAME_OVERFLOW',null,null],
      ['design/components/a.tsx','sample','dark','FRAME_OVERFLOW',null,null],
    ]);
    return true;
  });
  await put(config, 'b.tsx', 'export default()=> <');
  await assert.rejects(run(), error => {
    assert.equal(error.code, 'SOURCE_BUILD_FAILED'); assert.equal(error.data.complete, false);
    assert.equal(error.data.summary.sources, 2); assert.equal(error.data.summary.evaluations, 2);
    assert.equal(error.data.findings.length, 2);
    let stdout = '', stderr = '';
    assert.equal(createOutput({json:true,command:'check',stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}}).failure(error), 2);
    assert.equal(JSON.parse(stdout).data.complete, false); assert.equal(stderr, '');
    return true;
  });
});

test('check evaluation errors distinguish connected render failure from browser failure', async t => {
  const config = await project(t); await put(config, 'a.tsx', source);
  for (const disconnected of [false, true]) {
    const browser = browserDouble({evaluationFailure:true,disconnected});
    await assert.rejects(check(config,[],{'read-only':true},()=>{},()=>{},{launchBrowser:async()=>browser}), error => {
      assert.equal(error.code, disconnected ? 'BROWSER_FAILED' : 'RENDER_FAILED');
      assert.equal(error.data.complete, false); assert.equal(error.data.summary.evaluations, 0);
      return true;
    });
    assert.equal(browser.counts().closedBrowsers, 1);
  }
});

test('render failures advertise only completed files and preserve source/theme order', async t => {
  const config = await project(t); await put(config, 'a.tsx', source);
  const browser = browserDouble({failCapture:1});
  await assert.rejects(render(config,[],{json:true},()=>{},{launchBrowser:async()=>browser}), asyncError => {
    assert.equal(asyncError.code, 'RENDER_FAILED'); assert.equal(asyncError.data.complete, false);
    assert.equal(asyncError.data.captures.length, 1);
    assert.equal(asyncError.data.captures[0].theme, 'light');
    assert.equal(asyncError.data.captures[0].source, 'design/components/a.tsx');
    assert.equal(asyncError.data.captures[0].pixelWidth, 1);
    return true;
  });
  assert.deepEqual(browser.counts(), {pages:2,closedPages:2,closedBrowsers:1});
  assert.equal(await readFile(path.join(config.output,'components/a/sample-dark.png'),'utf8'), 'partial');
});

test('empty gate selections succeed without launching a browser and CLI emits one document', async t => {
  const config = await project(t), noBrowser = {launchBrowser:async()=>assert.fail('empty selection launched a browser')};
  for (const result of [await check(config,[],{'read-only':true},()=>{},()=>{},noBrowser), await render(config,[],{},()=>{},noBrowser), await compare(config,[],{all:true},noBrowser)]) {
    assert.equal(result.data.complete, true);
    assert.ok(result.warnings.some(warning => warning.code === 'EMPTY_SELECTION'));
  }
  for (const command of ['check','render','compare']) {
    let stdout = '', stderr = '', exit;
    await main([command,...(command === 'compare' ? ['--all'] : []),'--json'],config.root,{stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;},exit:code=>{exit=code;}});
    const result = JSON.parse(stdout);
    assert.equal(result.command, command); assert.equal(result.ok,true); assert.equal(exit,0);
    assert.equal(result.warnings[0].code,'EMPTY_SELECTION');
    assert.equal(stdout.trimEnd().split('\n').length,1);
    assert.ok(!stdout.includes('Design check passed'));
  }
});

test('settling uses monotonic time and the timeout test waits no real five-second interval', async () => {
  let time = 0, reads = 0;
  const result = await settle(async () => ({box:{width:100,height:20},texts:[{text:'Moving',x:reads++,y:0,width:20,height:10}]}), {now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(result.settled,false); assert.equal(time,5000); assert.ok(reads>1);
});

// Diff contracts reuse this test process and compiler service.

const exec = promisify(execFile);
const git = (root, ...args) => exec('git', ['-C', root, '-c', 'user.name=ADG Test', '-c', 'user.email=adg-test@example.invalid', ...args]);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=', 'base64');
async function putDiff(root, name, value) {
  const target = path.join(root, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
}
async function diffProject(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-exact-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, 'init', '-q');
  await putDiff(root, '.gitignore', '/output/\n');
  await putDiff(root, 'adg.config.mjs', 'export default {};');
  await putDiff(root, 'design/tokens.css', starterTokens);
  return root;
}
const diffSource = (name, width = 10, runtime = 'adg') => `import {Frame} from '${runtime}'; export default()=> <Frame name="${name}" width={${width}} height={10}><div/></Frame>;`;
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

test('structural classes conserve counts, apply precedence and strict limits, and reject unstable edges', () => {
  const compare = pixelComparator(), thresholds = resolveDiffPolicy().thresholds;
  const first = image(100, 100, new Array(40000).fill(255));
  for (let y = 49; y <= 51; y++) for (let x = 49; x <= 51; x++) {
    const value = x === 49 ? 0 : x === 50 ? 100 : 255;
    first.data.set([value, value, value, 255], (y * 100 + x) * 4);
  }
  const second = image(100, 100, first.data), center = (50 * 100 + 50) * 4;
  second.data.set([110, 110, 110, 255], center);
  const evidence = { thresholds, snapshotsMatch: true, edgeBoxes: [{ x: 48, y: 48, width: 5, height: 5 }], rasterMask: [] };
  assert.equal(compare(first, second, evidence, first).pixels.classes.antialiasing.pixels, 1);
  const strict = { ...evidence, thresholds: resolveDiffPolicy({ thresholds: { antialiasing: { maxRatioExclusive: 0.0001 } } }).thresholds };
  assert.equal(compare(first, second, strict, first).pixels.classes.antialiasing.withinThreshold, false);
  second.data.set([148, 148, 148, 255], center);
  assert.equal(compare(first, second, evidence, first).pixels.classes.antialiasing.pixels, 1);
  second.data.set([149, 149, 149, 255], center);
  assert.equal(compare(first, second, evidence, first).pixels.classes.other.pixels, 1);
  const raster = compare(first, second, { ...evidence, rasterMask: [5050] }, first);
  assert.equal(raster.pixels.classes.bitmap_resampling.pixels, 1);
  second.data.set([102, 102, 102, 255], center);
  assert.equal(compare(first, second, { ...evidence, rasterMask: [5050] }, first).pixels.classes.imperceptible.pixels, 1);
  const external = image(100, 100, first.data);
  external.data.set([0, 0, 0, 255], 50 * 100 * 4);
  external.data.set([0, 0, 0, 255], (50 * 100 + 2) * 4);
  const bleed = compare(external, first, evidence, first);
  assert.equal(bleed.pixels.classes.boundary_bleed.pixels, 1);
  assert.equal(bleed.pixels.classes.other.pixels, 1);
  for (const result of [bleed, raster]) {
    assert.equal(Object.values(result.pixels.classes).reduce((sum, entry) => sum + entry.pixels, 0), result.pixels.differentPixels);
    assert.equal(result.pixels.equalPixels + result.pixels.differentPixels, result.pixels.areaPixels);
  }
  const noAnchors = image(100, 100, first.data);
  for (let x = 49; x <= 51; x++) noAnchors.data.set([20, 30, 40, 255], (49 * 100 + x) * 4);
  assert.equal(compare(first, noAnchors, evidence, first).pixels.classes.other.pixels, 3);
  const bitmapEdge = image(100, 100, first.data), mask = Array.from({ length: 10 }, (_, index) => index);
  for (const pixel of mask) bitmapEdge.data.set([0, 0, 0, 255], pixel * 4);
  assert.equal(compare(first, bitmapEdge, { ...evidence, rasterMask: mask }, first).pixels.classes.bitmap_resampling.withinThreshold, false);
  assert.ok([16, 48].every(contrast => [1, 2].every(residual => [false, true].every(reverse => {
    const low = 10, high = low + contrast;
    const old = image(3, 3, Array.from({ length: 9 }, (_, pixel) => {
      const value = pixel === 4 ? reverse ? high - residual : low + residual : pixel % 3 === 2 ? high : low;
      return [value, value, value, 255];
    }).flat());
    const current = image(3, 3, old.data), anchor = reverse ? low : high;
    current.data.set([anchor, anchor, anchor, 255], 16);
    return compare(old, current, { ...evidence, edgeBoxes: [{ x: 0, y: 0, width: 3, height: 3 }] }, old).pixels.classes.antialiasing.pixels === 0;
  }))), 'Property: a flip between an anchor and a color within residual distance of either anchor is never antialiasing');
});

test('part shape, thresholds, snapshot findings and settlement have bounded pure contracts', async () => {
  const frame = { frame: true, name: 'part', parent: { source: 'design/surfaces/scene.tsx', frame: 'scene', selector: '[' } };
  assert.doesNotThrow(() => validateFrame(frame));
  assert.throws(() => validateFrame({ ...frame, parent: { ...frame.parent, source: '../scene.tsx' } }), /parent/);
  assert.throws(() => resolveDiffPolicy({ thresholds: { antialiasing: { maxRatioExclusive: 2 } } }), { code: 'CONFIG_INVALID' });
  const snapshot = { tokens: [{ name: '--text', declaration: '#000', resolved: '#000' }], resources: [{ contentIdentity: 'old' }], contextEffects: { clipping: [], compositing: {}, backdrop: 'white' }, texts: [],
    elements: [{ tag: 'div', namespace: 'html', attributes: {}, childOrder: [], box: { x: 0, y: 0, width: 10, height: 10 }, clientRects: [], layout: { display: 'block' }, paint: { color: 'black' }, pseudo: {} }] };
  for (const [change, code] of [
    [copy => { copy.tokens[0].declaration = '#111'; }, 'TOKEN_CHANGED'],
    [copy => { copy.resources[0].contentIdentity = 'new'; }, 'RESOURCE_CHANGED'],
    [copy => { copy.elements[0].paint.color = 'red'; }, 'COLOR_CHANGED'],
    [copy => { copy.elements[0].box.x = 1; }, 'LAYOUT_CHANGED'],
    [copy => { copy.contextEffects.clipping = [{ width: 5 }]; }, 'CLIPPING_CHANGED'],
  ]) {
    const copy = structuredClone(snapshot); change(copy);
    assert.ok(snapshotFindings(snapshot, copy).some(finding => finding.code === code));
  }
  let time = 0, value = 0, captures = 0;
  const clock = { now: () => time, wait: async () => { time += 1000; } };
  const stable = await settlePart(async () => snapshot, async () => { captures++; return png; }, clock);
  assert.equal(stable.snapshot, snapshot); assert.equal(captures, 1);
  await assert.rejects(settlePart(async () => ({ value: value++ }), async () => png, clock), { code: 'DIFF_UNSETTLED' });
  assert.equal(time, 6000);
});

// Capture/decoder boundary double keeps lifecycle and CLI contract checks independent of Chromium startup.
function diffBrowserDouble({ failClose = false } = {}) {
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
  const root = await diffProject(t);
  await putDiff(root, 'design/components/a.tsx', diffSource('same'));
  await putDiff(root, 'design/components/deleted.tsx', diffSource('gone'));
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'feat(test): add base');
  await putDiff(root, 'design/components/a.tsx', diffSource('same', 11));
  await rm(path.join(root, 'design/components/deleted.tsx'));
  await putDiff(root, 'design/components/added.tsx', diffSource('fresh'));
  const config = await loadConfig(root), browser = diffBrowserDouble();
  const options = { base: 'HEAD', theme: 'both', scale: '1', 'out-dir': 'output/changed', json: true };
  const frame = (name, width = 10) => ({ name, width, height: 10,
    document: () => `<div data-adg-frame="${name}" style="width:${width}px;"></div>` });
  let built = { support: [], frames: [
    { source: 'design/components/a.tsx', frame: 'same', status: 'matched', before: frame('same'), after: frame('same', 11) },
    { source: 'design/components/added.tsx', frame: 'fresh', status: 'added', before: null, after: frame('fresh') },
    { source: 'design/components/deleted.tsx', frame: 'gone', status: 'removed', before: frame('gone'), after: null },
  ].map(row => ({ ...row, matchKind: row.status === 'matched' ? 'exact' : 'unmatched', matchCandidates: [] })) };
  const base = { root, rev: 'HEAD', sha: (await git(root, 'rev-parse', 'HEAD')).stdout.trim() };
  // Real revision builds are covered below; the capture/cleanup boundary needs only prepared documents.
  const prepareInputs = async () => ({ base, before: { config }, environment: {}, warnings: [],
    sources: built.frames.map(row => row.source), translateDiagnostic: value => value,
    buildFrames: async () => built, close: async () => {} });
  const error = await diff(config, [], options, { prepareInputs, launchBrowser: async () => browser }).then(() => assert.fail('Expected a changed gate'), error => error);
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
  const same = built.frames.find(row => row.frame === 'same');
  const matched = { ...same, before: same.after };
  built = { frames: [matched], support: [] };
  const identical = await diff(config, ['components/a'], { base: 'HEAD', theme: 'light', json: true }, { prepareInputs, launchBrowser: async () => diffBrowserDouble() });
  assert.equal(identical.data.verdict, 'identical');
  assert.equal(identical.data.selection.existingCoverage, 'partial');
  const failed = { ...matched, source: 'design/components/fail.tsx', frame: 'fail', after: { ...matched.after,
    document: theme => matched.after.document(theme).replace('data-adg-frame="same"', 'data-adg-frame="fail"') } };
  for (const failClose of [false, true]) {
    built = { frames: failClose ? [matched] : [matched, failed], support: [] };
    await assert.rejects(diff(config, failClose ? ['components/a'] : ['components/a', 'components/fail'], { base: 'HEAD', theme: 'light', json: true }, { prepareInputs, launchBrowser: async () => diffBrowserDouble({ failClose }) }), error => {
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
  await rm(path.join(root, 'design/components'), { recursive: true });
  await git(root, 'add', '--update'); await git(root, 'commit', '-qm', 'test(diff): remove fixture frames');
  let stdout = '', stderr = '', exit;
  await main(['--json', 'diff', '--base=HEAD'], root, { stdout: text => { stdout += text; }, stderr: text => { stderr += text; }, exit: code => { exit = code; } });
  const result = JSON.parse(stdout);
  assert.equal(stdout.trimEnd().split('\n').length, 1);
  assert.equal(stderr, ''); assert.equal(exit, 0);
  assert.equal(result.command, 'diff'); assert.equal(result.ok, true);
  assert.equal(result.data.complete, true); assert.equal(result.data.verdict, 'identical');
  assert.equal(result.warnings[0].code, 'EMPTY_SELECTION');
});

test('legacy bases migrate in the disposable tree, stream binary assets and translate actionable diagnostics', async t => {
  const root = await diffProject(t);
  await rm(path.join(root, 'adg.config.mjs'));
  await putDiff(root, 'sdg.config.mjs', 'console.log(import.meta.url); export default {};');
  await putDiff(root, 'design/components/a.tsx', diffSource('same', 10, 'sdg'));
  const bytes = Buffer.alloc(128 * 1024 + 3, 0xab); bytes[65536] = 10;
  await putDiff(root, 'design/art/binary.dat', bytes);
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
  await putDiff(root, 'sdg.config.mjs', 'throw Error(import.meta.url); export default {};');
  await git(root, 'add', '.'); await git(root, 'commit', '-qm', 'test(config): record historical failure');
  await rm(path.join(root, 'sdg.config.mjs'));
  await putDiff(root, 'adg.config.mjs', 'export default {};');
  await assert.rejects(prepareDiffInputs(await loadConfig(root), [], { base: 'HEAD' }), error => {
    const diagnostic = classifyError(error, { command: 'diff', values: { base: 'HEAD' } });
    assert.equal(diagnostic.error.code, 'CONFIG_INVALID');
    assert.ok(diagnostic.error.message.includes(root));
    assert.doesNotMatch(JSON.stringify(diagnostic), /adg-diff-[^/]+\//);
    assert.equal(diagnostic.data, null);
    return true;
  });
});

async function temporary(t) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-diff-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, 'init', '-q');
  return root;
}
const inputSource = (...names) => `import {Frame} from 'adg'; export default () => ${JSON.stringify(names)}.map(name => <Frame name={name}><div>{name}</div></Frame>);`;
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
  await putDiff(repository, '.gitignore', 'node_modules/\n');
  await putDiff(repository, 'package.json', '{"type":"module","dependencies":{"diff-fixture":"1.0.0"}}');
  await putDiff(repository, 'package-lock.json', '{"lockfileVersion":3,"version":"before"}');
  await putDiff(repository, 'node_modules/diff-fixture/package.json', '{"name":"diff-fixture","type":"module","exports":"./index.js"}');
  await putDiff(repository, 'node_modules/diff-fixture/index.js', 'export default "installed";');
  await putDiff(repository, 'config-value.json', '"before"');
  await putDiff(repository, 'config-helper.mjs', "import {readFileSync} from 'node:fs'; export default JSON.parse(readFileSync(new URL('./config-value.json', import.meta.url), 'utf8'));");
  const config = (sources, arch) => `import value from '../config-helper.mjs'; import dependency from 'diff-fixture'; export default {name:value+'-'+dependency,design:'visuals',sources:${JSON.stringify(sources)},arch:${JSON.stringify(arch)},compare:{start(){throw Error('Adapter must not start');}}};`;
  await putDiff(root, 'adg.config.mjs', config(['parts', 'legacy'], 'diagrams'));
  await putDiff(root, 'visuals/tokens.css', starterTokens);
  await putDiff(root, 'visuals/fixtures/value.ts', 'export const value = "before";');
  await putDiff(root, 'visuals/art/picture.png', picture);
  const card = names => `import {Frame} from 'adg'; import {value} from '../fixtures/value'; import image from '../art/picture.png'; export default () => ${JSON.stringify(names)}.map(name => <Frame name={name} width={80} height={40} parent={name==='new-state'?{source:'visuals/parts/card.tsx',frame:'keep',selector:'[data-part=card]'}:undefined}><div class="bg-canvas"><img src={image}/>{value}</div></Frame>);`;
  await putDiff(root, 'visuals/parts/card.tsx', card(['keep', 'old-state']));
  await putDiff(root, 'visuals/parts/deleted.tsx', inputSource('gone'));
  await putDiff(root, 'visuals/parts/old-name.tsx', inputSource('moved'));
  await putDiff(root, 'visuals/legacy/old.tsx', inputSource('legacy'));
  await putDiff(root, 'diagrams/work.mmd', 'flowchart LR\nA[Before] --> B');
  await putDiff(root, 'diagrams/work.md', 'Historical note');
  await putDiff(repository, 'binary\nname.dat', Buffer.from([0, 10, 255, 0, 13]));
  await symlink('value.ts', path.join(root, 'visuals/fixtures/alias.ts'));
  await putDiff(repository, '.gitattributes', 'project/visuals/art/picture.png export-ignore\n');
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'feat(test): add historical design');
  const base = (await git(repository, 'rev-parse', 'HEAD')).stdout.trim();

  await putDiff(root, 'adg.config.mjs', config(['parts', 'modern'], 'arch'));
  await putDiff(repository, 'package.json', '{"type":"module","dependencies":{"diff-fixture":"2.0.0"}}');
  await putDiff(repository, 'package-lock.json', '{"lockfileVersion":3,"version":"after"}');
  await putDiff(repository, 'config-value.json', '"after"');
  await putDiff(root, 'visuals/tokens.css', starterTokens.replace('#ffffff', '#eeeeee'));
  await putDiff(root, 'visuals/fixtures/value.ts', 'export const value = "committed";');
  const afterPicture = Buffer.concat([picture, Buffer.from([0, 10, 255])]);
  await putDiff(root, 'visuals/art/picture.png', afterPicture);
  await putDiff(root, 'visuals/parts/card.tsx', card(['keep', 'new-state']));
  await rm(path.join(root, 'visuals/parts/deleted.tsx'));
  await git(repository, 'mv', 'project/visuals/parts/old-name.tsx', 'project/visuals/parts/new-name.tsx');
  await putDiff(root, 'arch/work.mmd', 'flowchart LR\nA[After] --> B');
  await putDiff(root, 'arch/work.md', 'Current note');
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'refactor(test): reorganize design');
  await putDiff(root, 'visuals/fixtures/value.ts', 'export const value = "working";');
  await putDiff(root, 'visuals/modern/untracked.tsx', inputSource('untracked'));
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
  assert.equal(frames.find(row => row.frame === 'new-state').parentRow, keep);
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

  const selected = await prepareDiffInputs(current, ['parts/card', 'parts/card'], { base, frame: 'new-state' });
  try {
    assert.deepEqual(selected.sources, ['visuals/parts/card.tsx']);
    const selection = await selected.buildFrames();
    assert.deepEqual(selection.frames.map(row => row.status), ['added']);
    assert.equal(selection.support.length, 1);
    assert.equal(selection.support[0], selection.frames[0].parentRow);
    assert.equal(selection.support[0].frame, 'keep');
  } finally { await selected.close(); }
  await inputs.close();
  assert.equal(existsSync(beforeRepository), false);
});

test('base config defaults stay at the nested project and dependency errors require an actual failed import', async t => {
  const repository = await temporary(t), root = path.join(repository, 'project');
  await putDiff(repository, 'adg.config.mjs', 'export default {name:"ancestor",design:"unrelated"};');
  await putDiff(root, 'design/tokens.css', starterTokens);
  await putDiff(root, 'design/components/example.tsx', inputSource('default'));
  await git(repository, 'add', '.');
  await git(repository, 'commit', '-qm', 'feat(test): add default design');
  await putDiff(root, 'adg.config.ts', "export default {design:'drawings'};");
  await putDiff(root, 'drawings/tokens.css', starterTokens);
  await putDiff(root, 'drawings/components/example.tsx', inputSource('default'));
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

  await putDiff(root, 'adg.config.mjs', "import dependency from 'missing-diff-dependency'; export default {name:dependency};");
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
