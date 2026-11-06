import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version;
export const UPDATE = 'npm install -g @whzxc/svg-design-gallery';

export function discoverRoot(cwd = process.cwd()) {
  let directory = path.resolve(cwd), packageRoot;
  while (true) {
    if (existsSync(path.join(directory, 'sdg.config.mjs'))) return directory;
    if (!packageRoot && existsSync(path.join(directory, 'package.json'))) packageRoot = directory;
    const parent = path.dirname(directory);
    if (parent === directory) return packageRoot ?? path.resolve(cwd);
    directory = parent;
  }
}

function versionParts(value) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?(?:\+[\w.-]+)?$/);
  if (!match) throw new Error(`Invalid version ${value}; use major.minor.patch in requires`);
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
  if (typeof range !== 'string' || !range.trim()) throw new Error('Invalid requires; use a range such as >=0.3.0');
  const alternatives = range.split('||').map(branch => {
    const terms = branch.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
    return terms.map(term => {
      if (term === '*') return !actual[3];
      const match = term.match(/^(>=|<=|>|<|=|\^|~)?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/);
      if (!match) throw new Error(`Unsupported requires ${range}; use comparisons with full versions, such as >=0.3.0`);
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
  if (!match) throw new Error(`Invalid viewport ${value}; use <width>x<height>, for example 1280x800`);
  return { width: Number(match[1]), height: Number(match[2]) };
}
export async function loadConfig(cwd = process.cwd()) {
  const root = discoverRoot(cwd), file = path.join(root, 'sdg.config.mjs');
  let config = {};
  if (existsSync(file)) {
    try { config = (await import(pathToFileURL(file).href)).default; }
    catch (error) { throw new Error(`Cannot load ${file}: ${error.message}; fix sdg.config.mjs`); }
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Export a default object from sdg.config.mjs');
  if (config.requires !== undefined && !satisfies(VERSION, config.requires)) throw new Error(`SDG ${VERSION} does not satisfy requires ${config.requires}; run ${UPDATE}`);
  for (const key of ['design', 'output']) if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim())) throw new Error(`Set ${key} to a directory path in sdg.config.mjs`);
  const compare = { port: 5188, viewport: '1280x800', ...config.compare };
  viewport(compare.viewport);
  if (!Number.isInteger(compare.port) || compare.port < 1 || compare.port > 65535) throw new Error('Set compare.port to an integer from 1 to 65535 in sdg.config.mjs');
  for (const key of ['start', 'fixture', 'ready', 'texts']) if (compare[key] !== undefined && typeof compare[key] !== 'function') throw new Error(`Set compare.${key} to a function in sdg.config.mjs`);
  if (compare.block !== undefined && (!Array.isArray(compare.block) || compare.block.some(value => typeof value !== 'string'))) throw new Error('Set compare.block to an array of request patterns in sdg.config.mjs');
  return { root, design: path.resolve(root, config.design ?? 'design'), output: path.resolve(root, config.output ?? 'output/design'), compare };
}
