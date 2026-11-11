import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { sourceDirectories, archFiles } from './project.mjs';
import { resolveDiffPolicy } from './diff-policy.mjs';

export const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;
export const UPDATE = 'npm install -g @whzxc/agent-design-gallery';
export const CONFIG_NAMES = ['adg.config.mjs', 'adg.config.js', 'adg.config.ts'];
export const configFile = directory => CONFIG_NAMES.map(name => path.join(directory, name)).find(file => statSync(file, { throwIfNoEntry: false })?.isFile());

// Old names belong only to this one-time migration and the discovery error.
export const LEGACY_CONFIG_NAMES = ['sdg.config.mjs', 'sdg.config.js', 'sdg.config.ts'];
export function legacyConfigFile(directory) {
  return LEGACY_CONFIG_NAMES.map(name => path.join(directory, name)).find(existsSync);
}
export function requireMigration(directory) {
  const old = legacyConfigFile(directory);
  if (old && !CONFIG_NAMES.some(name => existsSync(path.join(directory, name)))) {
    throw new CliError('MIGRATION_REQUIRED', `Found ${old}; run adg migrate ${JSON.stringify(directory)} before using this project.`, { context: { project: directory } });
  }
}

export function discoverRoot(cwd = process.cwd()) {
  let directory = path.resolve(cwd), packageRoot;
  while (true) {
    requireMigration(directory);
    if (configFile(directory)) return directory;
    if (!packageRoot && existsSync(path.join(directory, 'package.json'))) packageRoot = directory;
    const parent = path.dirname(directory);
    if (parent === directory) return packageRoot ?? path.resolve(cwd);
    directory = parent;
  }
}

function versionParts(value) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/);
  if (!match) throw new CliError('CONFIG_INVALID', `Invalid version ${value}; use major.minor.patch in requires`);
  return [...match.slice(1, 4).map(Number), match[4]];
}
function order(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1;
  if (!b[3]) return -1;
  const x = a[3].split('.'), y = b[3].split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    return nx && ny ? Math.sign(Number(x[i]) - Number(y[i])) : nx !== ny ? (nx ? -1 : 1) : (x[i] < y[i] ? -1 : 1);
  }
  return 0;
}

// Intentionally small range grammar: exact, comparisons, ^, ~, AND and ||.
// Unsupported syntax fails explicitly instead of silently accepting a version.
export function satisfies(version, range) {
  const actual = versionParts(version);
  if (typeof range !== 'string' || !range.trim()) throw new CliError('CONFIG_INVALID', 'Invalid requires; use a range such as >=0.3.0');
  const alternatives = range.split('||').map(branch => {
    const terms = branch.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
    return terms.map(term => {
      if (term === '*') return !actual[3];
      const match = term.match(/^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/);
      if (!match) throw new CliError('CONFIG_INVALID', `Unsupported requires ${range}; use comparisons with full versions, such as >=0.3.0`);
      const target = versionParts(match[2]), delta = order(actual, target), op = match[1] ?? '=';
      if (actual[3] && (!target[3] || actual.slice(0, 3).some((v, i) => v !== target[i]))) return false;
      if (op === '^' || op === '~') {
        const upper = [...target]; upper[3] = undefined;
        const index = op === '~' ? 1 : target[0] ? 0 : target[1] ? 1 : 2;
        upper[index]++; for (let i = index + 1; i < 3; i++) upper[i] = 0;
        return delta >= 0 && order(actual, upper) < 0;
      }
      return ({ '=': delta === 0, '>=': delta >= 0, '<=': delta <= 0, '>': delta > 0, '<': delta < 0 })[op];
    }).every(Boolean);
  });
  return alternatives.some(Boolean);
}

