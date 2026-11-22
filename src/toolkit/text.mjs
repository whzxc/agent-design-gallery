const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function groupTexts(texts) {
  const groups = new Map();
  texts.forEach((row, index) => {
    if (!groups.has(row.text)) groups.set(row.text, []);
    groups.get(row.text).push({ row, index });
  });
  return groups;
}

// Pair in order. When counts differ, skip the subset on the longer side
// that minimizes the total distance without crossing pairs.
function orderedPairs(left, right) {
  const order = ({ row }) => Number.isFinite(row.order) ? row.order : Infinity;
  const byOrder = (a, b) => order(a) === order(b) ? a.index - b.index : order(a) - order(b);
  left.sort(byOrder);
  right.sort(byOrder);
  const flipped = left.length > right.length;
  const [short, long] = flipped ? [right, left] : [left, right];
  const slack = long.length - short.length;
  if (!slack) return left.map((entry, index) => [entry, right[index]]);
  const take = short.map(() => new Uint8Array(slack + 1));
  let next = new Float64Array(slack + 1);
  for (let i = short.length - 1; i >= 0; i--) {
    const costs = new Float64Array(slack + 1);
    for (let skipped = slack; skipped >= 0; skipped--) {
      const pair = distance(short[i].row, long[i + skipped].row) + next[skipped];
      const skip = costs[skipped + 1] ?? Infinity;
      if (pair <= skip) take[i][skipped] = 1;
      costs[skipped] = Math.min(pair, skip);
    }
    next = costs;
  }
  let skipped = 0;
  return short.map((entry, i) => {
    while (!take[i][skipped]) skipped++;
    const other = long[i + skipped];
    return flipped ? [other, entry] : [entry, other];
  });
}

export function matchTexts(design, implementation) {
  const designGroups = groupTexts(design), implementationGroups = groupTexts(implementation);
  const usedD = new Set(), usedI = new Set(), matches = [];
  for (const [text, left] of designGroups) {
    const right = implementationGroups.get(text);
    if (!right) continue;
    for (const [d, i] of orderedPairs(left, right)) {
      usedD.add(d.index);
      usedI.add(i.index);
      matches.push({ d, i, distance: distance(d.row, i.row) });
    }
  }
  matches.sort((a, b) => a.distance - b.distance || a.d.index - b.d.index || a.i.index - b.i.index);
  return { pairs: matches.map(({ d, i }) => [d.row, i.row]),
    missing: design.filter((_, i) => !usedD.has(i)), extra: implementation.filter((_, i) => !usedI.has(i)) };
}

// Compares the anchored edge, vertical center and width of a paired text.
export function textDelta(design, implementation) {
  const edge = box => design.anchor === 'middle' ? box.x + box.width / 2 : design.anchor === 'end' ? box.x + box.width : box.x;
  return { dx: edge(implementation) - edge(design), dy: (implementation.y + implementation.height / 2) - (design.y + design.height / 2), dw: implementation.width - design.width };
}
