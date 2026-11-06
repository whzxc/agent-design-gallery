import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseTokens, tokenRegion, syncSvg } from './tokens.mjs';

export const starterTokens = `:root {
  --font-ui: system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
  --text-caption: 11px;
  --text-tertiary: #737373;
  --canvas: #ffffff;
}
:root[data-theme="dark"] {
  --text-tertiary: #a3a3a3;
  --canvas: #171717;
}
`;
export function init(config, log = console.log) {
  for (const [file, content] of [
    ['sdg.config.mjs', "export default { requires: '>=0.3.0', design: 'design', output: 'output/design' };\n"],
    ['design/tokens.css', starterTokens], ['design/components/', null], ['design/surfaces/', null],
  ]) {
    const target = path.join(config.root, file);
    if (existsSync(target)) { log(`skipped ${file}`); continue; }
    if (content === null) mkdirSync(target, { recursive: true });
    else { mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, content, { flag: 'wx' }); }
    log(`created ${file}`);
  }
  return 0;
}
export function listAssets(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? listAssets(file) : entry.isFile() && entry.name.endsWith('.svg') ? [file] : [];
  }).sort();
}
export function selectAssets(config, args) {
  if (!args.length) return listAssets(config.design);
  return args.map(arg => {
    const fromRoot = path.resolve(config.root, arg);
    const file = path.isAbsolute(arg) || fromRoot.startsWith(config.design + path.sep) ? fromRoot : path.resolve(config.design, arg);
    if (!file.startsWith(config.design + path.sep) || !file.endsWith('.svg') || !existsSync(file)) throw new Error(`Invalid asset ${arg}; name an existing SVG under ${config.design}`);
    return file;
  });
}
export const relative = (config, file) => path.relative(config.root, file).split(path.sep).join('/');
export function loadTokens(config) {
  try { return parseTokens(readFileSync(path.join(config.design, 'tokens.css'), 'utf8')); }
  catch (error) { throw new Error(`${error.message}; fix ${path.join(config.design, 'tokens.css')} or run sdg init`); }
}
export function sync(config, log = console.log) {
  const region = tokenRegion(loadTokens(config));
  let changed = 0;
  for (const file of listAssets(config.design)) {
    const before = readFileSync(file, 'utf8'), after = syncSvg(before, region);
    if (before !== after) { writeFileSync(file, after); changed++; log(`synced ${relative(config, file)}`); }
  }
  log(`${changed} asset${changed === 1 ? '' : 's'} updated.`);
  return 0;
}
export function svgSize(svg) {
  const root = svg.match(/<svg\b[^>]*>/)?.[0];
  const number = key => Number(root?.match(new RegExp(`\\b${key}=["'](\\d+(?:\\.\\d+)?)["']`))?.[1]);
  const width = number('width'), height = number('height');
  const viewBox = root?.match(/\bviewBox=["']([^"']+)["']/)?.[1].trim().split(/[\s,]+/).map(Number);
  if (!(width > 0 && height > 0) || viewBox?.length !== 4 || !viewBox.every(Number.isFinite) || viewBox[2] <= 0 || viewBox[3] <= 0) throw new Error('Asset needs numeric width, height and viewBox; fix its <svg> root');
  return { width: Math.ceil(width), height: Math.ceil(height) };
}
