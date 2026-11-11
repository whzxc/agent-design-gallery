import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/toolkit/config.mjs';
import { selectSources, archFiles } from '../src/toolkit/project.mjs';
import { inspectArch, sidecar, ownerProblems, inspectArchLabels } from '../src/toolkit/arch.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { createBuildStore } from '../src/toolkit/build-store.mjs';
import { check, render } from '../src/toolkit/commands.mjs';
import { launch, loadFrame } from '../src/toolkit/browser.mjs';
import { startServer } from '../src/server.mjs';
import { previewTarget, previewURL } from '../src/link.mjs';
import { startHub } from '../src/hub.mjs';
import { addRoot, listProjects } from '../src/hub/registry.mjs';
const exec = promisify(execFile), asset='arch/mechanisms/work.mmd';
async function fixture(t) {
  const root=await realpath(await mkdtemp(path.join(tmpdir(),'sdg-arch-')));
  await cp(new URL('../fixtures/arch-sample/',import.meta.url),root,{recursive:true});
  t.after(()=>rm(root,{recursive:true,force:true}));
  return await loadConfig(root);
}

test('architecture discovery defaults, disable, custom directory, and config validation', async t=>{
  const c=await fixture(t);
  await mkdir(path.join(c.arch,'agent-scenarios'));
  await writeFile(path.join(c.arch,'agent-scenarios/example.json'),'{}');
  assert.equal(archFiles(c.arch).length,1);
  assert.deepEqual(selectSources(c,[asset],{write:false}),[path.join(c.root,asset)]);
  assert.equal(selectSources(c,[],{write:false}).length,1);
  await rm(c.arch,{recursive:true});assert.equal((await loadConfig(c.root)).arch,false);
  await mkdir(path.join(c.root,'architecture'));
  await writeFile(path.join(c.root,'architecture/system.mmd'),'flowchart LR\nA --> B');
  await writeFile(path.join(c.root,'sdg.config.mjs'),"export default {arch:'architecture'}");
  let custom=await loadConfig(c.root);
  assert.equal(selectSources(custom,[],{write:false}).length,1);
  assert.deepEqual(selectSources(custom,['architecture/system.mmd'],{write:false}),[path.join(c.root,'architecture/system.mmd')]);
  await writeFile(path.join(c.root,'sdg.config.mjs'),'export default {arch:false}');
  assert.equal((await loadConfig(c.root)).arch,false);
  for(const invalid of ["arch:true","arch:''","arch:'../outside'","arch:'/tmp'","check:{archMaxEdges:-1}","check:{archMaxEdges:1.5}"]) {
    await writeFile(path.join(c.root,'sdg.config.mjs'),`export default {${invalid}}`);
    await assert.rejects(loadConfig(c.root),/Set arch|archMaxEdges/);
  }
});