export function viewport(value) {
  const match = typeof value === 'string' && value.match(/^([1-9]\d*)x([1-9]\d*)$/);
  if (!match) throw new CliError('CONFIG_INVALID', `Invalid viewport ${value}; use <width>x<height>, for example 1280x800`);
  return { width: Number(match[1]), height: Number(match[2]) };
}
async function importConfig(file) {
  if (!file.endsWith('.ts')) {
    const info = statSync(file), url = pathToFileURL(file);
    url.searchParams.set('revision', `${info.mtimeMs}-${info.size}`);
    return (await import(url.href)).default;
  }
  const require = createRequire(pathToFileURL(file));
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(file).href) },
    plugins: [{ name: 'config-imports', setup(api) {
      api.onResolve({filter: /.*/}, args => {
        if (args.kind === 'entry-point' || args.path.startsWith('node:')) return;
        const candidate = args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : args.path;
        // Keep JS modules at their original URLs, including their own import.meta.url.
        // TypeScript helpers are bundled by esbuild without writing generated files.
        if (/\.[cm]?js$/.test(candidate) || !candidate.startsWith('/')) {
          const resolved = require.resolve(candidate);
          return { path: resolved.startsWith('/') ? pathToFileURL(resolved).href : resolved, external: true };
        }
      });
    }}] });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)).default;
}
export async function loadConfig(cwd = process.cwd(), { checkVersion = true, discover = true } = {}) {
  const root = discover ? discoverRoot(cwd) : path.resolve(cwd), file = configFile(root);
  if (!discover) requireMigration(root);
  let config = {};
  if (file) {
    try { config = await importConfig(file); }
    catch (error) { throw new CliError('CONFIG_INVALID', `Cannot load ${file}: ${error.message}; fix ${path.basename(file)}`, { cause: error }); }
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new CliError('CONFIG_INVALID', 'Export a default object from adg.config.mjs');
  if (config.name !== undefined && (typeof config.name !== 'string' || !config.name.trim())) throw new CliError('CONFIG_INVALID', 'Set name to a non-empty project name in the ADG config');
  const compatible = config.requires === undefined || satisfies(VERSION, config.requires);
  if (checkVersion && !compatible) throw new CliError('VERSION_UNSATISFIED', `ADG ${VERSION} does not satisfy requires ${config.requires}; run ${UPDATE}`);
  for (const key of ['design', 'output', 'arch']) if (config[key] !== undefined && !(key === 'arch' && config[key] === false) && (typeof config[key] !== 'string' || !config[key].trim())) throw new CliError('CONFIG_INVALID', `Set ${key} to a directory path in adg.config.mjs`);
  if (config.check !== undefined && (!config.check || typeof config.check!=='object' || Array.isArray(config.check))) throw new CliError('CONFIG_INVALID', 'Set check to an object in adg.config.mjs');
  if (config.check?.importDirection !== undefined && typeof config.check.importDirection!=='boolean') throw new CliError('CONFIG_INVALID', 'Set check.importDirection to true or false in adg.config.mjs');
  const compare = { port: 5188, viewport: '1280x800', ...config.compare };
  viewport(compare.viewport);
  if (!Number.isInteger(compare.port) || compare.port < 1 || compare.port > 65535) throw new CliError('CONFIG_INVALID', 'Set compare.port to an integer from 1 to 65535 in adg.config.mjs');
  for (const key of ['start', 'fixture', 'ready', 'texts']) if (compare[key] !== undefined && typeof compare[key] !== 'function') throw new CliError('CONFIG_INVALID', `Set compare.${key} to a function in adg.config.mjs`);
  if (compare.block !== undefined && (!Array.isArray(compare.block) || compare.block.some(value => typeof value !== 'string'))) throw new CliError('CONFIG_INVALID', 'Set compare.block to an array of request patterns in adg.config.mjs');
  if (config.check?.archMaxEdges !== undefined && (!Number.isInteger(config.check.archMaxEdges) || config.check.archMaxEdges < 0)) throw new CliError('CONFIG_INVALID', 'Set check.archMaxEdges to a non-negative integer in adg.config.mjs');
  if (typeof config.arch === 'string' && (path.isAbsolute(config.arch) || path.relative(root,path.resolve(root,config.arch)).startsWith('..'))) throw new CliError('CONFIG_INVALID', 'Set arch to a project-root-relative directory in adg.config.mjs');
  const arch = config.arch === false ? false : path.resolve(root,config.arch ?? 'arch');
  const design=path.resolve(root,config.design??'design');
  return { root, name: config.name ?? path.basename(root), requires: config.requires ?? null, compatible, archDirectory: arch, arch: arch && (config.arch !== undefined || archFiles(arch).length) ? arch : false, sources: sourceDirectories({...config,design}), design, output: path.resolve(root, config.output ?? 'output/design'), check:{archMaxEdges:30,importDirection:true,...config.check}, compare, diff: resolveDiffPolicy(config.diff) };
}
