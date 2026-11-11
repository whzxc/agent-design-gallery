import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { resolveBase, materializeBase, sourceRenames } from './arch-git.mjs';
import { loadConfig } from './config.mjs';
import { selectSources, relative } from './project.mjs';
import { buildSource } from './build.mjs';
import { cleanup } from './results.mjs';
import { CliError } from '../cli-output.mjs';

const environmentFiles = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const slash = value => value.split(path.sep).join('/');
const outside = value => value === '..' || value.startsWith(`..${path.sep}`) || path.isAbsolute(value);
const frameKey = ({ source, frame }) => JSON.stringify([source, frame]);

async function optionalBytes(file) {
  try { return await readFile(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function reuseEnvironment(base, tree, root) {
  const changedFiles = [];
  for (let directory = root; ; directory = path.dirname(directory)) {
    const repositoryPath = path.relative(base.root, directory);
    const destination = path.join(tree.directory, repositoryPath);
    const modules = path.join(directory, 'node_modules');
    if (existsSync(modules)) {
      await mkdir(destination, { recursive: true });
      const link = path.join(destination, 'node_modules');
      await rm(link, { recursive: true, force: true });
      await symlink(await realpath(modules), link, 'junction');
    }
    for (const name of environmentFiles) {
      const [before, after] = await Promise.all([
        optionalBytes(path.join(destination, name)), optionalBytes(path.join(directory, name)),
      ]);
      if (before === null && after === null) continue;
      if (!before || !after || !before.equals(after)) changedFiles.push(slash(path.join(repositoryPath, name)));
    }
    if (directory === base.root) break;
  }
  return { reused: true, changedFiles: changedFiles.sort() };
}

function importFailure(error) {
  if (!error) return false;
  if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(error.code)) return true;
  const diagnostics = error.errors ?? [];
  return diagnostics.some(item => /(?:Could not|Cannot) resolve|Could not read from file/.test(item.text)) || importFailure(error.cause);
}

function historicalFailure(error) {
  if (!importFailure(error)) return error;
  return new CliError('DIFF_BASE_DEPENDENCIES_UNAVAILABLE', `Historical import failed: ${error.message}`, { cause: error });
}

function inventory(config, repository) {
  return new Map(selectSources(config, [], { write: false }).map(file => {
    const source = relative(config, file);
    if (outside(path.relative(repository, file))) {
      throw new CliError('CONFIG_INVALID', `Source ${file} is outside the revision tree.`);
    }
    return [source, file];
  }));
}

async function selectedSources(config, beforeConfig, root, union, args) {
  if (!args.length) return [...union].sort();
  const previousDesign = path.resolve(root, path.relative(beforeConfig.root, beforeConfig.design));
  const selected = [];
  for (const arg of args) {
    let candidates;
    if (path.isAbsolute(arg)) {
      const absolute = existsSync(arg) ? await realpath(arg) : path.resolve(arg);
      if (outside(path.relative(root, absolute))) throw new CliError('SOURCE_NOT_FOUND', `Source ${arg} is outside the project root.`);
      candidates = [absolute];
    } else candidates = [path.resolve(root, arg), path.resolve(config.design, arg), path.resolve(previousDesign, arg)];
    const sources = candidates.map(file => {
      if (!/\.(?:tsx|mmd)$/.test(file)) file += '.tsx';
      return slash(path.relative(root, file));
    });
    const found = sources.find(source => union.has(source));
    if (!found) throw new CliError('SOURCE_NOT_FOUND', `Unknown source ${arg}; choose a source present at the base or in the working files.`);
    selected.push(found);
  }
  return [...new Set(selected)];
}

/** Match exact source/name identities and retain unmatched rename candidates. */
export function matchDiffFrames(sources, before, after, renames = [], frame = undefined) {
  const rows = [];
  for (const source of sources) {
    const oldFrames = new Map((before.get(source)?.frames ?? []).map(value => [value.name, value]));
    const newFrames = new Map((after.get(source)?.frames ?? []).map(value => [value.name, value]));
    const names = new Set([...newFrames.keys(), ...oldFrames.keys()]);
    for (const name of names) {
      if (frame !== undefined && name !== frame) continue;
      const old = oldFrames.get(name) ?? null, current = newFrames.get(name) ?? null;
      rows.push({
        source, frame: name, before: old, after: current,
        status: old && current ? 'matched' : old ? 'removed' : 'added',
        matchKind: old && current ? 'exact' : 'unmatched', matchCandidates: [],
      });
    }
  }
  if (frame !== undefined && !rows.length) throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${frame}; choose a frame present on either side.`);
  const removed = rows.filter(row => row.status === 'removed');
  const added = rows.filter(row => row.status === 'added');
  const addedBySource = groupFrames(added, 'source'), addedByName = groupFrames(added, 'frame');
  const removedByName = groupFrames(removed, 'frame');
  const movedSources = new Map(renames.map(rename => [rename.before, rename.after]));
  for (const old of removed) {
    const candidates = new Set([
      ...(addedBySource.get(old.source) ?? []),
      ...(addedBySource.get(movedSources.get(old.source)) ?? []),
    ]);
    const sameName = addedByName.get(old.frame) ?? [];
    if (removedByName.get(old.frame).length === 1 && sameName.length === 1) candidates.add(sameName[0]);
    for (const current of candidates) {
      old.matchKind = current.matchKind = 'renamed_or_unknown';
      old.matchCandidates.push({ source: current.source, frame: current.frame });
      current.matchCandidates.push({ source: old.source, frame: old.frame });
    }
  }
  return rows;
}

function groupFrames(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const values = groups.get(row[field]) ?? [];
    values.push(row);
    groups.set(row[field], values);
  }
  return groups;
}

/** Prepare revision inputs. The caller closes the session and owns any supplied browser. */
export async function prepareDiffInputs(config, args = [], options = {}) {
  const base = await resolveBase(config, options.base);
  const root = await realpath(config.root);
  const tree = await materializeBase(base);
  const warnings = [];
  try {
    const configDependencies = await reuseEnvironment(base, tree, root);
    if (configDependencies.changedFiles.length) warnings.push({
      code: 'DIFF_BASE_ENVIRONMENT_REUSED',
      message: `Base config uses current node_modules; environment files differ: ${configDependencies.changedFiles.join(', ')}.`, next: [],
    });
    const beforeRoot = path.join(tree.directory, path.relative(base.root, root));
    let beforeConfig;
    try { beforeConfig = await loadConfig(beforeRoot, { discover: false }); }
    catch (error) { throw historicalFailure(error); }
    const before = { config: beforeConfig, sources: inventory(beforeConfig, tree.directory) };
    // Resolve symlinked project roots consistently with the Git base identity.
    const currentConfig = { ...config, root };
    for (const key of ['design', 'arch', 'archDirectory', 'output']) {
      if (config[key]) currentConfig[key] = path.resolve(root, path.relative(config.root, config[key]));
    }
    const after = { config: currentConfig, sources: inventory(currentConfig, base.root) };
    const union = new Set([...before.sources.keys(), ...after.sources.keys()]);
    const sources = await selectedSources(currentConfig, beforeConfig, root, union, args);
    const renames = (await sourceRenames(base)).flatMap(rename => {
      const old = path.relative(root, path.join(base.root, rename.before));
      const current = path.relative(root, path.join(base.root, rename.after));
      return outside(old) || outside(current) ? [] : [{ before: slash(old), after: slash(current) }];
    });
    let closed = false;
    return {
      base, before, after, sources, warnings, environment: { configDependencies },
      async buildFrames({ browser } = {}) {
        if (closed) throw new CliError('SOURCE_BUILD_FAILED', 'Diff inputs are closed; prepare a new comparison.');
        const built = [];
        for (const side of [before, after]) {
          const builds = new Map(), snapshot = new Map();
          for (const source of sources) {
            const file = side.sources.get(source);
            if (!file) continue;
            try { builds.set(source, await buildSource(side.config, file, { write: false, allowLegacy: false, snapshot, browser })); }
            catch (error) {
              const failure = side === before ? historicalFailure(error) : error;
              if (failure instanceof CliError) failure.warnings.push(...warnings);
              throw failure;
            }
          }
          built.push(builds);
        }
        const frames = matchDiffFrames(sources, built[0], built[1], renames, options.frame);
        const candidates = frames.filter(row => row.matchKind === 'renamed_or_unknown');
        if (candidates.length) warnings.push({
          code: 'DIFF_RENAMED_OR_UNKNOWN',
          message: `Unmatched frames have rename candidates: ${candidates.map(row => frameKey(row)).join(', ')}.`, next: [],
        });
        return { frames, before: built[0], after: built[1] };
      },
      async close() { closed = true; await tree.close(); },
    };
  } catch (error) {
    if (error instanceof CliError) error.warnings.push(...warnings);
    await cleanup(tree.close, error);
    throw error;
  }
}
