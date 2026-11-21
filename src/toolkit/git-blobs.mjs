import { spawn } from 'node:child_process';

// A single cat-file process serves the blobs actually requested by esbuild.
export function gitBlobs(repository) {
  const child = spawn('git', ['-C', repository, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'ignore'] });
  const chunks = child.stdout[Symbol.asyncIterator]();
  const done = new Promise(resolve => child.once('close', resolve));
  let buffer = Buffer.alloc(0), queue = Promise.resolve(), failure;
  child.on('error', error => { failure = error; });
  child.stdin.on('error', error => { failure = error; });
  async function fill() {
    const next = await chunks.next();
    if (next.done) throw failure ?? Error('Git blob stream ended early.');
    buffer = buffer.length ? Buffer.concat([buffer, next.value]) : next.value;
  }
  async function read(oid) {
    if (failure) throw failure;
    child.stdin.write(oid + '\n');
    let end;
    while ((end = buffer.indexOf(10)) < 0) await fill();
    const header = buffer.toString('ascii', 0, end);
    const size = Number(header.split(' ')[2]);
    if (!Number.isSafeInteger(size)) throw Error('Git blob is absent: ' + oid);
    buffer = buffer.subarray(end + 1);
    const bytes = Buffer.allocUnsafe(size);
    let position = 0;
    while (position < size) {
      if (!buffer.length) await fill();
      const take = Math.min(buffer.length, size - position);
      buffer.copy(bytes, position, 0, take);
      position += take;
      buffer = buffer.subarray(take);
    }
    if (!buffer.length) await fill();
    buffer = buffer.subarray(1);
    return bytes;
  }
  return {
    read(oid) {
      const result = queue.then(() => read(oid));
      queue = result.catch(error => { failure = error; });
      return result;
    },
    async close() {
      await queue;
      child.stdin.end();
      await done;
    }
  };
}
