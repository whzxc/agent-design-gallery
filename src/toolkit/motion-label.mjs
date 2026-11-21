import path from 'node:path';
import { existsSync } from 'node:fs';
import { parseFragment } from 'parse5';
import { candidates } from '../../public/motion-identity.js';
import { relative } from './project.mjs';
import { buildSource } from './build.mjs';

function targetName(html, design, target) {
  if (!html || target.frame) return '';
  const rows = [],
    ids = new Map();
  function visit(node, parent) {
    if (!node.tagName) return;
    const attrs = Object.fromEntries(node.attrs.map((a) => [a.name, a.value]));
    const i = rows.length;
    const parts = JSON.parse(attrs['data-adg-owners'] ?? '[]').map(
      (o) => [design, o.source].filter(Boolean).join('/') + '#' + o.export
    );
    rows.push({
      i,
      parent,
      node,
      attrs,
      parts,
      keys: JSON.parse(attrs['data-adg-keys'] ?? '[]'),
      anchor: attrs['data-adg-id']
    });
    if (attrs.id) ids.set(attrs.id, node);
    for (const child of node.childNodes) visit(child, i);
  }
  for (const node of parseFragment(html).childNodes) visit(node, -1);
  const hits = candidates(rows, target);
  if (hits.length !== 1) return '';
  const [row] = hits;
  function contents(node, referenced = false) {
    if (!node) return '';
    if (!node.tagName) return node.value ?? '';
    const attrs = Object.fromEntries(node.attrs.map((attr) => [attr.name, attr.value]));
    if (!referenced && (attrs.hidden !== undefined || attrs['aria-hidden'] === 'true')) return '';
    if (attrs['aria-label']) return attrs['aria-label'];
    if (node.tagName === 'img') return attrs.alt ?? '';
    return node.childNodes.map((child) => contents(child, referenced)).join('');
  }
  const a = row.attrs;
  const labelled = (a['aria-labelledby'] ?? '')
    .split(/\s+/)
    .map((id) => contents(ids.get(id), true))
    .join(' ')
    .trim();
  const labels = a.id ? rows.filter((r) => r.node.tagName === 'label' && r.attrs.for === a.id) : [];
  for (let p = rows[row.parent]; p; p = rows[p.parent]) {
    if (p.node.tagName === 'label' && !p.attrs.for) { labels.push(p); break; }
  }
  return (
    labelled ||
    a['aria-label'] ||
    labels.map((r) => contents(r.node)).join(' ') ||
    a.alt ||
    (row.node.tagName === 'input' && ['button', 'submit', 'reset'].includes(a.type) ? a.value : '') ||
    contents(row.node) ||
    a.title ||
    a.placeholder ||
    ''
  )
    .trim()
    .replace(/\s+/g, ' ');
}

export function edgePresentation(edge, html, design) {
  const t = edge.trigger;
  const name = t.on === 'key' ? '' : targetName(html, design, t.target);
  const target = name ? '“' + name + '”' : t.target.frame ? 'this frame' : 'the highlighted element';
  const key =
    {
      Escape: 'Esc',
      ArrowUp: 'Up Arrow',
      ArrowDown: 'Down Arrow',
      ArrowRight: 'Right Arrow',
      ArrowLeft: 'Left Arrow',
      ' ': 'Space'
    }[t.key] ?? t.key;
  const gesture = {
    click: 'Click ' + target,
    hover: 'Hover over ' + target,
    focus: 'Focus ' + target,
    key: 'Press ' + key,
    input: 'Enter “' + (t.value ?? '') + '” in ' + target
  }[t.on];
  return { label: edge.label ?? gesture, gesture };
}

export function labelResolver(
  config,
  getBuild = (source) => buildSource(config, path.join(config.root, source), { write: false })
) {
  const builds = new Map();
  return async (record) => {
    if (!record?.valid) return record?.edge?.label;
    const e = record.edge;
    if (e.label) return e.label;
    if (e.trigger.on === 'key' || !existsSync(path.join(config.root, e.from.source)))
      return edgePresentation(e, null, '').label;
    if (!builds.has(e.from.source)) builds.set(e.from.source, getBuild(e.from.source));
    const built = await builds.get(e.from.source);
    return edgePresentation(
      e,
      built?.frames.find((f) => f.name === e.from.frame)?.html,
      relative(config, config.design)
    ).label;
  };
}