test('each architecture check failure has an actionable problem and original line',async t=>{
  const c=await fixture(t), file=path.join(c.root,asset), note=file.replace(/\.mmd$/,'.md');
  const cases=[
    ['%% heading\nflowchart LR\nA -->',/Pele:.*line 3/],
    ['flowchart LR\nA --> B\nclass A mystery',/Unknown class mystery; vocabulary: progress/],
    ['flowchart LR\nA:::added --> B',/Reserved class added/],
    ['flowchart LR\nA --> B; style A fill:red',/Painting statement style at line 2/],
    ['flowchart LR\nclassDef x fill:red\nA --> B',/Painting statement classDef at line 2/],
    ['flowchart LR\nA --> B\nlinkStyle 0 stroke:red',/Painting statement linkStyle at line 3/],
    ['%%{init: {"themeVariables":{"primaryColor":"red"}}}%%\nflowchart LR\nA --> B',/Painting directive/],
    ['---\nconfig:\n  theme: dark\n---\nflowchart LR\nA --> B',/Painting directive/],
    ['flowchart LR\nA --> B --> C',/2 edges\/messages exceeds check.archMaxEdges \(1\)/],
    ['sequenceDiagram\nA->>B: One\nB->>A: Two',/2 edges\/messages exceeds/],
    ['stateDiagram-v2\nA --> B\nB --> C',/2 edges\/messages exceeds/],
    ['erDiagram\nA ||--o{ B : owns\nB ||--o{ C : owns',/2 edges\/messages exceeds/],
  ];
  for(const [text,expected] of cases) {
    await writeFile(file,text);const problems=[];
    assert.equal(await check({...c,check:{archMaxEdges:1}},[asset],{'read-only':true},()=>{},p=>problems.push(p)),1);
    assert.ok(problems.some(p=>expected.test(p)),problems.join('\n'));
    assert.ok(problems.every(p=>p.startsWith(asset+': ')));
  }
  assert.deepEqual(inspectArch('flowchart LR\nA["style is a label; classDef too"] --> B').problems,[]);
  const bad=sidecar('---\nowner: []\n---\nReview.');assert.match(bad.problems.join('\n'),/Invalid sidecar frontmatter key/);
  await writeFile(file,'flowchart LR\nA --> B');
  await writeFile(note,'---\nowners:\n  - missing/*.rs\ninvalid: value\n---\nReview.');
  const problems=[];assert.equal(await check(c,[asset],{'read-only':true},()=>{},p=>problems.push(p)),1);
  assert.ok(problems.some(p=>p.includes('matches no file')));
  assert.ok(problems.some(p=>p.includes('Invalid sidecar frontmatter key')));
  assert.ok(sidecar('---\nowners:\n  - ../outside\n---\n').problems.length);
  assert.ok(sidecar('---\nstatus: Draft').problems.length);
  assert.deepEqual(ownerProblems(c,sidecar(await readFile(path.join(c.root,asset.replace('.mmd','.md')),'utf8'))),['Owners entry missing/*.rs matches no file']);
});

test('arch build carries tokens, semantics, legend, notes, font fit, and overflow checking in both themes',async t=>{
  const c=await fixture(t), built=await buildSource(c,path.join(c.root,asset),{write:false});
  assert.deepEqual(built.imports,[]);assert.equal(built.frames.length,1);
  const frame=built.frames[0];assert.equal(frame.name,'default');
  assert.match(frame.note,/Review the queue.*\nOwners: sdg.config.mjs, arch\/mechanisms\/\*.mmd\nStatus: Draft/);
  assert.match(frame.html,/pele-node[^"<>]*progress[^"<>]*experimental/);
  for(const name of ['waiting','progress','experimental','uncertain','temporary','done'])assert.match(frame.html,new RegExp(`arch-key ${name}`));
  assert.doesNotMatch(frame.html,/arch-key stopped/);
  for(const token of ['--pele-bg:var(--surface,var(--canvas))','--pele-font:var(--font-ui)','--pele-border:var(--border-strong,var(--border,var(--text)))'])assert.ok(built.css.includes(token));
  const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
  const colors=[];
  for(const theme of ['light','dark']) {
    await loadFrame(page,frame,theme);assert.deepEqual(await page.evaluate(inspectArchLabels),[]);
    colors.push(await page.locator('.pele-node.progress > rect').evaluate(el=>getComputedStyle(el).fill));
    assert.equal(await page.locator('.pele-node.experimental > rect').evaluate(el=>getComputedStyle(el).strokeDasharray),'6px, 4px');
    await page.locator('.pele-node text').first().evaluate(el=>el.textContent='A very long replacement label that overflows the node shape');
    assert.ok((await page.evaluate(inspectArchLabels)).some(p=>p.includes('Label overflows node')));
  }
  assert.notEqual(colors[0],colors[1]);
  const problems=[];assert.equal(await check(c,[asset],{'read-only':true},()=>{},p=>problems.push(p)),0,problems.join('\n'));
  const raw=await readFile(path.join(c.root,asset),'utf8');
  await writeFile(path.join(c.root,asset),raw.replace(/\n  class[^\n]+/g,''));
  assert.doesNotMatch((await buildSource(c,path.join(c.root,asset),{write:false})).frames[0].html,/arch-legend/);
});

