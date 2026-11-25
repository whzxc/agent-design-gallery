import { existsSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { CliError } from '../../cli-output.mjs';
import { isSourcePath, rejectLegacy } from '../project.mjs';
import {
  isInNodeModules,
  isKitAllowedFile,
  isKitUiFile,
  isWithinDirectory,
  matchesAllowedPackage,
  resolveKitAlias,
} from './config.mjs';
import { renderReactFrames } from './react-runtime.mjs';

const reactRuntimeFile = fileURLToPath(new URL('./react-runtime.mjs', import.meta.url));
const REACT_PACKAGE_SPECIFIERS = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'react-dom/server',
]);

const RESOLVE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '/index.tsx',
  '/index.ts',
  '/index.jsx',
  '/index.js',
  '/index.mjs',
];

function resolveLocalFile(requested, files) {
  const candidates = [requested, ...RESOLVE_EXTENSIONS.map(ext => requested + ext)];
  if (/\.m?js$/.test(requested)) {
    const stem = requested.replace(/\.m?js$/, '');
    candidates.push(`${stem}.tsx`, `${stem}.ts`, `${stem}.mts`);
  }
  return candidates.find(candidate =>
    files ? files.has(candidate) : statSync(candidate, { throwIfNoEntry: false })?.isFile()
  );
}

function resolveReactUrls(physicalRoot) {
  const anchor = path.join(physicalRoot, 'package.json');
  const req = createRequire(existsSync(anchor) ? pathToFileURL(anchor).href : path.join(physicalRoot, '_adg_.js'));
  const resolvePkg = (spec, required = true) => {
    try {
      return pathToFileURL(req.resolve(spec)).href;
    } catch (error) {
      if (!required) return null;
      throw new CliError(
        'SOURCE_BUILD_FAILED',
        `Kit engine "react" requires "${spec}" installed in the project root node_modules`,
        { cause: error }
      );
    }
  };
  return {
    react: resolvePkg('react'),
    'react/jsx-runtime': resolvePkg('react/jsx-runtime'),
    'react/jsx-dev-runtime': resolvePkg('react/jsx-dev-runtime'),
    'react-dom/server': resolvePkg('react-dom/server'),
    'react-dom': resolvePkg('react-dom', false),
    'react-dom/client': resolvePkg('react-dom/client', false),
    runtimeHelper: pathToFileURL(reactRuntimeFile).href,
  };
}

