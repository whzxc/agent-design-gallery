import { lexer } from 'css-tree';
import { CliError } from '../cli-output.mjs';

const defaults = {
  '--adg-motion-fast': '140ms',
  '--adg-motion-base': '220ms',
  '--adg-motion-loop': '1600ms',
  '--adg-motion-enter': 'cubic-bezier(.2,.75,.25,1)',
  '--adg-motion-exit': 'cubic-bezier(.4,0,.8,.35)',
  '--adg-motion-linear': 'linear',
  '--motion-distance-small': '20px',
  '--motion-scale-small': '.85',
  '--motion-stagger-small': '55ms',
  '--motion-spring-small-duration': '360ms',
  '--motion-spring-small-bounce': '.14',
};

export function tokenValue(tokens, theme, token) {
  const visited = new Set();
  while (!visited.has(token)) {
    visited.add(token);
    const value = (theme === 'dark' ? tokens.dark.get(token) : undefined) ?? tokens.light.get(token);
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value ?? '');
    if (!alias) return value;
    token = alias[1];
  }
}

export function milliseconds(value) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value ?? '');
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : NaN;
}

export function motionTransformValue(kind, raw) {
  const number = Number.parseFloat(raw);
  if (!Number.isFinite(number)) return null;
  if (kind === 'distance') return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/.test(raw) ? raw : null;
  return /^\+?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) ? number : null;
}

export function validMotionEasing(value) {
  if (!value) return false;
  const linear = /^linear\(([^()]*)\)$/i.exec(value);
  if (linear) {
    const number = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
    const stop = new RegExp('^(?:' + number + '(?:\\s+' + number + '%){0,2}|(?:' + number + '%\\s+){1,2}' + number + ')$');
    const points = linear[1].split(',');
    return points.length >= 2 && points.every(point => stop.test(point.trim()));
  }
  if (!lexer.matchType('easing-function', value).matched) return false;
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*([\w-]+)\s*)?\)$/i.exec(value);
  return !steps || Number(steps[1]) >= (steps[2]?.toLowerCase() === 'jump-none' ? 2 : 1);
}

// Sample a normalized damped unit step. Bounce is the first overshoot fraction.
export function springEasing(bounce) {
  const log = Math.log(bounce || .001);
  const damping = bounce ? -log / Math.hypot(Math.PI, log) : 1;
  const omega = 7 / damping;
  const frequency = omega * Math.sqrt(1 - damping ** 2);
  const points = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    if (i === 32) return 1;
    const wave = frequency
      ? Math.cos(frequency * t) + 7 / frequency * Math.sin(frequency * t)
      : 1 + 7 * t;
    return Number((1 - Math.exp(-7 * t) * wave).toFixed(5));
  });
  return 'linear(' + points.join(', ') + ')';
}

export function motionPrimitives(authored, { base = true } = {}) {
  const light = new Map([...(base ? Object.entries(defaults) : []), ...authored.light]);
  const dark = new Map(authored.dark);
  const defaultTokens = new Set(base ? Object.keys(defaults).filter(name => !authored.light.has(name)) : []);
  const tokens = { light, dark };
  const names = [...light.keys()].flatMap(name => {
    const match = /^(--motion-spring-[\w-]+)-(?:duration|bounce)$/.exec(name);
    return match ? [match[1]] : [];
  });
  const springs = { light: {}, dark: {} }, generated = { light: new Map(), dark: new Map() };
  for (const name of new Set(names)) {
    for (const theme of ['light', 'dark']) {
      const duration = milliseconds(tokenValue(tokens, theme, name + '-duration'));
      const rawBounce = tokenValue(tokens, theme, name + '-bounce');
      const bounce = Number(rawBounce);
      if (!(duration > 0 && Number.isFinite(duration) && rawBounce && bounce >= 0 && bounce <= .8))
        throw new CliError('TOKENS_INVALID', name + ' needs a positive duration and a bounce between 0 and .8 in ' + theme + '.');
      const easing = springEasing(bounce);
      springs[theme][name] = { duration, bounce, easing };
      if (theme === 'light' || easing !== springs.light[name].easing) generated[theme].set(name, easing);
    }
  }
  for (const theme of ['light', 'dark']) for (const [name, easing] of generated[theme]) tokens[theme].set(name, easing);
  return { tokens, springs, generated, defaultTokens };
}

export function motionTokenCss(tokens) {
  const block = (selector, values) => selector + ' {\n' + [...values].map(([key, value]) => '  ' + key + ': ' + value + ';').join('\n') + '\n}';
  return block(':root', tokens.light) + '\n' + block(':root[data-theme="dark"]', tokens.dark) + '\n';
}
