import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { starterTokens } from '../src/toolkit/project.mjs';

const cli=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
const first='design/surfaces/first.tsx', last='design/surfaces/last.tsx', row='design/components/row.tsx';
const sidecar=first.replace('.tsx','.motion.json');
const ref=source=>({source,frame:'ready'});
const track={targets:[{part:row+'#Row',key:'save'}],properties:['y','height'],mode:'match'};
const edge={id:'show-settings',from:ref(first),to:ref(last),trigger:{on:'click',target:{anchor:'open'}},
  duration:'--duration',easing:'--ease',phases:[[track]],interrupt:'finish',reduced:'instant',focus:{target:{anchor:'open'}}};
const options=strict=>`export default {check:{lifecycle:true,strictMotion:${strict}}};`;
const handler={file:'ui.ts',symbol:'open'};
const map={version:2,mappings:[{implementation:handler,design:[{source:first},{source:last},{source:row,part:'Row'},{source:first,transition:edge.id}]}]};
const tokens=starterTokens.replace('--font-ui:', '--speed: 120ms;\n  --duration: var(--speed);\n  --ease: ease-in;\n  --font-ui:');
function consumer(t){
  const root=mkdtempSync(path.join(tmpdir(),'adg-motion-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  function put(name,value){
    const file=path.join(root,name);mkdirSync(path.dirname(file),{recursive:true});
    writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2));
  }
  function run(args,expected=0){
    const result=spawnSync(process.execPath,[cli,...args,'--json'],{cwd:root,encoding:'utf8',env:{...process.env,XDG_STATE_HOME:path.join(root,'.state')}});
    const envelope=JSON.parse(result.stdout);
    assert.equal(result.status,expected,JSON.stringify(envelope.error)+' '+result.stderr);return envelope;
  }
  const git=(...args)=>execFileSync('git',['-C',root,...args]);
  const edges=list=>put(sidecar,{version:1,edges:list});
  put('.gitignore','.state/\n');put('adg.config.mjs',options(false));put('design/tokens.css',tokens);
  put('ui.ts','export function open() {}\n');
  put(row,`import {Frame} from 'adg';export function Row({name}){return <button data-adg-id={name}>{name}</button>}export default()=> <Frame name="row"><Row name="demo"/></Frame>;`);
  for(const [file,keys] of [[first,['save','other']],[last,['other','save']]])put(file,`import {Frame} from 'adg';import {Row} from '../components/row';
    export default()=> <Frame name="ready" fixture="ready" capture={{page:true}}><main class="flex gap-2"><button data-adg-id="open">Open</button>
    {${JSON.stringify(keys)}.map(k=><Row key={k} name={k}/>)}<span data-adg-id="plain">Text</span></main></Frame>;`);
  put('design/implementation.json',map);edges([edge]);
  return {root,put,run,edges,git};
}

