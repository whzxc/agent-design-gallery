import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { indexDigest } from './index-store.mjs';
import { CliError } from '../cli-output.mjs';
import { loadFrame, browserTask, readyResources } from './browser.mjs';
import { escape } from './runtime.mjs';
import { installColorResolver } from './owner-colors.mjs';

export const normalizeOwnerText = text => text.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const contexts = new WeakMap();

export function occurrenceContext(observation, occurrence) {
  if (!contexts.has(observation)) contexts.set(observation, new Map(observation.nodes.map(node => [node.path, node])));
  const byPath = contexts.get(observation);
  const path = occurrence.ownerPath ?? occurrence.path?.replace(/::(?:before|after)$|\/text-\d+$/g, '');
  let node = byPath.get(path), distance = 0; const ancestors = [], owners = [];
  while (node) {
    ancestors.push(node.path);
    if (!owners.length && node.owners?.length) owners.push(...node.owners.map(owner => ({ ...owner, distance })));
    node = byPath.get(node.parentPath); distance++;
  }
  return { ...occurrence, ancestors: occurrence.ancestors ?? ancestors, owners: occurrence.owners ?? owners, box: occurrence.box ?? byPath.get(path)?.box, distance: owners[0]?.distance ?? distance };
}

export async function observeOwnerFrame(index, source, built, frame, theme, environment, getPage, tokens) {
  return index.observation(source, built, frame, theme, environment, async () => {
    const page = await getPage();
    const rendered = { ...frame, document: value => `<!doctype html><html data-theme="${value}"><head><meta charset="utf-8"><style>${built.css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div data-adg-frame="${escape(frame.name)}" style="${frame.width ? `width:${frame.width}px;` : 'width:max-content;'}${frame.height ? `height:${frame.height}px;` : ''}">${frame.html}</div></body></html>` };
    await loadFrame(page, rendered, theme);
    return browserTask(page.context().browser(), async () => {
      await page.evaluate(readyResources); await page.evaluate(installColorResolver);
      return settleOwnerObservation(() => page.evaluate(collectOwnerObservation, { tokens, theme }), () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))));
    });
  });
}

export function collectOwnerPalette({ tokens }) {
  return tokens.map(token => {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(token.name).trim() || null;
    return { name: token.name, resolved, rgba: resolved && !/\b(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)\b/i.test(resolved) ? globalThis.__adgOwnerColor(resolved) : null };
  });
}

