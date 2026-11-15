import test from 'node:test';
import assert from 'node:assert/strict';
import { importDirectionViolations, singleConsumerComponents } from '../src/toolkit/asset-rules.mjs';
import { validateFrame } from '../src/toolkit/build.mjs';
import { parseCli } from '../src/cli.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';

test('strict layers reject same-layer imports above the lowest layer', () => {
  const graph = { 'components/a.tsx': { uses: ['components/b.tsx'] }, 'modules/a.tsx': { uses: ['modules/b.tsx'] }, 'surfaces/a.tsx': { uses: ['surfaces/b.tsx'] } };
  assert.deepEqual(importDirectionViolations(graph, ['components', 'modules', 'surfaces'], { strictLayers: true }).map(row => [row.from, row.to]), [['modules', 'modules'], ['surfaces', 'surfaces']]);
  assert.deepEqual(importDirectionViolations(graph, ['components', 'modules', 'surfaces']).map(row => [row.from, row.to]), []);
});

test('single-consumer components count direct, transitive, single and zero consumers', () => {
  const parts = { 'components/direct.tsx': ['Direct'], 'components/transitive.tsx': ['Transitive'], 'components/single.tsx': ['Single'], 'components/unused.tsx': ['Unused'] };
  const graph = {
    'components/direct.tsx': { uses: [] },
    'components/transitive.tsx': { uses: [] },
    'components/single.tsx': { uses: [] },
    'components/unused.tsx': { uses: [] },
    'components/helper.tsx': { uses: ['components/transitive.tsx'] },
    'modules/one.tsx': { uses: ['components/direct.tsx', 'components/helper.tsx'] },
    'modules/solo.tsx': { uses: ['components/single.tsx'] },
    'modules/two.tsx': { uses: ['components/direct.tsx'] },
  };
  const warnings = singleConsumerComponents(graph, ['components', 'modules', 'surfaces'], parts);
  assert.deepEqual(warnings.map(row => [row.part, row.consumers]), [
    ['Transitive', ['modules/one.tsx']],
    ['Single', ['modules/solo.tsx']],
    ['Unused', []],
  ]);
  assert.equal(warnings.some(row => row.part === 'Direct'), false);
});

test('proposed frame metadata is validated as a nonempty review scope', () => {
  assert.doesNotThrow(() => validateFrame({ frame: true, name: 'draft', proposed: 'governance' }));
  assert.throws(() => validateFrame({ frame: true, name: 'draft', proposed: ' ' }), /Invalid Frame proposed/);
});

test('owner reverse part selector is accepted by the CLI parser', () => {
  const parsed = parseCli(['owner', '--part=design/components/button.tsx#Button', '--json']);
  assert.equal(parsed.values.part, 'design/components/button.tsx#Button');
});

test('single-consumer checking defaults on', async () => {
  assert.equal((await loadConfig(process.cwd())).check.singleConsumer, true);
});
