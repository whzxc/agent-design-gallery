import { icon } from './icons.js';
// Retain screen-sized text; pure pans translate one layer until the camera settles.
export function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
// Candidate y is a text center; collision bounds include optional caption padding.
export function placeLabels(candidates, obstacles, width, height, measure) {
  const occupied = [...obstacles], result = [];
  const sized = candidate => {
    const parts = candidate.parts.map(part => ({ ...part, width: measure(part) + (part.copyText === undefined || part.copyIcon === false ? 0 : 16) }));
    const w = parts.reduce((sum, p) => sum + p.width + (p.gap ?? 0), 0) + (candidate.paddingRight ?? 0);
    const h = candidate.height ?? Math.max(...parts.map(p => p.size)) * 1.2;
    return { ...candidate, parts, width: w, height: h, y: candidate.y - h / 2 };
  };
  const fits = label => {
    const box = label.within;
    return label.width <= label.slot && label.x >= 0 && label.y >= 0 && label.x + label.width <= width && label.y + label.height <= height &&
      (!box || (label.x >= box.x && label.y > box.y + 2 && label.x + label.width < box.x + box.width && label.y + label.height <= box.y + box.height)) &&
      !occupied.some(box => overlaps(label, box));
  };
  for (const batch of candidates) {
    const labels = (Array.isArray(batch) ? batch : [batch]).map(candidate => {
      let parts = candidate.parts, label = sized(candidate);
      while (!fits(label) && parts.some(p => p.optional)) {
        const last = parts.findLastIndex(p => p.optional);
        parts = parts.filter((_, i) => i !== last);
        label = sized({...candidate, parts});
      }
      if (!fits(label) && parts.some(p => p.copyText !== undefined)) {
        label = sized({...candidate,parts:parts.map(p => p.copyText === undefined ? p : {...p,copyIcon:false})});
      }
      return label;
    });
    if (labels.some((label, i) => !fits(label) || labels.slice(0, i).some(other => overlaps(label, other)))) continue;
    occupied.push(...labels); result.push(...labels);
  }
  return result;
}
export class Labels {
  constructor(root, onCopyError) {
    this.root = root;
    this.onCopyError = onCopyError;
    this.layer = document.createElement('div');
    this.layer.className = 'label-layer';
    root.append(this.layer);
    this.anchor = null;
    this.nodes = new Map();
    this.metrics = new Map();
    this.context = document.createElement('canvas').getContext('2d');
  }
  pan(view) {
    if (!this.anchor || view.scale !== this.anchor.scale ||
        (this.pinned && (view.x !== this.anchor.x || view.y !== this.anchor.y)) ||
        Math.abs(view.x - this.anchor.x) > 32 || Math.abs(view.y - this.anchor.y) > 32) return false;
    this.layer.style.transform = `translate(${view.x - this.anchor.x}px,${view.y - this.anchor.y}px)`;
    return true;
  }
  update(candidates, obstacles, width, height, font, view) {
    this.anchor = { ...view };
    this.layer.style.transform = 'translate(0px,0px)';
    const shown = new Set();
    const measure = part => {
      const spec = `${part.weight ?? 400} ${part.size}px ${font}`, key = spec + '|' + part.text;
      if (!this.metrics.has(key)) { this.context.font = spec; this.metrics.set(key, this.context.measureText(part.text).width); }
      return this.metrics.get(key);
    };
    const placed = placeLabels(candidates, obstacles, width, height, measure);
    this.pinned = placed.some(label => label.pinned);
    for (const label of placed) {
      shown.add(label.id);
      let node = this.nodes.get(label.id);
      if (!node) { node = document.createElement('div'); node.className = 'canvas-label'; this.nodes.set(label.id, node); this.layer.append(node); }
      const signature = JSON.stringify(label.parts);
      if (node.dataset.signature !== signature) {
        node.replaceChildren(...label.parts.map(part => {
          const span = document.createElement(part.copyText !== undefined ? 'button' : part.timestamp ? 'time' : 'span'); span.textContent = part.text;
          if (part.copyText !== undefined) {
            span.type = 'button';
            span.className = 'label-copy';
            const glyph = document.createElement('span'); glyph.className = 'label-copy-icon';
            glyph.hidden = part.copyIcon === false;
            const feedback = copied => {
              span.toggleAttribute('data-copied', copied);
              glyph.innerHTML = icon(copied ? 'check' : 'copy', 12);
              span.setAttribute('aria-label', copied ? `Copied ${part.copyText}` : `Copy ${part.copyText} name`);
              span.title = copied ? 'Copied' : 'Copy name';
            };
            feedback(false); span.append(glyph);
            for (const event of ['pointerdown','pointerup','dblclick']) span.addEventListener(event, e => e.stopPropagation());
            span.onkeydown = e => {if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()};
            let timer;
            span.onclick = async e => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(part.copyText);
                this.onCopyError?.(null);
                feedback(true);clearTimeout(timer);timer=setTimeout(()=>feedback(false),1200);
              } catch (error) {this.onCopyError?.(error)}
            };
          }
          if (part.timestamp) {span.dateTime = part.timestamp;span.title = part.title;span.style.pointerEvents = 'auto'}
          Object.assign(span.style, { fontSize: `${part.size}px`, fontWeight: part.weight ?? 400, color: part.color, marginLeft: `${part.gap ?? 0}px` });
          return span;
        }));
        node.dataset.signature = signature;
      }
      if (node.hidden) node.hidden = false;
      node.style.transform = `translate(${label.x}px,${label.y}px)`;
      const height = `${label.height}px`;
      if (node.style.height !== height) node.style.height = height;
    }
    for (const [id, node] of this.nodes) if (!shown.has(id) && !node.hidden) node.hidden = true;
  }
  clear() { this.layer.replaceChildren(); this.nodes.clear(); this.metrics.clear(); this.anchor = null; }
}
