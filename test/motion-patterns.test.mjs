import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { motionPrimitives, springEasing } from '../src/toolkit/motion-primitives.mjs';
import { motionCards } from '../src/boards/motion-board.mjs';
import { loadMotionPatterns, patternParameters } from '../src/toolkit/motion-patterns.mjs';
import { motionCodeExcerpt, scanMotion } from '../src/toolkit/motion-inventory.mjs';
import { readMotion, resolveMotionToken } from '../src/toolkit/motion.mjs';
import { playbackEdge } from '../src/toolkit/play-endpoint.mjs';
import { parseTokens } from '../src/toolkit/tokens.mjs';
import { startServer } from '../src/server.mjs';
import { launch } from '../src/toolkit/browser.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const tokens = `:root {
  --font-ui: sans-serif;
  --font-mono: monospace;
  --canvas: #fff;
  --text: #222;
  --motion-spring-test-duration: 250ms;
  --motion-spring-test-bounce: .2;
}
:root[data-theme="dark"] {
  --motion-spring-test-bounce: 0;
}`;
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'adg-motion-pattern-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const design = path.join(root, 'design');
  mkdirSync(design);
  const write = (name, value) => writeFileSync(path.join(root, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  write('design/tokens.css', tokens);
  return { root, design, write };
}

test('contract: a consumer can check, map and play tokenized delays and declare deterministic ambient ranges', async t => {
  const { root, design, write } = fixture(t);
  write('adg.config.mjs', 'export default { check: { strictMotion: true } };');
  const css = tokens.replace('--motion-spring-test-duration: 250ms;', `--motion-spring-test-duration: 250ms;
  --wait: 200ms;
  --zero: 0ms;
  --change: 200ms;
  --period: 3s;
  --min: 2400ms;
  --max: 4100ms;
  --linear: linear;`).replace('--motion-spring-test-bounce: 0;', '--motion-spring-test-bounce: 0;\n  --max: 4s;');
  write('design/tokens.css', css);
  write('widget.css', '.status {transition-delay: var(--wait)}\n@keyframes spin {to {transform: rotate(1turn)}}');
  mkdirSync(path.join(design, 'modules'));
  write('design/modules/widget.tsx', `import { Frame } from 'adg';
