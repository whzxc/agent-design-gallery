import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { attributes } from '../src/toolkit/runtime.mjs';
import { resolveMedia } from '../src/publish/media.mjs';
import { carryAnchors } from '../src/publish/anchors.mjs';
import { deriveDocuments, contentHash, measureDocuments } from '../src/publish/documents.mjs';
import { doopClient } from '../src/publish/doop.mjs';
import { publish } from '../src/publish/index.mjs';
import { main, parseCli } from '../src/cli.mjs';
const exec = promisify(execFile);
const source = (label = 'Save', extra = '') => `import {Frame} from 'adg';export default()=>[<Frame name="ready" width={180} note="Source note"><button>${label}</button></Frame>,<Frame name="pending" proposed="Review"><div>Pending</div></Frame>${extra}];`;
async function project(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'adg-publish-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ['components','modules/feature','surfaces']) await mkdir(path.join(root,'design',folder), { recursive:true });
  await writeFile(path.join(root,'adg.config.mjs'), 'export default {};');
  await writeFile(path.join(root,'design/tokens.css'), starterTokens);
  await writeFile(path.join(root,'design/components/button.tsx'), source());
  await writeFile(path.join(root,'design/modules/feature/index.tsx'), source('Module'));
  await writeFile(path.join(root,'design/modules/feature/helper.tsx'), 'export const value=1;');
  await writeFile(path.join(root,'design/surfaces/home.tsx'), `import {Frame} from 'adg';export default()=>[<Frame name="desktop" width={1200} height={800}><div class="portrait:hidden">Home</div></Frame>,<Frame name="mobile" width={390} height={844}><div>Mobile</div></Frame>];`);
  const git = (...args) => exec('git', ['-C',root,...args]);
  await git('init','-b','main'); await git('config','user.email','test@example.test'); await git('config','user.name','ADG Test');
  await git('add','.'); await git('commit','-m','test: initial library');
  const state = await mkdtemp(path.join(tmpdir(), 'adg-publish-state-'));
  t.after(() => rm(state, { recursive:true, force:true }));
  return { root, state, git, config: await loadConfig(root) };
}
async function fakeDoop(t, { sse = false } = {}) {
  let seq=0; const frames=new Map(), calls=[], canvases=new Map(), comments=new Map();
  const newId=()=>`id${++seq}`;
  const server=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const message=JSON.parse(req.headers['content-encoding'] === 'gzip' ? gunzipSync(Buffer.concat(chunks)) : Buffer.concat(chunks)), {name,arguments:a}=message.params;
    calls.push({name,args:a});
    assert.equal(req.headers.authorization,'Bearer test-key');
    let value;
    const canvas=canvases.get(a.canvas_id);
    switch(name){
      case 'create_canvas': { const id=newId();value={id};canvases.set(id,{id,name:a.name,pages:[{id:newId(),name:'Page 1'}]});break; }
      case 'get_canvas': value={...canvas,frames:[...frames.values()].filter(f=>f.canvas_id===a.canvas_id)};break;
      case 'set_guidelines': canvas.guidelines=a.markdown;value={ok:true};break;
      case 'create_canvas_page': value={id:newId(),name:a.name};canvas.pages.push(value);break;
      case 'set_canvas_pages': assert.deepEqual(a.expectedPages,canvas.pages);canvas.pages=a.pages;value={ok:true};break;
      case 'create_frame': value={id:newId(),...a};frames.set(value.id,value);break;
      case 'get_frame': value=frames.get(a.frame_id);break;
      case 'set_frame_html': frames.get(a.frame_id).html=a.html;value={ok:true};break;
      case 'update_frame': Object.assign(frames.get(a.frame_id),a);value={ok:true};break;
      case 'get_comments': value=comments.get(a.frame_id)??[];break;
      case 'delete_frame': frames.delete(a.frame_id);value={ok:true};break;
      default: throw Error(`Unexpected MCP tool ${name}`);
    }
    const result=JSON.stringify({jsonrpc:'2.0',id:message.id,result:{structuredContent:{canvas:{id:'preview-only'}},content:[{type:'text',text:JSON.stringify(value)}]}});
    res.writeHead(200,{'content-type':sse?'text/event-stream':'application/json'});
    res.end(sse?`event: message\ndata: ${result}\n\n`:result);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return {frames,calls,canvases,comments,client:doopClient({url:`http://127.0.0.1:${server.address().port}`,key:'test-key'})};
}
const measure = async docs => { for(const doc of docs){doc.width??=180;doc.height??=300;} };

