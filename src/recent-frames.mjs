import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isSourcePath, isFeatureInternal, sourceFeature } from './toolkit/project.mjs';
import { dirtyGeneration, git, visitRange, visitRevision } from './recent-history.mjs';

import { gitBlobs } from './toolkit/git-blobs.mjs';
const pageSize = 20;
const key = (source, frame) => JSON.stringify([source, frame]);

async function sourceHistory(repository, head, since, after) {
  if (!head) return [];
  // Sort by committer time before asking Git for file names in bounded batches.
  // First-parent traversal alone can contain commits with out-of-order clocks.
  const log = await git(repository, 'log', '--first-parent', '-z', '--format=%H%x00%P%x00%ct%x00%s',
    ...(since ? [since + '..' + head] : [...(after ? ['--since-as-filter=@' + Math.floor(after / 1000)] : []), head]),
    '--');
  const fields = log.split('\0'), commits = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [sha, parents, time, subject] = fields.slice(i, i + 4);
    commits.push({ sha, base: parents.split(' ')[0] || null, time: Number(time) * 1000, subject });
  }
  return commits.sort((a, b) => b.time - a.time);
}

async function nameOnly(repository, commits, specs) {
  const log = await git(repository, 'log', '--no-walk=unsorted', '--root', '--diff-merges=first-parent',
    '--no-renames', '-z', '--format=%x00%H', '--name-only', ...commits.map(commit => commit.sha), '--', ...specs);
  const fields = log.split('\0'), names = new Map();
  for (let i = 1; i < fields.length - 1;) {
    const sha = fields[i++], files = [];
    while (i < fields.length && fields[i]) files.push(fields[i++].replace(/^\n/, ''));
    while (i < fields.length && !fields[i]) i++;
    names.set(sha, files);
  }
  return names;
}

function revisionTrees(repository, paths, head, changes) {
  const trees = new Map(), blobs = new Map();
  let reader;
  async function tree(sha) {
    if (!sha) return new Map();
    if (!trees.has(sha)) trees.set(sha, (async () => {
      const raw = await git(repository, 'ls-tree', '-r', '-z', sha, '--', ...paths);
      const files = new Map();
      for (const line of raw.split('\0')) {
        const separator = line.indexOf('\t');
        if (separator < 0) continue;
        const [mode, type, oid] = line.slice(0, separator).split(' ');
        if (type === 'blob' && mode.startsWith('100')) files.set(path.join(repository, line.slice(separator + 1)), oid);
      }
      return files;
    })());
    return trees.get(sha);
  }
  const blob = oid => {
    if (!blobs.has(oid)) blobs.set(oid, (reader ??= gitBlobs(repository)).read(oid));
    return blobs.get(oid);
  };
  return {
    tree,
    close: () => reader?.close(),
    async working() {
      const files = new Map(await tree(head));
      await Promise.all(changes.map(async ({ before, after }) => {
        if (before) files.delete(path.join(repository, before));
        if (after && paths.some(prefix => prefix === '.' || after.startsWith(prefix + '/'))) {
          const file = path.join(repository, after);
          if ((await lstat(file)).isFile()) files.set(file, file);
        }
      }));
      return files;
    },
    files(tree) {
      return {
        has: file => tree.has(file),
        async read(file, encoding) {
          const oid = tree.get(file);
          if (!oid) throw Error('Source input is absent: ' + path.relative(repository, file));
          const bytes = path.isAbsolute(oid) ? await readFile(oid) : await blob(oid);
          return encoding ? bytes.toString(encoding) : bytes;
        }
      };
    }
  };
}

function designPaths(config, repository) {
  const design = path.relative(repository, config.design);
  const arch = config.archDirectory && path.relative(repository, config.archDirectory);
  const paths = [...new Set([design || '.', ...(arch ? [arch] : [])])];
  const specs = config.sources.map(dir => ':(glob)' + path.posix.join(design, dir, '**/*.tsx'));
  if (arch) for (const ext of ['mmd', 'md']) specs.push(':(glob)' + path.posix.join(arch, '**/*.' + ext));
  function candidate(file) {
    const name = path.posix.relative(design || '.', file);
    if (isSourcePath(name, config.sources))
      return isFeatureInternal(name, config.sources) ? path.posix.join(path.posix.dirname(file), 'index.tsx') : file;
    if (arch && file.startsWith(arch + '/') && /\.(mmd|md)$/.test(file))
      return file.replace(/\.md$/, '.mmd');
  }
  return { paths, specs, candidate };
}

function sameOrigin(code, origins, frame) {
  const origin = origins.get(frame);
  return origin && code.get(path.resolve(origin.fileName))?.site({ line: origin.lineNumber, column: origin.columnNumber });
}

