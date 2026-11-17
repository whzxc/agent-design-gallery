import { layoutWorld } from './layout.js';

self.onmessage = ({ data: { id, input, previousGroups } }) => {
  try {
    const start = performance.now();
    const placed = layoutWorld(input, { previousGroups });
    self.postMessage({ id, placed, durationMs: performance.now() - start });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
