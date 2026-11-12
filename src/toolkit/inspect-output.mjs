import path from 'node:path';
import { resourceContentIdentity } from './part-snapshot.mjs';
import { elementIdentities } from './frame-identity.mjs';
import { styleDefaults } from './inspect-styles.mjs';

export const fieldGroups=['structure','layout','typography','color','text'];
const typography=/^(?:font-|line-height|letter-spacing|word-spacing|text-(?:align|indent|transform|decoration|underline|overflow)|white-space|word-break|overflow-wrap|vertical-align)/;
const color=/^(?:color|background-|opacity|border-|outline-|box-shadow|text-shadow|fill|stroke|stop-)/;
export const propertyGroup=name=>typography.test(name)?'typography':color.test(name)?'color':'layout';
const stable=value=>JSON.stringify(value);
const rawURL=value=>/^data:/i.test(value??'');

export function outputTables(data) {
  const maps=Object.fromEntries(Object.keys(data.tables).map(k=>[k,new Map()]));
  const next=Object.fromEntries(Object.keys(data.tables).map(k=>[k,0]));
  return (table,value)=>{const key=stable(value),known=maps[table].get(key);if(known)return known;
    const id=table[0]+next[table]++;maps[table].set(key,id);data.tables[table][id]=value;return id;};
}

