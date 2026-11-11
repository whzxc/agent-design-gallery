import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { init, starterTokens, listSources, sourceDirectories } from '../src/toolkit/project.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { importDirectionViolations } from '../src/toolkit/asset-rules.mjs';
import { check, render } from '../src/toolkit/commands.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { startServer } from '../src/server.mjs';
import { parseCli } from '../src/cli.mjs';

const layers=['components','modules','surfaces'];
function temporary(t) {
  const root=mkdtempSync(path.join(tmpdir(),'adg-asset-rules-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}
function put(root,name,contents) {
  const file=path.join(root,name);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,contents);return file;
}
const source=`import {Frame} from 'adg';export function Part(){return <div>Example</div>};export default()=> <Frame name="default"><Part/></Frame>;`;

test('import lint checks ordered source layers, same-layer cycles and study exemptions',()=>{
  const graph={
    'components/a.tsx':{uses:['components/b.tsx','modules/feature.tsx','surfaces/page.tsx','studies/direction.tsx','fixtures/data.tsx']},
    'components/b.tsx':{uses:['components/a.tsx']},
    'modules/feature.tsx':{uses:['components/a.tsx','modules/other.tsx','surfaces/page.tsx']},
    'surfaces/page.tsx':{uses:['modules/feature.tsx','components/a.tsx']},
    'studies/direction.tsx':{uses:['surfaces/page.tsx']},
  };
  assert.deepEqual(importDirectionViolations(graph,[...layers,'studies']).map(({source,target})=>[source,target]),[
    ['components/a.tsx','modules/feature.tsx'],['components/a.tsx','surfaces/page.tsx'],['modules/feature.tsx','surfaces/page.tsx'],
  ]);
  const custom={'atoms/button.tsx':{uses:['features/search.tsx','pages/home.tsx']},'features/search.tsx':{uses:['atoms/button.tsx']}};
  assert.equal(importDirectionViolations(custom,['atoms','features','pages']).length,2);
  assert.deepEqual(importDirectionViolations(custom,['pages','features','atoms']).map(v=>[v.source,v.target]),[['features/search.tsx','atoms/button.tsx']]);
});

test('fresh init seeds a runnable downward composition and preserves it on rerun',async t=>{
  const root=temporary(t),logs=[];init({root},line=>logs.push(line));
  const c=await loadConfig(root);
  assert.deepEqual(c.sources,layers);
  assert.match(readFileSync(path.join(root,'adg.config.mjs'),'utf8'),/requires: '>=0.5.0'/);
  assert.ok(existsSync(path.join(c.design,'fixtures/example.ts')));
  assert.ok(existsSync(path.join(c.design,'art')));
  assert.equal(existsSync(path.join(c.design,'studies')),false);
  const files=listSources(c.design);
  assert.deepEqual(files.map(f=>path.relative(c.design,f)),layers.map(d=>`${d}/example.tsx`));
  const imports=[];
  for (const file of files) {
    const built=await buildSource(c,file,{write:false});
    assert.deepEqual(built.frames.map(f=>f.name),['default']);
    imports.push(...built.imports);
    assert.ok(readFileSync(file,'utf8').split('\n').every(line=>line.length<=140));
  }
  assert.deepEqual(imports,['components/example.tsx','modules/example.tsx']);
  assert.equal((await check(c,[],{'read-only':true},()=>{},line=>assert.fail(line))).data.complete,true);
  assert.equal(existsSync(c.output),false);
  assert.equal((await render(c,[],{scale:1})).data.complete,true);
  for(const layer of layers)for(const theme of ['light','dark'])assert.ok(existsSync(path.join(c.output,layer,'example',`default-${theme}.png`)));
  const example=files[0],edited=readFileSync(example,'utf8')+'\n// Consumer edit.\n';writeFileSync(example,edited);
  const fixture=path.join(c.design,'fixtures/example.ts');writeFileSync(fixture,'consumer fixture');
  init(c,()=>{});
  assert.equal(readFileSync(example,'utf8'),edited);assert.equal(readFileSync(fixture,'utf8'),'consumer fixture');
});

test('init respects explicit names and avoids starter assets in existing libraries',async t=>{
  const root=temporary(t),configuration="export default {sources:['atoms','features','pages']};\n";
  put(root,'adg.config.mjs',configuration);
  const c=await loadConfig(root);init(c,()=>{});
  assert.equal(readFileSync(path.join(root,'adg.config.mjs'),'utf8'),configuration);
  assert.deepEqual(listSources(c.design,c.sources).map(f=>path.relative(c.design,f)),['atoms/example.tsx','features/example.tsx','pages/example.tsx']);
  assert.equal(existsSync(path.join(c.design,'components')),false);
  assert.equal((await check(c,[],{'read-only':true},()=>{},line=>assert.fail(line))).data.complete,true);
  const existing=temporary(t);put(existing,'adg.config.mjs','export default {};');
  put(existing,'design/components/control.tsx',source);put(existing,'design/tokens.css',starterTokens);
  const old=await loadConfig(existing);init(old,()=>{});
  assert.deepEqual(listSources(old.design).map(f=>path.relative(old.design,f)),['components/control.tsx']);
  assert.equal(existsSync(path.join(old.design,'fixtures/example.ts')),false);
  assert.ok(existsSync(path.join(old.design,'modules')));
});

test('default studies discovery needs an actual direct TSX source and never alters explicit sources',async t=>{
  const root=temporary(t);put(root,'adg.config.mjs','export default {};');
  put(root,'design/studies/README.md','Explorations');
  assert.deepEqual((await loadConfig(root)).sources,layers);
  put(root,'design/studies/nested/helper.tsx',source);
  assert.deepEqual((await loadConfig(root)).sources,layers);
  const study=put(root,'design/studies/float.tsx',source);
  assert.deepEqual((await loadConfig(root)).sources,[...layers,'studies']);
  assert.deepEqual(listSources(path.join(root,'design')).map(f=>path.relative(path.join(root,'design'),f)),['studies/float.tsx']);
  assert.deepEqual(sourceDirectories({design:path.join(root,'design'),sources:['components','surfaces']}),['components','surfaces']);
  rmSync(study);assert.deepEqual((await loadConfig(root)).sources,layers);
});

test('read-only check reports resolved imports for all or selected files and opt-out keeps frame checks',async t=>{
  const root=temporary(t);put(root,'adg.config.mjs','export default {};');
  put(root,'design/tokens.css',starterTokens);
  put(root,'design/modules/feature.tsx',source);put(root,'design/surfaces/index.tsx',source);
  const bad=`import {Frame} from 'adg';import {Part as Feature} from '../modules/feature';import {Part as Page} from '../surfaces';export default()=> <Frame name="default"><div><Feature/><Page/></div></Frame>;`;
  put(root,'design/components/bad.tsx',bad);
  put(root,'design/modules/bad.tsx',`import {Part} from '../surfaces/index.tsx';import {Frame} from 'adg';export default()=> <Frame name="default"><Part/></Frame>;`);
  const c=await loadConfig(root),errors=[];
  await assert.rejects(check(c,[],{'read-only':true},()=>{},line=>errors.push(line)), {code:'CHECK_FAILED'});
  assert.equal(errors.length,3);
  assert.ok(errors.some(line=>line.includes('design/components/bad.tsx: import modules/feature.tsx')));
  assert.ok(errors.some(line=>line.includes('design/modules/bad.tsx: import surfaces/index.tsx')));
  const selected=[];await assert.rejects(check(c,['components/bad'],{'read-only':true},()=>{},line=>selected.push(line)), {code:'CHECK_FAILED'});
  assert.equal(selected.length,2);
  assert.ok(selected.every(line=>line.startsWith('design/components/bad.tsx: import ')));
  c.check.importDirection=false;
  assert.equal((await check(c,[],{'read-only':true},()=>{},line=>assert.fail(line))).data.complete,true);
  put(root,'design/components/bad.tsx',bad.replace('<div>','<div class="text-[#ff0101]">'));
  const paint=[];await assert.rejects(check(c,['components/bad'],{'read-only':true},()=>{},line=>paint.push(line)), {code:'CHECK_FAILED'});
  assert.equal(paint.length,2);assert.ok(paint.every(line=>line.includes('Color')));
  assert.equal(existsSync(path.join(c.design,'.adg')),false);assert.equal(existsSync(c.output),false);
  assert.equal(parseCli(['check','--read-only']).values['read-only'],true);
});

test('config validates and loads the import-direction opt-out',async t=>{
  for(const value of [null,true,[],{importDirection:'false'}]) {
    const root=temporary(t);put(root,'adg.config.mjs',`export default {check:${JSON.stringify(value)}};`);
    await assert.rejects(loadConfig(root),/Set check(?:\.importDirection)? to/);
  }
  const root=temporary(t);put(root,'adg.config.mjs','export default {check:{importDirection:false}};');
  assert.equal((await loadConfig(root)).check.importDirection,false);
});

test('viewer adds and removes default studies through its file watcher', {timeout:15000},async t=>{
  const root=temporary(t);put(root,'adg.config.mjs','export default {};');
  put(root,'design/tokens.css',starterTokens);put(root,'design/components/control.tsx',source);
  mkdirSync(path.join(root,'design/studies'));
  const server=await startServer({directory:path.join(root,'design'),stateDirectory:path.join(root,'state')});
  const controller=new AbortController();
  try {
    const events=await fetch(new URL('/events',server.url),{signal:controller.signal}),reader=events.body.getReader();await reader.read();
    const study=put(root,'design/studies/direction.tsx',source);await reader.read();
    let manifest=await(await fetch(new URL('/manifest',server.url))).json();
    assert.ok(manifest.assets.some(a=>a.path==='studies/direction.tsx'));
    assert.equal((await fetch(new URL('/asset/studies%2Fdirection.tsx',server.url))).status,200);
    rmSync(study);await reader.read();manifest=await(await fetch(new URL('/manifest',server.url))).json();
    assert.ok(!manifest.assets.some(a=>a.path.startsWith('studies/')));await reader.cancel();
  } finally {controller.abort();await server.close()}
});
