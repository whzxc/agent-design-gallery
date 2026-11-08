import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
// Geometry and ready-to-decode SVGs are derived data, scoped to one project and
// browser measurement context. Source files are never written by this cache.
export async function createViewerCache(directory, {memoryBytes=32*1024*1024,diskBytes=256*1024*1024}={}) {
  await mkdir(directory,{recursive:true});
  const indexPath=path.join(directory,'index.json');
  let entries=new Map(), total=0, residentBytes=0, pending=Promise.resolve();
  const resident=new Map();
  try {
    const data=JSON.parse(await readFile(indexPath,'utf8'));
    if(data.version===1) entries=new Map(data.entries.map(entry=>[entry.key,entry]));
  } catch(error) {if(error.code!=='ENOENT' && !(error instanceof SyntaxError)) throw error;}
  total=[...entries.values()].reduce((n,entry)=>n+entry.bytes,0);
  const keyFor=(hash,theme,context)=>digest(JSON.stringify([hash,theme,context]));
  function remember(key,metadata) {
    if(resident.has(key)){residentBytes-=resident.get(key).bytes;resident.delete(key);}
    const bytes=Buffer.byteLength(JSON.stringify(metadata));
    if(bytes>memoryBytes)return;
    resident.set(key,{metadata,bytes});residentBytes+=bytes;
    while(residentBytes>memoryBytes){const first=resident.keys().next().value;residentBytes-=resident.get(first).bytes;resident.delete(first);}
  }
  async function persist() {
    const temporary=indexPath+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,JSON.stringify({version:1,entries:[...entries.values()]}));
    await rename(temporary,indexPath);
  }
  async function trim() {
    for(const entry of [...entries.values()].sort((a,b)=>a.used-b.used)) {
      if(total<=diskBytes && entries.size<=2048)break;
      entries.delete(entry.key);total-=entry.bytes;
      if(resident.has(entry.key)){residentBytes-=resident.get(entry.key).bytes;resident.delete(entry.key);}
      await rm(path.join(directory,entry.key),{recursive:true,force:true});
    }
  }
  function mutate(operation) {
    const result=pending.then(operation);
    pending=result.catch(()=>{});
    return result;
  }
  async function get(hash,theme,context) {
    const key=keyFor(hash,theme,context),entry=entries.get(key);
    if(!entry)return null;
    let metadata=resident.get(key)?.metadata;
    if(!metadata){try{metadata=JSON.parse(await readFile(path.join(directory,key,'metadata.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
    if(resident.has(key)){const item=resident.get(key);resident.delete(key);resident.set(key,item);}else remember(key,metadata);entry.used=Date.now();
    return {metadata,previewIds:Object.keys(entry.previews)};
  }
  async function save(hash,theme,context,metadata) {
    return mutate(async()=>{
      const key=keyFor(hash,theme,context),location=path.join(directory,key),text=JSON.stringify(metadata);
      await mkdir(location,{recursive:true});
      const temporary=path.join(location,'metadata.'+randomUUID()+'.tmp');
      await writeFile(temporary,text);
      await rename(temporary,path.join(location,'metadata.json'));
      const old=entries.get(key),bytes=Buffer.byteLength(text);
      const entry={key,hash,theme,context,metadataBytes:bytes,previews:old?.previews??{},bytes:bytes+Object.values(old?.previews??{}).reduce((n,p)=>n+p.bytes,0),used:Date.now()};
      total+=entry.bytes-(old?.bytes??0);entries.set(key,entry);remember(key,metadata);
      await trim();await persist();
    });
  }
  async function savePreview(hash,theme,context,crop,source) {
    return mutate(async()=>{
      const key=keyFor(hash,theme,context),entry=entries.get(key);
      if(!entry)return false;
      const filename=digest(crop)+'.svg',bytes=Buffer.byteLength(source),location=path.join(directory,key,filename);
      const temporary=location+'.'+randomUUID()+'.tmp';
      await writeFile(temporary,source);await rename(temporary,location);
      const previous=entry.previews[crop]?.bytes??0;
      entry.previews[crop]={filename,bytes};entry.bytes+=bytes-previous;entry.used=Date.now();total+=bytes-previous;
      await trim();await persist();return entries.has(key);
    });
  }
  async function preview(hash,theme,context,crop) {
    const entry=entries.get(keyFor(hash,theme,context)),item=entry?.previews[crop];
    if(!item)return null;
    try {const body=await readFile(path.join(directory,entry.key,item.filename));entry.used=Date.now();return body;}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
  }
  const reference=(hash,theme,context)=>{const entry=entries.get(keyFor(hash,theme,context));if(entry)entry.used=Date.now();return entry?{previewIds:Object.keys(entry.previews)}:null;};
  return {get,reference,save,savePreview,preview,close:()=>pending,stats:()=>({entries:entries.size,residentBytes,diskBytes:total})};
}
