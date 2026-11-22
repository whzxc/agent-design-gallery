import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { frameKey } from './motion-flows.mjs';
import { scanMotion } from './motion-inventory.mjs';
import { fallbackMotionRoles, loadMotionPatterns, patternParameters } from './motion-patterns.mjs';
import { readMotion, timingRefs } from './motion.mjs';

function report(data, summary, log) {
  log(summary);
  for (const {source, line, message} of data.unscanned)
    log(source + (line ? ':' + line : '') + ' ' + message);
  let remaining = 32, omitted = 0;
  function row(message) {
    if (remaining > 0) { log(message); remaining--; }
    else omitted++;
  }
  for (const {role, token} of data.fallbackRoles)
    row('Default role ' + role + ': ' + token);
  for (const {source, line, id} of data.unlabeledEdges)
    row(source + ':' + line + ' missing label: ' + id);
  for (const {start, missing} of data.incompleteFlows)
    row(start.source + '#' + start.frame + ' missing flow ' + missing.join(', '));
  for (const {source, groups} of data.unmapped) {
    for (const {match, within, lines} of groups) {
      const locations = lines.slice(0, 16).join(',');
      const more = lines.length > 16 ? ' (+' + (lines.length - 16) + ' lines)' : '';
      row(source + ':' + locations + more + ' ' + match + (within ? ' within ' + within : ''));
    }
  }
  if (omitted || data.unmapped.some(({groups}) => groups.some(({lines}) => lines.length > 16)))
    log((omitted ? omitted + ' more groups. ' : '') + 'Use --json for all locations.');
}

export function motionCoverage(config, log) {
  const catalog = loadMotionPatterns(config);
  const graph = readMotion(config, undefined, { allowMissingFlowAnchor: true });
  if (graph.findings.length) {
    const { source, line, message } = graph.findings[0];
    throw new CliError('CONFIG_INVALID', source + ':' + line + ': ' + message);
  }
  const inventory = scanMotion(config, catalog, graph);
  const design = path.relative(config.root, config.design).split(path.sep).join('/');
  const files = new Map();
  const unscanned = [];
  const implementation = source => !design || !source.startsWith(design + '/');
  let unmappedSites = 0;
  for (const issue of inventory.issues) {
    const {source, code, line, match, within} = issue;
    if (code === 'MOTION_SCAN_FAILED') unscanned.push({ source, line, message: issue.message });
    if (code !== 'MOTION_UNMAPPED' || !implementation(source)) continue;
    if (!files.has(source)) files.set(source, new Map());
    const groups = files.get(source), key = JSON.stringify([match, within]);
    if (!groups.has(key)) groups.set(key, { match, ...(within && { within }), lines: [] });
    groups.get(key).lines.push(line);
    unmappedSites++;
  }

  const roles = new Map();
  function recordRoles(values, pattern) {
    for (const [role, token] of fallbackMotionRoles(catalog, values)) {
      if (!roles.has(role)) roles.set(role, { role, token, patterns: new Set() });
      if (pattern) roles.get(role).patterns.add(pattern);
    }
  }
  for (const [id, consumers] of inventory.consumers) {
    if (!consumers.some(ref => ref.type !== 'edge')) continue;
    const pattern = catalog.patterns.get(id);
    for (const direction of new Set([pattern.action, ...['enter','exit'].filter(dir => pattern[dir])]))
      recordRoles(Object.values(patternParameters(pattern, direction)), id);
  }
  const unlabeledEdges = [];
  for (const {edge, source, pointer, locations, pattern} of graph.records) {
    if (!edge.label) unlabeledEdges.push({ source, line: locations[pointer].line, id: edge.id });
    recordRoles(timingRefs(edge).map(ref => ref.name), pattern?.id);
  }
  const incompleteFlows = [];
  for (const flow of new Set(graph.flows.values())) {
    const missing = [];
    if (!flow.anchor) missing.push('anchor');
    if (flow.ends === undefined || flow.frames.some(frame => graph.deadEnds.has(frameKey(frame)))) missing.push('ends');
    if (missing.length) incompleteFlows.push({ start: flow.start, missing });
  }
  const fallbackRoles = [...roles.values()].map(row => ({ ...row, patterns: [...row.patterns].sort() }))
    .sort((a, b) => a.role.localeCompare(b.role, 'en'));
  const ignored = inventory.ignored.filter(site => implementation(site.source));
  const data = {
    summary: { unmappedSites, fallbackRoles: fallbackRoles.length, unlabeledEdges: unlabeledEdges.length,
      incompleteFlows: incompleteFlows.length, unscannedFiles: unscanned.length, ignoredSites: ignored.length },
    unmapped: [...files].map(([source, groups]) => ({ source, groups: [...groups.values()] })),
    fallbackRoles, unlabeledEdges, incompleteFlows, unscanned, ignored,
  };
  const summary = 'Motion coverage: ' + unmappedSites + ' unmapped implementation sites, ' + fallbackRoles.length +
    ' default roles, ' + unlabeledEdges.length + ' unlabeled edges, ' + incompleteFlows.length + ' incomplete flows, ' +
    unscanned.length + ' unscanned files, ' + ignored.length + ' ignored sites.';
  report(data, summary, log);
  if (unscanned.length) throw new CliError('SOURCE_BUILD_FAILED', summary, { data, humanReported: true });
  if (unmappedSites || fallbackRoles.length || unlabeledEdges.length || incompleteFlows.length) {
    throw new CliError('MOTION_COVERAGE_FAILED', summary, { data, humanReported: true });
  }
  return { data };
}
