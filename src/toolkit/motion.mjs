import path from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { lexer } from 'css-tree';
import { CliError } from '../cli-output.mjs';
import { jsonLocations } from './json-locations.mjs';
import { portablePath } from './owner-locators.mjs';
import { motionFlows } from './motion-flows.mjs';
import { relative } from './project.mjs';
import { loadMotionPatterns, patternEdge } from './motion-patterns.mjs';
import { motionPrimitives, motionTransformValue } from './motion-primitives.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
export const edgeId = (value) => typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
const frameRef = (value) =>
  fields(value, ['source', 'frame']) && portablePath(value.source) && value.source.endsWith('.tsx') && text(value.frame);
const modes = ['match', 'enter', 'exit', 'crossfade'];
function target(value) {
  if (fields(value, ['frame'])) return value.frame === true;
  if (fields(value, ['anchor'])) return text(value.anchor);
  if (!fields(value, ['part', 'key']) || !text(value.part)) return false;
  const [source, part, ...extra] = value.part.split('#');
  return (
    !extra.length &&
    portablePath(source) &&
    source.endsWith('.tsx') &&
    text(part) &&
    (value.key === undefined || text(value.key) || Number.isFinite(value.key))
  );
}

function validateShape(e, issue, { patternBacked } = {}) {
  if (
    !fields(e, [
      'id',
      'label',
      'from',
      'to',
      'trigger',
      'duration',
      'easing',
      'phases',
      'instant',
      'interrupt',
      'reduced',
      'focus',
      'rememberTrigger',
      'proposed',
      'unsupported',
      ...(patternBacked ? ['playbackOmissions'] : [])
    ])
  )
    issue('MOTION_SCHEMA', '', 'Use only version 1 edge fields.');
  if (!object(e)) return;
  if (!edgeId(e.id)) issue('MOTION_SCHEMA', '/id', 'Use a project-unique kebab-case ID.');
  for (const side of ['from', 'to'])
    if (!frameRef(e[side])) issue('MOTION_SCHEMA', '/' + side, 'Expected an exact project-relative TSX source and frame.');
  if (e.label !== undefined && (!text(e.label) || /[\r\n\x00-\x1f]|<\/?[a-z][^>]*>/i.test(e.label)))
    issue('MOTION_SCHEMA', '/label', 'Use a nonempty plain-text action name.');
  const t = e.trigger;
  if (
    !fields(t, ['on', 'target', 'key', 'value']) ||
    !['click', 'hover', 'focus', 'key', 'input'].includes(t.on) ||
    !target(t.target) ||
    (t.on === 'input' ? typeof t.value !== 'string' : t.value !== undefined) ||
    (t.on === 'key' ? !(text(t.key) || t.key === ' ') : t.key !== undefined)
  )
    issue('MOTION_SCHEMA', '/trigger', 'Choose an input and a unique target; key takes a key and input takes an exact string value.');
  // Pattern policies describe runtime behavior and are validated by the catalog.
  if (!patternBacked) {
    if (e.interrupt !== 'finish') issue('MOTION_SCHEMA', '/interrupt', 'Version 1 requires finish.');
    if (e.reduced !== 'instant') issue('MOTION_REDUCED_MISSING', '/reduced', 'Declare the instant fallback.');
  }
  if (
    !['frame', 'preserve', 'restore-trigger'].includes(e.focus) &&
    !(fields(e.focus, ['target']) && target(e.focus.target))
  )
    issue('MOTION_FOCUS', '/focus', 'Declare a focus outcome or one destination target.');
  if (e.rememberTrigger !== undefined && ![true, 'replace'].includes(e.rememberTrigger))
    issue('MOTION_SCHEMA', '/rememberTrigger', 'Use true or replace.');
  if (e.proposed !== undefined && !text(e.proposed)) issue('MOTION_STATUS', '/proposed', 'Name an active review scope.');
  if (
    e.unsupported !== undefined &&
    !(
      Array.isArray(e.unsupported) &&
      e.unsupported.length &&
      e.unsupported.every((u) => fields(u, ['effect', 'reason']) && text(u.effect) && text(u.reason))
    )
  )
    issue('MOTION_SCHEMA', '/unsupported', 'Name each unsupported effect and its reason.');
  if (e.instant !== undefined && !(Array.isArray(e.instant) && e.instant.length && e.instant.every(target)))
    issue('MOTION_SCHEMA', '/instant', 'Declare a nonempty list of cut targets.');
  if (!Array.isArray(e.phases)) {
    issue('MOTION_SCHEMA', '/phases', 'Declare a phase array.');
    return;
  }
  e.phases.forEach((phase, i) => {
    const at = '/phases/' + i;
    if (!Array.isArray(phase) || !phase.length) {
      issue('MOTION_SCHEMA', at, 'A phase needs tracks.');
      return;
    }
    phase.forEach((track, j) => {
      const p = at + '/' + j;
      if (
        !fields(track, ['targets', 'properties', 'mode', 'duration', 'easing', 'fromOpacity',
          ...(patternBacked ? ['transform'] : [])]) ||
        !modes.includes(track.mode) ||
        !Array.isArray(track.targets) ||
        !track.targets.length ||
        !track.targets.every(target)
      ) {
        issue('MOTION_SCHEMA', p, 'Invalid track mode, targets or fields.');
        return;
      }
      if (
        track.fromOpacity !== undefined &&
        !(track.mode === 'enter' && Number.isFinite(track.fromOpacity) && track.fromOpacity >= 0 && track.fromOpacity <= 1)
      )
        issue('MOTION_SCHEMA', p + '/fromOpacity', 'Only enter accepts a starting opacity in [0,1].');
      const props = track.properties,
        allowed = track.mode === 'match' ? ['x', 'y', 'width', 'height', 'opacity'] : ['opacity'];
      if (track.transform?.distance) allowed.push('translate');
      if (track.transform?.scale) allowed.push('scale');
      if (
        !Array.isArray(props) ||
        (!props.length && !(patternBacked && e.playbackOmissions?.length)) ||
        props.some((prop) => !allowed.includes(prop)) ||
        new Set(props).size !== props.length
      )
        issue('MOTION_TRACK_CONFLICT', p + '/properties', 'Select distinct properties supported by this track mode.');
    });
  });
}

