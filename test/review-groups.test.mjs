import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { groupReview } from '../src/toolkit/review-groups.mjs';
import { buildReview } from '../src/toolkit/diff-document.mjs';
import { diff, reviewChange } from '../src/toolkit/diff.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { review as writeReview } from '../src/toolkit/review.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';

function frame(source, area, causes = ['design/components/button.tsx'], kind = 'inherited') {
  return { source, frame: 'default', status: 'changed', change: { kind, causes },
    themes: [{ theme: 'light', differentPixels: area, verdict: 'changed' }] };
}

function review(changed) {
  return { complete: false, failures: [{ source: 'broken.tsx' }], verdict: null,
    counts: { added: 1, removed: 1, moved: 0, changed: changed.length },
    sections: { added: [{ source: 'new.tsx' }], removed: [{ source: 'old.tsx' }], changed } };
}

test('cause sets are canonical, distinct, inherited-only and retain frame references', () => {
  const direct = frame('a.tsx', 8, ['a.tsx'], 'direct');
  const first = frame('b.tsx', 10, ['z.tsx', 'x.tsx', 'z.tsx']);
  const second = frame('c.tsx', 20, ['x.tsx', 'z.tsx']);
  const third = frame('d.tsx', 30, ['x.tsx']);
  const input = review([direct, first, second, third]);
  const snapshot = JSON.stringify(input);
  const grouped = groupReview(input);
  assert.deepEqual(grouped.counts, { added: 1, removed: 1, moved: 0, changed: 4, direct: 1, inherited: 3 });
  assert.deepEqual(grouped.groups.map(group => group.causes), [['x.tsx', 'z.tsx'], ['x.tsx']]);
  assert.equal(grouped.groups[0].frames[0], first);
  assert.equal(grouped.groups[0].frames[1], second);
  assert.equal(grouped.sections, input.sections);
  assert.equal(grouped.failures, input.failures);
  assert.equal(grouped.complete, false);
  assert.equal(grouped.verdict, null);
  assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(groupReview(grouped), grouped);
});

test('area uses the largest theme and outliers strictly exceed twice the median', () => {
  const frames = [1, 10, 20, 40, 41].map((area, index) => frame(`${index}.tsx`, area));
  frames[0].themes.push({ theme: 'dark', differentPixels: 15, verdict: 'changed' });
  const [group] = groupReview(review(frames)).groups;
  assert.equal(group.medianArea, 20);
  assert.equal(group.representative, frames[2]);
  assert.deepEqual(group.outliers, [frames[4]]);
});

test('even medians and equal-distance representatives use original source order', () => {
  const frames = [20, 10, 40, 30].map((area, index) => frame(`${index}.tsx`, area));
  const [group] = groupReview(review(frames)).groups;
  assert.equal(group.medianArea, 25);
  assert.equal(group.representative, frames[0]);
  const equal = frames.map(item => ({ ...item, themes: [{ differentPixels: 0 }] }));
  const [zero] = groupReview(review(equal)).groups;
  assert.equal(zero.representative, equal[0]);
  assert.deepEqual(zero.outliers, []);
  assert.deepEqual(groupReview(review([])).groups, []);
});

const config = { root: '/project', design: '/project/design', sources: ['atoms', 'features', 'pages'] };
const inputs = changes => ({ changes: changes.map(name => ({ before: name, after: name })),
  before: { config }, after: { config } });
const built = { before: new Map(), after: new Map() };

test('own source and any feature-folder file are direct, including custom source layers', () => {
  const row = { source: 'design/features/card/index.tsx', frame: 'default' };
  for (const name of ['design/features/card/index.tsx', 'design/features/card/unused.tsx', 'design/features/card/notes.md', 'design/features/card/icon.png']) {
    assert.deepEqual(reviewChange(row, inputs([name]), built), { kind: 'direct', causes: [name] });
  }
  assert.deepEqual(reviewChange(row, inputs(['design/features/cards/notes.md']), built), { kind: 'inherited', causes: [] });
  const atom = { source: 'design/atoms/card.tsx', frame: 'default' };
  assert.deepEqual(reviewChange(atom, inputs(['design/atoms/card.tsx']), built), { kind: 'direct', causes: [atom.source] });
  assert.equal(reviewChange(atom, inputs(['design/atoms/other.tsx']), built).kind, 'inherited');
});

test('impacted reasons supply reaching causes across themes and exclude support-only reasons', () => {
  const row = { source: 'design/pages/account.tsx', frame: 'default' };
  const selection = {
    facts: [
      { id: 'f1', source: 'design/atoms/button.tsx' },
      { id: 'f2', source: 'design/tokens.css' },
      { id: 'f3', source: 'design/pages/new.tsx' },
      { id: 'f4', source: 'unrelated.tsx' },
    ],
    frames: [{ source: row.source, frames: ['default'], rows: [
      { themes: ['light'], reasons: [{ fact: 'f1', scope: 'transitive' }, { fact: 'f1', scope: 'transitive' }] },
      { themes: ['dark'], reasons: [{ fact: 'f2', scope: 'transitive' }, { fact: 'f3', scope: 'support' }] },
    ] }],
  };
  assert.deepEqual(reviewChange(row, inputs(['design/atoms/button.tsx', 'design/tokens.css']), built, selection),
    { kind: 'inherited', causes: ['design/atoms/button.tsx', 'design/tokens.css'] });
  assert.equal(reviewChange(row, inputs([row.source]), built, selection).kind, 'direct');
});

