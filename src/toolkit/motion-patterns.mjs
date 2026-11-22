import path from 'node:path';
import { readFileSync } from 'node:fs';
import { CliError } from '../cli-output.mjs';
import { parseTokens } from './tokens.mjs';
import { milliseconds, motionPrimitives, motionTransformValue, tokenValue, validMotionEasing } from './motion-primitives.mjs';

const roleDefaults = {
  'duration-base': '--adg-motion-base',
  'duration-fast': '--adg-motion-fast',
  'duration-loop': '--adg-motion-loop',
  'easing-enter': '--adg-motion-enter',
  'easing-exit': '--adg-motion-exit',
  'easing-loop': '--adg-motion-linear',
  'spring-small': '--motion-spring-small',
  'distance-small': '--motion-distance-small',
  'scale-small': '--motion-scale-small',
  'stagger-small': '--motion-stagger-small',
};

export function fallbackMotionRoles(catalog, values) {
  const uses = new Set(values);
  return Object.entries(roleDefaults).filter(([role, token]) => role === 'spring-small'
    ? (uses.has(token) || uses.has(token + '-duration')) &&
      ['-duration', '-bounce'].some(suffix => catalog.defaultTokens.has(token + suffix))
    : uses.has(token) && catalog.defaultTokens.has(token));
}
const timing = { duration: 'duration-base', easing: 'easing-enter' };
const exit = { duration: 'duration-fast', easing: 'easing-exit' };
const distance = 'distance-small';
const make = (kind, action, effect, properties, parameters = timing, extra = {}) => ({
  kind, action, effect, properties, parameters, interrupt: 'finish',
  reduced: kind === 'ambient' || kind === 'continuous' ? 'static' : 'instant', ...extra,
});
const basePatterns = {
  fade: make('transition', 'enter', 'fade', ['opacity'], timing, { exit }),
  'expand-collapse': make('layout', 'resize', 'expand', ['height', 'opacity'], timing, { exit }),
  'size-transition': make('layout', 'resize', 'size', ['width', 'height']),
  slide: make('transition', 'enter', 'slide', ['x', 'opacity'], { ...timing, distance }, { exit }),
  'spring-pop': make('transition', 'enter', 'pop', ['scale', 'opacity'], { spring: 'spring-small', scale: 'scale-small' }),
  'crossfade-replace': make('transition', 'replace', 'crossfade', ['opacity']),
  follow: make('continuous', 'follow', 'follow', ['x', 'y'], timing, { interrupt: 'retarget' }),
  'avoid-reflow': make('layout', 'avoid', 'avoid', ['x', 'y'], timing, { interrupt: 'retarget' }),
  stagger: make('transition', 'enter', 'stagger', ['opacity', 'y'], { ...timing, distance, stagger: 'stagger-small' }),
  'ambient-loop': make('ambient', 'loop', 'pulse', ['opacity', 'scale'], {
    duration: 'duration-loop', easing: 'easing-loop', scale: 'scale-small',
  }, { interrupt: 'cancel' }),
};
const effects = new Set([...Object.values(basePatterns).map(pattern => pattern.effect), 'aurora', 'shimmer', 'spin']);
const ambientEffects = new Set(['aurora', 'shimmer', 'pulse', 'spin']);
const actions = { transition: ['enter', 'exit', 'replace'], layout: ['resize', 'reflow', 'avoid'], continuous: ['follow'], ambient: ['loop'] };
const parameterKeys = new Set(['duration', 'delay', 'minDuration', 'maxDuration', 'easing', 'spring', 'distance', 'scale', 'stagger', 'fromOpacity']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const tokenPattern = /^--[\w-]+$/;
const portable = value => typeof value === 'string' && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[\\:\x00-\x1f]/.test(part));
const locator = ref => object(ref) && portable(ref.file) &&
  typeof ref.match === 'string' && /^(?:css|keyframes|motion|style|attribute|web|call|vue|tailwind):.+$/.test(ref.match) &&
  (ref.within === undefined || (typeof ref.within === 'string' && ref.within.trim()));
export const motionPatternFile = 'motion-patterns.json';

