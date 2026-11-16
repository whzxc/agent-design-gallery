import * as cssTree from 'css-tree';

// Resolve only viewport features; preference and unknown features remain live.
export function resolveMedia(css, viewport = { width: 1440, height: 900 }) {
  const compare = (a, op, b) => ({ '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b, '=': a === b })[op];
  const number = node => node?.type === 'Identifier' && ['width', 'height'].includes(node.name) ? viewport[node.name]
    : node?.type === 'Dimension' ? Number(node.value) * ({ px: 1, em: 16, rem: 16 }[node.unit] ?? NaN)
    : node?.type === 'Number' ? Number(node.value) : NaN;
  const join = (items, op) => {
    if (items.includes(op === 'and' ? false : true)) return op !== 'and';
    const rest = items.filter(v => v !== (op === 'and'));
    return rest.length ? rest.length === 1 ? rest[0] : `(${rest.join(` ${op} `)})` : op === 'and';
  };
  const negate = value => typeof value === 'boolean' ? !value : `not ${value}`;
  const resolve = node => {
    if (node.type === 'Condition') {
      const items = node.children.toArray();
      if (items[0]?.name === 'not') return negate(resolve(items[1]));
      const op = items.some(n => n.name === 'or') ? 'or' : 'and';
      return join(items.filter(n => n.type !== 'Identifier').map(resolve), op);
    }
    if (node.type === 'Feature') {
      if (node.name === 'orientation') return (viewport.width >= viewport.height ? 'landscape' : 'portrait') === node.value?.name;
      const match = /^(?:(min|max)-)?(width|height)$/.exec(node.name);
      if (match) {
        if (!node.value) return viewport[match[2]] > 0;
        const limit = number(node.value);
        if (Number.isFinite(limit)) return compare(viewport[match[2]], match[1] === 'min' ? '>=' : match[1] === 'max' ? '<=' : '=', limit);
      }
    }
    if (node.type === 'FeatureRange') {
      const nums = [node.left, node.middle, node.right].map(number);
      if (nums.slice(0, node.right ? 3 : 2).every(Number.isFinite)) return compare(nums[0], node.leftComparison, nums[1]) && (!node.right || compare(nums[1], node.rightComparison, nums[2]));
    }
    return cssTree.generate(node);
  };
  const ast = cssTree.parse(css);
  cssTree.walk(ast, { visit: 'Atrule', reverse: true, enter(node, item, list) {
    if (node.name.toLowerCase() !== 'media' || !node.prelude || !list) return;
    const queries = (node.prelude.type === 'AtrulePrelude' ? node.prelude.children.first : node.prelude).children.toArray().map(query => {
      if (query.type !== 'MediaQuery') return cssTree.generate(query);
      let result = query.condition ? resolve(query.condition) : true;
      if (query.mediaType && query.mediaType !== 'all' && result !== false) result = result === true ? query.mediaType : `${query.mediaType} and ${result}`;
      if (query.modifier === 'not') result = typeof result === 'boolean' ? !result : `not ${result}`;
      return result;
    });
    const result = queries.includes(true) ? true : queries.every(value => value === false) ? false : queries.filter(value => value !== false).join(',');
    if (result === false) list.remove(item);
    else if (result === true) { list.insertList(node.block.children, item); list.remove(item); }
    else node.prelude = cssTree.parse(result, { context: 'mediaQueryList' });
  }});
  return cssTree.generate(ast);
}
