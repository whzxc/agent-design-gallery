import test from 'node:test';
import assert from 'node:assert/strict';
import { importDirectionViolations } from '../src/toolkit/asset-rules.mjs';
import { validateFrame } from '../src/toolkit/build.mjs';
import { parseCli } from '../src/cli.mjs';

test('strict layers reject same-layer imports above the lowest layer', () => {
  const graph = { 'components/a.tsx': { uses: ['components/b.tsx'] }, 'modules/a.tsx': { uses: ['modules/b.tsx'] }, 'surfaces/a.tsx': { uses: ['surfaces/b.tsx'] } };
  assert.deepEqual(importDirectionViolations(graph, ['components', 'modules', 'surfaces'], { strictLayers: true }).map(row => [row.from, row.to]), [['modules', 'modules'], ['surfaces', 'surfaces']]);
  assert.deepEqual(importDirectionViolations(graph, ['components', 'modules', 'surfaces']).map(row => [row.from, row.to]), []);
});

test('proposed frame metadata is validated as a nonempty review scope', () => {
  assert.doesNotThrow(() => validateFrame({ frame: true, name: 'draft', proposed: 'governance' }));
  assert.throws(() => validateFrame({ frame: true, name: 'draft', proposed: ' ' }), /Invalid Frame proposed/);
});

test('owner reverse part selector is accepted by the CLI parser', () => {
  const parsed = parseCli(['owner', '--part=design/components/button.tsx#Button', '--json']);
  assert.equal(parsed.values.part, 'design/components/button.tsx#Button');
});