test('runtime omits nullish/false style values and keeps zero',()=>{
  assert.equal(attributes({style:{width:0,height:undefined,top:null,left:false,opacity:0,'--x':false}}),' style="width:0px;opacity:0"');
});
test('viewport resolution handles nesting, ranges, lists, equality, units and retained preferences',()=>{
  const css='@media (orientation:portrait){.bad{color:red}}@media (width >= 80rem){.wide{color:blue}@media (height < 901px){.nested{display:block}}}@media (min-width:1440px) and (prefers-reduced-motion:reduce){.pref{animation:none}}@media (width:1440px){.equal{display:block}}@media (400px < width < 1600px){.range{display:block}}@media (width < 10px), (height >= 900px){.list{display:block}}';
  const out=resolveMedia(css);
  assert.doesNotMatch(out,/\.bad|orientation|width|height|80rem/);
  for(const name of ['wide','nested','pref','equal','range','list'])assert.ok(out.includes(`.${name}`),out);
  assert.match(out,/@media \(prefers-reduced-motion:reduce\)/);
  assert.equal(resolveMedia('@media screen and (width > 1000px), print and (height > 1px){.types{display:block}}'), '@media screen,print{.types{display:block}}');
  assert.equal(resolveMedia('@media screen and (width > 1000px){.screen{display:block}}'), '@media screen{.screen{display:block}}');
  assert.match(resolveMedia('@media not (width < 800px){.a{display:block}}'),/\.a/);
  assert.doesNotMatch(resolveMedia('@media (width > 500px){.a{display:block}}',{width:390,height:844}),/\.a/);
});
test('anchors follow specimen identities across reorder; missing/ambiguous paths are reported',()=>{
  const old='<main><section data-specimen="a#one"><button data-doop-id="comment">Old</button><i data-doop-id="removed"></i></section><section data-specimen="b#two"><b data-doop-id="other">B</b></section></main>';
  const next='<main><section data-specimen="b#two"><b>New B</b></section><section data-specimen="a#one"><button>New</button></section></main>';
  const result=carryAnchors(old,next);
  assert.match(result.html,/<button data-doop-id="comment">New/);assert.match(result.html,/<b data-doop-id="other">/);
  assert.deepEqual(result.orphaned.map(a=>a.id),['removed']);
  assert.deepEqual(carryAnchors(old,'<main/>').orphaned.map(a=>a.id),['comment','removed','other']);
  assert.equal(carryAnchors(old,next+next).kept.length,0);
  assert.equal(carryAnchors('<div data-specimen="x" data-doop-id="root"></div>','<div data-specimen="x"></div>').kept.length,1);
});
test('derivation creates layer sheets, module indexes, surfaces, tokens and standalone identity without writes',async t=>{
  const {root,config,git}=await project(t);const before=(await git('status','--porcelain','--untracked-files=all')).stdout;
  const docs=await deriveDocuments(config,'rev');
  assert.deepEqual(docs.map(d=>[d.layer,d.kind]),[['Tokens','board'],['Components','board'],['Modules','board'],['Surfaces','surface'],['Surfaces','surface']]);
  assert.equal(docs[1].name,'Components');assert.ok(docs[1].html.indexOf('>ready<')<docs[1].html.indexOf('>pending<'));
  assert.match(docs[1].html,/Source note/);assert.match(docs[1].html,/Proposed: Review/);
  assert.match(docs[1].html,/data-specimen="design\/components\/button.tsx#ready"/);
  assert.match(docs[0].html,/Families/);assert.match(docs[0].html,/Colour/);assert.match(docs[0].html,/#ffffff/);assert.match(docs[0].html,/#171717/);
  assert.match(docs[1].html,/adg-provenance/);assert.match(docs[3].html,/@media[^{}]*orientation: portrait/);

  assert.equal(docs[3].width,1200);assert.equal(docs[4].height,844);
  assert.equal(contentHash(docs[1].html),contentHash(docs[1].html.replace('rev&quot;','other&quot;')));
  assert.equal((await git('status','--porcelain','--untracked-files=all')).stdout,before);
  assert.deepEqual(await readdir(root),['.git','adg.config.mjs','design']);
});
test('fake MCP publishing skips hashes, preserves anchors, reports orphans and deletes sources',async t=>{
  const p=await project(t),remote=await fakeDoop(t,{sse:true});const run=()=>publish(p.config,{'state-dir':p.state},{client:remote.client,measure});
  const first=await run();assert.deepEqual(first.data.summary,{created:5,updated:0,skipped:0,removed:0});
  assert.deepEqual(first.data.pages.map(p=>p.name),['Tokens','Components','Modules','Surfaces']);
  const second=await run();assert.equal(second.data.summary.skipped,5);
  const statePath = path.join(p.state, 'publish', (await readdir(path.join(p.state, 'publish')))[0]);
  const interrupted = JSON.parse(await readFile(statePath, 'utf8'));
  const interruptedId = interrupted.documents.default['chapter:directory:components:1'].id;
  delete interrupted.documents.default['chapter:directory:components:1'];
  await writeFile(statePath, JSON.stringify(interrupted));
  const recovered = await run();
  assert.equal(recovered.data.documents.find(d => d.source === 'design/components/button.tsx').frameId, interruptedId);
  assert.equal(remote.frames.size, 5);
  const sheet=first.data.documents.find(d=>d.source==='design/components/button.tsx'), f=remote.frames.get(sheet.frameId);
  f.html=f.html.replace('<button>Save','<button data-doop-id="keep">Save').replace('>Pending</div>',' data-doop-id="gone">Pending</div>');
  remote.comments.set(f.id,[{id:'comment1',elementId:'keep'},{id:'comment2',elementId:'gone'}]);
  await writeFile(path.join(p.config.design,'components/button.tsx'), `import {Frame} from 'adg';export default()=> <Frame name="ready" width={180}><button>Changed</button></Frame>;`);
  const changed=await run();assert.equal(changed.data.summary.updated,1);assert.match(remote.frames.get(f.id).html,/data-doop-id="keep"/);
  assert.deepEqual(changed.data.orphaned.map(a=>a.id),['gone']);assert.equal(changed.warnings[0].code,'PUBLISH_ORPHANED_ANCHORS');
  await rm(path.join(p.config.design,'components/button.tsx'));
  const removed=await run();assert.equal(removed.data.summary.removed,1);assert.equal(removed.data.removed[0].comments.length,2);assert.equal(remote.frames.has(f.id),false);
  const states=await readdir(path.join(p.state,'publish'));assert.equal(states.length,1);
});
test('drafts select changed content against merge base, preserve layer pages and retire after merge',async t=>{
  const p=await project(t), remote=await fakeDoop(t);const run=()=>publish(p.config,{'state-dir':p.state},{client:remote.client,measure});
  const base=await run(), baseHtml=new Map([...remote.frames].map(([id,f])=>[id,f.html]));
  await p.git('checkout','-b','feature/draft');
  await writeFile(path.join(p.config.design,'components/button.tsx'),source('Draft'));
  await p.git('add','.');await p.git('commit','-m','test: draft');
  const draft=await run();assert.equal(draft.data.branch.draft,true);assert.equal(draft.data.documents.length,1);
  assert.equal(draft.data.pages.at(-1).name,'Draft: feature/draft');
  for(const [id,html]of baseHtml)assert.equal(remote.frames.get(id).html,html);
  assert.equal((await run()).data.summary.skipped,1);
  await p.git('checkout','main');await p.git('merge','--ff-only','feature/draft');
  const merged=await run();assert.deepEqual(merged.data.removedDrafts,['feature/draft']);assert.equal(merged.data.pages.length,4);
  assert.equal(remote.frames.size,base.data.documents.length);
});
test('credentials, unreachable Doop, CLI envelope and option validation are actionable',async t=>{
  const p=await project(t);
  assert.throws(()=>doopClient({url:'',key:''}),{code:'PUBLISH_CREDENTIALS_MISSING'});
  const dead=doopClient({url:'http://127.0.0.1:1',key:'test-key'});
  await assert.rejects(dead.call('get_canvas'),{code:'PUBLISH_UNREACHABLE'});
  const denied=doopClient({url:'http://127.0.0.1',key:'test-key',fetch:async()=>new Response('',{status:401})});
  await assert.rejects(denied.call('get_canvas'),{code:'PUBLISH_AUTH_FAILED'});
  const env={url:process.env.DOOP_URL,key:process.env.DOOP_AGENT_KEY};
  delete process.env.DOOP_URL;delete process.env.DOOP_AGENT_KEY;
  try{let output='';const code=await main(['publish',p.root,'--json'],p.root,{stdout:s=>{output+=s},stderr:()=>{},exit:()=>{}});const result=JSON.parse(output);assert.equal(code,2);assert.equal(result.schemaVersion,1);assert.equal(result.command,'publish');assert.equal(result.error.code,'PUBLISH_CREDENTIALS_MISSING');assert.ok(result.error.next.length);}
  finally{if(env.url!==undefined)process.env.DOOP_URL=env.url;if(env.key!==undefined)process.env.DOOP_AGENT_KEY=env.key;}
  assert.throws(()=>parseCli(['publish','a','b']),{code:'USAGE_INVALID'});
});
test('CLI publishes through the fake MCP endpoint with one versioned success envelope', async t => {
  const p = await project(t), remote = await fakeDoop(t);
  const old = { url: process.env.DOOP_URL, key: process.env.DOOP_AGENT_KEY };
  process.env.DOOP_URL = remote.client.origin; process.env.DOOP_AGENT_KEY = 'test-key';
  try {
    let stdout = '', stderr = '';
    const code = await main(['publish', p.root, `--state-dir=${p.state}`, '--json'], p.root,
      { stdout: value => { stdout += value; }, stderr: value => { stderr += value; }, exit: () => {} });
    const result = JSON.parse(stdout);
    assert.equal(code, 0); assert.equal(result.schemaVersion, 1); assert.equal(result.ok, true);
    assert.equal(result.data.summary.created, 5); assert.equal(result.data.complete, true);
    assert.equal(stdout.trim().split('\n').length, 1); assert.equal(stderr, '');
    assert.doesNotMatch(stdout, /test-key/);
  } finally {
    if (old.url === undefined) delete process.env.DOOP_URL; else process.env.DOOP_URL = old.url;
    if (old.key === undefined) delete process.env.DOOP_AGENT_KEY; else process.env.DOOP_AGENT_KEY = old.key;
  }
});

test('draft dependency changes, deletions and reverted documents reconcile only the draft', async t => {
  const p = await project(t), remote = await fakeDoop(t);
  await writeFile(path.join(p.config.design, 'modules/feature/helper.tsx'), "export const label = 'Original';");
  await writeFile(path.join(p.config.design, 'modules/feature/index.tsx'), "import {Frame} from 'adg';import {label} from './helper';export default()=> <Frame name=\"ready\"><div>{label}</div></Frame>;");
  await p.git('add', '.'); await p.git('commit', '-m', 'test: shared helper');
  const run = () => publish(p.config, {'state-dir':p.state}, {client:remote.client, measure});
  await run(); await p.git('checkout', '-b', 'helper-draft');
  await writeFile(path.join(p.config.design, 'modules/feature/helper.tsx'), "export const label = 'Changed';");
  const draft = await run();
  assert.deepEqual(draft.data.documents.map(d => d.source), ['design/modules/feature/index.tsx']);
  await p.git('restore', 'design/modules/feature/helper.tsx');
  const reverted = await run(); assert.equal(reverted.data.documents.length, 0); assert.equal(reverted.data.summary.removed, 1);
  await rm(path.join(p.config.design, 'components/button.tsx'));
  const deleted = await run(); assert.equal(deleted.data.documents.length, 0);
  assert.equal([...remote.frames.values()].filter(f => f.name === 'Components').length, 1);
});

test('real local Chromium measures sheet flow and surface viewports without network',async t=>{
  const p=await project(t),docs=await deriveDocuments(p.config,'rev');
  await measureDocuments(docs);
  assert.equal(docs[1].width,1680);assert.ok(docs[1].height>100);
  assert.equal(docs[3].width,1200);assert.equal(docs[3].height,800);
});
