import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { parse, render as peleRender } from 'pele';
import { overlayModels, stampOverlay, buildOverlay } from '../src/toolkit/arch-overlay.mjs';
import { resolveBase, readBase, baseArchFiles } from '../src/toolkit/arch-git.mjs';
import { loadConfig } from '../src/toolkit/config.mjs';
import { buildSource } from '../src/toolkit/build.mjs';
import { createBuildStore } from '../src/toolkit/build-store.mjs';
import { selectSources } from '../src/toolkit/project.mjs';
import { launch, loadFrame } from '../src/toolkit/browser.mjs';
import { parseCli } from '../src/cli.mjs';
import { previewTarget, previewURL } from '../src/link.mjs';
import { readViewRoute, viewURL } from '../public/view-route.js';
import { startServer } from '../src/server.mjs';
import { startHub } from '../src/hub.mjs';
import { addRoot, listProjects } from '../src/hub/registry.mjs';
const exec=promisify(execFile),asset='arch/mechanisms/work.mmd',cli=new URL('../src/cli.mjs',import.meta.url).pathname;
const git=(c,...args)=>exec('git',['-c','user.name=ADG Test','-c','user.email=adg-test@example.invalid',...args],{cwd:c.root});
async function fixture(t, directory=tmpdir()) {
  const root=await realpath(await mkdtemp(path.join(directory,'adg-overlay-')));
  await cp(new URL('../fixtures/arch-sample/',import.meta.url),root,{recursive:true});
  t.after(()=>rm(root,{recursive:true,force:true}));
  const c=await loadConfig(root);
  await git(c,'init','-q');await git(c,'add','arch','design','adg.config.mjs');await git(c,'commit','-qm','docs(arch): add baseline');
  return c;
}
const compare=(old,current)=>overlayModels(parse(current),old?parse(old):null);
const svg=overlay=>stampOverlay(peleRender(overlay.model).svg,overlay);
const group=(markup,id)=>markup.match(new RegExp(`<g[^>]*data-id="${id}"[^>]*>`))?.[0]??'';

test('flowchart nodes, subgraphs, parents, shapes and endpoint occurrence edges compare structurally',()=>{
  const old='flowchart LR\nsubgraph G[Group]\nA[Old] -->|one| B[Gone]\nA -->|two| B\nend\nsubgraph H[Old group]\nD[Move]\nend';
  const current='flowchart LR\nsubgraph G[Group]\nA{New} -->|changed| C[Added]\nD[Move]\nend\nsubgraph H[Renamed group]\nE[New]\nend';
  const overlay=compare(old,current),markup=svg(overlay);
  for(const [id,name] of [['A','changed'],['B','removed'],['C','added'],['D','changed'],['H','changed']])assert.equal(overlay.nodes.get(id),name);
  assert.ok(overlay.model.subgraphs.find(g=>g.id==='G').nodes.includes('B'),'ghost returns to its surviving base parent');
  assert.match(group(markup,'A'),/changed/);assert.match(group(markup,'L_A_B_0'),/removed/);assert.match(group(markup,'L_A_C_0'),/added/);
  assert.ok(overlay.changes.includes('- edge A -> B: one'));
  const parallel=compare('flowchart LR\nA -->|one| B\nA -->|two| B','flowchart LR\nA -->|revised| B');
  assert.equal(parallel.edges.get('L_A_B_0'),'changed');assert.equal(parallel.edges.get('L_A_B_2'),'removed');
  const root=compare('flowchart LR\nsubgraph G[Gone]\nA --> B\nend','flowchart LR\nC --> D');
  assert.ok(!root.model.subgraphs.flatMap(g=>g.nodes).includes('A'));
  assert.match(group(svg(root),'G'),/removed/);
  const converted=compare('flowchart LR\nsubgraph G[Old group]\nA\nend\nG --> Z','flowchart LR\nG[Current node] --> Z');
  assert.equal(converted.nodes.get('G'),'changed');assert.ok(!converted.model.subgraphs.some(g=>g.id==='G'));
  assert.match(svg(converted),/Current node/);assert.equal(converted.changes.filter(c=>/^(?:~|-) (?:node|subgraph) G[: ]?/.test(c)).length,1);
  const layout=compare(null,'flowchart LR\nA ~~~ B');
  assert.match(group(svg(layout),layout.model.edges[0].id),/added/);
});

