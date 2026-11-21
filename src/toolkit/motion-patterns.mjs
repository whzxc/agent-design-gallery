import path from 'node:path';
import { readFileSync } from 'node:fs';
import { CliError } from '../cli-output.mjs';
import { parseTokens } from './tokens.mjs';
import { milliseconds, motionPrimitives, tokenValue, validMotionEasing } from './motion-primitives.mjs';

const timing = { duration: '--adg-motion-base', easing: '--adg-motion-enter' };
const exit = { duration: '--adg-motion-fast', easing: '--adg-motion-exit' };
const distance = '--motion-distance-small';
const make = (kind, action, effect, properties, parameters = timing, extra = {}) => ({
  kind, action, effect, properties, parameters, interrupt: 'finish',
  reduced: kind === 'ambient' || kind === 'continuous' ? 'static' : 'instant', ...extra,
});
export const basePatterns = {
  fade: make('transition', 'enter', 'fade', ['opacity'], timing, { exit }),
  'expand-collapse': make('layout', 'resize', 'expand', ['height', 'opacity'], timing, { exit }),
  'size-transition': make('layout', 'resize', 'size', ['width', 'height']),
  slide: make('transition', 'enter', 'slide', ['x', 'opacity'], { ...timing, distance }, { exit }),
  'spring-pop': make('transition', 'enter', 'pop', ['scale', 'opacity'], { spring: '--motion-spring-small', scale: '--motion-scale-small' }),
  'crossfade-replace': make('transition', 'replace', 'crossfade', ['opacity']),
  follow: make('continuous', 'follow', 'follow', ['x', 'y'], timing, { interrupt: 'retarget' }),
  'avoid-reflow': make('layout', 'avoid', 'avoid', ['x', 'y'], timing, { interrupt: 'retarget' }),
  stagger: make('transition', 'enter', 'stagger', ['opacity', 'y'], { ...timing, distance, stagger: '--motion-stagger-small' }),
  'ambient-loop': make('ambient', 'loop', 'pulse', ['opacity', 'scale'], {
    duration: '--adg-motion-loop', easing: '--adg-motion-linear', scale: '--motion-scale-small',
  }, { interrupt: 'cancel' }),
};
const effects = new Set([...Object.values(basePatterns).map(pattern => pattern.effect), 'aurora', 'shimmer', 'spin']);
const actions = { transition: ['enter', 'exit', 'replace'], layout: ['resize', 'reflow', 'avoid'], continuous: ['follow'], ambient: ['loop'] };
const parameterKeys = new Set(['duration', 'easing', 'spring', 'distance', 'scale', 'stagger', 'fromOpacity']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const tokenPattern = /^--[\w-]+$/;
const portable = value => typeof value === 'string' && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part));
export const motionPatternFile = 'motion-patterns.json';

