import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseTokens } from './tokens.mjs';
export const starterTokens = `:root {
  --font-ui: system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;
  --canvas: #ffffff;
  --text: #171717;
}
:root[data-theme="dark"] {
  --canvas: #171717;
  --text: #ffffff;
}
`;
const defaultSources = ['components', 'surfaces'];
export function sourceDirectories(config = {}) {
  const sources = config.sources === undefined ? defaultSources : config.sources;
  if (!Array.isArray(sources) || !sources.length || sources.some(name => typeof name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(name))) {
    throw Error('Set sources to a non-empty array of plain top-level directory names in sdg.config.mjs; nesting is not allowed');
  }
  return [...new Set(sources)];
}
const sourceLocations = sources => sources.map(name => `${name}/`).join(', ');
export function refreshTypes(config) {
  mkdirSync(path.join(config.design, '.sdg'), { recursive: true });
  const runtime = readFileSync(new URL('./runtime.d.ts', import.meta.url), 'utf8');
  writeFileSync(path.join(config.design, '.sdg/runtime.d.ts'), runtime);
  writeFileSync(path.join(config.design, '.sdg/assets.d.ts'), `declare module '*?url' { const url: string; export default url; }\ndeclare module '*.svg' { const Art: (props: Record<string, unknown>) => any; export default Art; }\n${['png','jpg','jpeg','webp'].map(ext => `declare module '*.${ext}' { const url: string; export default url; }`).join('\n')}\n`);
}
export const tsconfig = { compilerOptions: { target: 'ESNext', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', jsxImportSource: 'sdg', noEmit: true, strict: true, paths: { sdg: ['./.sdg/runtime.d.ts'], 'sdg/jsx-runtime': ['./.sdg/runtime.d.ts'] } }, include: ['**/*.tsx', '**/*.ts', '.sdg/*.d.ts'] };
export function init(config, log = console.log) {
  config.design ??= path.join(config.root, 'design');
  refreshTypes(config); rejectLegacy(config);
  for (const [file, content] of [
    [path.join(config.root, 'sdg.config.mjs'), "export default { requires: '>=0.4.0', design: 'design', output: 'output/design' };\n"],
    [path.join(config.design, 'tokens.css'), starterTokens],
    ...[...sourceDirectories(config), 'art'].map(name => [path.join(config.design, name), null]),
    [path.join(config.design, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n'],
  ]) {
    if (existsSync(file)) { log(`skipped ${relative(config, file)}`); continue; }
    mkdirSync(content === null ? file : path.dirname(file), { recursive: true });
    if (content !== null) writeFileSync(file, content);
    log(`created ${relative(config, file)}`);
  }
  const ignore = path.join(config.root, '.gitignore');
  let text = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  for (const entry of [`/${relative(config, config.design)}/.sdg/`, `/${relative(config, config.output ?? path.join(config.root, 'output/design'))}/`]) if (!text.split('\n').includes(entry)) text += `\n${entry}\n`;
  writeFileSync(ignore, text);
  refreshTypes(config);
  return 0;
}
export function listSources(directory, sources = defaultSources) {
  return sources.flatMap(name => {
    const base = path.join(directory, name);
    if (!existsSync(base)) return [];
    return readdirSync(base, { withFileTypes: true })
      .filter(entry => entry.isFile() && isSourcePath(`${name}/${entry.name}`, sources))
      .map(entry => path.join(base, entry.name));
  }).sort();
}
export function isSourcePath(name, sources = defaultSources) {
  const slash = name.indexOf('/');
  return slash > 0 && sources.includes(name.slice(0, slash)) && /^[^/.][^/]*\.tsx$/.test(name.slice(slash + 1));
}
export function readGroups(directory, sources = defaultSources) {
  try {
    const data = JSON.parse(readFileSync(path.join(directory, 'gallery.json'), 'utf8'));
    if (!Array.isArray(data.groups) || data.groups.some(group => typeof group.title !== 'string' || !Array.isArray(group.assets))) {
      throw Error('Expected groups with title and assets (relative source paths).');
    }
    for (const group of data.groups) for (const asset of group.assets) {
      // Legacy SVGs remain browsable during staged conversion.
      if (typeof asset !== 'string' || !isSourcePath(asset.replace(/\.svg$/i, '.tsx'), sources)) {
        throw Error(`Invalid source ${asset}; use files directly in ${sourceLocations(sources)}.`);
      }
    }
    return data.groups;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw Error(`gallery.json: ${error.message}`);
  }
}
export function rejectLegacy(config, files) {
  const directories = sourceDirectories(config).map(dir => path.join(config.design, dir));
  files ??= directories.flatMap(base => existsSync(base) ? readdirSync(base).map(name => path.join(base, name)) : []);
  for (const file of files) {
    if (/\.svg$/i.test(file) && directories.includes(path.dirname(file))) {
      const error = Error(`${relative(config, file)}: convert this SVG source to TSX; move artwork to design/art/`);
      error.code = 'LEGACY_SVG';
      throw error;
    }
  }
}
export function selectSources(config, args = []) {
  refreshTypes(config);
  if (!args.length) rejectLegacy(config);
  const directories = sourceDirectories(config);
  readGroups(config.design, directories);
  const sources = listSources(config.design, directories);
  if (!args.length) return sources;
  return args.map(arg => {
    const fromRoot = path.resolve(config.root, arg);
    let file = path.isAbsolute(arg) || fromRoot.startsWith(config.design + path.sep) ? fromRoot : path.resolve(config.design, arg);
    if (existsSync(file)) rejectLegacy(config, [file]);
    if (!file.endsWith('.tsx')) file += '.tsx';
    if (!sources.includes(file)) throw Error(`Invalid source ${arg}; name a TSX file directly in ${directories.map(name => path.join(config.design, name) + '/').join(', ')}`);
    return file;
  });
}
export const relative = (config, file) => path.relative(config.root, file).split(path.sep).join('/');
export function loadTokens(config) {
  try { return parseTokens(readFileSync(path.join(config.design, 'tokens.css'), 'utf8')); }
  catch (error) { throw Error(`${error.message}; fix design/tokens.css or run sdg init`); }
}
