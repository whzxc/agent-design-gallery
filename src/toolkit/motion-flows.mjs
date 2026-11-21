export const frameKey = ({ source, frame }) => JSON.stringify([source, frame]);

// Connectivity is undirected. Direction is retained on the edges for playback.
export function motionFlows(records, declarations) {
  const incident = new Map(), byFrame = new Map(), members = new Map(), findings = [];
  for (const { edge } of records) {
    for (const ref of [edge.from, edge.to]) {
      const key = frameKey(ref);
      if (!incident.has(key)) incident.set(key, []);
      incident.get(key).push(edge);
    }
  }
  for (const [key] of incident) {
    if (byFrame.has(key)) continue;
    const queue = [key], frames = new Map(), edges = new Set();
    const flow = { frames: [], triggers: [] };
    byFrame.set(key, flow);
    for (const current of queue) {
      for (const edge of incident.get(current)) {
        edges.add(edge);
        for (const ref of [edge.from, edge.to]) {
          const id = frameKey(ref);
          frames.set(id, ref);
          if (byFrame.has(id)) continue;
          byFrame.set(id, flow);
          queue.push(id);
        }
      }
    }
    flow.frames = [...frames.values()];
    const destinations = new Set([...edges].map((edge) => frameKey(edge.to)));
    flow.start = flow.frames.find((ref) => !destinations.has(frameKey(ref))) ?? incident.get(key)[0].from;
    members.set(flow, [...edges]);
  }
  const declared = new Set();
  for (const { declaration, source, pointer, locations } of declarations) {
    const flow = byFrame.get(frameKey(declaration.start));
    const message = !flow
      ? 'Flow start must be an endpoint of a transition.'
      : declared.has(flow) ? 'Declare one flow per connected component.' : null;
    if (message) {
      findings.push({
        code: 'MOTION_FLOW_SCHEMA', source, pointer, frame: declaration.start.frame,
        theme: null, message, ...(locations[pointer] ?? locations[''])
      });
      continue;
    }
    Object.assign(flow, declaration);
    declared.add(flow);
  }
  for (const [flow, edges] of members) {
    if (flow.anchor) continue;
    const start = frameKey(flow.start);
    const ordered = [...edges.filter((edge) => frameKey(edge.from) === start),
      ...edges.filter((edge) => frameKey(edge.from) !== start)];
    const triggers = new Map();
    for (const { trigger: { target } } of ordered) {
      if (!target.frame) triggers.set(JSON.stringify(target), target);
    }
    flow.triggers = [...triggers.values()];
  }
  return { byFrame, findings };
}