test('contract: keyed frames, scoped bindings, timing aliases and Git edge queries through the CLI',t=>{
  const {root,put,run,edges,git}=consumer(t);
  const check=run(['check','--read-only','--transitions']).data;
  assert.deepEqual(check.motion,{count:1,edges:[{id:edge.id}]});
  const detail=run(['inspect','--transition='+edge.id,'--explain']).data;
  assert.deepEqual(detail.findings,[]);assert.equal(detail.themes.light.timings['/duration'],120);
  assert.equal(detail.themes.light.counts.match,2);assert.equal(detail.themes.light.tracks[0].duration,120);
  assert.ok(detail.themes.light.pairs.every(p=>p.from!==p.to));assert.deepEqual(detail.themes.dark,{sameAs:'light'});
  assert.equal(run(['inspect',last,'--frame=ready','--transitions']).data.motion.edges[0].from.source,first);
  assert.equal(run(['inspect',first,'--frame=ready','--text=Text']).data.motion,undefined);
  assert.equal(run(['inspect',first,'--frame=ready','--text=Open']).data.motion.count,1);
  const binding=run(['owner','--transition='+edge.id]).data.bindings[0];
  assert.equal(binding.selector.symbol,'open');assert.equal(binding.pointer,'/mappings/0/design/3');
  assert.equal(run(['owner','--file=ui.ts','--line=1','--transitions']).data.motion.count,1);
  assert.equal(run(['owner','--part='+row+'#Row']).data.motion.count,1);
  for(const query of [['owner','--token=--speed'],['impact','--token=--speed'],['impact','--source='+row,'--part=Row'],['impact','--file=ui.ts','--symbol=open'],['impact','--source='+last]]){
    assert.equal(run([...query,'--transitions']).data.motion.count,1);
  }
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','baseline');
  const endpoint=readFileSync(path.join(root,last),'utf8');
  put(last,endpoint.replace('name="ready"','name="ready" proposed="review"'));
  assert.ok(run(['check',last,'--read-only','--impacted','--base=HEAD'],1).data.findings.some(f=>f.code==='MOTION_STATUS'));
  put(last,endpoint);
  put('design/implementation.json',{version:2,mappings:[{implementation:handler,design:[{source:first,transition:edge.id}]}]});
  const only=run(['owner','--file=ui.ts','--line=1','--transitions']);
  assert.equal(only.data.coverage.activeBindings,1);assert.deepEqual(only.warnings,[]);
  put('design/implementation.json',map);
  edges([{...edge,duration:'--missing'}]);
  const change=run(['impact','--base=HEAD','--transitions','--explain']).data;
  assert.deepEqual(change.motion.edges,[{id:edge.id,kind:'changed',reasons:['declaration']}]);
  const selected=run(['check',last,'--read-only','--impacted','--base=HEAD'],1).data;
  assert.equal(selected.summary.evaluations,0);assert.equal(selected.motion.count,1);
  assert.ok(selected.findings.some(f=>f.code==='MOTION_TOKEN'));
  edges([]);assert.equal(run(['impact','--base=HEAD','--transitions']).data.motion.edges[0].kind,'removed');
  assert.equal(run(['inspect','--transition=missing'],2).error.code,'MOTION_EDGE_NOT_FOUND');
  put(sidecar,'{');assert.equal(run(['check','--read-only'],2).data.complete,false);
  put(sidecar,{version:2,edges:[]});assert.equal(run(['check','--read-only'],2).data.complete,false);
});