test('state overlays include composite states, nested transitions and ghost parents',()=>{
  const old='stateDiagram-v2\nstate active {\nA --> B: old\nB --> X: gone\n}\nactive --> done: finish';
  const current='stateDiagram-v2\nstate active {\nA --> B: new\nB --> C: added\n}\nactive --> done: finish';
  const overlay=compare(old,current),markup=svg(overlay);
  assert.equal(overlay.nodes.get('C'),'added');assert.equal(overlay.nodes.get('X'),'removed');
  assert.equal(overlay.model.graph.nodes.find(n=>n.id==='X').parentId,'active');
  assert.equal(overlay.edges.get('edge0'),'changed');assert.match(group(markup,'edge3'),/removed/);
  assert.ok(overlay.changes.includes('~ transition A -> B: old -> new'));
  assert.ok(overlay.changes.includes('+ transition B -> C: added'));
  assert.match(markup,/- gone/);assert.match(markup,/\+ added/);
  const root=compare(old,'stateDiagram-v2\nC --> done');
  assert.equal(root.model.graph.nodes.find(n=>n.id==='X').parentId,undefined);
  assert.match(group(svg(root),'active'),/removed/);
  const moved=compare('stateDiagram-v2\nstate G {\nA --> B\n}','stateDiagram-v2\nstate G {\nA\nB\n}\nA --> B');
  assert.equal(moved.edges.get('edge0'),'changed');
});

test('sequence overlays align messages by LCS and retain ghost participants and control blocks',()=>{
  const old='sequenceDiagram\nparticipant A as Old label\nparticipant B\nparticipant Z\nA->>B: first\nB->>A: keep\nA->>Z: gone';
  const current='sequenceDiagram\nparticipant A as New label\nparticipant B\nparticipant C\nA->>B: revised\nB->>A: keep\nB->>C: added';
  const overlay=compare(old,current),markup=svg(overlay);
  assert.equal(overlay.nodes.get('A'),'changed');assert.equal(overlay.nodes.get('C'),'added');assert.equal(overlay.nodes.get('Z'),'removed');
  assert.ok(overlay.changes.includes('~ message A -> B: first -> revised'));
  assert.ok(overlay.changes.includes('- message A -> Z: gone'));
  assert.ok(overlay.changes.includes('+ message B -> C: added'));
  for(const name of ['added','changed','removed'])assert.ok([...overlay.edges.values()].includes(name));
  for(const [id,name] of overlay.edges)assert.match(group(markup,id),new RegExp(name));
  assert.match(group(markup,'Z'),/removed/);assert.match(markup,/- gone/);assert.match(markup,/\+ added/);
  const loop=compare('sequenceDiagram\nA->>B: keep','sequenceDiagram\nloop Work\nA->>B: keep\nB->>A: next\nend');
  assert.doesNotThrow(()=>svg(loop));
  assert.equal(loop.model.messages.filter(m=>m.type===10).length,1);
  assert.equal(loop.model.messages.filter(m=>m.type===11).length,1);
  const repeated=compare('sequenceDiagram\nA->>B: one\nA->>B: two\nA->>B: one','sequenceDiagram\nA->>B: one\nA->>B: one');
  assert.equal([...repeated.edges.values()].filter(n=>n==='removed').length,1);
});

test('an absent base diagram is entirely added; unsupported types retain a note',async t=>{
  for(const source of ['flowchart LR\nA --> B','stateDiagram-v2\nA --> B','sequenceDiagram\nA->>B: Hello']) {
    const overlay=compare(null,source);assert.ok(overlay.nodes.size>0);assert.ok(overlay.edges.size>0);
    assert.ok([...overlay.nodes.values(),...overlay.edges.values()].every(n=>n==='added'));assert.doesNotThrow(()=>svg(overlay));
  }
  const c=await fixture(t),base=await resolveBase(c,'HEAD');
  await writeFile(path.join(c.root,asset),'classDiagram\nclass Duck {\n+swim()\n}');
  const built=await buildOverlay(c,path.join(c.root,asset),{base});
  assert.match(built.frames[0].note,/overlays are unsupported/);assert.match(built.frames[0].html,/Duck/);
});