function projectFile(config, name, fallback) {
  try { return readFileSync(path.join(config.design, name), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export function loadMotionPatterns(config, authored) {
  const invalid = message => { throw new CliError('CONFIG_INVALID', motionPatternFile + ': ' + message); };
  let document;
  try { document = JSON.parse(projectFile(config, motionPatternFile, '{"version":1,"patterns":{}}')); }
  catch (error) { invalid(error.message); }
  if (!object(document) || document.version !== 1 || !object(document.patterns) ||
      Object.keys(document).some(key => !['version', 'patterns'].includes(key))) invalid('Expected version 1 and a patterns object.');
  const patterns = new Map(Object.entries(basePatterns));
  for (const [id, entry] of Object.entries(document.patterns)) {
    if (!idPattern.test(id) || !object(entry)) invalid('Invalid pattern ' + id + '.');
    if (Object.keys(entry).some(key => !['kind','action','effect','properties','parameters','enter','exit','interrupt','reduced','consumers','frames'].includes(key)))
      invalid(id + ' has unknown fields.');
    const base = patterns.get(id);
    const pattern = { ...base, ...entry };
    if (entry.parameters !== undefined && !object(entry.parameters)) invalid(id + ' needs a parameters object.');
    pattern.parameters = { ...base?.parameters, ...entry.parameters };
    if (entry.parameters?.spring !== undefined) {
      if (entry.parameters.duration === undefined) delete pattern.parameters.duration;
      if (entry.parameters.easing === undefined) delete pattern.parameters.easing;
    } else if (entry.parameters?.duration !== undefined || entry.parameters?.easing !== undefined) delete pattern.parameters.spring;
    if (!Object.hasOwn(actions, pattern.kind) || !actions[pattern.kind].includes(pattern.action) || !effects.has(pattern.effect) ||
        !['finish','retarget','cancel'].includes(pattern.interrupt) || !['instant','static'].includes(pattern.reduced) ||
        !Array.isArray(pattern.properties) || !pattern.properties.length ||
        pattern.properties.some(prop => typeof prop !== 'string' || !/^(?:--)?[a-zA-Z][\w-]*$/.test(prop)) ||
        new Set(pattern.properties).size !== pattern.properties.length) invalid(id + ' needs a supported kind, action, effect, properties, interrupt and reduced policy.');
    if (pattern.consumers !== undefined && (!Array.isArray(pattern.consumers) || pattern.consumers.some(ref =>
      !object(ref) || Object.keys(ref).some(key => !['file','match','within'].includes(key)) || !portable(ref.file) ||
      typeof ref.match !== 'string' || !/^(?:css|keyframes|motion|style|attribute|web|call):.+$/.test(ref.match) ||
      (ref.within !== undefined && (typeof ref.within !== 'string' || !ref.within.trim()))))) invalid(id + ' has an invalid code consumer.');
    if (pattern.frames !== undefined && (!Array.isArray(pattern.frames) || pattern.frames.some(ref =>
      !object(ref) || Object.keys(ref).some(key => !['source','frame'].includes(key)) || !portable(ref.source) ||
      !ref.source.endsWith('.tsx') || typeof ref.frame !== 'string' || !ref.frame.trim()))) invalid(id + ' has an invalid frame consumer.');
    patterns.set(id, pattern);
  }
  const css = authored ? null : projectFile(config, 'tokens.css', null);
  const primitives = motionPrimitives(authored ?? (css ? parseTokens(css) : {light: new Map(), dark: new Map()}));
  for (const [id, pattern] of patterns) {
    for (const override of [pattern.parameters, pattern.enter, pattern.exit]) {
      if (override === undefined) continue;
      if (!object(override) || Object.keys(override).some(key => !parameterKeys.has(key))) invalid(id + ' has unknown parameters.');
      if (override.spring && (override.duration || override.easing)) invalid(id + ' cannot combine spring with duration or easing in the same parameter set.');
      for (const [key, value] of Object.entries(override)) {
        if (key === 'fromOpacity' ? !(Number.isFinite(value) && value >= 0 && value <= 1) : !(typeof value === 'string' && tokenPattern.test(value)))
          invalid(id + ' has an invalid ' + key + ' parameter.');
        for (const theme of ['light', 'dark']) {
          if (key === 'fromOpacity') continue;
          const resolved = tokenValue(primitives.tokens, theme, value);
          const valid = key === 'spring' ? Object.hasOwn(primitives.springs[theme], value)
            : key === 'duration' || key === 'stagger' ? Number.isFinite(milliseconds(resolved))
            : key === 'distance' ? /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/.test(resolved ?? '')
            : key === 'scale' ? /^\+?(?:\d+(?:\.\d+)?|\.\d+)$/.test(resolved ?? '') && Number(resolved) >= 0
            : validMotionEasing(resolved);
          if (!valid) invalid(id + ' needs a valid ' + key + ' token ' + value + ' in ' + theme + '.');
        }
      }
    }
    for (const direction of ['enter', 'exit']) {
      const resolved = patternParameters(pattern, direction);
      if (!resolved.spring && !(resolved.duration && resolved.easing)) invalid(id + ' requires duration and easing or a spring.');
    }
  }
  return { ...primitives, patterns, declared: Object.keys(document.patterns) };
}

export function patternParameters(pattern, direction) {
  const override = pattern[direction] ?? {};
  const result = { ...pattern.parameters, ...override };
  if (override.spring) {
    delete result.duration;
    delete result.easing;
  } else if (override.duration || override.easing) delete result.spring;
  return result;
}

// Compile into the existing discrete player contract. Continuous and ambient
// behavior has no finite pair of endpoints, so those patterns stay board/code only.
export function patternEdge(edge, catalog, issue) {
  const { pattern: ref, ...fields } = edge;
  const selected = object(ref) && typeof ref.id === 'string' ? catalog.patterns.get(ref.id) : null;
  if (!selected || Object.keys(ref).some(key => !['id','direction','targets'].includes(key)) ||
      (ref.direction !== undefined && !['enter','exit','replace'].includes(ref.direction))) {
    issue('MOTION_PATTERN_INVALID', '/pattern', 'Choose a declared pattern, optional enter/exit/replace direction and explicit targets.');
    return edge;
  }
  if (['phases','duration','easing','interrupt','reduced'].some(key => Object.hasOwn(fields, key))) {
    issue('MOTION_PATTERN_INVALID', '/pattern', 'A pattern supplies phases, timing, interrupt and reduced motion.');
    return edge;
  }
  const direction = ref.direction ?? selected.action;
  let mode, properties;
  if (selected.kind === 'layout' || selected.effect === 'slide' || selected.effect === 'pop') {
    if (!['layout','transition'].includes(selected.kind) || selected.action === 'avoid') {
      issue('MOTION_PATTERN_INVALID', '/pattern', 'Layout avoidance needs live siblings, outside the discrete edge contract.');
      return edge;
    }
    mode = 'match';
    properties = selected.properties.filter(prop => ['x','y','width','height','opacity'].includes(prop));
    if (selected.effect === 'pop' && selected.properties.includes('scale')) properties = [...new Set([...properties,'width','height'])];
  } else if (selected.kind === 'transition' && ['fade','crossfade'].includes(selected.effect)) {
    mode = direction === 'replace' ? 'crossfade' : direction;
    properties = ['opacity'];
  } else {
    issue('MOTION_PATTERN_INVALID', '/pattern', 'This pattern needs continuous, ambient or stagger behavior beyond a discrete edge.');
    return edge;
  }
  if (selected.interrupt !== 'finish' || selected.reduced !== 'instant') {
    issue('MOTION_PATTERN_INVALID', '/pattern', 'A discrete edge requires finish interruption and instant reduced motion.');
    return edge;
  }
  const parameters = patternParameters(selected, direction);
  const duration = parameters.spring ? parameters.spring + '-duration' : parameters.duration;
  const easing = parameters.spring ?? parameters.easing;
  return { ...fields, duration, easing, interrupt: 'finish', reduced: 'instant', phases: [[{
    mode, properties, targets: ref.targets,
    ...(mode === 'enter' && parameters.fromOpacity !== undefined ? { fromOpacity: parameters.fromOpacity } : {}),
  }]] };
}
