export function implementationTexts(root, clip) {
  const bounds = root.getBoundingClientRect();
  const origin = clip ? { left: clip.x - scrollX, top: clip.y - scrollY, right: clip.x - scrollX + clip.width, bottom: clip.y - scrollY + clip.height } : bounds;
  const texts = [];
  const measure = document.createElement('canvas').getContext('2d');
  const visible = owner => {
    for (let el = owner; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const hidden = owner.closest('[aria-hidden="true"]');
    return (!hidden || hidden === root || !root.contains(hidden)) && !owner.closest('script, style, .sr-only');
  };
  const inside = (box, owner) => {
    let left = origin.left, right = origin.right, top = origin.top, bottom = origin.bottom;
    for (let el = owner; el; el = el.parentElement) {
      const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    }
    return box.left >= left - 0.5 && box.right <= right + 0.5 && (box.top + box.bottom) / 2 >= top && (box.top + box.bottom) / 2 <= bottom;
  };
  const push = (text, box, owner, style = getComputedStyle(owner)) => {
    if (!inside(box, owner)) return;
    texts.push({ text, x: box.left - origin.left, y: box.top - origin.top, width: box.right - box.left, height: box.bottom - box.top,
      space: (measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, measure.measureText(' ').width), anchor: style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start', fill: style.color, size: style.fontSize, weight: style.fontWeight, family: style.fontFamily });
  };
  const linesFor = node => {
    const result=[];
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
      result.push({content,box});
    }
    return result;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const owner=node.parentElement;
    if (!node.textContent.trim() || !owner || owner.closest('input,textarea') || !visible(owner)) continue;
    for (const {content,box} of linesFor(node)) push(content,box,owner);
  }
  const canvas = document.createElement('canvas').getContext('2d');
  const fields='input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel], input[type=number], textarea';
  for (const input of [...(root.matches(fields) ? [root] : []), ...root.querySelectorAll(fields)]) {
    if (!visible(input)) continue;
    const raw = input.value || input.placeholder || '';
    const content = raw.replace(/\s+/g, ' ').trim();
    if (!content) continue;
    const rect = input.getBoundingClientRect(), style = getComputedStyle(input, input.value ? null : '::placeholder');
    if (rect.width < 1) continue;
    if (input.tagName === 'TEXTAREA') {
      const box=getComputedStyle(input), mirror=document.createElement('div');
      Object.assign(mirror.style,{position:'fixed',visibility:'hidden',left:(rect.left+parseFloat(box.borderLeftWidth)+parseFloat(box.paddingLeft)-input.scrollLeft)+'px',top:(rect.top+parseFloat(box.borderTopWidth)+parseFloat(box.paddingTop)-input.scrollTop)+'px',width:(input.clientWidth-parseFloat(box.paddingLeft)-parseFloat(box.paddingRight))+'px',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,whiteSpace:input.wrap==='off'?'pre':'pre-wrap',overflowWrap:'break-word'});
      mirror.textContent=raw;document.body.append(mirror);
      for (const {content,box} of linesFor(mirror.firstChild)) push(content,box,input,style);
      mirror.remove();continue;
    }
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const box = getComputedStyle(input), height = parseFloat(style.fontSize) * 1.2;
    const left = rect.left + parseFloat(box.borderLeftWidth) + parseFloat(box.paddingLeft);
    const top = input.tagName === 'TEXTAREA' ? rect.top + parseFloat(box.borderTopWidth) + parseFloat(box.paddingTop) : rect.top + rect.height / 2 - height / 2;
    push(content, { left, right: left + canvas.measureText(content).width, top, bottom: top + height }, input, style);
  }
  const merged = [];
  for (const item of texts.sort((a,b) => a.y - b.y || a.x - b.x)) {
    const previous = merged.findLast(p => Math.abs(p.y + p.height/2 - item.y - item.height/2) < 1 && item.x >= p.x + p.width - .5 && item.x - p.x - p.width < Math.max(p.space, item.space) - .1);
    if (previous) { const gap = item.x - previous.x - previous.width; previous.text += (gap > .5 ? ' ' : '') + item.text; previous.width = item.x + item.width - previous.x; }
    else merged.push({...item});
  }
  return { box: { x: origin.left + scrollX, y: origin.top + scrollY, width: origin.right - origin.left, height: origin.bottom - origin.top }, texts: merged };
}
