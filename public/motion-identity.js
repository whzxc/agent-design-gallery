export function chain(rows, row) {
  const result = [];
  for (let r = row; r; r = rows[r.parent]) result.push(r);
  return result;
}
export function matchRoots(from, to, excluded = { from: new Set(), to: new Set() }) {
  function roots(rows, skip) {
    return rows
      .filter((r) => r.parts.length && !skip.has(r.i))
      .map((row) => {
        const scope = chain(rows, row)
          .reverse()
          .flatMap((r) => r.keys.map((k) => [r.parts, k.owner ?? null, k.key, k.root ?? null]));
        return { row, key: JSON.stringify([row.parts, scope]), scope };
      });
  }
  const left = roots(from, excluded.from),
    right = roots(to, excluded.to),
    a = new Map(),
    b = new Map(),
    pairs = [];
  const matches = (roots, rows, matched) => {
    const groups = new Map();
    for (const root of roots) {
      if (matched.has(root.row.i)) continue;
      const parent = chain(rows, rows[root.row.parent]).find((p) => matched.has(p.i));
      const key = JSON.stringify([root.key, parent ? matched.get(parent.i) : null]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(root);
    }
    return groups;
  };
  let ambiguous = [];
  for (;;) {
    const old = matches(left, from, a),
      next = matches(right, to, b);
    const before = pairs.length;
    ambiguous = [];
    for (const [key, group] of old) {
      const other = next.get(key);
      if (!other) continue;
      if (group.length !== 1 || other.length !== 1) {
        ambiguous.push({ part: group[0].row.parts.at(-1), from: group.length, to: other.length });
        continue;
      }
      const f = group[0],
        t = other[0],
        id = pairs.length;
      pairs.push({ from: f.row.i, to: t.row.i, parts: f.row.parts, keys: f.scope });
      a.set(f.row.i, id);
      b.set(t.row.i, id);
    }
    if (before === pairs.length) {
      const conflicts = [];
      for (const [side, roots] of [
        ['from', left],
        ['to', right]
      ]) {
        const siblings = new Set();
        for (const { row, key } of roots) {
          if (!row.keys.length) continue;
          const local = JSON.stringify([row.parent, key]);
          if (siblings.has(local)) conflicts.push({ side, part: row.parts.at(-1) });
          siblings.add(local);
        }
      }
      const limitations = pairs.flatMap((p) => {
        const sides = [from[p.from], to[p.to]];
        const reason =
          sides.find((r) => r.limitation)?.limitation ??
          (sides.some((r) => !r.box[2] || !r.box[3]) ? 'empty_box' : null);
        return reason ? [{ from: p.from, to: p.to, reason }] : [];
      });
      return {
        pairs,
        ambiguous,
        conflicts,
        limitations,
        counts: {
          match: pairs.length,
          enter: right.length - b.size,
          exit: left.length - a.size,
          ambiguous: ambiguous.length
        }
      };
    }
  }
}

export function instanceKeyMatches(ancestors, key) {
  // An explicit instance key shadows the containing list's or slot's key.
  return ancestors.find((row) => row.keys?.length)?.keys.some((k) => k.key === key) ?? false;
}
export function candidates(rows, target) {
  if (target.frame) return rows.slice(0, 1);
  if (target.anchor) return rows.filter((r) => r.anchor === target.anchor);
  return rows.filter(
    (r) => r.parts.includes(target.part) && (target.key === undefined || instanceKeyMatches(chain(rows, r), target.key))
  );
}
