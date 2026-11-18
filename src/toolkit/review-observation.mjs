/** Collect post-layout paint inputs in the design document. Runs inside Chromium. */
export async function observeFrame() {
  await document.fonts.ready;
  await Promise.allSettled([...document.images].map(image => image.decode()));
  const root = document.querySelector('[data-adg-frame]');
  const { relativeBox, textRects, reads } = globalThis.__adgFramePrimitives;
  const { style: styleFor, rect: rectFor } = reads();
  const origin = rectFor(root), paints = [], uncertain = new Set();
  const box = rect => relativeBox(rect, origin);
  const onscreen = rect => rect.width > 0 && rect.height > 0 && rect.right > origin.left && rect.left < origin.right &&
    rect.bottom > origin.top && rect.top < origin.bottom;
  const typography = ['color', 'font-family', 'font-size', 'font-style', 'font-weight', 'font-stretch', 'font-feature-settings',
    'font-variation-settings', 'font-optical-sizing', 'font-kerning', 'font-variant', 'text-transform', 'text-shadow',
    'letter-spacing', 'word-spacing', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
    'text-decoration-thickness', 'text-underline-offset', 'text-overflow', 'direction', 'writing-mode',
    '-webkit-text-fill-color', '-webkit-text-stroke-width', '-webkit-text-stroke-color'];
  const composition = ['transform', 'opacity', 'z-index', 'overflow-x', 'overflow-y', 'filter', 'backdrop-filter',
    'mix-blend-mode', 'clip-path', 'mask-image', 'perspective', 'isolation', 'object-fit', 'object-position'];
  const svgPaint = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'paint-order', 'vector-effect',
    'opacity', 'transform', 'color', 'visibility', 'display', 'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity',
    'clip-path', 'mask-image', 'filter', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'd'];
  const properties = (style, names) => Object.fromEntries(names.map(name => [name, style.getPropertyValue(name)]));
  const transparent = color => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
  const sides = ['top', 'right', 'bottom', 'left'];
  const radii = ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'];
  function colorsAndBorders(style) {
    const result = {};
    if (!transparent(style.backgroundColor)) result['background-color'] = style.backgroundColor;
    if (style.backgroundImage !== 'none') Object.assign(result, properties(style, ['background-image', 'background-size',
      'background-position', 'background-repeat', 'background-origin', 'background-clip', 'background-blend-mode', 'background-attachment']));
    for (const side of sides) {
      const prefix = `border-${side}`;
      const width = style.getPropertyValue(`${prefix}-width`);
      const color = style.getPropertyValue(`${prefix}-color`);
      if (parseFloat(width) && !transparent(color)) {
        result[prefix] = [width, style.getPropertyValue(`${prefix}-style`), color].join(' ');
      }
    }
    if (style.boxShadow !== 'none') result['box-shadow'] = style.boxShadow;
    if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) && !transparent(style.outlineColor)) {
      Object.assign(result, properties(style, ['outline-width', 'outline-style', 'outline-color', 'outline-offset']));
    }
    if (Object.keys(result).length) Object.assign(result, properties(style, radii));
    return result;
  }

  function flags(style, node) {
    for (const property of ['filter', 'backdrop-filter', 'mix-blend-mode', 'clip-path', 'mask-image', 'border-image-source', 'perspective']) {
      const value = style.getPropertyValue(property);
      if (value && !['none', 'normal'].includes(value)) uncertain.add(property);
    }
    if (style.backgroundImage.includes('url(') && !style.backgroundImage.includes('data:')) uncertain.add('external background');
    if (style.clip !== 'auto' || style.backgroundClip === 'text' || style.contentVisibility !== 'visible') uncertain.add('clipping');
    if (node.matches('canvas,video,iframe,object,embed,foreignObject,svg use')) uncertain.add(node.localName);
  }

  function add(kind, rect, values) {
    paints.push({ kind, box: box(rect), values });
  }

  function svg(node) {
    const children = [node, ...node.querySelectorAll('*')];
    const ids = new Map(children.filter(child => child.id).map((child, index) => [child.id, `ref-${index}`]));
    const normalize = text => text.replace(/#([^\s)'";]+)/g, (raw, id) => ids.has(id) ? `#${ids.get(id)}` : raw);
    return children.map(child => {
      const style = styleFor(child);
      flags(style, child);
      const attrs = [...child.attributes].filter(({ name }) => name !== 'class' && name !== 'style' && name !== 'id' &&
        name !== 'role' && !name.startsWith('data-') && !name.startsWith('aria-'));
      const attributes = Object.fromEntries(attrs.map(({ name, value }) => [name, normalize(value)]).sort(([a], [b]) => a.localeCompare(b)));
      const text = /^(text|tspan|textPath)$/.test(child.localName) ? child.textContent : undefined;
      const appearance = Object.fromEntries(svgPaint.map(name => [name, normalize(style.getPropertyValue(name))]));
      return [child.localName, attributes, appearance, text];
    });
  }

  function visit(node) {
    const style = styleFor(node);
    if (style.display === 'none' || style.opacity === '0') return;
    if (style.contentVisibility === 'hidden') { uncertain.add('clipping'); return; }
    const rect = rectFor(node);
    const visible = style.visibility === 'visible' && onscreen(rect);
    if (!visible && style.visibility === 'visible' && (style.boxShadow !== 'none' || style.outlineStyle !== 'none' || style.filter !== 'none')) {
      uncertain.add('off-frame paint');
    }
    if (visible) {
      flags(style, node);
      const paint = colorsAndBorders(style);
      if (Object.keys(paint).length) add('paint', rect, paint);
      if (node instanceof SVGSVGElement) {
        add('svg', rect, { vector: svg(node), ...properties(style, composition) });
        return;
      }
      if (node instanceof HTMLImageElement) {
        const content = node.currentSrc || node.src;
        if (content && !content.startsWith('data:')) uncertain.add('external image');
        if (!node.complete || !node.naturalWidth) uncertain.add('image decode');
        add('image', rect, { content, intrinsic: [node.naturalWidth, node.naturalHeight], ...properties(style, composition) });
      }
      if (node.matches('input,textarea,select,progress,meter')) {
        uncertain.add('native control');
        add('control', rect, { type: node.type, value: node.type === 'password' ? '' : node.value,
          placeholder: node.placeholder, checked: node.checked, ...properties(style, typography) });
      }
      if (style.transform !== 'none' || style.opacity !== '1' || style.zIndex !== 'auto' || style.isolation === 'isolate' ||
          style.overflowX !== 'visible' || style.overflowY !== 'visible' || style.filter !== 'none' || style.clipPath !== 'none') {
        add('compositing', rect, { ...properties(style, composition), ...properties(style, radii) });
      }
      for (const pseudo of ['::before', '::after', '::marker']) {
        const appearance = getComputedStyle(node, pseudo);
        if (appearance.content === 'none' || appearance.content === 'normal') continue;
        if (appearance.display === 'none') continue;
        flags(appearance, node);
        uncertain.add('generated content');
        add(pseudo, rect, { content: appearance.content, ...colorsAndBorders(appearance), ...properties(appearance, typography),
          ...properties(appearance, ['position', 'width', 'height', 'inset', 'transform', 'opacity']) });
      }
    }
    for (const child of node.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) visit(child);
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() && style.visibility === 'visible') {
        const lines = textRects(child).rects.filter(onscreen);
        if (lines.length) add('text', lines[0], { text: child.textContent, lines: lines.map(box), ...properties(style, typography) });
      }
    }
  }
  if ([...document.styleSheets].some(sheet => [...sheet.cssRules].some(rule => rule instanceof CSSFontFaceRule))) uncertain.add('embedded or external font');
  visit(root);
  return { size: { width: origin.width, height: origin.height }, paints, uncertain: [...uncertain].sort() };
}
