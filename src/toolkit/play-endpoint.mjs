import { edgePresentation } from './motion-label.mjs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { frameKey, motionFlows } from './motion-flows.mjs';
import { readMotion, resolveMotionToken, timingRefs } from './motion.mjs';
import { relative, loadTokens } from './project.mjs';
import { CliError } from '../cli-output.mjs';

// The server has already resolved the requested name against its current TSX inventory.
export function sourceMotion(config, root, source) {
  const owner = relative(config, path.join(root, source));
  const sidecar = path.join(root, source.replace(/\.tsx$/, '.motion.json'));
  const graph = readMotion(config, existsSync(sidecar) ? [sidecar] : []);
  return {
    records: graph.records.filter(r => r.valid && r.edge.from.source === owner),
    declarations: graph.declarations
  };
}
export function playbackGraph(config, root, owners, inventory) {
  const records = [], declarations = [];
  for (const source of [...owners.keys()].sort()) {
    const indexed = owners.get(source);
    if (indexed.error) continue;
    try {
      indexed.motion ??= sourceMotion(config, root, source);
      records.push(...indexed.motion.records);
      declarations.push(...indexed.motion.declarations);
    } catch (error) {
      indexed.error = error;
    }
  }
  const design = relative(config, root);
  const prefix = design ? design + '/' : '';
  const available = (ref) => ref.source.startsWith(prefix) && inventory.has(ref.source.slice(prefix.length));
  const playable = records.filter(({ edge }) => available(edge.from) && available(edge.to));
  return { records, flows: motionFlows(playable, declarations).byFrame };
}

export async function playEndpoint(config, root, source, frame, theme, build, graph) {
  const ref = { source: relative(config, path.join(root, source)), frame };
  const records = graph.records.filter(r => r.edge.from.source === ref.source && r.edge.from.frame === frame);
  const built = await build(source),
    endpoint = built.frames.find((f) => f.name === frame);
  if (!endpoint) throw new CliError('FRAME_NOT_FOUND', 'Unknown playback frame.');
  const tokens = loadTokens(config),
    design = relative(config, root);
  const edges = records.map(({ edge }) => playbackEdge(edge, endpoint, tokens, theme, design));
  return {
    design,
    source,
    frame,
    html: endpoint.html,
    css: built.css,
    width: endpoint.width,
    height: endpoint.height,
    edges,
    flow: graph.flows.get(frameKey(ref)) ?? null
  };
}

export function playbackEdge(edge, endpoint, tokens, theme, design) {
  const timings = Object.fromEntries(timingRefs(edge).map(({ pointer, name, kind }) =>
    [pointer, resolveMotionToken(tokens, theme, name, kind).value]));
  if (Object.values(timings).includes(null)) throw Error('Unresolved timing on ' + edge.id + '. Run adg check.');
  return { ...edge, ...edgePresentation(edge, endpoint.html, design), authoredLabel: !!edge.label, timings };
}