test('contract: sidecar findings carry the offending ID, field, side and theme',t=>{
  const {root,put,run,edges}=consumer(t);
  const variants=[
    ['missing-frame','MOTION_FRAME_MISSING',{to:{...ref(last),frame:'gone'}}],
    ['wrong-layer','MOTION_LAYER',{to:{source:row,frame:'row'}}],
    ['unknown-token','MOTION_TOKEN',{duration:'--missing'}],
    ['bad-track-ease','MOTION_TOKEN',{phases:[[{...track,easing:'linear'}]]}],
    ['missing-trigger','MOTION_TRIGGER_MISSING',{trigger:{on:'focus',target:{anchor:'absent'}}}],
    ['unreachable-key','MOTION_TRIGGER_MISSING',{trigger:{on:'key',key:'Enter',target:{anchor:'plain'}}}],
    ['ambiguous','MOTION_IDENTITY_AMBIGUOUS',{trigger:{on:'hover',target:{part:row+'#Row'}}}],
    ['missing-target','MOTION_TARGET_MISSING',{phases:[[{...track,targets:[{anchor:'absent'}]}]]}],
    ['overlap','MOTION_TRACK_CONFLICT',{phases:[[track,track]]}],
    ['invalid-prop','MOTION_TRACK_CONFLICT',{phases:[[{...track,mode:'crossfade'}]]}],
    ['invalid-start','MOTION_SCHEMA',{phases:[[{...track,fromOpacity:0.25}]]}],
    ['bad-key','MOTION_SCHEMA',{trigger:{on:'key',target:{frame:true}}}],
    ['bad-memory','MOTION_SCHEMA',{rememberTrigger:'never'}],
    ['bad-limit','MOTION_SCHEMA',{unsupported:[{effect:'spring'}]}],
    ['missing-reduced','MOTION_REDUCED_MISSING',{reduced:undefined}],
    ['focus','MOTION_FOCUS',{focus:{target:{anchor:'plain'}}}],
    ['scope','MOTION_STATUS',{proposed:'  '}],['duplicate','MOTION_ID_CONFLICT',{}],['duplicate','MOTION_ID_CONFLICT',{}],
    ['automatic','MOTION_SCHEMA',{trigger:{on:'automatic',target:{frame:true}}}],
    ['delay','MOTION_SCHEMA',{trigger:{...edge.trigger,delay:'--speed'}}],
    ['ignore','MOTION_SCHEMA',{interrupt:'ignore'}],
    ['within','MOTION_SCHEMA',{trigger:{...edge.trigger,target:{anchor:'open',within:{frame:true}}}}],
    ['stagger','MOTION_SCHEMA',{phases:[[{...track,stagger:'--speed'}]]}],
    ['conflict','MOTION_TRIGGER_CONFLICT',{trigger:edge.trigger}],
    ['unbound','MOTION_BINDING',{proposed:undefined}],
  ];
  edges([edge,...variants.map(([id,,overrides])=>({...edge,id,proposed:'round',...overrides}))]);
  put('design/surfaces/unused.motion.json',{version:1,edges:[]});
  const internal='design/modules/menu/body.tsx';
  put(internal,`export function Body(){return <button data-adg-id="open">Open</button>}`);
  put(internal.replace('.tsx','.motion.json'),{version:1,edges:[{...edge,id:'internal-owner',from:ref(internal),to:ref(internal),phases:[],proposed:'test'}]});
  const {data}=run(['check','--read-only'],1);
  assert.ok(data.findings.some(f=>f.code==='MOTION_LAYER' && f.transition==='internal-owner'));
  rmSync(path.join(root,'design/modules'),{recursive:true});
  for(const [id,code] of variants)assert.ok(data.findings.some(f=>f.transition===id && f.code===code && f.pointer.startsWith('/edges/') && f.line>0),id+' '+code);
  assert.ok(run(['inspect','--transition='+edge.id]).data.findings.some(f=>f.code==='MOTION_TRIGGER_CONFLICT'));
  assert.ok(data.findings.some(f=>f.code==='MOTION_SCHEMA' && f.source.endsWith('unused.motion.json')));
  put('design/tokens.css',tokens.replace(':root[data-theme="dark"] {',':root[data-theme="dark"] {\n  --speed: var(--duration);'));
  edges([edge]);const invalid=run(['check','--read-only'],1).data.findings;
  assert.ok(invalid.some(f=>f.transition===edge.id && f.code==='MOTION_TOKEN' && f.theme==='dark'));
  rmSync(path.join(root,'design/surfaces/unused.motion.json'));
  put('design/tokens.css',tokens);
  for(const file of [first,last])put(file,`import {Frame} from 'adg';import {Row} from '../components/row';export default()=> <Frame name="ready" fixture="ready" capture={{page:true}}>
    <main class="flex gap-2"><button data-adg-id="open">Open</button><Row name="a"/><Row name="b"/></main></Frame>`);
  edges([{...edge,phases:[],rememberTrigger:true,unsupported:[{effect:'topology-spring',reason:'Velocity depends on history.'}]}]);
  const advisory=run(['check','--read-only']);
  assert.ok(advisory.warnings.some(w=>w.code==='MOTION_IMPLICIT_FADE'));
  assert.ok(advisory.warnings.some(w=>w.code==='MOTION_UNSUPPORTED'));
  edges([]);assert.ok(run(['check','--read-only'],1).data.findings.some(f=>f.code==='MOTION_BINDING'));
  put('design/implementation.json',{version:1,mappings:map.mappings});
  assert.equal(run(['check','--read-only'],2).error.code,'OWNER_MAP_INVALID');
});

