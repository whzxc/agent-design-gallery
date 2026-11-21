import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { captureFrameOrigins } from './runtime.mjs';
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
    const origins = config.frameOrigins && captureFrameOrigins();
    const snapshot = new Map();
    const build = async browser => config.overlay && name.endsWith('.mmd') ? (await import('./arch-overlay.mjs')).buildOverlay(config,path.join(config.root,name),{base:config.overlay,browser,snapshot}) : buildSource(config, path.join(name.endsWith('.mmd')?config.root:config.design, name), { write: false, snapshot, browser, allowLegacy: config.allowLegacy ?? true });
    const built = await (name.endsWith('.mmd') ? archBrowser.run(build) : build());
    const frames = JSON.parse(JSON.stringify(built.frames.map(({ document, ...frame }) => frame))); 
    if (origins) built.frames.forEach((frame,i) => {
      const origin = origins.get(frame);
      if (origin) frames[i].declaration = {source:path.relative(config.root,path.resolve(origin.fileName)), line:origin.lineNumber,column:origin.columnNumber};
    });
    const designRoot = realpathSync(config.design);
    const dependencies = [...new Set(built.dependencies.map(file => path.relative(file.startsWith(designRoot + path.sep) ? designRoot : config.design, file).split(path.sep).join('/')))].sort();
    const dependencyHashes = Object.fromEntries(dependencies.map(name => {
      const designFile = path.join(designRoot, name), rawFile = path.join(config.design, name);
      const bytes = snapshot.has(designFile) ? snapshot.get(designFile) : snapshot.get(rawFile);
      if (bytes === undefined) throw Error(`Missing snapshot bytes for dependency ${name}`);
      return [name,createHash('sha256').update(bytes===null?'missing\0':'present\0').update(bytes??'').digest('hex')];
    }));
    if (!shuttingDown) parentPort.postMessage({ id, result: { ...(built.observationDynamic?{observationDynamic:true}:{}), frames, parts: built.parts ?? [], css: built.css,
      ...(built.tokenCss !== undefined ? { tokenCss: built.tokenCss, cssWithoutTokens: built.cssWithoutTokens,
        cssBeforeTokens: built.cssBeforeTokens, cssAfterTokens: built.cssAfterTokens } : {}),
      ...(config.overlay?{baseBlob:built.baseBlob}:{}), imports: built.imports, dependencies, dependencyHashes }, heapBytes: process.memoryUsage().heapUsed });
  } catch (error) {
    const diagnostics=error.errors ?? error.cause?.errors ?? [];
    // esbuild's onLoad error keeps transform diagnostics under detail.errors.
    const location=diagnostics.find(item=>item.location)?.location ?? diagnostics.find(item=>item.detail?.errors?.[0]?.location)?.detail.errors[0].location;
    if (!shuttingDown) parentPort.postMessage({ id, error: { message: error.message, stack: error.stack, code: error.code, context:error.context, location }, heapBytes: process.memoryUsage().heapUsed });
  }
});
