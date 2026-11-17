import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { main } from '../src/cli.mjs';
import { startHub } from '../src/hub.mjs';
import { hubKey } from '../src/hub/auth.mjs';
import { addRoot } from '../src/hub/registry.mjs';
import { reviewCacheKey, readReviewCache } from '../src/review-cache.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

test('CLI prewarming, concurrent hub misses and invalidation share the global review cache', { timeout: 60000 }, async t => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-review-integration-')));
  const project = path.join(directory, 'project');
  const stateDirectory = path.join(directory, 'state');
  let hub, requestReview;
  t.after(async () => {
    try { await hub?.close(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  const put = async (name, text) => {
    const file = path.join(project, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const git = (...args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8' }).trim();
  const source = (color, frame = 'sample') => `import { Frame } from 'adg';
export default () => <Frame name="${frame}"><div style={{ width: 24, height: 24, background: '${color}' }} /></Frame>;
`;
  const card = 'design/components/card.tsx';
  await put('adg.config.mjs', 'export default { name: "Review cache fixture" };\n');
  await put('.gitignore', 'output/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  await put(card, source('#cc0000'));
  git('init', '-q');
  git('config', 'user.name', 'Review Cache Test');
  git('config', 'user.email', 'review-cache@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'fixture base');
  const base = git('rev-parse', 'HEAD');
  await put(card, source('#0000cc'));
  const config = await loadConfig(project);
  const keyFor = (rev = base, theme = 'light') => reviewCacheKey(config, rev, theme, stateDirectory);

  // Count actual renders without replacing the browser or the diff implementation.
  const launch = chromium.launch.bind(chromium);
  const launches = t.mock.method(chromium, 'launch', (...args) => launch(...args));

  await t.test('CLI warms both themes and a real hub hits them across separate state directories', async () => {
    let stdout = '';
    const code = await main([
      'diff', '--base=HEAD', '--impacted', '--theme=both', '--json', `--state-dir=${stateDirectory}`,
    ], project, { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
    assert.equal(code, 1, stdout);
    const result = JSON.parse(stdout);
    assert.equal(result.data.complete, true);
    assert.equal(result.error.code, 'DIFF_FAILED');
    assert.equal(result.data.review.changed, 1);
    assert.ok(result.data.review.sheet.path.endsWith('review-sheet.png'));

    await addRoot(project, 0, stateDirectory);
    hub = await startHub({ port: 0, stateDirectory });
    const headers = { Authorization: `Bearer ${await hubKey(stateDirectory)}` };
    const response = await fetch(new URL('api/projects', hub.url), { headers });
    assert.equal(response.status, 200);
    const [registered] = await response.json();
    assert.ok(registered);
    const projectState = path.join(stateDirectory, 'projects', registered.slug);
    const reviewURL = (rev, theme) => {
      const url = new URL(`${registered.url}review`, hub.url);
      url.search = new URLSearchParams({ base: rev, theme }).toString();
      return url;
    };
    requestReview = async (rev = base, theme = 'light') => {
      const response = await fetch(reviewURL(rev, theme), { headers, signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.equal(body.scope, 'review');
      assert.equal(body.base.rev, rev);
      assert.equal(body.review.base.rev, rev);
      return body.review;
    };

    const before = launches.mock.callCount();
    assert.ok(before > 0, 'CLI must have rendered real frame differences');
    for (const theme of ['light', 'dark']) {
      const key = await keyFor(base, theme);
      const file = path.join(key.directory, 'review.json');
      const bytes = await readFile(file, 'utf8');
      const stamp = (await stat(file)).mtimeMs;
      const review = await requestReview(base, theme);
      assert.deepEqual(review, { ...JSON.parse(bytes), label: 'project', base: { rev: base, sha: base } });
      assert.equal(review.sections.changed[0].themes.length, 1);
      assert.equal(review.sections.changed[0].themes[0].theme, theme);
      assert.equal(await readFile(file, 'utf8'), bytes);
      assert.equal((await stat(file)).mtimeMs, stamp, 'a hit must not rewrite the cache');
      const isolatedKey = await reviewCacheKey(config, base, theme, projectState);
      assert.equal(await readReviewCache(isolatedKey), null, 'reviews must use the global state directory');
    }
    assert.equal(launches.mock.callCount(), before, 'prewarmed requests must not render again');
    assert.ok((await stat(projectState)).isDirectory(), 'hub still owns separate project state');
  });

  await t.test('concurrent cold requests share one render and persist a reusable result', async () => {
    const key = await keyFor();
    await rm(key.directory, { recursive: true });
    const before = launches.mock.callCount();
    const reviews = await Promise.all(Array.from({ length: 4 }, () => requestReview()));
    assert.equal(launches.mock.callCount() - before, 1, 'one cold generation must share one diff');
    for (const review of reviews) assert.deepEqual(review, reviews[0]);
    assert.deepEqual({ ...await readReviewCache(key), label: 'project' }, reviews[0]);
    assert.deepEqual(await requestReview(), reviews[0]);
    assert.equal(launches.mock.callCount() - before, 1, 'the completed generation must hit disk');
  });

  await t.test('tracked edits, untracked sources, deletion, HEAD and base invalidate hub results', async () => {
    let previousKey = await keyFor();
    const expectMiss = async (counts, rev = base) => {
      const key = await keyFor(rev);
      assert.notEqual(key.directory, previousKey.directory);
      assert.equal(await readReviewCache(key), null);
      const review = await requestReview(rev);
      assert.deepEqual(review.counts, { ...counts, moved: 0, direct: counts.changed, inherited: 0 });
      assert.equal(review.current.head, git('rev-parse', 'HEAD'));
      assert.deepEqual({ ...await readReviewCache(key), label: 'project' }, review);
      const beforeHit = launches.mock.callCount();
      assert.deepEqual(await requestReview(rev), review);
      assert.equal(launches.mock.callCount(), beforeHit);
      previousKey = key;
      return review;
    };

    await put(card, source('#00cc00'));
    const edited = await expectMiss({ added: 0, removed: 0, changed: 1 });
    await put('design/components/new.tsx', source('#cc00cc', 'new'));
    await expectMiss({ added: 1, removed: 0, changed: 1 });
    await rm(path.join(project, card));
    await expectMiss({ added: 1, removed: 1, changed: 0, direct: 0, inherited: 0 });
    git('add', '.');
    git('commit', '-qm', 'fixture update');
    await expectMiss({ added: 1, removed: 1, changed: 0, direct: 0, inherited: 0 });
    const settled = await expectMiss({ added: 0, removed: 0, changed: 0 }, 'HEAD');
    assert.notEqual(settled.base.sha, edited.base.sha);
  });

  await t.test('a configured diff policy invalidates old keys and still prewarms the hub', async () => {
    const previousKey = await keyFor();
    await put('adg.config.mjs', `export default {
  name: 'Review cache fixture',
  diff: { thresholds: { imperceptible: { maxChannelDelta: 3 } } },
};\n`);
    const key = await keyFor();
    assert.notEqual(key.directory, previousKey.directory);
    assert.equal(await readReviewCache(key), null);
    let stdout = '';
    const code = await main([
      'diff', `--base=${base}`, '--impacted', '--theme=both', '--json', `--state-dir=${stateDirectory}`,
    ], project, { stdout: chunk => { stdout += chunk; }, stderr: () => {}, exit: () => {} });
    assert.equal(code, 1, stdout);
    const result = JSON.parse(stdout);
    assert.equal(result.data.complete, true);
    assert.equal(result.data.thresholds.imperceptible.maxChannelDelta, 3);
    assert.deepEqual((await readReviewCache(key))?.counts, { added: 1, removed: 1, moved: 0, changed: 0, direct: 0, inherited: 0 });

    // Reopen the real hub so it reads the changed project policy and only persisted caches survive.
    await hub.close();
    hub = await startHub({ port: 0, stateDirectory });
    const before = launches.mock.callCount();
    for (const theme of ['light', 'dark']) {
      const review = await requestReview(base, theme);
      const cached = await readReviewCache(await keyFor(base, theme));
      assert.deepEqual(review, { ...cached, label: 'project' });
    }
    assert.equal(launches.mock.callCount(), before, 'configured policies must hit prewarmed caches after restart');
  });
});
