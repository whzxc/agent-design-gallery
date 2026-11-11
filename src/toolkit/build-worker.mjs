import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildSource } from './build.mjs';

parentPort.on('message', async ({ id, config, name }) => {
  try {
    const snapshot = new Map();
    const built = await buildSource(config, path.join(name.endsWith('.mmd')?config.root:config.design, name), { write: false, snapshot });
    const frames = JSON.parse(JSON.stringify(built.frames.map(({ document, ...frame }) => frame))); 
    const dependencies = [...new Set(built.dependencies.map(file => path.relative(config.design, file).split(path.sep).join('/')))].sort();
    const dependencyHashes = Object.fromEntries(dependencies.map(name => {
      const bytes=snapshot.get(path.join(config.design,name));
      return [name,createHash('sha256').update(bytes===null?'missing\0':'present\0').update(bytes??'').digest('hex')];
    }));
    parentPort.postMessage({ id, result: { frames, css: built.css, imports: built.imports, dependencies, dependencyHashes }, heapBytes: process.memoryUsage().heapUsed });
  } catch (error) {
    parentPort.postMessage({ id, error: { message: error.message, stack: error.stack, code: error.code }, heapBytes: process.memoryUsage().heapUsed });
  }
});
