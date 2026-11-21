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
import { parseTokens } from '../src/toolkit/tokens.mjs';

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
    fade: { parameters: {spring: '--motion-spring-test'}, consumers: [
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
  assert.equal(edge.interrupt, 'finish');
  assert.equal(edge.reduced, 'instant');
  assert.equal(edge.phases[0][0].mode, 'enter');
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
