// Adapted from ARC tooling/design.mjs (MIT; see LICENSE).
// An instance keeps its form's container geometry and paint and only uses the form's text styles.
// A data-fluid container may change height with its content.
export function compareInstance(definition, instance) {
  const differences = [];
  if (!definition.container !== !instance.container) differences.push('container rect presence differs');
  else if (definition.container) {
    for (const key of ['height', 'rx', 'fill', 'stroke', 'filter']) {
      if (key === 'height' && definition.container.fluid) continue;
      if (definition.container[key] !== instance.container[key]) differences.push(`${key} ${JSON.stringify(instance.container[key])} should be ${JSON.stringify(definition.container[key])}`);
    }
  }
  for (const style of instance.text) if (!definition.text.includes(style)) differences.push(`text style ${style} is not used by the form`);
  return differences;
}


// Pairs design and implementation text boxes by content, in reading order.
export function matchTexts(design, implementation) {
  const order = (a, b) => a.y - b.y || a.x - b.x;
  const pool = [...implementation].sort(order), pairs = [], missing = [];
  for (const item of [...design].sort(order)) {
    let index = pool.findIndex(other => other.text === item.text);
    if (index < 0) index = pool.findIndex(other => other.text.startsWith(item.text));
    if (index < 0) { missing.push(item); continue; }
    pairs.push([item, pool.splice(index, 1)[0]]);
  }
  return { pairs, missing, extra: pool };
}

// Compares the anchored edge, vertical center and width of a paired text.
export function textDelta(design, implementation) {
  const edge = box => design.anchor === 'middle' ? box.x + box.width / 2 : design.anchor === 'end' ? box.x + box.width : box.x;
  return { dx: edge(implementation) - edge(design), dy: (implementation.y + implementation.height / 2) - (design.y + design.height / 2), dw: implementation.width - design.width };
}
