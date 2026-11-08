import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import { statSync, readFileSync, realpathSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTokens, refreshTypes, rejectLegacy, relative, isSourcePath, sourceDirectories } from './project.mjs';
import { themeCss } from './tokens.mjs';
import { escape } from './runtime.mjs';
const require = createRequire(import.meta.url);
const runtime = fileURLToPath(new URL('./runtime.mjs', import.meta.url));
const tailwind = path.dirname(require.resolve('tailwindcss/package.json'));
export function validateFrame(frame) {
  if (!frame?.frame || typeof frame.name !== 'string' || !frame.name.trim()) throw Error('Default export must return named Frames');
  for (const key of ['width', 'height']) if (frame[key] !== undefined && !(Number.isFinite(frame[key]) && frame[key] > 0)) throw Error(`Invalid Frame ${key}; use positive CSS pixels`);
  const c = frame.capture;
  if (c !== undefined) {
    if (!c || typeof c !== 'object' || ['region','selector','page'].filter(k => c[k] !== undefined).length !== 1 || (c.page !== undefined && c.page !== true) || ['region','selector'].some(k => c[k] !== undefined && (typeof c[k] !== 'string' || !c[k].trim())) || (c.viewport !== undefined && !/^[1-9]\d*x[1-9]\d*$/.test(c.viewport)) || (c.origin !== undefined && (!c.page || !/^\d+(?:\.\d+)? \d+(?:\.\d+)?$/.test(c.origin))) || (c.clicks !== undefined && (!Array.isArray(c.clicks) || c.clicks.some(v => typeof v !== 'string' || !v)))) throw Error('Invalid capture; use region, selector or page with viewport, origin and clicks');
  }
}
export async function buildSource(config, file, { write = true, allowLegacy = true } = {}) {
  if (write) refreshTypes(config);
  file = realpathSync(file);
  const base = realpathSync(config.design), dependencies = new Set([path.join(base, 'tokens.css')]);
  const imports = new Set(), sources = sourceDirectories(config);
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', jsxImportSource: 'sdg', jsxDev: true, metafile: true, logLevel: 'silent', plugins: [{ name: 'sdg-sources', setup(api) {
    api.onResolve({ filter: /.*/ }, args => {
      if (['sdg','sdg/jsx-runtime','sdg/jsx-dev-runtime'].includes(args.path)) return { path: pathToFileURL(runtime).href, external: true };
      if (args.kind !== 'entry-point' && !args.path.startsWith('.')) return { errors: [{ text: `Bare import ${args.path} is unavailable; import sdg or a relative file inside design/` }] };
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
    api.onLoad({filter:/.*/,namespace:'art-url'}, args => ({contents:readFileSync(args.path),loader:'dataurl'}));
    api.onLoad({ filter: /\.(png|jpe?g|webp)$/i }, args => ({ contents: readFileSync(args.path), loader: 'dataurl' }));
    api.onLoad({ filter: /\.svg$/i }, args => {
      const source = readFileSync(args.path,'utf8');
      const forbidden = /<(?:style|script)\b|\s(?:on[\w-]+|className)\s*=/i.exec(source);
      if (forbidden) { const before=source.slice(0,forbidden.index); return {errors:[{text:'Forbidden SVG markup; remove styles, scripts and event attributes',location:{file:args.path,line:before.split('\n').length,column:before.length-before.lastIndexOf('\n')-1}}]}; }
      return { contents: `import { artwork } from 'sdg'; export default props => artwork(${JSON.stringify(source)}, props);`, loader:'js' };
    });
  } }] });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Date.now()}`);
  if (typeof mod.default !== 'function') throw Error(`${relative(config,file)}: export a default function returning Frames`);
  const value = mod.default(), frames = (Array.isArray(value) ? value.flat(Infinity) : [value]).filter(v => v != null && v !== false);
  if (!frames.length) throw Error(`${relative(config,file)}: default export must return at least one Frame`);
  const names = new Set();
  for (const frame of frames) {
    try { validateFrame(frame); if (names.has(frame.name)) throw Error(`Duplicate frame name ${frame.name}`); names.add(frame.name); }
    catch(error) { throw Error(`${relative(config,file)}: ${frame?.name ?? '-'}: ${error.message}`); }
  }
  const tokens = loadTokens(config), tokenSource = readFileSync(path.join(base,'tokens.css'),'utf8');
  const compiler = await compile(`${readFileSync(path.join(tailwind,'theme.css'),'utf8')}\n${themeCss(tokens)}\n${readFileSync(path.join(tailwind,'preflight.css'),'utf8')}\n@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));\n@tailwind utilities;`);
  const classes = [...new Set(frames.flatMap(f => [...f.html.matchAll(/\bclass="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/))))];
  const css = `${compiler.build(classes)}\n${tokenSource}\nhtml,body{margin:0;font-family:var(--font-ui);color:var(--text);background:var(--canvas)}[data-sdg-frame]{display:flex;align-items:flex-start;position:relative;background:var(--canvas)}[data-sdg-frame]>*,svg{flex-shrink:0} @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;
  for (const frame of frames) {
    frame.document = theme => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-sdg-frame="${escape(frame.name)}" style="${frame.width ? `width:${frame.width}px;` : 'width:max-content;'}${frame.height ? `height:${frame.height}px;` : ''}">${frame.html}</div></body></html>`;
    if (write) { const destination = path.join(config.output, path.relative(base,file).replace(/\.tsx$/, ''), `${encodeURIComponent(frame.name)}.html`); mkdirSync(path.dirname(destination),{recursive:true}); writeFileSync(destination,frame.document('light')); }
  }
  return { frames, dependencies: [...dependencies], imports: [...imports].sort(), css };
}
