import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectFrame,check} from '../src/toolkit/commands.mjs';
import {loadConfig} from '../src/toolkit/config.mjs';
import {starterTokens} from '../src/toolkit/project.mjs';
import {launch} from '../src/toolkit/browser.mjs';

const text='One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen.';
const stage=body=>`<!doctype html><style>
  html,body{margin:0}*{box-sizing:border-box}p{margin:0}
  [data-adg-frame]{width:240px;height:200px;font:16px/20px monospace}
  .stage{position:relative;width:240px;height:200px}
  .text{position:absolute;left:16px;top:24px}
</style><div data-adg-frame="visibility" data-brand><div class="stage" data-free data-brand>${body}</div></div>`;
async function inspect(page,body) {
  await page.setContent(stage(body));
  return (await page.evaluate(inspectFrame,[])).map(finding=>finding.message);
}
const overlaps=problems=>problems.filter(p=>p.startsWith('Text overlaps:'));
const snapshot=el=>[el.textContent,...[el,...el.querySelectorAll('*')].map(node=>
  [node.tagName,[...node.attributes].map(attr=>[attr.name,attr.value]).sort()])];

test('opaque dialogs, static menus, rounded panels and noninteractive layers hide covered text',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    for (const [name,body] of [
      ['dialog','<span class="text">Underneath</span><div style="position:absolute;inset:0;background:white"><span class="text">Dialog</span></div>'],
      ['static menu in stacking context','<span class="text">Underneath</span><div style="position:absolute;inset:0;z-index:10"><div style="height:100px;background:white"><span class="text">Menu</span></div></div>'],
      ['rounded opaque panel','<span class="text" style="left:30px">Underneath</span><div style="position:absolute;inset:0;background:white;border-radius:16px"><span class="text" style="left:30px">Dialog</span></div>'],
      ['pointer-events none','<span class="text">Underneath</span><div style="position:absolute;inset:0;background:white;pointer-events:none!important"><span class="text">Dialog</span></div>'],
      ['inert background','<div inert="background" style="pointer-events:none"><span class="text">Underneath</span></div><div style="position:absolute;inset:0;background:white"><span class="text">Dialog</span></div>'],
      ['inert foreground','<span class="text">Underneath</span><div inert style="position:absolute;inset:0;background:white"><span class="text">Dialog</span></div>'],
      ['opaque positioned child','<div class="text">Underneath<span style="position:absolute;left:0;top:0;background:white">Dialog</span></div>'],
    ]) {
      await page.setContent(stage(body));
      const original=await page.locator('.stage').evaluate(snapshot);
      assert.deepEqual(await page.evaluate(inspectFrame,[]),[],name);
      assert.deepEqual(await page.locator('.stage').evaluate(snapshot),original,'hit-test overrides are restored');
    }
  } finally {await browser.close()}
});

test('visible overlaps survive transparent/translucent covers, ancestor backgrounds and covers behind text',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    for (const [name,background,extra] of [
      ['transparent','transparent',''],['translucent background','rgba(255,255,255,.5)',''],
      ['mostly opaque background','rgba(255,255,255,.99)',''],
      ['translucent group','white','opacity:.5;'],['near-opaque group','white','opacity:.9999;'],
      ['transparent filter','white','filter:opacity(.5);'],['text background clip','white','background-clip:text;'],
    ]) {
      const body=`<span class="text">First</span><div style="position:absolute;inset:0;background:${background};${extra}"><span class="text">Second</span></div>`;
      assert.ok(overlaps(await inspect(page,body)).some(p=>p.includes('First / Second')),name);
    }
    assert.ok(overlaps(await inspect(page,'<div style="position:absolute;inset:0;background:white"><span class="text">First</span><span class="text">Second</span></div>')).length,'own ancestor background');
    assert.ok(overlaps(await inspect(page,'<div class="text">First<span style="position:absolute;left:0;top:0">Second</span></div>')).length,'direct ancestor and child text are distinct');
    assert.ok(overlaps(await inspect(page,'<div style="position:absolute;inset:0;background:white;z-index:0"></div><span class="text" style="z-index:20;pointer-events:none">First</span><span class="text" style="z-index:21">Second</span>')).length,'opaque cover below pointer-events:none text');
    assert.ok(overlaps(await inspect(page,'<div style="position:absolute;inset:0;background:white;z-index:0"></div><div inert><span class="text" style="z-index:20">First</span></div><span class="text" style="z-index:21">Second</span>')).length,'opaque cover below inert text');
  } finally {await browser.close()}
});

