import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {openProjectIndex} from '../src/toolkit/project-index.mjs';
import {starterTokens} from '../src/toolkit/project.mjs';
import {loadConfig} from '../src/toolkit/config.mjs';
import {launch,loadFrame} from '../src/toolkit/browser.mjs';
import {observeOwnerFrame} from '../src/toolkit/owner-observation.mjs';
import {elementIdentities} from '../src/toolkit/frame-identity.mjs';
import {collectPartSnapshot} from '../src/toolkit/part-snapshot.mjs';
import {installFramePrimitives} from '../src/toolkit/frame-observation.mjs';
import {canonicalBytes} from '../src/toolkit/impact-proof.mjs';
import {verifyInputGeneration,trackedHash} from '../src/toolkit/input-generation.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'adg-frame-core-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  async function put(name,text){const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);return file;}
  await put('adg.config.mjs','export default {};');await put('design/tokens.css',starterTokens);
  await put('design/art/mark.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0L4 4"/></svg>');
  await put('design/components/demo.tsx',`import {Frame,Icon} from 'adg';import Mark from '../art/mark.svg';import image from '../art/mark.svg?url';
  export function Control(){return <button data-adg-id="save">Save<Icon name="check"/></button>}
  export default()=> <Frame name="ready"><main><Control key={0}/><Mark width="4" height="4"/><img src={image} width="4" height="4"/></main></Frame>;`);
  return {root,put,config:await loadConfig(root)};
}

test('shared index keys exact documents, environment, policy and facet coverage, including rich-to-owner reuse',async t=>{
  const f=await fixture(t),index=await openProjectIndex(f.config,{persist:false});t.after(()=>index.close());
  const built=await index.materialize('design/components/demo.tsx'),frame=built.frames[0];let reads=0;
  const collect=async()=>({nodes:[],reads:++reads});
  const read=(b=built,env='host',options)=>index.observation('design/components/demo.tsx',b,frame,'light',env,collect,options);
  await read();await read();assert.equal(reads,1);
  await read({...built,inputHash:built.inputHash,css:built.css+'/* new document */'});assert.equal(reads,2);
  await read(built,'other');assert.equal(reads,3);
  await read(built,'host',{facets:['layout']});assert.equal(reads,4);
  await read(built,'host',{facets:['owner','identity'],policy:{viewport:200}});assert.equal(reads,5);
  const full=['a11y','color','identity','layout','owner','structure','text','typography'];
  await read(built,'rich',{facets:full});await read(built,'rich');assert.equal(reads,6);
  await read(built,null);await read(built,null);assert.equal(reads,8);
  const again=await index.materialize('design/components/demo.tsx');assert.equal(again,built,'one execution per index operation');
});

test('owner projects optional element IDs from rich shared hits without removing inspect inputs',async()=>{
  const identities=[{path:'0',parentPath:null,tag:'main',namespace:'html',owners:[],attributes:{},directText:''}];
  const saved={identities,nodes:[{path:'0'}],rich:{nodes:[]}},index={observation:async()=>saved};
  const result=await observeOwnerFrame(index,'design/demo.tsx',{}, {name:'ready'},'light','host',()=>assert.fail('rich hit loaded a frame'),[]);
  assert.equal(result.nodes[0].elementId,elementIdentities(identities,{source:'design/demo.tsx',frame:'ready'})[0].id);
  assert.equal(result.identities,identities);
});

test('shared core preserves owner observations and strict part snapshots while exposing inert identity/art metadata',async t=>{
  const f=await fixture(t),index=await openProjectIndex(f.config,{persist:false}),browser=await launch(),page=await browser.newPage();
  t.after(async()=>{await page.close();await browser.close();await index.close();});
  const built=await index.materialize('design/components/demo.tsx'),frame=built.frames[0];
  assert.match(frame.html,/data-adg-art="art\/mark.svg"/);assert.match(frame.html,/data-adg-keys/);
  const observation=await observeOwnerFrame(index,'design/components/demo.tsx',built,frame,'light',null,async()=>page,index.tokens());
  assert.ok(observation.nodes.every(n=>n.elementId));assert.ok(observation.texts.some(n=>n.raw.includes('Save')));
  await page.evaluate(installFramePrimitives);
  const snapshot=await page.evaluate(collectPartSnapshot,{selector:null,tokens:[],scale:1,ref:{source:'design/components/demo.tsx',frame:'ready'},theme:'light'});
  assert.equal(snapshot.snapshotVersion,1);assert.ok(snapshot.elements.length>4);assert.equal(snapshot.elements[0].path,'0');
  assert.ok(snapshot.elements.every(n=>!('elementId' in n)),'snapshot v1 equality is unchanged');
  assert.ok(snapshot.resources.length>0);
  // A second page/theme observes fresh nodes, while identity remains independent of presentation.
  const dark=await observeOwnerFrame(index,'design/components/demo.tsx',built,frame,'dark',null,async()=>page,index.tokens());
  assert.deepEqual(dark.nodes.map(n=>n.elementId),observation.nodes.map(n=>n.elementId));
});

test('generation verifier checks input bytes before and after fresh config evaluation',async t=>{
  const f=await fixture(t),file=await f.put('input.txt','before');
  const tracked=new Map([[file,trackedHash(Buffer.from('before'))]]);let verified=0;
  await verifyInputGeneration({tracked,views:[{index:{verifyInputs:async()=>verified++}}],code:'INSPECT_INPUT_CHANGED'});
  assert.equal(verified,1);
  await f.put('input.txt','after');
  await assert.rejects(verifyInputGeneration({tracked,views:[],code:'INSPECT_INPUT_CHANGED'}),{code:'INSPECT_INPUT_CHANGED'});
  assert.equal(verified,1);
});

test('generation verification catches a config evaluation mutating inputs without a Git session',async t=>{
  const f=await fixture(t),file=await f.put('input.txt','before');
  await f.put('adg.config.mjs',"import {writeFileSync} from 'node:fs';writeFileSync(new URL('./input.txt',import.meta.url),'after');export default {};");
  const tracked=new Map([[file,trackedHash(Buffer.from('before'))]]);
  await assert.rejects(verifyInputGeneration({tracked,verifyConfig:true,code:'INSPECT_INPUT_CHANGED',views:[{
    config:f.config,resolved:canonicalBytes(f.config),configInputs:new Set(['adg.config.mjs']),index:{verifyInputs:async()=>{}},
  }]}),{code:'INSPECT_INPUT_CHANGED'});
});
