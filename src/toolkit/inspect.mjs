import path from 'node:path';
import { CliError, nextActions } from '../cli-output.mjs';
import { openProjectIndex } from './project-index.mjs';
import { selectSources, relative } from './project.mjs';
import { observationEnvironment } from './owner-observation.mjs';
import { launch, browserTask } from './browser.mjs';
import { observeInspectFrame } from './inspect-observation.mjs';
import { outputTables, projectInspection, pruneTables, fieldGroups } from './inspect-output.mjs';
import { compactInspection, expandInspection } from './inspect-encoding.mjs';
import { createEligibilityChecker } from './impact-eligibility.mjs';
import { canonicalBytes, capturePolicy } from './impact-proof.mjs';
import { frameDocument } from './frame-document.mjs';
import { configInputFiles, inputBytes, trackedHash, verifyInputGeneration } from './input-generation.mjs';
import { commandFailure, cleanup } from './results.mjs';

export function inspectSelection(values) {
  const subtree=['part','element','text'].find(k=>values[k]!==undefined);
  return {source:null,frame:values.frame??null,themes:values.theme&&values.theme!=='both'?[values.theme]:['light','dark'],
    subtree:subtree?{kind:subtree,input:values[subtree],contains:!!values.contains}:null,
    depth:values.depth===undefined||values.depth==='all'?null:Number(values.depth),
    fields:values.fields?fieldGroups.filter(k=>values.fields.split(',').includes(k)):[...fieldGroups],wrappers:values.wrappers??'semantic',expand:!!values.expand};
}

