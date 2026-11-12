import { readFile, realpath, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listSources, archFiles, sourceDirectories, relative, loadTokens } from './project.mjs';
import { tokenLocations } from './tokens.mjs';
import { CliError } from '../cli-output.mjs';
import { buildSource } from './build.mjs';
import { createBuildStore, BuildPool } from './build-store.mjs';
import { sourceFacts } from './source-facts.mjs';
import { sidecar } from './arch.mjs';
import { loadImplementationMap, validateImplementationMap } from './implementation-map.mjs';
import { createIndexStore, indexDigest } from './index-store.mjs';
import { defaultStateDirectory } from '../hub/registry.mjs';
import { sourceRelationships } from '../../public/relationships.js';
import { entryTokenReachability } from './token-reachability.mjs';
import { identityVersion } from './frame-identity.mjs';
import { inspectVersion } from './inspect-styles.mjs';
import { frameDocument } from './frame-document.mjs';
export { sourceFacts } from './source-facts.mjs';

const collectorIdentity = indexDigest(Buffer.concat(await Promise.all(['project-index.mjs', 'source-facts.mjs', 'implementation-map.mjs', 'owner-locators.mjs', 'owner-observation.mjs', 'frame-observation.mjs', 'frame-facets.mjs', 'frame-primitives.mjs', 'frame-identity.mjs', 'inspect-styles.mjs', 'owner-colors.mjs', 'tokens.mjs', 'token-reachability.mjs', 'arch.mjs'].map(name => readFile(new URL(name, import.meta.url))))));

export function discoverProject(config) {
  const tsx = listSources(config.design, sourceDirectories(config)).map(file => relative(config, file));
  return { tsx, architecture: archFiles(config.arch).map(file => relative(config, file)) };
}