test('arch worker cache hashes optional sidecars, tokens and source bytes across restart',async t=>{
  const config=await fixture(t),cacheDirectory=path.join(config.root,'cache');
  const side=path.join(config.root,asset.replace('.mmd','.md'));
  await rm(side);
  let store=await createBuildStore({config,cacheDirectory});t.after(()=>store.close());
  const first=await store.get(asset);assert.deepEqual(first.imports,[]);
  await store.close();store=await createBuildStore({config,cacheDirectory});
  assert.equal((await store.get(asset)).hash,first.hash);assert.equal(store.stats().attempts,0);
  await writeFile(side,'First note.');
  assert.deepEqual(store.invalidate(['../arch/mechanisms/work.md']),[asset]);
  const next=await store.get(asset);assert.notEqual(next.hash,first.hash);assert.equal(next.frames[0].note,'First note.');
  await rm(side);store.invalidate(['../arch/mechanisms/work.md']);assert.equal((await store.get(asset)).hash,first.hash);
  await writeFile(path.join(config.root,asset),(await readFile(path.join(config.root,asset),'utf8'))+'\n%% comment');
  store.invalidate([asset]);assert.equal((await store.get(asset)).hash,first.hash,'comment-only changes retain viewer preview hash');
  await writeFile(path.join(config.design,'tokens.css'),(await readFile(path.join(config.design,'tokens.css'),'utf8')).replace('#ffffff','#fafafa'));
  store.invalidate(['tokens.css']);assert.notEqual((await store.get(asset)).hash,first.hash);
});

test('CLI renders one arch frame per theme, with root-relative paths and isolated captures',async t=>{
  const c=await fixture(t),cli=new URL('../src/cli.mjs',import.meta.url).pathname;
  const {stdout}=await exec(process.execPath,[cli,'render',asset,'--json','--scale=1','--out-dir=output/png'],{cwd:c.root});
  const captures=JSON.parse(stdout);
  assert.deepEqual(captures.map(c=>[c.source,c.frame,c.theme]),[[asset,'default','light'],[asset,'default','dark']]);
  for(const capture of captures) {
    const bytes=await readFile(capture.path);assert.equal(bytes.subarray(1,4).toString(),'PNG');
    assert.ok(capture.path.startsWith(path.join(c.root,'output/png/arch/')));
  }
  await assert.rejects(stat(path.join(c.design,'.sdg')),/ENOENT/);
  const target=previewTarget({asset,frame:'default'});
  assert.equal(previewURL('http://localhost:1234/',target).searchParams.get('asset'),asset);
  assert.ok(previewURL('http://localhost:1234/',{...target,mode:'path'}).pathname.startsWith('/view/layer/arch/'));
});

