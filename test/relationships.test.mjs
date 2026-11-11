import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSource } from '../src/toolkit/build.mjs';
import { starterTokens, listSources } from '../src/toolkit/project.mjs';
import { sourceRelationships, relatedSources } from '../public/relationships.js';
import { startServer } from '../src/server.mjs';

function project(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'adg-relationships-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = { root, design: path.join(root, 'design'), sources: ['components', 'modules', 'surfaces'] };
  put(config, 'tokens.css', starterTokens);
  return config;
}
function put(config, name, text) {
  const file = path.join(config.design, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}
const source = (imports = '', expression = '"Example"') => `${imports}
  import { Frame } from 'adg';
  export const label = 'Example';
  export default () => <Frame name="default"><div>{${expression}}</div></Frame>;`;
async function graph(config) {
  const assets = await Promise.all(listSources(config.design, config.sources).map(async file => ({
    path: path.relative(config.design, file).split(path.sep).join('/'),
    imports: (await buildSource(config, file, { write: false })).imports,
  })));
  return sourceRelationships(assets);
}

test('transitive relationships retain shortest via paths, prefer direct edges and terminate cycles', () => {
  const result=sourceRelationships([
    {path:'surfaces/home.tsx',imports:['modules/home.tsx','modules/scenarios.tsx','components/direct.tsx']},
    {path:'modules/home.tsx',imports:['modules/composer.tsx','components/alert.tsx','components/direct.tsx']},
    {path:'modules/scenarios.tsx',imports:['modules/composer.tsx']},
    {path:'modules/composer.tsx',imports:['components/alert.tsx','modules/home.tsx']},
    {path:'components/alert.tsx',imports:[]},{path:'components/direct.tsx',imports:[]},
  ]);
  const uses=relatedSources(result,'surfaces/home.tsx');
  assert.deepEqual(uses.find(r=>r.path==='modules/composer.tsx'),{path:'modules/composer.tsx',direct:false,via:['modules/home.tsx']});
  assert.deepEqual(uses.find(r=>r.path==='components/alert.tsx').via,['modules/home.tsx']);
  assert.equal(uses.find(r=>r.path==='components/direct.tsx').direct,true);
  assert.equal(new Set(uses.map(r=>r.path)).size,5);
  assert.ok(!relatedSources(result,'modules/home.tsx').some(r=>r.path==='modules/home.tsx'));
  const usedBy=relatedSources(result,'components/alert.tsx','usedBy');
  assert.deepEqual(usedBy.find(r=>r.path==='surfaces/home.tsx').via,['modules/home.tsx']);
  assert.deepEqual(relatedSources(result,'missing.tsx'),[]);
});

test('build stamps exported JSX roots, nested wrappers, aliases and fragments without layout wrappers', async t => {
  const c=project(t);
  put(c,'components/box.tsx',`import {Frame} from 'adg';
    export function Box(){return <button>Box</button>}
    const Arrow=()=> <><i>A</i><i>B</i></>; export {Arrow as Pair};
    export const count=2;
    export default()=> <Frame name="box"><div><Box/><Arrow/></div></Frame>;`);
  put(c,'modules/wrapper.tsx',`import {Frame} from 'adg';import {Box} from '../components/box';
    export const Wrapper=()=> <Box/>;
    export default()=> <Frame name="wrapper"><Wrapper/></Frame>;`);
  const file=put(c,'surfaces/home.tsx',`import {Frame} from 'adg';import {Wrapper} from '../modules/wrapper';import {Pair} from '../components/box';
    function Local(){return <p>Local</p>}
    export default()=> <Frame name="home"><main><Wrapper/><Pair/><Local/></main></Frame>;`);
  const built=await buildSource(c,file,{write:false});
  const html=built.frames[0].html;
  const owners=[...html.matchAll(/data-adg-owners="([^"]+)"/g)].map(m=>JSON.parse(m[1].replaceAll('&quot;','"')));
  assert.deepEqual(owners[0],[{source:'components/box.tsx',export:'Box'},{source:'modules/wrapper.tsx',export:'Wrapper'}]);
  assert.deepEqual(owners.slice(1),[[{source:'components/box.tsx',export:'Pair'}],[{source:'components/box.tsx',export:'Pair'}]]);
  assert.match(html,/<main><button /);assert.match(html,/<p>Local<\/p>/);
  assert.ok(!html.includes('data-adg-owners="[]"'));
});

test('relationships resolve relative imports, explicit extensions, duplicates and direct edges only', async t => {
  const c = project(t);
  put(c, 'components/alert.tsx', source());
  put(c, 'modules/composer.tsx', source("import {label as alert} from '../components/alert';", 'alert'));
  put(c, 'surfaces/home.tsx', source(`import {label as a} from '../modules/../modules/composer';
    import {label as b} from '../modules/composer.tsx';`, 'a + b'));
  const result = await graph(c);
  assert.deepEqual(result, {
    'components/alert.tsx': { uses: [], usedBy: ['modules/composer.tsx'] },
    'modules/composer.tsx': { uses: ['components/alert.tsx'], usedBy: ['surfaces/home.tsx'] },
    'surfaces/home.tsx': { uses: ['modules/composer.tsx'], usedBy: [] },
  });
  assert.equal(existsSync(path.join(c.design, '.adg')), false, 'read-only builds do not write generated types');
});

test('relationships reuse extension and directory index resolution, including re-exports', async t => {
  const c = project(t);
  put(c, 'components/index.tsx', source());
  put(c, 'modules/index.tsx', source("export {label as componentLabel} from '../components';"));
  put(c, 'surfaces/home.tsx', source("import {componentLabel} from '../modules/index';", 'componentLabel'));
  const result = await graph(c);
  assert.deepEqual(result['modules/index.tsx'].uses, ['components/index.tsx']);
  assert.deepEqual(result['surfaces/home.tsx'].uses, ['modules/index.tsx']);
});

test('relationships ignore runtime packages, fixtures, artwork, tokens and non-source helper imports', async t => {
  const c = project(t);
  put(c, 'components/alert.tsx', source());
  put(c, 'fixtures/data.tsx', "import {label} from '../components/alert'; export const data = label;");
  put(c, 'components/nested/index.tsx', 'export const nested = "nested";');
  put(c, 'components/helper.ts', 'export const helper = "helper";');
  put(c, 'tokens.ts', 'export const token = "token";');
  put(c, 'art/mark.svg', '<svg width="12" height="12"></svg>');
  put(c, 'surfaces/home.tsx', source(`import {data} from '../fixtures/data';
    import {nested} from '../components/nested'; import {helper} from '../components/helper';
    import {token} from '../tokens'; import Art from '../art/mark.svg';`, '[data, nested, helper, token, <Art/>]'));
  assert.deepEqual(await graph(c), {
    'components/alert.tsx': { uses: [], usedBy: [] },
    'surfaces/home.tsx': { uses: [], usedBy: [] },
  });
});

test('relationships keep cycles finite and only include configured source directories', async t => {
  const c = project(t);
  put(c, 'modules/a.tsx', source("import {label as b} from './b'; export const next = () => b;"));
  put(c, 'modules/b.tsx', source("import {label as a} from './a'; export const next = () => a;"));
  put(c, 'surfaces/home.tsx', source("import {label as a} from '../modules/a';", 'a'));
  const result = await graph(c);
  assert.deepEqual(result['modules/a.tsx'], { uses: ['modules/b.tsx'], usedBy: ['modules/b.tsx', 'surfaces/home.tsx'] });
  assert.deepEqual(result['modules/b.tsx'], { uses: ['modules/a.tsx'], usedBy: ['modules/a.tsx'] });
  c.sources = ['components', 'surfaces'];
  assert.deepEqual(await graph(c), { 'surfaces/home.tsx': { uses: [], usedBy: [] } });
});

test('graph endpoint refreshes both directions after import edits, source additions and removals', { timeout: 15000 }, async t => {
  const c = project(t);
  writeFileSync(path.join(c.root, 'adg.config.mjs'), `export default { sources: ${JSON.stringify(c.sources)} };`);
  put(c, 'components/alert.tsx', source());
  put(c, 'modules/home.tsx', source());
  const surface = put(c, 'surfaces/home.tsx', source("import {label as imported} from '../modules/home';", 'imported'));
  const server = await startServer({directory:c.design, stateDirectory:path.join(c.root, 'state')});
  const controller = new AbortController();
  try {
    const events = await fetch(new URL('/events', server.url), {signal:controller.signal});
    const reader = events.body.getReader();
    await reader.read(); // Initial revision, before any edits.
    const readGraph = async () => {
      const response = await fetch(new URL('/relationships', server.url));
      assert.equal(response.status, 200);
      return response.json();
    };
    assert.deepEqual((await readGraph())['modules/home.tsx'].usedBy, ['surfaces/home.tsx']);
    writeFileSync(surface, source("import {label as imported} from '../components/alert';", 'imported'));
    await reader.read();
    let updated = await readGraph();
    assert.deepEqual(updated['surfaces/home.tsx'].uses, ['components/alert.tsx']);
    assert.deepEqual(updated['modules/home.tsx'].usedBy, []);
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['surfaces/home.tsx']);
    const added = put(c, 'modules/new.tsx', source("import {label as imported} from '../components/alert';", 'imported'));
    await reader.read();
    updated = await readGraph();
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['modules/new.tsx', 'surfaces/home.tsx']);
    unlinkSync(added);
    await reader.read();
    updated = await readGraph();
    assert.equal(updated['modules/new.tsx'], undefined);
    assert.deepEqual(updated['components/alert.tsx'].usedBy, ['surfaces/home.tsx']);

    // A helper edit must survive cancellation caused by an unrelated source save.
    // The worker delay makes the superseding edit deterministic without delaying
    // the server's main thread or replacing its real build implementation.
    const helper=put(c,'fixtures/value.ts',"export const value='before';");
    put(c,'modules/slow.tsx',source("import {value} from '../fixtures/value';", "(()=>{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,250);return value})()"));
    await reader.read();
    await readGraph(); // Explicitly build the new source before testing scoped revalidation.
    const manifestURL=new URL('/manifest?scope=layer:modules',server.url);
    const readManifest=async()=> {
      const response=await fetch(manifestURL);
      return response.ok ? response.json() : null;
    };
    const stats=async()=> (await fetch(new URL('/api/cache-stats',server.url))).json();
    const before=await readManifest(),hash=(manifest,name)=>manifest.assets.find(asset=>asset.path===name)?.hash;
    const previousCancelled=(await stats()).builds.cancelled;
    writeFileSync(helper,"export const value='after';");
    await reader.read();
    const inFlight=fetch(manifestURL);
    const waitFor=async predicate=>{
      const deadline=Date.now()+4000;
      while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
      assert.fail('Timed out waiting for superseded helper refresh');
    };
    await waitFor(async()=> (await stats()).builds.active>0);
    writeFileSync(path.join(c.design,'modules/home.tsx'),source('', '"Unrelated save"'));
    await waitFor(async()=> (await stats()).builds.cancelled>previousCancelled);
    assert.equal((await inFlight).status,409);
    await reader.read();
    await waitFor(async()=>{
      const manifest=await readManifest();
      return manifest && ['modules/slow.tsx','modules/home.tsx'].every(name=>hash(manifest,name)&&hash(manifest,name)!==hash(before,name));
    });
    await reader.cancel();
  } finally { controller.abort(); await server.close(); }
});