export function projectInspection(data, observation, theme, config, intern, definitions) {
  const {rich}=observation, idRows=elementIdentities(observation.identities,{source:data.frame.source,frame:data.frame.name});
  const ids=new Map(idRows.map(row=>[row.path,row])), raw=new Map(rich.nodes.map(n=>[n.path,n]));
  const selected=new Set(data.selection.fields), children=new Map(observation.identities.map(n=>[n.path,[]]));
  for(const node of observation.identities)if(node.parentPath!==null)children.get(node.parentPath)?.push(node.path);
  const parent=new Map(observation.identities.map(n=>[n.path,n.parentPath]));
  const defineToken=name=>{
    if(data.tables.tokens[name])return;
    const token=definitions.find(t=>t.name===name);if(!token)return;
    const light=token.values[0],dark=token.values[1];
    data.tables.tokens[name]={source:token.source,line:light.line,declaration:light.declaration,resolved:theme==='light'?rich.palette[name]:null};
    if(dark.declaration!==light.declaration||dark.line!==light.line)data.tables.tokens[name].dark={line:dark.line,declaration:dark.declaration};
    for(const dep of new Set(token.values.flatMap(v=>v.references)))defineToken(dep);
  };
  const normalizeURLs=css=>css.replace(/url\(["']?(data:[^)'"\s]+)["']?\)/g,(_,url)=>{
    const resource=intern('resources',{kind:/^data:image\/svg/i.test(url)?'svg':'raster',source:null,mime:url.match(/^data:([^;,]+)/)?.[1]??null,intrinsic:null,contentIdentity:resourceContentIdentity(url)});return 'url('+resource+')';
  });
  const propertyIndexes=new Map(rich.properties.map((p,i)=>[p,i])),projectedValues=new Map();
  const styles=(values,geometry)=>{
    const groups={layout:{},typography:{},color:{}};
    const cssFor=p=>rich.valueFacts[values[propertyIndexes.get(p)]]?.css;
    const inactive=cssFor('position')==='static',untransformed=['transform','rotate','scale','translate'].every(p=>!cssFor(p)||cssFor(p)==='none');
    for(const [position,fact]of values.entries()){
      const property=rich.properties[position],group=propertyGroup(property);
      if(inactive&&['top','right','bottom','left'].includes(property)||untransformed&&property==='transform-origin')continue;
      if(!selected.has(group) && !(selected.has('layout')&&/^border-.+-width$/.test(property)))continue;
      const cacheKey=position+':'+fact;
      if(!projectedValues.has(cacheKey)){
        const value=rich.valueFacts[fact];
        const refs=value.refs.map(ref=>{defineToken(ref.token);const record={...ref,property:ref.shorthand??property};delete record.shorthand;
          if(!record.via.length)delete record.via;if(!record.inherited)delete record.inherited;
          if(!record.localOverrides?.length)delete record.localOverrides;
          return intern('references',record);});
        const css=normalizeURLs(value.css),attribution=value.unresolved.length?'unresolved':refs.length?'references':'raw';
        const result={css,attribution,...(refs.length?{refs}:{}),...(value.unresolved.length?{reason:value.unresolved.join(',')}:{})};
        projectedValues.set(cacheKey,value.css===styleDefaults[property]&&attribution==='raw'?null:{key:intern('values',result),css:value.css,raw:attribution==='raw'});
      }
      const value=projectedValues.get(cacheKey);if(!value)continue;
      const size=geometry?.layoutSize,measured=selected.has('layout')&&['width','height'].includes(property)&&size&&value.css===size[property]+'px'&&value.raw;
      groups[group][property]=measured?'$'+property:value.key;
    }
    const keys=Object.values(groups).filter(g=>Object.keys(g).length).map(g=>intern('styles',g));return keys.length?keys:undefined;
  };
  const parts=new Map(), instanceRows=[];
  const projectPart=owner=>({source:path.posix.join(path.relative(config.root,config.design).split(path.sep).join('/'),owner.source),export:owner.export});
  for(const n of observation.identities){
    const inherited=parts.get(n.parentPath)??null;let current=inherited;
    for(const owner of n.owners){const part=intern('parts',projectPart(owner)),id=data.partInstances.find(i=>i.root===ids.get(n.path).id&&i.part===part)?.id??'i'+(data.partInstances.length+instanceRows.length);
      const instance={id,part,root:ids.get(n.path).id,parent:current};instanceRows.push(instance);current=id;}
    parts.set(n.path,current);
  }
  const resolveAttributes=attrs=>{
    const result={...attrs};
    for(const name of ['aria-labelledby','aria-describedby','for'])if(result[name]){
      const targets=result[name].split(/\s+/).map(name=>rich.nodes.find(n=>n.attributes.id===name));
      result[name]=targets.map((target,i)=>target?ids.get(target.path).id:attrs[name].split(/\s+/)[i]);
    }
    if(typeof result.href==='string'&&result.href.startsWith('#')){const target=rich.nodes.find(n=>n.attributes.id===result.href.slice(1));if(target)result.href='#'+ids.get(target.path).id;}
    return result;
  };
  const elements=rich.nodes.map(n=>{
    const row=ids.get(n.path),input=observation.identities.find(i=>i.path===n.path);
    const element={id:row.id,identity:row.identity,tag:n.tag,namespace:n.namespace==='http://www.w3.org/1999/xhtml'?'html':n.namespace==='http://www.w3.org/2000/svg'?'svg':n.namespace,parent:ids.get(parent.get(n.path))?.id??null,children:children.get(n.path).map(p=>ids.get(p).id)};
    if(selected.has('structure'))Object.assign(element,{role:n.role,name:n.name,a11y:n.a11y,attributes:resolveAttributes({...n.attributes,...Object.fromEntries(Object.entries(n.svgAttributes??{}).filter(([,v])=>!rawURL(v)))}),...(parts.get(n.path)?{owner:parts.get(n.path)}:{}),...(input.owners.length?{markers:input.owners.map(o=>intern('parts',projectPart(o)))}:{})});
    const style=styles(n.values,n.geometry);if(style)element.style=style;
    if(selected.has('layout'))element.geometry=n.geometry;
    if(Object.keys(n.effects).length)element.effects=n.effects;
    if(n.pseudo.length)element.pseudo=n.pseudo.map(p=>({id:element.id+'::'+p.kind,kind:p.kind,content:normalizeURLs(p.content),...(selected.has('layout')?{geometry:p.geometry}:{}),...(styles(p.values)?{style:styles(p.values)}:{})}));
    if(n.resource){const r=n.resource;
      const mime=r.url?.match(/^data:([^;,]+)/)?.[1]??(r.kind==='svg'||r.kind==='icon'?'image/svg+xml':null);
      const resource={kind:mime==='image/svg+xml'&&r.kind==='raster'?'svg':r.kind,source:r.source?path.posix.join(path.relative(config.root,config.design).split(path.sep).join('/'),r.source):null,mime,intrinsic:r.intrinsic};
      if(r.url)resource.contentIdentity=resourceContentIdentity(r.url);
      if(!rawURL(r.url)&&r.url)resource.url=r.url;
      if(r.icon)resource.icon={library:'lucide',name:r.icon,viewBox:r.viewBox};
      if(r.kind==='svg'||r.kind==='icon'){
        const descendants=[];const visit=p=>{descendants.push(raw.get(p));for(const c of children.get(p))visit(c);};visit(n.path);
        const local=new Map(descendants.map((d,i)=>[d.path,'g'+i]));
        const named=new Map(descendants.filter(d=>d.svgAttributes?.id).map(d=>[d.svgAttributes.id,local.get(d.path)]));
        const geometry=descendants.map(d=>({id:local.get(d.path),tag:d.tag,attributes:Object.fromEntries(Object.entries(d.svgAttributes??{}).filter(([k])=>k!=='id').map(([k,v])=>[k,rawURL(v)?'embedded':v.replace(/url\(#([^)]+)\)|^#(.+)$/g,(_,a,b)=>a?'url(#'+(named.get(a)??a)+')':'#'+(named.get(b)??b))])),children:children.get(d.path).filter(p=>local.has(p)).map(p=>local.get(p))}));
        resource.svg={viewBox:r.viewBox,geometry,definitions:geometry.filter(d=>['defs','linearGradient','radialGradient','mask','clipPath'].includes(d.tag))};
      }
      element.resource=intern('resources',resource);
    }
    if(n.backgrounds?.length)element.backgrounds=n.backgrounds.map(url=>intern('resources',{kind:/^data:image\/svg/i.test(url)?'svg':'raster',source:null,mime:url.match(/^data:([^;,]+)/)?.[1]??null,intrinsic:rich.backgroundDimensions?.[url]??null,contentIdentity:resourceContentIdentity(url),...(!rawURL(url)?{url}:{})}));
    return element;
  });
  const byId=new Map(elements.map(e=>[e.id,e]));
  const runs=rich.runs.map(run=>{
    const element=ids.get(run.path).id,pseudo=run.pseudo?element+'::'+run.pseudo:element;
    const owner=byId.get(element),style=run.pseudo?owner.pseudo?.find(p=>p.id===pseudo)?.style:owner.style;
    return {id:pseudo+'/text-'+run.slot,kind:run.kind,element:pseudo,raw:run.raw,normalized:run.normalized,...(style?{style}:{}),fragments:[{element:pseudo,start:0,end:run.raw.length,boxes:run.boxes,accuracy:run.accuracy}]};
  });
  let matches=[];const query=data.selection.subtree;
  if(!query)matches=elements.slice(0,1).map(n=>({element:n.id,themes:[theme]}));
  else if(query.kind==='element'){
    const node=byId.get(query.input)??elements.find(e=>e.pseudo?.some(p=>p.id===query.input));
    if(node)matches=[{element:node.id,themes:[theme]}];
  } else if(query.kind==='part'){
    const [source,exp]=[query.input.slice(0,query.input.lastIndexOf('#')),query.input.slice(query.input.lastIndexOf('#')+1)];
    matches=instanceRows.filter(i=>data.tables.parts[i.part].source===source&&data.tables.parts[i.part].export===exp).map(i=>({element:i.root,themes:[theme]}));
  } else {
    const normalized=query.input.normalize('NFC').replace(/\p{White_Space}+/gu,' ').trim();
    matches=runs.filter(r=>{const node=byId.get(r.element.replace(/::(?:before|after|marker|placeholder)$/,''));return !['hidden','not_laid_out','clipped'].includes(raw.get(idRows.find(n=>n.id===node?.id)?.path)?.geometry.visibility)&& (query.contains?r.normalized.includes(normalized):r.normalized===normalized);}).map(r=>({element:r.element.replace(/::(?:before|after|marker|placeholder)$/,''),themes:[theme],runs:[r.id]}));
    const grouped=[];
    for(let i=0;i<rich.runs.length;i++){const original=rich.runs[i],run=runs[i];if(run.kind!=='dom'||['hidden','not_laid_out','clipped'].includes(raw.get(original.path)?.geometry.visibility))continue;
      if(grouped.at(-1)?.group!==original.group)grouped.push({group:original.group,runs:[]});grouped.at(-1).runs.push(run);
    }
    for(const group of grouped){const text=group.runs.map(r=>r.raw).join('').normalize('NFC').replace(/\p{White_Space}+/gu,' ').trim();
      if((query.contains?text.includes(normalized):text===normalized)&&!['hidden','not_laid_out','clipped'].includes(raw.get(group.group)?.geometry.visibility)){
        const id=ids.get(group.group)?.id;if(id)matches.push({element:id,themes:[theme],runs:group.runs.map(r=>r.id)});
      }
    }
  }
  matches=[...new Map(matches.map(m=>[m.element,m])).values()];
  const matched=new Set(matches.map(m=>m.element));
  const roots=matches.filter(m=>{for(let n=byId.get(m.element)?.parent;n;n=byId.get(n)?.parent)if(matched.has(n))return false;return true;}).map(m=>m.element);
  const scope=new Set(), included=new Set(), context=new Set();
  const descend=(id,depth)=>{scope.add(id);if(data.selection.depth===null||depth<=data.selection.depth)included.add(id);for(const child of byId.get(id).children)descend(child,depth+1);};
  for(const id of roots){descend(id,0);for(let n=byId.get(id)?.parent;n;n=byId.get(n)?.parent)context.add(n);}
  let emitted=elements.filter(e=>included.has(e.id)).map(e=>{
    const children=e.children.filter(id=>included.has(id));const result={...e,children};
    if(children.length!==e.children.length){let count=0;const countAll=id=>{count++;byId.get(id).children.forEach(countAll);};e.children.forEach(countAll);result.cutoff={descendants:count};}
    return result;
  });
  const emittedRuns=selected.has('text')?runs.filter((r,i)=>included.has(r.element.replace(/::(?:before|after|marker|placeholder)$/, '')) && (query?.kind==='element'||raw.get(rich.runs[i].path)?.geometry.visibility!=='not_laid_out')):[];
  for(const run of emittedRuns){const owner=emitted.find(e=>e.id===run.element);const target=owner??emitted.flatMap(e=>e.pseudo??[]).find(p=>p.id===run.element);if(target)(target.text??=[]).push(run.id);}
  const limitations=rich.limitations.filter(l=>included.has(ids.get(l.path)?.id)).map(l=>({...l,element:ids.get(l.path)?.id,theme}));
  let collapsed=0;
  if(data.selection.wrappers==='semantic'){
    for(const e of [...emitted].reverse()){
      const input=observation.identities[idRows.findIndex(r=>r.id===e.id)],child=emitted.find(n=>n.id===e.children[0]);
      if(!input?.neutral||roots.includes(e.id)||!child||e.children.length!==1||e.role||e.name||Object.keys(e.attributes??{}).length||e.owner!==child.owner||e.pseudo||e.resource||e.effects||e.geometry?.scroll||JSON.stringify(e.geometry?.box)!==JSON.stringify(child.geometry?.box))continue;
      const above=emitted.find(n=>n.id===e.parent);if(!above)continue;
      above.children=above.children.flatMap(id=>id===e.id?e.children:[id]);child.parent=e.parent;emitted=emitted.filter(n=>n!==e);collapsed++;
    }
  }
  const scene={roots,context:elements.filter(e=>context.has(e.id)).map(e=>({...e,children:e.children.filter(id=>context.has(id)||included.has(id))})),elements:emitted,instances:[],runs:emittedRuns,size:rich.size};
  return {scene,matches,limitations,instanceRows:instanceRows.filter(i=>included.has(i.root)||[...context].some(id=>id===i.root)),counts:{raw:scope.size,retained:scope.size-collapsed,collapsed,logical:included.size-collapsed,cutOff:scope.size-included.size,runs:emittedRuns.length}};
}

export function pruneTables(data) {
  const used=Object.fromEntries(Object.keys(data.tables).map(k=>[k,new Set()]));
  const useStyle=keys=>{for(const key of keys??[]){if(used.styles.has(key))continue;used.styles.add(key);for(const value of Object.values(data.tables.styles[key])){if(value.startsWith('$'))continue;used.values.add(value);for(const m of data.tables.values[value].css.matchAll(/url\((r\d+)\)/g))used.resources.add(m[1]);for(const r of data.tables.values[value].refs??[]){used.references.add(r);used.tokens.add(data.tables.references[r].token);}}}};
  for(const scene of [data.baseline,...Object.values(data.additionalThemes)].filter(Boolean))for(const e of [...scene.context,...scene.elements]){
    useStyle(e.style);for(const p of e.pseudo??[]){useStyle(p.style);for(const m of p.content.matchAll(/url\((r\d+)\)/g))used.resources.add(m[1]);}if(e.resource)used.resources.add(e.resource);for(const r of e.backgrounds??[])used.resources.add(r);for(const p of e.markers??[])used.parts.add(p);
  }
  for(const i of data.partInstances)used.parts.add(i.part);
  for(const name of used.tokens){const token=data.tables.tokens[name];for(const value of [token?.declaration,token?.dark?.declaration])for(const match of value?.matchAll(/var\(\s*(--[\w-]+)/g)??[])used.tokens.add(match[1]);}
  for(const table of Object.keys(data.tables))for(const key of Object.keys(data.tables[table]))if(!used[table].has(key))delete data.tables[table][key];
}
