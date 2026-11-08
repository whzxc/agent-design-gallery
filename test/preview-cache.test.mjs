import test from 'node:test';
import assert from 'node:assert/strict';
import {evictPreviews} from '../public/assets.js';

test('visible paths do not pin obsolete preview versions or themes across saves', () => {
  const cache = new Map();
  // An overview can legitimately have more visible previews than the idle LRU.
  for (let generation = 0; generation < 20; generation++) {
    const active = new Set();
    for (let frame = 0; frame < 120; frame++) {
      const key = `surfaces/example.tsx|${generation % 2 ? 'dark' : 'light'}|${generation}|${frame}`;
      active.add(key);
      cache.set(key, {key, used: generation});
    }
    evictPreviews(cache, active);
    assert.equal(cache.size, active.size);
    assert.deepEqual(new Set(cache.keys()), active);
  }
  evictPreviews(cache, new Set());
  assert.equal(cache.size, 80);
});
