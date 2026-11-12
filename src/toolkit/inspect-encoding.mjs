import { resourceSlotIdentity } from './frame-identity.mjs';
import { styleDefaults } from './inspect-styles.mjs';

const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const clone=value=>structuredClone(value);
const boxKeys=['x','y','width','height'];
const properties=Object.keys(styleDefaults);
const shortDigest=s=>Buffer.from(s,'hex').toString('base64url');
const fullDigest=s=>Buffer.from(s,'base64url').toString('hex');
const stability=['semantic','authored','positional','resource'];
const box=value=>value===null?null:boxKeys.map(k=>value[k]);
const unbox=value=>value===null?null:Object.fromEntries(boxKeys.map((k,i)=>[k,value[i]]));

/** The same expansion is used by --expand, human output and the independent live audit. */
export function styleValues(data,element) {
  const result={};
  for(const key of element.style??[])for(const [property,value]of Object.entries(data.tables.styles[key]??{})){
    result[property]=value==='$width'||value==='$height'?{css:element.geometry.layoutSize[value.slice(1)]+'px',attribution:'raw'}:data.tables.values[value];
  }
  return result;
}

function geometryScene(scene,encode) {
  const nodes=new Map([...scene.context,...scene.elements].map(e=>[e.id,e]));
  const done=new Set();
  function visit(e){if(done.has(e.id))return;done.add(e.id);const parent=nodes.get(e.parent);if(parent)visit(parent);
    const g=e.geometry;if(!g)return;
    if(encode){
      // Parent geometry has already been encoded: keep its original effective clip separately.
      const clip=g.clip;const above=parent?clips.get(parent.id):{x:0,y:0,...scene.size};
      if(g.box){
        if(same(g.visibleBox,g.box))delete g.visibleBox;
        if(e.namespace==='html'&&same(g.layoutSize,{width:g.box.width,height:g.box.height}))delete g.layoutSize;
        if(same(g.clip,above))delete g.clip;
        if(g.clipAccuracy==='rect')delete g.clipAccuracy;
        if(g.visibility==='visible')delete g.visibility;
      }
      clips.set(e.id,clip??above);
      for(const k of ['box','visibleBox','clip'])if(k in g)g[k]=box(g[k]);
      if(g.layoutSize)g.layoutSize=[g.layoutSize.width,g.layoutSize.height];
      if(g.clientRects)g.clientRects=g.clientRects.map(box);
    }else{
      for(const k of ['box','visibleBox','clip'])if(k in g)g[k]=unbox(g[k]);
      if(g.layoutSize)g.layoutSize={width:g.layoutSize[0],height:g.layoutSize[1]};
      if(g.clientRects)g.clientRects=g.clientRects.map(unbox);
      if(g.box){
        g.visibility??='visible';if(!('visibleBox'in g))g.visibleBox=clone(g.box);
        if(e.namespace==='html')g.layoutSize??={width:g.box.width,height:g.box.height};
        g.clip??=clone(parent?.geometry?.clip??{x:0,y:0,...scene.size});g.clipAccuracy??='rect';
      }
    }
  }
  const clips=new Map();for(const e of nodes.values())visit(e);
}

const defaults={namespace:'html',parent:null,children:[],role:null,name:null,a11y:'ignored',attributes:{}};
function sceneDefaults(scene,encode,fields){
  for(const e of [...scene.context,...scene.elements]){
    for(const [k,v]of Object.entries(defaults)){
      if(encode){if(same(e[k],v))delete e[k];}
      else if(!(k in e)&&(fields.includes('structure')||!['role','name','a11y','attributes'].includes(k)))e[k]=clone(v);
    }
  }
}

