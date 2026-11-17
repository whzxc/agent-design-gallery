import { arrangementInput } from './assets.js';

const aborted = () => new DOMException('Arrangement superseded', 'AbortError');

export function createArranger() {
  let worker, nextId = 0;
  const pending = new Map();
  function close(failure = aborted()) {
    worker?.terminate();
    worker = undefined;
    for (const task of pending.values()) task.finish(failure);
    pending.clear();
  }
  function start() {
    if (worker) return;
    worker = new Worker(new URL('./arrangement-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) return;
      if (data.error) task.finish(Error(`Cannot arrange designs: ${data.error}`));
      else task.finish(null, data);
    };
    worker.onerror = event => close(Error(`Cannot start arrangement worker: ${event.message}`));
  }
  return {
    close,
    get pending() { return pending.size; },
    async arrange(data, { signal, onPending, previousGroups = [] } = {}) {
      signal?.throwIfAborted();
      const input = arrangementInput(data);
      // Saved geometry is all the worker needs; prepared source and previews stay on the main thread.
      const previous = previousGroups.map(({ key, layer, column, columnCount, columnWidth, w }) =>
        ({ key, layer, column, columnCount, columnWidth, w }));
      onPending?.();
      start();
      const id = ++nextId, end = globalThis.__adgTiming?.span('arrangement-wait');
      return new Promise((resolve, reject) => {
        const abort = () => close();
        pending.set(id, { finish(failure, result) {
          pending.delete(id);
          signal?.removeEventListener('abort', abort);
          end?.({ workerMs: result?.durationMs });
          failure ? reject(failure) : resolve(result.placed);
        } });
        signal?.addEventListener('abort', abort, { once: true });
        try {
          worker.postMessage({ id, input, previousGroups: previous });
        } catch (error) {
          close(error);
        }
      });
    },
  };
}
