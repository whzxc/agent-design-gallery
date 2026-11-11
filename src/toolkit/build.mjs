import { build, transform } from 'esbuild';
import { compile } from 'tailwindcss';
import { statSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTokens, refreshTypes, rejectLegacy, relative, isSourcePath, sourceDirectories } from './project.mjs';
import { themeCss, parseTokens } from './tokens.mjs';
import { escape, componentOwner } from './runtime.mjs';
import { CliError, classifyError } from '../cli-output.mjs';
const require = createRequire(import.meta.url);
const runtime = fileURLToPath(new URL('./runtime.mjs', import.meta.url));
const tailwind = path.dirname(require.resolve('tailwindcss/package.json'));
// Imported source entries recur in many bundles. Retain their registration
// transforms by exact content, including pending work, without retaining a
// project's entire build graph or trusting modification times.
const sourceTransforms = new Map();
let transformBytes = 0;
const transformLimit = 8 * 1024 * 1024;
function forgetTransform(file) {
  const entry = sourceTransforms.get(file);
  if (entry) { transformBytes -= entry.bytes; sourceTransforms.delete(file); }
}
async function registeredSource(file, sourcePath, original) {
  let entry = sourceTransforms.get(file);
  if (entry?.original === original && entry.sourcePath === sourcePath) {
    sourceTransforms.delete(file); sourceTransforms.set(file, entry);
    return entry.result;
  }
  forgetTransform(file);
  entry = { original, sourcePath, bytes: Buffer.byteLength(original) * 2, result: null };
  entry.result = (async () => {
    // esbuild's normalized export list supplies public names; static namespace
    // accesses preserve aliases and let the bundler drop imported frame renderers.
    const compiled = await transform(original, {loader:'tsx',format:'esm',jsx:'preserve'});
    const names = [...compiled.code.matchAll(/\nexport\s*\{([^}]+)\}\s*;\s*$/g)].flatMap(match => match[1].split(',').map(item => item.trim().split(/\s+as\s+/).at(-1)).filter(name => name && name !== 'default'));
    const registrations = names.map(name => `__adgRegister(__adgExports[${JSON.stringify(name)}],${JSON.stringify(sourcePath)},${JSON.stringify(name)});`).join('\n');
    const contents = `${original}
import * as __adgExports from 'adg:self';
import {registerComponent as __adgRegister} from 'adg';
${registrations}
`;
    // Account for the generated text too; large individual sources need not
    // occupy the cache even though their current callers can finish normally.
    if (sourceTransforms.get(file) === entry) {
      transformBytes += Buffer.byteLength(contents) - Buffer.byteLength(original);
      entry.bytes = Buffer.byteLength(original) + Buffer.byteLength(contents);
      trimTransforms();
    }
    return {contents,loader:'tsx'};
  })();
  sourceTransforms.set(file, entry); transformBytes += entry.bytes;
  trimTransforms();
  try { return await entry.result; }
  catch (error) { if (sourceTransforms.get(file) === entry) forgetTransform(file); throw error; }
}
function trimTransforms() {
  while (sourceTransforms.size > 256 || transformBytes > transformLimit)
    forgetTransform(sourceTransforms.keys().next().value);
}
export function validateFrame(frame) {
  if (!frame?.frame || typeof frame.name !== 'string' || !frame.name.trim()) throw Error('Default export must return named Frames');
  for (const key of ['width', 'height']) if (frame[key] !== undefined && !(Number.isFinite(frame[key]) && frame[key] > 0)) throw Error(`Invalid Frame ${key}; use positive CSS pixels`);
  if (frame.locale !== undefined) {
    try { if (typeof frame.locale !== 'string' || !frame.locale.trim()) throw Error(); frame.locale = Intl.getCanonicalLocales(frame.locale)[0]; }
    catch { throw Error('Invalid Frame locale; use a BCP 47 language tag.'); }
  }
  const parent = frame.parent;
  if (parent !== undefined) {
    if (!parent || typeof parent !== 'object' || Array.isArray(parent) ||
      Object.keys(parent).some(key => !['source', 'frame', 'selector'].includes(key)) ||
      ['source', 'frame', 'selector'].some(key => typeof parent[key] !== 'string' || !parent[key].trim()) ||
      !/\.(tsx|mmd)$/.test(parent.source) || /[\\:]|^\//.test(parent.source) ||
      parent.source.split('/').some(part => ['', '.', '..'].includes(part))) {
      throw Error('Invalid Frame parent; use project-relative source, frame and selector strings');
    }
  }
  const c = frame.capture;
  if (c !== undefined) {
    if (!c || typeof c !== 'object' || ['region','selector','page'].filter(k => c[k] !== undefined).length !== 1 || (c.page !== undefined && c.page !== true) || ['region','selector'].some(k => c[k] !== undefined && (typeof c[k] !== 'string' || !c[k].trim())) || (c.viewport !== undefined && !/^[1-9]\d*x[1-9]\d*$/.test(c.viewport)) || (c.origin !== undefined && (!c.page || !/^\d+(?:\.\d+)? \d+(?:\.\d+)?$/.test(c.origin))) || (c.clicks !== undefined && (!Array.isArray(c.clicks) || c.clicks.some(v => typeof v !== 'string' || !v)))) throw Error('Invalid capture; use region, selector or page with viewport, origin and clicks');
  }
}
export async function buildSource(config, file, options = {}) {
  try { return await buildDesignSource(config, file, options); }
  catch (error) {
    if (error instanceof CliError) throw error;
    const code = classifyError(error).error.code;
    throw new CliError(code === 'INTERNAL_ERROR' ? 'SOURCE_BUILD_FAILED' : code, error.message, { cause: error });
  }
}
async function buildDesignSource(config, file, { write = true, allowLegacy = true, snapshot, browser } = {}) {
  if (file.endsWith('.mmd')) return (await import('./arch.mjs')).buildArch(config,file,{snapshot,browser});
  if (write) refreshTypes(config);
  const read = (name, encoding) => {
    if (!snapshot) return readFileSync(name, encoding);
    if (!snapshot.has(name)) snapshot.set(name, readFileSync(name));
    const value = snapshot.get(name);
    return encoding ? value.toString(encoding) : value;
  };
  file = realpathSync(file);
  const base = realpathSync(config.design), dependencies = new Set([path.join(base, 'tokens.css')]);
  const imports = new Set(), sources = sourceDirectories(config);
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', jsxImportSource: 'adg', jsxDev: true, metafile: true, logLevel: 'silent', plugins: [{ name: 'adg-sources', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      if (args.path === 'adg:self') return {path:args.importer};
      if (['adg','adg/jsx-runtime','adg/jsx-dev-runtime'].includes(args.path)) return { path: pathToFileURL(runtime).href, external: true };
      if (args.kind !== 'entry-point' && !args.path.startsWith('.')) return { errors: [{ text: `Bare import ${args.path} is unavailable; import adg or a relative file inside design/` }] };
      const url = args.path.endsWith('?url');
      const requested = url ? args.path.slice(0,-4) : args.path;
      let resolved = args.kind === 'entry-point' ? path.resolve(requested) : path.resolve(args.resolveDir, requested);
      resolved = [resolved, ...['.tsx','.ts','.js','/index.tsx','/index.ts','/index.js'].map(ext => resolved + ext)].find(candidate => statSync(candidate, { throwIfNoEntry: false })?.isFile());
      if (!resolved) return { errors: [{ text: `Cannot resolve ${args.path}` }] };
      resolved = realpathSync(resolved);
      if (!resolved.startsWith(base + path.sep)) return { errors: [{ text: `Import ${args.path} leaves design/; move it inside design/` }] };
      if (!allowLegacy) rejectLegacy(config, [path.join(config.design, path.relative(base, resolved))]);
      dependencies.add(resolved);
      const sourcePath = path.relative(base, resolved).split(path.sep).join('/');
      if (args.importer === file && isSourcePath(sourcePath, sources)) imports.add(sourcePath);
      if (url && !resolved.startsWith(path.join(base,'art')+path.sep)) return {errors:[{text:'?url imports must be under design/art/'}]};
      return { path: resolved, ...(url ? {namespace:'art-url'} : {}) };
    });
    api.onLoad({filter:/.*/,namespace:'art-url'}, args => ({contents:read(args.path),loader:'dataurl'}));
    api.onLoad({filter:/\.tsx$/}, async args => {
      const sourcePath = path.relative(base, args.path).split(path.sep).join('/');
      if (!isSourcePath(sourcePath, sources)) return snapshot ? {contents:read(args.path,'utf8'),loader:'tsx'} : undefined;
      const original=read(args.path,'utf8');
      return registeredSource(args.path, sourcePath, original);
    });
    if (snapshot) api.onLoad({filter:/\.(?:[cm]?js|jsx|ts|json)$/}, args => ({contents:read(args.path,'utf8'),loader:args.path.endsWith('.ts')?'ts':args.path.endsWith('.jsx')?'jsx':args.path.endsWith('.json')?'json':'js'}));
    api.onLoad({ filter: /\.(png|jpe?g|webp)$/i }, args => ({ contents: read(args.path), loader: 'dataurl' }));
    api.onLoad({ filter: /\.svg$/i }, args => {
      const source = read(args.path,'utf8');
      const forbidden = /<(?:style|script)\b|\s(?:on[\w-]+|className)\s*=/i.exec(source);
      if (forbidden) { const before=source.slice(0,forbidden.index); return {errors:[{text:'Forbidden SVG markup; remove styles, scripts and event attributes',location:{file:args.path,line:before.split('\n').length,column:before.length-before.lastIndexOf('\n')-1}}]}; }
      return { contents: `import { artwork } from 'adg'; export default props => artwork(${JSON.stringify(source)}, props);`, loader:'js' };
    });
  } }] }).catch(error => {
    const typed = error.errors?.find(item => item.detail instanceof CliError)?.detail;
    if (!typed) throw error;
    // Retain esbuild's human diagnostics and details while carrying the owning boundary's code.
    throw Object.assign(new CliError(typed.code, error.message, { cause: error, context: typed.context }), { errors: error.errors });
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Date.now()}`);
  if (typeof mod.default !== 'function') throw Error(`${relative(config,file)}: export a default function returning Frames`);
  const value = mod.default(), frames = (Array.isArray(value) ? value.flat(Infinity) : [value]).filter(v => v != null && v !== false);
  if (!frames.length) throw Error(`${relative(config,file)}: default export must return at least one Frame`);
  const names = new Set();
  for (const frame of frames) {
    try { validateFrame(frame); if (names.has(frame.name)) throw Error(`Duplicate frame name ${frame.name}`); names.add(frame.name); }
    catch(error) { throw Error(`${relative(config,file)}: ${frame?.name ?? '-'}: ${error.message}`); }
  }
  const tokenSource = read(path.join(base,'tokens.css'),'utf8'), tokens = snapshot ? parseTokens(tokenSource) : loadTokens(config);
  const compiler = await compile(`${readFileSync(path.join(tailwind,'theme.css'),'utf8')}\n${themeCss(tokens)}\n${readFileSync(path.join(tailwind,'preflight.css'),'utf8')}\n@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));\n@tailwind utilities;`);
  const classes = [...new Set(frames.flatMap(f => [...f.html.matchAll(/\bclass="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/))))];
  const css = `${compiler.build(classes)}\n${tokenSource}\nhtml,body{margin:0;font-family:var(--font-ui);color:var(--text);background:var(--canvas)}[data-adg-frame]{display:flex;align-items:flex-start;position:relative;background:var(--canvas)}[data-adg-frame]>*,svg{flex-shrink:0} @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;
  for (const frame of frames) {
    frame.document = theme => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-adg-frame="${escape(frame.name)}" style="${frame.width ? `width:${frame.width}px;` : 'width:max-content;'}${frame.height ? `height:${frame.height}px;` : ''}">${frame.html}</div></body></html>`;
    if (write) { const destination = path.join(config.output, path.relative(base,file).replace(/\.tsx$/, ''), `${encodeURIComponent(frame.name)}.html`); mkdirSync(path.dirname(destination),{recursive:true}); writeFileSync(destination,frame.document('light')); }
  }
  const sourceName = path.relative(base, file).split(path.sep).join('/');
  const parts = Object.keys(mod).filter(name => {
    const owner = typeof mod[name] === 'function' && componentOwner(mod[name]);
    return owner && owner.source === sourceName && owner.export === name;
  }).sort();
  return { frames, parts, dependencies: [...dependencies], imports: [...imports].sort(), css };
}