function changes(before,after){
  const set={},unset=[];
  for(const [key,value]of Object.entries(after))if(!same(value,before[key]))set[key]=value;
  for(const key of Object.keys(before))if(!(key in after))unset.push(key);
  return {...set,...(unset.length?{unset}:{})};
}
function sceneDelta(before,after){
  const delta={};
  for(const field of ['elements','context','runs']){
    const a=new Map(before[field].map(e=>[rowId(e),e])),b=new Map(after[field].map(e=>[rowId(e),e]));
    const added=after[field].filter(e=>!a.has(rowId(e))),removed=before[field].filter(e=>!b.has(rowId(e))).map(rowId),changed=[];
    const styles=[];
    for(const e of after[field])if(a.has(rowId(e))){const previous=a.get(rowId(e)),diff=changes(previous,e);
      if(field!=='runs'&&diff[3]&&previous[3]?.length===e[3].length){styles.push([rowId(e),...e[3].flatMap((key,i)=>key===previous[3][i]?[]:[i,key])]);delete diff[3];}
      if(Object.keys(diff).length)changed.push({id:rowId(e),...diff});}
    const order=after[field].map(rowId),oldOrder=before[field].filter(e=>b.has(rowId(e))).map(rowId).concat(added.map(rowId));
    if(added.length||removed.length||changed.length||styles.length||!same(order,oldOrder))delta[field]={...(added.length?{added}:{}),...(removed.length?{removed}:{}),...(changed.length?{changed}:{}),...(styles.length?{styles}:{}),...(!same(order,oldOrder)?{order}:{})};
  }
  for(const field of ['roots','size','instances'])if(!same(before[field],after[field]))delta[field]=after[field];
  return delta;
}
function applyDelta(baseline,delta){
  const scene=clone(baseline);
  for(const field of ['elements','context','runs'])if(delta[field]){
    const diff=delta[field],map=new Map(scene[field].filter(e=>!diff.removed?.includes(rowId(e))).map(e=>[rowId(e),e]));
    for(const e of diff.added??[])map.set(rowId(e),clone(e));
    for(const {id,unset=[],...change}of diff.changed??[]){const e=map.get(id);if(!e)throw Error('Invalid inspect delta element '+id);Object.assign(e,clone(change));for(const key of unset)delete e[key];}
    for(const [id,...pairs]of diff.styles??[]){const row=map.get(id);for(let i=0;i<pairs.length;i+=2)row[3][pairs[i]]=pairs[i+1];}
    scene[field]=(diff.order??[...map.keys()]).map(id=>map.get(id));
  }
  for(const field of ['roots','size','instances'])if(field in delta)scene[field]=clone(delta[field]);
  return scene;
}
const rowId=e=>Array.isArray(e)?e[0]:e.id??e.element+'/text-'+e.slot;

// Fixed protocol columns keep repeated JSON property names out of large surfaces.
// Extras retain uncommon facts by name; this is JSON, not an opaque compressed blob.
export const elementColumns=['id','tag','children','style','geometry','extra'];
function packScene(scene,data){
  const svg=svgSlots(scene,data.tables);
  const pack=e=>{const {id,tag,children,style,geometry,parent,...extra}=e;
    const above=nodes.get(parent);
    const inferred=tag==='svg'||above?.namespace==='svg'&&above.tag!=='foreignObject'?'svg':'html';
    if((e.namespace??'html')===inferred)delete extra.namespace;
    if(extra.attributes&&svg.has(id)){
      const attrs={...extra.attributes};for(const [k,v]of Object.entries(svg.get(id)))if(attrs[k]===v)delete attrs[k];
      if(Object.keys(attrs).length)extra.attributes=attrs;else delete extra.attributes;
    }
    if(extra.owner===above?.owner)delete extra.owner;
    else if(extra.owner===undefined&&above?.owner)extra.owner=null;
    if(extra.markers&&same(extra.markers,data.partInstances.filter(i=>i.root===id).map(i=>i.part)))delete extra.markers;
    const ownRuns=scene.runs.filter(r=>r.element===id).map(r=>r.id);
    if(extra.text&&same(extra.text,ownRuns))delete extra.text;
    if('a11y'in extra||'role'in extra||'name'in extra){
      const semantics=[extra.role??null,extra.name??null,extra.a11y??'ignored'];
      const table=data.tables.a11y??=[];let key=table.findIndex(r=>same(r,semantics));if(key<0){key=table.length;table.push(semantics);}
      delete extra.role;delete extra.name;extra.a11y=key;
    }
    let g=geometry??null;
    if(g&&Object.keys(g).length===1&&Array.isArray(g.box))g=g.box;

    const row=[id,tag,children??[],style??null,g];
    if(Object.keys(extra).length)row.push(extra);return row;};
  const nodes=new Map([...scene.context,...scene.elements].map(e=>[e.id,e]));
  scene.runs=scene.runs.map(r=>{
    const {id,normalized,style,fragments,...rest}=r,owner=nodes.get(r.element),slot=id.slice(id.lastIndexOf('/text-')+6);
    const simple=fragments.length===1&&fragments[0].element===r.element&&fragments[0].start===0&&fragments[0].end===r.raw.length;
    return {element:r.element,slot,...(r.kind!=='dom'?{kind:r.kind}:{}),raw:r.raw,
      ...(!same(style,owner?.style)?{style}:{}),...(simple?{boxes:fragments[0].boxes,...(fragments[0].accuracy!=='range'?{accuracy:fragments[0].accuracy}:{})}:{fragments}),
      ...(normalized!==r.raw.normalize('NFC').replace(/\p{White_Space}+/gu,' ').trim()?{normalized}:{}),
      ...(rest.kind!==r.kind?rest:{})};
  });
  scene.context=scene.context.map(pack);scene.elements=scene.elements.map(pack);
}
function unpackScene(scene,data){
  for(const row of [...scene.context,...scene.elements])if(typeof row[1]==='number'){
    const [tag,semantics,namespace]=data.tables.elementTypes[row[1]];row[1]=tag;
    row[5]={...(semantics===null?{}:{a11y:semantics}),...(namespace?{namespace}:{}),...row[5]};
  }
  const unpack=([id,tag,children,style,geometry,extra={}])=>({id,tag,...(children.length?{children}:{}),...(style?{style}:{}),...(geometry?{geometry:Array.isArray(geometry)?{box:geometry}:geometry}:{}),...extra});
  scene.context=scene.context.map(unpack);scene.elements=scene.elements.map(unpack);
  const nodes=new Map([...scene.context,...scene.elements].map(e=>[e.id,e]));
  for(const e of nodes.values())for(const id of e.children??[])if(nodes.has(id))nodes.get(id).parent=e.id;
  const visited=new Set();
  function inherited(e){if(visited.has(e.id))return;visited.add(e.id);const parent=nodes.get(e.parent);if(parent)inherited(parent);
    e.namespace??=e.tag==='svg'||parent?.namespace==='svg'&&parent.tag!=='foreignObject'?'svg':'html';
    if(e.owner===null)delete e.owner;else if(!('owner'in e)&&parent?.owner)e.owner=parent.owner;
    if(typeof e.a11y==='number'){const [role,name,a11y]=data.tables.a11y[e.a11y];e.role=role;e.name=name;e.a11y=a11y;}
    if(data.selection.fields.includes('structure')){const markers=data.partInstances.filter(i=>i.root===e.id).map(i=>i.part);if(markers.length)e.markers??=markers;}
  }
  for(const e of nodes.values())inherited(e);
  if(data.selection.fields.includes('structure'))for(const [id,attrs]of svgSlots(scene,data.tables))nodes.get(id).attributes={...attrs,...nodes.get(id).attributes};
  scene.runs=scene.runs.map(r=>{
    const {slot,boxes,accuracy,fragments,normalized,style,...rest}=r,owner=nodes.get(r.element);
    const resolved=style??owner?.style;
    return {id:r.element+'/text-'+slot,kind:r.kind??'dom',...rest,normalized:normalized??r.raw.normalize('NFC').replace(/\p{White_Space}+/gu,' ').trim(),...(resolved?{style:resolved}:{}),fragments:fragments??[{element:r.element,start:0,end:r.raw.length,boxes,accuracy:accuracy??'range'}]};
  });
  for(const r of scene.runs){const node=nodes.get(r.element)??[...nodes.values()].flatMap(e=>e.pseudo??[]).find(p=>p.id===r.element);if(node&&!node.text)(node.text=[]);if(node&&!node.text.includes(r.id))node.text.push(r.id);}
}

