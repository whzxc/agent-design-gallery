import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { impact } from '../src/toolkit/impact.mjs';
import { tokenReachability } from '../src/toolkit/token-reachability.mjs';
import { groupImpactFrames, impactFrameCount } from '../src/toolkit/impact-output.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { main, parseCli } from '../src/cli.mjs';
import { nextActions } from '../src/cli-output.mjs';

const sheet = starterTokens.replace('--text: #171717;', '--text: #171717;\n  --accent: #123456;\n  --alias: var(--accent);\n  --rare: #abcdef;\n  --other: #111111;')
  .replace(':root[data-theme="dark"] {', ':root[data-theme="dark"] {\n  --alias: var(--other);');
const button = `import {Frame} from 'adg';
export function Button(){return <button class="text-alias">Save</button>}
export function Dialog(){return <div class="bg-rare">Dialog</div>}
export default()=> [<Frame name="button"><Button/></Frame>, <Frame name="dialog"><Dialog/></Frame>];`;

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-impact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (name, text) => { const file = path.join(root, name); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, text); return file; };
  await put('adg.config.mjs', 'export default {};');
  await put('design/tokens.css', sheet);
  await put('design/components/control.tsx', button);
  await put('design/fixtures/helper.ts', `export {Button} from '../components/control';`);
  await put('design/surfaces/home.tsx', `import {Frame} from 'adg';import {Button} from '../fixtures/helper';export default()=> <Frame name="home"><main><Button/></main></Frame>;`);
  await put('design/surfaces/unused.tsx', `import {Frame} from 'adg';import {Dialog} from '../components/control';export function Unobserved(){return <Dialog/>}export default()=> <Frame name="unused"><div>Unused import</div></Frame>;`);
  await put('design/surfaces/leaf.tsx', `import {Frame} from 'adg';export default()=> <Frame name="leaf"><div>Leaf</div></Frame>;`);
  await put('arch/example.mmd', 'flowchart LR\n a-->b');
  await put('arch/example.md', 'Notes');
  await put('ui/control.ts', 'export function Button() {}\nconst helper=1;\nexport function Unmapped() {}\nexport function Dialog() {}\n');
  const mappings = [
    { implementation: { file: 'ui/control.ts', symbol: 'Button' }, design: [{ source: 'design/components/control.tsx', part: 'Button', frames: ['button'] }] },
    { implementation: { file: 'ui/control.ts', symbol: 'Dialog' }, design: [{ source: 'design/components/control.tsx', part: 'Dialog' }] },
    { implementation: { file: 'ui/control.ts' }, design: [{ source: 'design/surfaces/leaf.tsx' }] },
  ];
  await put('design/implementation.json', JSON.stringify({ version: 1, mappings }));
  const config = await loadConfig(root), state = path.join(root, 'state');
  return { root, put, config, mappings, values: extra => ({ json: true, 'state-dir': state, ...extra }),
    git: (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim() };
}
const expand = data => data.frames.flatMap(group => group.frames.map(name => ({
  ref: { source: group.source, frame: name }, status: group.status, matchKind: group.matchKind ?? null,
  matchCandidates: group.matchCandidates ?? [], themes: group.rows.flatMap(row => row.themes.map(theme => ({
    ...row, theme, proof: row.proof ?? null, unassessedReasons: row.unassessedReasons ?? [],
  }))),
})));
const frameCount = data => impactFrameCount(data.frames);
const refs = data => expand(data).map(frame => `${frame.ref.source}#${frame.ref.frame}`);
const reasons = (data, kind) => expand(data).filter(frame => frame.themes.some(theme => theme.reasons.some(reason => reason.class === kind)));

