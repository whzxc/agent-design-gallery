import { parse } from 'parse5';
import { escape } from '../toolkit/html.mjs';
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
function index(html) {
  const nodes = [], byKey = new Map();
  const visit = (node, landmark = 'document', steps = []) => {
    if (node.tagName) {
      const specimen = attr(node, 'data-specimen');
      if (specimen) { landmark = specimen; steps = []; }
      const key = `${landmark}|${steps.join('>')}`;
      nodes.push({ node, key, specimen: landmark });
      byKey.set(key, byKey.has(key) ? null : node);
    }
    const seen = {};
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      seen[child.tagName] = (seen[child.tagName] ?? 0) + 1;
      visit(child, landmark, [...steps, `${child.tagName}:${seen[child.tagName]}`]);
    }
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  return { nodes, byKey };
}
export function carryAnchors(oldHtml, newHtml) {
  const before = index(oldHtml), after = index(newHtml), inserts = [], kept = [], orphaned = [];
  for (const { node, key, specimen } of before.nodes) {
    const id = attr(node, 'data-doop-id');
    if (!id) continue;
    const target = after.byKey.get(key), location = target?.sourceCodeLocation?.startTag;
    const record = { id, key, specimen };
    if (!location || target.tagName !== node.tagName || (attr(target, 'data-doop-id') && attr(target, 'data-doop-id') !== id)) { orphaned.push(record); continue; }
    kept.push(record);
    if (attr(target, 'data-doop-id') === id) continue;
    const at = location.endOffset - (newHtml.slice(location.endOffset - 2, location.endOffset) === '/>' ? 2 : 1);
    inserts.push([at, ` data-doop-id="${escape(id)}"`]);
  }
  let html = newHtml;
  for (const [at, value] of inserts.sort((a, b) => b[0] - a[0])) html = html.slice(0, at) + value + html.slice(at);
  return { html, kept, orphaned };
}