function svgSlots(scene,tables){
  const nodes=new Map([...scene.context,...scene.elements].map(e=>[e.id,e])),result=new Map();
  for(const root of nodes.values())if(tables.resources[root.resource]?.svg){const definition=tables.resources[root.resource].svg.geometry;let slot=0;
    function visit(e){const fact=definition[slot++];if(fact&&fact.tag===e.tag)result.set(e.id,Object.fromEntries(Object.entries(fact.attributes).filter(([,v])=>v!=='embedded')));for(const id of e.children??[])if(nodes.has(id))visit(nodes.get(id));}
    // Depth-limited queries cannot align omitted resource slots; leave their attributes explicit.
    const count=e=>1+(e.children??[]).reduce((n,id)=>n+(nodes.has(id)?count(nodes.get(id)):0),0);
    if(count(root)===definition.length)visit(root);
  }
  return result;
}

function elementTypes(scene,tables){
  const types=tables.elementTypes??=[];
  for(const row of [...scene.context,...scene.elements]){
    const extra=row[5]??{},type=[row[1],extra.a11y??null,...(extra.namespace?[extra.namespace]:[])];
    let key=types.findIndex(t=>same(t,type));if(key<0){key=types.length;types.push(type);}
    row[1]=key;delete extra.a11y;delete extra.namespace;
    if(!Object.keys(extra).length)row.length=5;
  }
}

