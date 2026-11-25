// Authoring provenance survives reduced-motion capture, hidden elements and inactive variants.
import { parse, generate, walk, ident, lexer } from 'css-tree';
import { parseFragment } from 'parse5';
import { resolveMotionToken } from './motion.mjs';

const sheetCache = new WeakMap();
const governed =
  /^(?:-webkit-)?(?:transition|animation)(?:$|-(?:duration|delay|timing-function|property|name)$)|^--tw-(?:duration|ease)$/;
function declarations(ast, emit, classes = []) {
  if (!classes.length && ast.type === 'Rule' && ast.prelude.type === 'SelectorList') {
    // An outer selector owns its declarations, including any nested group/peer conditions.
    for (const selector of ast.prelude.children) {
      let first;
      walk(selector, {
        visit: 'ClassSelector',
        enter(node) {
          first ??= ident.decode(node.name);
        }
      });
      if (first) classes = [...classes, first];
    }
  }
  if (ast.type === 'Declaration') {
    const prop = ast.property.startsWith('--') ? ast.property : ast.property.toLowerCase();
    if (governed.test(prop)) emit(classes, prop, generate(ast.value));
  }
  for (const child of ast.children ?? []) declarations(child, emit, classes);
  if (ast.block) declarations(ast.block, emit, classes);
}
function utilities(built) {
  if (sheetCache.has(built)) return sheetCache.get(built);
  const rules = new Map();
  const css = built.cssBeforeTokens ?? built.css ?? '';
  if (/(?:transition|animation|--tw-(?:duration|ease))\s*[-:]/i.test(css)) {
    declarations(parse(css), (classes, prop, value) => {
      for (const cls of classes) {
        if (!rules.has(cls)) rules.set(cls, []);
        rules.get(cls).push([prop, value]);
      }
    });
  }
  sheetCache.set(built, rules);
  return rules;
}
function split(value, separator) {
  let depth = 0,
    start = 0;
  const parts = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (!depth && separator.test(value[i])) {
      if (i > start) parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  if (start < value.length) parts.push(value.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function sourceMotion(built, frame, tokens, theme, { skipKit = false } = {}) {
  // Most frames have no authored motion. Do not parse the large generated preflight for them.
  if (!/(?:animat|transition|duration|delay|ease|timing-function)/i.test(frame.html)) return [];
  const rules = utilities(built),
    messages = new Set();
  function check(prop, value, origin, utility = false) {
    const finding = (reason) => messages.add(origin + ' (' + prop + ': ' + value + '): ' + reason);
    const name = prop.replace(/^-webkit-/, '');
    const duration = name.endsWith('duration') || name.endsWith('delay'),
      easing = name.endsWith('timing-function') || name === '--tw-ease';
    const active =
      name === 'animation' || name === 'animation-name' || name === 'transition-property' || name === 'transition';
    if (active && !/^(none|initial|unset)$/i.test(value)) finding('Declare the motion on a frame edge.');
    if (name === 'animation' && /^var\(--animate-[\w-]+\)$/.test(value)) return;
    if (!duration && !easing && !['animation', 'transition'].includes(name)) return;
    for (const item of split(value, /,/)) {
      const list = duration || easing ? [item] : split(item, /\s/);
      for (const word of list) {
        if (utility && /^var\(--tw-(duration|ease),/.test(word)) continue; // Tailwind's shared default, separate authored utility checked below.
        let kind = duration ? 'duration' : easing ? 'easing' : null;
        const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(word);
        if (ref && !kind) {
          if (['duration', 'easing'].some((k) => resolveMotionToken(tokens, theme, ref[1], k).value !== null)) continue;
          finding('Shorthand variable must resolve to a project timing token.');
          continue;
        }
        if (!kind && (/^[+-]?(?:\d|\.\d).*m?s$/i.test(word) || lexer.matchType('easing-function', word).matched))
          kind = 'timing';
        if (kind && !(ref && resolveMotionToken(tokens, theme, ref[1], kind).value !== null))
          finding('Use a project motion token for ' + kind + '.');
      }
    }
  }
  function visit(node) {
    const isKitNode = skipKit && node.attrs?.some(attr => attr.name === 'data-adg-kit');
    if (!isKitNode) for (const { name, value } of node.attrs ?? []) {
      if (name === 'class')
        for (const cls of value.split(/\s+/)) for (const [prop, v] of rules.get(cls) ?? []) check(prop, v, cls, true);
      if (name === 'style' && /(?:transition|animat|--tw-(?:duration|ease))/i.test(value))
        declarations(parse(value, { context: 'declarationList' }), (_, prop, v) => check(prop, v, 'style'));
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parseFragment(frame.html));
  return [...messages];
}
