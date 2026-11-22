import path from 'node:path';
import { sourceDirectories } from './project.mjs';
import { escape } from './html.mjs';

export const captureExemptionKey = ({ source, frame }) => JSON.stringify([source, frame]);

export function inspectCaptureExemptions(config, map, { sources, built, bindings, selected }) {
  const known = new Set(sources), scope = selected && new Set(selected);
  const top = sourceDirectories(config).filter(layer => layer !== 'studies').at(-1);
  const active = [], findings = [];
  for (const [index, entry] of (map.captureExemptions ?? []).entries()) {
    const { source, frame, reason } = entry;
    if (scope && !scope.has(source)) continue;
    const pointer = '/captureExemptions/' + index;
    const report = (code, detail) => findings.push({ code, source: map.source, frame, pointer,
      line: map.locations?.[pointer]?.line ?? null, column: map.locations?.[pointer]?.column ?? null,
      message: `${source}#${frame}: ${detail} Authored reason: ${reason}` });
    const asset = built.get(source);
    if (known.has(source) && !asset) continue;
    const target = asset?.frames.find(candidate => candidate.name === frame);
    if (!target) {
      report('OWNER_CAPTURE_EXEMPTION_STALE', 'Frame no longer exists. Remove the exemption.');
      continue;
    }
    const layer = path.relative(config.design, path.join(config.root, source)).split(path.sep)[0];
    if (layer !== top || target.proposed ||
      !bindings.some(binding => binding.active && binding.design.source === source &&
        !binding.design.part && binding.frames.includes(frame))) {
      report('OWNER_CAPTURE_EXEMPTION_INVALID', 'Capture exemptions require a current production surface frame with a valid whole-source binding.');
      continue;
    }
    if (target.capture || target.fixture) {
      report('OWNER_CAPTURE_EXEMPTION_STALE', 'Frame now declares capture or fixture metadata. Remove the exemption.');
      continue;
    }
    active.push(entry);
  }
  return { active, findings };
}

export function renderCaptureExemptions(entries = []) {
  return entries.length ? '<section aria-label="Capture exemptions"><h2>Capture exemptions (' + entries.length +
    ')</h2><ul>' + entries.map(({ source, frame, reason }) =>
      `<li><code>${escape(source)}#${escape(frame)}</code> · ${escape(reason)}</li>`).join('') + '</ul></section>' : '';
}
