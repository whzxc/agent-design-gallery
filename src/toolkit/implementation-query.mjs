import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { portablePath, selectorMatches, resolveLocator, symbolRegions, regionAt, sourceLineCount } from './owner-locators.mjs';

export async function normalizeFileQuery(config, values) {
  const root = await realpath(config.root), input = values.file;
  if (typeof input !== 'string' || !input.trim()) throw new CliError('USAGE_INVALID', 'Set one nonempty --file input.');
  let absolute = path.resolve(root, input);
  if (path.isAbsolute(input) && !/[?*]/.test(input)) {
    try { absolute = await realpath(input); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; throw new CliError('OWNER_INPUT_NOT_FOUND', 'Ownership input does not name an existing file or directory.'); }
  }
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new CliError('USAGE_INVALID', 'Ownership input must stay inside the project root.');
  let pathKind, normalized = relative;
  if (/[?*]/.test(relative)) {
    if (!portablePath(relative, { glob: true })) throw new CliError('USAGE_INVALID', 'Use a POSIX glob with *, ? and whole-segment **.');
    pathKind = 'glob';
  } else {
    let info;
    try { info = await stat(absolute); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; throw new CliError('OWNER_INPUT_NOT_FOUND', 'Ownership input does not name an existing file or directory.'); }
    const physical = path.relative(root, await realpath(absolute));
    if (physical === '..' || physical.startsWith('..' + path.sep) || path.isAbsolute(physical)) throw new CliError('USAGE_INVALID', 'Ownership input resolves outside the project root.');
    if (!info.isFile() && !info.isDirectory()) throw new CliError('USAGE_INVALID', 'Choose a regular implementation file or directory.');
    pathKind = info.isDirectory() ? 'directory' : 'file';
    if (pathKind === 'directory') normalized = relative ? relative + '/' : './';
  }
  const line = values.line === undefined ? null : Number(values.line), symbol = values.symbol ?? null;
  if ((line !== null || symbol !== null) && pathKind !== 'file') throw new CliError('USAGE_INVALID', '--line and --symbol require a single file.');
  const text = line !== null || symbol !== null ? await readFile(absolute, 'utf8') : null;
  if (line !== null && (!Number.isSafeInteger(line) || line < 1 || line > sourceLineCount(text))) throw new CliError('USAGE_INVALID', '--line must name an existing 1-based line in the implementation file.');
  if (values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme)) throw new CliError('USAGE_INVALID', 'Use --theme=both, light or dark.');
  return { query: { kind: 'file', input, normalized, pathKind, line, symbol, contains: false, locale: null, themes: !values.theme || values.theme === 'both' ? ['light', 'dark'] : [values.theme], rgba: null }, text };
}


/** Reuse owner's exact file/symbol/region scoping without starting its collector. */
export function implementationScope(map, query, text, files, { includeStale = false } = {}) {
  const selectors = map.mappings.map(mapping => mapping.implementation).filter(s => s.file === query.normalized && s.symbol);
  const region = text === null ? null : regionAt(symbolRegions(text, query.normalized, selectors), query.line ?? 1);
  const mappingIndices = new Set();
  map.mappings.forEach((mapping, i) => {
    const s = mapping.implementation;
    if (!files.some(file => selectorMatches(s, file))) return;
    if (s.symbol && query.symbol !== null && s.symbol !== query.symbol) return;
    if (s.symbol && query.line !== null) {
      const locator = resolveLocator(text, s);
      if (!(includeStale && locator.stale) && (region?.line !== locator.line || !region?.mapped.includes(s.symbol))) return;
    }
    mappingIndices.add(i);
  });
  return { mappingIndices, region };
}