test('unlabeled added and removed edges stay unlabeled in all supported diagram types',()=>{
  const diagrams=[
    ['flowchart LR\nA --> B','flowchart LR\nA --> C','edge',model=>model.edges.map(edge=>[edge.id,edge.text])],
    ['stateDiagram-v2\nA --> B','stateDiagram-v2\nA --> C','transition',model=>model.graph.edges.map(edge=>[edge.id,edge.label])],
    ['sequenceDiagram\nA->>B:','sequenceDiagram\nA->>C:','message',model=>model.messages.map(message=>[`i${message.id}`,message.message])],
  ];
  for(const [old,current,kind,labels] of diagrams) {
    const overlay=compare(old,current),markup=svg(overlay);
    assert.ok(overlay.changes.includes(`+ ${kind} A -> C`));
    assert.ok(overlay.changes.includes(`- ${kind} A -> B`));
    for(const [id,label] of labels(overlay.model)) {
      assert.equal(label,'');
      assert.doesNotMatch(markup,new RegExp(`<g class="pele-edge-label[^\"]*" data-id="${id}"`));
    }
  }
});

test('overlay style combines phase fill and diff border and stamps labels and arrowheads in both themes',async t=>{
  const c=await fixture(t);
  await writeFile(path.join(c.root,asset),'flowchart LR\nA[Old] -. old .-> B[Stable]\nB -->|gone| Z[Gone]\nclass A progress,experimental');
  await git(c,'add','arch');await git(c,'commit','-qm','docs(arch): set styled baseline');
  const base=await resolveBase(c,'HEAD');
  await writeFile(path.join(c.root,asset),'flowchart LR\nA[New] -. revised .-> B[Stable]\nA -->|added| C[New node]\nclass A progress,experimental');
  const browser=await launch();t.after(()=>browser.close());
  const built=await buildOverlay(c,path.join(c.root,asset),{base,browser}),page=await browser.newPage();
  assert.match(built.frames[0].note,/\+ edge A -> C: added/);
  assert.match(built.frames[0].html,new RegExp(`Compared with ${base.sha.slice(0,7)} \\(HEAD\\)`));
  for(const theme of ['light','dark']) {
    await loadFrame(page,built.frames[0],theme);
    const styles=await page.evaluate(()=>{
      const node=getComputedStyle(document.querySelector('.pele-node.changed>rect'));
      const edge=getComputedStyle(document.querySelector('.pele-edge.added'));
      const marker=getComputedStyle(document.querySelector('.pele-edge.added .pele-marker'));
      const removedLabel=document.querySelector('.pele-edge-label.removed');
      const labelOpacity={group:getComputedStyle(removedLabel).opacity,text:getComputedStyle(removedLabel.querySelector('text')).opacity,background:getComputedStyle(removedLabel.querySelector('rect')).opacity};
      return {width:node.strokeWidth,dash:node.strokeDasharray,fill:node.fill,edge:edge.stroke,edgeWidth:edge.strokeWidth,marker:marker.fill,removed:getComputedStyle(document.querySelector('.pele-node.removed')).opacity,changedDash:getComputedStyle(document.querySelector('.pele-edge.changed>path:not(.pele-marker)')).strokeDasharray,removedDash:getComputedStyle(document.querySelector('.pele-edge.removed>path:not(.pele-marker)')).strokeDasharray,labelOpacity};
    });
    assert.equal(styles.width,'2.5px');assert.equal(styles.dash,'4px, 3px');assert.equal(styles.edgeWidth,'2.25px');
    assert.equal(styles.edge,styles.marker);assert.equal(styles.removed,'0.5');assert.equal(styles.changedDash,'4px, 3px');assert.equal(styles.removedDash,'5px, 4px');assert.ok(styles.fill.includes('color('));
    assert.deepEqual(styles.labelOpacity,{group:'1',text:'0.5',background:'1'});
  }
});

