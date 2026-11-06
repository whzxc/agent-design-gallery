// Pure Float world geometry. Coordinates and gaps are SVG units.
export function bounds(boxes) {
  if (!boxes.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
export function rows(blocks, limit, gapX, gapY) {
  let x = 0, y = 0, height = 0;
  return blocks.map(block => {
    if (x && x + block.w > limit) { x = 0; y += height + gapY; height = 0; }
    const placed = { ...block, x, y };
    x += block.w + gapX; height = Math.max(height, block.h);
    return placed;
  });
}
export function skyline(blocks, limit) {
  const placed = [];
  for (const block of blocks) {
    const candidates = [0, ...placed.map(p => p.x + p.w + 64)].filter(x => x + block.w <= limit);
    const positions = candidates.map(x => ({ x, y: Math.max(0, ...placed.filter(p => x < p.x + p.w + 64 && x + block.w + 64 > p.x).map(p => p.y + p.h + 112)) }));
    positions.sort((a, b) => a.y - b.y || a.x - b.x);
    placed.push({ ...block, ...positions[0] });
  }
  return placed;
}
function chooseWidth(blocks, step, ratio, pack) {
  if (!blocks.length) return [];
  const minimum = Math.max(...blocks.map(b => b.w));
  const maximum = blocks.reduce((n, b) => n + b.w, 0) + blocks.length * 480;
  let best, score = Infinity;
  for (let limit = minimum; limit <= maximum + step; limit += step) {
    const placed = pack(limit), box = bounds(placed), distance = Math.abs(box.w / box.h - ratio);
    if (distance < score) { best = placed; score = distance; }
  }
  return best;
}
export function layoutWorld(input) {
  const sections = input.map(section => {
    const blocks = chooseWidth(section.blocks, 50, 1.6, limit => {
      const sets = skyline(section.blocks.filter(b => b.kind === 'set'), limit);
      const offset = sets.length ? bounds(sets).h + 200 : 0;
      const flows = rows(section.blocks.filter(b => b.kind === 'flow'), limit, 64, 200).map(b => ({ ...b, y: b.y + offset }));
      return [...sets, ...flows];
    });
    const box = bounds(blocks);
    return { ...section, blocks, w: box.w + 128, h: box.h + 168 };
  });
  const placed = chooseWidth(sections, 100, 1.5, limit => rows(sections, limit, 480, 480));
  return placed.map(section => ({ ...section, blocks: section.blocks.map(block => {
    const x = section.x + 64 + block.x, y = section.y + 104 + block.y;
    return { ...block, x, y, ...(block.frames ? { frames: block.frames.map(frame => ({ ...frame, x: x + frame.x, y: y + frame.y })) } : {}) };
  }) }));
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
  const scale = Math.max(.025, Math.min(32, area.width / (box.width + padding * 2), area.height / (box.height + padding * 2)));
  return { scale, x: area.x + area.width / 2 - (box.x + box.width / 2) * scale, y: area.y + area.height / 2 - (box.y + box.height / 2) * scale };
}
