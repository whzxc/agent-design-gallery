import path from 'node:path';
import { loadConfig } from '../src/toolkit/config.mjs';
import { openProjectIndex } from '../src/toolkit/project-index.mjs';
import { launch, loadFrame, readyResources } from '../src/toolkit/browser.mjs';
import { installFramePrimitives } from '../src/toolkit/frame-observation.mjs';
import { elementIdentities } from '../src/toolkit/frame-identity.mjs';
import { resourceContentIdentity } from '../src/toolkit/part-snapshot.mjs';
import { styleDefaults } from '../src/toolkit/inspect-styles.mjs';
import { propertyGroup } from '../src/toolkit/inspect-output.mjs';
import { canonicalBytes } from '../src/toolkit/impact-proof.mjs';
import { configInputFiles, inputBytes, trackedHash, verifyInputGeneration } from '../src/toolkit/input-generation.mjs';
import { observeAccessibility } from '../src/toolkit/inspect-observation.mjs';

/** Separate verification pass: direct DOM/style/Range reads, no collector rect/style caches or saved facts. */
export function readLiveFrame(properties) {
  const frame=document.querySelector('[data-adg-frame]'),root=frame.firstElementChild,origin=frame.getBoundingClientRect();
  const elements=[root,...root.querySelectorAll('*')],paths=new Map(elements.map((e,i)=>[e,String(i)]));
  const neutralCandidates=new Set();for(const keyed of root.querySelectorAll('[data-adg-keys]'))for(let p=keyed.parentElement;p&&p!==root;p=p.parentElement)neutralCandidates.add(p);
  const box=r=>({x:r.left-origin.left,y:r.top-origin.top,width:r.width,height:r.height});
  const rules=[];
  function visit(list,parents=[]){for(const rule of list){
    if(rule instanceof CSSMediaRule&&!matchMedia(rule.conditionText).matches||rule instanceof CSSSupportsRule&&!CSS.supports(rule.conditionText))continue;
    let selectors=parents;
    if(rule.style&&rule.selectorText){const own=globalThis.__adgFramePrimitives.selectors(rule.selectorText);selectors=parents.length?parents.flatMap(parent=>own.map(s=>s.includes('&')?s.replaceAll('&',`:is(${parent})`):`${parent} ${s}`)):own;rules.push({style:rule.style,selectors});}
    if(rule.cssRules)visit(rule.cssRules,selectors);
  }}
  for(const sheet of document.styleSheets)visit(sheet.cssRules);
  return {size:{width:origin.width,height:origin.height},nodes:elements.map(node=>{
    const s=getComputedStyle(node),r=node.getBoundingClientRect(),path=paths.get(node);
    const owners=JSON.parse(node.getAttribute('data-adg-owners')??'[]');
    const identity=globalThis.__adgFramePrimitives.identityNode(node,path,paths.get(node.parentElement)??null,owners,s,neutralCandidates.has(node));
    const declarations=[];
    for(let p=node;p;p=p.parentElement){for(const declaration of [p.style,...rules.filter(rule=>{try{return rule.selectors.some(s=>p.matches(s));}catch{return false;}}).map(rule=>rule.style)])for(const property of declaration)declarations.push({property,value:declaration.getPropertyValue(property),inherited:p!==node});}
    const texts=[];for(const [slot,child]of [...node.childNodes].entries())if(child.nodeType===3){const range=document.createRange();range.selectNodeContents(child);texts.push({slot,raw:child.data,boxes:[...range.getClientRects()].map(box)});}
    let clip={left:origin.left,top:origin.top,right:origin.right,bottom:origin.bottom},hidden=s.visibility!=='visible';
    for(let parent=node;parent;parent=parent.parentElement){const ps=getComputedStyle(parent),pr=parent.getBoundingClientRect();hidden ||= ps.display==='none'||Number(ps.opacity)===0;
      if(parent!==node&&ps.display!=='inline'){
        const sx=pr.width/(parent.offsetWidth||pr.width||1),sy=pr.height/(parent.offsetHeight||pr.height||1);
        if(/hidden|clip|scroll|auto/.test(ps.overflowX)){clip.left=Math.max(clip.left,pr.left+(parent.clientLeft||0)*sx);clip.right=Math.min(clip.right,pr.left+((parent.clientLeft||0)+parent.clientWidth)*sx);}
        if(/hidden|clip|scroll|auto/.test(ps.overflowY)){clip.top=Math.max(clip.top,pr.top+(parent.clientTop||0)*sy);clip.bottom=Math.min(clip.bottom,pr.top+((parent.clientTop||0)+parent.clientHeight)*sy);}
      }if(parent===frame)break;
    }
    const visible={left:Math.max(r.left,clip.left),top:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)};
    const laidOut=s.display!=='none'&&s.display!=='contents'&&node.getClientRects().length>0;
    const geometry={clip:{x:clip.left-origin.left,y:clip.top-origin.top,width:Math.max(0,clip.right-clip.left),height:Math.max(0,clip.bottom-clip.top)},visibleBox:visible.right>visible.left&&visible.bottom>visible.top?box({...visible,width:visible.right-visible.left,height:visible.bottom-visible.top}):null};
    geometry.visibility=!laidOut?'not_laid_out':hidden?'hidden':!geometry.visibleBox?'clipped':visible.left>r.left||visible.top>r.top||visible.right<r.right||visible.bottom<r.bottom?'partial':'visible';
    if(node instanceof HTMLElement)geometry.layoutSize={width:node.offsetWidth,height:node.offsetHeight};
    geometry.scroll={x:node.scrollLeft||0,y:node.scrollTop||0,width:node.scrollWidth||0,height:node.scrollHeight||0,clientWidth:node.clientWidth||0,clientHeight:node.clientHeight||0};
    const pseudo={};for(const kind of ['before','after','marker','placeholder']){const p=getComputedStyle(node,'::'+kind);pseudo[kind]={content:kind==='placeholder'?node.placeholder??'':p.content,values:Object.fromEntries(properties.map(name=>[name,p.getPropertyValue(name)]))};}
    return {path,identity,geometry,tag:node.localName,parent:paths.get(node.parentElement)??null,children:[...node.children].map(e=>paths.get(e)),box:s.display==='none'||s.display==='contents'||!node.getClientRects().length?null:box(r),clientRects:[...node.getClientRects()].map(box),values:Object.fromEntries(properties.map(name=>[name,s.getPropertyValue(name)])),declarations,texts,pseudo,value:node.type==='password'?null:node.matches('select')?[...node.selectedOptions].map(o=>o.text).join(' '):node.value??null,geometryEffects:{transform:s.transform,clip:s.clipPath,mask:s.maskImage},attributes:Object.fromEntries([...node.attributes].filter(a=>a.name!=='value').map(a=>[a.name,a.value]))};
  })};
}

