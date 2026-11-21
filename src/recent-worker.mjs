import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { loadConfig } from './toolkit/config.mjs';
import { openDiffRevision } from './toolkit/diff-inputs.mjs';
import { createIndexStore } from './toolkit/index-store.mjs';
import { trackedHash, inputBytes } from './toolkit/input-generation.mjs';
import { structuralChanges } from './toolkit/recent-structure.mjs';
import { dirtyGeneration, emptyTree, historyPeriods, visitRevision } from './recent-history.mjs';

async function validDependencies(entries) {
  for (const [file, hash] of entries) if (trackedHash(await inputBytes(file)) !== hash) return false;
  return true;
}

export async function recentHistory({
  root,
  directory,
  temporaryDirectory,
  day,
  week,
  since,
  environment,
  visual,
  onProgress
}) {
  const config = await loadConfig(root);
  const { head, branch } = await visitRevision(root);
  if (!branch) return { available: false, complete: false, periods: [] };
  const dirty = await dirtyGeneration(root, head, config.output);
  const { periods, notice } = head
    ? await historyPeriods(root, head, { day, week, since })
    : { periods: [], notice: null };
  periods.unshift({ title: 'Uncommitted', subjects: [], base: head, head: null });
  const pool = new Map();
  async function openRevision(sha) {
    if (!pool.has(sha))
      pool.set(sha, await openDiffRevision({ root: dirty.repository, sha, rev: sha }, root, temporaryDirectory));
    return { ...pool.get(sha), close: async () => {} };
  }
  const store = await createIndexStore({ directory, diskLimit: 32 * 1024 * 1024 });
  try {
    // All comparisons reuse the installed dependency environment of the project.
    const inputs = createHash('sha256').update(
      JSON.stringify([environment, process.version, process.arch, release(), config.diff])
    );
    const toolkit = new URL('./toolkit/', import.meta.url);
    for (const file of (await readdir(toolkit)).sort().filter((name) => name.endsWith('.mjs')))
      inputs.update(await readFile(new URL(file, toolkit)));
    for (const name of ['./recent-worker.mjs', '../package.json'])
      inputs.update(await readFile(new URL(name, import.meta.url)));
    for (let d = root; ; d = path.dirname(d)) {
      for (const name of [
        'package.json',
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'bun.lock',
        'bun.lockb',
        'npm-shrinkwrap.json',
        'node_modules/.package-lock.json'
      ]) {
        const bytes = await inputBytes(path.join(d, name));
        if (bytes) inputs.update(bytes);
      }
      if (d === dirty.repository || d === path.dirname(d)) break;
    }
    const context = inputs.digest('hex');
    let dirtyCache;
    for (const period of periods) period.base ??= await emptyTree(root);
    const selected = visual
      ? periods.filter((p) => (p.base ?? '') === visual.base && (p.head ?? '') === visual.head)
      : periods;
    if (visual && (selected.length !== 1 || (!visual.head && visual.generation !== dirty.generation)))
      throw Error('Period changed. Refresh Recently updated.');
    for (const period of selected) {
      if (!period.head && !dirty.count) {
        Object.assign(period, { rows: [], complete: true });
        continue;
      }
      const key = visual
        ? JSON.stringify([
            'visual',
            root,
            period.base,
            period.head,
            period.head ? null : dirty.generation,
            context
          ])
        : JSON.stringify([
            1,
            root,
            head,
            period.base,
            period.head,
            period.head ? null : dirty.generation,
            day,
            week,
            context
          ]);
      let result = await store.get(key);
      const cached = !!result && (await validDependencies(result.dependencies));
      if (!cached) {
        try {
          const compare = visual ? (await import('./toolkit/review.mjs')).reviewFrameChanges : structuralChanges;
          result = await compare(config, {
            onProgress,
            base: period.base,
            head: period.head ?? undefined,
            openRevision,
            temporaryDirectory
          });
          if (result.complete) {
            if (period.head) await store.put(key, result);
            else dirtyCache = { key, result };
          }
        } catch (error) {
          result = { rows: [], complete: false, failures: [{ message: error.message }] };
        }
      }
      const { dependencies, ...projection } = result;
      Object.assign(period, projection, { cached });
    }
    const latest = await visitRevision(root);
    if (
      latest.head !== head ||
      latest.branch !== branch ||
      (await dirtyGeneration(root, head, config.output)).generation !== dirty.generation
    )
      return {
        available: true,
        complete: false,
        stale: true,
        periods: [],
        notice: 'Project changed. Refreshing recent frames…'
      };
    if (dirtyCache) await store.put(dirtyCache.key, dirtyCache.result);
    return {
      available: true,
      head,
      branch,
      generation: dirty.generation,
      notice,
      periods: selected,
      complete: selected.every((p) => p.complete)
    };
  } finally {
    try {
      await store.close();
    } finally {
      await Promise.all([...pool.values()].map((rev) => rev.close()));
    }
  }
}
if (process.send)
  process.once('message', async (args) => {
    let reply;
    try {
      reply = {
        result: await recentHistory({
          ...args,
          onProgress: args.visual ? (progress) => process.send({ progress }) : undefined
        })
      };
    } catch (error) {
      reply = { error: error.message };
    }
    // Large frame lists can exceed the IPC pipe buffer. Close only after the
    // complete reply is in the request's private directory.
    await writeFile(path.join(args.temporaryDirectory, 'result.json'), JSON.stringify(reply));
    process.disconnect();
  });