test('central sampling cannot hide exposed edge strips or rounded transparent corners',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    const pair='<span style="position:absolute;left:0;top:0;font:10px/20px monospace">AAAAAAAAAAAAAAAA</span><span style="position:absolute;left:0;top:0;font:10px/20px monospace">BBBBBBBBBBBBBBBB</span>';
    for (const cover of [
      '<div style="position:absolute;left:20px;top:0;width:60px;height:40px;background:white;z-index:20"></div>',
      '<div style="position:absolute;left:0;top:0;width:100px;height:40px;border-radius:20px;background:white;z-index:20"></div>',
    ]) assert.ok(overlaps(await inspect(page,pair+cover)).length,'visible edges remain a true overlap');
  } finally {await browser.close()}
});

test('static opaque menus cover rounded breadcrumb buttons absent from edge hit tests',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    const body=(background,z)=>`<button style="position:absolute;left:16px;top:24px;border:0;border-radius:8px;padding:2px 0;font:16px/20px monospace;background:transparent">Breadcrumb</button>
      <div style="position:absolute;inset:0;z-index:${z}"><div class="menu" style="height:100px;border-radius:12px;background:${background}"><span class="text">Menu label</span></div></div>`;
    await page.setContent(stage(body('white',10)));
    const hits=await page.evaluate(()=>{
      const button=document.querySelector('button'),menu=document.querySelector('.menu');
      const range=document.createRange();range.selectNodeContents(button);const r=range.getBoundingClientRect();
      return [[r.left+.01,r.top+.01],[r.right-.01,r.top+.01],[r.left+.01,r.bottom-.01],
        [r.right-.01,r.bottom-.01],[(r.left+r.right)/2,(r.top+r.bottom)/2]].map(([x,y])=>{
          const stack=document.elementsFromPoint(x,y);return{subject:stack.indexOf(button),cover:stack.indexOf(menu)};
        });
    });
    assert.ok(hits.some(p=>p.subject===-1),'rounded button edge omits its text owner');
    assert.ok(hits.some(p=>p.subject>p.cover&&p.cover>=0),'shared sample proves foreground paint order');
    assert.deepEqual(await page.evaluate(inspectFrame,[]),[]);
    assert.ok(overlaps(await inspect(page,body('rgba(255,255,255,.5)',10))).length,'translucent menu still reports');
    assert.ok(overlaps(await inspect(page,body('transparent',10))).length,'transparent menu still reports');
    assert.ok(overlaps(await inspect(page,body('white',-1))).length,'opaque menu behind the button still reports');
  } finally {await browser.close()}
});

test('visible line rectangles intersect nested scroll, horizontal and self clipping',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    assert.deepEqual(await inspect(page,'<div style="width:120px;height:40px;overflow:auto"><div style="position:relative;height:120px"><span style="position:absolute;top:60px">Hidden</span></div></div><span style="position:absolute;top:60px">Below</span>'),[]);
    const horizontal='<div style="width:100px;height:30px;overflow:hidden"><div style="width:180px;height:30px;overflow:auto"><p style="width:180px;white-space:nowrap">A long row extends underneath the next column</p></div></div>';
    assert.deepEqual(await inspect(page,horizontal+'<span style="position:absolute;left:120px;top:0">Other</span>'),[]);
    assert.ok(overlaps(await inspect(page,horizontal+'<span style="position:absolute;left:20px;top:0">Visible</span>')).length,'visible portion still collides');
    assert.ok(overlaps(await inspect(page,'<div style="width:100px;height:80px;transform:scale(2);transform-origin:0 0"><svg width="100" height="80"><text x="60" y="20">First</text><text x="60" y="20">Second</text></svg></div>')).length,'scaled SVG scrollports retain visible text');
    assert.deepEqual(await inspect(page,'<div style="width:80px;height:30px;border:8px solid;overflow:hidden"><p style="white-space:nowrap">Clipped row</p></div><span style="position:absolute;left:76px;top:8px">Outside clip</span>'),[],'scrollport excludes border');
    assert.deepEqual(await inspect(page,'<div style="width:100px;height:20px;overflow:hidden"><div style="position:relative;height:100px"><span style="position:absolute;top:40px">Hidden</span></div></div><span style="position:absolute;top:40px">Next</span>'),[]);
    await page.setContent(stage('<div style="height:40px;width:100px;overflow:scroll"><div style="position:relative;height:120px"><span style="position:absolute;top:60px">Scrolled away</span></div></div><span style="position:absolute;top:20px">Below</span>'));
    await page.locator('.stage>div').evaluate(el=>el.scrollTop=100);
    assert.deepEqual(await page.evaluate(inspectFrame,[]),[],'scrolled content outside the viewport is excluded');
  } finally {await browser.close()}
});