test('base reads and discovery preserve source paths through a symlinked project root, including deletions',async t=>{
  const directory=new URL('../output/arch-segment-b/',import.meta.url).pathname;
  await mkdir(directory,{recursive:true});
  const c=await fixture(t,directory),link=c.root+'-link';
  await symlink(c.root,link);t.after(()=>rm(link,{force:true}));
  const linked=await loadConfig(link),file=path.join(link,asset),base=await resolveBase(linked,'HEAD');
  const original=await readBase(base,file);
  assert.equal(base.root,c.root);assert.match(original.text,/flowchart LR/);
  assert.deepEqual(await baseArchFiles(linked,base),[file]);
  const built=await buildOverlay(linked,file,{base});assert.match(built.frames[0].html,/Compared with/);
  await rm(path.join(c.root,'arch'),{recursive:true});
  assert.deepEqual(await readBase(base,file),original);
  assert.deepEqual(await baseArchFiles(linked,base),[file]);
  const {stdout}=await exec(process.execPath,[cli,'render',asset,'--base=HEAD','--json'],{cwd:link});
  const result=JSON.parse(stdout);assert.deepEqual(result.deleted,[asset]);assert.deepEqual(result.captures,[]);
});

test('Git failures name a next action and base blobs use the resolved repository commit',async t=>{
  const c=await fixture(t),base=await resolveBase(c,'HEAD');
  assert.match(base.sha,/^[a-f0-9]{40}$/);assert.match((await readBase(base,path.join(c.root,asset))).blob,/^[a-f0-9]{40}$/);
  assert.equal((await readBase(base,path.join(c.root,'arch/missing.mmd'))).text,null);
  await assert.rejects(resolveBase(c,'missing-revision'),/Unknown Git revision.*fetch.*retry/);
  const bare=await mkdtemp(path.join(tmpdir(),'adg-no-git-'));t.after(()=>rm(bare,{recursive:true,force:true}));
  await assert.rejects(resolveBase({root:bare},'HEAD'),/not in a Git repository.*initialize/);
  const previous=process.env.PATH;process.env.PATH=bare;
  try {await assert.rejects(resolveBase(c,'HEAD'),/Git is unavailable; install Git/);}
  finally {process.env.PATH=previous;}
});

test('normal builds and their cache payloads remain unchanged beside independent base/blob caches',async t=>{
  const config=await fixture(t),base=await resolveBase(config,'HEAD'),file=path.join(config.root,asset);
  const before=await buildSource(config,file,{write:false});
  const normal=await createBuildStore({config,cacheDirectory:path.join(config.root,'cache/normal')});t.after(()=>normal.close());
  const cached=await normal.get(asset),index=await readFile(path.join(config.root,'cache/normal/index.json'));
  let overlay=await createBuildStore({config:{...config,overlay:base},cacheDirectory:path.join(config.root,'cache/overlay')});t.after(()=>overlay.close());
  const proposed=await overlay.get(asset);assert.notEqual(proposed.hash,cached.hash);
  assert.equal(proposed.baseBlob,(await readBase(base,file)).blob);
  assert.deepEqual((await normal.get(asset)).frames,cached.frames);
  assert.deepEqual(await readFile(path.join(config.root,'cache/normal/index.json')),index);
  await overlay.close();overlay=await createBuildStore({config:{...config,overlay:base},cacheDirectory:path.join(config.root,'cache/overlay')});
  assert.equal((await overlay.get(asset)).hash,proposed.hash);assert.equal(overlay.stats().attempts,0);
  const after=await buildSource(config,file,{write:false});
  assert.equal(after.css,before.css);assert.deepEqual(after.frames.map(({document,...f})=>f),before.frames.map(({document,...f})=>f));
  await writeFile(file,'flowchart LR\nNew --> Current');overlay.invalidate([asset]);
  assert.notEqual((await overlay.get(asset)).hash,proposed.hash);
  await writeFile(path.join(config.root,'change.txt'),'New commit');await git(config,'add','change.txt');await git(config,'commit','-qm','docs: advance revision');
  const next=await resolveBase(config,'HEAD');assert.notEqual(next.sha,base.sha);assert.equal((await readBase(next,file)).blob,proposed.baseBlob);
  const nextStore=await createBuildStore({config:{...config,overlay:next},cacheDirectory:path.join(config.root,'cache/next')});t.after(()=>nextStore.close());
  assert.notEqual((await nextStore.get(asset)).hash,(await overlay.get(asset)).hash);
});

