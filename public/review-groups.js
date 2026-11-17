/** Group inherited changes without copying their frame entries or image payloads. */
export function groupReview(review) {
  const changed = review.sections?.changed ?? [];
  const byCause = new Map();
  let direct = 0;
  for (const frame of changed) {
    if (frame.change?.kind !== 'inherited') {
      direct++;
      continue;
    }
    const causes = [...new Set(frame.change.causes)].sort();
    const key = JSON.stringify(causes);
    if (!byCause.has(key)) byCause.set(key, { causes, frames: [] });
    byCause.get(key).frames.push(frame);
  }
  const area = frame => Math.max(0, ...frame.themes.map(row => row.differentPixels ?? 0));
  const groups = [...byCause.values()].map(group => {
    // Preserve source order for equal areas, including the two middle members.
    const ordered = group.frames.map(frame => ({ frame, area: area(frame) }))
      .sort((a, b) => a.area - b.area);
    const middle = Math.floor(ordered.length / 2);
    const medianArea = ordered.length % 2 ? ordered[middle].area
      : (ordered[middle - 1].area + ordered[middle].area) / 2;
    const representative = group.frames.reduce((selected, frame) =>
      Math.abs(area(frame) - medianArea) < Math.abs(area(selected) - medianArea) ? frame : selected);
    return { ...group, representative, outliers: group.frames.filter(frame => area(frame) > 2 * medianArea), medianArea };
  });
  return { ...review, counts: { ...review.counts, direct, inherited: changed.length - direct }, groups };
}
