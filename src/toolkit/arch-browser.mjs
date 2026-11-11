import { launch } from './browser.mjs';

// A worker owns one lazy measurement browser. Each lease closes its pages itself;
// only the idle timer or worker shutdown closes the shared browser process.
export function createArchBrowser({launchBrowser = launch, idleMs = 30000} = {}) {
  let pending, timer, active = 0, closed = false, disposing = Promise.resolve();
  function dispose() {
    const current = pending; pending = null;
    if (current) disposing = disposing.then(async () => {
      const browser = await current.catch(() => null);
      await browser?.close();
    });
    return disposing;
  }
  return {
    async run(build) {
      if (closed) throw Error('Architecture browser is closed');
      clearTimeout(timer); active++;
      try {
        await disposing;
        if (closed) throw Error('Architecture browser is closed');
        if (!pending) {
          const attempt = Promise.resolve().then(launchBrowser);
          pending = attempt;
          attempt.then(browser => browser.on('disconnected', () => {
            if (pending === attempt) pending = null;
          }), () => { if (pending === attempt) pending = null; });
        }
        return await build(await pending);
      } finally {
        active--;
        if (!closed && !active) {
          timer = setTimeout(() => { dispose().catch(() => {}); }, idleMs);
          timer.unref();
        }
      }
    },
    close() { closed = true; clearTimeout(timer); return dispose(); },
  };
}
