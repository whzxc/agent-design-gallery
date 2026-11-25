import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../cli-output.mjs';
import { themeColorTokens } from '../tokens.mjs';

export const SUPPORTED_KIT_ENGINES = ['react'];
export const RESERVED_KIT_ENGINES = ['vue'];

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRelativePath(value, field, root, { allowTrailingSlash = false } = {}) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CliError('CONFIG_INVALID', `Set ${field} to a non-empty project-root-relative path in adg.config.mjs`);
  }
  const normalizedInput = value.trim().replace(/\\/g, '/');
  if (normalizedInput.startsWith('/') || /^[A-Za-z]:/.test(normalizedInput)) {
    throw new CliError('CONFIG_INVALID', `Set ${field} to a project-root-relative path in adg.config.mjs`);
  }
  const hadTrailingSlash = normalizedInput.endsWith('/');
  const resolved = path.resolve(root, normalizedInput);
  const rel = path.relative(root, resolved).split(path.sep).join('/');
  if (!rel || rel === '.' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
    throw new CliError('CONFIG_INVALID', `Set ${field} to a subdirectory or file inside the project root in adg.config.mjs`);
  }
  const firstSegment = rel.split('/')[0];
  if (firstSegment === '.git' || firstSegment === 'node_modules') {
    throw new CliError('CONFIG_INVALID', `${field} must not target ${firstSegment}/ in adg.config.mjs`);
  }
  return allowTrailingSlash && hadTrailingSlash ? `${rel}/` : rel;
}

function normalizeStringList(value, field) {
  if (value === undefined) return [];
  const items = typeof value === 'string' ? [value] : Array.isArray(value) ? value : null;
  if (!items || items.some(item => typeof item !== 'string' || !item.trim())) {
    throw new CliError('CONFIG_INVALID', `Set ${field} to a path string or array of path strings in adg.config.mjs`);
  }
  return items;
}

export function normalizeKitConfig(raw, root) {
  if (raw === undefined || raw === false || raw === null) return null;
  if (!isPlainObject(raw)) {
    throw new CliError('CONFIG_INVALID', 'Set kit to an object in adg.config.mjs');
  }
  if (RESERVED_KIT_ENGINES.includes(raw.engine)) {
    throw new CliError('CONFIG_INVALID', `Kit engine "${raw.engine}" is reserved for a future ADG adapter and is not yet implemented; supported engines: ${SUPPORTED_KIT_ENGINES.join(', ')}`);
  }
  if (!SUPPORTED_KIT_ENGINES.includes(raw.engine)) {
    throw new CliError('CONFIG_INVALID', `Set kit.engine to a supported engine (${SUPPORTED_KIT_ENGINES.join(', ')}) in adg.config.mjs`);
  }

  const paths = {};
  if (raw.paths !== undefined) {
    if (!isPlainObject(raw.paths)) {
      throw new CliError('CONFIG_INVALID', 'Set kit.paths to an alias map object in adg.config.mjs');
    }
    for (const key of Object.keys(raw.paths).sort()) {
      if (
        !key ||
        key.startsWith('.') ||
        key === 'adg' ||
        key === 'adg:self' ||
        key.startsWith('adg/') ||
        key.startsWith('adg:') ||
        /\s/.test(key)
      ) {
        throw new CliError('CONFIG_INVALID', `Invalid kit.paths alias "${key}" in adg.config.mjs`);
      }
      paths[key] = normalizeRelativePath(raw.paths[key], `kit.paths[${JSON.stringify(key)}]`, root, {
        allowTrailingSlash: key.endsWith('/'),
      });
    }
  }

  const explicitRoots = [];
  if (raw.roots !== undefined) {
    if (!Array.isArray(raw.roots) || raw.roots.some(item => typeof item !== 'string' || !item.trim())) {
      throw new CliError('CONFIG_INVALID', 'Set kit.roots to an array of project-root-relative directory paths in adg.config.mjs');
    }
    for (const item of raw.roots) {
      explicitRoots.push(normalizeRelativePath(item, 'kit.roots', root));
    }
  }

  const ui = [...new Set(normalizeStringList(raw.ui, 'kit.ui').map(item => normalizeRelativePath(item, 'kit.ui', root)))].sort();

  const packageSet = new Set();
  if (raw.packages !== undefined) {
    if (!Array.isArray(raw.packages)) {
      throw new CliError('CONFIG_INVALID', 'Set kit.packages to an array of npm package names in adg.config.mjs');
    }
    for (const pkg of raw.packages) {
      if (
        typeof pkg !== 'string' ||
        !pkg.trim() ||
        pkg !== pkg.trim() ||
        /\s/.test(pkg) ||
        pkg.startsWith('.') ||
        pkg.startsWith('/') ||
        pkg.startsWith('node:')
      ) {
        throw new CliError('CONFIG_INVALID', `Invalid npm package name ${JSON.stringify(pkg)} in kit.packages`);
      }
      packageSet.add(pkg);
    }
  }
  const packages = [...packageSet].sort();

  const tokens = raw.tokens ?? 'tailwind-kit';
  if (!['tailwind-kit', 'strict'].includes(tokens)) {
    throw new CliError('CONFIG_INVALID', 'Set kit.tokens to "tailwind-kit" or "strict" in adg.config.mjs');
  }

  const css = [];
  const seenCss = new Set();
  for (const item of normalizeStringList(raw.css, 'kit.css')) {
    const normalizedCss = normalizeRelativePath(item, 'kit.css', root);
    if (!normalizedCss.endsWith('.css')) {
      throw new CliError('CONFIG_INVALID', `Set kit.css entries to .css file paths in adg.config.mjs (got ${item})`);
    }
    if (!seenCss.has(normalizedCss)) {
      seenCss.add(normalizedCss);
      css.push(normalizedCss);
    }
  }

  const pathRoots = Object.values(paths).map(target => target.replace(/\/+$/, ''));
  const roots = [...new Set([...explicitRoots, ...ui, ...pathRoots])].filter(Boolean).sort();

  return {
    engine: raw.engine,
    paths,
    roots,
    ui,
    packages,
    tokens,
    css,
  };
}

