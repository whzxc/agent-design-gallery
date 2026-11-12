import { createHash } from 'node:crypto';
import { CliError } from '../cli-output.mjs';

export const identityVersion = 1;
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const normalize = value => value.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const namingAttributes = new Set(['id', 'data-part', 'role', 'aria-label', 'aria-labelledby', 'aria-describedby']);

export function resourceSlotIdentity(scope,slot,tag,namespace,hash=digest){
  return {id:`e1_${hash(JSON.stringify([scope,['resource-slot',slot]]))}`,identity:{stability:'resource',guard:hash(JSON.stringify(['resource-slot',scope,slot,tag,namespace])),slot}};
}

/** Assign on the complete raw inventory, before selection, folding or theme deltas. */
export function elementIdentities(nodes, { source, frame }, { hash = digest, metadata = true } = {}) {
  const children=new Map(nodes.map(n=>[n.path,[]])), byPath=new Map(nodes.map(n=>[n.path,n]));
  for(const n of nodes)children.get(n.parentPath)?.push(n);
  const result=new Map(),seen=new Map(),rootScope=JSON.stringify([identityVersion,source,frame]);
  const conflict=message=>{throw new CliError('INSPECT_IDENTITY_CONFLICT',message);};
  function describe(node){
    const attrs=node.attributes??{},owners=node.owners??[],keys=node.keys??[],anchor=attrs['data-adg-id'];
    let defining=owners,ancestor=byPath.get(node.parentPath);
    while(!defining.length&&ancestor){defining=ancestor.owners??[];ancestor=byPath.get(ancestor.parentPath);}
    if(anchor!==undefined&&(typeof anchor!=='string'||!anchor.trim()))conflict('data-adg-id must be a nonempty string.');
    const naming=Object.entries(attrs).filter(([name])=>namingAttributes.has(name)).sort(([a],[b])=>a.localeCompare(b));
    const signature=[node.namespace,node.tag,naming,node.semantic??null,node.password?'':normalize(node.directText??'')];
    const seed=anchor!==undefined?['anchor',anchor,owners,...keys]:keys.length?['key',keys,owners]:[node.neutral?'wrapper':'semantic',signature,defining];
    const boundary=!node.neutral&&(anchor!==undefined||keys.length||owners.length||naming.length||node.semantic?.name);
    return {node,signature,seed,defining,candidate:boundary,boundary:false,fixed:anchor!==undefined||keys.length>0,authored:anchor!==undefined||keys.length>0,strict:keys.length>0||anchor!==undefined&&!owners.length};
  }
  const descriptors=new Map(nodes.map(n=>[n.path,describe(n)]));
  function assign(record,scope,ordinal,count,inherited,resourceSlot){
    const duplicate=count>1, id=`e1_${hash(JSON.stringify([scope,record.seed,...(!record.strict&&duplicate?[ordinal]:[])]))}`;
    if(seen.has(id))conflict(`Element identity conflicts at ${source}#${frame}, paths ${seen.get(id)} and ${record.node.path}; use unique anchors or instance keys.`);
    seen.set(id,record.node.path);
    const positional=inherited||!record.strict&&duplicate;
    const identity=metadata?{stability:resourceSlot!==undefined?'resource':positional?'positional':record.authored?'authored':'semantic',guard:hash(JSON.stringify([record.node.namespace,record.node.tag,record.signature,scope,record.defining]))}:undefined;
    if(identity){
      if(resourceSlot!==undefined)identity.guard=resourceSlotIdentity(scope,resourceSlot,record.node.tag,record.node.namespace,hash).identity.guard;
      if(record.node.attributes?.['data-adg-id']!==undefined)identity.anchor=record.node.attributes['data-adg-id'];
      if(record.node.keys?.length)identity.key=record.node.keys.at(-1).key;
      if(resourceSlot!==undefined)identity.slot=resourceSlot;
      else if(!record.strict&&duplicate)identity.duplicate={group:hash(JSON.stringify([scope,record.seed])),ordinal,count};
    }
    const value={path:record.node.path,id,...(identity?{identity}:{})};result.set(record.node.path,value);
    return {id,positional};
  }
  function resource(root,scope){
    let slot=0;
    function visit(node){const r=descriptors.get(node.path),local=slot++;
      // Slots are local to this artwork instance, not ranked among frame elements.
      const original=r.seed;r.seed=['resource-slot',local];assign(r,scope,0,1,false,local);r.seed=original;
      for(const child of children.get(node.path))visit(child);
    }
    for(const child of children.get(root.path))visit(child);
  }
  function scope(roots,address,inherited=false){
    let pool=[];
    function gather(node){const r=descriptors.get(node.path);pool.push(r);if(!r.boundary&&!node.resource)for(const child of children.get(node.path))gather(child);}
    // Unique semantic candidates open scopes. Repeated unkeyed owner roots do not
    // impose their positional ordinal on every distinguishable descendant.
    for(let changed=true;changed;){
      changed=false;pool=[];roots.forEach(gather);
      const candidates=new Map();
      for(const r of pool)if(r.candidate){const key=JSON.stringify(r.seed);candidates.set(key,(candidates.get(key)??0)+1);}
      for(const r of pool)if(r.candidate&&!r.boundary&&(r.fixed||candidates.get(JSON.stringify(r.seed))===1)){r.boundary=true;changed=true;}
    }
    const groups=new Map();
    for(const r of pool){
      // JSX keys belong to sibling lists, even where an unnamed parent is not an identity scope.
      let parent=byPath.get(r.node.parentPath);while(parent?.neutral)parent=byPath.get(parent.parentPath);
      const key=JSON.stringify([r.seed,...(r.node.keys?.length?[parent?.path??null]:[])]);
      const peers=groups.get(key)??[];peers.push(r);groups.set(key,peers);r.peers=peers;
    }
    // Keyed children need their non-neutral parent's address before resolution.
    const resolved=new Map();
    function resolve(r){if(resolved.has(r.node.path))return resolved.get(r.node.path);
      let local=address,localPositional=inherited;
      if(r.node.attributes?.['data-adg-id']!==undefined&&!r.node.owners?.length){
        let owner=byPath.get(r.node.parentPath);while(owner&&!owner.owners?.length)owner=byPath.get(owner.parentPath);
        const ownerRecord=pool.find(p=>p.node===owner),value=ownerRecord?resolve(ownerRecord):null;
        if(value){local=value.id;localPositional||=value.positional;}
      }
      if(r.node.keys?.length){let parent=byPath.get(r.node.parentPath);while(parent?.neutral)parent=byPath.get(parent.parentPath);
        const parentRecord=pool.find(p=>p.node===parent),parentValue=parentRecord?resolve(parentRecord):null;
        local=parentValue?.id??result.get(parent?.path)?.id??address;localPositional||=parentValue?.positional??false;}
      const value=assign(r,local,r.peers.indexOf(r),r.peers.length,localPositional);resolved.set(r.node.path,value);return value;
    }
    for(const r of pool)resolve(r);
    for(const r of pool){const value=resolved.get(r.node.path);
      if(r.node.resource)resource(r.node,value.id);
      else if(r.boundary)scope(children.get(r.node.path),value.id,value.positional);
    }
  }
  for(const root of nodes.filter(n=>!byPath.has(n.parentPath))){
    const record=descriptors.get(root.path),seed=record.seed;record.seed=['frame-root'];
    const value=assign(record,rootScope,0,1,false);record.seed=seed;
    if(root.resource)resource(root,value.id);else scope(children.get(root.path),value.id);
  }
  return nodes.map(node=>result.get(node.path));
}
