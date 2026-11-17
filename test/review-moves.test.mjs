import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/toolkit/config.mjs';
import { diff } from '../src/toolkit/diff.mjs';
import { pairFrameMoves } from '../src/toolkit/move-pairing.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

test('moves use relation precedence, reject ambiguous ownership, and only render viable names', async () => {
  const config = { root: '/project', design: '/project/design' };
  const inputs = { before: { config }, after: { config },
    renames: [{ before: 'design/modules/card.tsx', after: 'design/components/git.tsx' }] };
  const row = (name, source, status, part) => {
    const frame = { name, owners: part ? [{ source, export: part }] : [] };
    return { source: 'design/' + source, frame: name, status, matchCandidates: [],
      before: status === 'removed' ? frame : null, after: status === 'added' ? frame : null };
  };
  const oldGit = row('card', 'modules/card.tsx', 'removed', 'Card');
  const currentGit = row('card', 'components/git.tsx', 'added');
  const currentFolder = row('card', 'modules/card/index.tsx', 'added', 'Card');
  const oldFolder = row('folder', 'modules/box.tsx', 'removed', 'Box');
  const currentBox = row('folder', 'modules/box/index.tsx', 'added');
  const currentPart = row('folder', 'components/box.tsx', 'added', 'Box');
  const oldAmbiguous = row('ambiguous', 'components/a.tsx', 'removed', 'Common');
  const newAmbiguous = ['b', 'c'].map(file => row('ambiguous', 'components/' + file + '.tsx', 'added', 'Common'));
  const oldRender = row('render', 'components/old.tsx', 'removed');
  const newRender = row('render', 'components/new.tsx', 'added');
  const missing = row('missing', 'components/old.tsx', 'removed');
  const missingAfter = row('missing', 'components/new.tsx', 'added');
  const unrelated = row('unrelated', 'components/ignore.tsx', 'added');
  const calls = [];
  const result = await pairFrameMoves([oldGit, currentGit, currentFolder, oldFolder, currentBox, currentPart,
    oldAmbiguous, ...newAmbiguous, oldRender, newRender, missing, missingAfter, unrelated], inputs,
  async (candidates, theme) => {
    calls.push([theme, candidates]);
    return new Map([[oldRender, 'pixels'], [newRender, 'pixels'], [missing, undefined]]);
  });
  assert.deepEqual(result.filter(item => item.previousSource).map(item => [item.previousSource, item.source]), [
    [oldGit.source, currentGit.source], [oldFolder.source, currentBox.source], [oldRender.source, newRender.source],
  ]);
  for (const original of [currentFolder, currentPart, missing, missingAfter, unrelated]) {
    assert.ok(result.includes(original));
  }
  const ambiguous = result.find(item => item.source === oldAmbiguous.source);
  assert.equal(ambiguous.status, 'removed');
  assert.deepEqual(ambiguous.matchCandidates, newAmbiguous.map(({ source, frame }) => ({ source, frame })));
  assert.deepEqual(calls, [['light', [oldRender, newRender, missing, missingAfter]], ['dark', [oldRender, newRender]]]);
});

