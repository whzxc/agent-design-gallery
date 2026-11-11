import { createHash } from 'node:crypto';
import { CliError } from '../cli-output.mjs';

/** Runs only in pages contributing part evidence. */
export async function collectPartSnapshot({ selector, tokens, scale, ref, theme }) {
  const frame = document.querySelector('[data-adg-frame]');
  let roots;
  try { roots = selector === null ? [...frame.children] : [...frame.querySelectorAll(selector)]; }
  catch { return { referenceError: `Invalid parent selector ${selector}.` }; }
  if (roots.length !== 1) return { referenceError: `Expected one target for ${selector ?? 'the part root'}, found ${roots.length}.` };
  const root = roots[0], origin = root.getBoundingClientRect(), frameBox = frame.getBoundingClientRect();
  if (!origin.width || !origin.height || getComputedStyle(root).visibility !== 'visible') return { referenceError: 'The parent/part target must be visible.' };
  const clean = number => number === 0 ? 0 : number;
  const box = rect => ({ x: clean(rect.x - origin.x), y: clean(rect.y - origin.y), width: rect.width, height: rect.height });
  const cssCrop = { x: origin.x - frameBox.x, y: origin.y - frameBox.y, width: origin.width, height: origin.height };
  const left = Math.floor(cssCrop.x * scale), top = Math.floor(cssCrop.y * scale);
  const deviceCrop = { x: left, y: top, width: Math.ceil((cssCrop.x + origin.width) * scale) - left, height: Math.ceil((cssCrop.y + origin.height) * scale) - top };
  const fractionalOrigin = { x: cssCrop.x * scale - left, y: cssCrop.y * scale - top };
  const nodes = [root, ...root.querySelectorAll('*')], paths = new Map(nodes.map((node, index) => [node, String(index)]));
  const ids = new Map(nodes.filter(node => node.id).map(node => [node.id, `node-${paths.get(node)}`]));
  const unsupported = [], resources = [], resourceCache = new Map(), decoded = new Map();
  const internalIds = value => value.replace(/url\(["']?#([^)'"\s]+)["']?\)/g, (_, id) => `url(#${ids.get(id) ?? id})`);
  const resource = async url => {
    if (resourceCache.has(url)) return resourceCache.get(url);
    let content = url;
    if (!url.startsWith('data:')) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        content = `data:${response.headers.get('content-type') ?? ''};base64,${btoa(binary)}`;
      } catch { unsupported.push({ path: 'resources', property: 'bytes', value: url }); }
    }
    const id = `resource-${resources.length}`;
    const kind = /^data:image\/svg\+xml/i.test(content) ? 'vector' : /^data:(?:image\/|application\/octet-stream)/i.test(content) ? 'raster' : 'font';
    const entry = { id, source: url.startsWith('data:') ? `embedded:${kind}` : url, kind, contentIdentity: content, intrinsicWidth: null, intrinsicHeight: null };
    if (kind === 'raster') {
      const comma = content.indexOf(',');
      const bytes = content.slice(0, comma).includes(';base64') ? atob(content.slice(comma + 1)) : decodeURIComponent(content.slice(comma + 1));
      if (bytes.startsWith('GIF8') && /NETSCAPE2\.0|ANIMEXTS1\.0/.test(bytes) || bytes.startsWith('\x89PNG') && bytes.includes('acTL') || bytes.startsWith('RIFF') && bytes.includes('ANIM')) unsupported.push({ path: 'resources', property: 'paint', value: 'animated raster' });
    }
    resources.push(entry); resourceCache.set(url, entry);
    return entry;
  };
  const normalizeStyle = async style => {
    const values = {};
    for (const property of [...style].sort()) {
      let value = internalIds(style.getPropertyValue(property));
      if (/url\(/.test(value)) {
        for (const match of [...value.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)]) {
          if (match[1].startsWith('#')) continue;
          const entry = await resource(match[1]);
          value = value.replace(match[0], `url(${entry.id})`);
        }
      }
      values[property] = value;
    }
    return values;
  };
  const inspectPaint = (style, path) => {
    for (const property of ['filter', 'backdrop-filter', 'clip-path', 'mask-image', 'mix-blend-mode', 'perspective']) {
      const value = style.getPropertyValue(property);
      if (value && !['none', 'normal'].includes(value)) unsupported.push({ path, property, value });
    }
  };
  const paintProperty = property => /color|background|fill|stroke|shadow|opacity|filter|blend|mask|clip-path/.test(property);
  const ignored = /^(?:--|animation|transition|cursor$|pointer-events$|user-select$|touch-action$|scroll-behavior$|caret-color$)/;
  const tokenRules = [];
  const visitRules = rules => {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches || rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue;
      if (rule.selectorText && rule.style) tokenRules.push(rule);
      if (rule.cssRules) visitRules(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) visitRules(sheet.cssRules);
  const elements = [], texts = [], rasters = [], edgeBoxes = [];
  for (const node of nodes) {
    const path = paths.get(node), style = getComputedStyle(node), rect = node.getBoundingClientRect();
    inspectPaint(style, path);
    if (node.matches('canvas,video,object,embed,foreignObject')) unsupported.push({ path, property: 'paint', value: node.localName });
    const computedStyle = await normalizeStyle(style), layout = {}, paint = {};
    for (const [property, value] of Object.entries(computedStyle)) {
      if (!ignored.test(property)) (paintProperty(property) ? paint : layout)[property] = value;
    }
    const attributes = {};
    for (const attr of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
      if (['class', 'style', 'id'].includes(attr.name) || attr.name.startsWith('data-')) continue;
      let value = internalIds(attr.value);
      if (['src', 'href', 'xlink:href'].includes(attr.name) && !value.startsWith('#') && node.matches('img,image')) value = (await resource(value)).id;
      if (value.startsWith('#') && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
      attributes[attr.name] = value;
    }
    if (node.matches('input,textarea,select')) {
      attributes.value = node.value;
      if ('checked' in node) attributes.checked = String(node.checked);
    }
    for (const property of [...node.style].filter(name => name.startsWith('--'))) layout[property] = node.style.getPropertyValue(property);
    const tokenExpressions = [];
    for (const declaration of [...tokenRules.filter(rule => { try { return node.matches(rule.selectorText); } catch { return false; } }).map(rule => rule.style), node.style]) {
      for (const property of declaration) {
        const expression = declaration.getPropertyValue(property);
        if (property.startsWith('--') || expression.includes('var(')) tokenExpressions.push({ property, expression, resolved: style.getPropertyValue(property) });
      }
    }
    const pseudo = {};
    for (const name of ['before', 'after']) {
      const style = getComputedStyle(node, `::${name}`);
      pseudo[name] = ['none', 'normal'].includes(style.content) ? null : { content: style.content, computedStyle: await normalizeStyle(style) };
      if (pseudo[name]) inspectPaint(style, `${path}::${name}`);
      if (/counter\(|attr\(/.test(style.content)) unsupported.push({ path, property: 'content', value: style.content });
    }
    elements.push({ path, parentPath: node === root ? null : paths.get(node.parentElement), tag: node.localName, namespace: node.namespaceURI,
      attributes, childOrder: [...node.childNodes].filter(child => child.nodeType === 1 || child.nodeType === 3 && child.textContent.trim()).map((child, index) => child.nodeType === 1 ? paths.get(child) : `${path}/text-${index}`),
      box: box(rect), clientRects: [...node.getClientRects()].map(box), layout, paint, computedStyle, pseudo, tokenExpressions,
      owners: JSON.parse(node.getAttribute('data-adg-owners') ?? '[]') });
    for (const [index, child] of [...node.childNodes].entries()) {
      if (child.nodeType !== 3 || !child.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(child);
      const lines = [...range.getClientRects()].map(rect => ({ text: child.textContent, box: box(rect) }));
      texts.push({ path: `${path}/text-${index}`, parentPath: path, text: child.textContent, lines });
      edgeBoxes.push(...lines.map(line => line.box));
    }
    if (node instanceof SVGElement && /^(path|rect|circle|ellipse|polygon|polyline|line|text)$/.test(node.localName) || parseFloat(style.borderTopWidth) || parseFloat(style.borderRadius)) edgeBoxes.push(box(rect));
    if (!node.matches('img,image')) continue;
    const url = node.currentSrc || node.getAttribute('href') || node.getAttribute('xlink:href') || node.getAttribute('src');
    if (!url) continue;
    const entry = await resource(url);
    let image = decoded.get(url);
    if (!image) {
      image = new Image(); image.src = url;
      await image.decode(); decoded.set(url, image);
    }
    entry.intrinsicWidth = image.naturalWidth; entry.intrinsicHeight = image.naturalHeight;
    if (entry.kind === 'raster' && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0) {
      const transform = node instanceof SVGElement ? node.getScreenCTM() : new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      if (transform && (transform.b || transform.c || transform.a <= 0 || transform.d <= 0)) unsupported.push({ path, property: 'raster-transform', value: style.transform });
      rasters.push({ node, path, box: box(rect) });
    }
  }
  for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
    if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
    for (const match of rule.style.src.matchAll(/url\(["']?([^)'"\s]+)["']?\)/g)) await resource(match[1]);
  }
  let visible = { left: Math.max(origin.left, frameBox.left), top: Math.max(origin.top, frameBox.top), right: Math.min(origin.right, frameBox.right), bottom: Math.min(origin.bottom, frameBox.bottom) };
  const compositing = {}, backgrounds = [], clipShapes = [];
  for (let parent = root.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
    inspectPaint(style, 'ancestor');
    if (style.transform !== 'none') {
      const matrix = new DOMMatrixReadOnly(style.transform);
      if (!matrix.is2D || matrix.a !== 1 || matrix.b || matrix.c || matrix.d !== 1) unsupported.push({ path: 'ancestor', property: 'transform', value: style.transform });
    }
    if (style.opacity !== '1') compositing.opacity = String(Number(compositing.opacity ?? 1) * Number(style.opacity));
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') backgrounds.push(style.backgroundColor);
    if (style.backgroundImage !== 'none') {
      compositing.backgroundImages ??= [];
      compositing.backgroundImages.push({ box: box(rect), value: (await normalizeStyle(style))['background-image'] });
    }
    if (style.boxShadow !== 'none') {
      compositing.shadows ??= [];
      compositing.shadows.push({ box: box(rect), value: style.boxShadow });
    }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX + style.overflowY)) {
      const radii = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'].map(name => style.getPropertyValue(name));
      if (radii.some(radius => parseFloat(radius))) clipShapes.push({ box: box(rect), radii });
    }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { visible.left = Math.max(visible.left, rect.left + parent.clientLeft); visible.right = Math.min(visible.right, rect.left + parent.clientLeft + parent.clientWidth); }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { visible.top = Math.max(visible.top, rect.top + parent.clientTop); visible.bottom = Math.min(visible.bottom, rect.top + parent.clientTop + parent.clientHeight); }
  }
  const clipped = visible.left > origin.left || visible.top > origin.top || visible.right < origin.right || visible.bottom < origin.bottom;
  const clipping = clipped ? [{ x: visible.left - origin.left, y: visible.top - origin.top, width: Math.max(0, visible.right - visible.left), height: Math.max(0, visible.bottom - visible.top) }] : [];
  const backgroundCanvas = document.createElement('canvas'); backgroundCanvas.width = backgroundCanvas.height = 1;
  const backgroundContext = backgroundCanvas.getContext('2d');
  for (const color of backgrounds.reverse()) { backgroundContext.fillStyle = color; backgroundContext.fillRect(0, 0, 1, 1); }
  const backdrop = [...backgroundContext.getImageData(0, 0, 1, 1).data].join(',');
  const rasterMask = [];
  if (rasters.length) {
    const restored = nodes.map(node => [node, node.getAttribute('style')]);
    const inert = new Map(nodes.filter(node => node.hasAttribute('inert')).map(node => [node, node.getAttribute('inert')]));
    for (let node = root; node; node = node.parentElement) if (node.hasAttribute('inert')) inert.set(node, node.getAttribute('inert'));
    for (const [node] of inert) node.removeAttribute('inert');
    try {
      for (const node of nodes) node.style.setProperty('pointer-events', 'auto', 'important');
      for (const raster of rasters) {
        const r = raster.box;
        const x0 = Math.max(0, Math.floor(r.x * scale + fractionalOrigin.x)), y0 = Math.max(0, Math.floor(r.y * scale + fractionalOrigin.y));
        const x1 = Math.min(deviceCrop.width, Math.ceil((r.x + r.width) * scale + fractionalOrigin.x)), y1 = Math.min(deviceCrop.height, Math.ceil((r.y + r.height) * scale + fractionalOrigin.y));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const stack = document.elementsFromPoint(frameBox.x + (left + x + 0.5) / scale, frameBox.y + (top + y + 0.5) / scale);
          if (stack[0] === raster.node) rasterMask.push(y * deviceCrop.width + x);
        }
      }
    } finally {
      for (const [node, style] of restored) { node.getAttribute('style'); if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style); }
      for (const [node, value] of inert) node.setAttribute('inert', value);
    }
  }
  return { snapshotVersion: 1, ref, theme, size: { width: origin.width, height: origin.height, pixelWidth: deviceCrop.width, pixelHeight: deviceCrop.height },
    origin: { x: origin.x, y: origin.y }, elements, texts,
    tokens: tokens.map(([name, declaration]) => ({ name, declaration, resolved: getComputedStyle(root).getPropertyValue(name).trim() })), resources,
    contextEffects: { clipping, clipShapes, compositing, backdrop },
    cssCrop, deviceCrop, fractionalOrigin, clipped,
    frameClipped: origin.left < frameBox.left || origin.top < frameBox.top || origin.right > frameBox.right || origin.bottom > frameBox.bottom,
    edgeBoxes, rasterMask, unsupported,
    frameAligned: selector !== null || cssCrop.x === 0 && cssCrop.y === 0 && origin.width === frameBox.width && origin.height === frameBox.height };
}

export function normalizeSnapshot(snapshot) {
  for (const resource of snapshot.resources) {
    let content = resource.contentIdentity;
    if (content.startsWith('data:')) {
      const comma = content.indexOf(',');
      content = content.slice(0, comma).includes(';base64') ? Buffer.from(content.slice(comma + 1), 'base64') : Buffer.from(decodeURIComponent(content.slice(comma + 1)));
    }
    resource.contentIdentity = createHash('sha256').update(content).digest('hex');
  }
  return snapshot;
}

export function snapshotFindings(before, after, context = 'part') {
  const findings = [];
  const compare = (a, b, path, kind, code) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(a[key], b[key], `${path}.${key}`, kind, code);
    } else findings.push({ code, kind, path: context, property: path, before: a ?? null, after: b ?? null });
  };
  compare(before.tokens, after.tokens, 'tokens', 'color', 'TOKEN_CHANGED');
  compare(before.resources, after.resources, 'resources', 'resource', 'RESOURCE_CHANGED');
  compare(before.contextEffects.clipping, after.contextEffects.clipping, 'clipping', 'layout', 'CLIPPING_CHANGED');
  compare(before.contextEffects.clipShapes, after.contextEffects.clipShapes, 'clipShapes', 'layout', 'CLIPPING_CHANGED');
  compare(before.contextEffects.compositing, after.contextEffects.compositing, 'compositing', 'color', 'COLOR_CHANGED');
  compare(before.contextEffects.backdrop, after.contextEffects.backdrop, 'backdrop', 'color', 'COLOR_CHANGED');
  const count = Math.max(before.elements.length, after.elements.length);
  for (let index = 0; index < count; index++) {
    const a = before.elements[index], b = after.elements[index];
    if (!a || !b) { findings.push({ code: a ? 'ELEMENT_REMOVED' : 'ELEMENT_ADDED', kind: 'element', path: context, property: `elements.${index}`, before: a ?? null, after: b ?? null }); continue; }
    for (const property of ['tag', 'namespace', 'attributes', 'childOrder']) compare(a[property], b[property], `elements.${index}.${property}`, 'element', 'ELEMENT_CHANGED');
    for (const property of ['box', 'clientRects', 'layout']) compare(a[property], b[property], `elements.${index}.${property}`, 'layout', 'LAYOUT_CHANGED');
    compare(a.paint, b.paint, `elements.${index}.paint`, 'color', 'COLOR_CHANGED');
    compare(a.pseudo, b.pseudo, `elements.${index}.pseudo`, 'element', 'ELEMENT_CHANGED');
  }
  compare(before.texts, after.texts, 'texts', 'element', 'TEXT_CHANGED');
  return findings;
}

/** Two equal observations and an unchanged post-capture observation share one deadline. */
export async function settlePart(read, capture, { now = () => performance.now(), wait = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const start = now();
  let previous;
  for (;;) {
    const snapshot = await read(), state = JSON.stringify(snapshot);
    if (state === previous) {
      const png = await capture(), after = await read();
      if (JSON.stringify(after) === state && now() - start < 5000) return { snapshot: after, png };
      previous = JSON.stringify(after);
    } else previous = state;
    if (now() - start >= 5000) throw new CliError('DIFF_UNSETTLED', 'Part snapshots did not settle within five seconds.');
    await wait();
  }
}