export default () => ['pending', 'complete'].map(state => (
  <Frame name={state} width={240} height={100}>
    <div>
      <button data-adg-id="toggle">Complete task</button>
      <div class="status" data-adg-id="status" style={{width: state === 'pending' ? 40 : 140}}>
        {state === 'pending' ? 'Old' : 'New'}
      </div>
    </div>
  </Frame>
));`);
  const source = 'design/modules/widget.tsx', from = {source, frame: 'pending'}, to = {source, frame: 'complete'};
  write('design/modules/widget.motion.json', {version: 1,
    flows: [{start: from, anchor: {anchor: 'toggle'}, ends: [{frame: 'complete'}]}],
    edges: [{
      id: 'complete-task', label: 'Complete task', from, to, focus: 'frame',
      trigger: {on: 'click', target: {anchor: 'toggle'}},
      pattern: {id: 'status-change', targets: [{anchor: 'status'}]},
    }],
  });
  const resize = {
    kind: 'layout', action: 'resize', effect: 'size', properties: ['width'], interrupt: 'finish', reduced: 'instant',
    parameters: {duration: '--change', easing: '--linear', delay: '--wait'},
    consumers: [{ file: 'widget.css', match: 'css:.status' }],
  };
  const sweep = {
    kind: 'ambient', action: 'loop', effect: 'spin', properties: ['transform'], interrupt: 'cancel', reduced: 'static',
    parameters: {duration: '--period', easing: '--linear', delay: '--wait', minDuration: '--min', maxDuration: '--max'},
    consumers: [{file: 'widget.css', match: 'keyframes:spin'}],
  };
  const declare = (change = resize, loop = sweep) =>
    write('design/motion-patterns.json', {version: 1, patterns: {'status-change': change, sweep: loop}});
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args, '--json'], {cwd: root, encoding: 'utf8'});
    return {status: result.status, ...JSON.parse(result.stdout), ...(result.stderr && {stderr: result.stderr})};
  };
  declare({...resize, parameters: {...resize.parameters, delay: '--zero'}});
  const zero = run('check', '--read-only');
  assert.equal(zero.status, 0, JSON.stringify(zero));
  declare();
  const valid = run('check', '--read-only');
  assert.equal(valid.status, 0, JSON.stringify(valid));
  const coverage = run('motion', '--coverage');
  assert.equal(coverage.status, 0, JSON.stringify(coverage));
  assert.equal(coverage.data.summary.unmappedSites, 0);
  assert.deepEqual(run('motion').data.durationRanges.sweep.enter, {
    minDuration: '--min', maxDuration: '--max', light: {min: 2400, max: 4100}, dark: {min: 2400, max: 4000},
  });

  const reject = expected => {
    const result = run('check', '--read-only');
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.error.message, expected);
  };
  declare({...resize, parameters: {...resize.parameters, minDuration: '--min', maxDuration: '--max'}});
  reject(/only for ambient/);
  const {maxDuration, ...halfRange} = sweep.parameters;
  declare(resize, {...sweep, parameters: halfRange});
  reject(/needs minDuration and maxDuration/);
  declare();
  write('design/tokens.css', css.replace('--max: 4s;', '--max: 2s;'));
  reject(/minDuration greater than maxDuration in dark/);
  write('design/tokens.css', css.replace('--max: 4s;', '--max: 4s;\n  --wait: -1ms;'));
  reject(/valid delay token in both themes/);
  write('design/tokens.css', css);

  const server = await startServer({directory: design, stateDirectory: path.join(root, 'state'), port: 0, readOnly: true});
  t.after(() => server.close());
  const browser = await launch();
  try {
    const page = await browser.newPage({reducedMotion: 'no-preference', colorScheme: 'light'});
    await page.goto(new URL('?scope=tokens&section=motion&pattern=sweep', server.url).href);
    const detail = page.getByRole('dialog', {name: 'Sweep', exact: true});
    await detail.getByText(/Minimum duration.*2400ms.*Maximum duration.*4100ms/s).first().waitFor();
    const shape = detail.locator('[data-motion-shape]');
    await page.waitForFunction(node => node.getAnimations().length > 0, await shape.elementHandle());
    assert.deepEqual(await shape.evaluate(node => {
      const {delay, duration} = node.getAnimations()[0].effect.getTiming();
      return {delay, duration};
    }), {delay: 200, duration: 3000});

    await page.goto(new URL('?asset=modules%2Fwidget.tsx&frame=pending', server.url).href);
    await page.getByRole('button', {name: 'Play from pending', exact: true}).click();
    const player = page.getByRole('dialog', {name: 'Play transitions'});
    const toggle = player.frameLocator('iframe').getByRole('button', {name: 'Complete task'});
    await toggle.waitFor();
    const time = new Date('2025-01-01T00:00:00Z');
    await page.clock.install({time});
    await page.clock.pauseAt(new Date(+time + 1000));
    await toggle.evaluate(node => node.click());
    await player.getByRole('button', {name: 'Transition inspector'}).evaluate(node => node.click());
    await player.getByText('Delay --wait · 200 ms', {exact: false}).waitFor();
    assert.equal(await player.locator('[data-control=end]').textContent(), '400 ms');
    const seek = player.getByRole('slider');
    const samples = [];
    for (const percent of [25, 75, 25]) {
      await seek.evaluate((node, value) => {
        node.value = value;
        node.dispatchEvent(new Event('input', {bubbles: true}));
      }, String(percent));
      await page.locator('[data-control=seek][aria-valuetext="' + percent * 4 + ' ms"]:enabled').waitFor();
      samples.push(await toggle.evaluate(node => {
        const layer = node.ownerDocument.body.lastElementChild.shadowRoot;
        const paint = [...layer.children].find(host => host.style.opacity === '1' &&
          host.shadowRoot?.firstElementChild?.matches('.status'));
        return [paint.getBoundingClientRect().width, paint.shadowRoot.textContent];
      }));
    }
    assert.deepEqual(samples, [[40, 'Old'], [90, 'New'], [40, 'Old']]);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await player.getByText('Applied instantly · 0 ms', {exact: true}).waitFor();
    assert.equal(await seek.count(), 0);
    await player.frameLocator('iframe').getByText('New', {exact: true}).waitFor();
  } finally {
    await browser.close();
  }
});

test('algorithmic core: spring curve settles and approximates first overshoot in each theme', () => {
  const { springs } = motionPrimitives(parseTokens(tokens));
  const coefficients = easing => easing.slice(7, -1).split(',').map(Number);
  const light = springs.light['--motion-spring-test'], dark = springs.dark['--motion-spring-test'];
  assert.equal(light.duration, 250);
  assert.equal(light.bounce, .2);
  assert.equal(dark.bounce, 0);
  const overshoot = coefficients(light.easing);
  assert.equal(overshoot.at(0), 0);
  assert.equal(overshoot.at(-1), 1);
  assert.ok(Math.abs(Math.max(...overshoot) - 1.2) < .01);
  const settled = coefficients(springEasing(0));
  assert.ok(settled.every((value, index) => !index || value >= settled[index - 1]));
});

test('contract: mapped CSS, Motion aliases, a pattern-backed edge, and source excerpts share the same inventory', t => {
  const { root, design, write } = fixture(t), config = { root, design };
  write('widget.tsx', `import { motion as M, AnimatePresence as Presence, animate as tween } from 'motion/react';
