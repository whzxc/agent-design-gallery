// Class-bearing syntax is a separate candidate from CSS and JavaScript motion.
export const possibleClasses = /\b(?:class(?:Name)?\s*=|cn\b|clsx\b|cva\b|class-variance-authority)/;

const helperNames = new Set(['cn', 'clsx', 'cva']);
const effect = /^(?:transition(?:-.+)?|animate-.+|(?:fade|zoom|spin)-(?:in|out)(?:-.+)?|slide-(?:in-from|out-to)-.+)$/;
const timing = /^(?:duration|ease|delay)-.+$/;
const disabled = /^(?:animate|transition)-none$/;
const key = node => node?.name ?? node?.value;
const opaque = '\0';

function utility(candidate) {
  let start = 0, depth = 0;
  for (let i = 0; i < candidate.length; i++) {
    const char = candidate[i];
    if (char === '\\') i++;
    else if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) start = i + 1;
  }
  return candidate.slice(start).replace(/^!|!$/g, '');
}

function candidates(text) {
  return (text.match(/\S+/g) ?? []).filter(token => !token.includes(opaque));
}

function emit(chunks, record, within) {
  const effects = new Set(), parameters = new Set();
  let line = Infinity;
  for (const chunk of chunks) for (const candidate of candidates(chunk.text)) {
    const base = utility(candidate);
    if (timing.test(base) || disabled.test(base)) parameters.add(candidate);
    else if (effect.test(base)) {
      effects.add(candidate);
      line = Math.min(line, chunk.line);
    }
  }
  if (effects.size) record('tailwind:' + [...effects].sort().join(' '), line, within, true, [...parameters].sort());
}

export function markupClass(text, line, record, dynamic, interpolated) {
  if (interpolated && text.includes('var(--dynamic)')) {
    dynamic(line);
    text = text.replaceAll('var(--dynamic)', opaque);
  }
  emit([{ text, line }], record, []);
}

const classKey = node => node?.type === 'ObjectProperty' &&
  (!node.computed || node.key.type === 'StringLiteral') ? key(node.key) : null;

export function classScanner(record, dynamic, declarations = []) {
  const aliases = new Map([...helperNames].map(name => [name, name]));
  const consumed = new WeakSet();
  for (const declaration of declarations) {
    if (declaration.type !== 'ImportDeclaration' || declaration.importKind === 'type') continue;
    for (const specifier of declaration.specifiers) {
      const name = key(specifier.imported) ?? (specifier.type === 'ImportDefaultSpecifier' && declaration.source.value);
      if (helperNames.has(name)) aliases.set(specifier.local.name, name);
    }
  }
  const helper = node => (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') &&
    node.callee.type === 'Identifier' && aliases.get(node.callee.name);

  function cvaOptions(options, within) {
    if (!options || options.type === 'NullLiteral') return;
    if (options.type !== 'ObjectExpression') { dynamic(options.loc.start.line, within); return; }
    for (const entry of options.properties) {
      const name = classKey(entry), value = entry.value;
      if (name === 'variants' && value.type === 'ObjectExpression') {
        for (const variant of value.properties) {
          if (variant.value?.type !== 'ObjectExpression') { dynamic(variant.loc.start.line, within); continue; }
          for (const choice of variant.value.properties)
            expression(choice.value ?? choice.argument, within);
        }
      } else if (name === 'compoundVariants' && value.type === 'ArrayExpression') {
        for (const choice of value.elements) {
          if (choice?.type !== 'ObjectExpression') { if (choice) dynamic(choice.loc.start.line, within); continue; }
          for (const item of choice.properties) {
            if (['class', 'className'].includes(classKey(item))) expression(item.value, within);
            else if (classKey(item) === null) dynamic(item.loc.start.line, within);
          }
        }
      } else if (name === 'variants' || name === 'compoundVariants' || name === null) dynamic(entry.loc.start.line, within);
    }
  }

  function expression(root, within = []) {
    const chunks = [];
    function collect(node) {
      if (!node) return;
      const { line } = node.loc.start;
      const add = text => chunks.push({ text, line });
      switch (node.type) {
        case 'JSXExpressionContainer':
        case 'TSAsExpression':
        case 'TSSatisfiesExpression':
        case 'TSNonNullExpression':
        case 'ParenthesizedExpression':
          collect(node.expression);
          return;
        case 'StringLiteral':
          add(node.value);
          return;
        case 'TemplateLiteral': {
          const parts = node.quasis.map(part => part.value.cooked ?? part.value.raw);
          let text = parts[0];
          for (const [index, input] of node.expressions.entries()) {
            const next = parts[index + 1];
            if (input.type === 'StringLiteral') text += input.value;
            else if ((!text || /\s$/.test(text)) && (!next || /^\s/.test(next)) &&
                (next || index === node.expressions.length - 1)) {
              collect(input);
              text += ' ';
            } else {
              dynamic(input.loc.start.line, within);
              text += opaque;
            }
            text += next;
          }
          add(text);
          return;
        }
        case 'ConditionalExpression':
          collect(node.consequent);
          collect(node.alternate);
          return;
        case 'LogicalExpression':
          if (node.operator !== '&&') collect(node.left);
          collect(node.right);
          return;
        case 'ArrayExpression':
          for (const item of node.elements) collect(item);
          return;
        case 'SpreadElement':
          collect(node.argument);
          return;
        case 'ObjectExpression':
          for (const item of node.properties) {
            const name = classKey(item);
            if (typeof name === 'string') chunks.push({ text: name, line: item.loc.start.line });
            else if (name === null) dynamic(item.loc.start.line, within);
          }
          return;
        case 'MemberExpression':
        case 'OptionalMemberExpression':
          if (node.object.type === 'ObjectExpression' && node.computed) {
            for (const entry of node.object.properties) {
              if (entry.type === 'ObjectProperty') collect(entry.value);
              else dynamic(entry.loc.start.line, within);
            }
            return;
          }
          break;
        case 'CallExpression':
        case 'OptionalCallExpression': {
          const name = helper(node);
          if (!name) break;
          consumed.add(node);
          if (name === 'cva') {
            collect(node.arguments[0]);
            cvaOptions(node.arguments[1], within);
          } else for (const input of node.arguments) collect(input);
          return;
        }
        case 'NullLiteral':
        case 'NumericLiteral':
        case 'BooleanLiteral':
        case 'JSXEmptyExpression':
          return;
        case 'Identifier':
          if (node.name === 'undefined') return;
          break;
      }
      dynamic(line, within);
    }
    collect(root);
    emit(chunks, record, within);
  }

  return {
    expression,
    call(node, within) {
      if (helper(node) && !consumed.has(node)) expression(node, within);
    },
  };
}
