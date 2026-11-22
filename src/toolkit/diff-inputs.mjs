import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { resolveBase, materializeBase, revisionValue, revisionError, revisionChanges } from './arch-git.mjs';
import { configInputFiles } from './input-generation.mjs';
import { loadConfig, legacyConfigFile } from './config.mjs';
import { selectSources, relative } from './project.mjs';
import { buildSource } from './build.mjs';
import { cleanup } from './results.mjs';
import { CliError, asCliError, withHumanOutputMapping } from '../cli-output.mjs';

const environmentFiles = ['package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const slash = value => value.split(path.sep).join('/');
const outside = (value, paths = path) => value === '..' || value.startsWith(`..${paths.sep}`) || paths.isAbsolute(value);
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

export function sourceFailure(error, source, side, translate = value => value) {
  if (['OWNER_INDEX_CHANGED', 'IMPACT_INPUT_CHANGED'].includes(error.code)) throw error;
  const failure = asCliError(side === 'base' ? historicalFailure(error) : error, 'SOURCE_BUILD_FAILED');
  return { source, side, code: failure.code, message: translate(failure.message) };
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

export async function selectedSources(config, beforeConfig, root, union, args) {
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

export async function openDiffRevision(base, root, temporaryDirectory) {
  const tree = await materializeBase(base, temporaryDirectory);
  const warnings = [];
  try {
    const configDependencies = await reuseEnvironment(base, tree, root);
    if (configDependencies.changedFiles.length) warnings.push({
      code: 'DIFF_BASE_ENVIRONMENT_REUSED',
      message: `Base config uses current node_modules; environment files differ: ${configDependencies.changedFiles.join(', ')}.`, next: [],
    });
    const beforeRoot = path.join(tree.directory, path.relative(base.root, root));
    await mkdir(beforeRoot,{recursive:true});
    const baseMigration = { applied: false, changes: [] };
    const translate = value => revisionValue(value, tree.directory, base.root);
    let beforeConfig;
    try {
      beforeConfig = await withHumanOutputMapping(async () => {
        if (legacyConfigFile(beforeRoot)) {
          const { migrate } = await import('./migrate.mjs');
          const migrated = await migrate(beforeRoot, () => {});
          baseMigration.applied = true;
          baseMigration.changes = migrated.changes.map(change => ({
            ...change, path: relative({ root: beforeRoot }, change.path),
            from: change.from === null ? null : relative({ root: beforeRoot }, change.from),
          }));
          warnings.push({ code: 'DIFF_BASE_MIGRATED', message: `Migrated the disposable base ${base.sha.slice(0, 7)} to ADG.`, next: [] });
        }
        return loadConfig(beforeRoot, { discover: false });
      }, translate);
    } catch (error) { throw historicalFailure(error); }
    return { config: beforeConfig, sources: inventory(beforeConfig, tree.directory), revision: base,
      warnings, translate, environment: { configDependencies, baseMigration }, close: tree.close };
  } catch (cause) {
    const failure = revisionError(cause, tree.directory, base);
    await cleanup(tree.close, failure);
    throw failure;
  }
}

/** Prepare both endpoints before selecting sources, hints or parent support frames. */
export async function prepareDiffInputs(config, args = [], options = {}) {
  const root = await realpath(config.root);
  const open = options.openRevision ?? (async rev => openDiffRevision(await resolveBase(config, rev), root));
  const before = await open(options.base);
  const { revision: base, translate, environment: { configDependencies, baseMigration } } = before;
  const warnings = [...before.warnings];
  let target;
  const close = async () => { try { await target?.close(); } finally { await before.close(); } };
  try {
    if (options.head) { target = await open(options.head); warnings.push(...target.warnings); }
    // Resolve symlinked project roots consistently with the Git base identity.
    const currentConfig = { ...config, root };
    for (const key of ['design', 'arch', 'archDirectory', 'output']) {
      if (config[key]) currentConfig[key] = path.resolve(root, path.relative(config.root, config[key]));
    }
    const after = target ?? { config: currentConfig, sources: inventory(currentConfig, base.root) };
    const union = new Set([...before.sources.keys(), ...after.sources.keys()]);
    const sources = await selectedSources(currentConfig, before.config, root, union, args);
    const inputs = await revisionChanges(base, target?.revision);
    const projectPath = name => name === null ? null : slash(path.relative(root, path.join(base.root, name)));
    const changes = inputs.map(change => ({...change, before:projectPath(change.before), after:projectPath(change.after)}));
    const renames = changes.filter(c => c.status === 'renamed' && !outside(c.before, path.posix) && !outside(c.after, path.posix));
    const changed = new Set(changes.flatMap(change => [change.before, change.after]).filter(Boolean));
    const configFiles = await Promise.all([before, after].map(async side =>
      (await configInputFiles(side.config)).map(file => relative(side.config, file))));
    const globalChanges = [...new Set([...configFiles.flat(), ...configDependencies.changedFiles.map(name =>
      slash(path.relative(root, path.join(base.root, name))))])].filter(name => changed.has(name));
    let closed = false;
    return {
      base, before, after, sources, renames, changes, globalChanges, warnings, translateDiagnostic: value => translate(target ? target.translate(value) : value), environment: { configDependencies, baseMigration },
      async buildFrames({ browser, materialized, failures: previousFailures = [], sources: requestedSources = sources, frame: requestedFrame = options.frame, deferParts = false } = {}) {
        if (closed) throw new CliError('SOURCE_BUILD_FAILED', 'Diff inputs are closed; prepare a new comparison.');
        const built = materialized ? materialized.map(values => new Map(values)) : [new Map(), new Map()], snapshots = [new Map(), new Map()];
        const failures = [...previousFailures];
        const failed = new Set(failures.map(failure => failure.source));
        const attempts = [new Set(), new Set()];
        const build = async (side, index, source) => {
          if (attempts[index].has(source) || previousFailures.some(failure => failure.source === source) || built[index].has(source) || !side.sources.has(source)) return;
          attempts[index].add(source);
          try {
            const work = () => buildSource(side.config, side.sources.get(source), { write: false, allowLegacy: false, snapshot: snapshots[index], browser });
            built[index].set(source, await (side === before ? withHumanOutputMapping(work, translate) : work()));
          } catch (error) {
            failures.push(sourceFailure(error, source, index === 0 ? 'base' : 'current', translate));
            failed.add(source);
          }
        };
        for (const source of requestedSources) {
          await build(before, 0, source);
          await build(after, 1, source);
        }
        const frames = matchDiffFrames(requestedSources.filter(source => !failed.has(source)), built[0], built[1], renames)
          .filter(row => requestedFrame === undefined || row.frame === requestedFrame);
        if (requestedFrame !== undefined && !frames.some(row => row.frame === requestedFrame) && !failures.length) {
          throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${requestedFrame}; choose a frame present on either side.`);
        }
        const result = { frames, before: built[0], after: built[1], support: [], failures };
        // Diff pairs moves before linking structural additions to their parents.
        const prepareParts = async () => {
          const { frames, support } = result, parents = new Map();
          const selected = new Map(frames.map(row => [frameKey(row), row]));
          for (const row of frames.filter(row => row.status === 'added' && row.after.parent)) {
            if (failed.has(row.source)) continue;
            const ref = row.after.parent, key = frameKey({ source: ref.source, frame: ref.frame });
            if (!parents.has(key)) {
              await build(before, 0, ref.source);
              await build(after, 1, ref.source);
              if (failed.has(ref.source)) {
                failures.push({ source: row.source, side: 'current', code: 'DIFF_REFERENCE_INVALID', message: `${row.source}: ${row.frame}: parent source ${ref.source} failed to build.` });
                failed.add(row.source);
                continue;
              }
              const old = built[0].get(ref.source)?.frames.find(frame => frame.name === ref.frame);
              const current = built[1].get(ref.source)?.frames.find(frame => frame.name === ref.frame);
              if (!old || !current) throw new CliError('DIFF_REFERENCE_INVALID', `${row.source}: ${row.frame}: parent ${ref.source}: ${ref.frame} must exist at both revisions.`);
              const parent = selected.get(key) ?? { source: ref.source, frame: ref.frame, before: old, after: current, status: 'matched', matchKind: 'exact', matchCandidates: [] };
              parents.set(key, parent);
              if (!selected.has(key)) support.push(parent);
            }
            row.parentRow = parents.get(key);
          }
          const candidates = frames.filter(row => row.matchKind === 'renamed_or_unknown');
          if (candidates.length) warnings.push({
            code: 'DIFF_RENAMED_OR_UNKNOWN',
            message: `Unmatched frames have rename candidates: ${candidates.map(row => frameKey(row)).join(', ')}.`, next: [],
          });
          for (const source of failed) for (const values of built) values.delete(source);
          result.frames = frames.filter(row => !failed.has(row.source));
          result.support = support.filter(row => !failed.has(row.source));
        };
        if (deferParts) result.prepareParts = prepareParts;
        else await prepareParts();
        return result;
      },
      async close() { closed = true; await close(); },
    };
  } catch (error) {
    await cleanup(close, error);
    throw error;
  }
}