test('impact CLI families, repeatable seeds, strict flags and safe recovery', async () => {
  for (const argv of [['--source=a', '--source=b'], ['--source=a', '--part=B'], ['--token=--accent'], ['--file=a', '--line=2', '--symbol=B'], ['--base=HEAD'], ['--base=A', '--head=B']]) assert.equal(parseCli(['impact', ...argv]).command, 'impact');
  for (const argv of [[], ['--source='], ['--source=a', '--token=b'], ['--source=a', '--source=b', '--part=B'], ['--token=a', '--part=B'], ['--file=a', '--head=B'], ['--head=B'], ['--file=a', '--line=0'], ['--token=a', '--line=2'], ['--base=A', '--base=B'], ['--token=a', '--theme=no'], ['--token=a', 'extra'], ['--token=a', '--observe'], ['--token=a', '--scale=2']]) assert.throws(() => parseCli(['impact', ...argv]), { code: 'USAGE_INVALID' });
  for (const command of ['render', 'check', 'diff']) assert.throws(() => parseCli([command, '--impacted', '--base=HEAD']), { code: 'USAGE_INVALID' }, 'segment 1 has no consuming flags');
  const values = { source: ['design/a.tsx', 'design/b.tsx'], theme: 'dark', 'state-dir': '/tmp/a b', explain: true };
  const argv = nextActions('IMPACT_INPUT_CHANGED', { command: 'impact', values })[0].argv;
  assert.deepEqual(argv, ['adg', 'impact', '--source=design/a.tsx', '--source=design/b.tsx', '--theme=dark', '--state-dir=/tmp/a b', '--explain', '--json']);
  assert.equal(parseCli(argv.slice(1)).values.explain, true);
  assert.deepEqual(nextActions('IMPACT_INPUT_CHANGED', { command: 'impact', values: { file: 'Bearer secret' } })[0].argv, ['adg', 'impact', '--help', '--json']);
  let stdout = '';
  await main(['impact', '--json', '--head=B'], '/missing', { stdout: value => { stdout += value; }, stderr: () => {}, exit: () => {} });
  assert.equal(JSON.parse(stdout).command, 'impact'); assert.equal(JSON.parse(stdout).error.code, 'USAGE_INVALID');
});

test('lexical token closure includes fallback/text/CSS names, theme inheritance and conservative full-sheet fallback', () => {
  const tokens = sheet.replace('--rare: #abcdef;', '--rare: #abcdef;\n  --fallback: var(--alias, var(--rare));');
  const light = tokenReachability('text --fallback; .unused { color: var(--alias) }', tokens, 'light');
  assert.equal(light.mode, 'reachable_declarations');
  assert.ok(light.names.includes('--accent')); assert.ok(light.names.includes('--rare'));
  assert.deepEqual(light.via['--alias'], [], 'a direct lexical occurrence is the shortest witness');
  const dark = tokenReachability('var(--alias)', tokens, 'dark');
  assert.ok(dark.names.includes('--other')); assert.ok(!dark.names.includes('--accent'));
  for (const document of [String.raw`.gap-\(--field-error-gap\)`, String.raw`var(--\61 ccent)`,
    String.raw`var(--acce\nt)`, 'var(&#45;&#x2d;accent)', 'var(--ac&#99;ent)', 'var(--&bsol;61 ccent)']) {
    const result = tokenReachability(document, tokens, 'light');
    assert.equal(result.mode, 'reachable_declarations', document);
    if (document.includes('var(')) assert.ok(result.names.includes('--accent'), document);
  }
  const cycle = tokenReachability('var(--alias)', tokens.replace('--alias: var(--accent);', '--alias: var(--alias);'), 'light');
  assert.equal(cycle.mode, 'reachable_declarations'); assert.equal(cycle.declarations['--alias'], 'var(--alias)');
  const absent = tokenReachability('var(--alias)', tokens.replace('--alias: var(--accent);', '--alias: var(--missing);'), 'light');
  assert.equal(absent.mode, 'reachable_declarations'); assert.equal(absent.declarations['--missing'], null);
  const parseFailure = tokenReachability('var(--alias)', tokens + '\n@media print {}', 'light');
  assert.deepEqual(parseFailure.fallbackReasons, ['tokens_parse_failed']);
  const unbalanced = tokenReachability('var(--alias)', tokens.replace('--alias: var(--accent);', '--alias: var(--accent;'), 'light');
  assert.deepEqual(unbalanced.fallbackReasons, ['unbalanced_var']);
  assert.equal(tokenReachability('var(--alias)', tokens.replace('--alias: var(--accent);', '--alias: var(broken);'), 'light').mode, 'reachable_declarations');
  assert.ok(tokenReachability('var(--new)', tokens, 'light').names.includes('--new'), 'absence is a material token input');
});

