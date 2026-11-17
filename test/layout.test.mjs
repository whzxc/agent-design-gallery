import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutWorld, blockForAsset, rows, bounds, fitArea, fitView, componentWrapWidth } from '../public/layout.js';
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

test('mixed gallery groups split by layer while preserving chapter and file order', () => {
  const assets = [source('surfaces/a.tsx'), source('modules/b.tsx'), source('components/c.tsx'), source('components/d.tsx'), source('components/forms/e.tsx')];
  const data = manifest(assets, [
    { title: 'First', assets: [assets[0].path, assets[2].path, assets[1].path, assets[2].path, 'missing.tsx'] },
    { title: 'Second', assets: [assets[3].path, assets[2].path] },
  ]);
  const groups = groupAssets(data);
  assert.deepEqual(groups.map(g => [g.title, g.layer, g.chapter, g.assets.map(a => a.path)]), [
    ['First', 'components', 1, ['components/c.tsx']],
    ['Second', 'components', 2, ['components/d.tsx']],
    ['components/forms', 'components', 3, ['components/forms/e.tsx']],
    ['First', 'modules', 1, ['modules/b.tsx']],
    ['First', 'surfaces', 1, ['surfaces/a.tsx']],
  ]);
  assert.equal(new Set(groups.map(g => g.key)).size, groups.length);
  assert.deepEqual(resolveScope(data, data.layers, 'group:First').assets.map(a => a.path), ['components/c.tsx', 'modules/b.tsx', 'surfaces/a.tsx']);
  assert.deepEqual(resolveScope(data, data.layers, 'asset:modules/b.tsx').assets.map(a => a.path), ['modules/b.tsx']);
  const upper = groupAssets(manifest([source('surfaces/a.tsx', undefined, {layer: 'Surfaces'}), source('components/b.tsx', undefined, {layer: 'Components'})]));
  assert.deepEqual(upper.map(g => g.layer), ['Components', 'Surfaces']);
});

test('each declared component frame becomes an independently selectable item sharing the overview preview', () => {
  const asset = source('components/button.tsx', [[100, 34], [70, 34]], { component: true });
  asset.parts[0].x = 40; asset.parts[0].y = 62;
  asset.parts[1].x = 180; asset.parts[1].y = 62;
  const data = manifest([asset]);
  const section = blockForAsset(asset);
  assert.equal(section.kind, 'flow');
  assert.deepEqual(section.previewCrop, { id: 'overview', name: 'All forms', x: 16, y: 26, width: 258, height: 94 });
  const { groups, items } = arrange(data);
  assert.deepEqual(items.map(a => [a.id, a.component, a.kind]), [
    ['components/button.tsx#0', false, 'flow'], ['components/button.tsx#1', false, 'flow'],
  ]);
  assert.equal(items[0].previewCrop, items[1].previewCrop);
  assert.equal(groups[0].frameCount, 2);
  assert.equal(groups[0].sourceCount, 1);
  for (const [index, item] of items.entries()) {
    const part = asset.parts[index];
    const frame = groups[0].blocks[0].frames[index];
    assert.deepEqual([item.shown[0].x, item.shown[0].y, item.width, item.height], [part.x, part.y, part.width, part.height]);
    near(item.x, groups[0].x + groups[0].blocks[0].x + frame.x);
    near(item.y, groups[0].y + groups[0].blocks[0].y + frame.y);
  }
});

test('source sections retain names, modification time, frame notes, proposal markers and uncropped pixels', () => {
  const asset = source('modules/account/index.tsx', [[300, 200]], { modifiedAt: 12345 });
  Object.assign(asset.parts[0], { name: 'Signed in', note: 'Example state', proposed: 'account' });
  const placed = arrange(manifest([asset]));
  const section = placed.groups[0].blocks[0], frame = section.frames[0], item = placed.items[0];
  assert.equal(section.title, 'account');
  assert.equal(item.name, section.title);
  assert.equal(section.path, asset.path);
  assert.equal(section.modifiedAt, 12345);
  assert.equal(frame.note, 'Example state');
  assert.equal(frame.proposed, 'account');
  assert.equal(frame.proposal, 'account');
  assert.equal(frame.caption.h, 36);
  assert.equal(item.previewCrop.id, '0');
  assert.deepEqual(item.previewCrop, item.shown[0]);
  assert.deepEqual([item.shown[0].x, item.shown[0].y, item.width, item.height], [20, 30, 300, 200]);
  const full = arrange(manifest([source('surfaces/legacy.svg', [], { full: { x: -4, y: 8, width: 510, height: 230 } })]));
  assert.deepEqual(full.items.map(a => [a.id, a.shown[0].x, a.shown[0].y, a.width, a.height]), [['surfaces/legacy.svg#full', -4, 8, 510, 230]]);
});