export function motionFiles(config) {
  function visit(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
      const file = path.join(dir, entry.name);
      return entry.isDirectory() ? visit(file) : entry.isFile() && file.endsWith('.motion.json') ? [file] : [];
    });
  }
  return visit(config.design).sort();
}

export function unownedMotionSidecars(config, sourceFiles, sidecars, paths = path) {
  const owners = new Set(sourceFiles.map(file => relative(config, file, paths)));
  return sidecars.filter(source => !owners.has(source.replace(/\.motion\.json$/, '.tsx')));
}

export function readMotion(config, files = motionFiles(config), { allowMissingFlowAnchor = false } = {}) {
  const records = [],
    declarations = [],
    findings = [],
    ids = new Map();
  let catalog;
  for (const file of files) {
    const source = relative(config, file),
      owner = source.replace(/\.motion\.json$/, '.tsx');
    let raw, doc;
    try {
      raw = readFileSync(file, 'utf8');
      doc = JSON.parse(raw);
    } catch (cause) {
      throw new CliError('SOURCE_BUILD_FAILED', source + ': ' + cause.message, { cause });
    }
    if (object(doc) && Object.hasOwn(doc, 'version') && doc.version !== 1)
      throw new CliError('SOURCE_BUILD_FAILED', source + ': unsupported motion version.');
    const locations = jsonLocations(raw);
    function issue(code, pointer, message, id) {
      findings.push({
        code,
        source,
        pointer,
        message,
        transition: id ?? null,
        ...(locations[pointer] ?? locations['']),
        frame: null,
        theme: null
      });
    }
    if (!fields(doc, ['version', 'edges', 'flows']) || doc.version !== 1 || !Array.isArray(doc.edges)) {
      issue('MOTION_SCHEMA', '', 'Expected version 1 and an edges array.');
      continue;
    }
    if (doc.flows !== undefined && !Array.isArray(doc.flows))
      issue('MOTION_FLOW_SCHEMA', '/flows', 'Expected a flows array.');
    for (const [index, declaration] of (Array.isArray(doc.flows) ? doc.flows : []).entries()) {
      const pointer = '/flows/' + index;
      if (!fields(declaration, ['start', 'anchor', 'stage', 'ends']) ||
          !frameRef(declaration.start) || declaration.start.source !== owner ||
          (!(allowMissingFlowAnchor && declaration.anchor === undefined) &&
            (!target(declaration.anchor) || declaration.anchor.frame)) ||
          (declaration.stage !== undefined && (!fields(declaration.stage, ['width', 'height']) ||
            ![declaration.stage.width, declaration.stage.height].every((value) => Number.isFinite(value) && value > 0)))) {
        issue('MOTION_FLOW_SCHEMA', pointer, 'Use a start frame in this sidecar’s source, a part or motion anchor, and optional positive stage dimensions.');
        continue;
      }
      let ends;
      if (declaration.ends !== undefined) {
        if (!Array.isArray(declaration.ends) || declaration.ends.some(ref =>
          !fields(ref, ['source', 'frame']) || !frameRef({ source: owner, ...ref }))) {
          issue('MOTION_FLOW_SCHEMA', pointer + '/ends', 'Use an array of frame references. Omit source for frames in this sidecar’s source.');
          continue;
        }
        ends = declaration.ends.map(ref => ({ source: owner, ...ref }));
      }
      declarations.push({ declaration: { ...declaration, ...(ends && { ends }) }, source, pointer, locations });
    }
    doc.edges.forEach((edge, index) => {
      const pointer = '/edges/' + index,
        problems = [];
      const report = (code, suffix, message) => {
        problems.push(code);
        issue(code, pointer + suffix, message, edge?.id);
      };
      const pattern = edge?.pattern;
      const resolved = pattern === undefined ? edge : patternEdge(edge, catalog ??= loadMotionPatterns(config), report);
      if (!problems.length) validateShape(resolved, report, { patternBacked: pattern !== undefined });
      const record = { source, owner, edge: resolved, pointer, locations, valid: problems.length === 0,
        ...(pattern === undefined ? {} : { pattern }) };
      records.push(record);
      if (!edgeId(edge?.id)) return;
      if (!ids.has(edge.id)) ids.set(edge.id, []);
      ids.get(edge.id).push(record);
    });
  }
  for (const group of ids.values())
    if (group.length > 1)
      for (const r of group) {
        r.valid = false;
        const pointer = r.pointer + '/id';
        findings.push({
          code: 'MOTION_ID_CONFLICT',
          source: r.source,
          pointer,
          ...r.locations[pointer],
          transition: r.edge.id,
          frame: null,
          theme: null,
          message: 'Duplicate transition ID ' + r.edge.id
        });
      }
  const { byFrame: flows, findings: flowFindings, deadEnds } = motionFlows(records.filter((r) => r.valid), declarations);
  findings.push(...flowFindings);
  return { records, findings, ids, declarations, flows, deadEnds, files: files.map((f) => relative(config, f)) };
}

