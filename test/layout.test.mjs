import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutWorld, blockForAsset, rows, skyline, fitArea, fitView } from '../public/layout.js';

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
    let x=0,y=0,rowHeight=0;
    for(const part of source.parts) {
      if(source.component && x && x+part.width>1600) {x=0;y+=rowHeight+48;rowHeight=0;}
      assert.deepEqual([part.x,part.y],[x,y],source.path+' '+part.name);
      x+=part.width+32;rowHeight=Math.max(rowHeight,part.height);
    }
    const block=blockForAsset(source),expected=sections.flatMap(s=>s.blocks).find(b=>b.asset===source.path);
    assert.deepEqual([block.kind,block.w,block.h],[expected.kind,expected.w,expected.h]);
    if(block.frames) assert.deepEqual(block.frames.map(f=>f.name),source.parts.map(p=>p.name));
  }
});
