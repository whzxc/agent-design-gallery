import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutWorld, blockForAsset, rows, skyline, bounds, fitArea, fitView, componentWrapWidth, packingSnapshot, restorePacking } from '../public/layout.js';

test('Float packing reproduces every reference section and block position from sizes', () => {
  const reference = JSON.parse(readFileSync(new URL('../fixtures/arc-sample.layout.json', import.meta.url))).sections;
  const input = reference.map(section => ({ title: section.title, blocks: section.blocks.map(block => ({ asset: block.asset, kind: block.kind, w: block.w, h: block.h })) }));
  const result = layoutWorld(input);
  const shape = section => ({ title: section.title, x: section.x, y: section.y, w: section.w, h: section.h, blocks: section.blocks.map(({ asset, kind, x, y, w, h }) => ({ asset, kind, x, y, w, h })) });
  assert.deepEqual(result.map(shape), reference.map(shape));
  assert.equal(input[0].blocks[0].x, undefined);
});
test('set crops preserve source arrangement and geometric padding', () => {
  const block = blockForAsset({ path: 'a.svg', component: true, parts: [{ x: 40, y: 62, width: 100, height: 34 }, { x: 180, y: 62, width: 70, height: 34 }] });
  assert.deepEqual(block.crop, { x: 16, y: 26, w: 258, h: 94 });
});
test('flow frames match reference crops, positions and wrapping', () => {
  const reference = JSON.parse(readFileSync(new URL('../fixtures/arc-sample.layout.json', import.meta.url))).sections;
  for (const section of reference) for (const flow of section.blocks.filter(b => b.frames)) {
    const block = blockForAsset({ path: flow.asset, parts: flow.frames.map((f, id) => ({ id: String(id), name: f.name, x: f.crop.x + 16, y: f.crop.y + 16, width: f.crop.w - 32, height: f.crop.h - 32 })) });
    assert.equal(block.w, flow.w); assert.equal(block.h, flow.h);
    assert.deepEqual(block.frames.map(f => [f.x + flow.x, f.y + flow.y, f.crop]), flow.frames.map(f => [f.x, f.y, f.crop]));
  }
  assert.deepEqual(rows([{w:2000,h:100},{w:2000,h:200}],3600,64,112).map(b=>[b.x,b.y]), [[0,0],[0,212]]);
});
test('skyline fills the lowest available slot and fit respects floating chrome', () => {
  assert.deepEqual(skyline([{w:100,h:100},{w:100,h:50},{w:100,h:20}],300).map(b=>[b.x,b.y]), [[0,0],[164,0],[164,162]]);
  const area = fitArea(1440,900,true,true);
  assert.deepEqual(area, { x:292,y:100,width:812,height:716 });
  const view = fitView({ x:10,y:20,width:100,height:50 },area,24);
  assert.equal(view.scale,764/100);
  const selection = fitView({ x:0,y:0,width:992,height:944 },area,24);
  assert.equal(Math.round(selection.scale * 100),71);
  assert.equal(selection.y,124);
  assert.equal(view.x + 60*view.scale,698);
  assert.deepEqual(layoutWorld([]), []);
});

test('ARC TSX reference packs component forms in source order and flows from frame sizes', () => {
  const {sections,sources}=JSON.parse(readFileSync(new URL('../fixtures/arc-sample.layout.json',import.meta.url)));
  assert.equal(sources.length,51);
  for(const source of sources) {
    const wrapWidth=componentWrapWidth(source.parts);
    let x=0,y=0,rowHeight=0;
    for(const part of source.parts) {
      if(source.component && x && x+part.width>wrapWidth) {x=0;y+=rowHeight+48;rowHeight=0;}
      assert.deepEqual([part.x,part.y],[x,y],source.path+' '+part.name);
      x+=part.width+32;rowHeight=Math.max(rowHeight,part.height);
    }
    const block=blockForAsset(source),expected=sections.flatMap(s=>s.blocks).find(b=>b.asset===source.path);
    assert.deepEqual([block.kind,block.w,block.h],[expected.kind,expected.w,expected.h]);
    if(block.frames) assert.deepEqual(block.frames.map(f=>f.name),source.parts.map(p=>p.name));
  }
});

test('equal geometry reuses packing without retaining old source metadata or output mutations', () => {
  for (let size = 1; size <= 12; size++) {
    const input = [{title: 'old', blocks: Array.from({length: size}, (_, i) => ({
      asset: `old-${i}`, kind: i % 2 ? 'flow' : 'set', w: 90 + i * 17, h: 70 + i * 11,
      frames: [{id: '0', x: 4, y: 8, crop: {w: 20, h: 30}}],
    }))}];
    const original = layoutWorld(input), expected = structuredClone(original);
    const fresh = input.map(s => ({...s, title: 'new', blocks: s.blocks.map(b => ({...b, asset: b.asset.replace('old', 'new')}))}));
    expected[0].title = 'new';
    for (const block of expected[0].blocks) block.asset = block.asset.replace('old', 'new');
    original[0].x = -999; original[0].blocks[0].x = -999; original[0].blocks[0].frames[0].x = -999;
    assert.deepEqual(layoutWorld(fresh), expected);
    assert.equal(input[0].blocks[0].frames[0].x, 4);
  }
});