const cssNumber = '[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const linearStop = new RegExp(
  '^(?:' + cssNumber + '(?:\\s+' + cssNumber + '%){0,2}|(?:' + cssNumber + '%\\s+){1,2}' + cssNumber + ')$'
);
function validEasing(raw) {
  // The bundled CSS grammar predates the piecewise linear() function.
  const linear = /^linear\(([^()]*)\)$/i.exec(raw);
  if (linear) {
    const stops = linear[1].split(',').map((value) => value.trim());
    return stops.length >= 2 && stops.every((stop) => linearStop.test(stop));
  }
  if (!lexer.matchType('easing-function', raw).matched) return false;
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*([\w-]+)\s*)?\)$/i.exec(raw);
  return !steps || Number(steps[1]) >= (steps[2]?.toLowerCase() === 'jump-none' ? 2 : 1);
}

const expandedTokens = new WeakMap();
export function resolveMotionToken(tokens, theme, name, kind) {
  const transform = kind === 'distance' || kind === 'scale';
  if (transform || typeof name === 'string' && /^(--adg-motion-|--motion-spring-)/.test(name)) {
    if (!expandedTokens.has(tokens)) expandedTokens.set(tokens, motionPrimitives(tokens).tokens);
    tokens = expandedTokens.get(tokens);
  }
  const names = [],
    invalid = () => ({ names, value: null });
  if (typeof name !== 'string' || !/^--[\w-]+$/.test(name)) return invalid();
  let key = name;
  while (!names.includes(key)) {
    names.push(key);
    const raw = (theme === 'dark' ? tokens.dark.get(key) : undefined) ?? tokens.light.get(key);
    if (!raw) return invalid();
    const alias = /^var\(\s*(--[\w-]+)\s*\)$/.exec(raw);
    if (alias) {
      key = alias[1];
      continue;
    }
    if (transform) return { names, value: motionTransformValue(kind, raw) };
    if (kind === 'duration') {
      const time = /^(\+?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)$/i.exec(raw);
      const ms = time ? Number(time[1]) * (time[2].toLowerCase() === 's' ? 1000 : 1) : NaN;
      return Number.isFinite(ms) ? { names, value: ms } : invalid();
    }
    if (!validEasing(raw)) return invalid();
    return { names, value: raw };
  }
  return invalid();
}

export function timingRefs(edge) {
  const refs = [{ pointer: '', scope: edge }];
  edge.phases.forEach((phase, i) => phase.forEach((scope, j) => refs.push({ pointer: '/phases/' + i + '/' + j, scope })));
  return refs.flatMap(({ pointer, scope }) =>
    ['duration', 'easing']
      .filter((kind) => !pointer || Object.hasOwn(scope, kind))
      .map((kind) => ({ pointer: pointer + '/' + kind, kind, name: scope[kind] }))
  );
}

export function transformRefs(edge) {
  return edge.phases.flatMap((phase, i) => phase.flatMap(({ transform }, j) =>
    ['distance', 'scale'].filter(kind => transform?.[kind]).map(kind => ({
      pointer: '/phases/' + i + '/' + j + '/transform/' + kind, kind, name: transform[kind]
    }))));
}

export function motionSummary(data, rows, expanded = false) {
  if (rows.length || expanded) data.motion = { count: rows.length, ...(expanded ? { edges: rows } : {}) };
}

export function motionRows(records) {
  return [...new Map(records.filter((r) => edgeId(r.edge?.id)).map((r) => [r.edge.id, r])).values()].sort((a, b) =>
    a.edge.id.localeCompare(b.edge.id, 'en')
  );
}