function packStyles(styles,dictionary){
  const previous=new Map();
  for(const [key,style]of Object.entries(styles)){
    const pairs=Object.entries(style).flatMap(([p,v])=>[dictionary.indexOf(p),v]);let packed=pairs;
    for(const [base,other]of previous){
      // Exact dictionary differences; source records already partition the property groups.
      const diff=Object.entries(style).filter(([p,v])=>other[p]!==v).flatMap(([p,v])=>[dictionary.indexOf(p),v]);
      const removed=Object.keys(other).filter(p=>!(p in style)).map(p=>dictionary.indexOf(p));
      const candidate=[base,diff,...(removed.length?[removed]:[])];
      if(JSON.stringify(candidate).length<JSON.stringify(packed).length)packed=candidate;
    }
    previous.set(key,style);styles[key]=packed;
  }
}
function unpackStyles(styles,dictionary){
  const resolved=new Map();
  function read(key){if(resolved.has(key))return resolved.get(key);const row=styles[key];
    const based=typeof row[0]==='string',pairs=based?row[1]:row;
    const style={...(based?read(row[0]):{}),...Object.fromEntries(Array.from({length:pairs.length/2},(_,i)=>[dictionary[pairs[i*2]],pairs[i*2+1]]))};
    for(const p of based?row[2]??[]:[])delete style[dictionary[p]];resolved.set(key,style);return style;
  }
  for(const key of Object.keys(styles))read(key);for(const [key,value]of resolved)styles[key]=value;
}