export async function inspect(config, args=[], values={}, {log=console.log, openIndex=openProjectIndex, launchBrowser=launch, environment=observationEnvironment}={}) {
  const resolvedConfig=canonicalBytes(config);
  const start=performance.now(),selection=inspectSelection(values),warnings=[],tracked=new Map();
  let data={inspectVersion:1,identityVersion:1,project:config.root,complete:false,mode:'catalog',encoding:'expanded',selection,catalog:[],frame:null,
    baselineTheme:null,baseline:null,delta:null,additionalThemes:{},tables:{values:{},styles:{},tokens:{},references:{},parts:{},templates:{},resources:{}},partInstances:[],matches:[],limitations:[],
    coverage:{domain:'tsx',discoveredSources:0,listedFrames:0,requestedObservations:0,completedObservations:0,rawElements:0,retainedElements:0,collapsedElements:0,cutOffElements:0,logicalElements:0,runs:0,cacheHits:0,frameLoads:0,materializedSources:0},
    timings:{prepareMs:0,materializeMs:0,observeMs:0,projectMs:0,totalMs:0}};
  let index,browser,page,primary;
  const warn=(code,message,next=[])=>{if(!warnings.some(w=>w.code===code))warnings.push({code,message,next});};
  const retry=(reason,full=false)=>nextActions(full?'INSPECT_ELEMENT_NOT_FOUND':'INSPECT_UNSETTLED',{command:'inspect',values,positionals:args}).map(n=>({...n,reason}));
  const timed=async(key,fn)=>{const begin=performance.now();try{return await fn();}finally{data.timings[key]+=performance.now()-begin;}};
  const getPage=async()=>{browser??=await launchBrowser();page??=await browserTask(browser,()=>browser.newPage({locale:'en-US',timezoneId:'UTC',deviceScaleFactor:1}));return page;};
  try {
    const files=await configInputFiles(config),configInputs=new Set(files.map(f=>relative(config,f)));
    for(const file of [...files,path.join(config.design,'tokens.css')])tracked.set(file,trackedHash(await inputBytes(file)));
    index=await openIndex(config,{stateDirectory:values['state-dir'],fresh:true});data.coverage.discoveredSources=index.inventory.tsx.length;
    let sources=index.inventory.tsx;
    await timed('prepareMs',async()=>{
      if(args.length){
        if(/\.(?:mmd|svg|png|jpe?g|webp)$/.test(args[0]))throw new CliError('INSPECT_SOURCE_UNSUPPORTED','Choose a discovered TSX source.');
        const selected=selectSources(config,args,{write:false});
        if(selected.length!==1||!selected[0].endsWith('.tsx'))throw new CliError('INSPECT_SOURCE_UNSUPPORTED','Choose one TSX entry, not a source directory.');
        sources=[relative(config,selected[0])];selection.source=sources[0];
      }
      const facts=await Promise.all(sources.map(async source=>{try{return args.length?await timed('materializeMs',()=>index.source(source,{fresh:true})):await index.source(source);}catch(cause){throw cause instanceof CliError?cause:new CliError('SOURCE_BUILD_FAILED',cause.message,{cause});}}));
      data.catalog=facts.map(f=>({source:f.source,frames:f.frames.map(f=>({name:f.name,locale:f.locale??null,width:f.width??null,height:f.height??null}))}));
      data.coverage.listedFrames=data.catalog.reduce((n,s)=>n+s.frames.length,0);
    });
    if(args.length)data.timings.prepareMs-=data.timings.materializeMs;
    const candidates=data.catalog.flatMap(s=>s.frames.filter(f=>!values.frame||f.name===values.frame).map(f=>({source:s.source,frame:f.name})));
    if(values.frame && !candidates.length)throw new CliError('FRAME_NOT_FOUND',`Unknown frame ${values.frame}.`);
    if(values.frame && candidates.length>1)throw new CliError('INSPECT_FRAME_AMBIGUOUS',`Frame ${values.frame} occurs in ${candidates.length} sources: ${candidates.map(c=>c.source).join(', ')}.`,{context:{inspectSources:candidates.map(c=>c.source)}});
    if(!values.frame && candidates.length!==1){
      if(['theme','part','element','text','contains','depth','fields','wrappers','expand'].some(k=>values[k]!==undefined))throw new CliError('USAGE_INVALID','Choose a unique frame before setting frame-only options.',{context:{inspectCatalog:true}});
      if(!candidates.length)warn('EMPTY_SELECTION','No TSX frames were discovered.');
    } else {
      const chosen=candidates[0];selection.source=chosen.source;selection.frame=chosen.frame;
      const built=await timed('materializeMs',async()=>{try{return await index.materialize(chosen.source);}catch(cause){throw cause instanceof CliError?cause:new CliError('SOURCE_BUILD_FAILED',cause.message,{cause});}});data.coverage.materializedSources=1;
      const frame=built.frames.find(f=>f.name===chosen.frame);
      if(!frame)throw new CliError('INSPECT_INPUT_CHANGED','The selected frame disappeared during fresh execution.');
      data.frame={source:chosen.source,name:frame.name,locale:frame.locale??null,authored:{width:frame.width??null,height:frame.height??null},parent:frame.parent??null};
      data.mode='frame';data.catalog=[];
      if(selection.subtree?.kind==='part'){
        const input=selection.subtree.input,separator=input.lastIndexOf('#');
        if(separator<=0||separator===input.length-1)throw new CliError('USAGE_INVALID','Use --part=<defining-source>#<Export>.');
        const source=relative(config,selectSources(config,[input.slice(0,separator)],{write:false})[0]),exp=input.slice(separator+1);
        if(!(await index.source(source)).parts.includes(exp))throw new CliError('INSPECT_PART_NOT_FOUND',`Unknown defining export ${exp}.`);
        selection.subtree.input=source+'#'+exp;
      }
      const tokens=index.tokens(),env=await environment(),eligible=createEligibilityChecker(),policy=capturePolicy(config),intern=outputTables(data),observations=[];
      data.coverage.requestedObservations=selection.themes.length;
      for(const theme of selection.themes){
        const document=frameDocument(frame,theme,built.css);
        const animated=/<(?:animate|animateTransform|set|canvas|video)\b/i.test(frame.html)||[...document.matchAll(/data:(image\/[^;,]+)(;base64)?,([^"'\s<)]+)/gi)].some(([,mime,base64,body])=>{
          try{const bytes=base64?Buffer.from(body,'base64'):Buffer.from(decodeURIComponent(body));const text=bytes.toString('latin1');return /svg/i.test(mime)?/<(?:animate|animateTransform|set)\b/i.test(text):/NETSCAPE2\.0|ANIMEXTS1\.0|acTL|ANIM/.test(text);}catch{return true;}
        });
        const bypass=env===null||eligible(document).length>0||animated;
        if(bypass)warn('INSPECT_CACHE_BYPASSED','Dynamic/external resources or unavailable environment identity require live observation.');
        const result=await timed('observeMs',()=>observeInspectFrame(index,chosen.source,built,frame,theme,env,getPage,tokens,policy,{bypass,onLoad:()=>data.coverage.frameLoads++}));
        data.coverage.cacheHits+=Number(result.hit);data.coverage.completedObservations++;
        observations.push({theme,value:result.value});
        const projected=await timed('projectMs',()=>projectInspection(data,result.value,theme,config,intern,tokens));
        if(data.baseline===null){data.baselineTheme=theme;data.baseline=projected.scene;}else data.additionalThemes[theme]=projected.scene;
        for(const match of projected.matches){const existing=data.matches.find(m=>m.element===match.element);if(existing)existing.themes.push(theme);else data.matches.push(match);}
        for(const row of projected.instanceRows)if(!data.partInstances.some(i=>i.id===row.id))data.partInstances.push(row);
        for(const l of projected.limitations){let entry=data.limitations.find(e=>e.code===l.code&&e.accuracy===l.accuracy);if(!entry){entry={code:l.code,count:0,elements:[],properties:[],themes:[],accuracy:l.accuracy};data.limitations.push(entry);}entry.count++;if(!entry.elements.includes(l.element))entry.elements.push(l.element);if(l.property&&!entry.properties.includes(l.property))entry.properties.push(l.property);if(!entry.themes.includes(theme))entry.themes.push(theme);}
        const c=projected.counts;data.coverage.rawElements+=c.raw;data.coverage.retainedElements+=c.retained;data.coverage.collapsedElements+=c.collapsed;data.coverage.logicalElements+=c.logical;data.coverage.cutOffElements+=c.cutOff;data.coverage.runs+=c.runs;
      }
      if(selection.subtree?.kind==='element'&&!data.matches.length)throw new CliError('INSPECT_ELEMENT_NOT_FOUND','The selected identity is absent from the requested frame/themes.');
      if(!data.matches.length)warn('INSPECT_NO_MATCH','No selected text/part occurrences matched.',retry('Read the full frame to choose a current selector.',true));
      pruneTables(data);
      for(const [name,token]of Object.entries(data.tables.tokens))for(const {theme,value}of observations){
        const resolved=value.rich.palette[name]??null;
        if(theme==='light')token.resolved=resolved;
        else if(resolved!==token.resolved)(token.dark??={}).resolved=resolved;
      }
      if([data.baseline,...Object.values(data.additionalThemes)].some(s=>s.elements.some(n=>n.identity.stability==='positional')))warn('INSPECT_IDENTITY_POSITIONAL','Some elements have unkeyed repeated identities; use anchors/keys for durable targets.',retry('Add instance keys or anchors before persisting positional targets.'));
      if(data.limitations.length)warn('INSPECT_RENDER_LIMITATIONS','Read the reported precision limitations.');
      if(Object.values(data.tables.values).some(v=>v.attribution==='unresolved'))warn('INSPECT_TOKEN_UNRESOLVED','Some authored variable references are unresolved; computed CSS values are retained.',[{argv:['adg','check','--read-only','--json'],reason:'Repair the named variable chains before retrying.'}]);

    }
    await index.close();
    await verifyInputGeneration({tracked,views:[{index,config,resolved:resolvedConfig,configInputs}],verifyConfig:true,code:'INSPECT_INPUT_CHANGED'});
  } catch(cause){if(cause.code==='OWNER_INDEX_CHANGED')cause=new CliError('INSPECT_INPUT_CHANGED',cause.message,{cause});primary=commandFailure(cause,data,warnings);}
  for(const close of [()=>page?.close(),()=>browser?.close(),()=>index?.close()])try{await cleanup(close,primary);}catch(cause){primary=commandFailure(cause,data,warnings);}
  data.timings.totalMs=performance.now()-start;
  if(primary)throw primary;
  data.complete=true;
  const projectStart=performance.now();data=compactInspection(data);if(values.expand)data=expandInspection(data);
  data.timings.projectMs+=performance.now()-projectStart;data.timings.totalMs=performance.now()-start;
  if(data.mode==='frame'&&Buffer.byteLength(JSON.stringify(data))>256*1024)warn('INSPECT_OUTPUT_LARGE','Inspection data exceeds 256 KiB; no facts were truncated.',retry('Choose narrower fields, depth or an observed subtree.'));
  if(!values.json){log(inspectText(data));for(const warning of warnings)log(warning.code+': '+warning.message);}
  return {data,warnings};
}

export function inspectText(data) {
  data=expandInspection(data);
  if(data.mode==='catalog')return data.catalog.map(s=>`${s.source}\n${s.frames.map(f=>'  '+f.name).join('\n')}`).join('\n')||'No TSX frames.';
  return [data.frame.source+'#'+data.frame.name,...[data.baseline,...Object.values(data.additionalThemes)].map((scene,i)=>{
    const nodes=new Map(scene.elements.map(e=>[e.id,e]));const lines=[data.selection.themes[i]];
    const visit=(id,depth)=>{const e=nodes.get(id);if(!e)return;lines.push('  '.repeat(depth)+e.tag+(e.role?' ['+e.role+']':'')+(e.name?' '+e.name:'')+' '+e.id+(e.geometry?.box?' ['+Object.values(e.geometry.box).join(', ')+']':'')+(e.style?' style='+e.style:''));for(const run of scene.runs.filter(r=>r.element===id))lines.push('  '.repeat(depth+1)+JSON.stringify(run.raw));for(const child of e.children)visit(child,depth+1);};scene.roots.forEach(id=>visit(id,0));return lines.join('\n');})].join('\n');
}
