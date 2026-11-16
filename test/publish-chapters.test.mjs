import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/toolkit/config.mjs';
import { starterTokens } from '../src/toolkit/project.mjs';
import { deriveDocuments, placeDocuments, chapterGroups } from '../src/publish/documents.mjs';
import { launch } from '../src/toolkit/browser.mjs';

test('explicit chapters keep file order and ungrouped sources use directories',()=>{
  const items=['components/a.tsx','components/b.tsx','modules/flow/index.tsx'].map(relative=>({relative,layer:relative.startsWith('components')?'Components':'Modules'}));
  const groups=chapterGroups(items,[{title:'Controls',assets:['components/b.tsx','components/a.tsx']}]);
  assert.deepEqual(groups.map(g=>[g.title,g.items.map(i=>i.relative)]),[['Controls',['components/b.tsx','components/a.tsx']],['flow',['modules/flow/index.tsx']]]);
});
test('boards use measured 12-column wells, continue at section boundaries and align side by side',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'adg-chapters-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'design/components'),{recursive:true});
  await writeFile(path.join(root,'adg.config.mjs'),'export default {};');
  await writeFile(path.join(root,'design/tokens.css'),starterTokens);
  for(const [name,height]of [['a',2200],['b',2200],['c',2200]])await writeFile(path.join(root,`design/components/${name}.tsx`),`import {Frame} from 'adg';export default()=>[<Frame name="small" width={100}><button>Button</button></Frame>,<Frame name="wide" width={1200} height={${height}}><div>Wide</div></Frame>];`);
  await writeFile(path.join(root,'design/gallery.json'),JSON.stringify({groups:[{title:'Controls',assets:['components/b.tsx','components/a.tsx','components/c.tsx']}]}));
  const docs=await deriveDocuments(await loadConfig(root),'test'),boards=docs.filter(d=>d.layer==='Components');
  assert.equal(boards.length,3);assert.deepEqual(boards.map(d=>d.sources[0]),['design/components/b.tsx','design/components/a.tsx','design/components/c.tsx']);
  assert.deepEqual(boards.map(d=>d.part),[1,2,3]);assert.ok(boards.every(d=>d.height<4800));
  placeDocuments(docs);assert.deepEqual(boards.map(d=>[d.x,d.y]),[[0,0],[1920,0],[3840,0]]);
  const browser=await launch();t.after(()=>browser.close());const page=await browser.newPage();
  await page.setContent(boards[0].html);
  assert.equal(await page.locator('[data-adg-well]').count(),2);
  const spans=await page.locator('figure').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).gridColumnEnd));
  assert.equal(spans.length,2);
  const wells=await page.locator('[data-adg-well]').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  assert.ok(wells[0]<wells[1]);assert.ok(Math.abs(wells[1]-1184)<0.1);
});

test('mixed gallery groups split by layer without changing within-layer order',()=>{
  const items=[['components/b.tsx','Components'],['modules/a.tsx','Modules'],['surfaces/s.tsx','Surfaces'],['components/a.tsx','Components']].map(([relative,layer])=>({relative,layer}));
  const chapters=chapterGroups(items,[{title:'Shared',assets:items.map(i=>i.relative)}]);
  assert.deepEqual(chapters.map(c=>[c.title,c.layer,c.items.map(i=>i.relative)]),[
    ['Shared','Components',['components/b.tsx','components/a.tsx']],
    ['Shared','Modules',['modules/a.tsx']],
    ['Shared','Surfaces',['surfaces/s.tsx']],
  ]);
  assert.equal(new Set(chapters.map(c=>c.key)).size,3);
});

test('captions follow their specimen across frame reordering',async()=>{
  const {carryAnchors}=await import('../src/publish/anchors.mjs');
  const fig=(name,id='')=>`<figure data-adg-specimen-caption="a#${name}"><div data-specimen="a#${name}">Frame</div><figcaption${id?` data-doop-id="${id}"`:''}>${name}</figcaption></figure>`;
  const old=fig('one','comment')+fig('two'),next=fig('two')+fig('one');
  const result=carryAnchors(old,next);
  assert.match(result.html,/<figcaption data-doop-id="comment">one/);
  assert.equal(result.orphaned.length,0);
});

test('duplicate chapter titles within a layer fail before publishing',()=>{
  assert.throws(()=>chapterGroups([{relative:'components/a.tsx',layer:'Components'},{relative:'components/b.tsx',layer:'Components'}],[{title:'Controls',assets:['components/a.tsx']},{title:'Controls',assets:['components/b.tsx']}]),{code:'CONFIG_INVALID'});
});
