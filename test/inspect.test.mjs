import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseCli,main,commands} from '../src/cli.mjs';
import {inspect} from '../src/toolkit/inspect.mjs';
import {loadConfig} from '../src/toolkit/config.mjs';
import {openProjectIndex} from '../src/toolkit/project-index.mjs';
import {starterTokens} from '../src/toolkit/project.mjs';
import {auditInspection,corruptInspection} from '../tooling/inspect-audit.mjs';
import {nextActions,createOutput,CliError} from '../src/cli-output.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(tmpdir(),'adg-inspect-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const put=async(name,text)=>{const file=path.join(root,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
  await put('adg.config.mjs','export default {};');
  await put('design/tokens.css',starterTokens.replace('--text: #171717;','--text: #171717;\n--accent: #336699;\n--alias: var(--accent);'));
  await put('design/art/mark.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path d="M0 0L4 4"/></svg>');
  await put('design/components/control.tsx',`import {Frame,Icon} from 'adg';import Mark from '../art/mark.svg';import image from '../art/mark.svg?url';
export function Control(){return <button data-adg-id="save" class="text-accent font-semibold">Save <Icon name="check"/></button>}
export default()=>[<Frame name="ready"><main class="flex gap-4 p-4 text-text"><Control key="save"/><label for="input">Name</label><input id="input" placeholder="Type"/><input type="password" value="private-value"/><div class="dark:hidden">Light only</div><div><span>Find</span> me</div><Mark width="4" height="4"/><img src={image} width="4" height="4"/><span class="before:content-['!'] before:text-accent">Alert</span></main></Frame>,<Frame name="other"><div>Other</div></Frame>];`);
  await put('design/surfaces/view.tsx',`import {Frame} from 'adg';export default()=> <Frame name="ready"><div>View</div></Frame>;`);
  return {root,put,config:await loadConfig(root),state:path.join(root,'state')};
}
const sceneList=data=>[data.baseline,...Object.values(data.additionalThemes)].filter(Boolean);

test('inspect parser enforces one selector and finite options without public audit/expand flags',()=>{
  assert.ok(commands.includes('inspect'));
  assert.equal(parseCli(['inspect','--text=Save','--contains','--depth=0','--fields=text,layout']).values.depth,'0');
  for(const args of [['--audit'],['--expand'],['--text=a','--part=x#A'],['--contains'],['--frame=a','--frame=b'],['--depth=-1'],['--depth=1.2'],['--fields='],['--fields=foo'],['--theme=bad'],['--wrappers=bad'],['one','two']])assert.throws(()=>parseCli(['inspect',...args]),{code:'USAGE_INVALID'});
  assert.deepEqual(parseCli(['inspect','--','--json']).positionals,['--json']);
  const retry=nextActions('INSPECT_ELEMENT_NOT_FOUND',{command:'inspect',positionals:['design/components/control.tsx'],values:{frame:'ready',element:'stale',depth:'1',theme:'dark'}})[0].argv;
  assert.deepEqual(retry,['adg','inspect','--frame=ready','--theme=dark','--json','--','design/components/control.tsx']);
  assert.equal(parseCli(retry.slice(1)).command,'inspect');
});

test('catalog has no browser; ambiguity and usage errors use one schema-v1 envelope',async t=>{
  const f=await fixture(t);const result=await inspect(f.config,[],{json:true,'state-dir':f.state},{launchBrowser:async()=>assert.fail('catalog launched browser')});
  assert.equal(result.data.mode,'catalog');assert.equal(result.data.catalog.length,2);assert.equal(result.data.coverage.completedObservations,0);
  await assert.rejects(inspect(f.config,[],{frame:'ready',json:true,'state-dir':f.state}),error=>{
    assert.equal(error.code,'INSPECT_FRAME_AMBIGUOUS');const actions=nextActions(error.code,{command:'inspect',values:{frame:'ready'},...error.context});
    assert.equal(actions.length,2);assert.ok(actions.every(a=>parseCli(a.argv.slice(1)).positionals.length===1));return true;
  });
  await assert.rejects(inspect(f.config,[],{theme:'dark',json:true,'state-dir':f.state}),{code:'USAGE_INVALID'});
  const out={stdout:'',stderr:'',exit:null};await main(['inspect','--audit','--json'],f.root,{stdout:s=>out.stdout+=s,stderr:s=>out.stderr+=s,exit:n=>out.exit=n});
  assert.equal(out.exit,2);assert.equal(out.stdout.trim().split('\n').length,1);assert.equal(JSON.parse(out.stdout).command,'inspect');assert.equal(JSON.parse(out.stdout).error.code,'USAGE_INVALID');
});

test('rich shared collection, AX, selectors, warm reuse, generation checks and live audit agree end to end',async t=>{
  const f=await fixture(t),source='design/components/control.tsx';
  const run=extra=>inspect(f.config,[source],{frame:'ready',json:true,'state-dir':f.state,...extra});
  const result=await run({}),data=result.data;
  assert.equal(data.complete,true);assert.equal(data.encoding,'expanded');assert.equal(data.coverage.frameLoads,2);
  assert.ok(!JSON.stringify(data).includes('private-value'));assert.ok(!JSON.stringify(data).includes('data:image/'));
  assert.equal(data.baseline.elements.find(e=>e.tag==='button').role,'button');
  assert.equal(data.baseline.elements.find(e=>e.tag==='button').name,'Save');
  assert.ok(Object.values(data.tables.resources).some(r=>r.source==='design/art/mark.svg'));
  assert.ok(Object.values(data.tables.references).some(r=>r.token==='--accent'));
  const audit=await auditInspection(data,{config:f.config});assert.deepEqual(audit.findings,[]);assert.ok(audit.checked.properties>100);assert.ok(audit.excluded.some(x=>x.code==='PSEUDO_BOX_UNAVAILABLE'));
  const noLimitations=structuredClone(data);noLimitations.limitations=[];assert.ok((await auditInspection(noLimitations,{config:f.config})).findings.some(f=>f.property==='missing_limitation'));
  for(const kind of ['box','inherited-style','token-scope','theme']){
    const broken=await auditInspection(corruptInspection(data,kind),{config:f.config});assert.ok(broken.findings.length>0,kind+' corruption escaped live verification');
  }
  const warm=await run({});assert.equal(warm.data.coverage.frameLoads,0);assert.equal(warm.data.coverage.cacheHits,2);assert.equal(warm.data.coverage.materializedSources,1);
  const id=data.baseline.elements.find(e=>e.tag==='button').id;
  const element=(await run({element:id,depth:'0'})).data;assert.ok(element.baseline.context.length);assert.equal(element.baseline.elements.length,1);assert.ok(element.baseline.elements[0].cutoff);
  const part=(await run({part:source+'#Control'})).data;assert.equal(part.matches.length,1);assert.equal(part.baseline.roots[0],id);
  const text=(await run({text:'Save '})).data;assert.equal(text.matches[0].element,id);
  const inline=(await run({text:'Find me'})).data;assert.equal(inline.matches.length,1);assert.equal(inline.matches[0].runs.length,2);
  const fields=(await run({fields:'structure,text',text:'ave',contains:true})).data;assert.ok(fields.baseline.runs.length);assert.ok(fields.baseline.elements.every(e=>!e.geometry&&!e.style));
  await assert.rejects(run({element:'e1_missing'}),{code:'INSPECT_ELEMENT_NOT_FOUND'});
  await assert.rejects(run({part:source+'#Missing'}),{code:'INSPECT_PART_NOT_FOUND'});
  const empty=await run({text:'not present'});assert.equal(empty.data.baseline.elements.length,0);assert.ok(empty.warnings.some(w=>w.code==='INSPECT_NO_MATCH'));
  // Fresh execution must defeat executed-payload caching when only runtime state changes.
  await f.put(source,await readFile(path.join(f.root,source),'utf8').then(s=>s.replace('Save <Icon','Changed <Icon')));
  const changed=await run({});assert.equal(changed.data.coverage.frameLoads,2);assert.ok(changed.data.baseline.runs.some(r=>r.raw.includes('Changed')));
});

test('unique-frame defaults, literal-only text, selective fields, execution failures and cache bypass',async t=>{
  const f=await fixture(t),source='design/surfaces/view.tsx';
  const initial=await inspect(f.config,[source],{json:true,'state-dir':f.state});assert.equal(initial.data.mode,'frame');assert.equal(initial.data.frame.name,'ready');
  await f.put(source,"import {Frame} from 'adg';export default()=> <Frame name='ready'><main><span class='uppercase'>mixed Case</span><canvas width='4' height='4'/></main></Frame>;");
  const run=()=>inspect(f.config,[source],{json:true,'state-dir':f.state});
  const one=await run(),two=await run();assert.equal(two.data.coverage.cacheHits,0);assert.equal(two.data.coverage.frameLoads,2);
  assert.ok(two.warnings.some(w=>w.code==='INSPECT_CACHE_BYPASSED'));
  assert.ok(one.data.baseline.runs.some(r=>r.raw==='mixed Case'&&r.normalized==='mixed Case'&&!('rendered'in r)));
  await f.put(source,'not valid TSX !');await assert.rejects(run(),error=>{assert.equal(error.code,'SOURCE_BUILD_FAILED');return true;});
});

test('concurrent generation edits cannot return complete inspection or a successful exit',async t=>{
  const f=await fixture(t);
  await assert.rejects(inspect(f.config,['design/surfaces/view.tsx'],{json:true,'state-dir':f.state},{openIndex:async(config,options)=>{
    const index=await openProjectIndex(config,options);
    return {...index,verifyInputs:async()=>{await f.put('design/tokens.css',starterTokens.replace('#171717','#222222'));await index.verifyInputs();}};
  }}),error=>{assert.equal(error.code,'INSPECT_INPUT_CHANGED');assert.equal(error.data.complete,false);return true;});
});