export function isWithinDirectory(candidate, directory) {
  return candidate === directory || candidate.startsWith(directory + path.sep);
}

export function isInNodeModules(file) {
  return file.split(path.sep).includes('node_modules');
}

export function resolveKitAlias(specifier, kit, rootDir) {
  const entries = Object.entries(kit?.paths ?? {});
  for (const [alias, target] of entries) {
    if (!alias.endsWith('/') && specifier === alias) {
      return path.resolve(rootDir, target.replace(/\/+$/, ''));
    }
  }
  let best = null;
  for (const [alias, target] of entries) {
    if (alias.endsWith('/') && specifier.startsWith(alias)) {
      if (!best || alias.length > best[0].length) best = [alias, target];
    }
  }
  if (!best) return null;
  const suffix = specifier.slice(best[0].length).replace(/^\/+/, '');
  return path.resolve(rootDir, best[1], suffix);
}

export function isKitAllowedFile(file, kit, rootDir) {
  if (!kit) return false;
  if (isInNodeModules(file)) return false;
  for (const dir of kit.roots) {
    const resolved = path.resolve(rootDir, dir);
    if (file === resolved || isWithinDirectory(file, resolved)) return true;
  }
  for (const cssFile of kit.css) {
    if (file === path.resolve(rootDir, cssFile)) return true;
  }
  return false;
}

export function isKitUiFile(file, kit, rootDir) {
  if (!kit) return false;
  if (isInNodeModules(file)) return true;
  return kit.ui.some(dir => isWithinDirectory(file, path.resolve(rootDir, dir)));
}

export function matchesAllowedPackage(specifier, packages) {
  return packages.some(pkg => specifier === pkg || specifier.startsWith(pkg + '/'));
}

export function kitWatchDirectories(config) {
  if (!config?.kit) return [];
  const designDir = path.resolve(config.design);
  const candidates = [];
  for (const rel of config.kit.roots) {
    const abs = path.resolve(config.root, rel);
    const dir = statSync(abs, { throwIfNoEntry: false })?.isFile() ? path.dirname(abs) : abs;
    if (existsSync(dir) && statSync(dir, { throwIfNoEntry: false })?.isDirectory()) candidates.push(dir);
  }
  for (const rel of config.kit.css) {
    const dir = path.dirname(path.resolve(config.root, rel));
    if (existsSync(dir) && statSync(dir, { throwIfNoEntry: false })?.isDirectory()) candidates.push(dir);
  }
  const unique = [...new Set(candidates)]
    .filter(dir => dir !== path.resolve(config.root) && !isWithinDirectory(dir, designDir) && !isInNodeModules(dir))
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
  const collapsed = [];
  for (const dir of unique) {
    if (!collapsed.some(parent => isWithinDirectory(dir, parent))) collapsed.push(dir);
  }
  return collapsed;
}

function collectKitCssSources(entryFiles, rootDir) {
  const seen = new Set();
  const sources = [];
  const visit = file => {
    if (seen.has(file) || !isWithinDirectory(file, rootDir) || !existsSync(file)) return;
    seen.add(file);
    const raw = readFileSync(file, 'utf8');
    const clean = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    sources.push(clean);
    for (const match of clean.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?[^;]*;/g)) {
      const spec = match[1].trim();
      if (!spec.startsWith('.')) continue;
      visit(path.resolve(path.dirname(file), spec));
    }
  };
  for (const file of entryFiles) visit(file);
  return sources.join('\n');
}

function extractThemeBlocks(css) {
  const blocks = [];
  const re = /@theme\b[^{;]*\{/g;
  for (let match = re.exec(css); match; match = re.exec(css)) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    if (depth === 0) blocks.push(css.slice(start, i - 1));
    re.lastIndex = i;
  }
  return blocks;
}

export function kitThemeTokenFindings(config, tokens) {
  if (!config?.kit || config.kit.tokens !== 'tailwind-kit' || !config.kit.css?.length || !tokens) return [];
  const entryFiles = config.kit.css.map(rel => path.resolve(config.root, rel));
  const combined = collectKitCssSources(entryFiles, path.resolve(config.root));
  if (!/@import\s+["']tailwindcss["']|@theme\b/.test(combined)) return [];
  const declared = new Set();
  for (const body of extractThemeBlocks(combined)) {
    for (const match of body.matchAll(/(--color-[\w-]+)\s*:/g)) declared.add(match[1]);
  }
  const missing = themeColorTokens(tokens).filter(({ themeVar }) => !declared.has(themeVar));
  if (!missing.length) return [];
  const preview = missing.slice(0, 8).map(({ token, themeVar }) => `${themeVar}: var(${token});`).join(' ');
  const suffix = missing.length > 8 ? ` (+${missing.length - 8} more)` : '';
  return [{
    code: 'KIT_THEME_UNMAPPED',
    source: config.kit.css[0],
    message: `Missing Tailwind @theme inline color mappings (${missing.length}): ${preview}${suffix}`,
    line: null,
    column: null,
  }];
}
