export const possibleTailwind = /(?:\btransition\b|\banimate-|\b(?:fade|zoom|spin)-(?:in|out)\b|\bslide-(?:in-from|out-to)-)/;

const effect = /^(?:transition(?:-.+)?|animate-.+|(?:fade|zoom|spin)-(?:in|out)(?:-.+)?|slide-(?:in-from|out-to)-.+)$/;
const timing = /^(?:duration|ease|delay)-.+$/;
const disabled = /^(?:animate|transition)-none$/;
const bare = new Set('block inline inline-block flex inline-flex grid inline-grid contents hidden table container relative absolute fixed sticky static visible invisible isolate truncate underline italic antialiased sr-only grow shrink transform rounded border shadow ring group peer'.split(' '));
const classLike = base => bare.has(base) || effect.test(base) || timing.test(base) ||
  /^-?[\w]+[-/][\w./-]+$/.test(base) || /^(?:[-\w]+-)?[\[(].+[\])]$/.test(base);

function* candidates(text) {
  let start = 0, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') i++;
    else if (char === '[' || char === '(') depth++;
    else if ((char === ']' || char === ')') && depth) depth--;
    else if (depth === 0 && /[\s<>=;,"'`]/.test(char)) {
      if (start < i) yield text.slice(start, i);
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}

function utility(candidate) {
  let start = 0, depth = 0;
  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];
    if (char === '\\' && depth) i++;
    else if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') {
      if (--depth < 0) return '';
    } else if (depth === 0 && char === ':') start = i + 1;
    else if (depth === 0 && !/[\w!@./-]/.test(char)) return '';
  }
  if (depth) return '';
  const base = candidate.slice(start).replace(/^!|!$/g, '');
  return /[\w)\]]$/.test(base) ? base : '';
}

export function scanTailwind(parts, record, within = [], classContext = false) {
  const effects = new Set(), parameters = new Set();
  let line = Infinity, count = 0, classList = true;
  for (const { text, line: at } of parts) {
    for (const candidate of candidates(text)) {
      const base = utility(candidate);
      count++;
      classList &&= classLike(base);
      if (timing.test(base) || disabled.test(base)) parameters.add(candidate);
      else if (effect.test(base)) {
        effects.add(candidate);
        line = Math.min(line, at);
      }
    }
  }
  if (effects.size && (classContext || classList && count >= 2))
    record('tailwind:' + [...effects].sort().join(' '), line, within, true, [...parameters].sort());
}

const helpers = new Set(['cn', 'clsx', 'cva', 'tv', 'twMerge']);
const member = /^(?:Optional)?MemberExpression$/;
const call = /^(?:Optional)?CallExpression$/;
const wrapper = /^(?:JSXExpressionContainer|ParenthesizedExpression|TS(?:As|Satisfies|NonNull|TypeAssertion)Expression)$/;

export function classContexts(declarations) {
  const names = new Set(helpers), namespaces = new Set();
  for (const node of declarations) if (node.type === 'ImportDeclaration' && node.importKind !== 'type') {
    const pkg = node.source.value;
    for (const specifier of node.specifiers) {
      if (helpers.has(specifier.imported?.name ?? specifier.imported?.value) ||
          (specifier.type === 'ImportDefaultSpecifier' && (helpers.has(pkg) || ['tailwind-merge','tailwind-variants','class-variance-authority'].includes(pkg))))
        names.add(specifier.local.name);
      if (specifier.type === 'ImportNamespaceSpecifier' &&
          ['clsx','tailwind-merge','tailwind-variants','class-variance-authority'].includes(pkg))
        namespaces.add(specifier.local.name);
    }
  }
  function helper(node, scope, aliases = new Set()) {
    if (member.test(node?.type)) return namespaces.has(node.object.name) &&
      (helpers.has(node.property.name ?? node.property.value) || node.property.name === 'default');
    if (node?.type !== 'Identifier' || aliases.has(node)) return false;
    if (names.has(node.name)) return true;
    aliases.add(node);
    for (let current = scope; current; current = current.parent)
      if (current.constants.has(node.name)) return helper(current.constants.get(node.name), current, aliases);
    return false;
  }
  const marked = new WeakSet(), seen = [new WeakSet(), new WeakSet()];
  function mark(node, scope, keys = true) {
    if (!node || seen[Number(keys)].has(node)) return;
    seen[Number(keys)].add(node);
    const add = value => mark(value, scope, keys);
    if (wrapper.test(node.type)) add(node.expression);
    else if (node.type === 'StringLiteral') marked.add(node);
    else if (node.type === 'TemplateLiteral') {
      marked.add(node);
      node.expressions.forEach(add);
    } else if (node.type === 'Identifier') {
      for (let current = scope; current; current = current.parent) {
        if (!current.constants.has(node.name)) continue;
        const constant = current.constants.get(node.name);
        if (constant) mark(constant, current, keys);
        break;
      }
    } else if (node.type === 'ConditionalExpression') {
      add(node.consequent);
      add(node.alternate);
    } else if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression' && node.operator === '+') {
      if (node.operator !== '&&') add(node.left);
      add(node.right);
    } else if (node.type === 'ArrayExpression') node.elements.forEach(add);
    else if (node.type === 'SpreadElement') add(node.argument);
    else if (node.type === 'ObjectExpression') {
      for (const entry of node.properties) {
        if (entry.type === 'SpreadElement') add(entry.argument);
        else if (entry.type === 'ObjectProperty') {
          if (keys && entry.key.type === 'StringLiteral' && !entry.computed) add(entry.key);
          add(entry.value);
        }
      }
    } else if (member.test(node.type)) mark(node.object, scope, false);
    else if (call.test(node.type) && helper(node.callee, scope)) node.arguments.forEach(add);
  }
  return { helper, mark, has: node => marked.has(node) };
}

export function bindClassNames(scope, name, constant = null) {
  if (!name) return;
  if (name.type === 'Identifier') scope.constants.set(name.name, constant);
  else if (name.type === 'AssignmentPattern') bindClassNames(scope, name.left, name.right);
  else if (name.type === 'RestElement') bindClassNames(scope, name.argument);
  else if (name.type === 'ObjectPattern')
    for (const item of name.properties) bindClassNames(scope, item.value ?? item.argument);
  else if (name.type === 'ArrayPattern')
    for (const item of name.elements) bindClassNames(scope, item);
}