test('CLI base JSON includes captures, added diagrams and deletions; absolute source paths work',async t=>{
  const c=await fixture(t),file=path.join(c.root,asset),added='arch/new.mmd';
  await rm(file);await writeFile(path.join(c.root,added),'flowchart LR\nA --> B');
  const {stdout}=await exec(process.execPath,[cli,'render',file,path.join(c.root,added),'--base=HEAD','--json','--scale=1'],{cwd:c.root});
  const result=JSON.parse(stdout);assert.deepEqual(result.deleted,[asset]);assert.equal(result.captures.length,2);
  assert.ok(result.captures.every(c=>c.source===added));for(const capture of result.captures)assert.equal((await readFile(capture.path)).subarray(1,4).toString(),'PNG');
  const all=JSON.parse((await exec(process.execPath,[cli,'render','--base=HEAD','--json','--scale=1'],{cwd:c.root})).stdout);
  assert.deepEqual(all.deleted,[asset]);assert.equal(all.captures.length,2);
  await rm(path.join(c.root,added));
  await symlink(path.join(c.root,'adg.config.mjs'),file);
  const onlyDeleted=JSON.parse((await exec(process.execPath,[cli,'render',file,'--base=HEAD','--json'],{cwd:c.root,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:path.join(c.root,'missing-browser')}})).stdout);
  assert.deepEqual(onlyDeleted.captures,[]);assert.deepEqual(onlyDeleted.deleted,[asset]);
  await assert.rejects(exec(process.execPath,[cli,'render',added,'--base=missing-revision','--json'],{cwd:c.root}),/Unknown Git revision/);
  await mkdir(path.join(c.design,'components'));const tsx=path.join(c.design,'components/plain.tsx');
  await writeFile(tsx,"import {Frame} from 'adg';export default()=> <Frame name=\"default\"><div>Plain</div></Frame>");
  assert.deepEqual(selectSources(c,[tsx],{write:false}),[tsx]);
  const alias=path.join(c.root,'alias.tsx');await symlink(tsx,alias);assert.deepEqual(selectSources(c,[alias],{write:false}),[tsx]);
  assert.throws(()=>selectSources(c,['/tmp/outside.mmd'],{write:false}),/outside the project root/);
  const ignored=JSON.parse((await exec(process.execPath,[cli,'render',tsx,'--base=missing-revision','--json','--theme=light'],{cwd:c.root})).stdout);
  assert.ok(Array.isArray(ignored));assert.equal(ignored[0].source,'components/plain.tsx');
});

