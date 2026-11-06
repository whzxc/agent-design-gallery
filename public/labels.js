// A small retained DOM layer: canvas gestures update only visible label positions.
export function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
export class Labels {
  constructor(root) {
    this.root = root;
    this.nodes = new Map();
    this.metrics = new Map();
    this.context = document.createElement('canvas').getContext('2d');
  }
  update(candidates, obstacles, width, height, font) {
    const occupied = [...obstacles], shown = new Set();
    const measure = part => {
      const spec = `${part.weight ?? 400} ${part.size}px ${font}`, key = spec + '|' + part.text;
      if (!this.metrics.has(key)) { this.context.font = spec; this.metrics.set(key, this.context.measureText(part.text).width); }
      return this.metrics.get(key);
    };
    const sized = candidate => {
      const parts = candidate.parts.map(part => ({ ...part, width: measure(part) }));
      const w = parts.reduce((sum, p) => sum + p.width + (p.gap ?? 0), 0), h = Math.max(...parts.map(p => p.size)) * 1.2;
      return { ...candidate, parts, width: w, height: h, y: candidate.y - h / 2 };
    };
    const fits = label => label.width <= label.slot && label.x >= 0 && label.y >= 0 && label.x + label.width <= width && label.y + label.height <= height && !occupied.some(box => overlaps(label, box));
    for (const batch of candidates) {
      const labels = (Array.isArray(batch) ? batch : [batch]).map(sized);
      // A set's form captions are admitted together, including their mutual collisions.
      if (labels.some((label, i) => !fits(label) || labels.slice(0, i).some(other => overlaps(label, other)))) continue;
      for (const label of labels) {
        occupied.push(label); shown.add(label.id);
        let node = this.nodes.get(label.id);
        if (!node) { node = document.createElement('div'); node.className = 'canvas-label'; this.nodes.set(label.id, node); this.root.append(node); }
        const signature = JSON.stringify(label.parts);
        if (node.dataset.signature !== signature) {
          node.replaceChildren(...label.parts.map(part => {
            const span = document.createElement('span'); span.textContent = part.text;
            Object.assign(span.style, { fontSize: `${part.size}px`, fontWeight: part.weight ?? 400, color: part.color, marginLeft: `${part.gap ?? 0}px` });
            return span;
          }));
          node.dataset.signature = signature;
        }
        node.hidden = false;
        node.style.transform = `translate(${label.x}px,${label.y}px)`;
        node.style.height = `${label.height}px`;
      }
    }
    for (const [id, node] of this.nodes) if (!shown.has(id)) node.hidden = true;
  }
  clear() { this.root.replaceChildren(); this.nodes.clear(); this.metrics.clear(); }
}