async function diffSources({ config, repository, trees, commit, before, after, candidates, allowed, exactFrame, failures, enough }) {
  const { buildSource } = await import('./toolkit/build.mjs');
  const { captureFrameOrigins } = await import('./toolkit/runtime.mjs');
  const { declarations } = await import('./toolkit/frame-declarations.mjs');
  const { frameOwners } = await import('./toolkit/source-facts.mjs');
  const origins = captureFrameOrigins();
  const changed = commit.files.map(file => path.join(repository, file));
  const current = trees.files(after), original = trees.files(before);
  const rows = [];
  const mayMove = candidates.some(source => !after.has(path.join(repository, source)));
  let compared = 0;
  async function compare(source) {
    const file = path.join(repository, source), relative = path.relative(config.design, file);
    const timestamp = commit.times?.get(source) ?? commit.time;
    const direct = changed.filter(name => name === file || (isSourcePath(path.relative(config.design, name), config.sources) &&
      sourceFeature(path.relative(config.design, name), config.sources) === sourceFeature(relative, config.sources)));
    if (!before.has(file) && !after.has(file)) return [];
    if (source.endsWith('.mmd')) {
      if (exactFrame && exactFrame !== 'default') return [];
      const note = file.replace(/\.mmd$/, '.md');
      const signature = async fs => fs.has(file)
        ? JSON.stringify([await fs.read(file, 'utf8'), fs.has(note) && await fs.read(note, 'utf8')])
        : undefined;
      const [old, next] = await Promise.all([signature(original), signature(current)]);
      return old === next ? [] : [{ frame: 'default', status: !old ? 'added' : !next ? 'removed' : 'changed' }];
    }
    // Evaluate the old entry with new shared inputs. Changed files inside the
    // feature stay on their respective sides. Old-only imports remain resolvable.
    const local = new Set(direct);
    const old = before.has(file) && after.has(file) ? trees.files({
      has: name => local.has(name) ? before.has(name) : after.has(name) || before.has(name),
      get: name => local.has(name) ? before.get(name) : after.get(name) ?? before.get(name)
    }) : original;
    const build = fs => fs.has(file)
      ? buildSource(config, file, { write: false, files: fs, framesOnly: true }).then(result => result.frames)
      : [];
    let comparable = true;
    const prior = Promise.resolve(build(old)).catch(error => {
      if (old === original) throw error;
      comparable = false;
      return build(original);
    });
    const [left, right] = await Promise.all([prior, build(current)]);
    const code = async fs => new Map(await Promise.all(direct.filter(name => fs.has(name))
      .map(async name => [name, declarations(await fs.read(name, 'utf8'))])));
    const both = left.length && right.length;
    const [leftCode, rightCode] = both ? await Promise.all([code(comparable ? old : original), code(current)]) : [new Map(), new Map()];
    const a = new Map(left.map(frame => [frame.name, frame])), b = new Map(right.map(frame => [frame.name, frame]));
    return [...new Set([...b.keys(), ...a.keys()])].flatMap(frame => {
      if (exactFrame && exactFrame !== frame) return [];
      const previous = a.get(frame), next = b.get(frame);
      if (!previous || !next) return [{ frame, status: next ? 'added' : 'removed' }];
      const partChanged = [...frameOwners(previous.html), ...frameOwners(next.html)].some(({ source, export: name }) => {
        const owner = path.join(config.design, source);
        return leftCode.get(owner)?.part(name) !== rightCode.get(owner)?.part(name);
      });
      return partChanged || (comparable && JSON.stringify(previous) !== JSON.stringify(next)) ||
        sameOrigin(leftCode, origins, previous) !== sameOrigin(rightCode, origins, next)
        ? [{ frame, status: 'changed' }] : [];
    }).map(row => ({ ...row, time: timestamp }));
  }
  for (const group of batches(candidates, 6)) {
    const results = await Promise.all(group.map(async source => {
      try {
        return (await compare(source)).map(row => ({ source, ...row, time: row.time ?? commit.times?.get(source) ?? commit.time }));
      } catch (error) {
        failures.add(source + ': ' + error.message);
        return [];
      }
    }));
    compared += group.length;
    rows.push(...results.flat());
    if (commit.sha && !mayMove && enough(rows)) break;
  }
  const removed = rows.filter(row => row.status === 'removed'), added = rows.filter(row => row.status === 'added');
  const consumed = new Set();
  for (const next of added) {
    const matches = removed.filter(old => old.frame === next.frame);
    if (matches.length !== 1 || added.filter(row => row.frame === next.frame).length !== 1) continue;
    const old = matches[0];
    next.status = 'moved';
    next.former = { source: old.source, frame: old.frame };
    consumed.add(old);
  }
  return { rows: rows.filter(row => !consumed.has(row) && allowed(row.source))
    .sort((a, b) => b.time - a.time), compared };
}

function* batches(items, size) {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}

