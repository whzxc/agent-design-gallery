import { edgePresentation } from './motion-label.mjs';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readMotion, resolveMotionToken, timingRefs } from './motion.mjs';
import { relative, loadTokens } from './project.mjs';
import { CliError } from '../cli-output.mjs';

// The server has already resolved the requested name against its current TSX inventory.
export function outgoingRecords(config, root, source) {
  const owner = relative(config, path.join(root, source));
  const sidecar = path.join(root, source.replace(/\.tsx$/, '.motion.json'));
  const graph = readMotion(config, existsSync(sidecar) ? [sidecar] : []);
  return graph.records.filter(r => r.valid && r.edge.from.source === owner);
}
export async function playEndpoint(config, root, source, frame, theme, build, sourceRecords) {
  const records = sourceRecords.filter(r => r.edge.from.frame === frame);
  const built = await build(source),
    endpoint = built.frames.find((f) => f.name === frame);
  if (!endpoint) throw new CliError('FRAME_NOT_FOUND', 'Unknown playback frame.');
  const tokens = loadTokens(config),
    design = relative(config, root);
  const edges = records.map(({ edge }) => {
    const timings = Object.fromEntries(
      timingRefs(edge).map(({ pointer, name, kind }) => [pointer, resolveMotionToken(tokens, theme, name, kind).value])
    );
    if (Object.values(timings).includes(null)) throw Error('Unresolved timing on ' + edge.id + '. Run adg check.');
    return { ...edge, ...edgePresentation(edge, endpoint.html, design), authoredLabel: !!edge.label, timings };
  });
  return {
    design,
    source,
    frame,
    html: endpoint.html,
    css: built.css,
    width: endpoint.width,
    height: endpoint.height,
    edges
  };
}
