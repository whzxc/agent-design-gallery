// Functions executed in Chromium. Adapted from ARC (MIT; see LICENSE).
export function inspectDocument(tokenNames) {
  const visible = el => {
    if (el.closest('defs')) return false;
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  };
  const svg = document.documentElement;
  const problems = [];
  const defined = new Set(tokenNames);
  const generated = new Set();
  let inRegion = false;
  for (const child of svg.childNodes) {
    if (child.nodeType === Node.COMMENT_NODE && child.textContent.trim() === 'design:tokens') inRegion = true;
    if (inRegion) generated.add(child);
    if (child.nodeType === Node.COMMENT_NODE && child.textContent.trim() === '/design:tokens') inRegion = false;
  }
  const label = el => {
    const owner = el.closest('[data-component]');
    const where = owner ? `${owner.dataset.component}/${owner.dataset.form ?? '?'} ` : '';
    const text = el.tagName === 'text' ? ` "${el.textContent.trim().slice(0, 32)}"` : '';
    return `${where}<${el.tagName}${text}>`;
  };
  const paints = ['fill', 'stroke', 'stop-color', 'flood-color', 'color'];
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    if (!el.closest('[data-design-tokens]')) {
      const raw = el.tagName === 'style' ? el.textContent : [...el.attributes].map(a => a.value).join(' ');
      for (const match of raw.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(match[1])) problems.push(`${label(el)} references undefined token ${match[1]}`);
      }
    }
    if (el.tagName === 'style' && !generated.has(el)) {
      const inspectRules = rules => {
        for (const rule of rules) {
          if (rule.cssRules) inspectRules(rule.cssRules);
          if (!rule.style || !rule.selectorText) continue;
          let targets;
          try { targets = [...svg.querySelectorAll(rule.selectorText)]; if (svg.matches(rule.selectorText)) targets.unshift(svg); } catch { continue; }
          if (!targets.some(target => !target.closest('[data-brand]'))) continue;
          for (const property of paints) {
            const value = rule.style.getPropertyValue(property).trim();
            if (value && !/^(none|transparent|currentcolor|inherit)$/i.test(value) && !/^(var|url)\(/.test(value)) problems.push(`<style> paints ${property} with literal ${value}; use a token`);
          }
        }
      };
      const sheet = [...document.styleSheets].find(sheet => sheet.ownerNode === el);
      if (sheet) inspectRules(sheet.cssRules);
    }
    if (el.closest('style, [data-design-tokens], [data-brand]')) continue;
    for (const property of paints) {
      for (const raw of [el.getAttribute(property), el.style.getPropertyValue(property)]) {
        const value = raw?.trim();
        if (!value || /^(none|transparent|currentcolor|inherit)$/i.test(value) || value.startsWith('url(')) continue;
        if (!/^var\(--[\w-]+\)$/.test(value)) problems.push(`${label(el)} paints ${property} with literal ${value}; use a token`);
      }
    }
  }
  const canvas = svg.getBoundingClientRect();
  const texts = [...svg.querySelectorAll('text')].filter(t => !t.closest('[data-brand], defs') && visible(t));
  const boxes = texts.map(t => t.getBoundingClientRect());
  texts.forEach((t, i) => {
    const b = boxes[i];
    if (b.left < canvas.left - 0.5 || b.right > canvas.right + 0.5 || b.top < canvas.top - 0.5 || b.bottom > canvas.bottom + 0.5) problems.push(`${label(t)} extends outside the canvas`);
    for (let j = i + 1; j < texts.length; j++) {
      const o = boxes[j];
      if (Math.min(b.right, o.right) - Math.max(b.left, o.left) > 0.5 && Math.min(b.bottom, o.bottom) - Math.max(b.top, o.top) > 0.5) problems.push(`${label(t)} overlaps ${label(texts[j])}`);
    }
  });
  const instances = [];
  for (const group of svg.querySelectorAll('[data-component]')) {
    if (group.closest('defs') || !visible(group)) continue;
    const container = [...group.children].find(child => child.tagName === 'rect');
    const own = [...group.querySelectorAll('text')].filter(t => t.closest('[data-component]') === group && visible(t));
    if (container) {
      const r = container.getBoundingClientRect();
      for (const t of own) {
        const b = t.getBoundingClientRect(), middle = (b.top + b.bottom) / 2;
        if (middle < r.top || middle > r.bottom) continue;
        if (b.left < r.left - 0.5 || b.right > r.right + 0.5 || b.top < r.top - 0.5 || b.bottom > r.bottom + 0.5) problems.push(`${label(t)} overflows its ${group.dataset.component} container`);
      }
    }
    instances.push({
      component: group.dataset.component,
      form: group.dataset.form,
      nested: !!group.parentElement.closest('[data-component]'),
      at: `${group.dataset.component}/${group.dataset.form ?? '?'} at ${group.getAttribute('transform') ?? 'origin'}`,
      signature: {
        container: container ? { height: container.getAttribute('height'), fluid: container.getAttribute('data-fluid') === 'height', rx: getComputedStyle(container).rx, fill: getComputedStyle(container).fill, stroke: getComputedStyle(container).stroke, filter: getComputedStyle(container).filter.replace(/url\(.*#/, 'url(#') } : null,
        text: [...new Set(own.map(t => [getComputedStyle(t).fill, getComputedStyle(t).fontSize, getComputedStyle(t).fontWeight, getComputedStyle(t).fontFamily].join(' ')))].sort(),
      },
    });
  }
  for (const frame of svg.querySelectorAll('[data-part^="frame-"]')) {
    const component = frame.querySelector('[data-component]');
    const shell = component?.firstElementChild;
    if (!shell || shell.tagName !== 'rect') problems.push(`${frame.dataset.part} has no component shell; make the first component start with a container rect`);
    if (frame.hasAttribute('data-viewport') || frame.hasAttribute('data-origin')) {
      const viewport = frame.dataset.viewport?.match(/^([1-9]\d*)x([1-9]\d*)$/);
      const origin = frame.dataset.origin?.trim().split(/\s+/).map(Number);
      const box = shell?.getBoundingClientRect();
      if (!viewport || origin?.length !== 2 || !origin.every(Number.isFinite) || origin.some(n => n < 0) || !box ||
          origin[0] + box.width > Number(viewport[1]) + 0.5 || origin[1] + box.height > Number(viewport[2]) + 0.5) {
        problems.push(`${frame.dataset.part} origin and size do not fit declared viewport; set data-viewport and data-origin to contain the frame shell`);
      }
    }
  }
  return { problems, instances };
}

export function designFrame(part) {
  const frame = [...document.querySelectorAll('[data-part]')].find(el => el.dataset.part === part);
  if (!frame) return null;
  const shell = frame.querySelector('[data-component]')?.firstElementChild;
  if (!shell || shell.tagName !== 'rect') throw new Error('Frame needs a component shell; add its container rect');
  const origin = shell.getBoundingClientRect();
  const texts = [...frame.querySelectorAll('text')].filter(t => !t.classList.contains('note') && t.textContent.trim() && t.getBoundingClientRect().width > 0 && getComputedStyle(t).visibility !== 'hidden').map(t => {
    const b = t.getBoundingClientRect();
    return { text: t.textContent.replace(/\s+/g, ' ').trim(), x: b.left - origin.left, y: b.top - origin.top, width: b.width, height: b.height, anchor: getComputedStyle(t).textAnchor };
  });
  return { box: { x: origin.left, y: origin.top, width: origin.width, height: origin.height }, texts, fixture: frame.dataset.fixture, viewport: frame.dataset.viewport, origin: frame.dataset.origin };
}

export function implementationTexts(root, clip) {
  const bounds = root.getBoundingClientRect();
  const origin = clip ? { left: clip.x - scrollX, top: clip.y - scrollY, right: clip.x - scrollX + clip.width, bottom: clip.y - scrollY + clip.height } : bounds;
  const texts = [];
  const visible = owner => {
    for (let el = owner; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return !owner.closest('script, style, .sr-only, [aria-hidden="true"]');
  };
  const inside = (box, owner) => {
    let left = origin.left, right = origin.right, top = origin.top, bottom = origin.bottom;
    for (let el = owner; el; el = el.parentElement) {
      const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return box.left >= left - 0.5 && box.right <= right + 0.5 && box.top >= top - 0.5 && box.bottom <= bottom + 0.5;
  };
  const push = (text, box, owner, style = getComputedStyle(owner)) => {
    if (!inside(box, owner)) return;
    texts.push({ text, x: box.left - origin.left, y: box.top - origin.top, width: box.right - box.left, height: box.bottom - box.top,
      fill: style.color, size: style.fontSize, weight: style.fontWeight, family: style.fontFamily });
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner = node.parentElement;
    if (!node.textContent.trim() || !owner || !visible(owner)) continue;
    const range = document.createRange(), lines = [];
    for (let index = 0; index < node.length; index++) {
      range.setStart(node, index); range.setEnd(node, index + 1);
      const rect = [...range.getClientRects()].find(r => r.width > 0 && r.height > 1);
      if (!rect) continue;
      let line = lines.at(-1);
      if (!line || Math.abs(line.top - rect.top) >= rect.height / 2) {
        line = { text: '', top: rect.top, bottom: rect.bottom, chars: [] }; lines.push(line);
      }
      line.text += node.data[index]; line.chars.push({ index, rect }); line.bottom = Math.max(line.bottom, rect.bottom);
    }
    for (const line of lines) {
      const content = line.text.replace(/\s+/g, ' ').trim();
      if (!content) continue;
      const chars = line.chars.filter(({ index }) => !/\s/.test(node.data[index]));
      const box = { left: Math.min(...chars.map(c => c.rect.left)), right: Math.max(...chars.map(c => c.rect.right)), top: line.top, bottom: line.bottom };
      push(content, box, owner);
    }
  }
  const canvas = document.createElement('canvas').getContext('2d');
  for (const input of root.querySelectorAll('input[placeholder]:placeholder-shown, textarea[placeholder]:placeholder-shown')) {
    if (!visible(input)) continue;
    const rect = input.getBoundingClientRect(), style = getComputedStyle(input, '::placeholder');
    if (rect.width < 1) continue;
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const box = getComputedStyle(input), height = parseFloat(style.fontSize) * 1.2;
    const left = rect.left + parseFloat(box.borderLeftWidth) + parseFloat(box.paddingLeft);
    const top = input.tagName === 'TEXTAREA' ? rect.top + parseFloat(box.borderTopWidth) + parseFloat(box.paddingTop) : rect.top + rect.height / 2 - height / 2;
    push(input.placeholder.replace(/\s+/g, ' ').trim(), { left, right: left + canvas.measureText(input.placeholder).width, top, bottom: top + height }, input, style);
  }
  return { box: { x: origin.left + scrollX, y: origin.top + scrollY, width: origin.right - origin.left, height: origin.bottom - origin.top }, texts };
}