test('builder exposes token provenance, and inline-reference utilities retain var token names', async t => {
  const f = await fixture(t), built = await buildSource(f.config, path.join(f.root, 'design/components/control.tsx'), { write: false });
  assert.equal(built.tokenCss, sheet);
  assert.match(built.cssWithoutTokens, /color:\s*var\(--alias\)/);
  assert.ok(!built.cssWithoutTokens.includes('--rare: #abcdef;'));
  assert.ok(built.frames[0].document('dark').includes(sheet));
});

test('wire grouping merges equal themes and source frames, keeps first witnesses, and aggregates counts', () => {
  const frame = (name, changed = false) => ({ ref: { source: 'design/a.tsx', frame: name }, status: 'current', matchKind: null, matchCandidates: [],
    themes: ['light', 'dark'].map(theme => ({ theme, candidate: true, disposition: 'render', proof: null, unassessedReasons: [],
      reasons: [{ fact: 'f1', class: changed ? 'part_occurrence' : 'dependency', scope: 'direct', sides: ['after'], count: 1,
        witness: { origin: 'emitted', source: 'design/a.tsx', part: name, token: null, via: [], mappingPointer: null } }] })) });
  const raw = [frame('first'), frame('different', true), frame('last')], saved = JSON.stringify(raw);
  const compact = groupImpactFrames(raw);
  assert.equal(compact.length, 2); assert.deepEqual(compact[0].frames, ['first', 'last']);
  assert.deepEqual(compact[0].rows[0].themes, ['light', 'dark']);
  assert.equal(compact[0].rows[0].reasons[0].count, 4);
  assert.equal(compact[0].rows[0].proof, undefined); assert.equal(compact[0].rows[0].unassessedReasons, undefined);
  assert.equal(compact[0].matchKind, undefined); assert.equal(compact[0].matchCandidates, undefined);
  const explained = groupImpactFrames(raw, { explain: true });
  assert.equal(explained.length, 2); assert.equal(explained[0].rows[0].reasons[0].witness.part, 'first');
  assert.equal(explained[0].rows[0].reasons[0].count, 4);
  assert.equal(JSON.stringify(raw), saved, 'wire grouping does not mutate index/query facts');
  raw[0].themes[1].candidate = false;
  assert.equal(groupImpactFrames(raw)[0].rows.length, 2, 'different theme records remain distinct');
  const proofFrames = [frame('first'), frame('last')];
  for (const frame of proofFrames) for (const row of frame.themes) {
    row.proof = { kind: 'materialized_inputs_equal', version: 1, projection: `${frame.ref.frame}-${row.theme}`, tokenMode: 'full_sheet' };
    row.disposition = 'proven_unaffected';
  }
  const proven = groupImpactFrames(proofFrames);
  assert.equal(proven.length, 1); assert.equal(proven[0].rows.length, 1); assert.equal(proven[0].rows[0].proof.projection, undefined);
  assert.equal(groupImpactFrames(proofFrames, { explain: true })[0].rows[0].proof.projection, 'first-light');
});