export function tokenFacts(config) {
  const { light, dark } = loadTokens(config);
  const locations = tokenLocations(readFileSync(path.join(config.design, 'tokens.css'), 'utf8'));
  return [...light].map(([name, value]) => ({ name, source: relative(config, path.join(config.design, 'tokens.css')),
    values: [{ theme: 'light', declaration: value, inherited: false }, { theme: 'dark', declaration: dark.get(name) ?? value, inherited: !dark.has(name) }]
      .map(item => ({ ...item, line: (item.theme === 'dark' && !item.inherited ? locations.dark : locations.light).get(name), references: [...item.declaration.matchAll(/var\(\s*(--[\w-]+)/g)].map(match => match[1]) })) }));
}

async function resolutionFiles(config, artifactDirectory) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (['.git', '.adg', 'node_modules'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (file === config.output) continue;
      if (entry.isDirectory()) await visit(file);
      else if (!(artifactDirectory && !path.relative(artifactDirectory, file).startsWith('..') && !path.isAbsolute(path.relative(artifactDirectory, file)) && /\.(?:png|json)$/.test(file))) files.push(path.relative(config.design, file));
    }
  }
  try { await visit(config.design); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return files.sort();
}

export async function openProjectIndex(config, { stateDirectory = defaultStateDirectory, persist = true, fresh = false, artifactDirectory } = {}) {
  const inventory = discoverProject(config), root = await realpath(config.root), buildPromises = new Map();
  const directory = path.join(stateDirectory, 'cache', indexDigest(root), 'index-v1');
  const shards = await createIndexStore({ directory, persist });
  const buildDirectory = path.join(stateDirectory, 'cache', indexDigest(root), 'build');
  let storePromise, closed = false;
  let freshPool;
  const materializations = new Map();
  const resolution = fresh ? await resolutionFiles(config, artifactDirectory) : null;
  const physicalDesign = inventory.tsx.length ? await realpath(config.design) : null;
  const observedInputs = new Map(), requestedSources = new Set();
  const assertOpen = () => { if (closed) throw Error('Project index is closed.'); };
  async function getBuild(source) {
    assertOpen();
    if (!inventory.tsx.includes(source)) throw Error(`Undiscovered TSX source ${source}.`);
    requestedSources.add(source);
    if (!buildPromises.has(source)) buildPromises.set(source, (async () => {
      let built;
      if (!persist) {
        const snapshot = new Map();
        built = await buildSource(config, path.join(config.root, source), { write: false, allowLegacy: false, snapshot });
        built.dependencyHashes = Object.fromEntries([...snapshot].map(([file, bytes]) => [path.relative(config.design, file), indexDigest(bytes === null ? 'missing\0' : Buffer.concat([Buffer.from('present\0'), bytes]))]));
      } else {
        storePromise ??= createBuildStore({ config: { ...config, sourceFiles: inventory.tsx }, cacheDirectory: buildDirectory });
        built = await (await storePromise).get(path.relative(config.design, path.join(config.root, source)).split(path.sep).join('/'));
      }
      return observeDependencies(built);
    })().finally(() => buildPromises.delete(source)));
    return buildPromises.get(source);
  }
  function observeDependencies(built) {
    for (const [name, hash] of Object.entries(built.dependencyHashes)) {
      if (observedInputs.has(name) && observedInputs.get(name) !== hash) throw new CliError('OWNER_INDEX_CHANGED', `Design dependency changed during query: ${name}.`);
      observedInputs.set(name, hash);
    }
    return built;
  }
  function materialize(source) {
    assertOpen();
    if (!inventory.tsx.includes(source)) throw Error(`Undiscovered TSX source ${source}.`);
    if (!materializations.has(source)) {
      requestedSources.add(source); freshPool ??= new BuildPool();
      materializations.set(source, freshPool.run({ config: { root, design: physicalDesign ?? config.design, output: config.output,
        sources: config.sources, arch: config.arch, check: config.check, allowLegacy: false },
      name: path.relative(physicalDesign ?? config.design, path.join(root, source)).split(path.sep).join('/') }, new AbortController().signal).then(built => {
        observeDependencies(built);
        for (const frame of built.frames) frame.document = theme => frameDocument(frame, theme, built.css);
        return built;
      }));
    }
    return materializations.get(source);
  }
  async function cached(projection, inputs, collect) {
    const key = JSON.stringify({ version: 1, collectorIdentity, projection, inputs });
    const hit = await shards.get(key);
    if (hit !== null) return hit;
    const value = await collect(); await shards.put(key, value); return value;
  }
  return {
    inventory,
    getBuild,
    materialize,
    async source(source, { tokens = false, fresh = false } = {}) {
      const built = fresh ? await materialize(source) : await getBuild(source);
      const inputs = fresh ? null : { source, build: built.inputHash ?? indexDigest(JSON.stringify({ ...built, frames: built.frames.map(({ document, ...frame }) => frame) })) };
      const facts = fresh ? sourceFacts(config, source, built) : await cached('source', inputs, () => sourceFacts(config, source, built));
      if (!tokens) return facts;
      const collect = () => {
        const scan = entryTokenReachability((built.cssBeforeTokens + built.cssAfterTokens).replace(/<\/style/gi, '<\\/style'), built.tokenCss);
        return built.frames.map(frame => {
          const reach = scan(frameDocument(frame, 'light', ''));
          return { frame: frame.name, themes: ['light', 'dark'].map(theme => ({ theme, ...reach(theme) })) };
        });
      };
      const tokenDependencies = fresh ? collect() : await cached('token-dependencies', inputs, collect);
      return { ...facts, tokenDependencies };
    },
    tokens() { assertOpen(); return tokenFacts(config); },
    async mappings({ selected, map: supplied, ...selection } = {}) {
      assertOpen();
      // Implementation inventories and locator bytes are re-read each invocation.
      const map = supplied ?? await loadImplementationMap(config);
      return { map, ...await validateImplementationMap(config, map, { sources: inventory.tsx, selected, getBuild, ...selection }) };
    },
    async observation(source, built, frame, theme, environment, collect, { facets = ['owner','identity'], policy = null } = {}) {
      assertOpen();
      if (environment === null) return collect();
      const coverage=[...new Set(facets)].sort();
      const inputs={source,document:indexDigest(frameDocument(frame,theme,built.css)),
        metadata:{width:frame.width??null,height:frame.height??null,parent:frame.parent??null},
        theme,environment,policy,identityVersion,inspectVersion};
      const keyFor=facets=>JSON.stringify({version:1,collectorIdentity,projection:'frame-observation',inputs,facets});
      const key=keyFor(coverage), saved=await shards.get(key);
      if(Array.isArray(saved?.facets) && Object.hasOwn(saved,'value') && saved.facets.every(f=>coverage.includes(f)) && coverage.every(f=>saved.facets.includes(f)))return saved.value;
      const full=['a11y','color','identity','layout','owner','structure','text','typography'];
      if(coverage.every(f=>full.includes(f)) && coverage.length<full.length){
        const richer=await shards.get(keyFor(full));
        if(Array.isArray(richer?.facets) && Object.hasOwn(richer,'value') && coverage.every(f=>richer.facets.includes(f)))return richer.value;
      }
      const value=await collect();await shards.put(key,{facets:coverage,value});return value;
    },
    async palette(tokens, theme, environment, collect) {
      assertOpen();
      return environment === null ? collect() : cached('owner-palette', { tokens, theme, environment }, collect);
    },
    async color(input, environment, collect) {
      assertOpen();
      if (environment === null) return collect();
      const key = JSON.stringify({ version: 1, collectorIdentity, projection: 'query-colors', environment });
      const entries = new Map(await shards.get(key) ?? []);
      if (entries.has(input)) return entries.get(input);
      const value = await collect(); entries.set(input, value);
      while (entries.size > 128) entries.delete(entries.keys().next().value);
      await shards.put(key, [...entries]); return value;
    },
    async verifyInputs() {
      if (JSON.stringify(discoverProject(config)) !== JSON.stringify(inventory)) throw new CliError('OWNER_INDEX_CHANGED', 'Design source inventory changed during query.');
      if (resolution && JSON.stringify(await resolutionFiles(config, artifactDirectory)) !== JSON.stringify(resolution)) throw new CliError('OWNER_INDEX_CHANGED', 'Design resolution inventory changed during query.');
      for (const [name, hash] of observedInputs) {
        let value;
        try { value = indexDigest(Buffer.concat([Buffer.from('present\0'), await readFile(path.join(config.design, name))])); }
        catch (error) { if (error.code !== 'ENOENT') throw error; value = indexDigest('missing\0'); }
        if (value !== hash) throw new CliError('OWNER_INDEX_CHANGED', `Design dependency changed during query: ${name}.`);
      }
    },
    async architecture(source) {
      assertOpen();
      if (!inventory.architecture.includes(source)) throw Error(`Undiscovered architecture source ${source}.`);
      const side = source.replace(/\.mmd$/, '.md'); let text = '';
      try { text = await readFile(path.join(config.root, side), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return cached('architecture', { source, text }, () => ({ source, sidecar: side, ...sidecar(text) }));
    },
    async relationships({ facts: supplied, projectPaths = false } = {}) {
      const assets = await Promise.all(inventory.tsx.map(async source => {
        const facts = supplied?.get(source) ?? await this.source(source);
        if (projectPaths) return { path: source, imports: facts.imports };
        const designRelative = file => path.relative(config.design, path.join(config.root, file)).split(path.sep).join('/');
        return { path: designRelative(source), imports: facts.imports.map(designRelative) };
      }));
      assets.push(...inventory.architecture.map(source => ({ path: source, imports: [] })));
      return sourceRelationships(assets);
    },
    stats: async () => ({ shards: shards.stats(), builds: storePromise ? (await storePromise).stats() : null,
      materializations: freshPool?.stats() ?? null, requestedSources: [...requestedSources] }),
    async close() {
      closed = true;
      try { if (storePromise) await (await storePromise).close(); }
      finally { try { await freshPool?.close(); materializations.clear(); } finally { await shards.close(); } }
    },
  };
}
