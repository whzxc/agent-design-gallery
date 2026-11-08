// Pure Float world geometry. Coordinates and gaps are SVG units.
export function bounds(boxes) {
  if (!boxes.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
export function rows(blocks, limit, gapX, gapY, nextWidth) {
  let x = 0, y = 0, height = 0;
  return blocks.map(block => {
    if (x && x + block.w > limit) { nextWidth?.(x + block.w); x = 0; y += height + gapY; height = 0; }
    const placed = { ...block, x, y };
    x += block.w + gapX; height = Math.max(height, block.h);
    return placed;
  });
}
export function skyline(blocks, limit, nextWidth, gapX = 64, gapY = 112) {
  const placed = [], result = [];
  // Pack tall blocks first, but keep returned identities in source order for
  // navigation, selection and incremental placement across geometry changes.
  const ordered = blocks.map((block, index) => ({ block, index }))
    .sort((a, b) => b.block.h - a.block.h || b.block.w - a.block.w || a.index - b.index);
  for (const { block, index } of ordered) {
    const candidates = [0, ...placed.map(p => p.x + p.w + gapX)].filter(x => { if (x + block.w <= limit) return true; nextWidth?.(x + block.w); return false; });
    const positions = candidates.map(x => ({ x, y: Math.max(0, ...placed.filter(p => x < p.x + p.w + gapX && x + block.w + gapX > p.x).map(p => p.y + p.h + gapY)) }));
    positions.sort((a, b) => a.y - b.y || a.x - b.x);
    result[index] = { ...block, ...positions[0] };
    placed.push(result[index]);
  }
  return result;
}
// Cache only the winning width, never source objects or placed coordinates.
// Repacking at that width gives fresh metadata after saves with unchanged geometry.
const widthChoices = new Map();
export function packingSnapshot() {return [...widthChoices];}
export function restorePacking(entries=[]) {
  for(const [key,width] of entries.slice(-32))
    if(typeof key==='string'&&key.length<=32768&&Number.isFinite(width)&&width>0)widthChoices.set(key,width);
  while(widthChoices.size>32)widthChoices.delete(widthChoices.keys().next().value);
}
const aspectPenalty = 0.6;
function chooseWidth(blocks, step, ratio, gapX, gapY) {
  if (!blocks.length) return [];
  const pack = (limit, nextWidth) => skyline(blocks, limit, nextWidth, gapX, gapY);
  const key = JSON.stringify(['area-skyline-v1', step, ratio, aspectPenalty, gapX, gapY, blocks.map(b => [b.kind, b.w, b.h])]);
  if (widthChoices.has(key)) return pack(widthChoices.get(key));
  const minimum = Math.max(...blocks.map(b => b.w));
  const maximum = blocks.reduce((n, b) => n + b.w, 0) + blocks.length * gapX;
  // Browser layout widths are exact multiples of 1/64px. Skip only on that
  // safe grid; arbitrary SVG float geometry keeps the exhaustive search.
  const skip = Number.isSafeInteger((maximum + step) * 64) &&
    Number.isSafeInteger(step * 64) && blocks.every(b => Number.isSafeInteger(b.w * 64));
  let best, bestLimit, score = Infinity;
  for (let limit = minimum; limit <= maximum + step; limit += step) {
    let threshold = Infinity;
    const placed = pack(limit, width => { threshold = Math.min(threshold, width); }), box = bounds(placed);
    const distance = box.w * box.h * (1 + aspectPenalty * Math.abs(Math.log((box.w / box.h) / ratio)));
    if (distance < score) { best = placed; bestLimit = limit; score = distance; }
    if (skip) {
      if (threshold === Infinity) break;
      limit += Math.max(0, Math.ceil((threshold - limit) / step) - 1) * step;
    }
  }
  if (key.length <= 32768 && bestLimit !== undefined) {
    widthChoices.set(key, bestLimit);
    if (widthChoices.size > 32) widthChoices.delete(widthChoices.keys().next().value);
  }
  return best;
}
export function layoutWorld(input) {
  const sections = input.map(section => {
    const blocks = chooseWidth(section.blocks, 50, 1.6, 64, 112);
    const box = bounds(blocks);
    return { ...section, blocks, w: box.w + 128, h: box.h + 168 };
  });
  const placed = chooseWidth(sections, 100, 1.5, 240, 240);
  return placed.map(section => ({ ...section, blocks: section.blocks.map(block => {
    const x = section.x + 64 + block.x, y = section.y + 104 + block.y;
    return { ...block, x, y, ...(block.frames ? { frames: block.frames.map(frame => ({ ...frame, x: x + frame.x, y: y + frame.y })) } : {}) };
  }) }));
}
export function componentWrapWidth(parts) {
  const area = parts.reduce((sum, part) => sum + (part.width + 32) * (part.height + 48), 0);
  return Math.min(6400, Math.max(1600, Math.ceil(Math.sqrt(area * 1.6))));
}
export function blockForAsset(asset) {
  const parts = asset.parts.length ? asset.parts : [{ ...asset.full, id: 'full', name: 'Full sheet' }];
  if (asset.component || !asset.parts.length) {
    const box = bounds(parts.map(p => ({ x: p.x, y: p.y, w: p.width, h: p.height })));
    const crop = { x: box.x - 24, y: box.y - 36, w: box.w + 48, h: box.h + 60 };
    return { asset: asset.path, kind: 'set', w: crop.w, h: crop.h, crop };
  }
  const frames = rows(parts.map(p => ({ id: p.id, name: p.name, w: p.width + 32, h: p.height + 32, crop: { x: p.x - 16, y: p.y - 16, w: p.width + 32, h: p.height + 32 } })), 3600, 64, 112);
  const box = bounds(frames);
  return { asset: asset.path, kind: 'flow', w: box.w, h: box.h, frames };
}
export function fitArea(width, height, sidebar = true, inspector = false) {
  const left = (sidebar ? 272 : 0) + 20, right = width - (inspector ? 312 : 0) - 24;
  return { x: left, y: 100, width: Math.max(1, right - left), height: Math.max(1, height - 184) };
}
export function fitView(box, area, padding = 0) {
  const scale = Math.max(.025, Math.min(32, Math.max(1, area.width - padding * 2) / box.width, Math.max(1, area.height - padding * 2) / box.height));
  return { scale, x: area.x + area.width / 2 - (box.x + box.width / 2) * scale, y: area.y + area.height / 2 - (box.y + box.height / 2) * scale };
}