test('viewer browses arch scope, uses cache on reload, and refreshes sidecars and source changes via SSE',async t=>{
  const c=await fixture(t);
  const server=await startServer({directory:c.design,stateDirectory:path.join(c.root,'state'),readOnly:true});t.after(()=>server.close());
  const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
  await page.goto(previewURL(server.url,previewTarget({asset})).href);
  await page.waitForFunction(()=>window.__sdg?.ready);
  assert.equal(await page.evaluate(()=>window.__sdg.scope),`asset:${asset}`);
  assert.deepEqual(await page.evaluate(()=>window.__sdg.items.map(i=>i.path)),[asset]);
  await page.getByRole('button',{name:'Fit',exact:true}).click();
  const manifest=await (await fetch(server.url+'manifest?scope=layer:arch')).json();
  assert.ok(manifest.layers.includes('arch'));assert.equal(manifest.assets[0].layer,'arch');
  assert.deepEqual((await (await fetch(server.url+'relationships')).json())[asset],{uses:[],usedBy:[]});
  const builds=server.cacheStats().builds.builds;
  await page.reload();await page.waitForFunction(()=>window.__sdg?.ready);
  assert.equal(server.cacheStats().builds.builds,builds);
  const before=await page.evaluate(()=>window.__sdg.revision);
  await writeFile(path.join(c.root,asset.replace('.mmd','.md')),'Changed architecture note.');
  await page.waitForFunction(revision=>window.__sdg.ready&&window.__sdg.revision>revision,before);
  assert.equal((await (await fetch(server.url+'asset/'+encodeURIComponent(asset))).json()).frames[0].note,'Changed architecture note.');
  const revision=await page.evaluate(()=>window.__sdg.revision);
  await writeFile(path.join(c.root,asset),'flowchart LR\nA[Updated architecture] --> B');
  await page.waitForFunction(revision=>window.__sdg.ready&&window.__sdg.revision>revision,revision);
  assert.match((await (await fetch(server.url+'asset/'+encodeURIComponent(asset))).json()).frames[0].html,/Updated architecture/);
  await page.getByRole('tab',{name:'Arch',exact:true}).click();await page.waitForFunction(()=>window.__sdg.ready&&window.__sdg.scope==='layer:arch');
  await page.getByRole('button',{name:'Contents',exact:true}).click();
  await page.getByRole('button',{name:'Render only this asset: work',exact:true}).click();
  await page.waitForFunction(()=>window.__sdg.ready&&window.__sdg.scope.startsWith('asset:'));
  const lastRevision=await page.evaluate(()=>window.__sdg.revision);
  await rm(path.join(c.root,asset));
  await page.waitForFunction(revision=>window.__sdg.ready&&window.__sdg.revision>revision,lastRevision);
  const emptyRevision=await page.evaluate(()=>window.__sdg.revision);
  await writeFile(path.join(c.root,asset),'flowchart LR\nA --> B');
  await page.waitForFunction(revision=>window.__sdg.ready&&window.__sdg.revision>revision,emptyRevision);
  assert.deepEqual((await (await fetch(server.url+'manifest?scope=layer:arch')).json()).assets.map(a=>a.path),[asset]);
});

test('resident project discovery counts arch sources and proxies their frames',async t=>{
  const c=await fixture(t),stateDirectory=path.join(c.root,'state');
  await addRoot(c.root,0,stateDirectory);
  const projects=await listProjects(stateDirectory);assert.equal(projects[0].sourceCount,1);
  const hub=await startHub({port:0,stateDirectory});t.after(()=>hub.close());
  const response=await fetch(`${hub.url}p/${projects[0].slug}/asset/${encodeURIComponent(asset)}`);
  assert.equal(response.status,200);const built=await response.json();assert.match(built.frames[0].html,/pele-flowchart/);
});


test('class diagrams keep declarations, methods and relations out of the semantic vocabulary',async t=>{
  const c=await fixture(t), source='classDiagram\n  class Duck {\n    +swim()\n  }\n  class Pond\n  Duck --> Pond';
  assert.deepEqual(inspectArch(source).problems,[]);
  assert.deepEqual(inspectArch(source).classes,[]);
  await writeFile(path.join(c.root,asset),source);
  const built=await buildSource(c,path.join(c.root,asset),{write:false});
  assert.match(built.frames[0].html,/Duck/);assert.match(built.frames[0].html,/swim/);
  const problems=[];
  assert.equal(await check(c,[asset],{'read-only':true},()=>{},p=>problems.push(p)),0,problems.join('\n'));
  assert.deepEqual(inspectArch('flowchart LR\nA:::progress --> B\nclass B done').classes,['progress','done']);
  assert.deepEqual(inspectArch('flowchart LR\nA[host:::port] --> B').problems,[]);
  assert.deepEqual(inspectArch('stateDiagram-v2\nA:::progress --> B').classes,['progress']);
  assert.deepEqual(inspectArch('stateDiagram-v2\nstate active {\nA --> B\nclass A waiting\n}').classes,['waiting']);
});

test('state edge budgets include transitions in composite and nested composite states',()=>{
  const source='stateDiagram-v2\nstate active {\nreserved --> executing\nstate nested {\nexecuting --> waiting\n}\n}\nactive --> completed';
  const checked=inspectArch(source,2);
  assert.equal(checked.model.relations.length,1);
  assert.equal(checked.model.graph.edges.length,3);
  assert.deepEqual(checked.problems,['3 edges/messages exceeds check.archMaxEdges (2)']);
  assert.deepEqual(inspectArch(source,3).problems,[]);
});

