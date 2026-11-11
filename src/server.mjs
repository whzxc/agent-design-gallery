// Adapted from ARC's MIT-licensed tooling/design-server.mjs.
import { randomUUID, createHash } from 'node:crypto';
import { directLocal, viewerFile, shell, json } from './http.mjs';
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  realpath,
} from "node:fs/promises";
import { watch, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { perfSpan } from './perf.mjs';

import { createBuildStore } from './toolkit/build-store.mjs';
import { CliError, asCliError } from './cli-output.mjs';
import { cleanup } from './toolkit/results.mjs';
import { createViewerCache } from './viewer-cache.mjs';
import { refreshTypes, archFiles, isSourcePath, readGroups, sourceDirectories } from './toolkit/project.mjs';
import { loadConfig } from './toolkit/config.mjs';
import { parseTokens } from './toolkit/tokens.mjs';
import { sourceRelationships } from '../public/relationships.js';
import { resolveScope } from '../public/assets.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const tokenFile = 'tokens.css';
function tokenSourcePath(directory, project) {
  const base = project.design === directory ? project.root : path.dirname(directory);
  return path.relative(base, path.join(directory, tokenFile)).split(path.sep).join('/');
}
const viewerVersion = Promise.all(['assets.js','layout.js','selection.js','arrangement.js','arrangement-worker.js'].map(file => readFile(new URL('../public/'+file,import.meta.url)))).then(parts => digest(Buffer.concat(parts)));
const defaultState = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"),
  "agent-design-gallery",
);
export async function startServer({
  directory,
  port = 0,
  stateDirectory = defaultState,
  fixtures = null,
  readOnly = false,
  instanceId = randomUUID(),
  onDiagnostic, onFatal, watchDirectory = watch,
} = {}) {
  const endStartup = perfSpan('viewer-startup');
  let state = { recent: [], views: {}, selections: {}, theme: "system" };
  const statePath = path.join(stateDirectory, "state.json");
  try {
    state = { ...state, ...JSON.parse(await readFile(statePath, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT")
      throw new CliError(e instanceof SyntaxError ? 'STATE_INVALID' : 'IO_FAILED', `Cannot read preferences: ${e.message}`, { cause: e });
  }
  let root,
    tokenSource = null,
    sources = sourceDirectories(),
    files = new Map(),
    groups = [],
    watcher, archWatcher, activeProject,
    refreshTimer,
    revision = 0,
    closing = false,
    buildStore, viewerCache, codePaths=new Set();
  const overlayStores = new Map(), overlayHashes = new Set();
  let resettingOverlays = false;
  const knownBuilds = new Map(), legacyDependencies = new Map(), failedSources=new Set(), dirtyBuilds=new Set();
  const describe=built=>({...built,css:undefined,frames:built.frames.map(({html,...frame})=>frame)});
  const clients = new Set(),
    svgCache = new Map(),
    frameCounts = new Map(),
    touched = new Set();
  let writes = Promise.resolve();
  const persist = () => {
    if (fixtures) return Promise.resolve();
    const data = JSON.stringify(state, null, 2);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(stateDirectory, { recursive: true });
        await writeFile(statePath, data);
      });
    return writes;
  };
  const emit = (data) => {
    for (const client of clients)
      client.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const diagnostic = (error, name = null, fallback = 'SOURCE_BUILD_FAILED') => {
    if (error.name === 'AbortError') return;
    const at = error.location ?? error.errors?.[0]?.location ?? error.cause?.errors?.[0]?.location;
    const source = name && activeProject ? (name.endsWith('.mmd') ? name : path.relative(activeProject.root,path.join(root,name)).split(path.sep).join('/')) : null;
    onDiagnostic?.(asCliError(error,fallback),source ? {source,frame:null,theme:null,line:Number.isInteger(at?.line)&&at.line>0?at.line:null,column:Number.isInteger(at?.column)?at.column+1:null} : null);
  };
  const refreshError = error => {
    if (error.name === 'AbortError') return;
    emit({error:error.message}); diagnostic(error,null,'WATCH_FAILED');
  };
  const watcherError = (error,kind) => {
    const failure = new CliError('WATCH_FAILED',`${kind} watcher: ${error.message}`,{cause:error});
    emit({error:failure.message}); onFatal?.(failure);
  };
  async function closeOverlays() {
    resettingOverlays = true;
    try { await Promise.all([...overlayStores.values()].map(async pending=>(await pending).close())); }
    finally { overlayStores.clear();overlayHashes.clear();resettingOverlays = false; }
  }
  async function overlayStore(base) {
    if(closing || resettingOverlays)throw Object.assign(Error('Overlay build superseded; retry after refresh.'),{name:'AbortError'});
    const key=base.sha+'\0'+base.rev;
    if(!overlayStores.has(key)) {
      const pending=createBuildStore({config:{...activeProject,design:root,sources,sourceFiles:[...codePaths].sort(),overlay:base},
        cacheDirectory:path.join(stateDirectory,'cache',digest(root),'overlay',base.sha,digest(base.rev))}).then(async store=>{
          for(const built of await store.metadata())overlayHashes.add(built.hash);
          return store;
        });
      overlayStores.set(key,pending);
      pending.catch(()=>{if(overlayStores.get(key)===pending)overlayStores.delete(key);});
    }
    return overlayStores.get(key);
  }
  async function invalidateBuilds(paths) {
    const affected=new Set(buildStore?.invalidate(paths)??[]);
    for(const pending of overlayStores.values())for(const name of (await pending).invalidate(paths))affected.add(name);
    return [...affected];
  }
  async function overlayBuild(name,base) {
    let built;
    try { built=await (await overlayStore(base)).get(name); }
    catch(error) { diagnostic(error,name); throw error; }
    overlayHashes.add(built.hash);frameCounts.set(name,built.frames.length);
    return built;
  }
  async function collect(base, relative = "", out = new Map(), sourceNames = sources, discoveredCode = new Set()) {
    for (const entry of await readdir(path.join(base, relative), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || (relative === "" && entry.name === "art" && !sourceNames.includes("art"))) continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await collect(base, name, out, sourceNames, discoveredCode);
      else if (entry.isFile()) {
        if(/\.[jt]sx?$/.test(name))discoveredCode.add(name);
        if(!(/\.svg$/i.test(name)||isSourcePath(name,sourceNames)))continue;
        const info = await stat(path.join(base, name));
        const version = `${info.mtimeMs}-${info.size}`;
        const old = base === root ? files.get(name) : undefined;
        out.set(
          name,
          old?.stamp === version
            ? old
            : {
                path: name,
                name: path.basename(name, path.extname(name)),
                version,
                stamp: version,
                size: info.size,
                modifiedAt: info.mtimeMs,
              },
        );
      }
    }
    return out;
  }
  async function collectProject(base, project, sourceNames, discoveredCode) {
    const out=await collect(base,'',new Map(),sourceNames,discoveredCode);
    if(project.design !== base) return out;
    for(const file of archFiles(project.arch)) {
      const name=path.relative(project.root,file).split(path.sep).join('/'),info=await stat(file),stamp=`${info.mtimeMs}-${info.size}`;
      const old=files.get(name);
      out.set(name,old?.stamp===stamp?old:{path:name,name:path.basename(name,'.mmd'),layer:'arch',version:stamp,stamp,size:info.size,modifiedAt:info.mtimeMs});
    }
    return out;
  }
  function watchArch(project,base) {
    archWatcher?.close();archWatcher=null;
    const directory=project.archDirectory;
    if(project.design!==base || !directory || !existsSync(directory)) return;
    archWatcher=watchDirectory(directory,{recursive:true},(_event,filename)=>{
      if(!filename || !/\.(mmd|md)$/.test(String(filename)))return;
      const file=path.join(directory,String(filename));
      const dependency=path.relative(base,file).split(path.sep).join('/');
      const name=path.relative(project.root,file).split(path.sep).join('/');
      touched.add(dependency);touched.add(name);invalidateBuilds([dependency,name]).catch(refreshError);
      clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(refreshError),80);
    });
    archWatcher.on('error',e=>watcherError(e,'Architecture'));
  }
  async function openDirectory(input) {
    let next;
    try { next = await realpath(path.resolve(input.replace(/^~(?=$|[\\/])/, os.homedir()))); }
    catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw new CliError('DIRECTORY_NOT_FOUND', `Directory not found: ${input}; choose an existing directory.`, { cause: error });
      throw error;
    }
    if (!(await stat(next)).isDirectory())
      throw new CliError('DIRECTORY_NOT_FOUND', "Choose a directory containing SVG files.");
    const hasTokens = (await readdir(next)).includes(tokenFile);
    if (hasTokens && !readOnly) refreshTypes({design:next});
    const project = await loadConfig(next);
    const nextSources = project.design === next ? project.sources : sourceDirectories({design:next});
    const nextCode=new Set(), nextFiles = await collectProject(next, project, nextSources, nextCode),
      nextGroups = await readGroups(next, nextSources);

    const cacheBase=path.join(stateDirectory,'cache',digest(next));
    const nextStore=await createBuildStore({config:{...project,design:next,sources:nextSources,sourceFiles:[...nextCode].sort()},cacheDirectory:path.join(cacheBase,'build')});
    const nextViewerCache=await createViewerCache(path.join(cacheBase,'viewer'));
    await buildStore?.close();await closeOverlays();await viewerCache?.close();
    buildStore=nextStore;viewerCache=nextViewerCache;knownBuilds.clear();dirtyBuilds.clear();failedSources.clear();frameCounts.clear();
    for(const built of await buildStore.metadata()) {
      if(nextFiles.has(built.path)) {knownBuilds.set(built.path,built);Object.assign(nextFiles.get(built.path),{hash:built.hash,version:built.hash});frameCounts.set(built.path,built.frames.length);}
    }
    // Complete discovery before starting the watcher.
    const nextWatcher = watchDirectory(next, { recursive: true }, (_event, filename) => {
      if (filename && String(filename).split(path.sep).some(part => part.startsWith("."))) return;
      if (filename) {
        const name=String(filename).split(path.sep).join('/');
        touched.add(name);
        invalidateBuilds([name]).catch(refreshError);
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => refresh().catch(refreshError),
        80,
      );
    });
    nextWatcher.on("error", (e) =>
      watcherError(e,'File'),
    );
    watcher?.close();
    watcher = nextWatcher;
    activeProject=project;watchArch(project,next);
    root = next;
    tokenSource = hasTokens ? tokenSourcePath(next, project) : null;
    codePaths=nextCode;
    sources = nextSources;
    touched.clear();
    files = nextFiles;
    groups = nextGroups;
    revision++;
    svgCache.clear();
    state.recent = [root, ...state.recent.filter((p) => p !== root)].slice(
      0,
      12,
    );
    await persist();
    emit({ revision });
  }
  let refreshing = false,
    refreshAgain = false;
  async function refresh() {
    if(closing)return;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      const observed = [...touched];
      touched.clear();
      const base = root,
        project = await loadConfig(base),
        nextSources = project.design===base ? project.sources : sourceDirectories({design:base}),
        nextCode=new Set(),
        next = await collectProject(base,project,nextSources,nextCode),
        nextGroups = await readGroups(base, nextSources);
      const tokensChanged = observed.includes(tokenFile);
      const hasTokens = tokensChanged ? (await readdir(base)).includes(tokenFile) : !!tokenSource;
      const nextTokenSource = hasTokens ? tokenSourcePath(base, project) : null;
      if (root !== base) return;
      const stamps=[...new Set([...files.keys(),...next.keys()])].filter(name=>files.get(name)?.stamp!==next.get(name)?.stamp);
      const grouping=JSON.stringify(groups)!==JSON.stringify(nextGroups);
      const configChanged=JSON.stringify(sources)!==JSON.stringify(nextSources)||activeProject.arch!==project.arch;
      const structural=configChanged || [...new Set([...codePaths,...nextCode])].some(name=>codePaths.has(name)!==nextCode.has(name));
      if(structural){await closeOverlays();await buildStore.close();buildStore=await createBuildStore({config:{...project,design:base,sources:nextSources,sourceFiles:[...nextCode].sort()},cacheDirectory:path.join(stateDirectory,'cache',digest(base),'build')});}
      const observedPaths=[...new Set([...observed,...stamps])];
      const affected=new Set(await invalidateBuilds(structural?[...knownBuilds.keys(),...observedPaths]:observedPaths));
      for(const name of failedSources)affected.add(name);
      for(const name of stamps)if(/\.(tsx|mmd)$/.test(name)&&next.has(name))affected.add(name);
      const legacyDirty=[...legacyDependencies.values()].some(dependencies=>dependencies.some(name=>observedPaths.includes(name)));
      if(!stamps.length&&!affected.size&&!grouping&&!legacyDirty&&!configChanged&&!tokensChanged&&nextTokenSource===tokenSource)return;
      const changed=[...new Set([...stamps,...affected])];
      for (const name of affected) {
        if (knownBuilds.delete(name)) dirtyBuilds.add(name);
        frameCounts.delete(name);
        if (!next.has(name)) { dirtyBuilds.delete(name); failedSources.delete(name); continue; }
        if (!/\.(tsx|mmd)$/.test(name)) continue;
        const entry = next.get(name);
        next.set(name, {...entry, hash:undefined, version:`${entry.stamp}-${revision+1}`});
      }
      for (const [name,entry] of next) {
        const built = knownBuilds.get(name);
        if (built) Object.assign(entry,{hash:built.hash,version:built.hash});
      }
      const dirty=new Set(observedPaths);
      for(const [name,dependencies] of legacyDependencies) {
        if(!next.has(name)){legacyDependencies.delete(name);continue;}
        if(dependencies.some(dependency=>dirty.has(dependency))) {
          for(const theme of ['light','dark'])svgCache.delete(`${name}\0${theme}`);
          next.set(name,{...next.get(name),version:`${next.get(name).stamp}-${revision+1}`});changed.push(name);
        }
      }
      if(activeProject.arch!==project.arch)watchArch(project,base);
      activeProject=project;
      files = next;
      tokenSource = nextTokenSource;
      codePaths=nextCode;
      sources = nextSources;
      groups = nextGroups;
      revision++;
      emit({ revision, changed });
    } finally {
      refreshing = false;
      if (refreshAgain && !closing) {
        refreshAgain = false;
        await refresh();
      }
    }
  }
  const baseManifest = () => ({
    directory: root ?? null,
    label: root
      ? path.basename(root) === "design" ? path.basename(path.dirname(root)) : path.basename(root)
      : "Agent Design Gallery",
    assets: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    groups,
    revision,
    recent: state.recent,
    theme: state.theme,
    sidebar: state.sidebar ?? true,
    inspector: false,
    tokenSource,
  });
  const preferenceKey = (scope,base) => base ? JSON.stringify([root,scope??'all','base',base]) : !scope || scope === 'all' ? root : JSON.stringify([root, scope]);
  function applyFixtureManifest(data,name) {
    if (!fixtures || !name) return data;
    if (Number.isFinite(fixtures.assetModifiedAt)) data.assets = data.assets.map(a => ({...a,modifiedAt:fixtures.assetModifiedAt}));
    const preset = fixtures.states[name];
    if (!preset) throw new Error(`Unknown fixture ${name}; choose a declared ADG fixture.`);
    return { ...data, ...(preset.empty ? { directory: null, assets: [], groups: [] } : {}),
      label: 'agent-remote-control', recent: fixtures.recent, view: null, theme: preset.themeChoice ?? preset.theme,
      sidebar: preset.sidebar, inspector: !!preset.inspector, fixture: { name, ...preset } };
  }
  const contextFor=async url=>(await viewerVersion)+'|'+(url.searchParams.get('context')??'')+(url.searchParams.has('base')?'|base:'+url.searchParams.get('base'):'');
  async function manifest(url) {
    const data=baseManifest(),context=await contextFor(url), requested=url.searchParams.get('scope');
    const fixtureScope=fixtures?.states[url.searchParams.get('fixture')]?.scope;
    const desired = fixtureScope ?? requested ?? 'all';
    if (desired === 'tokens' && data.tokenSource) {
      // Keep the layer choices available without measuring or building any artboards.
      const { layers } = resolveScope(data, sources, 'all');
      const result = { ...data, scope: 'tokens', layers, assets: [] };
      try {
        const { light, dark } = parseTokens(await readFile(path.join(data.directory, tokenFile), 'utf8'));
        result.tokens = [...light].map(([name, value]) => [name, value, dark.get(name) ?? null]);
      } catch (error) {
        result.tokenError = error.code ? `Cannot read ${data.tokenSource}.` : error.message;
      diagnostic(new CliError('TOKENS_INVALID',error.message,{cause:error}));
      }
      return applyFixtureManifest(result, url.searchParams.get('fixture'));
    }
    const scoped=resolveScope(data,sources,desired === 'tokens' ? 'default' : desired);
    if (url.searchParams.has('strict') && desired !== scoped.scope) throw Error('Design link target does not exist.');
    Object.assign(data,scoped);
    let base;
    if(url.searchParams.has('base')&&data.assets.some(asset=>asset.path.endsWith('.mmd'))) {
      base=await (await import('./toolkit/arch-git.mjs')).resolveBase(activeProject,url.searchParams.get('base'));
      data.base={rev:base.rev,sha:base.sha};
      const cached=new Map((await (await overlayStore(base)).metadata()).map(built=>[built.path,built]));
      data.assets=data.assets.map(asset=>asset.path.endsWith('.mmd')?{...asset,hash:cached.get(asset.path)?.hash,version:cached.get(asset.path)?.hash??`${asset.stamp}-${base.sha}-${base.rev}`}:{...asset});
    }
    const key=preferenceKey(data.scope,url.searchParams.get('base'));
    data.view=state.views[key] ?? null;
    data.selection=state.selections[key] ?? null;
    // Rehash previously built sources only when a viewer requests their scope.
    // An unchanged result retains its measured metadata and cropped previews.
    if (requested) {
      const rebuild = data.assets.filter(asset=>dirtyBuilds.has(asset.path)&&!(base&&asset.path.endsWith('.mmd')));
      let index=0;
      await Promise.all(Array.from({length:Math.min(2,rebuild.length)},async()=>{
        while(index<rebuild.length) {
          const asset=rebuild[index++];
          try {const built=await sourceBuild(asset.path);Object.assign(asset,{hash:built.hash,version:built.hash});}
          catch(error) {if(error.name==='AbortError')throw error;dirtyBuilds.delete(asset.path);}
        }
      }));
    }
    data.sourceImports=Object.fromEntries([...knownBuilds].map(([name,built])=>[name,built.imports]));
    const frameOnly = data.scope.startsWith('asset:') && url.searchParams.has('frame');
    if(viewerCache && !frameOnly) {
      const includeMetadata=url.searchParams.get('metadata')==='1';
      const requestedTheme=url.searchParams.get('initial')==='1'&&['light','dark'].includes(state.theme)?state.theme:(url.searchParams.get('theme')==='light'?'light':'dark');
      data.metadataTheme=requestedTheme;
      data.assets=await Promise.all(data.assets.map(async asset=>{
        if(!asset.hash)return {...asset};
        const metadata={},metadataRefs={},previewIds={};
        for(const theme of ['light','dark']) {
          const reference=viewerCache.reference(asset.hash,theme,context);
          if(reference){metadataRefs[theme]=true;previewIds[theme]=reference.previewIds;}
          if(includeMetadata&&theme===requestedTheme&&reference){const saved=await viewerCache.get(asset.hash,theme,context);if(saved)metadata[theme]=saved.metadata;}
        }
        return {...asset,metadata,metadataRefs,previewIds};
      }));
      data.packing=(await viewerCache.get(digest('catalog'),'light',context))?.metadata.packing??[];
    }
    data.features={compactSources:1,persistedMetadata:1,incrementalHashes:1};
    return applyFixtureManifest(data,url.searchParams.get('fixture'));
  }
  async function sourceBuild(name) {
    const endBuild = perfSpan('build', name);
    let built;
    try{built=await buildStore.get(name);}catch(error){if(error.name!=='AbortError'){failedSources.add(name);diagnostic(error,name);}throw error;}
    finally {endBuild?.();}
    knownBuilds.set(name,describe(built));dirtyBuilds.delete(name);failedSources.delete(name);frameCounts.set(name,built.frames.length);
    if(files.has(name))Object.assign(files.get(name),{hash:built.hash,version:built.hash});
    return built;
  }
  async function svg(name, theme, chain = [], onlyFrame = null, base = null) {
    if (chain.includes(name))
      throw new Error(`Circular SVG reference: ${name}`);
    const asset = files.get(name);
    if (!asset) throw new Error(`Unknown SVG: ${name}`);
    const key = `${name}\0${theme}`,
      cached = svgCache.get(key);
    if (cached?.version === asset.version) return cached;
    if (/\.(tsx|mmd)$/.test(name)) {
      const built=base&&name.endsWith('.mmd')?await overlayBuild(name,base):await sourceBuild(name);
      const frames = onlyFrame ? built.frames.filter(frame => frame.name === onlyFrame) : built.frames;
      if (!frames.length && onlyFrame) throw new CliError('FRAME_NOT_FOUND', `Frame ${onlyFrame} does not exist in ${name}.`);
      return {version:built.hash,imports:built.imports,dependencies:built.dependencies,
        body:JSON.stringify({format:'tsx',hash:built.hash,css:built.css,imports:built.imports,component:!onlyFrame && name.endsWith('.tsx') && !name.startsWith('surfaces/'),frames})};
    }
    let content = await readFile(path.join(root, name), "utf8");
    content = content.replace(
      /<svg\b([^>]*)>/,
      (_, attrs) =>
        `<svg${attrs.replace(/\sdata-theme\s*=\s*(['"]).*?\1/g, "")} data-theme="${theme}">`,
    );
    const dependencies = [name];
    const matches = [
      ...content.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])([^"']+)\1/g),
    ];
    for (const match of matches) {
      const target = match[2];
      if (/^(?:#|data:|https?:|\/)/.test(target)) continue;
      const [relative, fragment] = target.split("#");
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(name), decodeURIComponent(relative)),
      );
      if (dependency.startsWith("../"))
        throw new Error(`SVG reference leaves design directory: ${target}`);
      let data, type;
      if (/\.svg$/i.test(dependency)) {
        const nested = await svg(dependency, theme, [...chain, name]);
        data = nested.body;
        type = "image/svg+xml";
        dependencies.push(...nested.dependencies);
      } else {
        const resolved = await realpath(path.join(root, dependency));
        if (!resolved.startsWith(root + path.sep))
          throw new Error("Asset reference leaves design directory.");
        data = await readFile(resolved);
        dependencies.push(dependency);
        type = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        }[path.extname(dependency).toLowerCase()];
        if (!type) continue;
      }
      content = content.replace(
        match[0],
        `href="data:${type};base64,${Buffer.from(data).toString("base64")}${fragment ? "#" + fragment : ""}"`,
      );
    }
    const entry = {
      version: asset.version,
      body: Buffer.from(content),
      dependencies: [...new Set(dependencies)],
    };
    legacyDependencies.set(name,entry.dependencies);
    svgCache.delete(key);svgCache.set(key,entry);
    let bytes=[...svgCache.values()].reduce((n,item)=>n+item.body.length,0);
    while(svgCache.size>128||bytes>32*1024*1024){const first=svgCache.keys().next().value;bytes-=svgCache.get(first).body.length;svgCache.delete(first);}
    return entry;
  }
  async function body(request,limit=16384,raw=false) {
    const chunks=[];let size=0;
    for await(const chunk of request){size+=chunk.length;if(size>limit)throw Error('Request too large.');chunks.push(chunk);}
    const text=Buffer.concat(chunks).toString('utf8');
    return raw?text:JSON.parse(text||'{}');
  }
  const server = createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const url = new URL(request.url, 'http://localhost');
      const file = ['GET', 'HEAD'].includes(request.method) && viewerFile(url.pathname);
      if (file) return await shell(request, response, file, request.headers['x-adg-viewer-base']);
      if (!directLocal(request)) return json(response, 401, { error: 'Unauthorized' });
      if(url.pathname==='/api/cache-stats'&&request.method==='GET')return json(response,200,{process:process.memoryUsage(),builds:buildStore?.stats(),viewer:viewerCache?.stats()});
      if (url.pathname === '/api/health' && request.method === 'GET') return json(response, 200, { id: instanceId, capabilities: { keyAuth: 1 } });
      if (request.method === "POST") {
        if (
          request.headers.origin &&
          request.headers.origin !== `http://${host}` && request.headers.origin !== `https://${host}`
        ) {
          response.writeHead(403);
          response.end("Cross-origin request refused.");
          return;
        }
        const cacheRoute=url.pathname.match(/^\/(metadata|preview)\/([a-f0-9]{64})$/);
        if(cacheRoute) {
          const [,kind,hash]=cacheRoute,theme=url.searchParams.get('theme')==='dark'?'dark':'light',context=await contextFor(url);
          if(![...knownBuilds.values()].some(built=>built.hash===hash)&&!overlayHashes.has(hash))return json(response,409,{error:'Source changed; reload its metadata.'});
          if(kind==='metadata') {
            const data=await body(request,32*1024*1024),metadata=data.metadata;
            if(!metadata||!Array.isArray(metadata.parts)||!metadata.full||!Number.isFinite(metadata.full.width)||!Number.isFinite(metadata.full.height))throw Error('Invalid measured source metadata.');
            await viewerCache.save(hash,theme,context,metadata);
          } else {
            const source=await body(request,32*1024*1024,true),crop=url.searchParams.get('crop')??'overview';
            if(!/^\s*<svg\b/.test(source))throw Error('Expected an SVG preview.');
            await viewerCache.savePreview(hash,theme,context,crop,source);
          }
          return json(response,200,{ok:true});
        }
        if(url.pathname==='/catalog') {
          const data=await body(request,1024*1024),context=await contextFor(url);
          if(!Array.isArray(data.packing)||data.packing.length>32)throw Error('Invalid packing cache.');
          await viewerCache.save(digest('catalog'),'light',context,{packing:data.packing});
          return json(response,200,{ok:true});
        }
        const data = await body(request);
        if (url.pathname === "/preferences") {
          if (typeof data.sidebar === "boolean") state.sidebar = data.sidebar;
          const key = preferenceKey(data.scope,url.searchParams.get('base'));
          if (["system", "light", "dark"].includes(data.theme))
            state.theme = data.theme;
          if (
            root &&
            data.view &&
            ["x", "y", "scale"].every((k) => Number.isFinite(data.view[k])) &&
            data.view.scale > 0
          )
            state.views[key] = data.view;
          if (root && data.selection &&
              (data.selection.path === null || files.has(data.selection.path))) {
            state.selections[key] = {
              path: data.selection.path,
              form: typeof data.selection.form === 'string' ? data.selection.form : null,
              group: typeof data.selection.group === 'string' ? data.selection.group : null,
              element: data.selection.element ?? null,
            };
          }
          await persist();
        } else {
          response.writeHead(404);
          response.end();
          return;
        }
        return json(response, 200, { ok: true });
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      if (url.pathname === "/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
        });
        response.write(`data: ${JSON.stringify({ revision })}\n\n`);
        clients.add(response);
        response.on("close", () => clients.delete(response));
        return;
      }
      const metadataRoute=url.pathname.match(/^\/metadata\/([a-f0-9]{64})$/);
      if(metadataRoute){const saved=await viewerCache?.get(metadataRoute[1],url.searchParams.get('theme')==='dark'?'dark':'light',await contextFor(url));return json(response,saved?200:404,saved??{error:'Source metadata is not cached.'});}
      const previewRoute=url.pathname.match(/^\/preview\/([a-f0-9]{64})$/);
      if(previewRoute) {
        const content=await viewerCache?.preview(previewRoute[1],url.searchParams.get('theme')==='dark'?'dark':'light',await contextFor(url),url.searchParams.get('crop')??'overview');
        if(!content){response.writeHead(404);response.end('Preview is not cached.');return;}
        response.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});
        response.end(request.method==='HEAD'?undefined:content);return;
      }
      let content, type, etag;
      if (url.pathname === "/manifest") {
        content = JSON.stringify(await manifest(url));
        type = "application/json";
      } else if (url.pathname === "/relationships") {
        const assets = await Promise.all([...files.keys()].filter(name => /\.(tsx|mmd)$/.test(name)).map(async name => ({path:name, imports:(await sourceBuild(name)).imports})));
        content = JSON.stringify(sourceRelationships(assets));
        type = "application/json";
      } else if (url.pathname.startsWith("/asset/")) {
        const name = decodeURIComponent(url.pathname.slice(7));
        if (!files.has(name)) {
          response.writeHead(404);
          response.end("Unknown SVG.");
          return;
        }
        const theme =
          url.searchParams.get("theme") === "dark" ? "dark" : "light";
        const base=name.endsWith('.mmd')&&url.searchParams.has('base')?await (await import('./toolkit/arch-git.mjs')).resolveBase(activeProject,url.searchParams.get('base')):null;
        const onlyFrame = url.searchParams.get('frame');
        const variant = onlyFrame ? `-${digest(onlyFrame)}` : '';
        etag = `"${files.get(name).version}-${theme}${variant}"`;
        if (!base && request.headers["if-none-match"] === etag) {
          response.writeHead(304);
          response.end();
          return;
        }
        const rendered=await svg(name,theme,[],onlyFrame,base);
        content=rendered.body;etag=`"${rendered.version}-${theme}${variant}"`;
        type = /\.(tsx|mmd)$/.test(name) ? "application/json" : "image/svg+xml";
      } else {
        response.writeHead(404); response.end('Not found.'); return;
      }
      response.writeHead(200, {
        "Content-Type": `${type}; charset=utf-8`,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        ...(etag ? { ETag: etag } : {}),
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (response.destroyed) return;
      response.writeHead(error.name==='AbortError'?409:400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  let closePromise;
  const close = () => closePromise ??= (async () => {
    closing = true;
    clearTimeout(refreshTimer);
    let primary;
    for (const step of [
      async () => { watcher?.close(); },
      async () => { archWatcher?.close(); },
      async () => {
        for (const client of clients) client.end();
        const disconnected = server.listening ? new Promise(resolve => server.close(resolve)) : Promise.resolve();
        server.closeAllConnections(); await disconnected;
      },
      async () => { await writes; },
      async () => { await buildStore?.close(); },
      closeOverlays,
      async () => { await viewerCache?.close(); },
    ]) {
      try { await cleanup(step,primary); }
      catch (error) { primary=error; }
    }
    if (primary) throw primary;
  })();
  try {
    if (directory) await openDirectory(directory);
    await new Promise((resolve,reject) => {
      const startupError = error => { server.off('listening',listening); reject(error); };
      const listening = () => {
        server.off('error',startupError);
        server.on('error',error => { if (!closing) onFatal?.(asCliError(error)); });
        resolve();
      };
      server.once('error',startupError);
      server.listen(port,'127.0.0.1',listening);
    });
  } catch (cause) {
    const primary=asCliError(cause);
    await cleanup(close,primary);
    throw primary;
  }
  endStartup?.();
  return { id: instanceId, directory: root, stateDirectory:path.resolve(stateDirectory), url: `http://127.0.0.1:${server.address().port}/`, port: server.address().port, close,
    cacheStats:()=>({builds:buildStore?.stats(),viewer:viewerCache?.stats()}),
    stats: () => {
      const entries = [...files.keys()].filter(name => /\.(tsx|mmd)$/.test(name));
      return { sourceCount: entries.length, frameCount: entries.every(name => frameCounts.has(name)) ? entries.reduce((n, name) => n + frameCounts.get(name), 0) : null };
    } };
}