test('ordinary diff uses both dependency trees, Git paths and global config inputs', () => {
  const row = { source: 'design/pages/account.tsx', frame: 'default' };
  const state = inputs(['design/atoms/deleted.tsx', 'design/atoms/new.tsx', 'design/atoms/unrelated.tsx', 'adg.config.mjs']);
  state.globalChanges = ['adg.config.mjs'];
  const trees = {
    before: new Map([[row.source, { dependencies: ['/project/design/atoms/deleted.tsx'] }]]),
    after: new Map([[row.source, { dependencies: ['/project/design/atoms/new.tsx'] }]]),
  };
  assert.deepEqual(reviewChange(row, state, trees), { kind: 'inherited',
    causes: ['adg.config.mjs', 'design/atoms/deleted.tsx', 'design/atoms/new.tsx'] });
});

test('deleted own sources and architecture sidecars retain direct and inherited identities', () => {
  const row = { source: 'design/atoms/deleted.tsx', frame: 'default' };
  const deleted = inputs([]);
  deleted.changes = [{ before: row.source, after: null }];
  assert.deepEqual(reviewChange(row, deleted, built), { kind: 'direct', causes: [row.source] });
  const arch = { source: 'arch/service.mmd', frame: 'default' };
  const trees = { before: new Map(), after: new Map([[arch.source, { dependencies: ['/project/arch/service.md'] }]]) };
  assert.deepEqual(reviewChange(arch, inputs(['arch/service.md']), trees),
    { kind: 'inherited', causes: ['arch/service.md'] });
});

test('buildReview propagates comparison change metadata and groups frame entries once', () => {
  const change = { kind: 'inherited', causes: ['design/atoms/button.tsx'] };
  const comparisons = ['light', 'dark'].map(theme => ({ id: theme, source: 'design/pages/account.tsx', frame: 'default',
    status: 'matched', theme, verdict: 'changed', change, pixels: { differentPixels: 10 } }));
  const result = buildReview({ comparisons, complete: false, failures: [{ source: 'broken.tsx' }] });
  assert.deepEqual(result.sections.changed[0].change, change);
  assert.equal(result.counts.inherited, 1);
  assert.equal(result.counts.direct, 0);
  assert.equal(result.groups[0].frames[0], result.sections.changed[0]);
  assert.equal(result.complete, false);
});

test('contract: Git diffs classify inherited consumers and standalone review embeds one representative per group', { timeout: 60000 }, async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-review-groups-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, text) => {
    const file = path.join(root, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  };
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  await put('adg.config.mjs', 'export default {};');
  await put('.gitignore', 'output/\nstate/\ndesign/.adg/\n');
  await put('design/tokens.css', starterTokens);
  const part = color => `export function Card({ width = 30 } = {}) { return <div style={{ width, height: 20, background: '${color}' }}/>; }`;
  await put('design/modules/card/part.tsx', part('#123456'));
  await put('design/modules/card/index.tsx', `import { Frame } from 'adg'; import { Card } from './part';
export { Card } from './part'; export default () => <Frame name="default"><Card/></Frame>;`);
  await put('design/surfaces/page.tsx', `import { Frame } from 'adg'; import { Card } from '../modules/card';
export default () => [
  <Frame name="default"><Card/><span>Sample representative content</span></Frame>,
  <Frame name="other"><Card/><span>Sample omitted content</span></Frame>,
  <Frame name="wide"><Card width={300}/><span>Sample outlier content</span></Frame>,
];`);
  await put('design/components/broken.tsx', 'invalid TSX <');
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  await put('design/modules/card/part.tsx', part('#abcdef'));
  const current = await loadConfig(root);
  for (const impacted of [false, true]) {
    let failure;
    try {
      await diff(current, [], { base: 'HEAD', impacted, theme: 'light', json: true, 'state-dir': path.join(root, 'state') },
        { log: () => {}, readSystemTheme: () => 'light' });
    } catch (error) { failure = error; }
    assert.equal(failure?.code, 'SOURCE_BUILD_FAILED');
    const data = failure.data;
    assert.equal(data.complete, false);
    assert.equal(data.failures.length, 2);
    assert.deepEqual({ direct: data.review.direct, inherited: data.review.inherited, changed: data.review.changed },
      { direct: 1, inherited: 3, changed: 4 });
    const own = data.comparisons.find(row => row.source === 'design/modules/card/index.tsx');
    const inherited = data.comparisons.find(row => row.source === 'design/surfaces/page.tsx');
    assert.deepEqual(own.change, { kind: 'direct', causes: ['design/modules/card/part.tsx'] });
    assert.deepEqual(inherited.change, { kind: 'inherited', causes: ['design/modules/card/part.tsx'] });
    const group = data.review.groups[0];
    assert.deepEqual(group.frames, ['default', 'other', 'wide'].map(frame => ({ source: inherited.source, frame })));
    assert.deepEqual(group.outliers, [{ source: inherited.source, frame: 'wide' }]);
    assert.deepEqual(group.representative, { source: inherited.source, frame: 'default' });
    const persisted = JSON.parse(await readFile(data.reportPath, 'utf8'));
    assert.deepEqual(persisted.review, data.review);
    assert.deepEqual(persisted.comparisons.map(row => row.change), data.comparisons.map(row => row.change));
  }
  const out = path.join(root, 'output', 'review.html');
  await assert.rejects(writeReview(current, { base: 'HEAD', theme: 'light', json: true, out }), error => {
    assert.equal(error.code, 'SOURCE_BUILD_FAILED');
    assert.equal(error.data.counts.inherited, 3);
    assert.equal(error.data.groups[0].frames.length, 3);
    return true;
  });
  const document = await readFile(out, 'utf8');
  assert.match(document, /3 frames · 2 omitted/);
  assert.match(document, /Sample representative content/);
  assert.doesNotMatch(document, /Sample (omitted|outlier) content/);
});