test('open and link locators preserve the base through query, hierarchy navigation and the hub proxy',async t=>{
  const c=await fixture(t);
  await writeFile(path.join(c.root,asset),'flowchart LR\nProposal --> Node');
  const target=previewTarget({asset,base:'HEAD'});
  for(const mode of ['query','path']) {
    const url=previewURL('http://localhost:1234/p/project/',{...target,mode});
    assert.equal(url.searchParams.get('base'),'HEAD');assert.equal(readViewRoute(url).base,'HEAD');
    assert.equal(viewURL(url,'layer:arch').searchParams.get('base'),'HEAD');
    assert.equal(previewURL(url,{mode:'query'}).searchParams.get('base'),'HEAD');
  }
  assert.equal(parseCli(['open','--base=HEAD']).values.base,'HEAD');assert.equal(parseCli(['link','http://localhost/','--base=HEAD']).values.base,'HEAD');
  const output=await exec(process.execPath,[cli,'link','http://localhost/','--asset='+asset,'--base=HEAD'],{cwd:c.root});
  assert.equal(new URL(output.stdout.trim()).searchParams.get('base'),'HEAD');
  const server=await startServer({directory:c.design,stateDirectory:path.join(c.root,'direct-state'),readOnly:true});t.after(()=>server.close());
  const direct=await (await fetch(server.url+'asset/'+encodeURIComponent(asset)+'?base=HEAD')).json();assert.match(direct.frames[0].html,/Compared with/);
  const camera={x:21,y:34,scale:.5};
  await fetch(server.url+'preferences?base=HEAD',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'asset:'+asset,view:camera})});
  assert.deepEqual((await (await fetch(server.url+'manifest?scope=asset:'+asset+'&base=HEAD')).json()).view,camera);
  assert.equal((await (await fetch(server.url+'manifest?scope=asset:'+asset)).json()).view,null);
  const state=path.join(c.root,'hub-state');await addRoot(c.root,0,state);
  const [project]=await listProjects(state),hub=await startHub({port:0,stateDirectory:state});t.after(()=>hub.close());
  const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(previewURL(`${hub.url}p/${project.slug}/`,target).href);
  await page.waitForFunction(()=>window.__adg?.ready);
  assert.equal(new URL(page.url()).searchParams.get('base'),'HEAD');
  await page.waitForFunction(()=>!window.__adg.cachePending&&window.__adg.metadataComplete);
  const manifest=await (await fetch(`${hub.url}p/${project.slug}/manifest?scope=layer:arch&base=HEAD&metadata=1&theme=light`)).json();
  assert.equal(manifest.base.rev,'HEAD');assert.notEqual(manifest.assets[0].hash,undefined);assert.deepEqual(errors,[]);
  const invalid=await (await fetch(server.url+'manifest?scope=layer:arch&base=missing-revision')).json();assert.match(invalid.error,/Unknown Git revision/);
  const revision=await page.evaluate(()=>window.__adg.revision);
  await writeFile(path.join(c.root,asset),'flowchart LR\nUpdated --> Node');
  await page.waitForFunction(revision=>window.__adg.ready&&window.__adg.revision>revision,revision);
  const updated=await (await fetch(server.url+'asset/'+encodeURIComponent(asset)+'?base=HEAD')).json();assert.match(updated.frames[0].html,/Updated/);
  const normal=await (await fetch(server.url+'asset/'+encodeURIComponent(asset))).json();assert.doesNotMatch(normal.frames[0].html,/Compared with/);
});

test('adg open prints a base locator and serves its working-tree proposal',async t=>{
  const c=await fixture(t);await writeFile(path.join(c.root,asset),'flowchart LR\nNew --> Node');
  const child=spawn(process.execPath,[cli,'open',c.root,'--asset='+asset,'--base=HEAD','--no-open','--state-dir='+path.join(c.root,'open-state')],{stdio:['ignore','pipe','pipe']});
  const exited=new Promise(resolve=>child.once('exit',resolve));
  t.after(async()=>{child.kill('SIGTERM');await exited;});
  const url=await new Promise((resolve,reject)=>{
    let text='';child.stdout.on('data',bytes=>{text+=bytes;const match=/ADG: (\S+)/.exec(text);if(match)resolve(match[1]);});
    child.stderr.on('data',bytes=>{text+=bytes;});child.once('error',reject);child.once('exit',code=>reject(Error(`open exited ${code}: ${text}`)));
  });
  assert.equal(new URL(url).searchParams.get('base'),'HEAD');
  const built=await (await fetch(new URL('asset/'+encodeURIComponent(asset)+'?base=HEAD',url))).json();assert.match(built.frames[0].html,/Compared with/);
  const health=await (await fetch(new URL('api/health',url))).json();
  const hub=await startHub({port:0,stateDirectory:path.join(c.root,'open-state')});t.after(()=>hub.close());
  const proxied=await fetch(`${hub.url}i/${health.id}/asset/${encodeURIComponent(asset)}?base=HEAD`);
  assert.equal(proxied.status,200);assert.match((await proxied.json()).frames[0].html,/Compared with/);
});
