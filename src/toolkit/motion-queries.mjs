import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { listSources, relative, selectSources, sourceDirectories, loadTokens } from './project.mjs';
import { loadImplementationMap, validateImplementationMap } from './implementation-map.mjs';
import { readMotion, motionRows, motionSummary, resolveMotionToken, timingRefs } from './motion.mjs';
import { motionEvaluator } from './motion-check.mjs';
import { buildSource } from './build.mjs';
import { launch } from './browser.mjs';

export function targetsFor(edge, side) {
  return [
    ...(side === 'from' ? [edge.trigger.target] : edge.focus.target ? [edge.focus.target] : []),
    ...edge.phases
      .flat()
      .filter((track) => side === 'from' || track.mode !== 'exit')
      .flatMap((t) => t.targets)
  ];
}
export function usesTiming(edge, tokens, names, themes) {
  return timingRefs(edge).some((ref) =>
    themes.some((theme) => resolveMotionToken(tokens, theme, ref.name, ref.kind).names.some((name) => names.includes(name)))
  );
}
export function tokenEdges(config, values, data) {
  const graph = readMotion(config);
  if (!graph.records.length) {
    motionSummary(data, [], values.transitions);
    return;
  }
  const tokens = loadTokens(config),
    themes = values.theme && values.theme !== 'both' ? [values.theme] : ['light', 'dark'];
  const records = motionRows(graph.records.filter((r) => r.valid && usesTiming(r.edge, tokens, [values.token], themes)));
  motionSummary(
    data,
    records.map((r) => r.edge.id),
    values.transitions
  );
}
export function boundEdges(config, bindings, data, expanded = false) {
  const active = (bindings ?? []).filter((b) => b.active);
  let ids = active.map((b) => b.design.transition);
  if (data.query.kind === 'part') {
    const { source, part } = data.query;
    if (!part) ids = active.filter((b) => b.design.source === source).map((b) => b.design.transition);
    else if (ids.length) {
      const allowed = new Set(ids);
      ids = readMotion(config)
        .records.filter(
          (r) =>
            r.valid &&
            allowed.has(r.edge.id) &&
            ['from', 'to'].some((side) => targetsFor(r.edge, side).some((t) => t.part === source + '#' + part))
        )
        .map((r) => r.edge.id);
    }
  }
  motionSummary(data, [...new Set(ids)].sort(), expanded);
}
async function behaviorMap(config, owner) {
  const map = await loadImplementationMap(config);
  const validated = await validateImplementationMap(config, map, {
    targetFilter: (target) => target.transition && target.source === owner,
    sources: listSources(config.design, sourceDirectories(config)).map((f) => relative(config, f))
  });
  return { map, ...validated };
}
export async function transitionQuery(config, command, args, values, log) {
  const graph = readMotion(config);
  const data = {
    project: config.root,
    complete: true,
    motionVersion: 1,
    mode: values.transitions ? 'transitions' : 'transition'
  };
  if (values.transitions) {
    const [file] = selectSources(config, args, { write: false }),
      source = relative(config, file);
    const built = await buildSource(config, file, { write: false });
    if (!built.frames.some((f) => f.name === values.frame))
      throw new CliError('FRAME_NOT_FOUND', 'Unknown frame ' + values.frame);
    const rows = motionRows(
      graph.records.filter(
        (r) => r.valid && [r.edge.from, r.edge.to].some((ref) => ref.source === source && ref.frame === values.frame)
      )
    );
    motionSummary(
      data,
      rows.map(({ edge: e }) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        input: e.trigger.on,
        ...(e.proposed ? { proposed: e.proposed } : {})
      })),
      true
    );
  } else {
    const records = graph.ids.get(values.transition) ?? [];
    if (!records.length) throw new CliError('MOTION_EDGE_NOT_FOUND', 'Unknown transition ' + values.transition + '.');
    if (records.length !== 1)
      throw new CliError('SOURCE_BUILD_FAILED', 'Conflicting transition ID ' + values.transition + '; run adg check.');
    const [r] = records,
      validated = await behaviorMap(config, r.owner);
    const bindings = validated.transitionBindings.filter((b) => b.active && b.design.transition === r.edge.id);
    if (command === 'owner') {
      data.query = { kind: 'transition', id: r.edge.id };
      data.bindings = bindings.map((b) => ({
        selector: b.implementation,
        files: b.files,
        anchorLine: b.anchorLine,
        pointer: b.pointer
      }));
      data.mappingFindings = validated.findings;
    } else {
      data.findings = graph.findings.filter(
        (f) => f.source === r.source && (f.pointer === r.pointer || f.pointer.startsWith(r.pointer + '/'))
      );
      data.edge = r.edge;
      if (r.valid) {
        let browser, page;
        try {
          const evaluate = motionEvaluator(config, {
            bindings,
            hasMap: validated.map.present,
            themes: values.theme && values.theme !== 'both' ? [values.theme] : ['light', 'dark'],
            getPage: async () => {
              browser ??= await launch();
              return (page ??= await browser.newPage());
            }
          });
          for (const peer of graph.records) {
            if (
              peer !== r &&
              peer.valid &&
              peer.edge.from.source === r.edge.from.source &&
              peer.edge.from.frame === r.edge.from.frame
            )
              await evaluate(peer);
          }
          const { detail, findings } = await evaluate(r);
          data.bound = detail.bound;
          data.themes = detail.themes;
          data.findings.push(...findings);
          if (!values.explain)
            for (const facts of Object.values(data.themes)) {
              if (facts.limitations)
                facts.limitations = Object.fromEntries(
                  [...new Set(facts.limitations.map((l) => l.reason))].map((reason) => [
                    reason,
                    facts.limitations.filter((l) => l.reason === reason).length
                  ])
                );
              for (const k of ['pairs', 'targets', 'tracks', 'ambiguous', 'conflicts']) delete facts[k];
            }
        } finally {
          await browser?.close();
        }
      }
    }
  }
  if (!values.json) log(JSON.stringify(data, null, 2));
  return { data, warnings: [] };
}