test('token full-sheet fallback is counted per input row and warns once, including warm cached facts', async t => {
  const f = await fixture(t);
  await f.put('design/tokens.css', sheet.replace(/(--canvas:)[^;]*;/g, '$1 var(--accent;'));
  for (let i = 0; i < 2; i++) {
    const result = await impact(f.config, f.values({ token: ['--canvas'] }));
    assert.deepEqual(result.data.coverage.tokenScan, { reachableRows: 0, fullSheetRows: 10, fallbackReasons: ['unbalanced_var'] });
    assert.equal(result.warnings.filter(warning => warning.code === 'IMPACT_TOKEN_FALLBACK').length, 1);
    assert.match(result.warnings.find(warning => warning.code === 'IMPACT_TOKEN_FALLBACK').message, /unbalanced_var/);
    assert.deepEqual(result.warnings[0].next[0].argv, ['adg', 'check', '--read-only', '--json']);
  }
});

test('source/part/helper queries retain conservative consumers and emitted evidence without observation work', async t => {
  const f = await fixture(t);
  const run = extra => impact(f.config, f.values({ source: ['components/control'], part: 'Button', ...extra }));
  const first = await run({ explain: true }), warm = await run({ explain: true });
  assert.deepEqual(warm.data.frames, first.data.frames);
  assert.equal(frameCount(first.data), 4); assert.equal(reasons(first.data, 'part_occurrence').length, 2);
  assert.ok(refs(first.data).includes('design/surfaces/unused.tsx#unused'), 'unused import stays conservative');
  assert.equal(first.data.coverage.provenRows, 0); assert.equal(first.data.coverage.proofComplete, false);
  assert.equal(first.data.coverage.expectedRows, 12); assert.equal(first.data.coverage.unassessedRows, 4);
  assert.equal(first.data.coverage.directRows, 4); assert.equal(first.data.coverage.transitiveRows, 4);
  const compact = (await run({})).data;
  assert.ok(expand(compact).every(frame => frame.themes.every(theme => theme.reasons.every(reason => !Object.hasOwn(reason, 'witness')))));
  assert.ok(!JSON.stringify(compact).includes('observation'));
  const helper = await impact(f.config, f.values({ source: ['design/fixtures/helper.ts'] }));
  assert.deepEqual(refs(helper.data), ['design/surfaces/home.tsx#home']);
  await assert.rejects(impact(f.config, f.values({ source: ['components/control'], part: 'Missing' })), { code: 'IMPACT_INPUT_NOT_FOUND' });
  await assert.rejects(impact(f.config, f.values({ source: ['../outside'] })), { code: 'SOURCE_NOT_FOUND' });
  await f.put('design/surfaces/new.tsx', `import {Frame} from 'adg';import {Button} from '../components/control';export default()=> <Frame name="new"><Button/></Frame>;`);
  assert.equal(frameCount((await run({})).data), 5, 'inventory additions invalidate warm closure facts');
});

test('token candidates use lexical aliases per theme, default styles and full architecture tokens', async t => {
  const f = await fixture(t);
  const rare = await impact(f.config, f.values({ token: ['--rare'], theme: 'light' }));
  assert.equal(frameCount(rare.data), 3, 'two control frames share generated CSS; architecture uses full sheet');
  assert.equal(reasons(rare.data, 'token_dependency').length, 2);
  const accent = await impact(f.config, f.values({ token: ['--accent'] }));
  const home = expand(accent.data).find(frame => frame.ref.frame === 'home');
  assert.deepEqual(home.themes.map(row => row.theme), ['light'], 'dark alias targets a different token');
  const canvas = await impact(f.config, f.values({ token: ['--canvas'] }));
  assert.equal(frameCount(canvas.data), 6); assert.equal(canvas.data.coverage.candidateRows, 12);
  await assert.rejects(impact(f.config, f.values({ token: ['--no-such-token'] })), { code: 'IMPACT_INPUT_NOT_FOUND' });
});

