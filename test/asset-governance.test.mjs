import test from 'node:test';
import assert from 'node:assert/strict';
import { importDirectionViolations, singleConsumerComponents } from '../src/toolkit/asset-rules.mjs';
import { validateFrame } from '../src/toolkit/build.mjs';
import { parseCli } from '../src/cli.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starterTokens } from '../src/toolkit/project.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

for (const [design, layers] of [
  ['design', ['components', 'modules', 'surfaces']],
  ['ui/specs', ['atoms', 'features', 'pages']],
  ['.', ['components', 'modules', 'surfaces']],
]) {
  test(`lifecycle CLI checks production sources under ${design}`, async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'adg-lifecycle-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const put = async (name, text) => {
      const file = path.join(root, name);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, text);
    };
    const source = name => path.posix.join(design, name);
    const [components, modules, surfaces] = layers;
    const config = { design, sources: [...layers, 'studies'], check: { strictLayers: true, lifecycle: true } };
    await put('adg.config.mjs', `export default ${JSON.stringify(config)};`);
    await put(source('tokens.css'), starterTokens);
    await put(source('implementation.json'), JSON.stringify({ version: 1, mappings: [] }));
    const label = `import { Frame } from 'adg';
export function Label() { return <div class="h-[24px] w-[80px]">Ready</div>; }
export default () => <Frame name="ready"><Label /></Frame>;`;
    const panel = `import { Frame } from 'adg';
import { Label } from '../../${components}/label';
export function Panel() { return <section class="h-[56px] w-[112px] p-4"><Label /></section>; }
export default () => <Frame name="ready"><Panel /></Frame>;`;
    const home = `import { Frame } from 'adg';
import { Panel } from '../${modules}/panel';
export default () => <Frame name="ready"><main class="h-[88px] w-[144px] p-4"><Panel /></main></Frame>;`;
    await put(source(`${components}/label.tsx`), label);
    await put(source(`${modules}/panel/index.tsx`), panel);
    await put(source(`${surfaces}/home.tsx`), home);
    await put(source('studies/draft.tsx'), label);

    const run = async () => {
      const result = await exec(process.execPath, [cli, 'check', '--read-only', '--json'], { cwd: root })
        .then(result => ({ ...result, code: 0 }), error => error);
      return { code: result.code, result: JSON.parse(result.stdout) };
    };
    const before = await readdir(root, { recursive: true });
    const failed = await run();
    assert.equal(failed.code, 1);
    assert.equal(failed.result.ok, false);
    assert.equal(failed.result.error.code, 'CHECK_FAILED');
    assert.equal(failed.result.data.complete, true);
    assert.deepEqual(failed.result.data.summary, { sources: 4, frames: 4, evaluations: 8, problems: 4 });
    assert.deepEqual(failed.result.data.findings.map(({ code, source, frame }) => [code, source, frame]), [
      ['OWNER_PART_UNBOUND', source(`${components}/label.tsx`), null],
      ['OWNER_PART_UNBOUND', source(`${modules}/panel/index.tsx`), null],
      ['OWNER_SURFACE_UNBOUND', source(`${surfaces}/home.tsx`), null],
      ['OWNER_SURFACE_FRAME_UNCAPTURED', source(`${surfaces}/home.tsx`), 'ready'],
    ]);
    assert.equal(failed.result.warnings.filter(warning => warning.code === 'SINGLE_CONSUMER_COMPONENT').length, 1);
    assert.deepEqual(await readdir(root, { recursive: true }), before);

    await put(source(`${components}/label.tsx`), label.replace('name="ready"', 'name="ready" proposed="review"'));
    await put(source(`${modules}/panel/index.tsx`), panel.replace('name="ready"', 'name="ready" proposed="review"'));
    await put(source(`${surfaces}/home.tsx`), home.replace('name="ready"', 'name="ready" fixture="home" capture={{ page: true }}'));
    await put('ui/home.ts', 'export function Home() {}');
    await put(source('implementation.json'), JSON.stringify({ version: 1, mappings: [{
      implementation: { file: 'ui/home.ts', symbol: 'Home' },
      design: [{ source: source(`${surfaces}/home.tsx`) }],
    }] }));
    const passed = await run();
    assert.equal(passed.code, 0);
    assert.equal(passed.result.ok, true);
    assert.deepEqual(passed.result.data.findings, []);
    assert.equal(passed.result.data.proposed.length, 2);

    await put(source(`${components}/label.tsx`), label);
    await put(source(`${modules}/panel/index.tsx`), panel);
    await put(source(`${surfaces}/home.tsx`), home);
    await put('adg.config.mjs', `export default ${JSON.stringify({ ...config, check: { ...config.check, lifecycle: false } })};`);
    const disabled = await run();
    assert.equal(disabled.code, 0);
    assert.deepEqual(disabled.result.data.findings, []);
  });
}

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
    'modules/one/index.tsx': { uses: ['components/single.tsx', 'components/two-modules.tsx', 'components/helper.tsx'] },
    'modules/one/detail.tsx': { uses: ['components/single.tsx', 'components/helper.tsx'] },
    'modules/two.tsx': { uses: ['components/two-modules.tsx', 'components/helper.tsx'] },
    'surfaces/page.tsx': { uses: ['modules/one/index.tsx', 'components/direct-surface.tsx'] },
  };
  const warnings = singleConsumerComponents(graph, ['components', 'modules', 'surfaces'], parts);
  assert.deepEqual(warnings.map(row => [row.part, row.consumers]), [['Single', ['modules/one']], ['DirectSurface', ['surfaces/page.tsx']]]);
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