export async function recentFrameState(config, { day, week, since, latest, scope, visible, frame }, repository) {
  const { head, branch } = await visitRevision(config.root);
  if (!branch) return { available: false, rows: [] };
  const [dirty, rangeInfo] = await Promise.all([
    dirtyGeneration(config.root, head, config.output, { includeChanges: true, repository }),
    head ? visitRange(config.root, head, since) : { since: null, notice: null }
  ]);
  const snapshot = createHash('sha256').update(JSON.stringify([
    head, branch, dirty.generation, config.design, config.archDirectory, config.sources, day, week, since, latest, scope, visible, frame
  ])).digest('hex');
  return { available: true, head, branch, snapshot, dirty, rangeInfo };
}

export async function recentFrames({ config, state, offset, week, latest, scope, visible, frame, preparationMs }) {
  const start = performance.now();
  const { head, branch, dirty, rangeInfo, snapshot } = state;
  const { since, notice } = rangeInfo;
  const { repository } = dirty;
  const root = config.root;
  let trees;
  try {
    const { paths, specs, candidate } = designPaths(config, repository);
    const projectPath = file => path.relative(root, path.join(repository, file));
    const designPath = file => path.relative(config.design, path.join(repository, file));
    const shown = new Set(visible);
    const allowed = file => scope === 'all' || shown.has(designPath(file)) || shown.has(projectPath(file)) ||
      (scope?.startsWith('layer:') && designPath(file).startsWith(scope.slice(6) + '/')) ||
      (scope?.startsWith('group:') && path.posix.dirname(designPath(file)) === scope.slice(6));
    const history = await sourceHistory(repository, head, since, latest && !notice ? null : week);
    const changes = dirty.changes.flatMap(({ before, after }) => [...new Set([before, after].filter(Boolean))]);
    const dirtyTimes = new Map();
    await Promise.all(dirty.changes.map(async ({ before, after }) => {
      const source = candidate(after ?? before);
      if (!source) return;
      const time = after ? await lstat(path.join(repository, after)).then(info => Math.floor(info.mtimeMs)) : Date.now();
      dirtyTimes.set(source, Math.max(time, dirtyTimes.get(source) ?? 0));
    }));
    if (dirtyTimes.size) history.unshift({ sha: null, base: head, time: Date.now(), times: dirtyTimes, subject: 'Uncommitted changes', files: changes });

    const scanEnd = performance.now();
    trees = revisionTrees(repository, paths, head, dirty.changes);
    const unique = new Map(), failures = new Set();
    let sources = 0, commits = 0, pathScanMs = 0;
    const feedFull = nextTime => [...unique.values()]
      .filter(row => row && row.time >= nextTime).length > offset + pageSize;
    let processed = 0;
    for (const batch of batches(history, 24)) {
      const committed = batch.filter(commit => commit.sha);
      const scanStart = performance.now();
      const names = committed.length ? await nameOnly(repository, committed, specs) : new Map();
      pathScanMs += performance.now() - scanStart;
      for (const commit of batch) {
        if (feedFull(commit.time)) break;
        processed++;
        commit.files ??= names.get(commit.sha) ?? [];
        const candidates = [...new Set(commit.files.map(candidate).filter(Boolean))];
        if (!candidates.some(allowed)) continue;
        // Retain other paths in this commit when they could be former locations.
        const [before, after] = await Promise.all([trees.tree(commit.base), commit.sha ? trees.tree(commit.sha) : trees.working()]);
        const relevant = candidates.filter(file => allowed(file) ||
          before.has(path.join(repository, file)) && !after.has(path.join(repository, file)));
        commits++;
        const { rows, compared } = await diffSources({
          config, repository, trees, commit, before, after, candidates: relevant, allowed, exactFrame: frame, failures,
          enough: rows => [...unique.values()].filter(row => row && row.time >= commit.time).length +
            rows.filter(row => !unique.has(key(row.source, row.frame))).length > offset + pageSize
        });
        sources += compared;
        for (const row of rows) {
          const id = key(row.source, row.frame);
          if (!unique.has(id)) unique.set(id, {
            ...row, source: projectPath(row.source), subject: commit.subject, commit: commit.sha,
            ...(row.former && { former: { ...row.former, source: projectPath(row.former.source) } })
          });
          if (row.former) unique.set(key(row.former.source, row.former.frame), null);
        }
      }
      if (feedFull(history[processed]?.time ?? -Infinity)) break;
    }
    const diffEnd = performance.now();
    const frameDiffMs = diffEnd - scanEnd - pathScanMs;
    const rows = [...unique.values()].filter(Boolean).sort((a, b) => b.time - a.time);
    const result = { available: true, head, branch, generation: dirty.generation, notice,
      snapshot, rows: rows.slice(offset, offset + pageSize), hasMore: rows.length > offset + pageSize,
      failures: [...failures].slice(0, 5) };
    const [current, final] = await Promise.all([
      visitRevision(root), dirtyGeneration(root, head, config.output, { repository })
    ]);
    if (head !== current.head || branch !== current.branch || dirty.generation !== final.generation) return { stale: true };
    return { ...result, timings: { gitScanMs: preparationMs + scanEnd - start + pathScanMs, frameDiffMs, validationMs: performance.now() - diffEnd, sources, commits } };
  } finally {
    await trees?.close();
  }
}