export const reactAdapter = {
  engine: 'react',
  runtimePackages: [...REACT_PACKAGE_SPECIFIERS],

  esbuildOptions() {
    return { jsx: 'automatic', jsxImportSource: 'react', jsxDev: true };
  },

  runtimeDts() {
    return `export type Content = unknown;
export type Capture = ({ region: string; selector?: never; page?: never } | { selector: string; region?: never; page?: never } | { page: true; region?: never; selector?: never }) & { viewport?: string; origin?: string; clicks?: string[] };
export interface FrameParent { source: string; frame: string; selector: string }
export interface FrameProps { name: string; width?: number; height?: number; fixture?: string; capture?: Capture; parent?: FrameParent; note?: string; locale?: string; proposed?: string; children?: Content }
export interface IconProps { "data-adg-id"?: string; name: string; size?: number; class?: string; className?: string }
export function Frame(props: FrameProps): any;
export function Icon(props: IconProps): any;
`;
  },

  async createBuildContext({
    config,
    file,
    base,
    physicalRoot,
    files,
    read,
    dependencies,
    imports,
    sources,
    allowLegacy,
    extraCss,
    registeredSource,
  }) {
    const urls = resolveReactUrls(physicalRoot);
    const packageJson = path.join(physicalRoot, 'package.json');
    if (files ? files.has(packageJson) : existsSync(packageJson)) {
      dependencies.add(packageJson);
      await read(packageJson, 'utf8');
    }

    const plugin = {
      name: 'adg-kit-react',
      setup(api) {
        api.onResolve({ filter: /.*/ }, args => {
          if (args.path === 'adg:self') return { path: args.importer };
          if (args.path.startsWith('adg:art-bytes:')) {
            return { path: args.path.slice('adg:art-bytes:'.length), namespace: 'art-bytes' };
          }
          if (args.path === 'adg') return { path: 'adg:react-adg', namespace: 'adg-kit' };

          if (args.namespace === 'adg-kit') {
            if (REACT_PACKAGE_SPECIFIERS.has(args.path) && urls[args.path]) {
              return { path: urls[args.path], external: true };
            }
            if (args.path === urls.runtimeHelper || args.path.startsWith('file://')) {
              return { path: args.path, external: true };
            }
          }

          if (REACT_PACKAGE_SPECIFIERS.has(args.path)) {
            const url = urls[args.path];
            if (!url) {
              return { errors: [{ text: `React package ${args.path} is unavailable in project node_modules` }] };
            }
            if (args.importer && isWithinDirectory(args.importer, base)) {
              if (args.path === 'react/jsx-runtime') return { path: 'adg:design-jsx/jsx-runtime', namespace: 'adg-kit' };
              if (args.path === 'react/jsx-dev-runtime') return { path: 'adg:design-jsx/jsx-dev-runtime', namespace: 'adg-kit' };
              return { path: url, external: true };
            }
            if (args.importer && isKitUiFile(args.importer, config.kit, physicalRoot)) {
              if (args.path === 'react/jsx-runtime') return { path: 'adg:kit-jsx/jsx-runtime', namespace: 'adg-kit' };
              if (args.path === 'react/jsx-dev-runtime') return { path: 'adg:kit-jsx/jsx-dev-runtime', namespace: 'adg-kit' };
              if (args.path === 'react') return { path: 'adg:kit-react', namespace: 'adg-kit' };
              return { path: url, external: true };
            }
            return { path: url, external: true };
          }

          if (args.importer && isInNodeModules(args.importer)) {
            return undefined;
          }

          if (args.path.startsWith('node:')) {
            return { errors: [{ text: `Node built-in ${args.path} is unavailable in design sources` }] };
          }

          const urlImport = args.path.endsWith('?url');
          const cleanSpecifier = urlImport ? args.path.slice(0, -4) : args.path;
          const aliasTarget = !cleanSpecifier.startsWith('.')
            ? resolveKitAlias(cleanSpecifier, config.kit, physicalRoot)
            : null;

          if (args.kind !== 'entry-point' && !cleanSpecifier.startsWith('.') && !aliasTarget) {
            if (matchesAllowedPackage(args.path, config.kit.packages)) {
              return undefined;
            }
            return {
              errors: [{
                text: `Package ${args.path} is not allowed; add it to kit.packages or map an alias in kit.paths in adg.config.mjs`,
              }],
            };
          }

          const requested =
            args.kind === 'entry-point'
              ? path.resolve(cleanSpecifier)
              : aliasTarget ?? path.resolve(args.resolveDir, cleanSpecifier);

          let resolved = resolveLocalFile(requested, files);
          if (!resolved) return { errors: [{ text: `Cannot resolve ${args.path}` }] };
          if (!files) resolved = realpathSync(resolved);

          const inDesign = isWithinDirectory(resolved, base);
          const inKit = isWithinDirectory(resolved, physicalRoot) && isKitAllowedFile(resolved, config.kit, physicalRoot);
          if (!inDesign && !inKit) {
            return {
              errors: [{
                text: `Import ${args.path} leaves design/ and configured kit roots; add its directory to kit.roots or kit.paths in adg.config.mjs`,
              }],
            };
          }

          if (inDesign && !allowLegacy) {
            rejectLegacy(config, [path.join(config.design, path.relative(base, resolved))]);
          }

          dependencies.add(resolved);
          if (inDesign && args.importer === file) {
            const sourcePath = path.relative(base, resolved).split(path.sep).join('/');
            if (isSourcePath(sourcePath, sources)) imports.add(sourcePath);
          }

          if (urlImport) {
            if (!isWithinDirectory(resolved, path.join(base, 'art'))) {
              return { errors: [{ text: '?url imports must be under design/art/' }] };
            }
            return { path: resolved, namespace: 'art-url' };
          }

          if (resolved.endsWith('.css')) {
            if (inDesign) {
              return { errors: [{ text: `Stylesheet import ${args.path} is not allowed inside design/` }] };
            }
            return { path: resolved, namespace: 'kit-css' };
          }

          return { path: resolved };
        });

        api.onLoad({ filter: /.*/, namespace: 'adg-kit' }, args => {
          const helper = JSON.stringify(urls.runtimeHelper);
          const reactUrl = JSON.stringify(urls.react);
          const jsxUrl = JSON.stringify(urls['react/jsx-runtime']);
          const jsxDevUrl = JSON.stringify(urls['react/jsx-dev-runtime']);

          if (args.path === 'adg:react-adg') {
            return {
              loader: 'js',
              contents: `import * as __R from ${reactUrl};
import { createReactAdgModule } from ${helper};
const __mod = createReactAdgModule(__R);
export const Frame = __mod.Frame;
export const Icon = __mod.Icon;
export const registerComponent = __mod.registerComponent;
export const registerArtwork = __mod.registerArtwork;
export const artwork = __mod.artwork;
`,
            };
          }
          if (args.path === 'adg:design-jsx/jsx-runtime' || args.path === 'adg:design-jsx/jsx-dev-runtime') {
            return {
              loader: 'js',
              contents: `import * as __R from ${reactUrl};
import * as __J from ${jsxUrl};
import * as __JD from ${jsxDevUrl};
import { createDesignJsxRuntime } from ${helper};
const __rt = createDesignJsxRuntime(__R, __J, __JD);
export const Fragment = __rt.Fragment;
export const jsx = __rt.jsx;
export const jsxs = __rt.jsxs;
export const jsxDEV = __rt.jsxDEV;
`,
            };
          }
          if (args.path === 'adg:kit-jsx/jsx-runtime' || args.path === 'adg:kit-jsx/jsx-dev-runtime') {
            return {
              loader: 'js',
              contents: `import * as __J from ${jsxUrl};
import * as __JD from ${jsxDevUrl};
import { createKitJsxRuntime } from ${helper};
const __rt = createKitJsxRuntime(__J, __JD);
export const Fragment = __rt.Fragment;
export const jsx = __rt.jsx;
export const jsxs = __rt.jsxs;
export const jsxDEV = __rt.jsxDEV;
`,
            };
          }
          if (args.path === 'adg:kit-react') {
            return {
              loader: 'js',
              contents: `import * as __R from ${reactUrl};
import __D from ${reactUrl};
import { wrapKitCreateElement } from ${helper};
export * from ${reactUrl};
const __base = __D ?? __R;
export const createElement = wrapKitCreateElement(__R.createElement ?? __base.createElement);
export default Object.assign({}, __base, { createElement });
`,
            };
          }
        });

        api.onLoad({ filter: /.*/, namespace: 'kit-css' }, async args => {
          extraCss.push(await read(args.path, 'utf8'));
          return { contents: '', loader: 'js' };
        });

        api.onLoad({ filter: /.*/, namespace: 'art-bytes' }, async args => ({
          contents: await read(args.path),
          loader: 'dataurl',
        }));

        const artModule = artFile => {
          const source = path.relative(base, artFile).split(path.sep).join('/');
          return {
            contents: `import data from ${JSON.stringify('adg:art-bytes:' + artFile)};import {registerArtwork} from 'adg';export default registerArtwork(data,${JSON.stringify(source)});`,
            loader: 'js',
          };
        };

        api.onLoad({ filter: /.*/, namespace: 'art-url' }, args => artModule(args.path));

        api.onLoad({ filter: /\.tsx$/ }, async args => {
          if (isInNodeModules(args.path)) return undefined;
          if (isWithinDirectory(args.path, base)) {
            const sourcePath = path.relative(base, args.path).split(path.sep).join('/');
            if (isSourcePath(sourcePath, sources)) {
              const original = await read(args.path, 'utf8');
              return registeredSource(args.path, sourcePath, original);
            }
          }
          return { contents: await read(args.path, 'utf8'), loader: 'tsx' };
        });

        api.onLoad({ filter: /\.(?:[cm]?js|jsx|mts|cts|ts|json)$/ }, async args => {
          if (isInNodeModules(args.path)) return undefined;
          const ext = path.extname(args.path);
          const loader = ext === '.ts' || ext === '.mts' || ext === '.cts' ? 'ts' : ext === '.jsx' ? 'jsx' : ext === '.json' ? 'json' : 'js';
          return { contents: await read(args.path, 'utf8'), loader };
        });

        api.onLoad({ filter: /\.(png|jpe?g|webp)$/i }, args => artModule(args.path));

        api.onLoad({ filter: /\.svg$/i }, async args => {
          const source = await read(args.path, 'utf8');
          const forbidden = /<(?:style|script)\b|\s(?:on[\w-]+|className)\s*=/i.exec(source);
          if (forbidden) {
            const before = source.slice(0, forbidden.index);
            return {
              errors: [{
                text: 'Forbidden SVG markup; remove styles, scripts and event attributes',
                location: { file: args.path, line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') - 1 },
              }],
            };
          }
          return {
            contents: `import { artwork } from 'adg'; export default props => artwork(${JSON.stringify(source)}, props, ${JSON.stringify(path.relative(base, args.path).split(path.sep).join('/'))});`,
            loader: 'js',
          };
        });
      },
    };

    return {
      plugin,
      urls,
    };
  },

  async renderFrames(mod, context, { relativeFile }) {
    const [React, ReactDOMServer] = await Promise.all([
      import(context.urls.react),
      import(context.urls['react-dom/server']),
    ]);
    return renderReactFrames(mod, { React, ReactDOMServer, relativeFile });
  },
};