test('implementation file/line/symbol/directory/glob scope and stale mappings preserve resolvable targets', async t => {
  const f = await fixture(t);
  for (const extra of [{ symbol: 'Button' }, { line: '2' }, {}]) {
    const result = await impact(f.config, f.values({ file: 'ui/control.ts', ...extra }));
    assert.equal(frameCount(result.data), 5, 'mapped source closure plus file-level fallback');
    const mappingReasons = reasons(result.data, 'mapping');
    assert.ok(mappingReasons.some(frame => frame.ref.frame === 'leaf'));
    assert.equal(result.data.coverage.mapping, 'valid');
  }
  const unmappedRegion = await impact(f.config, f.values({ file: 'ui/control.ts', line: '3' }));
  assert.deepEqual(refs(unmappedRegion.data), ['design/surfaces/leaf.tsx#leaf']);
  for (const file of ['ui/', 'ui/*.ts']) assert.equal(frameCount((await impact(f.config, f.values({ file }))).data), 5);
  f.mappings[0].implementation.symbol = 'Missing';
  f.mappings.push({ implementation: { file: 'ui/control.ts' }, design: [{ source: 'design/components/missing.tsx' }] });
  await f.put('design/implementation.json', JSON.stringify({ version: 1, mappings: f.mappings }));
  const stale = await impact(f.config, f.values({ file: 'ui/control.ts' }));
  assert.ok(expand(stale.data).some(frame => frame.ref.frame === 'button'));
  assert.ok(stale.data.mappingFindings.some(finding => finding.code === 'OWNER_LOCATOR_STALE'));
  assert.ok(stale.data.mappingFindings.some(finding => finding.code === 'OWNER_SOURCE_MISSING'));
  assert.equal(frameCount(stale.data), 5, 'mapping gaps do not broaden to architecture');
  assert.ok(stale.warnings.some(warning => warning.code === 'IMPACT_MAPPING_INCOMPLETE'));
  const staleLine = await impact(f.config, f.values({ file: 'ui/control.ts', line: '3' }));
  assert.ok(staleLine.data.mappingFindings.some(finding => finding.code === 'OWNER_LOCATOR_STALE'));
  assert.ok(expand(staleLine.data).some(frame => frame.ref.frame === 'button'), 'a stale locator still exposes its resolvable target');
  await rm(path.join(f.root, 'design/implementation.json'));
  const absent = await impact(f.config, f.values({ file: 'ui/control.ts' }));
  assert.deepEqual(absent.data.frames, []); assert.equal(absent.data.coverage.unassessedRows, 12);
  const dependency = await impact(f.config, f.values({ file: 'design/fixtures/helper.ts' }));
  assert.deepEqual(refs(dependency.data), ['design/surfaces/home.tsx#home'], 'design dependency still applies without mappings');
});