const round=n=>Math.round(n*100)/100||0;
function moveGeometry(value,origin,direction){
  if(!value)return;
  const rect=r=>{if(r){r[0]=round(r[0]+direction*origin[0]);r[1]=round(r[1]+direction*origin[1]);}};
  if(Array.isArray(value)){rect(value);return;}
  for(const field of ['box','visibleBox','clip'])if(value[field])rect(value[field]);
  for(const r of value.clientRects??[])rect(r);
}
function localAddresses(value,map,key=''){
  if(key==='attributes'&&value)return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['href','for','aria-labelledby','aria-describedby'].includes(k)?localAddresses(v,map,'element'):v]));
  if(typeof value==='string'&&addressFields.has(key))return value.replace(/(?:^|(?<=#))(?:e[0-9a-z]+|@\d+)(?=::|\/text-|$)/g,id=>map.get(id)??id);
  if(Array.isArray(value))return value.map(v=>localAddresses(v,map,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,localAddresses(v,map,k)]));
  return value;
}
/** Exact subtree sharing, only when the definition plus every instance is smaller. */
function templateScene(scene,tables){
  const nodes=new Map(scene.elements.map(e=>[e.id,e])),groups=new Map();
  for(const root of scene.elements){
    if(!root.children?.length||!root.geometry?.box)continue;
    const subtree=[];function visit(e){subtree.push(e);for(const id of e.children??[])if(nodes.has(id))visit(nodes.get(id));}visit(root);
    const ids=subtree.map(e=>e.id),mapping=new Map(ids.map((id,i)=>[id,'@'+i])),origin=root.geometry.box.slice(0,2);
    const ownRuns=scene.runs.filter(r=>ids.includes(r.element.replace(/::.+$/,'')));
    const normalized=localAddresses({elements:subtree,runs:ownRuns},mapping);
    normalized.elements[0].parent='$parent';
    for(const e of normalized.elements){moveGeometry(e.geometry,origin,-1);if(e.owner===root.owner&&e.owner)e.owner='$owner';}
    for(const r of normalized.runs)for(const f of r.fragments)for(const b of f.boxes){b.x=round(b.x-origin[0]);b.y=round(b.y-origin[1]);}
    const key=JSON.stringify(normalized),group=groups.get(key)??{definition:normalized,items:[]};
    group.items.push({root,ids,origin,at:scene.elements.indexOf(root)});groups.set(key,group);
  }
  const removed=new Set(),removedRuns=new Set();
  for(const group of [...groups.values()].sort((a,b)=>b.definition.elements.length-a.definition.elements.length)){
    const available=group.items.filter(i=>i.ids.every(id=>!removed.has(id)));if(available.length<2)continue;
    const key='t'+Object.keys(tables.templates).length;
    const instances=available.map(i=>({at:i.at,template:key,ids:i.ids,origin:i.origin,parent:i.root.parent??null,...(i.root.owner?{owner:i.root.owner}:{})}));
    const oldBytes=available.reduce((n,i)=>n+JSON.stringify(i.ids.map(id=>nodes.get(id))).length,0),newBytes=JSON.stringify(group.definition).length+JSON.stringify(instances).length;
    if(newBytes>=oldBytes)continue;
    tables.templates[key]=group.definition;scene.instances.push(...instances);
    for(const i of available)for(const id of i.ids){removed.add(id);for(const r of scene.runs)if(r.element===id||r.element.startsWith(id+'::'))removedRuns.add(r.id);}
  }
  scene.elements=scene.elements.filter(e=>!removed.has(e.id));scene.runs=scene.runs.filter(r=>!removedRuns.has(r.id));
  scene.instances.sort((a,b)=>a.at-b.at);
}
function expandTemplates(scene,tables){
  if(!scene.instances.length)return;
  const nodes=scene.elements;
  for(const instance of scene.instances){
    const definition=clone(tables.templates[instance.template]);unpackScene(definition,{tables,selection:{fields:[]},partInstances:[]});
    const map=new Map(instance.ids.map((id,i)=>['@'+i,id]));let {elements,runs}=localAddresses(definition,map);
    elements[0].parent=instance.parent;
    for(const e of elements){moveGeometry(e.geometry,instance.origin,1);if(e.owner==='$owner')e.owner=instance.owner;}
    for(const r of runs)for(const f of r.fragments)for(const b of f.boxes){b.x=round(b.x+instance.origin[0]);b.y=round(b.y+instance.origin[1]);}
    // Return packed rows for the normal theme-delta stage.
    const packed={context:[],elements,runs};packScene(packed,{tables,partInstances:[]});elementTypes(packed,tables);
    nodes.splice(instance.at,0,...packed.elements);scene.runs.push(...packed.runs);
  }
  // Text order follows the original full-frame DOM run order, stored once for templates.
  if(scene.runOrder){const order=new Map(scene.runOrder.map((id,i)=>[id,i]));scene.runs.sort((a,b)=>order.get(rowId(a))-order.get(rowId(b)));delete scene.runOrder;}
  scene.instances=[];
}

const addressFields=new Set(['id','parent','children','roots','element','elements','root','href','for','aria-labelledby','aria-describedby','text','runs','removed','order','ids']);
function addresses(value,map,encode,key=''){
  if(key==='attributes'&&value){const links=new Set(['href','for','aria-labelledby','aria-describedby']);
    const link=v=>{if(Array.isArray(v))return v.map(link);if(!encode&&v&&typeof v==='object'&&'literal'in v)return v.literal;
      if(encode&&typeof v==='string'&&!/e1_[a-f0-9]{24}/.test(v)&&/^#?(?:e[0-9a-z]+|\d+)(?=::|\/text-|$)/.test(v))return {literal:v};
      return addresses(v,map,encode,'element');};
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,links.has(k)?link(v):v]));
  }
  if(typeof value==='string')return addressFields.has(key)?value.replace(encode?/e1_[a-f0-9]{24}/g:/(?:^|(?<=#))e[0-9a-z]+(?=::|\/text-|$)/g,id=>map.get(id)??id):value;
  if(Array.isArray(value))return value.map(v=>addresses(v,map,encode,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,addresses(v,map,encode,k)]));
  return value;
}

// Array indices are output-local table keys. Stable e1_ addresses live once in identities.
function indexTables(data,encode){
  const names=['values','styles','references','parts','resources','identities','duplicates'];
  const prefixes={values:'v',styles:'s',references:'r',parts:'p',resources:'r',identities:'e',duplicates:'d'};
  const maps=Object.fromEntries(names.map(name=>[name,new Map(encode?Object.keys(data.tables[name]??{}).map((k,i)=>[k,i]):(data.tables[name]??[]).map((_,i)=>[i,prefixes[name]+(name==='identities'?i.toString(36):i)]))]));
  if(!encode)data.partInstances=data.partInstances.map(([part,root,parent],i)=>({id:'i'+i,part,root,parent:parent===null?null:'i'+parent}));
  const owners=new Map(data.partInstances.map((p,i)=>encode?[p.id,i]:[i,p.id]));
  const ref=(name,key)=>maps[name].get(key)??key;
  function address(value){if(encode&&typeof value==='string'){
    if(maps.identities.has(value))return ref('identities',value);
    return value.replace(/(?:^|(?<=#))e[0-9a-z]+(?=::|\/text-|$)/g,key=>String(ref('identities',key)));
  }if(!encode){if(typeof value==='number')return ref('identities',value);if(typeof value==='string')return value.replace(/(?:^|(?<=#))\d+(?=::|\/text-|$)/g,key=>ref('identities',Number(key)));}return value;}
  function node(row){row[0]=address(row[0]);row[2]=row[2].map(address);if(row[3])row[3]=row[3].map(k=>ref('styles',k));const e=row[5];if(!e)return;
    if(e.owner!==undefined&&e.owner!==null)e.owner=owners.get(e.owner);
    if(e.markers)e.markers=e.markers.map(k=>ref('parts',k));if(e.resource!==undefined)e.resource=ref('resources',e.resource);if(e.backgrounds)e.backgrounds=e.backgrounds.map(k=>ref('resources',k));
    if(e.text)e.text=e.text.map(address);
    for(const p of e.pseudo??[]){p.id=address(p.id);if(p.style)p.style=p.style.map(k=>ref('styles',k));if(p.text)p.text=p.text.map(address);}
    for(const k of ['href','for','aria-labelledby','aria-describedby'])if(e.attributes?.[k])e.attributes[k]=Array.isArray(e.attributes[k])?e.attributes[k].map(address):address(e.attributes[k]);
  }
  function run(r){r.element=address(r.element);if(r.id)r.id=address(r.id);if(r.style)r.style=r.style.map(k=>ref('styles',k));for(const f of r.fragments??[])f.element=address(f.element);}
  function scene(s){if(s.roots)s.roots=s.roots.map(address);s.context.forEach(node);s.elements.forEach(node);s.runs.forEach(run);
    if(s.runOrder)s.runOrder=s.runOrder.map(address);
    for(const i of s.instances??[]){i.ids=i.ids.map(address);i.parent=address(i.parent);if(i.owner!==undefined)i.owner=owners.get(i.owner);}
  }
  scene(data.baseline);
  for(const definition of Object.values(data.tables.templates))scene(definition);
  if(data.delta){const d=data.delta;if(d.roots)d.roots=d.roots.map(address);
    for(const field of ['elements','context','runs'])if(d[field]){const diff=d[field];
      if(diff.removed)diff.removed=diff.removed.map(address);if(diff.order)diff.order=diff.order.map(address);
      for(const row of diff.styles??[]){row[0]=address(row[0]);for(let i=2;i<row.length;i+=2)row[i]=ref('styles',row[i]);}
      for(const r of diff.added??[])field==='runs'?run(r):node(r);
      for(const r of diff.changed??[]){r.id=address(r.id);if(field==='runs'){if(r.style)r.style=r.style.map(k=>ref('styles',k));if(r.element!==undefined)r.element=address(r.element);}
        else{if(r[2])r[2]=r[2].map(address);if(r[3])r[3]=r[3].map(k=>ref('styles',k));if(r[5]){const fake=[null,null,[],null,null,r[5]];node(fake);}}}
    }
  }
  for(const m of data.matches){m.element=address(m.element);if(m.runs)m.runs=m.runs.map(address);}
  for(const l of data.limitations)l.elements=l.elements.map(address);
  for(const p of data.partInstances){p.part=ref('parts',p.part);p.root=address(p.root);}
  if(encode)data.partInstances=data.partInstances.map(p=>[p.part,p.root,p.parent===null?null:owners.get(p.parent)]);
  for(const value of Object.values(data.tables.values))if(Array.isArray(value))value[1]=value[1].map(k=>ref('references',k));
  for(const row of Object.values(data.tables.styles)){
    const based=encode?typeof row[0]==='string':Array.isArray(row[0]),pairs=based?row[1]:row;
    if(based)row[0]=encode?[ref('styles',row[0])]:ref('styles',row[0][0]);
    for(let i=1;i<pairs.length;i+=2)pairs[i]=ref('values',pairs[i]);
  }
  for(const row of Object.values(data.tables.identities)){if(row.length===2)row[0]=ref('identities',row[0]);if(Array.isArray(row[3]))row[3][0]=ref('duplicates',row[3][0]);else if(row[3]?.duplicate)row[3].duplicate[0]=ref('duplicates',row[3].duplicate[0]);}
  // CSS url(rN) also uses the resource table, including in pseudo content.
  function urls(v){if(typeof v==='string')return v.replace(/url\(r(\d+)\)/g,(_,n)=>'url('+ (encode?'r'+ref('resources','r'+n):ref('resources',Number(n))) +')');
    if(Array.isArray(v))return v.map(urls);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,urls(x)]));return v;}
  data.tables.values=urls(data.tables.values);
  for(const name of names){const table=data.tables[name];if(!table){if(encode)continue;delete data.tables[name];continue;}
    data.tables[name]=encode?Object.values(table):Object.fromEntries(Object.entries(table).map(([k,v])=>[ref(name,Number(k)),v]));}
}

function factTables(data,encode){
  const t=data.tables;
  if(encode){
    for(const [key,r]of Object.entries(t.references)){
      const flags=(r.kind==='alias'?2:r.kind==='fallback'?4:0)|(r.inherited?1:0),extra={};
      if(r.expression!==`var(${r.token})`)extra.expression=r.expression;
      if(r.via?.length)extra.via=r.via;if(r.localOverrides?.length)extra.localOverrides=r.localOverrides.map(d=>[d.name,d.declaration]);
      if(r.basis)extra.basis=r.basis;
      t.references[key]=[r.token,t.properties.indexOf(r.property),flags,...(Object.keys(extra).length?[extra]:[])];
    }
    if(Object.keys(t.tokens).length){t.tokenSource=Object.values(t.tokens)[0].source;
      for(const [name,r]of Object.entries(t.tokens)){const extra={};if(r.source!==t.tokenSource)extra.source=r.source;if(r.resolved!==r.declaration)extra.resolved=r.resolved;
        if(r.dark){extra.dark={...r.dark};}
        t.tokens[name]=[r.line,r.declaration,...(Object.keys(extra).length?[extra]:[])];}
    }
    for(const r of Object.values(t.resources))if(r.svg){r.svg.geometry=r.svg.geometry.map(n=>[n.tag,n.attributes,n.children]);if(r.mime==='image/svg+xml')delete r.mime;}
  }else{
    for(const [key,[token,p,flags,extra={}]]of Object.entries(t.references)){
      const {localOverrides,...rest}=extra;t.references[key]={token,property:t.properties[p],kind:flags&4?'fallback':flags&2?'alias':'direct',expression:extra.expression??`var(${token})`,...(flags&1?{inherited:true}:{}),...rest,...(localOverrides?{localOverrides:localOverrides.map(([name,declaration])=>({name,declaration}))}:{})};
    }
    for(const [name,[line,declaration,extra={}]]of Object.entries(t.tokens)){
      const {dark,...rest}=extra;t.tokens[name]={source:t.tokenSource,line,declaration,resolved:declaration,...rest,...(dark?{dark}:{})};
    }
    delete t.tokenSource;
    for(const r of Object.values(t.resources))if(r.svg){r.mime??='image/svg+xml';r.svg.geometry=r.svg.geometry.map(([tag,attributes,children],i)=>({id:'g'+i,tag,attributes,children}));}
  }
}

export function compactInspection(input) { return compact(input,true); }

function compact(input,templates) {
  if(input.encoding==='compact'||input.mode==='catalog')return input;
  let data=clone(input);data.tables.a11y=[];
  const scenes=[data.baseline,...Object.values(data.additionalThemes)],identities={},ids=new Map(),groups={},groupKeys=new Map(),allNodes=new Map(scenes.flatMap(s=>[...s.context,...s.elements]).map(e=>[e.id,e])),originalIdentity=new Map();
  for(const scene of scenes)for(const e of [...scene.context,...scene.elements])if(!ids.has(e.id)){
    const key='e'+ids.size.toString(36),{guard,stability:s,duplicate,...extra}=e.identity;
    ids.set(e.id,key);originalIdentity.set(e.id,e.identity);
    const row=[e.id,shortDigest(guard),stability.indexOf(s)];
    if(duplicate){let group=groupKeys.get(duplicate.group);if(!group){group='d'+groupKeys.size;groupKeys.set(duplicate.group,group);groups[group]=[shortDigest(duplicate.group),duplicate.count];}extra.duplicate=[group,duplicate.ordinal];}
    if(Object.keys(extra).length)row.push(Object.keys(extra).length===1&&extra.duplicate?extra.duplicate:extra);identities[key]=row;
  }
  for(const scene of scenes){geometryScene(scene,true);sceneDefaults(scene,true,data.selection.fields);for(const e of [...scene.context,...scene.elements])if(same(e.identity,originalIdentity.get(e.id)))delete e.identity;}
  for(const [full,key]of ids){const e=allNodes.get(full),ownIdentity=originalIdentity.get(full);if(ownIdentity.stability==='resource'){
    let parent=allNodes.get(e.parent);while(parent&&originalIdentity.get(parent.id)?.stability==='resource')parent=allNodes.get(parent.parent);
    if(parent)identities[key]=[ids.get(parent.id),ownIdentity.slot];
  }}
  for(const [key,group]of Object.entries(groups)){
    const members=Object.values(identities).filter(r=>(Array.isArray(r[3])?r[3][0]:r[3]?.duplicate?.[0])===key);
    if(members.length&&members.every(r=>r[1]===members[0][1])){group.push(members[0][1]);for(const row of members)row[1]=null;}
  }
  data=addresses(data,ids,true);data.tables.identities=identities;
  if(Object.keys(groups).length)data.tables.duplicates=groups;
  for(const [key,value]of Object.entries(data.tables.values))data.tables.values[key]=value.attribution==='raw'?value.css:[value.css,value.refs??[],...(value.reason?[value.reason]:[])];
  const used=new Set([...Object.values(data.tables.styles).flatMap(s=>Object.keys(s)),...Object.values(data.tables.references).map(r=>r.property)]);
  data.tables.properties=[...properties.filter(p=>used.has(p)),...[...used].filter(p=>!properties.includes(p)).sort()];
  packStyles(data.tables.styles,data.tables.properties);
  for(const ref of Object.values(data.tables.references))if(ref.basis==='authored_reference')delete ref.basis;
  for(const resource of Object.values(data.tables.resources))if(resource.svg)delete resource.svg.definitions;
  // Delta compares full logical rows; template instances never cause a second dark tree.
  const baselineBefore=clone(data.baseline);
  for(const scene of [data.baseline,...Object.values(data.additionalThemes)]){packScene(scene,data);elementTypes(scene,data.tables);}
  data.delta=Object.keys(data.additionalThemes).length?{theme:Object.keys(data.additionalThemes)[0],...sceneDelta(data.baseline,Object.values(data.additionalThemes)[0])}:null;
  delete data.additionalThemes;
  baselineBefore.runOrder=baselineBefore.runs.map(r=>r.id);if(templates)templateScene(baselineBefore,data.tables);
  if(baselineBefore.instances.length){
    packScene(baselineBefore,data);elementTypes(baselineBefore,data.tables);data.baseline=baselineBefore;
    for(const definition of Object.values(data.tables.templates)){definition.context=[];definition.instances=[];packScene(definition,data);elementTypes(definition,data.tables);}
  }
  factTables(data,true);
  indexTables(data,true);
  data.encoding='compact';
  // Judge the actual final wire size, including dictionaries and instances, not a pre-pack estimate.
  if(templates&&Object.keys(data.tables.templates).length){const ordinary=compact(input,false);if(Buffer.byteLength(JSON.stringify(ordinary))<=Buffer.byteLength(JSON.stringify(data)))return ordinary;}
  return data;
}

export function expandInspection(input) {
  if(input.encoding!=='compact')return clone(input);
  let data=clone(input);
  indexTables(data,false);
  factTables(data,false);
  expandTemplates(data.baseline,data.tables);
  data.additionalThemes=data.delta?{[data.delta.theme]:applyDelta(data.baseline,data.delta)}:{};
  for(const scene of [data.baseline,...Object.values(data.additionalThemes)])unpackScene(scene,data);
  const identities=data.tables.identities,ids=new Map(),resolvedMetadata=new Map();
  const nodes=new Map([data.baseline,...Object.values(data.additionalThemes)].flatMap(s=>[...s.context,...s.elements]).map(e=>[e.id,e]));
  function identity(key){if(resolvedMetadata.has(key))return resolvedMetadata.get(key);const row=identities[key];
    if(row.length===2){identity(row[0]);const e=nodes.get(key),resource=resourceSlotIdentity(ids.get(row[0]),row[1],e.tag,e.namespace==='svg'?'http://www.w3.org/2000/svg':e.namespace??'http://www.w3.org/1999/xhtml');ids.set(key,resource.id);resolvedMetadata.set(key,resource.identity);return resource.identity;}
    const duplicate=Array.isArray(row[3])?row[3]:row[3]?.duplicate;
    ids.set(key,row[0]);const value={stability:stability[row[2]],guard:fullDigest(row[1]??data.tables.duplicates[duplicate[0]][2])};resolvedMetadata.set(key,value);return value;
  }
  const metadata=new Map(Object.keys(identities).map(key=>[key,identity(key)]));
  for(const scene of [data.baseline,...Object.values(data.additionalThemes)]){
    sceneDefaults(scene,false,data.selection.fields);
    for(const e of [...scene.context,...scene.elements]){
      const [,guard,s,rawExtra={}]=identities[e.id],extra=Array.isArray(rawExtra)?{duplicate:rawExtra}:rawExtra,{duplicate,...rest}=extra;
      if(!e.identity)e.identity=identities[e.id].length===2?resourceSlotIdentity(ids.get(identities[e.id][0]),identities[e.id][1],e.tag,e.namespace==='svg'?'http://www.w3.org/2000/svg':e.namespace==='html'?'http://www.w3.org/1999/xhtml':e.namespace).identity:{...metadata.get(e.id),...rest};
      if(duplicate){const [group,count]=data.tables.duplicates[duplicate[0]];e.identity.duplicate={group:fullDigest(group),ordinal:duplicate[1],count};}
    }
    geometryScene(scene,false);
  }
  delete data.tables.identities;delete data.tables.duplicates;delete data.tables.a11y;delete data.tables.elementTypes;
  data.tables.templates={};
  for(const [key,value]of Object.entries(data.tables.values))data.tables.values[key]=typeof value==='string'?{css:value,attribution:'raw'}:{css:value[0],attribution:value[2]?'unresolved':'references',...(value[1].length?{refs:value[1]}:{}),...(value[2]?{reason:value[2]}:{})};
  unpackStyles(data.tables.styles,data.tables.properties);delete data.tables.properties;
  for(const ref of Object.values(data.tables.references))ref.basis??='authored_reference';
  for(const resource of Object.values(data.tables.resources))if(resource.svg)resource.svg.definitions=resource.svg.geometry.filter(d=>['defs','linearGradient','radialGradient','mask','clipPath'].includes(d.tag));
  data=addresses(data,ids,false);data.delta=null;data.encoding='expanded';return data;
}