function Widget() {
  tween({}, {}, { type: 'spring' });
  return <Presence><M.div layout="position" animate={{ opacity: 1 }}/></Presence>;
}`);
  write('widget.css', '@keyframes appear { from {opacity: 0} }\n.widget { animation-name: appear; transition-duration: 120ms; }');
  write('design/widget.motion.json', { version: 1, edges: [{
    id: 'show-widget', from: {source: 'design/widget.tsx', frame: 'closed'}, to: {source: 'design/widget.tsx', frame: 'open'},
    trigger: {on: 'click', target: {anchor: 'toggle'}}, focus: 'frame',
    pattern: {id: 'fade', targets: [{anchor: 'widget'}]},
  }] });
  write('design/motion-patterns.json', {version: 1, patterns: {
    fade: { interrupt: 'retarget', reduced: 'static', parameters: {
      spring: '--motion-spring-test', distance: '--motion-distance-small', scale: '--motion-scale-small',
      stagger: '--motion-stagger-small',
    }, consumers: [
      {file: 'widget.css', match: 'css:.widget'}, {file: 'widget.css', match: 'keyframes:appear'},
      {file: 'widget.tsx', match: 'motion:layout', within: 'Widget'},
      {file: 'widget.tsx', match: 'motion:AnimatePresence'},
      {file: 'widget.tsx', match: 'motion:animate'},
      {file: 'widget.tsx', match: 'motion:spring'},
    ] },
  }});
  const catalog = loadMotionPatterns(config), graph = readMotion(config);
  assert.deepEqual(graph.findings, []);
  const {edge} = graph.records[0];
  assert.equal(edge.interrupt, 'retarget');
  assert.equal(edge.reduced, 'static');
  assert.equal(edge.phases[0][0].mode, 'enter');
  assert.deepEqual(edge.phases[0][0].properties, ['opacity', 'translate', 'scale']);
  assert.equal(edge.phases[0][0].transform.axis, 'y');
  assert.match(edge.playbackOmissions.join(' '), /Stagger/);
  const scene = playbackEdge(edge, { html: '' }, parseTokens(tokens), 'dark', 'design');
  assert.deepEqual(scene.transforms, {
    '/phases/0/0/transform/distance': '20px',
    '/phases/0/0/transform/scale': 0.85,
  });
  assert.equal(resolveMotionToken(parseTokens(tokens), 'dark', edge.duration, 'duration').value, 250);
  assert.equal(resolveMotionToken(parseTokens(tokens), 'dark', edge.easing, 'easing').value, springEasing(0));
  const inventory = scanMotion(config, catalog, graph);
  assert.deepEqual(inventory.issues, []);
  assert.equal(inventory.animations, 7);
  assert.equal(inventory.consumers.get('fade').length, 8);
  const edgeConsumer = inventory.consumers.get('fade').find(ref => ref.type === 'edge');
  assert.ok(motionCodeExcerpt(config, catalog, edgeConsumer.sidecar, edgeConsumer.line).some(([, text]) => text.includes('"pattern"')));
  assert.equal(motionCodeExcerpt(config, catalog, 'widget.tsx', 1), null);
});

test('contract: inventory severity and detail preserve counts when default output is capped', t => {
  const { root, write } = fixture(t);
  write('demo.css', Array.from({length: 22}, (_, i) => '.item-' + i + ' {transition: opacity .2s}').join('\n'));
  write('design/motion-patterns.json', {version: 1, patterns: {fade: {}}});
  function check(...args) {
    const result = spawnSync(process.execPath, [cli, 'check', '--motion-only', '--json', ...args], {cwd:root, encoding:'utf8'});
    return [result.status, JSON.parse(result.stdout)];
  }
  const [warningCode, warning] = check();
  assert.equal(warningCode, 0);
  assert.equal(warning.warnings.length, 16);
  assert.equal(warning.data.motionPatterns.unused, 1);
  assert.equal(warning.data.motionPatterns.omitted, 7);
  write('adg.config.mjs', 'export default {check:{strictMotion:true}}');
  const [errorCode, strict] = check('--motion-details');
  assert.equal(errorCode, 1);
  assert.equal(strict.data.motionPatterns.unmapped, 22);
  assert.equal(strict.data.motionPatterns.omitted, 0);
  assert.equal(strict.data.findings.filter(row => row.code === 'MOTION_UNMAPPED').length, 22);
  assert.ok(strict.data.findings.some(row => row.code === 'MOTION_UNUSED'));
});


test('contract: project roles feed base and variant playback and mark only ADG fallback values', t => {
  const { root, design, write } = fixture(t), config = { root, design };
  const roles = {
    'duration-base': '--project-base', 'easing-enter': '--project-enter',
    'duration-loop': '--project-loop', 'easing-loop': '--project-loop-curve',
    'spring-small': '--motion-spring-test', 'distance-small': '--project-distance', 'scale-small': '--project-scale',
  };
  write('design/tokens.css', tokens.replace('  --text: #222;', `  --text: #222;
  --project-base: 160ms;
  --project-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --project-loop: 2s;
  --project-loop-curve: ease-in-out;
  --project-distance: 5px;
  --project-scale: .92;
  --project-short: 100ms;`).replace('--motion-spring-test-bounce: 0;', '--motion-spring-test-bounce: 0;\n  --project-base: 180ms;'));
  write('widget.css', '@keyframes appear { from {opacity: 0} }');
  // Base overrides resolve first even when the variant is declared earlier in the file.
  write('design/motion-patterns.json', { version: 1, roles, patterns: {
    appear: { extends: 'fade', parameters: {fromOpacity: .3}, exit: {duration: '--project-short'},
      consumers: [{file: 'widget.css', match: 'keyframes:appear'}] },
    fade: { parameters: {duration: '--project-base'} },
    'my-loop': { kind: 'ambient', action: 'loop', effect: 'pulse', properties: ['opacity'],
      parameters: {duration: '--project-loop', easing: '--project-loop-curve'}, interrupt: 'cancel', reduced: 'static',
      consumers: [{file: 'widget.css', match: 'keyframes:appear'}] },
  } });
  write('design/widget.motion.json', {version: 1, edges: [{
    id: 'appear-edge', pattern: {id: 'appear', targets: [{anchor: 'widget'}]},
    from: {source: 'design/widget.tsx', frame: 'closed'}, to: {source: 'design/widget.tsx', frame: 'open'},
    trigger: {on: 'click', target: {anchor: 'toggle'}}, focus: 'frame',
  }]});
  const catalog = loadMotionPatterns(config), graph = readMotion(config);
  assert.deepEqual(graph.findings, []);
  const { edge } = graph.records[0];
  assert.equal(edge.duration, '--project-base');
  assert.equal(edge.easing, '--project-enter');
  assert.equal(edge.phases[0][0].fromOpacity, .3);
  assert.equal(patternParameters(catalog.patterns.get('appear'), 'exit').duration, '--project-short');
  assert.equal(patternParameters(catalog.patterns.get('appear'), 'exit').easing, '--adg-motion-exit');
  assert.deepEqual(catalog.patterns.get('spring-pop').parameters, {spring: '--motion-spring-test', scale: '--project-scale'});
  assert.equal(catalog.patterns.get('slide').parameters.distance, '--project-distance');
  assert.equal(catalog.patterns.get('ambient-loop').parameters.duration, '--project-loop');
  const inventory = scanMotion(config, catalog, graph);
  assert.deepEqual(inventory.issues, []);
  const board = motionCards(catalog, inventory, 'design/motion-patterns.json', 'design');
  assert.match(board.adopted, /data-motion-pattern="fade"/);
  assert.match(board.adopted, /--project-base<\/code> · 160ms \/ dark 180ms/);
  assert.match(board.adopted, /--adg-motion-exit<\/code>[^<]*<span data-motion-default>ADG default<\/span>/);
  assert.match(board.adopted, /data-motion-variant="appear".*--project-short/s);
  assert.match(board.adopted, /data-motion-pattern="my-loop"/);
  assert.doesNotMatch(board.adopted, /data-motion-pattern="appear"|data-motion-pattern="slide"/);
  assert.match(board.notAdopted, /^<details data-motion-unadopted>.*data-motion-pattern="slide"/s);
  assert.doesNotMatch(board.notAdopted, /data-motion-pattern="fade"/);
});

test('contract: roles require an authored token of the right type and variants preserve base behavior', t => {
  const { root, design, write } = fixture(t), config = { root, design };
  const rejects = (manifest, message) => {
    write('design/motion-patterns.json', {version: 1, ...manifest});
    assert.throws(() => loadMotionPatterns(config), message);
  };
  rejects({roles: {'duration-base': '--adg-motion-base'}}, /needs an authored duration token/);
  rejects({roles: {'easing-enter': '--text'}}, /needs an authored easing token/);
  rejects({roles: {'unknown-role': '--text'}}, /Invalid motion role/);
  rejects({patterns: {custom: {extends: 'fade', interrupt: 'retarget'}}}, /only parameter overrides/);
  rejects({patterns: {custom: {extends: 'unknown'}}}, /must extend a built-in/);
});

test('contract: coverage groups exact locations, audits used defaults and flow declarations, and exits 1, 0 or 2', t => {
  const { root, write } = fixture(t);
  write('adg.config.mjs', 'export default {}');
  write('widget.css', '.widget {transition: opacity 100ms}\n.widget {transition: opacity 200ms}');
  write('design/specimen.css', '.specimen {transition: opacity 100ms}');
  const closed = {source: 'design/widget.tsx', frame: 'closed'};
  const open = {...closed, frame: 'open'};
  const edge = {
    id: 'show-widget', from: closed, to: open,
    trigger: {on: 'click', target: {anchor: 'toggle'}}, focus: 'frame',
    pattern: {id: 'fade', targets: [{anchor: 'widget'}]},
  };
  const manifest = 'design/widget.motion.json';
  write(manifest, {version: 1, edges: [edge]});
  function coverage(...args) {
    const result = spawnSync(process.execPath, [cli, 'motion', '--coverage', ...args], {cwd: root, encoding: 'utf8'});
    if (!args.includes('--json')) return result;
    assert.equal(result.stderr, '');
    return { status: result.status, ...JSON.parse(result.stdout) };
  }
  const first = coverage('--json');
  assert.equal(first.status, 1);
  assert.equal(first.error.code, 'MOTION_COVERAGE_FAILED');
  assert.deepEqual(first.data.summary, {unmappedSites: 2, fallbackRoles: 2, unlabeledEdges: 1, incompleteFlows: 1, unscannedFiles: 0, ignoredSites: 0, staleIgnores: 0});
  assert.deepEqual(first.data.unmapped, [{source: 'widget.css', groups: [{match: 'css:.widget', lines: [1, 2]}]}]);
  assert.deepEqual(first.data.fallbackRoles.map(row => row.role), ['duration-base', 'easing-enter']);
  assert.equal(first.data.unlabeledEdges[0].id, edge.id);
  assert.deepEqual(first.data.incompleteFlows, [{start: closed, missing: ['anchor', 'ends']}]);
  const human = coverage();
  assert.equal(human.status, 1);
  assert.match(human.stdout, /^widget\.css:1,2 css:\.widget$/m);

  write('design/tokens.css', tokens.replace('--text: #222;', '--text: #222;\n  --project-time: 100ms;\n  --project-ease: ease;'));
  write('design/motion-patterns.json', {version: 1, roles: {
    'duration-base': '--project-time', 'duration-fast': '--project-time',
    'easing-enter': '--project-ease', 'easing-exit': '--project-ease',
  }, patterns: {fade: {consumers: [{file: 'widget.css', match: 'css:.widget'}]}}});
  const labeled = {...edge, label: 'Open widget'};
  const flow = {start: closed, ends: [{frame: 'open'}]};
  write(manifest, {version: 1, edges: [labeled], flows: [flow]});
  const partial = coverage('--json');
  assert.equal(partial.status, 1, partial.error?.message);
  assert.deepEqual(partial.data.incompleteFlows, [{start: closed, missing: ['anchor']}]);
  write(manifest, {version: 1, edges: [labeled], flows: [{...flow, anchor: {anchor: 'widget'}}]});
  const clean = coverage('--json');
  assert.equal(clean.status, 0);
  assert.equal(clean.ok, true);
  assert.deepEqual(clean.data.summary, {unmappedSites: 0, fallbackRoles: 0, unlabeledEdges: 0, incompleteFlows: 0, unscannedFiles: 0, ignoredSites: 0, staleIgnores: 0});
  assert.equal(coverage('--css', '--json').status, 2);

  write('design/motion-patterns.json', {version: 2});
  const invalid = coverage('--json');
  assert.equal(invalid.status, 2);
  assert.equal(invalid.error.code, 'CONFIG_INVALID');
});

test('contract: coverage and Tokens consumers share Vue, Sass, HTML, and JavaScript motion locations', t => {
  const { root, design, write } = fixture(t);
  write('adg.config.mjs', 'export default {}');
  write('Widget.vue', `<template>
  <Transition name="fade"><div /></Transition>
  <transition-group><div /></transition-group>
