import { parse } from 'pele';
import { buildArch, inspectArch, vocabulary } from './arch.mjs';
import { readFileSync } from 'node:fs';
import { readBase } from './arch-git.mjs';
import { escape } from './runtime.mjs';

export const diffClasses=['added','changed','removed'];
const words=value=>(Array.isArray(value)?value.join(' '):value??'').split(/[\s,]+/).filter(Boolean);
const addClass=(object,key,name)=>{object[key]=Array.isArray(object[key])?[...words(object[key]),name]:[...words(object[key]),name].join(' ');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const labelDetail=text=>text?.trim()?`: ${text}`:'';
const diffLabel=(name,text)=>name!=='changed'&&text?.trim()?`${name==='added'?'+':'-'} ${text}`:text;
function changeDetail(oldLabel,label,oldParent,parent,oldShape,shape) {
  const changes=[];
  if(oldLabel!==label)changes.push(`${oldLabel} -> ${label}`);
  if(oldParent!==parent)changes.push(`parent ${oldParent??'root'} -> ${parent??'root'}`);
  if(oldShape!==shape)changes.push(`shape ${oldShape} -> ${shape}`);
  return changes.join('; ')||'structure changed';
}
const identityEdges=edges=>{
  const counts=new Map();
  return new Map(edges.map(edge=>{
    const pair=JSON.stringify([edge.start,edge.end]),index=counts.get(pair)??0;counts.set(pair,index+1);
    return [JSON.stringify([edge.start,edge.end,index]),edge];
  }));
};
function compareNodes(current,base,describe,kind,result,insert) {
  for(const [id,node] of current) {
    const old=base.get(id),name=!old?'added':same(describe(node),describe(old))?null:'changed';
    if(name) {
      result.nodes.set(id,name);
      result.changes.push(`${name==='added'?'+':'~'} ${kind} ${id}${name==='changed'?`: ${changeDetail(describe(old)[0],describe(node)[0],undefined,undefined,describe(old)[1],describe(node)[1])}`:''}`);
    }
  }
  for(const [id,node] of base)if(!current.has(id)) {
    insert(id,structuredClone(node));result.nodes.set(id,'removed');result.changes.push(`- ${kind} ${id}`);
  }
}
function compareEdges(current,base,kind,result) {
  const oldEdges=identityEdges(base),newEdges=identityEdges(current);
  for(const [key,edge] of newEdges) {
    const old=oldEdges.get(key),name=!old?'added':!same([old.text,old.type,old.stroke,old.parent],[edge.text,edge.type,edge.stroke,edge.parent])?'changed':null;
    if(name) {
      edge.diff=name;
      const detail=name==='changed'?changeDetail(old.text,edge.text,old.parent,edge.parent,`${old.type??''}/${old.stroke??''}`,`${edge.type??''}/${edge.stroke??''}`):edge.text;
      result.changes.push(`${name==='added'?'+':'~'} ${kind} ${edge.start} -> ${edge.end}${labelDetail(detail)}`);
    }
  }
  for(const [key,edge] of oldEdges)if(!newEdges.has(key)) {
    const ghost=structuredClone(edge);ghost.diff='removed';current.push(ghost);
    result.changes.push(`- ${kind} ${edge.start} -> ${edge.end}${labelDetail(edge.text)}`);
  }
  return current;
}
function flowchart(model,base,result) {
  const groups=new Map(model.subgraphs.map(g=>[g.id,g])),oldGroups=new Map((base?.subgraphs??[]).map(g=>[g.id,g]));
  const parents=groups=>new Map([...groups].flatMap(([id,g])=>g.nodes.map(child=>[child,id])));
  const parent=parents(groups),oldParent=parents(oldGroups),currentGroups=new Set(groups.keys());
  // A subgraph referenced by an edge also has a placeholder in nodes. It is one
  // element, including when a proposal changes that ID from a group to a node.
  const elements=(nodes,groups)=>new Map([
    ...[...nodes].filter(([id])=>!groups.has(id)).map(([id,value])=>[id,{kind:'node',value}]),
    ...[...groups].map(([id,value])=>[id,{kind:'subgraph',value}]),
  ]);
  const current=elements(model.nodes,groups),old=elements(base?.nodes??new Map(),oldGroups);
  const describe=(element,parent)=>[element.kind==='subgraph'?element.value.title:element.value.text??element.value.id,
    element.kind==='subgraph'?'group':element.value.type??'square',parent];
  for(const [id,element] of current) {
    const previous=old.get(id),name=!previous?'added':same(describe(element,parent.get(id)),describe(previous,oldParent.get(id)))?null:'changed';
    if(name){result.nodes.set(id,name);result.changes.push(`${name==='added'?'+':'~'} ${element.kind} ${id}${previous?`: ${changeDetail(describe(previous)[0],describe(element)[0],oldParent.get(id),parent.get(id),describe(previous)[1],describe(element)[1])}`:''}`);}
  }
  for(const [id,element] of old)if(!current.has(id)) {
    const ghost=structuredClone(element.value);
    if(element.kind==='subgraph') {
      ghost.nodes=[];groups.set(id,ghost);
      if(base.nodes.has(id))model.nodes.set(id,structuredClone(base.nodes.get(id)));
    } else model.nodes.set(id,ghost);
    result.nodes.set(id,'removed');result.changes.push(`- ${element.kind} ${id}`);
    if(currentGroups.has(oldParent.get(id)))parent.set(id,oldParent.get(id));
  }
  for(const g of groups.values())g.nodes=[];
  for(const [child,id] of parent)if(groups.has(id))groups.get(id).nodes.push(child);
  model.subgraphs=[...groups.values()];model.subgraphLookup=groups;model.members=new Set([...parent.keys()]);
  for(const [id,name] of result.nodes)addClass(groups.get(id)??model.nodes.get(id),'classes',name);
  const toEdge=e=>({...e,text:e.text??''});
  model.edges=compareEdges(model.edges.map(toEdge),(base?.edges??[]).map(toEdge),'edge',result);
  const used=new Set();
  for(const [i,edge] of model.edges.entries()) {
    if(!edge.id||used.has(edge.id))edge.id=`sdg-overlay-edge${i}`;
    used.add(edge.id);
    if(edge.diff){if(edge.stroke==='invisible')edge.stroke='normal';addClass(edge,'classes',edge.diff);result.edges.set(edge.id,edge.diff);edge.text=diffLabel(edge.diff,edge.text);}
  }
  model.edgeById=new Map(model.edges.map(edge=>[edge.id,edge]));
}
function state(model,base,result) {
  const originalNodes=new Map(model.graph.nodes.map(node=>[node.id,node])),oldNodes=new Map((base?.graph.nodes??[]).map(node=>[node.id,node]));
  const currentIds=new Set(originalNodes.keys());
  // Graph nodes include composite states, with their direct parent and label.
  const label=node=>[node.label,...(node.description??[])].filter(Boolean).join(': ');
  for(const [id,node] of originalNodes) {
    const old=oldNodes.get(id),name=!old?'added':same([node.label,node.description,node.parentId,node.shape,node.isGroup],[old.label,old.description,old.parentId,old.shape,old.isGroup])?null:'changed';
    if(name){result.nodes.set(id,name);result.changes.push(`${name==='added'?'+':'~'} state ${id}${old?`: ${changeDetail(label(old),label(node),old.parentId,node.parentId,old.shape,node.shape)}`:''}`);}
  }
  for(const [id,node] of oldNodes)if(!originalNodes.has(id)) {
    const ghost=structuredClone(node);if(!currentIds.has(ghost.parentId))delete ghost.parentId;
    model.graph.nodes.push(ghost);result.nodes.set(id,'removed');result.changes.push(`- state ${id}`);
  }
  for(const node of model.graph.nodes)if(result.nodes.has(node.id))addClass(node,'cssClasses',result.nodes.get(node.id));
  const transitions=source=>{
    const parents=[];
    const visit=(doc,parent)=>{for(const stmt of doc??[]) {
      if(stmt.stmt==='relation')parents.push(parent);
      if(stmt.doc)visit(stmt.doc,stmt.id);
    }};
    visit(source?.rootDoc,undefined);
    return (source?.graph.edges??[]).map((edge,index)=>({...edge,text:edge.label??'',parent:parents[index]}));
  };
  const edges=compareEdges(transitions(model),transitions(base),'transition',result);
  model.graph.edges=edges.map((edge,i)=>{
    edge.id=`edge${i}`;edge.label=edge.text;
    if(edge.diff){addClass(edge,'classes',edge.diff);result.edges.set(edge.id,edge.diff);edge.label=diffLabel(edge.diff,edge.text);}
    return edge;
  });
}
function sequence(model,base,result) {
  const oldActors=base?.actors??new Map();
  compareNodes(model.actors,oldActors,a=>[a.description,a.type],'participant',result,(id,node)=>{
    const box=node.box&&model.boxes.find(box=>box.name===node.box.name);
    node.box=box;if(box)box.actorKeys.push(id);
    model.actors.set(id,node);
  });
  // Rebuild neighbor links after appending ghost participants.
  const actors=[...model.actors];actors.forEach(([,actor],i)=>{actor.prevActor=actors[i-1]?.[0];actor.nextActor=actors[i+1]?.[0];});
  for(const [id,name] of result.nodes)addClass(model.actors.get(id),'classes',name);
  const all=model.messages,isMessage=m=>m.from!==undefined&&m.to!==undefined&&typeof m.message==='string';
  const current=all.filter(isMessage),old=(base?.messages??[]).filter(isMessage),key=m=>JSON.stringify([m.from,m.to,m.message]);
  const rows=Array.from({length:old.length+1},()=>new Uint32Array(current.length+1));
  for(let i=old.length-1;i>=0;i--)for(let j=current.length-1;j>=0;j--)rows[i][j]=key(old[i])===key(current[j])?1+rows[i+1][j+1]:Math.max(rows[i+1][j],rows[i][j+1]);
  const aligned=[];let i=0,j=0;
  while(i<old.length||j<current.length) {
    if(i<old.length&&j<current.length&&key(old[i])===key(current[j])){aligned.push({...current[j++]});i++;}
    else if(i<old.length&&j<current.length&&old[i].from===current[j].from&&old[i].to===current[j].to&&rows[i][j]===rows[i+1][j+1]) {aligned.push({...old[i++],diff:'removed'},{...current[j++],diff:'added'});}
    else if(i<old.length&&(j===current.length||rows[i+1][j]>=rows[i][j+1]))aligned.push({...old[i++],diff:'removed'});
    else aligned.push({...current[j++],diff:'added'});
  }
  const merged=[];
  for(let n=0;n<aligned.length;n++) {
    const a=aligned[n],b=aligned[n+1];
    if(a.diff&&b?.diff&&a.diff!==b.diff&&a.from===b.from&&a.to===b.to) {
      const next=a.diff==='added'?a:b,previous=a.diff==='removed'?a:b;
      merged.push({...next,diff:'changed'});result.changes.push(`~ message ${a.from} -> ${a.to}: ${previous.message} -> ${next.message}`);n++;
    } else {merged.push(a);if(a.diff)result.changes.push(`${a.diff==='added'?'+':'-'} message ${a.from} -> ${a.to}${labelDetail(a.message)}`);}
  }
  const withControls=[];let cursor=0;
  for(const message of merged) {
    if(message.diff!=='removed') {
      while(cursor<all.length&&!isMessage(all[cursor]))withControls.push(all[cursor++]);
      cursor++;
    }
    withControls.push(message);
  }
  withControls.push(...all.slice(cursor));
  const positions=new Map();
  model.messages=withControls.map((message,index)=>{
    if(message.diff!=='removed')positions.set(message.id,index);
    message.id=String(index);
    if(message.diff){addClass(message,'classes',message.diff);result.edges.set(`i${index}`,message.diff);message.message=diffLabel(message.diff,message.message);}
    return message;
  });
  for(const entries of [model.createdActors,model.destroyedActors])for(const [id,index] of entries)entries.set(id,positions.get(String(index))??index);
}
export function overlayModels(current,base=null) {
  // Pele brands parse models internally. Consume the current model to keep that brand.
  const result={model:current,nodes:new Map(),edges:new Map(),changes:[],classes:[]};
  if(!['flowchart','state','sequence'].includes(current.type)||base&&base.type!==current.type) {
    result.unsupported=`Proposal overlays are unsupported for ${base&&base.type!==current.type?'a change of diagram type':current.type}.`;return result;
  }
  ({flowchart,state,sequence}[current.type])(result.model,base,result);
  result.classes=diffClasses.filter(name=>[...result.nodes.values(),...result.edges.values()].includes(name));
  return result;
}
const decode=value=>value.replace(/&(amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,(_,s)=>s[0]==='#'?String.fromCodePoint(parseInt(s.slice(s[1]==='x'?2:1),s[1]==='x'?16:10)):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[s]);
export function stampOverlay(svg,overlay) {
  return svg.replace(/<g\b[^>]*>/g,tag=>{
    const classes=/\bclass="([^"]*)"/.exec(tag),id=/\bdata-id="([^"]*)"/.exec(tag);
    if(!classes||!id)return tag;
    const name=/\bpele-(?:edge|edge-label)\b/.test(classes[1])?overlay.edges.get(decode(id[1])):
      /\bpele-(?:node|cluster)\b/.test(classes[1])?overlay.nodes.get(decode(id[1])):null;
    return name?tag.replace(classes[0],`class="${[...new Set([...words(classes[1]),name])].join(' ')}"`):tag;
  });
}
export function overlayStyles() {
  const shape=':is(rect,path,polygon,circle,ellipse)';
  return `:root{--arch-added:var(--accent,#6a5ad0);--arch-changed:var(--accent,#6a5ad0);--arch-removed:var(--text-tertiary,#737373)}:root[data-theme="dark"]{--arch-added:var(--accent,#ab9fff);--arch-changed:var(--accent,#ab9fff);--arch-removed:var(--text-tertiary,#a3a3a3)}
${diffClasses.map(name=>`[data-sdg-arch] .pele :is(.pele-node,.pele-cluster).${name}>${shape}{stroke:var(--arch-${name});stroke-width:2.5px;stroke-dasharray:${name==='changed'?'4 3':name==='removed'?'5 4':'none'}}
[data-sdg-arch] .pele .pele-edge.${name},[data-sdg-arch] .pele .pele-edge.${name}>:is(path,line,polyline){stroke:var(--arch-${name});stroke-width:2.25px;stroke-dasharray:${name==='changed'?'4 3':name==='removed'?'5 4':'none'}}
[data-sdg-arch] .pele .pele-edge.${name} .pele-marker{fill:var(--arch-${name});stroke:var(--arch-${name});stroke-dasharray:none}
[data-sdg-arch] .pele .pele-edge-label.${name}{fill:var(--arch-${name})}`).join('\n')}
[data-sdg-arch] .pele :is(.pele-node,.pele-cluster,.pele-edge).removed{opacity:.5}
[data-sdg-arch] .pele .pele-edge-label.removed text{opacity:.5}
.arch-key.changed .arch-swatch{border:2.5px dashed var(--arch-color);background:transparent}.arch-key.added .arch-swatch{border-width:2.5px;background:transparent}.arch-key.removed .arch-swatch{border:2px dashed var(--arch-color);background:transparent;opacity:.5}
.arch-comparison{margin-bottom:16px;color:var(--text-secondary,var(--text));font-size:12px}`;
}
export async function buildOverlay(config,file,{base,browser,snapshot}={}) {
  snapshot??=new Map();
  const old=await readBase(base,file),bytes=readFileSync(file);snapshot.set(file,bytes);
  const text=bytes.toString('utf8');
  const checked=inspectArch(text,Infinity);
  if(checked.problems.length)throw Error(checked.problems.join('\n'));
  const overlay=overlayModels(checked.model,old.text===null?null:parse(old.text));
  const built=await buildArch(config,file,{model:overlay.model,browser,snapshot});
  const frame=built.frames[0],used=new Set(checked.classes);
  for(const match of frame.html.matchAll(/<g\b[^>]*\bclass="([^"]*)"/g))for(const name of words(match[1]))if(vocabulary.includes(name))used.add(name);
  const names=[...vocabulary.filter(name=>used.has(name)),...overlay.classes];
  const swatches=names.map(name=>`<span class="arch-key ${name}" style="--arch-color:var(--arch-${name})"><i class="arch-swatch"></i>${name}</span>`).join('');
  let html=stampOverlay(frame.html,overlay);
  if(swatches)html=html.includes('class="arch-legend"')?html.replace(/<div class="arch-legend">[\s\S]*?<\/div>/,()=>`<div class="arch-legend">${swatches}</div>`):html.replace('<section data-sdg-arch>',()=>`<section data-sdg-arch><div class="arch-legend">${swatches}</div>`);
  html=html.replace(/(<section data-sdg-arch>)([\s\S]*?)(<svg\b)/,(_,start,legend,svg)=>`${start}${legend}<div class="arch-comparison">Compared with ${base.sha.slice(0,7)} (${escape(base.rev)})</div>${svg}`);
  const css=overlayStyles()+'\n'+built.css;
  const plain=value=>decode(value.replace(/<br\s*\/?>/gi,' ').replace(/<\/?(?:b|i|em|strong|span|code)\b[^>]*>/gi,''));
  const note=[frame.note,overlay.unsupported,...overlay.changes.map(plain)].filter(Boolean).join('\n');
  const output={...frame,html,note};
  output.document=theme=>`<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div data-sdg-frame="default">${html}</div></body></html>`;
  return {...built,frames:[output],css,baseBlob:old.blob};
}
