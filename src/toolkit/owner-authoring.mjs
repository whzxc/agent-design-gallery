import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { compareNames } from './owner.mjs';

export function orderAuthoredIn(locations, preferred) {
  const priority = [...new Set(preferred)], rank = source => { const i = priority.indexOf(source); return i < 0 ? priority.length : i; };
  return [...new Map(locations.map(location => [JSON.stringify(location), location])).values()]
    .sort((a, b) => rank(a.source) - rank(b.source) || compareNames(a.source, b.source) || a.line - b.line);
}

/** Literal candidates, not source attribution: search only this build's code/data closure. */
export function textAuthoring(config, source, built) {
  const root = realpathSync(config.root), design = realpathSync(config.design);
  const files = [...new Set([source, ...built.dependencies.map(file => path.relative(root, path.isAbsolute(file) ? realpathSync(file) : path.join(design, file)).split(path.sep).join('/'))])]
    .filter(file => /\.(?:[cm]?[jt]sx?|json)$/.test(file)).sort(compareNames);
  const contents = new Map(), literals = new Map();
  return async (match, ownerSources) => {
    const raw = [...new Set(match.fragments.filter(fragment => /\/text-\d+$/.test(fragment.elementPath) && fragment.text.trim()).map(fragment => fragment.text))];
    const locations = [];
    for (const literal of raw) {
      if (!literals.has(literal)) {
        const found = [];
        for (const file of files) {
          if (!contents.has(file)) contents.set(file, await readFile(path.join(root, file), 'utf8'));
          const text = contents.get(file);
          let start = 0, offset;
          while ((offset = text.indexOf(literal, start)) >= 0) {
            found.push({ source: file, line: text.slice(0, offset).split('\n').length });
            start = offset + literal.length;
          }
        }
        literals.set(literal, found);
      }
      locations.push(...literals.get(literal));
    }
    return orderAuthoredIn(locations, [ownerSources[0], source, ...ownerSources].filter(Boolean));
  };
}
