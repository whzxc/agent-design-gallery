import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export const indexDigest = value => createHash('sha256').update(value).digest('hex');
const absent = error => error.code === 'ENOENT';

/** Disposable immutable shards. Each rename advertises one completed projection. */
export async function createIndexStore({ directory, persist = true, memoryLimit = 32 * 1024 * 1024, diskLimit = 256 * 1024 * 1024 }) {
  const memory = new Map(), access = new Map();
  let memoryBytes = 0, queue = Promise.resolve(), closed = false;
  const counters = { memoryHits: 0, diskHits: 0, writes: 0 };
  const touch = name => {
    access.delete(name); access.set(name, Date.now());
    if (access.size > 4096) access.delete(access.keys().next().value);
  };
  if (persist) await mkdir(directory, { recursive: true });
  const remember = (key, bytes) => {
    const old = memory.get(key);
    if (old) { memory.delete(key); memoryBytes -= old.length; }
    if (bytes.length > memoryLimit) return;
    memory.set(key, bytes); memoryBytes += bytes.length;
    while (memoryBytes > memoryLimit) { const [first, value] = memory.entries().next().value; memory.delete(first); memoryBytes -= value.length; }
  };
  async function trim() {
    const files = [];
    for (const name of await readdir(directory)) if (/^[a-f0-9]{64}\.json$/.test(name)) {
      try { const info = await stat(path.join(directory, name)); files.push({ name, bytes: info.size, accessed: access.get(name) ?? info.mtimeMs }); }
      catch (error) { if (!absent(error)) throw error; }
    }
    let bytes = files.reduce((sum, file) => sum + file.bytes, 0);
    const retained = [...files].sort((a, b) => a.accessed - b.accessed || a.name.localeCompare(b.name));
    while (bytes > diskLimit && retained.length) {
      const file = retained.shift();
      try { await unlink(path.join(directory, file.name)); } catch (error) { if (!absent(error)) throw error; }
      access.delete(file.name); bytes -= file.bytes;
    }
    return retained.map(({ name, bytes }) => ({ file: name, bytes }));
  }
  async function atomic(file, bytes) {
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, bytes); await rename(temporary, file); }
    finally { try { await unlink(temporary); } catch (error) { if (!absent(error)) throw error; } }
  }
  if (persist) await trim();
  return {
    async get(key) {
      if (closed) throw Error('Project index store is closed.');
      const name = indexDigest(key) + '.json';
      let bytes = memory.get(key);
      if (bytes) { counters.memoryHits++; remember(key, bytes); }
      else if (persist) {
        try { bytes = await readFile(path.join(directory, name)); }
        catch (error) { if (!absent(error)) throw error; }
        if (bytes) counters.diskHits++;
      }
      if (!bytes) return null;
      touch(name);
      try {
        const saved = JSON.parse(bytes.toString('utf8'));
        if (saved.version !== 1 || saved.key !== key || !Object.hasOwn(saved, 'value')) return null;
        remember(key, bytes);
        return saved.value;
      } catch (error) { if (error instanceof SyntaxError) return null; throw error; }
    },
    put(key, value) {
      if (closed) throw Error('Project index store is closed.');
      const bytes = Buffer.from(JSON.stringify({ version: 1, key, value }));
      const operation = queue.then(async () => {
        if (persist && bytes.length <= diskLimit) {
          const name = indexDigest(key) + '.json';
          await atomic(path.join(directory, name), bytes); touch(name);
          const entries = await trim();
          await atomic(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, entries }));
          counters.writes++;
        }
        remember(key, bytes);
      });
      queue = operation.catch(() => {});
      return operation;
    },
    stats: () => ({ ...counters, memoryBytes, entries: memory.size }),
    async close() { closed = true; await queue; memory.clear(); memoryBytes = 0; access.clear(); },
  };
}