export async function observeOwnerPalette(index, tokens, theme, environment, getPage, tokenSource) {
  return index.palette(tokens, theme, environment, async () => {
    const page = await getPage();
    return browserTask(page.context().browser(), async () => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${tokenSource.replace(/<\/style/gi, '<\\/style')}</style></head><body></body></html>`);
      await page.evaluate(installColorResolver);
      return page.evaluate(collectOwnerPalette, { tokens });
    });
  });
}

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
  return indexDigest(JSON.stringify({ platform: process.platform, release: os.release(), arch: process.arch, locale: 'en-US', timezone: 'UTC', deviceScaleFactor: 1, files: files.sort() }));
}

/** Browser-side projection: provenance roots and authored references, no raster work. */
export function collectOwnerObservation({ tokens, theme }) {
  const frame = document.querySelector('[data-adg-frame]'), root = frame?.firstElementChild;
  if (!root || frame.children.length !== 1) throw Error('Ownership observation requires exactly one frame root.');
  const origin = frame.getBoundingClientRect(), elements = [root, ...root.querySelectorAll('*')], paths = new Map(elements.map((node, i) => [node, String(i)]));
  const tokenNames = new Set(tokens.map(token => token.name));
  const definitions = new Map(tokens.map(token => [token.name, token.values.find(value => value.theme === theme).declaration]));
  const box = rect => ({ x: rect.left - origin.left, y: rect.top - origin.top, width: Math.max(0, rect.right - rect.left), height: Math.max(0, rect.bottom - rect.top) });
  const styleCache = new Map(), declarations = new Map(), rectCache = new Map();
  const rect = node => { if (!rectCache.has(node)) rectCache.set(node, node.getBoundingClientRect()); return rectCache.get(node); };
  const style = node => { if (!styleCache.has(node)) styleCache.set(node, getComputedStyle(node)); return styleCache.get(node); };
  function clipped(node, r = rect(node), includeSelf = false) {
    let left = Math.max(r.left, origin.left), right = Math.min(r.right, origin.right), top = Math.max(r.top, origin.top), bottom = Math.min(r.bottom, origin.bottom);
    for (let p = node; p; p = p.parentElement) {
      const s = style(p); if (s.display === 'none' || p === node && s.visibility !== 'visible' || Number(s.opacity) === 0) return null;
      if ((p !== node || includeSelf) && s.display !== 'inline') {
        const r = rect(p);
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
        if ([...rule.style].some(property => rule.style.getPropertyValue(property).includes('var('))) rules.push({ selectors: resolved, style: rule.style, containers });
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
  const nodes = [], references = [], paints = [], texts = [], groups = [];
  const normalize = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
  function paint(style, property, node, bounds, pseudo = '') {
    const computed = style.getPropertyValue(property);
    if (!computed || computed === 'none') return;
    const values = property.includes('shadow') || property === 'background-image'
      ? computed.match(/(?:rgba?|hsla?|oklch|oklab|lab|lch|color(?:-mix)?)\((?:[^()]|\([^()]*\))*\)|#[\da-f]{3,8}\b/gi) ?? [] : [computed];
    for (const value of values) {
      const rgba = globalThis.__adgOwnerColor(value);
      if (rgba?.[3]) paints.push({ path: paths.get(node) + pseudo, ownerPath: paths.get(node), box: bounds, property, computed: value, rgba });
    }
  }
  function fragment(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest('script,style,input,textarea,select')) return null;
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()]; if (!rects.length) return null;
    const extent = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
    const bounds = clipped(parent, extent, true); if (!bounds) return null;
    const clipRect = r => {
      const left = Math.max(r.left, origin.left + bounds.x), right = Math.min(r.right, origin.left + bounds.x + bounds.width), top = Math.max(r.top, origin.top + bounds.y), bottom = Math.min(r.bottom, origin.top + bounds.y + bounds.height);
      return right > left && bottom > top ? box({ left, right, top, bottom }) : null;
    };
    const boxes = rects.map(clipRect).filter(Boolean);
    if (!boxes.length) return null;
    let raw = node.data;
    if (rects.some(r => r.left < origin.left + bounds.x - .5 || r.right > origin.left + bounds.x + bounds.width + .5 || r.top < origin.top + bounds.y - .5 || r.bottom > origin.top + bounds.y + bounds.height + .5)) {
      raw = '';
      for (let i = 0; i < node.length; i++) { range.setStart(node, i); range.setEnd(node, i + 1); if ([...range.getClientRects()].some(r => clipRect(r))) raw += node.data[i]; }
    }
    const transform = style(parent).textTransform;
    const rendered = transform === 'uppercase' ? raw.toLocaleUpperCase(document.documentElement.lang || 'en') : transform === 'lowercase' ? raw.toLocaleLowerCase(document.documentElement.lang || 'en') : transform === 'capitalize' ? raw.replace(/\b\p{L}/gu, value => value.toLocaleUpperCase(document.documentElement.lang || 'en')) : raw;
    return { parent, raw, rendered, elementPath: `${paths.get(parent)}/text-${[...parent.childNodes].indexOf(node)}`, text: raw, boxes };
  }
  function textGroup(node) {
    for (let p = node; p && p !== frame; p = p.parentElement) if (p.matches('button,a,label,input,textarea,select,text') || !['inline','contents'].includes(style(p).display)) return p;
    return root;
  }
  try {
    for (const node of elements) {
      const bounds = clipped(node);
      const own = JSON.parse(node.getAttribute('data-adg-owners') ?? '[]');
      nodes.push({ path: paths.get(node), parentPath: paths.get(node.parentElement) ?? null, box: bounds, owners: own });
      if (!bounds) continue;
      const customs = new Map();
      for (let p = node; p; p = p.parentElement) for (const declaration of declarationsFor(p)) if (declaration.property.startsWith('--') && !customs.has(declaration.property)) customs.set(declaration.property, declaration.declaration);
      function expand(name, property, declaration, via = [], fallback = false) {
        if (via.includes(name)) return;
        if (tokenNames.has(name)) references.push({ path: paths.get(node), token: name, property, declaration, via,
          matchKind: fallback ? 'token_fallback_reference' : via.length ? 'token_alias_reference' : 'token_reference' });
        const expression = tokenNames.has(name) ? definitions.get(name) : customs.get(name);
        if (expression) for (const variable of variables(expression)) expand(variable.name, property, declaration, [...via, name], fallback || variable.fallback);
      }
      for (const pseudo of ['', '::before', '::after']) {
        const s = pseudo ? getComputedStyle(node, pseudo) : style(node);
        if (pseudo && (['none', 'normal'].includes(s.content) || s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0)) continue;
        const active = [...declarationsFor(node, pseudo)];
        if (!pseudo && (own.length || node === root)) for (let p = node.parentElement; p; p = p.parentElement) active.push(...declarationsFor(p).filter(d => inherited.test(d.property)));
        for (const { property, declaration } of active) if (!property.startsWith('--')) for (const variable of variables(declaration)) expand(variable.name, property, declaration, [], variable.fallback);
        const hasText = pseudo ? !['""', "''", 'none', 'normal'].includes(s.content) : node.matches('input,textarea,select') ? !!String(node.value || node.placeholder || [...(node.selectedOptions ?? [])].map(option => option.text).join('')).trim() : [...node.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() && fragment(n));
        if (hasText && !(node instanceof SVGElement)) paint(!pseudo && node.matches('input,textarea') && !node.value && node.placeholder ? getComputedStyle(node, '::placeholder') : s, 'color', node, bounds, pseudo);
        paint(s, 'background-color', node, bounds, pseudo);
        for (const side of ['top','right','bottom','left']) if (parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && s.getPropertyValue(`border-${side}-style`) !== 'none') paint(s, `border-${side}-color`, node, bounds, pseudo);
        if (parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none') paint(s, 'outline-color', node, bounds, pseudo);
        if (node instanceof SVGElement && /^(path|rect|circle|ellipse|polygon|polyline|line|text|tspan)$/.test(node.localName) && (!/^(text|tspan)$/.test(node.localName) || hasText)) { paint(s, 'fill', node, bounds, pseudo); if (parseFloat(s.strokeWidth) > 0) paint(s, 'stroke', node, bounds, pseudo); }
        for (const property of ['box-shadow','text-shadow','background-image']) if (property !== 'text-shadow' || hasText) paint(s, property, node, bounds, pseudo);
        if (pseudo && !/\b(?:url|attr|counter)\(/.test(s.content)) {
          const raw = [...s.content.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].map(match => (match[1] ?? match[2]).replace(/\\([\da-f]{1,6})\s?|\\(.)/gi, (_, hex, char) => hex ? String.fromCodePoint(parseInt(hex, 16) || 0xfffd) : char)).join('');
          if (normalize(raw)) texts.push({ path: paths.get(node) + pseudo, ownerPath: paths.get(node), raw, normalized: normalize(raw), fragments: [{ elementPath: paths.get(node) + pseudo, text: raw, boxes: [bounds] }] });
        }
      }
      if (node.matches('input,textarea,select') && !(node.matches('input[type=password]') && node.value)) {
        const raw = node.matches('select') ? [...node.selectedOptions].map(option => option.text).join(' ') : node.value || node.placeholder || '';
        if (normalize(raw)) texts.push({ path: `${paths.get(node)}/value`, ownerPath: paths.get(node), raw, normalized: normalize(raw), fragments: [{ elementPath: `${paths.get(node)}/value`, text: raw, boxes: [bounds] }] });
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const f = fragment(node); if (!f) continue;
      const group = textGroup(f.parent);
      if (groups.at(-1)?.[0] !== group) groups.push([group, []]);
      groups.at(-1)[1].push(f);
    }
    for (const [group, fragments] of groups) {
      const raw = fragments.map(f => f.raw).join(''), normalized = normalize(fragments.map(f => f.rendered).join(''));
      if (!normalized) continue;
      let common = fragments[0].parent;
      while (common && !fragments.every(f => common.contains(f.parent))) common = common.parentElement;
      texts.push({ path: `${paths.get(group)}/run-${texts.length}`, ownerPath: paths.get(common ?? group), raw, normalized, fragments: fragments.map(({ elementPath, text, boxes }) => ({ elementPath, text, boxes })) });
    }
    return { nodes, references: [...new Map(references.map(ref => [JSON.stringify(ref), ref])).values()], texts, paints };
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
