// Pure board geometry. Board children use local coordinates; items use world coordinates.
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

export const boardGeometry = Object.freeze({
  width: 1680, side: 80, top: 64, bottom: 80,
  label: 280, sectionGap: 56, sectionPadding: 48,
  columns: 12, columnGap: 24, rowGap: 32,
  wellX: 24, wellY: 32, wellMinHeight: 96,
  captionGap: 12, metaLine: 17, boardGap: 240, bandGap: 480,
});

const lineCount = (text, width, characterWidth) => String(text ?? '').split('\n')
  .reduce((count, line) => count + Math.max(1, Math.ceil(line.length * characterWidth / width)), 0);

export function blockForAsset(asset) {
  const parts = asset.parts.length ? asset.parts : [{ ...asset.full, id: 'full', name: 'Full sheet' }];
  const box = bounds(parts.map(p => ({ x: p.x, y: p.y, w: p.width, h: p.height })));
  const previewCrop = asset.component ? {
    id: 'overview', name: 'All forms', x: box.x - 24, y: box.y - 32,
    width: box.w + 48, height: box.h + 64,
  } : undefined;
  const filename = asset.path.split('/').at(-1);
  return {
    asset: asset.path, path: asset.path, kind: 'flow',
    title: filename === 'index.tsx' ? asset.path.split('/').at(-2) : filename.replace(/\.(tsx|svg|mmd)$/, ''),
    modified: asset.modified, modifiedAt: asset.modifiedAt, previewCrop,
    frames: parts.map(part => ({
      id: part.id, name: part.name, note: part.note, proposed: part.proposed, proposal: part.proposed,
      w: part.width, h: part.height,
      crop: { x: part.x, y: part.y, w: part.width, h: part.height },
    })),
  };
}

// The paint window is bounded by the well padding and neighbouring legacy frames.
export function specimenPaintCrop(asset, crop) {
  if (asset.layer?.toLowerCase() === 'surfaces' || asset.path.startsWith('surfaces/')) return crop;
  let left = crop.x - 24, right = crop.x + crop.width + 24;
  let top = crop.y - 32, bottom = crop.y + crop.height + 32;
  if (asset.component && asset.format !== 'tsx') for (const other of asset.parts) {
    if (other.id === crop.id) continue;
    if (other.y < bottom && other.y + other.height > top) {
      if (other.x >= crop.x + crop.width) right = Math.min(right, (crop.x + crop.width + other.x) / 2);
      if (other.x + other.width <= crop.x) left = Math.max(left, (crop.x + other.x + other.width) / 2);
    }
    if (other.x < right && other.x + other.width > left) {
      if (other.y >= crop.y + crop.height) bottom = Math.min(bottom, (crop.y + crop.height + other.y) / 2);
      if (other.y + other.height <= crop.y) top = Math.max(top, (crop.y + other.y + other.height) / 2);
    }
  }
  return {...crop, x:left, y:top, width:right-left, height:bottom-top};
}

function layoutSection(section, width, y) {
  const g = boardGeometry;
  const areaWidth = width - g.side * 2 - g.label - g.sectionGap;
  const columnWidth = (areaWidth + g.columnGap) / g.columns;
  let column = 0, rowY = g.sectionPadding + 1, rowHeight = 0;
  const frames = section.frames.map(frame => {
    const span = Math.min(g.columns, Math.max(1, Math.ceil((frame.w + g.wellX * 2 + g.columnGap) / columnWidth)));
    if (column + span > g.columns) {
      column = 0;
      rowY += rowHeight + g.rowGap;
      rowHeight = 0;
    }
    const x = g.label + g.sectionGap + column * columnWidth;
    const wellWidth = span * columnWidth - g.columnGap;
    const wellHeight = Math.max(g.wellMinHeight, frame.h + g.wellY * 2);
    const captionHeight = lineCount(frame.name, wellWidth, 7.2) * g.metaLine +
      (frame.note || frame.proposed ? 2 + lineCount([frame.note, frame.proposed && `Proposed: ${frame.proposed}`].filter(Boolean).join(' · '), wellWidth, 6.5) * g.metaLine : 0);
    const well = { x, y: rowY, w: wellWidth, h: wellHeight };
    const caption = { x, y: rowY + wellHeight + g.captionGap, w: wellWidth, h: captionHeight };
    rowHeight = Math.max(rowHeight, wellHeight + g.captionGap + captionHeight);
    column += span;
    return { ...frame, span, x: x + (wellWidth - frame.w) / 2, y: rowY + (wellHeight - frame.h) / 2, well, caption };
  });
  const labelHeight = lineCount(section.title, g.label, 12) * 28 + 20 +
    lineCount(section.path, g.label - 18, 6.6) * 18 + (section.modified || section.modifiedAt ? 26 : 0);
  const contentHeight = frames.length ? rowY - g.sectionPadding - 1 + rowHeight : 0;
  return { ...section, x: g.side, y, w: width - g.side * 2,
    h: 1 + g.sectionPadding * 2 + Math.max(labelHeight, contentHeight),
    label: { x: 0, y: g.sectionPadding + 1, w: g.label, h: labelHeight },
    specimenArea: { x: g.label + g.sectionGap, y: g.sectionPadding + 1, w: areaWidth, h: contentHeight },
    frames,
  };
}