export async function auditInspection(data, { config, browser: supplied }={}) {
  config??=await loadConfig(data.project,{discover:false});
  const result={checked:{elements:0,boxes:0,properties:0,runs:0,references:0,a11y:0},excluded:[],findings:[],themes:[],byTheme:[]};
  const finding=(theme,element,property,emitted,observed)=>result.findings.push({theme,element,property,emitted,observed});
  const exclude=(code,count=1)=>{let row=result.excluded.find(e=>e.code===code);if(!row){row={code,count:0};result.excluded.push(row);}row.count+=count;};
  const resolved=canonicalBytes(config),files=await configInputFiles(config),tracked=new Map();
  for(const file of [...files,config.design+'/tokens.css'])tracked.set(file,trackedHash(await inputBytes(file)));
  const index=await openProjectIndex(config,{persist:false,fresh:true});let browser=supplied,page;
  try {
    const built=await index.materialize(data.frame.source),frame=built.frames.find(f=>f.name===data.frame.name);browser??=await launch();
    page=await browser.newPage({locale:'en-US',timezoneId:'UTC',deviceScaleFactor:1});
    for(const theme of data.selection.themes){
      const before={...result.checked},findingCount=result.findings.length,excludedBefore=new Map(result.excluded.map(e=>[e.code,e.count]));
      await loadFrame(page,frame,theme);await page.evaluate(readyResources);await page.evaluate(installFramePrimitives);
      const properties=Object.keys(styleDefaults).filter(p=>data.selection.fields.includes(propertyGroup(p))||data.selection.fields.includes('layout')&&/^border-.+-width$/.test(p));
      const live=await page.evaluate(readLiveFrame,properties), identities=elementIdentities(live.nodes.map(n=>n.identity),{source:data.frame.source,frame:data.frame.name});
      const ids=new Map(identities.map(n=>[n.path,n.id])),byId=new Map(live.nodes.map(n=>[ids.get(n.path),n]));
      const scene=theme===data.baselineTheme?data.baseline:data.additionalThemes?.[theme];
      if(!scene){finding(theme,null,'theme',null,'live scene');result.byTheme.push({theme,checked:{},excluded:[],findings:1});continue;}
      result.themes.push(theme);
      const number=(id,property,a,b)=>{if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>.02)finding(theme,id,property,a,b);};
      for(const p of ['width','height'])number(null,'frame.'+p,scene.size[p],live.size[p]);
      const emitted=new Map(scene.elements.map(n=>[n.id,n]));
      if(!data.selection.subtree&&data.selection.depth===null){for(const id of byId.keys())if(!emitted.has(id))finding(theme,id,'missing_element',null,byId.get(id).tag);}
      for(const element of scene.elements){const node=byId.get(element.id);if(!node){finding(theme,element.id,'identity',element.id,null);continue;}result.checked.elements++;
        if(element.tag!==node.tag)finding(theme,element.id,'tag',element.tag,node.tag);
        const expectedChildren=node.children.map(p=>ids.get(p)).filter(id=>emitted.has(id));
        if(JSON.stringify(element.children)!==JSON.stringify(expectedChildren))finding(theme,element.id,'children',element.children,expectedChildren);
        if(element.parent!==(ids.get(node.parent)??null))finding(theme,element.id,'parent',element.parent,ids.get(node.parent)??null);
        if(data.selection.fields.includes('layout')&&!element.geometry)finding(theme,element.id,'missing_geometry',null,'live border geometry');
        if(element.geometry){result.checked.boxes++;
          if(!!element.geometry.box!==!!node.box)finding(theme,element.id,'box',element.geometry.box,node.box);
          else if(node.box)for(const p of ['x','y','width','height'])number(element.id,'box.'+p,element.geometry.box[p],node.box[p]);
          for(const field of ['visibleBox','clip','layoutSize','scroll'])if(field in element.geometry){
            const emitted=element.geometry[field],observed=node.geometry[field];
            if(!!emitted!==!!observed)finding(theme,element.id,'geometry.'+field,emitted,observed);
            else if(emitted)for(const key of Object.keys(emitted))number(element.id,field+'.'+key,emitted[key],observed?.[key]);
          }
          if(element.geometry.visibility!==node.geometry.visibility)finding(theme,element.id,'visibility',element.geometry.visibility,node.geometry.visibility);
          if(element.geometry.clientRects)for(let i=0;i<node.clientRects.length;i++)for(const p of ['x','y','width','height'])number(element.id,'rect.'+i+'.'+p,element.geometry.clientRects[i]?.[p]??NaN,node.clientRects[i][p]);
        }
        const checkStyles=(id,key,values)=>{
          if(key&&!data.tables.styles[key])finding(theme,id,'style_reference',key,null);
          const emittedStyle=data.tables.styles[key]??{};
          for(const property of properties){const v=data.tables.values[emittedStyle[property]],css=v?.css??styleDefaults[property];result.checked.properties++;
            if(emittedStyle[property]&&!v)finding(theme,id,'value_reference',emittedStyle[property],null);
            const observed=values[property];
            // Embedded image bytes are represented by resource keys, never copied into public JSON.
            const normalized=observed.replace(/url\(["']?(data:[^)'"\s]+)["']?\)/g,(_,url)=> 'url(embedded:'+resourceContentIdentity(url)+')');
            const actual=css.replace(/url\((r\d+)\)/g,(_,key)=> 'url(embedded:'+(data.tables.resources[key]?.contentIdentity??'missing')+')');
            if(actual!==observed&&actual!==normalized)finding(theme,id,'style.'+property,css,observed);
            for(const refId of v?.refs??[]){result.checked.references++;const ref=data.tables.references[refId];if(!ref||ref.element!==id||ref.property!==property||ref.theme!==theme)finding(theme,id,'reference_scope',ref??null,{element:id,property,theme});
              else {
                if(!ref.expression.includes('var('))finding(theme,id,'reference_expression',ref.expression,'var() reference');
                if(!id.includes('::')){
                  const relevant=ref.shorthand??property;
                  if(!node.declarations.some(d=>d.property===relevant&&d.value===ref.expression))finding(theme,id,'reference_declaration',ref.expression,'matching live authored declaration');
                  const reachable=new Set([...ref.expression.matchAll(/var\(\s*(--[\w-]+)/g)].map(m=>m[1]));
                  for(const variable of reachable)for(const d of node.declarations.filter(d=>d.property===variable))for(const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g))reachable.add(m[1]);
                  if(!reachable.has(ref.token))finding(theme,id,'reference_token',ref.token,[...reachable]);
                }
              }
            }
          }
        };
        checkStyles(element.id,element.style,node.values);
        for(const pseudo of element.pseudo??[]){if(!data.limitations.some(l=>l.code==='PSEUDO_BOX_UNAVAILABLE'&&l.elements.includes(element.id)&&(!l.themes||l.themes.includes(theme))))finding(theme,pseudo.id,'missing_limitation',null,'PSEUDO_BOX_UNAVAILABLE');exclude('PSEUDO_BOX_UNAVAILABLE');if(pseudo.geometry?.box!==null&&pseudo.geometry)finding(theme,pseudo.id,'pseudo_box',pseudo.geometry.box,null);checkStyles(pseudo.id,pseudo.style,node.pseudo[pseudo.kind].values);}
        for(const [property,code]of [['box-shadow','INK_BOUNDS_UNAVAILABLE'],['text-shadow','INK_BOUNDS_UNAVAILABLE'],['transform','TRANSFORM_QUAD_UNAVAILABLE']])if((property!=='transform'||node.box)&&node.values[property]&&node.values[property]!=='none'&&!data.limitations.some(l=>l.code===code&&l.elements.includes(element.id)))finding(theme,element.id,'missing_limitation',null,code);
        for(const effect of ['CLIP_SHAPE_APPROXIMATE','TRANSFORM_QUAD_UNAVAILABLE','INK_BOUNDS_UNAVAILABLE','OPAQUE_RESOURCE','DYNAMIC_PAINT'])if(data.limitations.some(l=>l.code===effect&&l.elements.includes(element.id)))exclude(effect);
      }
      for(const run of scene.runs){result.checked.runs++;const node=byId.get(run.element.replace(/::(?:before|after|marker|placeholder)$/,''));if(!node){finding(theme,run.element,'text_owner',run.raw,null);continue;}
        if(run.kind==='pseudo'){exclude('GENERATED_CONTENT_GEOMETRY');continue;}
        let raw,boxes;
        if(run.kind==='control'){raw=node.value;boxes=node.box?[node.box]:[];exclude('CONTROL_TEXT_BOX');}
        else {const slot=Number(run.id.slice(run.id.lastIndexOf('/text-')+6));const text=node.texts.find(t=>t.slot===slot);raw=text?.raw;boxes=text?.boxes??[];}
        if(run.normalized!==run.raw.normalize('NFC').replace(/\p{White_Space}+/gu,' ').trim())finding(theme,run.element,'normalized_text',run.normalized,raw);
        if(run.fragments.some(f=>f.start!==0||f.end!==run.raw.length))finding(theme,run.element,'text_offsets',run.fragments,'logical UTF-16 range');
        if(raw!==run.raw)finding(theme,run.element,'text',run.raw,raw??null);
        const actual=run.fragments.flatMap(f=>f.boxes);if(actual.length!==boxes.length)finding(theme,run.element,'text_rect_count',actual.length,boxes.length);
        for(let i=0;i<Math.min(actual.length,boxes.length);i++)for(const p of ['x','y','width','height'])number(run.element,'text_box.'+p,actual[i][p],boxes[i][p]);
      }
      if(data.selection.fields.includes('structure')){
        try{const ax=await observeAccessibility(page);live.nodes.forEach((node,i)=>{const element=emitted.get(ids.get(node.path));if(!element)return;result.checked.a11y++;for(const p of ['role','name','a11y'])if(element[p]!==ax[i][p])finding(theme,element.id,'a11y.'+p,element[p],ax[i][p]);});}catch{exclude('A11Y_UNAVAILABLE');}
      }
      // Re-read after verification to reject concurrent DOM/layout changes.
      const after=await page.evaluate(readLiveFrame,properties);
      if(JSON.stringify(after)!==JSON.stringify(live))finding(theme,null,'unsettled',null,'live reads changed during audit');
      result.byTheme.push({theme,checked:Object.fromEntries(Object.keys(before).map(k=>[k,result.checked[k]-before[k]])),excluded:result.excluded.map(e=>({code:e.code,count:e.count-(excludedBefore.get(e.code)??0)})).filter(e=>e.count),findings:result.findings.length-findingCount});
    }
    await index.close();await verifyInputGeneration({tracked,views:[{index,config,resolved,configInputs:new Set(files.map(file=>path.relative(config.root,file).split(path.sep).join('/')))}],verifyConfig:true,code:'INSPECT_INPUT_CHANGED'});
  } finally {await page?.close();if(!supplied)await browser?.close();await index.close();}
  return result;
}

/** Corrupt expanded public data, not the raw collector observation. */
export function corruptInspection(data, kind) {
  const changed=structuredClone(data), scene=changed.baseline;
  if(kind==='box'){const e=scene.elements.find(e=>e.geometry?.box);e.geometry.box.x+=8;}
  else if(kind==='inherited-style'){
    const e=scene.elements.find(e=>changed.tables.styles[e.style]?.['font-family']);const style={...changed.tables.styles[e.style]};delete style['font-family'];changed.tables.styles.corrupted=style;e.style='corrupted';
  } else if(kind==='token-scope'){
    const ref=Object.values(changed.tables.references)[0];ref.element='e1_wrong_scope';
  } else if(kind==='theme'){delete changed.additionalThemes[changed.selection.themes.find(t=>t!==changed.baselineTheme)];}
  else throw Error('Unknown corruption kind');
  return changed;
}
