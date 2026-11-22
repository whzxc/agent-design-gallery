import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { starterTokens } from '../src/toolkit/project.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const source = 'design/surfaces/logs.tsx';
function fixture(t, config) {
  const root = mkdtempSync(path.join(tmpdir(), 'adg-capture-fixture-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'design/surfaces'), { recursive: true });
  const put = (name, value) => writeFileSync(path.join(root, name), value);
  put('adg.config.mjs', config);
  put('design/tokens.css', starterTokens);
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args, '--json'], { cwd: root, encoding: 'utf8' });
    assert.ok(result.stdout, result.stderr);
    return { status: result.status, ...JSON.parse(result.stdout) };
  };
  return { root, put, run };
}

test('contract: lifecycle grants only exact, reasoned capture exemptions and shows them in check and review', t => {
  const { root, put, run } = fixture(t, 'export default {sources:["surfaces"], check:{lifecycle:true}};');
  const render = (name, metadata = '') =>
    `<Frame name="${name}" width={240} height={100} ${metadata}><main>${name}</main></Frame>`;
  const frames = (current = render('system-dialog')) => put(source,
    `import {Frame} from 'adg'; export default () => [${current ? current + ',' : ''}${render('captured', 'fixture="logs" capture={{page:true}}')}];`);
  const mapping = { implementation: {file: 'host.md'}, design: [{source}] };
  const entry = {source, frame: 'system-dialog', reason: 'The host owns this <system> dialog.'};
  const map = (exemptions = [], mappings = [mapping]) => put('design/implementation.json',
    JSON.stringify({ version: 1, mappings, captureExemptions: exemptions }, null, 2));
  put('host.md', 'External host surface');
  put('.gitignore', 'output/\n');
  frames();
  map();
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {stdio: 'pipe'});
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base');
  const check = () => run('check', '--read-only');
  const before = check();
  assert.equal(before.status, 1);
  assert.deepEqual(before.data.findings.map(row => row.code), ['OWNER_SURFACE_FRAME_UNCAPTURED']);

  map([entry]);
  const accepted = check();
  assert.equal(accepted.status, 0, JSON.stringify(accepted));
  assert.deepEqual(accepted.data.captureExemptions, [entry]);
  assert.equal(accepted.data.summary.captureExemptions, 1);
  const review = run('review', '--base=HEAD', '--theme=light');
  assert.equal(review.status, 0, JSON.stringify(review));
  assert.equal(review.data.counts.captureExemptions, 1);
  assert.equal(review.data.counts.changed, 0);
  assert.match(readFileSync(review.data.path, 'utf8'), /Capture exemptions \(1\).*logs\.tsx#system-dialog.*The host owns this &lt;system&gt; dialog\./s);

  map([{...entry, reason: ' '}]);
  assert.equal(check().error.code, 'OWNER_MAP_INVALID');
  map([entry, entry]);
  assert.equal(check().error.code, 'OWNER_MAP_INVALID');
  map([entry], []);
  const unbound = check();
  assert.equal(unbound.status, 1);
  assert.ok(unbound.data.findings.some(row => row.code === 'OWNER_CAPTURE_EXEMPTION_INVALID'));
  assert.ok(unbound.data.findings.some(row => row.code === 'OWNER_SURFACE_UNBOUND'));
  map([entry]);
  frames(render('system-dialog', 'proposed="New dialog"'));
  const proposed = check();
  assert.equal(proposed.status, 1);
  assert.ok(proposed.data.findings.some(row => row.code === 'OWNER_CAPTURE_EXEMPTION_INVALID'));

  for (const current of [render('system-dialog', 'fixture="host" capture={{page:true}}'), null]) {
    frames(current);
    const stale = check();
    assert.equal(stale.status, 0, JSON.stringify(stale));
    assert.equal(stale.data.summary.captureExemptions, 0);
    assert.equal(stale.data.summary.staleCaptureExemptions, 1);
    assert.ok(stale.warnings.some(row => row.code === 'OWNER_CAPTURE_EXEMPTION_STALE'));
  }
});

test('contract: fixture compare pairs repeated labels in document order and reports a real move', async t => {
  const label = (y, text = 'INFO') => `<span style="position:absolute;left:16px;top:${y}px">${text}</span>`;
  const style = 'position:relative;width:240px;height:200px;font:16px/20px sans-serif';
  const runtimePage = (middle, last) => `<!doctype html><body style="margin:0"><main style="${style}">${label(10)}${label(middle)}${label(last)}${label(150, 'Unique')}</main>`;
  let runtime = runtimePage(130, 100);
  const server = createServer((_, response) => response.end(runtime)).listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, 'listening');
  const { root, put } = fixture(t, `export default { sources:['surfaces'], compare: {
    viewport: '240x200', fixture: () => ({
      url:'http://127.0.0.1:${server.address().port}', theme:'light', locale:'en-US', clock:'2025-01-01',
    }),
  } };`);
  put(source, `import {Frame} from 'adg';
export default () => <Frame name="records" width={240} height={200} fixture="logs" capture={{page:true}}>
  <main style="${style}">${label(10)}${label(45)}${label(100)}${label(150, 'Unique')}</main>
</Frame>;`);
  const compare = () => new Promise((resolve, reject) => execFile(process.execPath,
    [cli, 'compare', 'surfaces/logs', '--frame=records', '--no-screenshots', '--json'], {cwd: root},
    (error, stdout) => stdout ? resolve({status: error?.code ?? 0, stdout}) : reject(error)))
    .then(({status, stdout}) => ({status, ...JSON.parse(stdout)}));
  const result = await compare();
  assert.equal(result.status, 1, JSON.stringify(result));
  const [report] = result.data.comparisons;
  assert.equal(report.matched, 4);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.offBy2px, [{ text: 'INFO', dx: 0, dy: 85, dw: 0, off: 85 }]);
  // The middle label is closer to the old last label than to its own old
  // position. Taking the closest pair first would mask the last label's move.
  runtime = runtimePage(99, 121);
  assert.deepEqual((await compare()).data.comparisons[0].offBy2px, [54, 21].map(dy =>
    ({ text: 'INFO', dx: 0, dy, dw: 0, off: dy })));
});
