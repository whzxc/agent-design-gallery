import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createViewerCache} from '../src/viewer-cache.mjs';

async function temporary(t) {
  const directory=await mkdtemp(path.join(tmpdir(),'adg-viewer-cache-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return directory;
}
const metadata={format:'tsx',full:{x:0,y:0,width:200,height:80},parts:[{id:'0',name:'中文😀',x:0,y:0,width:200,height:80}],component:true,background:'#fff'};

test('measured geometry and exact Unicode previews survive restart in their browser context',async t=>{
  const directory=await temporary(t),first=await createViewerCache(directory);
  const source='<svg xmlns="http://www.w3.org/2000/svg"><text>中文😀</text></svg>';
  const interactive={...metadata,parts:metadata.parts.map(part=>({...part,elements:[{id:'hit',x:0,y:0,width:20,height:12}]}))};
  await first.save('source-output','light','browser-a|2',interactive);
  assert.equal(await first.savePreview('source-output','light','browser-a|2','overview',source),true);
  await first.close();
  const restarted=await createViewerCache(directory);
  t.after(()=>restarted.close());
  assert.deepEqual(await restarted.get('source-output','light','browser-a|2'),{metadata:interactive,previewIds:['overview']});
  assert.deepEqual(await restarted.layout('source-output','light','browser-a|2'),metadata);
  assert.deepEqual(restarted.reference('source-output','light','browser-a|2'),{previewIds:['overview']});
  assert.equal((await restarted.preview('source-output','light','browser-a|2','overview')).toString('utf8'),source);
  assert.equal(await restarted.get('source-output','dark','browser-a|2'),null);
  assert.equal(await restarted.get('source-output','light','browser-b|2'),null);
  assert.equal(await restarted.preview('source-output','light','browser-a|2','missing'),null);
});

test('version-1 metadata without byte counts stays within the resident budget after restart',async t=>{
  const directory=await temporary(t);
  const seed=await createViewerCache(directory);
  await seed.save('legacy','light','browser',metadata);
  await seed.savePreview('legacy','light','browser','overview','<svg/>');
  await seed.close();

  const indexPath=path.join(directory,'index.json');
  const index=JSON.parse(await readFile(indexPath,'utf8'));
  assert.equal(index.version,1);
  delete index.entries[0].metadataBytes;
  delete index.entries[0].layoutBytes;
  await writeFile(indexPath,JSON.stringify(index));

  const bytes=Buffer.byteLength(JSON.stringify(metadata));
  const cache=await createViewerCache(directory,{memoryBytes:bytes});
  t.after(()=>cache.close());
  assert.equal(cache.hasLayout('legacy','light','browser'),false);
  assert.equal(await cache.layout('legacy','light','browser'),undefined);
  const readLegacy=()=>cache.get('legacy','light','browser');
  assert.deepEqual(await readLegacy(),{metadata,previewIds:['overview']});
  assert.equal(cache.stats().residentBytes,bytes);

  const smaller={...metadata,background:''};
  await cache.save('new','light','browser',smaller);
  assert.equal(cache.stats().residentBytes,Buffer.byteLength(JSON.stringify(smaller)));
  assert.deepEqual((await readLegacy()).metadata,metadata);
  assert.equal(cache.stats().residentBytes,bytes);
});

test('viewer cache evicts least-recently used sources within memory and disk budgets',async t=>{
  const bytes=Buffer.byteLength(JSON.stringify(metadata));
  for(const access of ['get','reference']) {
  const directory=await temporary(t),cache=await createViewerCache(directory,{memoryBytes:bytes,diskBytes:bytes*2});
  t.after(()=>cache.close());
  const now=Date.now;let clock=0;Date.now=()=>++clock;
  try {
    await cache.save('a','light','browser',metadata);
    await cache.save('b','light','browser',metadata);
    await cache[access]('a','light','browser');
    await cache.save('c','light','browser',metadata);
    assert.equal(await cache.get('b','light','browser'),null);
    assert.equal(cache.reference('b','light','browser'),null);
    assert.deepEqual((await cache.get('a','light','browser')).metadata,metadata);
    assert.deepEqual((await cache.get('c','light','browser')).metadata,metadata);
    assert.ok(cache.stats().residentBytes<=bytes);
    assert.ok(cache.stats().diskBytes<=bytes*2);
    assert.equal(await cache.savePreview('c','light','browser','overview','x'.repeat(bytes*3)),false);
    assert.equal(await cache.get('c','light','browser'),null);
    assert.ok(cache.stats().diskBytes<=bytes*2);
  } finally {Date.now=now;}
  }
});