test('real Git diff pairs moves and retains dark-only changes in a light review', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-review-moves-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, contents) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const remove = name => rm(path.join(root, name));
  const plain = (frame, color, { tag = 'div', dark = color } = {}) => `import { Frame } from 'adg';
export default () => <Frame name="${frame}"><${tag} class="bg-[${color}] dark:bg-[${dark}]" style={{display:'block',width:24,height:20}}/></Frame>;`;
  const own = color => `import { Frame } from 'adg';
export function Badge() { return <div style={{width:24,height:20,background:'${color}'}}/>; }
export default () => <Frame name="owned"><Badge/></Frame>;`;
  const reuse = color => `import { Frame } from 'adg'; import { Shared } from './shared';
export { Shared };
export default () => <Frame name="reuse"><Shared color="${color}"/></Frame>;`;
  const [gitOld, gitNew, moduleOld, moduleNew, partOld, partNew, renderOld, renderNew, darkOld, darkNew,
    ambiguousOld, ambiguousDuplicate, ambiguousNew, reuseOld, reuseNew] = [
    'components/git-before', 'components/git-after', 'modules/card', 'modules/card/index',
    'components/part-before', 'components/part-after', 'components/render-before', 'components/render-after',
    'components/dark-before', 'components/dark-after', 'components/ambiguous-before', 'components/ambiguous-copy',
    'components/ambiguous-after', 'components/reuse-before', 'components/reuse-after',
  ].map(source => 'design/' + source + '.tsx');
  await put('adg.config.mjs', 'export default {};');
  await put('.gitignore', 'output/\nstate/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  await put('design/components/shared.tsx', `import { Frame } from 'adg';
export function Shared({color}) { return <div style={{width:24,height:20,background:color}}/>; }
export default () => <Frame name="shared"><Shared color="#123456"/></Frame>;`);
  await put(gitOld, plain('git', '#123456'));
  await put(moduleOld, plain('feature', '#234567', { dark: '#444444' }));
  await put(partOld, own('#546789'));
  await put(renderOld, plain('render', '#987654'));
  await put(darkOld, plain('dark', '#112233', { dark: '#444444' }));
  await put(ambiguousOld, plain('ambiguous', '#554433'));
  await put(ambiguousDuplicate, plain('ambiguous', '#554433', { tag: 'span' }));
  await put(reuseOld, reuse('#514012'));
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base');
  git('mv', gitOld, gitNew);
  for (const file of [moduleOld, partOld, renderOld, darkOld, ambiguousOld, ambiguousDuplicate, reuseOld]) await remove(file);
  await put(moduleNew, plain('feature', '#234567', { dark: '#555555' }));
  await put(partNew, own('#ab1234'));
  await put(renderNew, plain('render', '#987654', { tag: 'span' }));
  await put(darkNew, plain('dark', '#112233', { dark: '#333333' }));
  await put(ambiguousNew, plain('ambiguous', '#554433', { tag: 'section' }));
  await put(reuseNew, reuse('#821201'));
  const config = await loadConfig(root);
  const options = { base: 'HEAD', theme: 'light', json: true, 'state-dir': path.join(root, 'state') };
  const runtime = { renderSheet: async () => null };
  const ref = (source, frame) => ({ source, frame });

  const onlyMoves = await diff(config, [gitOld, gitNew, renderOld, renderNew], options, runtime);
  assert.equal(onlyMoves.data.verdict, 'identical');
  assert.equal(onlyMoves.data.summary.moved, 2);
  assert.deepEqual(onlyMoves.data.reasons, []);
  assert.deepEqual(onlyMoves.data.review.movePairs, [
    { before: ref(gitOld, 'git'), after: ref(gitNew, 'git') },
    { before: ref(renderOld, 'render'), after: ref(renderNew, 'render') },
  ]);
  for (const row of onlyMoves.data.comparisons) {
    assert.equal(row.status, 'moved');
    assert.equal(row.verdict, 'identical');
    assert.equal(row.theme, 'light');
    assert.equal(row.before.source, row.previousSource);
  }

  await assert.rejects(diff(config, [moduleOld, moduleNew], options, runtime), error => {
    assert.equal(error.code, 'DIFF_FAILED');
    assert.equal(error.data.verdict, 'changed');
    assert.deepEqual(error.data.reasons, ['pixels_changed']);
    assert.equal(error.data.comparisons.length, 1);
    const [row] = error.data.comparisons;
    assert.equal(row.status, 'matched');
    assert.equal(row.verdict, 'identical');
    assert.equal(row.previousSource, moduleOld);
    assert.deepEqual(row.before, ref(moduleOld, 'feature'));
    assert.deepEqual(row.after, ref(moduleNew, 'feature'));
    assert.deepEqual(row.change, { kind: 'direct', causes: [moduleOld, moduleNew].sort() });
    assert.equal(error.data.review.changed, 1);
    assert.deepEqual(error.data.review.movePairs, []);
    return true;
  });

  let impacted;
  await assert.rejects(diff(config, [], { ...options, impacted: true }, runtime), error => {
    assert.equal(error.code, 'DIFF_FAILED');
    impacted = error.data;
    return true;
  });
  assert.equal(impacted.complete, true);
  assert.deepEqual(impacted.review.movePairs, onlyMoves.data.review.movePairs);
  assert.deepEqual([impacted.review.added, impacted.review.removed, impacted.review.moved, impacted.review.changed,
    impacted.review.direct, impacted.review.inherited], [3, 4, 2, 2, 2, 0]);
  const owned = impacted.comparisons.find(row => row.source === partNew);
  assert.equal(owned.previousSource, partOld);
  assert.equal(owned.verdict, 'changed');
  const ordinary = impacted.comparisons.filter(row => ['ambiguous', 'dark', 'reuse'].includes(row.frame));
  assert.equal(ordinary.length, 7);
  assert.ok(ordinary.every(row => ['added', 'removed'].includes(row.status) && !row.previousSource));
  assert.equal(ordinary.find(row => row.source === ambiguousNew).matchCandidates.length, 2);
  assert.ok(impacted.comparisons.every(row => row.theme === 'light'));
  assert.equal(impacted.impact.coverage.renderedRows, impacted.comparisons.length + 4);
  assert.equal(impacted.impact.coverage.deletedRows, 4);
  assert.deepEqual(JSON.parse(await readFile(impacted.reportPath, 'utf8')).review, impacted.review);
});