// Deliberately exhaustive oracle: compare event skipping against every original
// width step, including fractional SVG widths that take the fallback path.
function exhaustiveWorld(input, legacy = false) {
  const choose = (blocks, step, ratio, gap, pack) => {
    if (!blocks.length) return [];
    let best, score = Infinity;
    for (let width = Math.max(...blocks.map(b => b.w)); width <= blocks.reduce((n,b) => n+b.w,0)+blocks.length*gap+step; width += step) {
      const placed=pack(width), box=bounds(placed), distance=legacy ? Math.abs(box.w/box.h-ratio) : box.w*box.h*(1+0.6*Math.abs(Math.log((box.w/box.h)/ratio)));
      if (distance<score) {best=placed;score=distance;}
    }
    return best;
  };
  const sections=input.map(section=>{
    const blocks=choose(section.blocks,50,1.6,legacy?480:64,limit=>{
      if (!legacy) return skyline(section.blocks,limit);
      const sets=sourceOrderSkyline(section.blocks.filter(b=>b.kind==='set'),limit);
      const offset=sets.length?bounds(sets).h+200:0;
      return [...sets,...rows(section.blocks.filter(b=>b.kind==='flow'),limit,64,200).map(b=>({...b,y:b.y+offset}))];
    });
    const box=bounds(blocks);return {...section,blocks,w:box.w+128,h:box.h+168};
  });
  return choose(sections,100,1.5,legacy?480:240,limit=>legacy?rows(sections,limit,480,480):skyline(sections,limit,undefined,240,240)).map(section=>({...section,blocks:section.blocks.map(block=>{
    const x=section.x+64+block.x,y=section.y+104+block.y;
    return {...block,x,y,...(block.frames?{frames:block.frames.map(frame=>({...frame,x:x+frame.x,y:y+frame.y}))}:{})};
  })}));
}
test('packing event skips equal exhaustive width search on mixed and fractional geometry', () => {
  let seed=4310;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let sample=0;sample<80;sample++) {
    const input=Array.from({length:1+random()%3},(_,group)=>({title:String(group),blocks:Array.from({length:1+random()%8},(_,i)=>({
      asset:String(i),kind:random()%2?'set':'flow',w:20+(random()%16000)/64+(sample%3===0?0.1:0),h:20+(random()%12000)/64,
      frames:[{id:'0',x:3,y:7}],
    }))}));
    assert.deepEqual(layoutWorld(input),exhaustiveWorld(input));
  }
});

