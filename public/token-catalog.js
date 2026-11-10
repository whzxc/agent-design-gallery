import { icon } from './icons.js';

const categories = [
  ['Colors', 'palette'], ['Typography', 'type'], ['Spacing & size', 'ruler'], ['Radii', 'corner-up-right'],
  ['Shadows', 'layers'], ['Motion', 'timer'], ['Other', 'list'],
];

function resolveValue(name, values) {
  const seen = new Set();
  while (!seen.has(name)) {
    seen.add(name);
    const value = values.get(name) ?? '';
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
    if (!alias) return value;
    name = alias[1];
  }
  return '';
}

function isColor(value) {
  return !/\bvar\(/i.test(value) && !/^(?:inherit|initial|revert|revert-layer|unset|currentcolor)$/i.test(value) && CSS.supports('color', value);
}

function categoryFor(name, value) {
  if (isColor(value)) return 'Colors';
  if (/^--(?:font|text|leading|tracking|line-height|letter-spacing)(?:-|$)/.test(name)) return 'Typography';
  if (/^--radius(?:-|$)/.test(name)) return 'Radii';
  if (/^--shadow(?:-|$)/.test(name)) return 'Shadows';
  if (/(?:^|-)(?:duration|delay|easing|motion|transition|animation)(?:-|$)/.test(name) || /^-?[\d.]+m?s$/i.test(value)) return 'Motion';
  if (/(?:^|-)(?:space|spacing|size|gap|width|height|padding|margin|inset)(?:-|$)/.test(name) ||
      /^-?[\d.]+(?:px|rem|em|ch|ex|vw|vh|vmin|vmax|%)$/i.test(value)) return 'Spacing & size';
  return 'Other';
}

export function groupTokens(tokens) {
  const light = new Map(tokens.map(([name, value]) => [name, value]));
  const dark = new Map(tokens.map(([name, value, override]) => [name, override ?? value]));
  const grouped = Map.groupBy(tokens.map(([name, value, override]) => ({
    name, light: value, dark: override ?? value, inherited: override === null,
    lightPreview: resolveValue(name, light), darkPreview: resolveValue(name, dark),
  })), row => categoryFor(row.name, row.lightPreview || row.darkPreview));
  return categories.filter(([label]) => grouped.has(label)).map(([label, glyph]) => ({ label, glyph, rows: grouped.get(label) }));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function valuePreview(group, value) {
  let preview;
  if (group === 'Colors' && isColor(value)) {
    preview = element('span', 'token-swatch');
    preview.style.backgroundColor = value;
  } else if (/^(?:\d+(?:\.\d+)?|\.\d+)px$/i.test(value) || value === '0') {
    if (group === 'Spacing & size' && parseFloat(value) > 0) {
      preview = element('span', 'token-length');
      const length = element('span');
      length.style.width = value;
      preview.append(length);
    } else if (group === 'Radii') {
      preview = element('span', 'token-radius');
      preview.style.borderRadius = value;
    }
  }
  preview?.setAttribute('aria-hidden', 'true');
  return preview;
}

function valueCell(group, value, resolved, inherited = false) {
  const cell = element('td'), content = element('div', 'token-value');
  const code = element('code', '', value), preview = valuePreview(group, resolved);
  if (inherited) code.title = 'Inherits light declaration';
  if (preview) content.append(preview);
  content.append(code);
  cell.append(content);
  return cell;
}

function tokenName(name, onCopyError) {
  const cell = element('th'), button = element('button', 'token-copy'), glyph = element('span');
  cell.scope = 'row';
  button.type = 'button';
  button.setAttribute('aria-label', `Copy ${name}`);
  glyph.innerHTML = icon('copy', 12);
  button.append(element('code', '', name), glyph);
  let timer;
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(name);
      button.setAttribute('data-copied', '');
      button.setAttribute('aria-label', `Copied ${name}`);
      glyph.innerHTML = icon('check', 12);
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.removeAttribute('data-copied');
        button.setAttribute('aria-label', `Copy ${name}`);
        glyph.innerHTML = icon('copy', 12);
      }, 1200);
      onCopyError(null);
    } catch (error) { onCopyError(error); }
  };
  cell.append(button);
  return cell;
}

export function renderTokenTable(panel, data, category, query, onCopyError) {
  const source = panel.querySelector('#token-source'), table = panel.querySelector('table'), status = panel.querySelector('#token-status');
  source.title = source.textContent = data.tokenSource;
  const bodies = [];
  for (const { label, rows } of data.tokenGroups) {
    if (category && category !== label) continue;
    const matches = rows.filter(row => !query || [row.name, row.light, row.dark].some(value => value.toLowerCase().includes(query)));
    if (!matches.length) continue;
    const body = element('tbody'), heading = body.insertRow(), title = element('th', '', label);
    title.scope = 'rowgroup';
    title.colSpan = 3;
    heading.append(title);
    for (const row of matches) body.insertRow().append(tokenName(row.name, onCopyError),
      valueCell(label, row.light, row.lightPreview), valueCell(label, row.dark, row.darkPreview, row.inherited));
    bodies.push(body);
  }
  table.replaceChildren(table.tHead, ...bodies);
  table.hidden = !bodies.length;
  status.hidden = !!bodies.length;
  status.textContent = data.tokenError ?? 'No matching tokens.';
}