function projectFile(config, name, fallback) {
  try { return readFileSync(path.join(config.design, name), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function mergeParameters(base, overrides = {}) {
  const result = { ...base, ...overrides };
  if (overrides.spring !== undefined) {
    delete result.duration;
    delete result.easing;
  } else if (overrides.duration !== undefined || overrides.easing !== undefined) delete result.spring;
  return result;
}

function validParameter(primitives, theme, key, token) {
  const value = tokenValue(primitives.tokens, theme, token);
  switch (key) {
    case 'spring': return Object.hasOwn(primitives.springs[theme], token);
    case 'duration':
    case 'delay':
    case 'minDuration':
    case 'maxDuration':
    case 'stagger': return Number.isFinite(milliseconds(value));
    case 'distance':
    case 'scale': return motionTransformValue(key, value) !== null;
    default: return validMotionEasing(value);
  }
}

export function loadMotionPatterns(config, authored) {
  const invalid = message => { throw new CliError('CONFIG_INVALID', motionPatternFile + ': ' + message); };
  let document;
  try { document = JSON.parse(projectFile(config, motionPatternFile, '{"version":1}')); }
  catch (error) { invalid(error.message); }
  if (!object(document) || document.version !== 1 ||
      (document.patterns !== undefined && !object(document.patterns)) ||
      (document.roles !== undefined && !object(document.roles)) ||
      Object.keys(document).some(key => !['version', 'patterns', 'roles', 'ignore'].includes(key)))
    invalid('Expected version 1 with optional roles, patterns and ignore.');
  const ignore = document.ignore ?? [];
  if ((document.ignore !== undefined && !Array.isArray(document.ignore)) || ignore.some(ref =>
    !locator(ref) || Object.keys(ref).some(key => !['file','match','within','reason'].includes(key)) ||
    typeof ref.reason !== 'string' || !ref.reason.trim())) invalid('Ignore entries need an exact code locator and a reason.');

  const css = authored ? null : projectFile(config, 'tokens.css', null);
  authored ??= css ? parseTokens(css) : {light: new Map(), dark: new Map()};
  const primitives = motionPrimitives(authored);
  const roles = { ...roleDefaults };
  for (const [role, token] of Object.entries(document.roles ?? {})) {
    if (!Object.hasOwn(roleDefaults, role) || typeof token !== 'string' || !tokenPattern.test(token))
      invalid('Invalid motion role ' + role + '.');
    const kind = role.split('-')[0];
    const inputs = kind === 'spring' ? [token + '-duration', token + '-bounce'] : [token];
    const authoredPrimitives = { ...primitives, tokens: authored };
    if (!['light','dark'].every(theme =>
      inputs.every(name => tokenValue(authored, theme, name) !== undefined) &&
      validParameter(authoredPrimitives, theme, kind, token)))
      invalid(role + ' needs an authored ' + kind + ' token valid in both themes: ' + token + '.');
    roles[role] = token;
  }
  const resolveRoles = params => Object.fromEntries(Object.entries(params).map(([key, role]) => [key, roles[role]]));
  const patterns = new Map(), variants = new Map();
  const declarations = Object.entries(document.patterns ?? {});
  const parameterFields = ['parameters','enter','exit'];
  const consumerFields = ['consumers','frames'];
  const shapeFields = ['kind','action','effect','properties','interrupt','reduced'];
  function validateParameters(id, values) {
    if (!object(values) || Object.keys(values).some(key => !parameterKeys.has(key))) invalid(id + ' has unknown parameters.');
    if (Object.hasOwn(values, 'spring') && (Object.hasOwn(values, 'duration') || Object.hasOwn(values, 'easing')))
      invalid(id + ' cannot combine spring with duration or easing in the same parameter set.');
    for (const [key, value] of Object.entries(values)) {
      if (key === 'fromOpacity') {
        if (!(Number.isFinite(value) && value >= 0 && value <= 1)) invalid(id + ' has an invalid fromOpacity.');
      } else if (typeof value !== 'string' || !tokenPattern.test(value) ||
          !['light','dark'].every(theme => validParameter(primitives, theme, key, value))) {
        invalid(id + ' needs a valid ' + key + ' token in both themes: ' + value + '.');
      }
    }
  }
  function declare(id, entry, base) {
    const pattern = { ...base, ...entry, consumers: entry.consumers, frames: entry.frames };
    for (const dir of parameterFields) {
      if (entry[dir] !== undefined) validateParameters(id, entry[dir]);
      if (dir === 'parameters' || base?.[dir] || entry[dir]) pattern[dir] = mergeParameters(base?.[dir], entry[dir]);
    }
    if (!Object.hasOwn(actions, pattern.kind) || !actions[pattern.kind].includes(pattern.action) || !effects.has(pattern.effect) ||
        !['finish','retarget','cancel'].includes(pattern.interrupt) || !['instant','static'].includes(pattern.reduced) ||
        !Array.isArray(pattern.properties) || !pattern.properties.length ||
        pattern.properties.some(prop => typeof prop !== 'string' || !/^(?:--)?[a-zA-Z][\w-]*$/.test(prop)) ||
        new Set(pattern.properties).size !== pattern.properties.length) invalid(id + ' needs a supported kind, action, effect, properties, interrupt and reduced policy.');
    if (pattern.consumers !== undefined && (!Array.isArray(pattern.consumers) || pattern.consumers.some(ref =>
      !locator(ref) || Object.keys(ref).some(key => !['file','match','within'].includes(key)))))
      invalid(id + ' has an invalid code consumer.');
    if (pattern.frames !== undefined && (!Array.isArray(pattern.frames) || pattern.frames.some(ref =>
      !object(ref) || Object.keys(ref).some(key => !['source','frame'].includes(key)) || !portable(ref.source) ||
      !ref.source.endsWith('.tsx') || typeof ref.frame !== 'string' || !ref.frame.trim()))) invalid(id + ' has an invalid frame consumer.');
    for (const direction of ['enter', 'exit']) {
      const resolved = patternParameters(pattern, direction);
      if (!resolved.spring && !(resolved.duration && resolved.easing)) invalid(id + ' requires duration and easing or a spring.');
      if (resolved.minDuration || resolved.maxDuration) {
        if (pattern.kind !== 'ambient' || !ambientEffects.has(pattern.effect))
          invalid(id + ' can declare a duration range only for ambient patterns with aurora, shimmer, pulse or spin.');
        if (!resolved.minDuration || !resolved.maxDuration || !resolved.duration)
          invalid(id + ' needs minDuration and maxDuration alongside a representative duration.');
        for (const theme of ['light', 'dark']) {
          const time = key => milliseconds(tokenValue(primitives.tokens, theme, resolved[key]));
          if (time('minDuration') > time('maxDuration')) invalid(id + ' has minDuration greater than maxDuration in ' + theme + '.');
        }
      }
    }
    patterns.set(id, pattern);
  }
  for (const [id, entry] of declarations) {
    if (!idPattern.test(id) || !object(entry)) invalid('Invalid pattern ' + id + '.');
    if (Object.hasOwn(entry, 'extends')) {
      if (Object.hasOwn(basePatterns, id) || typeof entry.extends !== 'string' || !Object.hasOwn(basePatterns, entry.extends) ||
          Object.keys(entry).some(key => !['extends', ...parameterFields, ...consumerFields].includes(key)))
        invalid(id + ' must extend a built-in and declare only parameter overrides and its own consumers.');
    } else if (Object.keys(entry).some(key => ![...parameterFields, ...consumerFields, ...shapeFields].includes(key))) {
      invalid(id + ' has unknown fields.');
    }
  }
  for (const [id, pattern] of Object.entries(basePatterns)) {
    declare(id, Object.hasOwn(document.patterns ?? {}, id) ? document.patterns[id] : {}, {
      ...pattern, parameters: resolveRoles(pattern.parameters),
      ...(pattern.exit ? { exit: resolveRoles(pattern.exit) } : {}),
    });
    variants.set(id, []);
  }
  for (const [id, entry] of declarations) {
    if (variants.has(id)) continue;
    declare(id, entry, patterns.get(entry.extends));
    if (entry.extends) variants.get(entry.extends).push(id);
  }
  return { ...primitives, patterns, variants, ignore, declared: declarations.map(([id]) => id) };
}

export function patternParameters(pattern, direction) {
  return mergeParameters(pattern.parameters, pattern[direction]);
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
  if (['phases','duration','delay','easing','interrupt','reduced','playbackOmissions'].some(key => Object.hasOwn(fields, key))) {
    issue('MOTION_PATTERN_INVALID', '/pattern', 'A pattern supplies phases, timing, interrupt and reduced motion.');
    return edge;
  }
  const direction = ref.direction ?? selected.action;
  const parameters = patternParameters(selected, direction);
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
  const playbackOmissions = [];
  const transform = {};
  const presence = selected.kind === 'transition' && ['enter', 'exit'].includes(direction);
  if (parameters.distance) {
    const x = selected.properties.includes('x'), y = selected.properties.includes('y');
    if (!presence) playbackOmissions.push('Distance offset requires an entry or exit effect.');
    else if (x && y) playbackOmissions.push('Distance offset needs a single axis.');
    else Object.assign(transform, { distance: parameters.distance, axis: x ? 'x' : 'y' });
  }
  if (parameters.scale) {
    if (presence) transform.scale = parameters.scale;
    else playbackOmissions.push('Scale factor requires an entry or exit effect.');
  }
  if (transform.distance || transform.scale) {
    mode = direction;
    properties = [
      ...(selected.properties.includes('opacity') || direction === 'enter' && parameters.fromOpacity !== undefined ? ['opacity'] : []),
      ...(transform.distance ? ['translate'] : []),
      ...(transform.scale ? ['scale'] : []),
    ];
  }
  if (parameters.stagger) playbackOmissions.push('Stagger is outside the discrete player contract.');
  if (parameters.fromOpacity !== undefined && mode !== 'enter')
    playbackOmissions.push('Starting opacity requires an entry effect.');
  const duration = parameters.spring ? parameters.spring + '-duration' : parameters.duration;
  const easing = parameters.spring ?? parameters.easing;
  const track = {
    mode, properties, targets: ref.targets,
    ...(Object.keys(transform).length && { transform }),
    ...(mode === 'enter' && parameters.fromOpacity !== undefined ? { fromOpacity: parameters.fromOpacity } : {}),
  };
  return { ...fields, duration, easing, interrupt: selected.interrupt, reduced: selected.reduced,
    ...(parameters.delay && { delay: parameters.delay }),
    ...(playbackOmissions.length && { playbackOmissions }), phases: [[track]] };
}
