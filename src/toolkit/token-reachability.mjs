import { parseTokens } from './tokens.mjs';

// Deliberately lexical: text, inactive rules and unused utilities all participate.
const identifiers = text => [...text.matchAll(/--[\p{L}\p{N}_-]+/gu)].map(match => match[0]);
const escaped = text => /--[\p{L}\p{N}_-]*\\/u.test(text);

/** Conservative token inputs, shared by impact candidates and the later document proof. */
export function tokenReachability(document, tokenSource, theme) {
  const roots = [...new Set(identifiers(document))].sort();
  let tokens;
  const fallback = () => ({ mode: 'full_sheet', names: [...new Set([...roots, ...identifiers(tokenSource)])].sort(), via: {} });
  try { tokens = parseTokens(tokenSource); } catch { return fallback(); }
  if (escaped(document)) return fallback();
  const definitions = new Map(tokens.light);
  if (theme === 'dark') for (const [name, value] of tokens.dark) definitions.set(name, value);
  const via = {}, visited = new Set(), active = new Set(), edges = new Map();
  let invalid = false;
  function visit(name, route, alias = false) {
    if (active.has(name)) { invalid = true; return; }
    if (!definitions.has(name)) { if (alias) invalid = true; return; }
    if (visited.has(name)) return;
    visited.add(name); active.add(name);
    const value = definitions.get(name);
    if (escaped(value)) invalid = true;
    // Every var target, including nested fallbacks, is conservative reachability.
    const targets = [...value.matchAll(/var\(\s*(--[\p{L}\p{N}_-]+)/gu)].map(match => match[1]);
    if ((value.match(/var\(/g) ?? []).length !== targets.length || /var\([^)]*$/.test(value)) invalid = true;
    edges.set(name, targets);
    for (const target of targets) visit(target, [...route, name], true);
    active.delete(name);
  }
  for (const name of roots) visit(name, []);
  if (invalid) return fallback();
  const queue = roots.map(name => ({ name, route: [] }));
  for (let i = 0; i < queue.length; i++) {
    const { name, route } = queue[i];
    if (Object.hasOwn(via, name)) continue;
    via[name] = route;
    for (const target of edges.get(name) ?? []) queue.push({ name: target, route: [...route, name] });
  }
  return { mode: 'reachable_declarations', names: Object.keys(via).sort(), via };
}
