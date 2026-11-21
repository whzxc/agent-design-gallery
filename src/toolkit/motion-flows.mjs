export const frameKey = ({ source, frame }) => JSON.stringify([source, frame]);

// Connectivity is undirected. Direction is retained on the edges for playback.
export function motionFlows(records, declarations) {
  const incident = new Map(), byFrame = new Map(), members = new Map(), findings = [];
  const outgoing = new Set();
  for (const { edge } of records) {
    outgoing.add(frameKey(edge.from));
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
  const declared = new Set(), ends = new Set();
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
    for (const [index, ref] of (declaration.ends ?? []).entries()) {
      const key = frameKey(ref), at = pointer + '/ends/' + index;
      const problem = byFrame.get(key) !== flow ? 'An end state must belong to the declared flow.'
        : outgoing.has(key) ? 'An end state cannot have outgoing transitions.'
        : ends.has(key) ? 'Declare each end state once.' : null;
      if (problem) {
        findings.push({ code: 'MOTION_FLOW_SCHEMA', source, pointer: at, frame: ref.frame,
          theme: null, message: problem, ...(locations[at] ?? locations[pointer]) });
      } else ends.add(key);
    }
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
  const deadEnds = new Set([...byFrame.keys()].filter(key => !outgoing.has(key) && !ends.has(key)));
  return { byFrame, findings, deadEnds };
}

// Use the first selected incoming edge to locate each dead end in its sidecar.
export function deadEndFindings(graph, records, strictMotion) {
  const reported = new Set(), findings = [];
  for (const { valid, edge, source, pointer, locations } of records) {
    if (!valid) continue;
    const ref = edge.to, key = frameKey(ref);
    if (!graph.deadEnds.has(key) || reported.has(key)) continue;
    reported.add(key);
    const at = pointer + '/to';
    findings.push({
      code: 'MOTION_FLOW_DEAD_END', source, pointer: at, frame: ref.frame, theme: null,
      warning: !strictMotion,
      message: ref.source + '#' + ref.frame + ' has no outgoing transition. Add an action or declare it in the flow’s ends.',
      ...(locations[at] ?? locations[pointer])
    });
  }
  return findings;
}