test('Git working tree and exact endpoints include old/new closures, staged/unstaged/untracked, roles and lifecycle', async t => {
  const f = await fixture(t);
  await f.put('.gitignore', 'state/\noutput/\n');
  f.git('init', '-q'); f.git('config', 'user.email', 'fixture@example.invalid'); f.git('config', 'user.name', 'Fixture');
  f.git('add', '.'); f.git('commit', '-qm', 'fixture base'); const base = f.git('rev-parse', 'HEAD');
  await f.put('design/components/control.tsx', button.replace('Save', 'Staged'));
  f.git('add', 'design/components/control.tsx');
  await f.put('design/surfaces/leaf.tsx', `import {Frame} from 'adg';export default()=> <Frame name="leaf"><div>Unstaged</div></Frame>;`);
  await f.put('design/surfaces/new.tsx', `import {Frame} from 'adg';import {Button} from '../components/control';export default()=> <Frame name="new"><Button/></Frame>;`);
  await f.put('output/ignored.txt', 'ignore me');
  const tree = await impact(f.config, f.values({ base: 'HEAD' }));
  assert.equal(tree.data.after.kind, 'working_tree');
  assert.deepEqual(tree.data.changes.map(change => change.after), ['design/components/control.tsx', 'design/surfaces/leaf.tsx', 'design/surfaces/new.tsx']);
  assert.equal(expand(tree.data).find(frame => frame.ref.frame === 'new').status, 'added');
  assert.ok(tree.data.coverage.unassessedRows > 0); assert.equal(tree.data.coverage.proofComplete, false);
  assert.ok(expand(tree.data).every(frame => frame.themes.every(row => row.proof === null && row.unassessedReasons.length === 0)));
  f.git('add', 'design'); f.git('commit', '-qm', 'fixture changed'); const head = f.git('rev-parse', 'HEAD');
  await f.put('design/surfaces/uncommitted.tsx', `import {Frame} from 'adg';export default()=> <Frame name="uncommitted"><div/></Frame>;`);
  const revisions = await impact(f.config, f.values({ base, head }));
  assert.equal(revisions.data.after.kind, 'revision'); assert.equal(revisions.data.after.sha, head);
  assert.deepEqual(refs(revisions.data), refs(tree.data)); assert.ok(!JSON.stringify(revisions.data).includes('uncommitted'));
  await rename(path.join(f.root, 'design/surfaces/leaf.tsx'), path.join(f.root, 'design/surfaces/renamed.tsx'));
  f.git('add', 'design/surfaces/leaf.tsx', 'design/surfaces/renamed.tsx');
  await rm(path.join(f.root, 'arch/example.mmd'));
  await f.put('design/tokens.css', sheet.replace('--rare: #abcdef;', '--rare: #fedcba;'));
  await f.put('policy.mjs', 'export const policy={importDirection:false};');
  await f.put('adg.config.mjs', "import {policy} from './policy.mjs';export default {check:policy};");
  await rm(path.join(f.root, 'ui/control.ts'));
  const changed = await impact(await loadConfig(f.root), f.values({ base: head }));
  assert.ok(changed.data.changes.some(change => change.status === 'renamed'));
  assert.ok(changed.data.changes.some(change => change.role === 'architecture' && change.status === 'deleted'));
  assert.ok(changed.data.changes.some(change => change.role === 'token'));
  assert.ok(changed.data.changes.some(change => change.role === 'config'));
  assert.ok(changed.data.changes.some(change => change.role === 'config' && change.after === 'policy.mjs'));
  assert.ok(changed.data.mappingFindings.some(finding => finding.code === 'OWNER_IMPLEMENTATION_MISSING' && finding.sides.includes('after')));
  assert.ok(expand(changed.data).some(frame => frame.matchKind === 'renamed_or_unknown'));
  assert.ok(expand(changed.data).some(frame => frame.ref.source === 'arch/example.mmd' && frame.status === 'removed'));
});

test('JSON success/empty/error/human output and late input changes close the shared index', async t => {
  const f = await fixture(t);
  for (const [args, code] of [[['--source=surfaces/leaf'], 0], [['--token=--missing'], 2], [['--file=ui/missing.ts'], 2]]) {
    let stdout = '', stderr = '';
    assert.equal(await main(['impact', ...args, `--state-dir=${path.join(f.root, 'state')}`, '--json'], f.root,
      { stdout: text => { stdout += text; }, stderr: text => { stderr += text; }, exit: () => {} }), code);
    assert.equal(stdout.trimEnd().split('\n').length, 1); const result = JSON.parse(stdout);
    assert.equal(result.command, 'impact'); assert.equal(result.ok, code === 0); assert.equal(stderr, '');
    if (code) assert.ok(result.error.next[0].argv.length);
  }
  const logs = [];
  await impact(f.config, f.values({ source: ['surfaces/leaf'], json: false }), { log: text => logs.push(text) });
  assert.match(logs[0], /1 candidate frames/); assert.match(logs[1], /leaf/);
  let closed = 0;
  await assert.rejects(impact(f.config, f.values({ source: ['surfaces/leaf'] }), { openIndex: async (...args) => {
    const index = await openProjectIndex(...args), verify = index.verifyInputs, close = index.close;
    index.verifyInputs = async () => { await f.put('design/surfaces/leaf.tsx', 'changed'); await verify(); };
    index.close = async () => { closed++; await close(); }; return index;
  } }), { code: 'IMPACT_INPUT_CHANGED' });
  assert.equal(closed, 1);
});
