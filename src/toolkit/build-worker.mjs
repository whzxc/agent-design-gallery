import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildSource } from './build.mjs';
import { createArchBrowser } from './arch-browser.mjs';

const archBrowser = createArchBrowser();
let shuttingDown = false;

parentPort.on('message', async ({ id, config, name, type }) => {
  if (type === 'shutdown') {
    shuttingDown = true;
    try { await archBrowser.close(); }
    finally { parentPort.postMessage({type:'closed'}); parentPort.close(); }
    return;
  }
  if (shuttingDown) return;
  try {
    const snapshot = new Map();
    const build = async browser => config.overlay && name.endsWith('.mmd') ? (await import('./arch-overlay.mjs')).buildOverlay(config,path.join(config.root,name),{base:config.overlay,browser,snapshot}) : buildSource(config, path.join(name.endsWith('.mmd')?config.root:config.design, name), { write: false, snapshot, browser });
    const built = await (name.endsWith('.mmd') ? archBrowser.run(build) : build());
    const frames = JSON.parse(JSON.stringify(built.frames.map(({ document, ...frame }) => frame))); 
    const dependencies = [...new Set(built.dependencies.map(file => path.relative(config.design, file).split(path.sep).join('/')))].sort();
    const dependencyHashes = Object.fromEntries(dependencies.map(name => {
      const bytes=snapshot.get(path.join(config.design,name));
      return [name,createHash('sha256').update(bytes===null?'missing\0':'present\0').update(bytes??'').digest('hex')];
    }));
    if (!shuttingDown) parentPort.postMessage({ id, result: { frames, css: built.css, ...(config.overlay?{baseBlob:built.baseBlob}:{}), imports: built.imports, dependencies, dependencyHashes }, heapBytes: process.memoryUsage().heapUsed });
  } catch (error) {
    if (!shuttingDown) parentPort.postMessage({ id, error: { message: error.message, stack: error.stack, code: error.code }, heapBytes: process.memoryUsage().heapUsed });
  }
});