test('board sections expose local wells, centered native-size frames and declaration-order spans', () => {
  const input = arrangementInput(manifest([source('components/grid.tsx', [[100, 10], [100, 50], [900, 70], [100, 20]])]));
  const [placed] = layoutWorld(input), section = placed.blocks[0];
  assert.deepEqual([placed.w, placed.header.x, placed.header.y, placed.header.h], [1680, 80, 64, 156]);
  assert.deepEqual([section.x, section.y, section.w], [80, 220, 1520]);
  assert.deepEqual(section.frames.map(f => f.id), ['0', '1', '2', '3']);
  assert.deepEqual(section.frames.map(f => f.span), [2, 2, 10, 2]);
  const [first, second, third, fourth] = section.frames;
  assert.deepEqual(first.well, { x: 336, y: 49, w: 177.33333333333334, h: 96 });
  assert.equal(second.well.y, first.well.y);
  assert.equal(third.well.y, first.well.y + second.well.h + 12 + 17 + 32);
  assert.equal(third.well.y, fourth.well.y);
  for (const f of section.frames) {
    near(f.x, f.well.x + (f.well.w - f.w) / 2);
    near(f.y, f.well.y + (f.well.h - f.h) / 2);
    assert.ok(f.well.w + epsilon >= f.w + 48);
    assert.ok(f.well.h >= f.h + 64);
    assert.equal(f.caption.y, f.well.y + f.well.h + 12);
    assert.ok(f.caption.y + f.caption.h <= section.h - 48 + epsilon);
  }
  separated(section.frames.map(f => ({ ...f.well, h: f.well.h + 12 + f.caption.h })), 24, 32);
});

test('wide specimens widen the entire board and twelve-column grid without clipping', () => {
  const data = manifest([source('surfaces/wide.tsx', [[2400, 800], [50, 40]]), source('surfaces/other.tsx')]);
  const [{ w, blocks }] = arrange(data).groups;
  assert.equal(w, 2944);
  assert.equal(blocks.length, 2);
  for (const section of blocks) assert.equal(section.specimenArea.w, 2448);
  const [wide, small] = blocks[0].frames;
  assert.equal(wide.span, 12);
  assert.equal(wide.well.w, 2448);
  assert.equal(wide.x, wide.well.x + 24);
  assert.ok(small.well.y > wide.caption.y);
  assert.equal(blocks[1].y, blocks[0].y + blocks[0].h);
});

// Independent column oracle uses only the resulting board sizes.
function columns(boards, count) {
  const heights = Array(count).fill(0), widths = Array(count).fill(0);
  const assignment = boards.map(b => {
    const column = heights.indexOf(Math.min(...heights));
    const y = heights[column];
    heights[column] += b.h + 240;
    widths[column] = Math.max(widths[column], b.w);
    return { column, y };
  });
  return { assignment, ratio: (widths.reduce((a, b) => a + b, 0) + (count - 1) * 240) / (Math.max(...heights) - 240) };
}

test('chapter-order shortest-column placement chooses the band closest to 16:10 with 240px gaps', () => {
  const input = [board('first', 2300), board('second', 100, 1900), board('third', 180), board('fourth', 350)];
  const result = layoutWorld(input);
  const choices = result.map((_, index) => columns(result, index + 1));
  const winner = choices.reduce((best, value, index) => Math.abs(value.ratio - 1.6) < Math.abs(choices[best].ratio - 1.6) ? index : best, 0);
  assert.equal(result[0].columnCount, winner + 1);
  assert.deepEqual(result.map(b => ({ column: b.column, y: b.y })), choices[winner].assignment);
  assert.deepEqual(result.map(b => b.key), input.map(b => b.key));
  separated(result, 240, 240);
  for (const b of result) if (b.column === 0) assert.equal(b.x, 0);
});