// Frozen source-order skyline used only by the previous-algorithm density oracle.
function sourceOrderSkyline(blocks, limit) {
  const placed=[];
  for (const block of blocks) {
    const candidates=[0,...placed.map(p=>p.x+p.w+64)].filter(x=>x+block.w<=limit);
    const positions=candidates.map(x=>({x,y:Math.max(0,...placed.filter(p=>x<p.x+p.w+64 && x+block.w+64>p.x).map(p=>p.y+p.h+112))}));
    positions.sort((a,b)=>a.y-b.y || a.x-b.x);
    placed.push({...block,...positions[0]});
  }
  return placed;
}
const fill = blocks => {
  const box=bounds(blocks);
  return blocks.reduce((area,b)=>area+b.w*b.h,0)/(box.w*box.h);
};
const worldFill = sections => {
  const box=bounds(sections);
  return sections.flatMap(s=>s.blocks).reduce((area,b)=>area+b.w*b.h,0)/(box.w*box.h);
};
function assertSeparated(blocks, gapX, gapY) {
  for (let i=0;i<blocks.length;i++) for (let j=i+1;j<blocks.length;j++) {
    const a=blocks[i],b=blocks[j],epsilon=1e-8;
    assert.ok(a.x+a.w+gapX<=b.x+epsilon || b.x+b.w+gapX<=a.x+epsilon ||
      a.y+a.h+gapY<=b.y+epsilon || b.y+b.h+gapY<=a.y+epsilon,`Overlapping blocks: ${JSON.stringify([a,b])}`);
  }
}
test('placed blocks never overlap, including section and world gaps', () => {
  let seed=20261108;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for (let sample=0;sample<100;sample++) {
    const input=Array.from({length:1+random()%8},(_,g)=>({title:String(g),blocks:Array.from({length:1+random()%16},(_,i)=>({
      asset:String(i),kind:i%2?'set':'flow',w:32+(random()%16000)/64,h:32+(random()%32000)/64,
    }))}));
    const sections=layoutWorld(input);
    assertSeparated(sections,240,240);
    assert.deepEqual(sections.map(s=>s.title),input.map(s=>s.title));
    for (const section of sections) {
      assertSeparated(section.blocks,64,112);
      for (const block of section.blocks) {
        assert.ok(block.x>=section.x+64 && block.y>=section.y+104);
        assert.ok(block.x+block.w<=section.x+section.w-64+1e-8);
        assert.ok(block.y+block.h<=section.y+section.h-64+1e-8);
      }
    }
  }
});
test('reference density never regresses against the previous algorithm, per section and world', () => {
  const {sources,sections}=JSON.parse(readFileSync(new URL('../fixtures/arc-sample.layout.json',import.meta.url)));
  const input=sections.map(s=>({title:s.title,blocks:s.blocks.map(b=>blockForAsset(sources.find(a=>a.path===b.asset)))}));
  const previous=exhaustiveWorld(input,true),current=layoutWorld(input);
  for (let i=0;i<current.length;i++) assert.ok(fill(current[i].blocks)>=fill(previous[i].blocks),current[i].title);
  assert.ok(worldFill(current)>=worldFill(previous));
});
test('tall outliers leave room for short blocks, regardless of set or flow kind', () => {
  const input=[{title:'modules',blocks:Array.from({length:87},(_,i)=>({
    asset:String(i),kind:i%2?'set':'flow',w:600+(i%3)*80,h:i===86?12000:240+(i%5)*40,
  }))}];
  const current=layoutWorld(input)[0];
  assert.ok(fill(current.blocks)>fill(exhaustiveWorld(input,true)[0].blocks));
  assert.ok(current.blocks.some(b=>b.y>current.y+104),'short blocks must occupy lower slots');
  assertSeparated(current.blocks,64,112);
});
test('skyline places tallest then widest, with stable ties and source identities', () => {
  const blocks=[{id:'short',w:100,h:40},{id:'narrow',w:100,h:200},{id:'wide',w:200,h:200},{id:'tie',w:200,h:200}];
  const result=skyline(blocks,1000);
  assert.deepEqual(result.map(b=>b.id),blocks.map(b=>b.id));
  assert.deepEqual([...result].sort((a,b)=>a.x-b.x).map(b=>b.id),['wide','tie','narrow','short']);
  assert.equal(blocks[0].x,undefined);
});
test('adaptive form wrap grows with area, stays bounded and leaves small sets unchanged', () => {
  assert.equal(componentWrapWidth([{width:100,height:30}]),1600);
  const forms=Array.from({length:87},()=>({width:600,height:200}));
  const width=componentWrapWidth(forms);
  assert.ok(width>1600 && width<=6400);
  const packed=rows(forms.map(p=>({w:p.width,h:p.height})),width,32,48);
  assert.ok(bounds(packed).h<bounds(rows(forms.map(p=>({w:p.width,h:p.height})),1600,32,48)).h);
  assertSeparated(packed,32,48);
  assert.equal(componentWrapWidth([{width:100000,height:100000}]),6400);
});
test('restored width choices reproduce fresh geometry and ignore obsolete algorithm keys', () => {
  const input=[{title:'cache',blocks:[{kind:'set',w:333,h:777},{kind:'flow',w:456,h:123}]}];
  restorePacking([[JSON.stringify([50,1.6,input[0].blocks.map(b=>[b.kind,b.w,b.h])]),99999]]);
  const before=packingSnapshot();
  assert.equal(layoutWorld(input,{cachedOnly:true}),null);
  assert.deepEqual(packingSnapshot(),before);
  const expected=exhaustiveWorld(input);
  assert.deepEqual(layoutWorld(input),expected);
  assert.deepEqual(layoutWorld(input,{cachedOnly:true}),expected);
  restorePacking(packingSnapshot());
  assert.deepEqual(layoutWorld(input),expected);
});

test('Property: provisional stream prefixes converge byte-for-byte to single-shot complete geometry', () => {
  let seed=20261111;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
  for(let sample=0;sample<100;sample++) {
    const input=Array.from({length:1+random()%5},(_,g)=>({title:String(g),blocks:Array.from({length:1+random()%12},(_,i)=>({
      asset:String(i),kind:i%2?'set':'flow',w:32+(random()%16000)/64,h:32+(random()%32000)/64,
    }))}));
    const original=JSON.stringify(input),expected=JSON.stringify(exhaustiveWorld(input)),packing=packingSnapshot();
    for(let prefix=1;prefix<=12;prefix++) {
      const partial=input.map(g=>({...g,blocks:g.blocks.slice(0,prefix)}));
      const provisional=layoutWorld(partial,{provisional:true});
      assertSeparated(provisional,240,240);
      for(const group of provisional)assertSeparated(group.blocks,64,112);
    }
    assert.deepEqual(packingSnapshot(),packing,'provisional placement must not populate full-search cache');
    assert.equal(JSON.stringify(layoutWorld(input)),expected);
    assert.equal(JSON.stringify(input),original,'placement must not mutate source geometry');
  }
});