test('plain native line clamp retains real text and excludes hidden trailing ranges',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    await page.setContent(stage(`<p style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;width:120px;line-height:20px">${text}</p><p style="position:absolute;top:60px">Expand</p>`));
    const rects=await page.locator('p').first().evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return{count:r.getClientRects().length,text:el.textContent,height:el.getBoundingClientRect().height}});
    assert.ok(rects.count>3,'Chromium exposes hidden Range lines');assert.equal(rects.height,60);assert.equal(rects.text,text);
    assert.deepEqual(await page.evaluate(inspectFrame,[]),[]);
  } finally {await browser.close()}
});

test('unclipped text/container/frame overflow and inline overflow-visible collisions remain errors',async()=>{
  const browser=await launch();
  try {
    const page=await browser.newPage({viewport:{width:300,height:250}});
    assert.ok((await inspect(page,'<p style="width:20px;white-space:nowrap">Visible overflow</p>')).some(p=>p.startsWith('Text overflows its box:')));
    assert.ok((await inspect(page,'<p style="width:20px;white-space:nowrap;text-overflow:ellipsis">Visible overflow</p>')).some(p=>p.startsWith('Text overflows its box:')),'ellipsis without clipping does not conceal overflow');
    assert.ok(overlaps(await inspect(page,'<div style="position:absolute;width:20px"><span style="overflow:hidden;white-space:nowrap">Inline text</span></div><span style="position:absolute;left:30px">Second</span>')).length,'non-replaced inline overflow does not clip');
    const outside=await inspect(page,'<div style="width:300px;height:40px"><span style="position:absolute;left:250px">First</span><span style="position:absolute;left:250px">Second</span></div>');
    assert.ok(outside.includes('Content overflows the frame'));assert.ok(outside.some(p=>p.startsWith('Text leaves frame:')));
    assert.deepEqual(overlaps(outside),[],'pairs outside the frame are not compared');
  } finally {await browser.close()}
});

test('normal check and read-only check share the clipping and opaque-occlusion fix',async t=>{
  const root=mkdtempSync(path.join(tmpdir(),'adg-checker-visibility-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(path.join(root,'design/surfaces'),{recursive:true});
  writeFileSync(path.join(root,'adg.config.mjs'),'export default {};');writeFileSync(path.join(root,'design/tokens.css'),starterTokens);
  writeFileSync(path.join(root,'design/surfaces/visibility.tsx'),`import {Frame} from 'adg';export default()=>[
    <Frame name="dialog" width={200} height={180}><div data-free data-brand style={{position:'relative',width:200,height:180}}>
      <span style={{position:'absolute',top:20}}>Underneath</span>
      <div style={{position:'absolute',inset:0,background:'white'}}><span style={{position:'absolute',top:20}}>Dialog</span></div>
    </div></Frame>,
    <Frame name="clamp" width={200} height={180}><div data-free data-brand style={{position:'relative',width:200,height:180}}>
      <p class="line-clamp-3" style={{width:120,lineHeight:'20px',margin:0}}>${text}</p>
      <p style={{position:'absolute',top:60,margin:0}}>Expand</p>
    </div></Frame>];`);
  const c=await loadConfig(root);
  for(const options of [{},{'read-only':true}]) {
    const errors=[];assert.equal((await check(c,[],options,()=>{},line=>errors.push(line))).data.complete,true,errors.join('\n'));
  }
});
