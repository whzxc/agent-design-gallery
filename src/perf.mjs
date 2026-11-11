import { appendFileSync } from 'node:fs';

// Opt-in local diagnostics. Epoch timestamps align Node and browser spans.
const destination = process.env.ADG_PERF_LOG;
export function perfSpan(phase, source, detail = {}) {
  if (!destination) return;
  const start = performance.timeOrigin + performance.now();
  return (extra = {}) => appendFileSync(destination, JSON.stringify({
    phase, source, start, end: performance.timeOrigin + performance.now(),
    pid: process.pid, ...detail, ...extra,
  }) + '\n');
}
