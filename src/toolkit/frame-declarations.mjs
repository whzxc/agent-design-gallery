import { parse } from '@babel/parser';

// Join the actual Frame invocation (including mapped/generated names) and emitted
// part identities to declaration text. Offsets or line numbers alone are not edits.
export function declarations(text) {
  const { program } = parse(text, { sourceType: 'module', plugins: ['jsx', 'typescript', 'decorators-legacy'] });
  const sites = new Map(),
    bindings = new Map(),
    exports = new Map();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') {
      sites.set(node.loc.start.line + ':' + (node.loc.start.column + 1), text.slice(node.start, node.end));
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(child)) child.forEach(visit);
      else if (child?.type) visit(child);
    }
  }
  for (const statement of program.body) {
    const node = statement.declaration ?? statement;
    const definitions = node.type === 'VariableDeclaration' ? node.declarations : [node];
    for (const def of definitions) {
      if (def.id?.name) bindings.set(def.id.name, text.slice(def.start, def.end));
    }
    for (const spec of statement.specifiers ?? []) {
      if (spec.exported && spec.local) exports.set(spec.exported.name, spec.local.name);
    }
    visit(node);
  }
  return {
    site: (origin) => sites.get(origin.line + ':' + origin.column),
    part: (name) => bindings.get(exports.get(name) ?? name)
  };
}
