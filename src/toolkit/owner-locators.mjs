import path from 'node:path';

const javascript = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const declaration = '^export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Lexical boundaries deliberately follow declaration lines, not parsed scopes. */
export function exportBoundaries(text, file) {
  if (!javascript.test(file)) return [];
  return text.replaceAll('\r\n', '\n').split('\n').flatMap((line, index) => {
    const match = new RegExp(declaration + '([\\p{ID_Start}_$][\\p{ID_Continue}$]*)', 'u').exec(line);
    return match ? [{ line: index + 1, symbol: match[1] }] : [];
  });
}

export function resolveLocator(text, selector) {
  text = text.replaceAll('\r\n', '\n');
  if (!selector.symbol) return { line: null, candidates: [], stale: false };
  const candidates = [];
  if (selector.anchor !== undefined) {
    let start = 0, index;
    const anchor = selector.anchor.replaceAll('\r\n', '\n');
    while ((index = text.indexOf(anchor, start)) !== -1) {
      candidates.push(text.slice(0, index).split('\n').length);
      start = index + 1;
    }
  } else if (javascript.test(selector.file)) {
    const pattern = new RegExp(declaration + escape(selector.symbol) + '\\b', 'u');
    text.split('\n').forEach((line, index) => { if (pattern.test(line)) candidates.push(index + 1); });
  }
  return { line: candidates.length === 1 ? candidates[0] : null, candidates, stale: candidates.length !== 1 };
}

export function symbolRegions(text, file, selectors) {
  const boundaries = new Map(exportBoundaries(text, file).map(item => [item.line, { ...item, mapped: [] }]));
  for (const selector of selectors) {
    const locator = resolveLocator(text, selector);
    if (locator.line !== null) {
      const boundary = boundaries.get(locator.line) ?? { line: locator.line, symbol: selector.symbol, mapped: [] };
      if (!boundary.mapped.includes(selector.symbol)) boundary.mapped.push(selector.symbol);
      boundaries.set(locator.line, boundary);
    }
  }
  const result = [...boundaries.values()].sort((a, b) => a.line - b.line);
  return result.map((boundary, index) => ({ ...boundary, nextBoundaryLine: result[index + 1]?.line ?? text.replaceAll('\r\n', '\n').split('\n').length + 1 }));
}

export function regionAt(regions, line) {
  return regions.findLast(region => region.line <= line) ?? null;
}

export function portablePath(value, { directory = false, glob = false } = {}) {
  if (typeof value !== 'string' || !value.trim() || /[\\:#\x00-\x1f\x7f]/.test(value) || path.posix.isAbsolute(value)) return false;
  const candidate = directory && value.endsWith('/') ? value.slice(0, -1) : value;
  if (directory && !value.endsWith('/')) return false;
  if (candidate.split('/').some(segment => !segment || segment === '.' || segment === '..')) return false;
  if (!glob) return !/[?*]/.test(candidate);
  if (/[\[\]{}()!]/.test(candidate)) return false;
  return candidate.split('/').every(segment => !segment.includes('**') || segment === '**');
}

export function globPattern(glob) {
  return new RegExp('^' + glob.split('/').map((segment, index, all) => {
    if (segment === '**') return index === all.length - 1 ? '.*' : '(?:[^/]+/)*';
    return [...segment].map(char => char === '*' ? '[^/]*' : char === '?' ? '[^/]' : escape(char)).join('') + (index === all.length - 1 ? '' : '/');
  }).join('') + '$');
}
