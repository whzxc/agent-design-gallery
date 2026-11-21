import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { impact } from '../src/toolkit/impact.mjs';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

const baseFailure = 'design/components/base-failure.tsx';
const currentFailure = 'design/components/current-failure.tsx';
const healthy = 'design/components/healthy.tsx';
const source = color => `import { Frame } from 'adg';
export default () => <Frame name="sample"><div style={{ width: 24, height: 24, background: '${color}' }} /></Frame>;\n`;

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-review-failures-')));
  const project = path.join(directory, 'project');
  const stateDirectory = path.join(directory, 'state');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const put = async (name, text) => {
    const file = path.join(project, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8' }).trim();
  await put('adg.config.mjs', 'export default {};\n');
  await put('.gitignore', 'output/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  await put(baseFailure, 'export default () => <broken;');
  await put(currentFailure, source('#cc0000'));
  await put(healthy, source('#cc0000'));
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture base');
  await put(baseFailure, source('#0000cc'));
  await put(currentFailure, 'export default () => <broken;');
  await put(healthy, source('#0000cc'));
  return { project, stateDirectory, put, config: await loadConfig(project) };
}

function assertFailures(failures) {
  assert.deepEqual(failures.map(({ source, side }) => ({ source, side })), [
    { source: baseFailure, side: 'base' },
    { source: currentFailure, side: 'current' },
  ]);
  for (const failure of failures) {
    assert.equal(failure.code, 'SOURCE_BUILD_FAILED');
    assert.ok(failure.message.length > 0);
    assert.doesNotMatch(failure.message, /adg-base-/);
  }
}

test('ordinary and impacted diff retain healthy artifacts with failures on opposite sides', { timeout: 60000 }, async t => {
  const { project, stateDirectory } = await fixture(t);
  for (const impacted of [false, true]) {
    let stdout = '';
    const code = await main(['diff', '--base=HEAD', '--theme=light', '--json',
      ...(impacted ? ['--impacted', `--state-dir=${stateDirectory}`] : [])], project,
    { stdout: value => { stdout += value; }, stderr: () => {}, exit: () => {} });
    assert.equal(code, 2, stdout);
    const { data, error } = JSON.parse(stdout);
    assert.equal(error.code, 'SOURCE_BUILD_FAILED');
    assert.equal(data.complete, false);
    assert.equal(data.verdict, null);
    assertFailures(data.failures);
    assert.deepEqual(data.comparisons.map(row => row.source), [healthy]);
    assert.equal(data.summary.added, 0);
    assert.equal(data.summary.removed, 0);
    assert.equal(data.review.changed, 1);
    assertFailures(JSON.parse(await readFile(data.reportPath, 'utf8')).failures);
    const html = await readFile(data.indexPath, 'utf8');
    assert.match(html, /base-failure/);
    assert.match(html, /current-failure/);
    if (impacted) {
      assert.ok((await stat(data.review.sheet.path)).size > 0);
      assert.equal(data.impact.coverage.scope, 'partial');
      assert.equal(data.impact.coverage.proofComplete, false);
    }
  }
  for (const format of ['html', 'png', 'embed']) {
    let stdout = '';
    const code = await main(['review', '--base=HEAD', '--theme=light', '--exact', `--format=${format}`, '--json'], project,
      { stdout: value => { stdout += value; }, stderr: () => {}, exit: () => {} });
    assert.equal(code, 2, stdout);
    const { data: report, error } = JSON.parse(stdout);
    assert.equal(error.code, 'SOURCE_BUILD_FAILED');
    assert.equal(report.complete, false);
    assert.equal(report.mode, 'exact');
    assert.equal(report.format, format);
    assertFailures(report.failures);
    assert.equal(report.counts.changed, 1);
    const artifact = await readFile(report.path);
    if (format !== 'png') assert.match(artifact.toString(), /Some sources could not be built/);
    else assert.equal(artifact.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('architecture metadata failure excludes the source on both revision sides', { timeout: 30000 }, async t => {
  const { config, put, stateDirectory } = await fixture(t);
  await put('arch/diagram.mmd', 'flowchart LR\n A --> B\n');
  let observed;
  await impact(await loadConfig(config.root), { base: 'HEAD', json: true, 'state-dir': stateDirectory }, {
    tolerateSourceFailures: true,
    openIndex: async (...args) => {
      const index = await openProjectIndex(...args);
      return { ...index, architecture: async () => { throw new Error('broken architecture metadata'); } };
    },
    consume: async session => { observed = session; },
  });
  assert.ok(observed.data.failures.some(row => row.source === 'arch/diagram.mmd' && row.side === 'current'));
  assert.ok(observed.rows.every(row => row.source !== 'arch/diagram.mmd'));
});

test('input changes after a partial render invalidate the comparison generation', { timeout: 60000 }, async t => {
  const { config, put, stateDirectory } = await fixture(t);
  await assert.rejects(diff(config, [], { base: 'HEAD', impacted: true, theme: 'light', json: true, 'state-dir': stateDirectory }, {
    renderSheet: async () => {
      await put(healthy, source('#00cc00'));
      return null;
    },
  }), error => {
    assert.equal(error.code, 'IMPACT_INPUT_CHANGED');
    assert.notEqual(error.partialSourceFailures, true);
    return true;
  });
});
