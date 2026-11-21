import { candidates } from './motion-identity.js';

export function flowAnchor(flow, frames) {
  if (!frames.length) return null;
  const targets = flow.anchor ? [flow.anchor] : flow.triggers;
  for (const target of targets) {
    const boxes = frames.map((frame) => {
      const matches = candidates(frame.rows, target);
      return matches.length === 1 && matches[0].box[2] > 0 && matches[0].box[3] > 0 ? matches[0].box : null;
    });
    if (boxes.every(Boolean)) return { target, boxes };
  }
  return null;
}

export function flowLayout(flow, frames) {
  const pin = flowAnchor(flow, frames);
  if (!frames.length) return { pin, offsets: [], width: 0, height: 0 };
  const origins = frames.map(({ box }, i) => pin
    ? [box[0] - pin.boxes[i][0], box[1] - pin.boxes[i][1]]
    : [0, 0]);
  const left = Math.min(...origins.map(([x]) => x)),
    top = Math.min(...origins.map(([, y]) => y));
  const offsets = origins.map(([x, y]) => [x - left, y - top]);
  const width = Math.max(...frames.map(({ box }, i) => offsets[i][0] + box[2])),
    height = Math.max(...frames.map(({ box }, i) => offsets[i][1] + box[3]));
  return { pin, offsets, width, height };
}
