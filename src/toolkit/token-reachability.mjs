import { decodeHTML } from 'entities';
import { parseTokens } from './tokens.mjs';

export function decodeCssEscapes(text) {
  return text.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|[\r\n\f])|([\s\S]))/gi, (_, hex, newline, char) => {
    if (hex) {
      const code = Number.parseInt(hex, 16);
      return String.fromCodePoint(!code || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff ? 0xfffd : code);
    }
    return newline ? '' : char;
  });
}

function forms(text) {
  const css = decodeCssEscapes(text), html = decodeHTML(text);
  return [...new Set([text, css, html, decodeCssEscapes(html), decodeHTML(css)])];
}
// Decoding only adds candidates; raw spellings, text and inactive rules still participate.
const identifiers = text => [...new Set(forms(text).flatMap(value => [...value.matchAll(/--[\p{L}\p{N}_-]+/gu)].map(match => match[0])))];

function unbalancedVar(value) {
  const stack = [];
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '\\') { i++; continue; }
    if (quote) { if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') stack.push(/\bvar$/i.test(value.slice(Math.max(0, i - 3), i)));
    else if (char === ')') stack.pop();
  }
  return stack.includes(true);
}

/** Conservative names/declarations (including absence), shared by candidates and later proofs. */
export function tokenReachability(document, tokenSource, theme) {
  return reachability(identifiers(document).sort(), tokenSource, theme);
}

export function entryTokenReachability(css, tokenSource) {
  const shared = identifiers(css);
  let parsed;
  try { parsed = parseTokens(tokenSource); } catch {}
  return markup => {
    const roots = [...new Set([...shared, ...identifiers(markup)])].sort();
    return theme => reachability(roots, tokenSource, theme, parsed);
  };
}

function reachability(roots, tokenSource, theme, parsed) {
  let tokens, definitions;
  const result = (mode, names, via, fallbackReasons) => ({ mode, names, via,
    declarations: definitions ? Object.fromEntries(names.map(name => [name, definitions.get(name) ?? null])) : {}, fallbackReasons });
  const fallback = reason => result('full_sheet', [...new Set([...roots, ...identifiers(tokenSource)])].sort(), {}, [reason]);
  try { tokens = parsed ?? parseTokens(tokenSource); } catch { return fallback('tokens_parse_failed'); }
  definitions = new Map(tokens.light);
  if (theme === 'dark') for (const [name, value] of tokens.dark) definitions.set(name, value);
  const via = {}, queue = roots.map(name => ({ name, route: [] }));
  for (let i = 0; i < queue.length; i++) {
    const { name, route } = queue[i];
    if (Object.hasOwn(via, name)) continue;
    via[name] = route;
    const value = definitions.get(name);
    if (value === undefined) continue;
    const variants = forms(value);
    if (variants.some(unbalancedVar)) return fallback('unbalanced_var');
    const targets = new Set(variants.flatMap(value => [...value.matchAll(/\bvar\(\s*(--[\p{L}\p{N}_-]+)/giu)].map(match => match[1])));
    for (const target of targets) queue.push({ name: target, route: [...route, name] });
  }
  return result('reachable_declarations', Object.keys(via).sort(), via, []);
}
