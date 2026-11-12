import { installFramePrimitives } from './frame-primitives.mjs';
export { installFramePrimitives };

/** Browser-side projection: provenance roots and authored references, no raster work. */
export function collectOwnerObservation({ tokens, theme }) {
  const frame = document.querySelector('[data-adg-frame]'), root = frame?.firstElementChild;
  if (!root || frame.children.length !== 1) throw Error('Ownership observation requires exactly one frame root.');
  const { inventory, relativeBox, variables, selectors, reads, identityNode, styleRules, textRects } = globalThis.__adgFramePrimitives;
  const origin = frame.getBoundingClientRect(), {elements,paths,neutralCandidates}=inventory(root), identities=[];
  const tokenNames = new Set(tokens.map(token => token.name));
  const definitions = new Map(tokens.map(token => [token.name, token.values.find(value => value.theme === theme).declaration]));
  const box = r => relativeBox(r,origin,true), {style,rect}=reads(), declarations=new Map();
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
  const rules=styleRules({referencesOnly:true,resolveNesting:true});
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
    const {range,rects}=textRects(node); if (!rects.length) return null;
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
      identities.push(identityNode(node,paths.get(node),paths.get(node.parentElement)??null,own,style(node),neutralCandidates.has(node)));
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
    return { identities, nodes, references: [...new Map(references.map(ref => [JSON.stringify(ref), ref])).values()], texts, paints };
  } finally { probe.remove(); }
}
