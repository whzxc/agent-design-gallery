import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutWorld, blockForAsset, specimenPaintCrop, rows, bounds, fitArea, fitView, componentWrapWidth } from '../public/layout.js';
import { arrange, arrangementInput, groupAssets, resolveScope } from '../public/assets.js';
import { createArranger } from '../public/arrangement.js';

const source = (path, sizes = [[100, 50]], extra = {}) => ({
  path, layer: path.split('/')[0], component: false, full: { x: 0, y: 0, width: 100, height: 50 },
  parts: sizes.map(([width, height], index) => ({ id: String(index), name: `Frame ${index}`, x: 20 + index * 130, y: 30, width, height })),
  ...extra,
});
const manifest = (assets, groups = []) => ({ assets, groups, layers: ['components', 'modules', 'surfaces'] });
const board = (key, height = 100, width = 100) => ({
  key, title: key, layer: 'components', blocks: [blockForAsset(source(`components/${key}.tsx`, [[width, height]]))],
});
const epsilon = 1e-8;
const near = (a, b) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
function separated(boxes, gapX = 0, gapY = 0) {
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.w + gapX <= b.x + epsilon || b.x + b.w + gapX <= a.x + epsilon ||
      a.y + a.h + gapY <= b.y + epsilon || b.y + b.h + gapY <= a.y + epsilon, `Overlap ${i}, ${j}`);
  }
}

test('incremental arrangement preserves assignments',()=>{
  const input = Array.from({ length: 9 }, (_, index) => board(String(index), 500));
  const original = layoutWorld(input);
  const updated = structuredClone(input);
  updated[0].blocks[0].frames[0].h += 150;
  const current = layoutWorld(updated, { previousGroups: original });
  const delta = current[0].h - original[0].h;
  assert.equal(delta, 150);
  for (const [index, b] of current.entries()) {
    const old = original[index];
    assert.equal(b.column, old.column);
    assert.equal(b.x, old.x);
    assert.equal(b.y, old.y + (index > 0 && b.column === original[0].column ? delta : 0));
  }
  // Arrange ignores earlier assignments and chooses columns from current sizes.
  assert.deepEqual(layoutWorld(updated), layoutWorld(structuredClone(updated)));

  const assets = Array.from({ length: 8 }, (_, index) => source(`components/${index}.tsx`, [[index ? 100 : 2000, 600]]));
  const groups = assets.map((asset, index) => ({title: String(index), assets: [asset.path]}));
  const arrangedOriginal = arrange(manifest(assets, groups));
  const changed = structuredClone(assets);
  changed[0].parts[0].width = 100;
  changed[0].parts[0].height += 200;
  const data = manifest(changed, groups), stale = arrangementInput(manifest(assets, groups));
  const next = arrange(data, { previousGroups: arrangedOriginal.groups, placed: layoutWorld(stale) });
  assert.equal(next.items[0].height, 800);
  assert.equal(next.items[0].width, 100);
  for (const [index, b] of next.groups.entries()) {
    assert.equal(b.column, arrangedOriginal.groups[index].column);
    assert.equal(b.x, arrangedOriginal.groups[index].x);
  }
  const fresh = arrange(data, { placed: layoutWorld(arrangementInput(data)) });
  assert.deepEqual(fresh, arrange(data));

  const addedInput = Array.from({ length: 6 }, (_, index) => board(String(index), 300));
  const before = layoutWorld(addedInput);
  const addedUpdated = [addedInput[0], ...addedInput.slice(2), board('new', 200)];
  addedUpdated[0] = { ...addedUpdated[0], title: 'Renamed' };
  const after = layoutWorld(addedUpdated, { previousGroups: before });
  assert.equal(after[0].title, 'Renamed');
  for (const current of after.filter(b => b.key !== 'new')) assert.equal(current.column, before.find(b => b.key === current.key).column);
  separated(after, 240, 240);

});

test('random fractional frames stay within sections and wells; empty and provisional layouts are deterministic', () => {
  assert.deepEqual(layoutWorld([]), []);
  assert.deepEqual(arrange(manifest([])), { groups: [], items: [], world: {x: 0, y: 0, width: 1, height: 1} });
  let seed = 413;
  const random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed;};
  for (let sample = 0; sample < 40; sample++) {
    const input = Array.from({length: 1 + random() % 8}, (_, index) => ({
      key: String(index), title: `Chapter ${index}`, layer: index % 2 ? 'modules' : 'components',
      blocks: [blockForAsset(source(`components/${index}.tsx`, Array.from({length: 1 + random() % 12}, () => [1 + random() % 2500 / 3, 1 + random() % 2000 / 7])))],
    }));
    const before = JSON.stringify(input), result = layoutWorld(input);
    assert.deepEqual(layoutWorld(input, { provisional: true }), result);
    assert.equal(JSON.stringify(input), before);
    separated(result, 240, 240);
    for (const b of result) for (const section of b.blocks) {
      for (const frame of section.frames) {
        assert.ok(frame.well.x >= section.specimenArea.x);
        assert.ok(frame.well.x + frame.well.w <= section.w + epsilon);
        assert.ok(frame.well.w + epsilon >= frame.w + 48);
        assert.ok(frame.well.y + frame.well.h <= frame.caption.y);
        assert.ok(frame.caption.y + frame.caption.h <= section.h - 48 + epsilon);
      }
      separated(section.frames.map(f => ({...f.well, h: f.well.h + 12 + f.caption.h})), 24, 32);
    }
  }
});

test('worker forwards incremental geometry without source payloads, returns placement and cancels cleanly', async () => {
  const original = globalThis.Worker, workers = [];
  class FakeWorker {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
    reply() {
      const { id, input, previousGroups } = this.message;
      this.onmessage({data: {id, placed: layoutWorld(input, {previousGroups}), durationMs: 1}});
    }
  }
  globalThis.Worker = FakeWorker;
  const arranger = createArranger();
  try {
    const data = manifest([source('components/test.tsx')]);
    const previous = arrange(data).groups.map(g => ({...g, source: 'unused source'}));
    let pending = 0;
    const promise = arranger.arrange(data, {previousGroups: previous, onPending: () => pending++});
    assert.equal(arranger.pending, 1);
    assert.equal(pending, 1);
    assert.equal(workers[0].message.previousGroups[0].source, undefined);
    assert.equal(workers[0].message.packing, undefined);
    workers[0].reply();
    assert.deepEqual(await promise, layoutWorld(arrangementInput(data), {previousGroups: previous}));
    assert.equal(arranger.pending, 0);
    const controller = new AbortController();
    const cancelled = arranger.arrange(data, {signal: controller.signal});
    controller.abort();
    await assert.rejects(cancelled, {name: 'AbortError'});
    assert.equal(arranger.pending, 0);
    assert.equal(workers[0].terminated, true);
    const next = arranger.arrange(data);
    workers[1].reply();
    await next;
  } finally {
    arranger.close();
    globalThis.Worker = original;
  }
});