</template>
<script setup lang="ts">
const reveal = (element: HTMLElement) => element?.animate([{ opacity: 0 }, { opacity: 1 }], 150)
</script>
<style scoped>
.widget { transition: opacity 150ms; }
</style>
<style lang="scss">
$time: 150ms; // Sass comment
.frame { animation: fade $time; }
</style>`);
  write('layout.scss', `$time: 120ms;
@mixin reveal {
  .card-#{&} { transition: opacity $time; }
}
@keyframes fade { to { opacity: 1; } }`);
  write('index.html', `<!doctype html>
<head>
  <style>
  #splash { transition: opacity 120ms; }
  @keyframes sweep { to { opacity: 1; } }
  </style>
</head>`);
  write('embedded.ts', 'const page = `<style>${tokens}\n${styles}</style>`;');
  write('clock.ts', `function clock() {
  const tick = useCallback(() => {
    if (running) window.requestAnimationFrame(tick);
  }, []);
  requestAnimationFrame(tick);
}
function hostSize() {
  const report = () => { sendSize(); };
  function enqueue() { requestAnimationFrame(report); }
}
requestAnimationFrame(() => requestAnimationFrame(done));
function measure() {
  const sample = () => { requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
}`);
  write('design/motion-patterns.json', {version: 1, ignore: [{
    file:'clock.ts', match:'web:requestAnimationFrame', within:'measure', reason:'Samples layout in a test harness.',
  }], patterns: {fade: {consumers: [
    {file:'Widget.vue', match:'vue:Transition:fade'},
    {file:'Widget.vue', match:'web:animate', within:'reveal'},
    {file:'index.html', match:'keyframes:sweep'},
  ]}}});
  const config = {root, design};
  const catalog = loadMotionPatterns(config);
  const inventory = scanMotion(config, catalog, {records: []}, {mappedOnly: true});
  const refs = inventory.consumers.get('fade');
  assert.deepEqual(refs.map(({source, line}) => [source, line]), [['Widget.vue', 2], ['Widget.vue', 6], ['index.html', 5]]);
  assert.match(motionCards(catalog, inventory, 'design/motion-patterns.json', 'design').adopted, /Widget\.vue:6/);
  assert.match(motionCodeExcerpt(config, catalog, 'index.html', 5).find(([line]) => line === 5)[1], /keyframes sweep/);

  write('unreadable.scss', '.broken { animation: appear');
  assert.equal(spawnSync('git', ['init', '-q'], {cwd:root}).status, 0);
  write('missing.css', '.missing {animation: appear;}');
  assert.equal(spawnSync('git', ['add', 'missing.css'], {cwd:root}).status, 0);
  rmSync(path.join(root, 'missing.css'));
  const result = spawnSync(process.execPath, [cli, 'motion', '--coverage', '--json'], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 2);
  const { data } = JSON.parse(result.stdout);
  const sites = Object.fromEntries(data.unmapped.map(({source, groups}) => [source, groups.map(({match, lines}) => [match, lines])]));
  assert.deepEqual(sites['Widget.vue'], [['vue:TransitionGroup', [3]], ['css:.widget', [9]], ['css:.frame', [13]]]);
  assert.deepEqual(sites['layout.scss'], [['css:.card-#{&}', [3]], ['keyframes:fade', [5]]]);
  assert.deepEqual(sites['index.html'], [['css:#splash', [4]]]);
  assert.deepEqual(sites['clock.ts'], [['web:requestAnimationFrame', [3]], ['web:requestAnimationFrame', [5]]]);
  assert.equal(data.summary.unscannedFiles, 2);
  assert.deepEqual(data.unscanned.map(row => row.source), ['missing.css', 'unreadable.scss']);
  assert.equal(data.summary.ignoredSites, 2);
  assert.ok(data.ignored.every(row => row.reason === 'Samples layout in a test harness.'));
});

test('contract: authored Tailwind literals share locators, parameters and exclusions across coverage and Tokens', t => {
  const { root, design, write } = fixture(t);
  write('adg.config.mjs', 'export default {}');
  write('widget.tsx', [
    "import cx from 'clsx';",
    "const button = cva('transition-colors duration-150', {",
    "  variants: { state: { open: 'data-[state=open]:animate-in data-[state=open]:fade-in-0 zoom-in-95' } },",
    "  compoundVariants: [{ state: 'closed', class: 'animate-out slide-out-to-top-2' }],",
    "  defaultVariants: { state: 'closed' },",
    "});",
    "function Widget() { return <><div className={cn('hover:transition-[color,box-shadow] delay-75 motion-reduce:transition-none ease-in', className)}/>",
    "  <div className={cx({ 'animate-spin': busy })}/>",
    "  <div class={`[&:hover]:transition-transform${busy ? ' animate-pulse' : ' fade-out-0'} duration-300`}/>",
    "  <div className={`animate-${kind} transition-opacity`}/>",
    "  <div className='[&_.animate-spin]:text-red-500 duration-200' title='Loading'/>",
    "  <div className='ease-out transition-opacity'/></>; }",
  ].join('\n'));
  write('opaque.tsx', 'export const Row = () => <div className={`timeline-fold ${className} ${small ? "btn-sm" : ""}`}/>;');
  write('variants.ts', "export const variants = { open: 'animate-in fade-in', closed: 'hidden' };");
  write('index.html', '<div class="animate-[sweep_1s_linear] duration-300"></div>');
  write('Widget.vue', "<template><div :class=\"[transitionStyle, active && 'animate-spin']\"/></template>\n" +
    "<script setup>const transitionStyle = 'transition-transform delay-75';</script>");
  const config = {root, design};
  const transition = 'tailwind:hover:transition-[color,box-shadow]';
  write('design/motion-patterns.json', {version: 1, ignore: [
    {file:'widget.tsx', match:'tailwind:animate-spin', within:'Widget', reason:'Synthetic spinner in a fixture.'},
  ], patterns: {fade: {consumers: [
    {file:'widget.tsx', match:transition, within:'Widget'},
    {file:'widget.tsx', match:'tailwind:transition-colors', within:'button'},
  ]}}});
  const catalog = loadMotionPatterns(config), inventory = scanMotion(config, catalog, {records: []}, {mappedOnly: true});
  assert.deepEqual(inventory.consumers.get('fade').map(({match, line, parameters}) => [match, line, parameters]), [
    ['tailwind:transition-colors', 2, ['duration-150']],
    [transition, 7, ['delay-75', 'ease-in', 'motion-reduce:transition-none']],
  ]);
  assert.match(motionCards(catalog, inventory, 'design/motion-patterns.json', 'design').adopted, /widget\.tsx:7/);
  assert.match(motionCodeExcerpt(config, catalog, 'widget.tsx', 7).find(([line]) => line === 7)[1], /transition-\[/);

  const result = spawnSync(process.execPath, [cli, 'motion', '--coverage', '--json'], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 1);
  const { data } = JSON.parse(result.stdout);
  assert.ok(!Object.hasOwn(data, 'dynamicClasses') && !Object.hasOwn(data.summary, 'dynamicClasses'));
  assert.equal(data.summary.unscannedFiles, 0);
  assert.equal(data.summary.ignoredSites, 1);
  const byFile = Object.fromEntries(data.unmapped.map(({source, groups}) => [source, groups]));
  assert.deepEqual(byFile['widget.tsx'].map(({match, lines}) => [match, lines]), [
    ['tailwind:data-[state=open]:animate-in data-[state=open]:fade-in-0 zoom-in-95', [3]],
    ['tailwind:animate-out slide-out-to-top-2', [4]],
    ['tailwind:[&:hover]:transition-transform', [9]],
    ['tailwind:animate-pulse', [9]],
    ['tailwind:fade-out-0', [9]],
    ['tailwind:transition-opacity', [10, 12]],
  ]);
  assert.deepEqual(byFile['widget.tsx'].at(-1).parameters, ['ease-out']);
  assert.deepEqual(byFile['widget.tsx'][2].parameters, ['duration-300']);
  assert.ok(byFile['widget.tsx'].every(group => group.lines.every(line => line < 7) || group.within === 'Widget'));
  assert.deepEqual(byFile['variants.ts'], [{match:'tailwind:animate-in fade-in', within:'variants', lines:[1]}]);
  assert.equal(byFile['opaque.tsx'], undefined);
  assert.deepEqual(byFile['Widget.vue'], [
    {match:'tailwind:transition-transform', within:'transitionStyle', lines:[2], parameters:['delay-75']},
    {match:'tailwind:animate-spin', lines:[1]},
  ]);
  assert.deepEqual(byFile['index.html'], [{match:'tailwind:animate-[sweep_1s_linear]', lines:[1], parameters:['duration-300']}]);
});

test('contract: class context disambiguates lone utilities and coverage exposes only proven stale ignores', t => {
  const { root, write } = fixture(t);
  write('adg.config.mjs', 'export default { check: { strictMotion: true } };');
  write('tooling.ts', [
    "function cssIssues(property) { return property === 'transition' || property === 'transition-duration'; }",
    "const result = report('Local transition persistence unavailable');",
    "const option = syntaxTree['transition'];",
    "const menu = { kind: 'zoom-in', alternate: 'zoom-out' };",
    "type Command = 'zoom-in' | 'zoom-out';",
  ].join('\n'));
  write('classes.tsx', [
    "import { twMerge as merge } from 'tailwind-merge';",
    "import { tv } from 'tailwind-variants';",
    "const combine = merge;",
    "const singleton = 'transition';",
    "const classes = { busy: 'animate-spin', rest: 'block' };",
    "const variant = tv({base: 'transition-colors', variants: {enter: {yes: 'zoom-in'}}});",
    "function Trigger({className}) { return <button className={combine([singleton, classes[state], className])}/>; }",
    "function Shadow({singleton}) { const isolated = 'animate-bounce'; return <div className={singleton}/>; }",
  ].join('\n'));
  write('unscanned.scss', '.broken { animation: appear');
  const stale = [
    {file:'tooling.ts', match:'tailwind:transition', within:'cssIssues', reason:'CSS property lookup.'},
    {file:'tooling.ts', match:'tailwind:zoom-in', reason:'Command identifier.'},
  ];
  const mapped = {file:'classes.tsx', match:'tailwind:transition', within:'singleton'};
  write('design/motion-patterns.json', {version:1, ignore:[
    ...stale, {...mapped, reason:'Former exclusion.'},
    {file:'unscanned.scss', match:'css:.broken', reason:'Cannot evaluate this locator while parsing fails.'},
  ], patterns:{fade:{consumers:[mapped]}}});
  const result = spawnSync(process.execPath, [cli, 'motion', '--coverage', '--json'], {cwd:root, encoding:'utf8'});
  assert.equal(result.status, 2);
  const {data} = JSON.parse(result.stdout);
  assert.deepEqual(data.staleIgnores, stale);
  assert.equal(data.summary.staleIgnores, 2);
  assert.equal(data.summary.unscannedFiles, 1);
  assert.deepEqual(data.unmapped.map(({source, groups}) => [source, groups.map(({match, lines}) => [match, lines])]), [
    ['classes.tsx', [['tailwind:animate-spin',[5]], ['tailwind:transition-colors',[6]], ['tailwind:zoom-in',[6]]]],
  ]);
});