function layoutBoard(board) {
  const g = boardGeometry;
  const widest = Math.max(0, ...board.blocks.flatMap(section => section.frames.map(frame => frame.w + g.wellX * 2)));
  const w = Math.max(g.width, g.side * 2 + g.label + g.sectionGap + widest);
  const headerHeight = 28 + 16 + lineCount(board.title, Math.max(1, w - g.side * 2 - 440 - 64), 26) * 56 + 56;
  let y = g.top + headerHeight;
  const blocks = board.blocks.map(section => {
    const placed = layoutSection(section, w, y);
    y += placed.h;
    return placed;
  });
  return { ...board, w, h: y + g.bottom,
    header: { x: g.side, y: g.top, w: w - g.side * 2, h: headerHeight },
    sourceCount: blocks.length, frameCount: blocks.reduce((sum, section) => sum + section.frames.length, 0), blocks,
  };
}

function placeColumns(boards, count, previous = []) {
  const g = boardGeometry;
  const heights = Array(count).fill(0), widths = Array(count).fill(0);
  const oldByKey = new Map(previous.map(board => [board.key, board]));
  const placed = boards.map(board => {
    const old = oldByKey.get(board.key);
    const column = Number.isInteger(old?.column) && old.column < count
      ? old.column : heights.indexOf(Math.min(...heights));
    const y = heights[column];
    heights[column] += board.h + g.boardGap;
    widths[column] = Math.max(widths[column], board.w, old?.columnWidth ?? 0);
    return { ...board, column, y };
  });
  // Retain column widths across saves so shrinking a board does not move its neighbours.
  for (const old of previous) if (old.column < count) widths[old.column] = Math.max(widths[old.column], old.columnWidth ?? old.w);
  const lefts = [];
  let x = 0;
  for (const width of widths) { lefts.push(x); x += width + g.boardGap; }
  return placed.map(board => ({ ...board, x: lefts[board.column], columnWidth: widths[board.column], columnCount: count }));
}

export function layoutWorld(input, { previousGroups = [] } = {}) {
  const bands = new Map();
  for (const [index, source] of input.entries()) {
    const board = layoutBoard({ ...source, key: source.key ?? `${source.layer ?? ''}:${source.title ?? index}` });
    if (!bands.has(board.layer)) bands.set(board.layer, []);
    bands.get(board.layer).push(board);
  }
  const result = [];
  let bandY = 0;
  for (const [layer, boards] of bands) {
    const previous = previousGroups.filter(board => board.layer === layer && Number.isInteger(board.column));
    let placed;
    if (previous.length) {
      placed = placeColumns(boards, Math.max(...previous.map(board => board.columnCount ?? board.column + 1)), previous);
    } else {
      let distance = Infinity;
      for (let count = 1; count <= boards.length; count++) {
        const candidate = placeColumns(boards, count);
        const box = bounds(candidate);
        const score = Math.abs(box.w / box.h - 16 / 10);
        if (score < distance) { placed = candidate; distance = score; }
      }
    }
    result.push(...placed.map(board => ({ ...board, y: board.y + bandY, bandY })));
    bandY += bounds(placed).h + boardGeometry.bandGap;
  }
  return result;
}

export function componentWrapWidth(parts) {
  const area = parts.reduce((sum, part) => sum + (part.width + 48) * (part.height + 64), 0);
  return Math.min(6400, Math.max(1600, Math.ceil(Math.sqrt(area * 1.6))));
}
export function fitArea(width, height, sidebar = true, inspector = false) {
  const left = (sidebar ? 272 : 0) + 20, right = width - (inspector ? 312 : 0) - 24;
  return { x: left, y: 100, width: Math.max(1, right - left), height: Math.max(1, height - 184) };
}
export function fitView(box, area, padding = 0) {
  const scale = Math.max(.025, Math.min(32, Math.max(1, area.width - padding * 2) / box.width, Math.max(1, area.height - padding * 2) / box.height));
  return { scale, x: area.x + area.width / 2 - (box.x + box.width / 2) * scale, y: area.y + area.height / 2 - (box.y + box.height / 2) * scale };
}