test('layer bands have a 480px vertical gap and leftmost wins shortest-column ties', () => {
  const input = Array.from({ length: 8 }, (_, index) => board(String(index), 600));
  input.push({ ...board('module'), layer: 'modules' }, { ...board('surface'), layer: 'surfaces' });
  const result = layoutWorld(input);
  const components = result.filter(b => b.layer === 'components');
  assert.equal(components[0].column, 0);
  assert.ok(components[0].columnCount > 1);
  assert.equal(components[1].column, 1);
  const module = result.find(b => b.layer === 'modules'), surface = result.find(b => b.layer === 'surfaces');
  assert.equal(module.y, bounds(components).h + 480);
  assert.equal(surface.y, module.y + module.h + 480);
});

test('saving a source preserves columns and shifts only following boards in its column', () => {
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
});

test('incremental arrangement overrides already placed geometry and survives a column-width shrink', () => {
  const assets = Array.from({ length: 8 }, (_, index) => source(`components/${index}.tsx`, [[index ? 100 : 2000, 600]]));
  const groups = assets.map((asset, index) => ({title: String(index), assets: [asset.path]}));
  const original = arrange(manifest(assets, groups));
  const changed = structuredClone(assets);
  changed[0].parts[0].width = 100;
  changed[0].parts[0].height += 200;
  const data = manifest(changed, groups), stale = arrangementInput(manifest(assets, groups));
  const next = arrange(data, { previousGroups: original.groups, placed: layoutWorld(stale) });
  assert.equal(next.items[0].height, 800);
  assert.equal(next.items[0].width, 100);
  for (const [index, b] of next.groups.entries()) {
    assert.equal(b.column, original.groups[index].column);
    assert.equal(b.x, original.groups[index].x);
  }
  const fresh = arrange(data, { placed: layoutWorld(arrangementInput(data)) });
  assert.deepEqual(fresh, arrange(data));
});

test('adding and removing sources and chapters retains remaining assignment and fresh metadata', () => {
  const input = Array.from({ length: 6 }, (_, index) => board(String(index), 300));
  const before = layoutWorld(input);
  const updated = [input[0], ...input.slice(2), board('new', 200)];
  updated[0] = { ...updated[0], title: 'Renamed' };
  const after = layoutWorld(updated, { previousGroups: before });
  assert.equal(after[0].title, 'Renamed');
  for (const current of after.filter(b => b.key !== 'new')) assert.equal(current.column, before.find(b => b.key === current.key).column);
  separated(after, 240, 240);
});

test('real ARC fixtures produce one item per frame without mutating prepared source coordinates', () => {
  const { sources } = JSON.parse(readFileSync(new URL('../fixtures/arc-sample.layout.json', import.meta.url)));
  const data = manifest(sources), before = JSON.stringify(data);
  const result = arrange(data);
  assert.equal(result.items.length, sources.reduce((sum, asset) => sum + (asset.parts.length || 1), 0));
  assert.equal(JSON.stringify(data), before);
  assert.equal(new Set(result.items.map(a => a.id)).size, result.items.length);
  assert.ok(result.items.every(item => item.width > 0 && item.height > 0 && item.kind === 'flow' && !item.component));
  separated(result.groups, 240, 240);
  for (const group of result.groups) {
    separated(group.blocks);
    assert.ok(group.blocks.every(section => section.x === 80 && section.x + section.w <= group.w - 80 + epsilon));
  }
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

test('fit and prepared component wrap helpers retain their existing geometry', () => {
  const area = fitArea(1440, 900, true, true);
  assert.deepEqual(area, {x: 292, y: 100, width: 812, height: 716});
  const view = fitView({x: 10, y: 20, width: 100, height: 50}, area, 24);
  assert.equal(view.scale, 764 / 100);
  assert.equal(view.x + 60 * view.scale, 698);
  assert.equal(componentWrapWidth([{width: 100, height: 30}]), 1600);
  assert.equal(componentWrapWidth([{width: 100000, height: 100000}]), 6400);
  const forms = Array.from({length: 87}, () => ({width: 600, height: 200}));
  const width = componentWrapWidth(forms);
  assert.ok(width > 1600 && width <= 6400);
  assert.ok(bounds(rows(forms.map(p => ({w: p.width, h: p.height})), width, 32, 48)).h <
    bounds(rows(forms.map(p => ({w: p.width, h: p.height})), 1600, 32, 48)).h);
});
