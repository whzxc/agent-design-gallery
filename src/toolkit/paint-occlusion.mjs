// Playwright serializes reader functions without their module scope. Embed the
// shared browser helper once in each reader so check and compare use one rule.
export function withPaintOcclusion(reader) {
  return new Function(`return function ${reader.name}(...args) {
    return (${reader})((${paintOcclusion}), ...args);
  }`)();
}

function paintOcclusion(style, backgroundAlpha) {
  const covers = [], effects = new Map();
  let canvas;
  const opaqueEffects = el => {
    if (!el) return true;
    if (!effects.has(el)) {
      const s = style(el);
      effects.set(el, Number(s.opacity) === 1 && s.filter === 'none' && s.clipPath === 'none' &&
        s.maskImage === 'none' && s.mixBlendMode === 'normal' && opaqueEffects(el.parentElement));
    }
    return effects.get(el);
  };
  const opaqueColor = value => {
    // Canvas channels can round near-opaque colors to 1. Honor explicit alpha.
    if (value.startsWith('rgba(') || value.includes('/')) {
      const alpha = value.match(/(?:,|\/)\s*([\d.e+-]+)(%)?\s*\)$/i);
      return !!alpha && Number(alpha[1]) === (alpha[2] ? 100 : 1);
    }
    if (backgroundAlpha) return backgroundAlpha(value) === 1;
    canvas ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    canvas.globalCompositeOperation = 'copy';
    canvas.fillStyle = value;
    canvas.fillRect(0, 0, 1, 1);
    return canvas.getImageData(0, 0, 1, 1).data[3] === 255;
  };
  function addCover(el, rect) {
    const s = style(el);
    // A border-box background has the same rounded hit shape as its element.
    if (el instanceof HTMLElement && s.backgroundClip === 'border-box' && opaqueColor(s.backgroundColor) && opaqueEffects(el))
      covers.push({ el, rect });
  }
  function read(root, subjects, inspect) {
    if (!covers.length) return inspect(() => false);
    // Hit testing omits inert and pointer-events:none content, though it paints.
    const restored = [], inert = [];
    for (let el = root; el; el = el.parentElement) if (el.hasAttribute('inert')) inert.push([el, el.getAttribute('inert')]);
    for (const el of root.querySelectorAll('[inert]')) inert.push([el, el.getAttribute('inert')]);
    for (const [el] of inert) el.removeAttribute('inert');
    for (const el of new Set([...subjects, ...covers.map(cover => cover.el)])) {
      if (style(el).pointerEvents === 'none') {
        restored.push([el, el.getAttribute('style')]);
        el.style.setProperty('pointer-events', 'auto', 'important');
      }
    }
    const hits = new Map();
    const paintStack = (x, y) => {
      const key = `${x},${y}`;
      if (!hits.has(key)) hits.set(key, document.elementsFromPoint(x, y));
      return hits.get(key);
    };
    const occluded = (el, rect) => {
      const dx = Math.min(.01, (rect.right - rect.left) / 100), dy = Math.min(.01, (rect.bottom - rect.top) / 100);
      const points = [[rect.left + dx, rect.top + dy], [rect.right - dx, rect.top + dy],
        [rect.left + dx, rect.bottom - dy], [rect.right - dx, rect.bottom - dy],
        [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]];
      return covers.some(cover => {
        if (cover.el.contains(el) || cover.rect.left > rect.left || cover.rect.right < rect.right ||
            cover.rect.top > rect.top || cover.rect.bottom < rect.bottom) return false;
        const samples = points.map(([x, y]) => {
          const stack = paintStack(x, y);
          return [stack.indexOf(el), stack.indexOf(cover.el)];
        });
        // One opaque cover must hit every point and be in front wherever the
        // text owner also hits. Absence alone never establishes paint order.
        return samples.every(([subject, foreground]) => foreground >= 0 && (subject < 0 || foreground < subject)) &&
          samples.some(([subject, foreground]) => subject >= 0 && foreground < subject);
      });
    };
    try { return inspect(occluded); }
    finally {
      for (const [el, authored] of restored) {
        // Flush a lazily created CSSOM attribute before removing it.
        el.getAttribute('style');
        if (authored === null) el.removeAttribute('style');
        else el.setAttribute('style', authored);
      }
      for (const [el, authored] of inert) el.setAttribute('inert', authored);
    }
  }
  return { addCover, read };
}
