import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { indexDigest } from './index-store.mjs';
import { CliError } from '../cli-output.mjs';

/** Font inventory plus platform/browser identity; computed once per finite query. */
export async function observationEnvironment() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (cause) { throw new CliError('PLAYWRIGHT_UNAVAILABLE', 'Restore the packaged Playwright dependency before observing frames.', { cause }); }
  const roots = process.platform === 'darwin' ? ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts')]
    : process.platform === 'win32' ? [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Microsoft/Windows/Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.local/share/fonts'), path.join(os.homedir(), '.fonts')];
  const files = [], seen = new Set();
  async function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    try {
      const info = await stat(file);
      if (info.isDirectory()) for (const name of await readdir(file)) await visit(path.join(file, name));
      else files.push([file, info.size, info.mtimeMs, info.ctimeMs]);
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  try { for (const root of roots) await visit(root); await visit(chromium.executablePath()); }
  catch (error) { if (['EACCES', 'EPERM'].includes(error.code)) return null; throw error; }
  return indexDigest(JSON.stringify({ platform: process.platform, arch: process.arch, files: files.sort() }));
}

/** Browser-side projection: provenance roots and authored references, no raster work. */
export function collectOwnerObservation({ tokens, theme }) {
  const frame = document.querySelector('[data-adg-frame]'), root = frame?.firstElementChild;
  if (!root || frame.children.length !== 1) throw Error('Ownership observation requires exactly one frame root.');
  const origin = frame.getBoundingClientRect(), elements = [root, ...root.querySelectorAll('*')], paths = new Map(elements.map((node, i) => [node, String(i)]));
  const tokenNames = new Set(tokens.map(token => token.name));
  const definitions = new Map(tokens.map(token => [token.name, token.values.find(value => value.theme === theme).declaration]));
  const box = rect => ({ x: rect.left - origin.left, y: rect.top - origin.top, width: Math.max(0, rect.right - rect.left), height: Math.max(0, rect.bottom - rect.top) });
  const styleCache = new Map(), declarations = new Map();
  const style = node => { if (!styleCache.has(node)) styleCache.set(node, getComputedStyle(node)); return styleCache.get(node); };
  function clipped(node) {
    const rect = node.getBoundingClientRect(); let left = Math.max(rect.left, origin.left), right = Math.min(rect.right, origin.right), top = Math.max(rect.top, origin.top), bottom = Math.min(rect.bottom, origin.bottom);
    for (let p = node; p; p = p.parentElement) {
      const s = style(p); if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return null;
      if (p !== node && s.display !== 'inline') {
        const r = p.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(s.overflowX)) { left = Math.max(left, r.left); right = Math.min(right, r.right); }
        if (/(hidden|clip|scroll|auto)/.test(s.overflowY)) { top = Math.max(top, r.top); bottom = Math.min(bottom, r.bottom); }
      }
    }
    return right > left && bottom > top ? box({ left, right, top, bottom }) : null;
  }
  const rules = [];
  function visitRules(list, containers = [], parents = []) {
    for (const rule of list) {
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches || rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
      const nested = typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule ? [...containers, rule.cssText.slice(0, rule.cssText.indexOf('{'))] : containers;
      let resolved = parents;
      if (rule.selectorText && rule.style) {
        const own = selectors(rule.selectorText);
        resolved = parents.length ? parents.flatMap(parent => own.map(selector => selector.includes('&') ? selector.replaceAll('&', `:is(${parent})`) : `${parent} ${selector}`)) : own;
        rules.push({ selectors: resolved, style: rule.style, containers });
      }
      if (rule.cssRules) visitRules(rule.cssRules, nested, resolved);
    }
  }
  for (const sheet of document.styleSheets) visitRules(sheet.cssRules);
  function selectors(text) {
    const out = []; let start = 0, depth = 0, quote = '';
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quote) { if (char === '\\') i++; else if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '(' || char === '[') depth++;
      else if (char === ')' || char === ']') depth--;
      else if (char === ',' && !depth) { out.push(text.slice(start, i)); start = i + 1; }
    }
    return [...out, text.slice(start)].map(value => value.trim());
  }
  const probe = document.createElement('style'); document.head.append(probe);
  function containerActive(node, conditions) {
    if (!conditions.length) return true;
    const previous = node.getAttribute('data-adg-owner-probe');
    try {
      node.setAttribute('data-adg-owner-probe', 'active');
      probe.textContent = conditions.reduceRight((inner, condition) => `${condition}{${inner}}`, '[data-adg-owner-probe="active"]{--adg-owner-condition:1!important}');
      return getComputedStyle(node).getPropertyValue('--adg-owner-condition').trim() === '1';
    } finally { probe.textContent = ''; if (previous === null) node.removeAttribute('data-adg-owner-probe'); else node.setAttribute('data-adg-owner-probe', previous); }
  }
  function declarationsFor(node, pseudo = '') {
    const key = pseudo ? `${paths.get(node)}${pseudo}` : node;
    if (declarations.has(key)) return declarations.get(key);
    const result = [];
    for (const rule of rules) {
      const matched = rule.selectors.some(selector => {
        const suffix = /::(before|after)\b/.exec(selector);
        if ((suffix ? `::${suffix[1]}` : '') !== pseudo) return false;
        try { return node.matches(selector.replace(/::(?:before|after)\b/g, '')); } catch { return false; }
      });
      if (matched && containerActive(node, rule.containers)) for (const property of rule.style) result.push({ property, declaration: rule.style.getPropertyValue(property) });
    }
    if (!pseudo) for (const property of node.style) result.push({ property, declaration: node.style.getPropertyValue(property) });
    declarations.set(key, result); return result;
  }
  function variables(expression, fallback = false) {
    const result = []; const regex = /var\(\s*(--[\w-]+)/g; let match;
    while ((match = regex.exec(expression))) {
      let depth = 1, comma = -1, end = regex.lastIndex;
      for (; end < expression.length && depth; end++) {
        if (expression[end] === '(') depth++; else if (expression[end] === ')') depth--;
        else if (expression[end] === ',' && depth === 1 && comma < 0) comma = end;
      }
      result.push({ name: match[1], fallback });
      if (comma >= 0) result.push(...variables(expression.slice(comma + 1, end - 1), true));
      regex.lastIndex = end;
    }
    return result;
  }
  const inherited = /^(?:color|font(?:-.+)?|line-height|letter-spacing|word-spacing|text-align|text-indent|text-transform|visibility|cursor|fill|stroke(?:-.+)?)$/;
  const nodes = [], references = [];
  try {
    for (const node of elements) {
      const bounds = clipped(node); if (!bounds) continue;
      const ancestors = [], owners = [];
      for (let p = node; p && p !== frame; p = p.parentElement) {
        ancestors.push(paths.get(p));
        owners.push(...JSON.parse(p.getAttribute('data-adg-owners') ?? '[]'));
      }
      const own = JSON.parse(node.getAttribute('data-adg-owners') ?? '[]');
      nodes.push({ path: paths.get(node), ancestors, box: bounds, owners: own });
      const customs = new Map();
      for (let p = node; p; p = p.parentElement) for (const declaration of declarationsFor(p)) if (declaration.property.startsWith('--') && !customs.has(declaration.property)) customs.set(declaration.property, declaration.declaration);
      function expand(name, property, declaration, via = [], fallback = false) {
        if (via.includes(name)) return;
        if (tokenNames.has(name)) references.push({ path: paths.get(node), ancestors, box: bounds, owners, token: name, property, declaration, via,
          matchKind: fallback ? 'token_fallback_reference' : via.length ? 'token_alias_reference' : 'token_reference' });
        const expression = tokenNames.has(name) ? definitions.get(name) : customs.get(name);
        if (expression) for (const variable of variables(expression)) expand(variable.name, property, declaration, [...via, name], fallback || variable.fallback);
      }
      for (const pseudo of ['', '::before', '::after']) {
        if (pseudo && ['none', 'normal'].includes(getComputedStyle(node, pseudo).content)) continue;
        const active = [...declarationsFor(node, pseudo)];
        if (!pseudo) for (let p = node.parentElement; p; p = p.parentElement) active.push(...declarationsFor(p).filter(d => inherited.test(d.property)));
        for (const { property, declaration } of active) if (!property.startsWith('--')) for (const variable of variables(declaration)) expand(variable.name, property, declaration, [], variable.fallback);
      }
    }
    const sample = document.createElement('i'); document.body.append(sample);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { colorSpace: 'srgb', colorType: 'float16', willReadFrequently: true }); context.globalCompositeOperation = 'copy';
    const palette = tokens.map(token => {
      const value = getComputedStyle(document.documentElement).getPropertyValue(token.name).trim(); let rgba = null;
      if (value && !/^(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)$/i.test(value) && CSS.supports('color', value)) {
        sample.style.color = value; context.fillStyle = getComputedStyle(sample).color; context.fillRect(0, 0, 1, 1);
        rgba = [...context.getImageData(0, 0, 1, 1, { colorSpace: 'srgb', pixelFormat: 'rgba-float16' }).data].map(channel => Math.round(Math.max(0, Math.min(1, channel)) * 255));
        if (rgba[3] === 0) rgba = [0, 0, 0, 0];
      }
      return { name: token.name, resolved: value || null, rgba };
    });
    sample.remove();
    return { nodes, references: [...new Map(references.map(ref => [JSON.stringify(ref), ref])).values()], palette };
  } finally { probe.remove(); }
}

export async function settleOwnerObservation(read, wait, now = () => performance.now()) {
  const start = now(); let previous = JSON.stringify(await read());
  while (true) {
    await wait(); const value = await read(), current = JSON.stringify(value);
    if (current === previous) return value;
    if (now() - start >= 5000) throw new CliError('OWNER_UNSETTLED', 'Ownership observations did not settle within five seconds.');
    previous = current;
  }
}