test('contract: nested keyed scopes, replacement paint claims and native input eligibility',t=>{
  const {put,run,edges}=consumer(t);
  for(const file of [first,last])put(file,`import {Frame} from 'adg';import {Row} from '../components/row';
    export default()=> <Frame name="ready" fixture="ready" capture={{page:true}}><main><details open><summary data-adg-id="open">Show</summary></details>
    <section key="parent" data-adg-id="content"><Row key="child" name="child"/></section>
    <div style={{overflow:'hidden',height:'0px'}}><button data-adg-id="clipped">Hidden</button></div></main></Frame>;`);
  const incoming={targets:[{anchor:'content'}],properties:['opacity'],mode:'enter',fromOpacity:0.25};
  edges([{...edge,trigger:{on:'focus',target:{anchor:'open'}},phases:[[incoming]]}]);
  const replaced=run(['inspect','--transition='+edge.id,'--explain']).data;
  assert.deepEqual(replaced.findings,[]);assert.equal(replaced.themes.light.pairs.length,0);
  edges([{...edge,trigger:{on:'click',target:{anchor:'clipped'}},phases:[[incoming,{...track,mode:'exit',properties:['opacity'],targets:[{part:row+'#Row',key:'child'}]}]]}]);
  const rejected=run(['check','--read-only'],1).data.findings;
  for(const code of ['MOTION_TRIGGER_MISSING','MOTION_TRACK_CONFLICT'])assert.ok(rejected.some(f=>f.code===code),code);
  edges([{...edge,trigger:{on:'focus',target:{part:row+'#Row',key:'parent'}},phases:[]}]);
  assert.ok(run(['check','--read-only'],1).data.findings.some(f=>f.code==='MOTION_TRIGGER_MISSING'));
});

test('contract: rollout governs hidden and variant utilities, inline timings, shorthands and both themes without a sidecar',t=>{
  const {root,put,run,git}=consumer(t);
  rmSync(path.join(root,sidecar));rmSync(path.join(root,'design/implementation.json'));
  put('design/tokens.css',tokens.replace(':root[data-theme="dark"] {',':root[data-theme="dark"] {\n  --speed: red;'));
  put(row,`import {Frame} from 'adg';export function Row(){return <div/>}
    export default()=>[<Frame name="css"><div data-free><span class="hidden animate-spin hover:duration-150 transition-opacity delay-75 ease-linear"/>
      <b style={{animationDuration:'0ms',animationDelay:'3ms',animationTimingFunction:'ease-in',transition:'opacity var(--duration) var(--ease), color 21ms linear',animation:'demo 30ms ease',transitionDuration:'var(--duration)'}}/></div></Frame>,
      <Frame name="clean"><span class="duration-(--speed)"/></Frame>];`);
  const warn=run(['check',row,'--read-only']).warnings.filter(w=>w.code==='MOTION_SOURCE_CSS');
  for(const word of ['animate-spin','duration-150','transition-opacity','delay-75','ease-linear','0ms','3ms','21ms','30ms','animation-timing-function'])
    assert.ok(warn.some(w=>w.message.includes(word)),word);
  git('init','-q');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','legacy CSS');
  put('adg.config.mjs',options(true));
  assert.ok(run(['check',row,'--read-only','--impacted','--base=HEAD'],1).data.findings.some(f=>f.code==='MOTION_SOURCE_CSS'));
  const fs=run(['check',row,'--read-only'],1).data.findings.filter(f=>f.code==='MOTION_SOURCE_CSS');
  assert.ok(fs.some(f=>f.frame==='clean' && f.theme==='dark'));
  assert.ok(!fs.some(f=>f.frame==='clean' && f.theme==='light'));
});