test('paint detection inspects config keys and leaves titles and quoted values alone',()=>{
  for(const source of [
    '---\ntitle: Background work\n---\nflowchart LR\nA --> B',
    '---\ntitle: "theme: dark, background: red"\n---\nflowchart LR\nA --> B',
    '%%{init: {"title":"Background work", "note":"theme: dark, stroke: red"}}%%\nflowchart LR\nA --> B',
  ]) assert.deepEqual(inspectArch(source).problems,[]);
  for(const config of ['"theme":"dark"',"'themeVariables': {'primaryColor':'red'}",'background: "white"']) {
    assert.ok(inspectArch(`%%{init: {${config}}}%%\nflowchart LR\nA --> B`).problems.some(p=>p.startsWith('Painting directive/frontmatter key')));
  }
  assert.ok(inspectArch('---\nconfig:\n  themeVariables:\n    primaryColor: red\n---\nflowchart LR\nA --> B').problems.some(p=>p.includes('key themeVariables')));
});

test('check and render each share their existing browser with architecture measurement',async t=>{
  const c=await fixture(t),{chromium}=await import('playwright');
  const original=chromium.launch.bind(chromium);let launches=0;
  t.mock.method(chromium,'launch',(...args)=>{launches++;return original(...args);});
  assert.equal(await check(c,[asset],{'read-only':true},()=>{},()=>{}),0);
  assert.equal(launches,1);
  await render(c,[asset],{theme:'light',scale:1,'out-dir':'output/shared-browser'});
  assert.equal(launches,2);
});

test('a worker launch failure reports the install hint per arch source while TSX builds succeed',async t=>{
  const config=await fixture(t),old=process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(config.root,'missing-browser');
  t.after(()=>{if(old===undefined)delete process.env.PLAYWRIGHT_BROWSERS_PATH;else process.env.PLAYWRIGHT_BROWSERS_PATH=old;});
  const name='components/plain.tsx';
  await mkdir(path.join(config.design,'components'));
  await writeFile(path.join(config.design,name),`import {Frame} from 'sdg';export default()=> <Frame name="default"><div>Still builds</div></Frame>;`);
  await writeFile(path.join(config.arch,'other.mmd'),'flowchart LR\nA --> B');
  const store=await createBuildStore({config,cacheDirectory:path.join(config.root,'failure-cache')});t.after(()=>store.close());
  assert.match((await store.get(name)).frames[0].html,/Still builds/);
  for(const source of [asset,'arch/other.mmd']) await assert.rejects(store.get(source),/Chromium is missing; run npx playwright@1\.64\.1 install chromium/);
  store.invalidate([name]);assert.match((await store.get(name)).frames[0].html,/Still builds/);
  assert.equal(store.stats().spawned,1,'failed architecture builds do not poison or replace the TSX worker');
});

test('real architecture workers recycle and finish browser shutdown before a standalone process exits',async t=>{
  const c=await fixture(t), script=path.join(c.root,'close-workers.mjs');
  await writeFile(script,`
import {readFile,writeFile} from 'node:fs/promises';
import {loadConfig} from ${JSON.stringify(new URL('../src/toolkit/config.mjs',import.meta.url).href)};
import {createBuildStore} from ${JSON.stringify(new URL('../src/toolkit/build-store.mjs',import.meta.url).href)};
const config=await loadConfig(${JSON.stringify(c.root)}),name=${JSON.stringify(asset)},file=config.root+'/'+name;
const store=await createBuildStore({config,cacheDirectory:config.root+'/recycle-cache'});
try {
  const source=await readFile(file,'utf8');
  for(let i=0;i<33;i++) {
    await writeFile(file,source+'\\n%% revision '+i);store.invalidate([name]);await store.get(name);
  }
  const recycled=store.stats().recycled;
  await store.close();console.log(JSON.stringify({recycled,workers:store.stats().workers}));
} finally {await store.close();}
`);
  const {stdout}=await exec(process.execPath,[script],{timeout:20000});
  const result=JSON.parse(stdout);
  assert.ok(result.recycled>=1);assert.equal(result.workers,0);
});
