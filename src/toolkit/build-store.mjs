import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const aborted = () => Object.assign(new Error('Build superseded'), { name: 'AbortError' });
const memoryLimit = 32 * 1024 * 1024, diskLimit = 256 * 1024 * 1024;
const workerLimit = 2, recycleAfter = 32;

class BuildPool {
  slots = new Set(); retiring = new Set(); queue = []; nextId = 0; closed = false;
  counters = { attempts: 0, spawned: 0, recycled: 0, cancelled: 0 };
  run(payload, signal) {
    return new Promise((resolve, reject) => {
      if (this.closed || signal.aborted) return reject(aborted());
      const job = { id: ++this.nextId, payload, signal, resolve, reject };
      job.abort = () => {
        if (job.done) return;
        this.counters.cancelled++;
        const slot = [...this.slots].find(slot => slot.job === job);
        this.finish(job, aborted());
        this.queue = this.queue.filter(item => item !== job);
        if (slot) this.retire(slot);
        this.drain();
      };
      signal.addEventListener('abort', job.abort, { once: true });
      this.queue.push(job); this.drain();
    });
  }
  finish(job, error, result) {
    if (job.done) return;
    job.done = true; job.signal.removeEventListener('abort', job.abort);
    error ? job.reject(error) : job.resolve(result);
  }
  retire(slot) {
    if (slot.retired) return;
    slot.retired = true;
    const done = slot.worker.terminate().finally(() => {
      this.slots.delete(slot); this.retiring.delete(done); this.drain();
    });
    this.retiring.add(done);
  }
  create() {
    const slot = { worker: new Worker(new URL('./build-worker.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 256 } }), attempts: 0, job: null };
    this.slots.add(slot); this.counters.spawned++;
    slot.worker.on('message', message => {
      if (slot.retired || message.id !== slot.job?.id) return;
      const job = slot.job; slot.job = null;
      slot.heapBytes = message.heapBytes;
      this.finish(job, message.error ? Object.assign(new Error(message.error.message), message.error) : null, message.result);
      if (slot.attempts >= recycleAfter) { this.counters.recycled++; this.retire(slot); }
      else slot.worker.unref();
      this.drain();
    });
    const failed = error => {
      if (slot.retired) return;
      if (slot.job) this.finish(slot.job, error);
      this.retire(slot); this.drain();
    };
    slot.worker.on('error', failed);
    slot.worker.on('exit', code => { if (!slot.retired) failed(new Error(`Build worker exited ${code}`)); });
    slot.worker.unref();
    return slot;
  }
  drain() {
    if (this.closed) return;
    while (this.queue.length) {
      let slot = [...this.slots].find(slot => !slot.retired && !slot.job);
      if (!slot && this.slots.size < workerLimit) slot = this.create();
      if (!slot) return;
      const job = this.queue.shift(); if (job.done) continue;
      slot.job = job; slot.attempts++; this.counters.attempts++; slot.worker.ref(); slot.worker.postMessage({ id: job.id, ...job.payload });
    }
  }
  async close() {
    this.closed = true;
    for (const job of this.queue) this.finish(job, aborted());
    this.queue = [];
    for (const slot of this.slots) {
      if (slot.job) this.finish(slot.job, aborted());
      this.retire(slot);
    }
    await Promise.all(this.retiring);
  }
  stats() { return { ...this.counters, workers: this.slots.size, retiring: this.retiring.size, active: [...this.slots].filter(s => !s.retired && s.job).length, queued: this.queue.length, workerHeapBytes: [...this.slots].map(s => s.heapBytes ?? 0) }; }
}

export async function createBuildStore({ config, cacheDirectory }) {
  const design = await realpath(config.design);
  const workerConfig = { root: config.root, design, output: config.output, sources: config.sources };
  const require = createRequire(import.meta.url);
  const fingerprint = digest(Buffer.concat(await Promise.all([
    ...['../../package.json', './build.mjs', './runtime.mjs', './tokens.mjs', './text.mjs', './project.mjs', './build-worker.mjs', './build-store.mjs'].map(file => new URL(file, import.meta.url)),
    require.resolve('esbuild/package.json'), require.resolve('tailwindcss/package.json'),
  ].map(file => readFile(file)))));
  const namespace = digest(JSON.stringify({ fingerprint, design, sources: config.sources, sourceFiles: config.sourceFiles }));
  const directory = cacheDirectory, indexPath = path.join(directory, 'index.json');
  await mkdir(directory, { recursive: true });
  const pool = new BuildPool(), entries = new Map(), reverse = new Map(), pending = new Map(), generations = new Map(), memory = new Map();
  let memoryBytes = 0, writes = Promise.resolve(), closed = false;
  const access = new Map();
  const touch = hash => {
    access.delete(hash); access.set(hash, Date.now());
    if (access.size > 4096) access.delete(access.keys().next().value);
  };
  const counters = { cacheHits: 0, diskHits: 0, builds: 0 };
  const inputHash = hashes => digest(JSON.stringify({ namespace, dependencies: Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)) }));
  const remember = (hash, payload) => {
    const size = Buffer.byteLength(JSON.stringify(payload));
    if (memory.has(hash)) { memoryBytes -= memory.get(hash).size; memory.delete(hash); }
    if (size > memoryLimit) return;
    memory.set(hash, { payload, size }); memoryBytes += size;
    while (memoryBytes > memoryLimit) { const [key, value] = memory.entries().next().value; memory.delete(key); memoryBytes -= value.size; }
  };
  const link = entry => {
    for (const name of entry.dependencies) {
      if (!reverse.has(name)) reverse.set(name, new Set());
      reverse.get(name).add(entry.path);
    }
  };
  const unlinkEntry = entry => {
    for (const name of entry.dependencies) { const uses = reverse.get(name); uses?.delete(entry.path); if (!uses?.size) reverse.delete(name); }
  };
  async function hashesFor(dependencies, cache = new Map()) {
    try { return Object.fromEntries(await Promise.all(dependencies.map(async name => {
      if (!cache.has(name)) cache.set(name, readFile(path.join(config.design, name)).then(digest));
      return [name, await cache.get(name)];
    }))); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; throw error; }
  }
  async function valid(entry, cache) {
    const hashes = await hashesFor(entry.dependencies, cache);
    return hashes && inputHash(hashes) === entry.inputHash;
  }
  function persist(hash, payload) {
    writes = writes.catch(() => {}).then(async () => {
      const file = path.join(directory, `${hash}.json`), temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(payload)); await rename(temporary, file);
      await trimDisk();
      const indexTemporary = `${indexPath}.${process.pid}.${randomUUID()}.tmp`;
      const saved = { namespace, entries: [...entries.values()].map(({ stale, ...entry }) => entry) };
      await writeFile(indexTemporary, JSON.stringify(saved)); await rename(indexTemporary, indexPath);
    });
    return writes;
  }
  async function trimDisk() {
    const files = await readdir(directory);
    const blobs = (await Promise.all(files.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(async name => {
      try { return { name, ...(await stat(path.join(directory, name))) }; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }))).filter(Boolean);
    let bytes = blobs.reduce((sum, file) => sum + file.size, 0);
    for (const file of blobs.sort((a, b) => (access.get(a.name.slice(0, -5)) ?? a.mtimeMs) - (access.get(b.name.slice(0, -5)) ?? b.mtimeMs))) {
      if (bytes <= diskLimit) break;
      try { await unlink(path.join(directory, file.name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      bytes -= file.size;
      // Payload eviction must keep source metadata and reverse edges: a visible
      // preview may outlive its build blob and still needs dependency refreshes.
      access.delete(file.name.slice(0, -5));
    }
  }
  try {
    const saved = JSON.parse(await readFile(indexPath, 'utf8'));
    const startupHashes = new Map();
    for (const entry of saved?.namespace === namespace && Array.isArray(saved.entries) ? saved.entries : []) if (await valid(entry, startupHashes)) { entries.set(entry.path, entry); link(entry); }
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  await trimDisk();
  async function loadPayload(hash) {
    touch(hash);
    const cached = memory.get(hash);
    if (cached) { memory.delete(hash); memory.set(hash, cached); counters.cacheHits++; return cached.payload; }
    try {
      const payload = JSON.parse(await readFile(path.join(directory, `${hash}.json`), 'utf8'));
      remember(hash, payload); counters.diskHits++; return payload;
    } catch (error) { if (error.code === 'ENOENT' || error instanceof SyntaxError) return null; throw error; }
  }
  function invalidate(paths) {
    paths = [...paths];
    const affected = new Set();
    for (const name of paths) {
      if (entries.has(name) || pending.has(name)) affected.add(name);
      for (const consumer of reverse.get(name) ?? []) affected.add(consumer);
    }
    // First builds have no reverse edges yet; an edit can affect any pending
    // unknown consumer, so cancel those until its closure has been learned.
    if (paths.length) for (const name of pending.keys()) if (!entries.has(name) || entries.get(name).stale) affected.add(name);
    for (const name of affected) {
      generations.set(name, (generations.get(name) ?? 0) + 1);
      pending.get(name)?.controller.abort(); pending.delete(name);
      // Keep dependency edges until the replacement build has completed.
      const entry = entries.get(name);
      if (entry && !existsSync(path.join(config.design, name))) { unlinkEntry(entry); entries.delete(name); generations.delete(name); }
      else if (entry) entry.stale = true;
    }
    return [...affected];
  }
  async function get(name, { signal } = {}) {
    if (closed || signal?.aborted) throw aborted();
    let promise = pending.get(name)?.promise;
    if (!promise) {
      const controller = new AbortController(), generation = generations.get(name) ?? 0;
      const task = { controller };
      task.promise = (async () => {
        const old = entries.get(name);
        // Content hashes were validated at startup; live changes are supplied by
        // the project watcher through invalidate(), avoiding repeated closure IO.
        if (old && !old.stale) {
          const payload = await loadPayload(old.hash);
          if (controller.signal.aborted || generation !== (generations.get(name) ?? 0)) throw aborted();
          if (payload) return { ...old, ...payload };
        }
        const built = await pool.run({ config: workerConfig, name }, controller.signal); counters.builds++;
        if (controller.signal.aborted || generation !== (generations.get(name) ?? 0)) throw aborted();
        const payload = { frames: built.frames, css: built.css };
        const hash = digest(JSON.stringify({ path: name, component: !name.startsWith('surfaces/'), ...payload, imports: built.imports }));
        const entry = { path: name, hash, inputHash: inputHash(built.dependencyHashes), imports: built.imports, dependencies: built.dependencies, dependencyHashes: built.dependencyHashes,
          frames: built.frames.map(({ html, ...frame }) => frame) };
        if (old) unlinkEntry(old); entries.set(name, entry); link(entry); remember(hash, payload);
        touch(hash);
        await persist(hash, payload);
        if (controller.signal.aborted || generation !== (generations.get(name) ?? 0)) throw aborted();
        return { ...entry, ...payload };
      })().finally(() => { if (pending.get(name) === task) pending.delete(name); });
      pending.set(name, task); promise = task.promise;
    }
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const abort = () => reject(aborted()); signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  return {
    get, invalidate,
    metadata: async () => [...entries.values()].filter(entry => !entry.stale),
    getPayload: loadPayload,
    stats: () => ({ ...counters, ...pool.stats(), entries: entries.size, memoryBytes }),
    async close() { closed = true; for (const task of pending.values()) task.controller.abort(); await pool.close(); await Promise.allSettled([...pending.values()].map(task => task.promise)); await writes; },
  };
}
