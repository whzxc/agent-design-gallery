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

test('single-consumer components count nearest modules and surfaces', () => {
  const parts = { 'components/single.tsx': ['Single'], 'components/two-modules.tsx': ['TwoModules'], 'components/shared.tsx': ['Shared'], 'components/direct-surface.tsx': ['DirectSurface'] };
  const graph = {
    'components/single.tsx': { uses: [] },
    'components/two-modules.tsx': { uses: [] },
    'components/shared.tsx': { uses: [] },
    'components/helper.tsx': { uses: ['components/shared.tsx'] },
    'components/direct-surface.tsx': { uses: [] },
    'modules/one.tsx': { uses: ['components/single.tsx', 'components/two-modules.tsx', 'components/helper.tsx'] },
    'modules/two.tsx': { uses: ['components/two-modules.tsx', 'components/helper.tsx'] },
    'surfaces/page.tsx': { uses: ['modules/one.tsx', 'components/direct-surface.tsx'] },
  };
  const warnings = singleConsumerComponents(graph, ['components', 'modules', 'surfaces'], parts);
  assert.deepEqual(warnings.map(row => [row.part, row.consumers]), [['Single', ['modules/one.tsx']], ['DirectSurface', ['surfaces/page.tsx']]]);
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
