// Adapted from ARC tooling/design.mjs (MIT; see LICENSE).
export const BEGIN = '<!-- design:tokens -->';
export const END = '<!-- /design:tokens -->';
const THEMES = ['light', 'dark'];

export function parseTokens(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  if (blocks.length !== 2 || source.replace(/[^{}]+\{[^{}]*\}/g, '').trim() ||
      blocks[0][1].trim() !== ':root' || blocks[1][1].trim() !== ':root[data-theme="dark"]') {
    throw new Error('tokens.css needs exactly :root and :root[data-theme="dark"] blocks; fix the token source');
  }
  const maps = blocks.map(([, , body]) => {
    const map = new Map();
    for (const line of body.split('\n').map(line => line.trim()).filter(Boolean)) {
      const match = line.match(/^(--[\w-]+)\s*:\s*([^;]+);$/);
      if (!match || map.has(match[1])) throw new Error(`Invalid token declaration ${line}; put each unique token on its own line`);
      map.set(match[1], match[2].trim());
    }
    return map;
  });
  for (const key of ['--font-ui', '--font-mono', '--text-caption', '--text-tertiary', '--canvas']) {
    if (!maps[0].has(key)) throw new Error(`tokens.css is missing ${key}; add it to :root`);
  }
  for (const key of maps[1].keys()) if (!maps[0].has(key)) throw new Error(`Dark token ${key} has no light value; add it to :root`);
  return { light: maps[0], dark: maps[1] };
}

// Splits a box-shadow list into SVG drop-shadow layers; spread and inset have no SVG filter equivalent.
export function shadowLayers(value) {
  const layers = [];
  let depth = 0, current = '';
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) { layers.push(current.trim()); current = ''; } else current += char;
  }
  if (depth !== 0) throw new Error('Unbalanced shadow color; close its parentheses in tokens.css');
  layers.push(current.trim());
  return layers.map(layer => {
    const match = layer.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?\s+(-?(?:\d+(?:\.\d+)?|\.\d+))(?:px)?\s+((?:\d+(?:\.\d+)?|\.\d+))(?:px)?\s+(\S.*)$/);
    if (!match || /^(?:inset\b|[-\d.]+(?:px)?(?:\s|$))/.test(match[4]) || /\binset\b/.test(layer)) throw new Error(`Shadow layer "${layer}" must be "<x> <y> <blur> <color>"; remove spread and inset`);
    return { dx: +match[1], dy: +match[2], blur: +match[3], color: match[4] };
  });
}

const shadowFilter = (id, value) => {
  const layers = shadowLayers(value);
  const primitives = layers.map(({ dx, dy, blur, color }, i) =>
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur / 2}"/><feOffset dx="${dx}" dy="${dy}" result="o${i}"/><feFlood style="flood-color:${color}"/><feComposite in2="o${i}" operator="in" result="s${i}"/>`).join('');
  const merge = layers.map((_, i) => `<feMergeNode in="s${i}"/>`).join('');
  return `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${primitives}<feMerge>${merge}<feMergeNode in="SourceGraphic"/></feMerge></filter>`;
};

export function tokenRegion(tokens) {
  const shadows = [...tokens.light.keys()].filter(key => key.startsWith('--shadow-'));
  const declarations = (map, theme) => [...map].map(([key, value]) => `${key}:${value}`)
    .concat(shadows.map(key => `--elev-${key.slice('--shadow-'.length)}:url(#elev-${key.slice('--shadow-'.length)}-${theme})`)).join(';');
  const dark = declarations(tokens.dark, 'dark');
  const style = [
    `:root{${declarations(tokens.light, 'light')}}`,
    `:root[data-theme="dark"]{${dark}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme]){${dark}}}`,
    'text{font-family:var(--font-ui);dominant-baseline:central}',
    '.only-dark{display:none}',
    ':root[data-theme="dark"] .only-light{display:none}:root[data-theme="dark"] .only-dark{display:inline}',
    '@media (prefers-color-scheme: dark){:root:not([data-theme]) .only-light{display:none}:root:not([data-theme]) .only-dark{display:inline}}',
    '.mono{font-family:var(--font-mono)}',
    '.note{font-family:var(--font-mono);font-size:var(--text-caption);fill:var(--text-tertiary)}',
  ].join('\n');
  const filters = THEMES.flatMap(theme => shadows.map(key => {
    const value = tokens[theme].get(key) ?? tokens.light.get(key);
    return shadowFilter(`elev-${key.slice('--shadow-'.length)}-${theme}`, value);
  })).join('\n');
  return `${BEGIN}\n<style>\n${style}\n</style>\n<defs data-design-tokens="">\n${filters}\n</defs>\n${END}`;
}

export function syncSvg(svg, region) {
  const start = svg.indexOf(BEGIN), end = svg.indexOf(END);
  if ((start >= 0) !== (end >= 0) || (end >= 0 && end < start)) throw new Error('Broken token markers; restore both design:tokens comments before running sdg sync');
  if (start >= 0 && end > start) return svg.slice(0, start) + region + svg.slice(end + END.length);
  const root = svg.search(/<svg\b/);
  const open = root < 0 ? -1 : svg.indexOf('>', root);
  if (open < 0) throw new Error('Asset has no <svg> root');
  return `${svg.slice(0, open + 1)}\n${region}${svg.slice(open + 1)}`;
}
