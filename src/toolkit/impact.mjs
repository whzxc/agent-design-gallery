import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { CliError, nextActions } from '../cli-output.mjs';
import { openProjectIndex } from './project-index.mjs';
import { prepareImpactInputs, configInputFiles } from './impact-inputs.mjs';
import { matchDiffFrames } from './diff-inputs.mjs';
import { selectSources, relative } from './project.mjs';
import { loadImplementationMap, implementationFiles } from './implementation-map.mjs';
import { normalizeFileQuery, implementationScope } from './implementation-query.mjs';
import { selectorMatches } from './owner-locators.mjs';
import { relatedSources } from '../../public/relationships.js';
import { commandFailure, cleanup } from './results.mjs';
import { indexDigest } from './index-store.mjs';
import { groupImpactFrames, impactFrameCount } from './impact-output.mjs';
import { canonicalBytes, capturePolicy, entryProjection, equalEntryProof, architectureProjection, equalProof } from './impact-proof.mjs';
import { trackedHash, inputBytes as bytes, verifyInputGeneration } from './input-generation.mjs';
import { createEligibilityChecker } from './impact-eligibility.mjs';

const slash = name => name.split(path.sep).join('/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const outside = name => name === '..' || name.startsWith('../') || path.isAbsolute(name);
const array = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const themesFor = values => values.theme && values.theme !== 'both' ? [values.theme] : ['light', 'dark'];

async function sourceInput(config, input, inventory) {
  try { return relative(config, selectSources(config, [input], { write: false })[0]); }
  catch (error) { if (error.code !== 'SOURCE_NOT_FOUND') throw error; }
  for (const candidate of [path.resolve(config.root, input), path.resolve(config.design, input)]) {
    let file, info;
    try { file = await realpath(candidate); info = await stat(file); }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) continue; throw error; }
    const name = slash(path.relative(await realpath(config.root), file));
    if (outside(name) || outside(slash(path.relative(await realpath(config.design), file)))) continue;
    if (info.isFile() && !inventory.includes(name)) return name;
  }
  throw new CliError('SOURCE_NOT_FOUND', `Unknown design source/input ${input}; choose an existing source or design dependency.`);
}

function mappingBuild(facts) {
  return { parts: facts.parts, frames: facts.frames.map(frame => ({ name: frame.name,
    owners: frame.parts.map(part => ({ source: part.source, export: part.part })) })) };
}

/** Candidate queries and operation-local fresh-input proofs for exact Git endpoints. */
export async function impact(config, values, { log = console.log, openIndex = openProjectIndex, prepareInputs = prepareImpactInputs, consume } = {}) {
  const started = performance.now(), themes = themesFor(values);
  const timings = { prepareMs: 0, indexMs: 0, materializeMs: 0, proofMs: 0, queryMs: 0, totalMs: 0 };
  const timed = async (name, work) => { const start = performance.now(); try { return await work(); } finally { timings[name] += performance.now() - start; } };
  let inputs, data, primary;
  const views = [], warnings = [], tracked = new Map();
  async function track(file) { if (!tracked.has(file)) tracked.set(file, trackedHash(await bytes(file))); }
  const warn = (code, message, next = []) => { if (!warnings.some(warning => warning.code === code)) warnings.push({ code, message, next }); };
  const checkNext = reason => [{ argv: ['adg', 'check', '--read-only', '--json'], reason }];
  const verifyGeneration=()=>verifyInputGeneration({tracked,views,inputs});

  try {
    let query, fileInput;
    await timed('prepareMs', async () => {
      if (values.base !== undefined) { inputs = await prepareInputs(config, values); query = inputs.query; warnings.push(...inputs.warnings); }
      else if (values.file !== undefined) {
        fileInput = await normalizeFileQuery(config, values);
        const { kind, input, normalized, pathKind, line, symbol } = fileInput.query;
        query = { kind, input, normalized, pathKind, line, symbol };
      } else if (values.token !== undefined) query = { kind: 'token', tokens: [...new Set(array(values.token))] };
      else query = { kind: 'source', sources: [], part: values.part ?? null };
    });
    data = { project: config.root, complete: false, query,
      before: inputs ? { kind: 'revision', sha: query.base.sha } : null,
      after: { kind: inputs?.after.revision ? 'revision' : 'working_tree', sha: inputs?.head ?? null },
      selection: { themes, explain: !!values.explain }, changes: [], facts: [], frames: [], mappingFindings: [], unresolvedInputs: [],
      coverage: { inventory: 'incomplete', mapping: 'not_requested', expectedRows: 0, candidateRows: 0, directRows: 0, transitiveRows: 0,
        renderRows: 0, provenRows: 0, unassessedRows: 0, proofComplete: false,
        tokenScan: { reachableRows: 0, fullSheetRows: 0, fallbackReasons: [] } }, timings };

    if (inputs && !inputs.after.revision) for (const change of inputs.changes) {
      for (const name of [change.before, change.after].filter(Boolean)) await track(path.join(inputs.repository, name));
    }
    for (const [side, endpoint] of inputs ? [['before', inputs.before], ['after', inputs.after]] : [['after', { config, revision: null }]]) {
      const view = await timed('indexMs', async () => {
        const current = endpoint.config;
        const index = await openIndex(current, { stateDirectory: values['state-dir'], persist: !inputs && !endpoint.revision, fresh: !!inputs,
          artifactDirectory: side === 'after' && values['out-dir'] !== undefined ? path.resolve(current.root, values['out-dir']) : undefined });
        const view = { side, config: current, index, facts: new Map(), built: new Map(), architecture: new Map(),
          graph: null, routes: new Map(), tokens: null, map: null, configInputs: new Set(), resolved: canonicalBytes(current) };
        views.push(view);
        for (const file of await configInputFiles(current)) { await track(file); view.configInputs.add(slash(path.relative(await realpath(current.root), file))); }
        for (const name of ['adg.config.mjs', 'adg.config.js', 'adg.config.ts']) await track(path.join(current.root, name));
        view.tokenFile = path.join(current.design, 'tokens.css');
        await track(view.tokenFile); view.tokenBytes = await bytes(view.tokenFile);
        if (inputs) for (const source of index.inventory.tsx) await track(path.join(current.root, source));
        return view;
      });
      const { index, config: current } = view;
      if (inputs) await timed('materializeMs', async () => {
        const settled = await Promise.allSettled(index.inventory.tsx.map(async source => [source, await index.materialize(source)]));
        for (const result of settled) { if (result.status === 'rejected') throw result.reason; view.built.set(...result.value); }
      });
      await timed('indexMs', async () => {
        for (const source of index.inventory.tsx) {
          const facts = await index.source(source, { tokens: query.kind === 'token' || query.kind === 'git', fresh: !!inputs });
          view.facts.set(source, facts);
          for (const frame of facts.tokenDependencies ?? []) for (const row of frame.themes) if (themes.includes(row.theme)) {
            const scan = data.coverage.tokenScan;
            if (row.mode === 'reachable_declarations') scan.reachableRows++;
            else scan.fullSheetRows++;
            for (const reason of row.fallbackReasons) if (!scan.fallbackReasons.includes(reason)) scan.fallbackReasons.push(reason);
          }
        }
        for (const source of index.inventory.architecture) {
          const metadata = await index.architecture(source), file = path.join(current.root, source), sidecar = path.join(current.root, metadata.sidecar);
          await track(file); await track(sidecar);
          view.architecture.set(source, { source: await bytes(file), sidecar: await bytes(sidecar), tokens: view.tokenBytes, config: current });
          view.facts.set(source, { source, parts: [], imports: [], dependencies: [source, metadata.sidecar, relative(current, view.tokenFile)], frames: [{ name: 'default', parts: [] }] });
        }
        view.graph = await index.relationships({ facts: view.facts, projectPaths: true });
        view.tokens = view.facts.size || query.kind === 'token' ? index.tokens() : [];
        if (query.kind === 'file' || query.kind === 'git') { view.map = await loadImplementationMap(current); await track(view.map.file); }
      });
    }
    const scan = data.coverage.tokenScan;
    scan.fallbackReasons.sort(compare);
    if (scan.fullSheetRows) warn('IMPACT_TOKEN_FALLBACK', `Token scan used the full sheet for ${scan.fullSheetRows} frame/theme inputs: ${scan.fallbackReasons.join(', ')}.`,
      checkNext('Repair the reported token syntax or unbalanced var() declaration, then repeat the impact query.'));
    const current = views.at(-1), previous = inputs ? views[0] : null;
    const allSources = [...new Set(views.flatMap(view => [...view.facts.keys()]))].sort(compare);
    let rows;
    if (inputs) {
      const renames = inputs.changes.filter(change => change.status === 'renamed').map(change => ({
        before: slash(path.relative(inputs.projectPrefix || '.', change.before)), after: slash(path.relative(inputs.projectPrefix || '.', change.after)) }));
      rows = matchDiffFrames(allSources, previous.facts, current.facts, renames);
    } else rows = allSources.flatMap(source => current.facts.get(source).frames.map(frame => ({ source, frame: frame.name, status: 'current', matchKind: null, matchCandidates: [], before: null, after: frame })));
    data.coverage.expectedRows = rows.length * themes.length;
    const eligibility = createEligibilityChecker();
    const entryChecks = new Map(), projections = new Map();
    const projection = (view, built, frame, theme, reach) => {
      if (!projections.has(built)) projections.set(built, entryProjection(built, capturePolicy(view.config)));
      return projections.get(built)(frame, theme, reach);
    };
    const eligible = (built, frame, theme) => {
      if (!entryChecks.has(built)) entryChecks.set(built, eligibility.withCss(built.css.replace(/<\/style/gi, '<\\/style')));
      return entryChecks.get(built)(frame.html);
    };
    const assessments = new Map();
    const requiredParents = new Set(rows.filter(row => row.status === 'added' && row.after.parent).map(row => JSON.stringify([row.after.parent.source, row.after.parent.frame])));
    const seeds = [], factKeys = new Map();
    function seed(view, kind, source, { part = null, token = null, selectedThemes = themes, pathIndexes = [], pointer = null, frames = null } = {}) {
      const key = JSON.stringify([kind, source, part, token, selectedThemes, pointer, pathIndexes]);
      let fact = factKeys.get(key);
      if (!fact) { fact = { id: `f${factKeys.size + 1}`, kind, source, part, token, themes: selectedThemes, sides: [], pathIndexes }; factKeys.set(key, fact); data.facts.push(fact); }
      if (!fact.sides.includes(view.side)) fact.sides.push(view.side);
      seeds.push({ view, fact, pointer, frames });
    }
    function unresolved(name, reason) { if (!data.unresolvedInputs.some(input => input.path === name && input.reason === reason)) data.unresolvedInputs.push({ path: name, reason, fallback: 'none' }); }
    async function mappings(view, indices, pathIndexes = []) {
      if (!view.map.present) { data.coverage.mapping = data.coverage.mapping === 'stale' ? 'stale' : 'absent'; unresolved(view.map.source, 'mapping_absent'); return; }
      if (data.coverage.mapping === 'not_requested') data.coverage.mapping = 'valid';
      const validated = await view.index.mappings({ map: view.map, mappingIndices: indices,
        getBuild: source => {
          const facts = view.facts.get(source);
          // Mapping validators expect design-relative marker provenance.
          const built = mappingBuild(facts);
          for (const frame of built.frames) for (const owner of frame.owners) owner.source = slash(path.relative(view.config.design, path.join(view.config.root, owner.source)));
          return built;
        } });
      for (const finding of validated.findings) {
        const existing = data.mappingFindings.find(item => JSON.stringify({ ...item, sides: undefined }) === JSON.stringify(finding));
        if (existing) { if (!existing.sides.includes(view.side)) existing.sides.push(view.side); }
        else data.mappingFindings.push({ ...finding, sides: [view.side] });
      }
      if (validated.findings.length) data.coverage.mapping = 'stale';
      for (const [file, hash] of Object.entries(validated.implementationHashes)) {
        const name = path.join(view.config.root, file);
        const contents = await bytes(name), fingerprint = trackedHash(contents);
        if (contents === null || indexDigest(contents) !== hash || tracked.has(name) && tracked.get(name) !== fingerprint) throw new CliError('IMPACT_INPUT_CHANGED', `Implementation input changed during query: ${name}.`);
        tracked.set(name, fingerprint);
      }
      for (const binding of validated.bindings) {
        const target = binding.design, facts = view.facts.get(target.source);
        if (!facts) continue;
        // A stale locator does not erase the resolvable declared source/part scope.
        const part = target.part && facts.parts.includes(target.part) ? target.part : null;
        const boundFrames = (target.frames ?? binding.frames).filter(name => facts.frames.some(frame => frame.name === name));
        seed(view, 'mapping', target.source, { part, frames: boundFrames, pointer: binding.pointer, pathIndexes });
      }
    }

    const proofBeforeQuery = timings.proofMs;
    await timed('queryMs', async () => {
      if (query.kind === 'source') {
        for (const input of array(values.source)) {
          const source = await sourceInput(config, input, allSources); if (!query.sources.includes(source)) query.sources.push(source);
        }
        if (query.part && (query.sources.length !== 1 || !current.facts.get(query.sources[0])?.parts.includes(query.part))) throw new CliError('IMPACT_INPUT_NOT_FOUND', `Unknown design part ${query.part}; choose a registered export in one TSX source.`);
        for (const source of query.sources) { await track(path.join(config.root, source)); seed(current, query.part ? 'part' : 'source', source, { part: query.part }); }
      } else if (query.kind === 'token') {
        for (const token of query.tokens) {
          if (!current.tokens.some(item => item.name === token)) throw new CliError('IMPACT_INPUT_NOT_FOUND', `Unknown token ${token}; choose a name declared in tokens.css.`);
          seed(current, 'token', relative(config, path.join(config.design, 'tokens.css')), { token });
        }
      } else if (query.kind === 'file') {
        const selector = { [query.pathKind === 'directory' ? 'directory' : query.pathKind === 'glob' ? 'glob' : 'file']: query.normalized };
        const files = await implementationFiles(config, selector);
        const { mappingIndices } = implementationScope(current.map, query, fileInput.text, files, { includeStale: true });
        for (const file of files) { await track(path.join(config.root, file)); seed(current, 'implementation', file); }
        await mappings(current, mappingIndices);
        if (!mappingIndices.size) unresolved(query.normalized, 'mapping_unmatched');
      } else {
        const knownDependencies = new Set(views.flatMap(view => [...view.facts.values()].flatMap(facts => facts.dependencies)));
        const mapMatches = name => views.some(view => view.map.mappings.some(mapping => selectorMatches(mapping.implementation, name)));
        for (const change of inputs.changes) {
          const names = [change.before, change.after].filter(Boolean).map(name => slash(path.relative(inputs.projectPrefix || '.', name)));
          const is = predicate => names.some(predicate);
          let role;
          if (is(name => views.some(view => relative(view.config, path.join(view.config.design, 'tokens.css')) === name))) role = 'token';
          else if (is(name => views.some(view => view.map.source === name))) role = 'mapping';
          else if (is(name => views.some(view => view.configInputs.has(name)))) role = 'config';
          else if (is(name => /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/.test(name))) role = 'environment';
          else if (names.every(outside)) role = 'outside_design_inputs';
          else if (is(name => views.some(view => view.index.inventory.architecture.includes(name) || view.index.inventory.architecture.includes(name.replace(/\.md$/, '.mmd'))))) role = 'architecture';
          else if (is(name => knownDependencies.has(name) && name.endsWith('.css'))) role = 'global_css';
          else if (is(name => allSources.includes(name) || knownDependencies.has(name) || views.some(view => name.startsWith(relative(view.config, view.config.design) + '/')))) role = 'design';
          else if (is(name => mapMatches(name) || /\.(?:[cm]?[jt]sx?|css|vue|svelte|rs|go|py|swift|c|h|cpp)$/.test(name))) role = 'implementation';
          else if (is(name => /\.(?:md|txt|png|jpe?g|svg|webp)$/.test(name))) role = 'outside_design_inputs';
          else role = 'unknown';
          const pathIndex = data.changes.length; data.changes.push({ ...change, role });
          if (!inputs.after.revision) for (const name of [change.before, change.after].filter(Boolean)) await track(path.join(inputs.repository, name));
          for (const view of views) {
            const repositoryName = view.side === 'before' ? change.before : change.after ?? (['implementation', 'mapping'].includes(role) ? change.before : null);
            if (!repositoryName) continue;
            const name = slash(path.relative(inputs.projectPrefix || '.', repositoryName)), options = { pathIndexes: [pathIndex] };
            if (role === 'token') {
              const other = view === current ? previous : current;
              for (const item of view.tokens) {
                const selectedThemes = themes.filter(theme => item.values.find(value => value.theme === theme)?.declaration !== other.tokens.find(token => token.name === item.name)?.values.find(value => value.theme === theme)?.declaration);
                if (selectedThemes.length) seed(view, 'token', name, { ...options, token: item.name, selectedThemes });
              }
            } else if (role === 'mapping') {
              if (!current.map.present) { data.coverage.mapping = 'absent'; unresolved(current.map.source, 'mapping_absent'); }
              const otherMap = (view === current ? previous : current).map;
              const indices = new Set(view.map.mappings.flatMap((mapping, i) => otherMap.mappings.some(other => JSON.stringify(other) === JSON.stringify(mapping)) ? [] : [i]));
              await mappings(view, indices, [pathIndex]);
            } else if (role === 'implementation') {
              seed(view, 'implementation', name, options);
              const indices = new Set(view.map.mappings.flatMap((mapping, i) => names.some(candidate => selectorMatches(mapping.implementation, candidate)) ? [i] : []));
              await mappings(view, indices, [pathIndex]);
              if (!indices.size) unresolved(name, 'mapping_unmatched');
            } else if (role === 'architecture') seed(view, 'architecture', name.endsWith('.md') ? name.replace(/\.md$/, '.mmd') : name, options);
            else if (role !== 'outside_design_inputs') seed(view, role === 'design' ? 'source' : role, outside(name) ? null : name, options);
          }
        }
      }

      for (const row of rows) {
        const frame = { ref: { source: row.source, frame: row.frame }, status: row.status, matchKind: row.matchKind, matchCandidates: row.matchCandidates, themes: [] };
        for (const theme of themes) {
          const reasons = new Map();
          function add(seed, kind, scope, witness, count = 1) {
            const key = JSON.stringify([seed.fact.id, kind, scope]);
            let reason = reasons.get(key);
            if (!reason) { reason = { fact: seed.fact.id, class: kind, scope, sides: [], count: 0, ...(values.explain ? { witness } : {}) }; reasons.set(key, reason); }
            if (!reason.sides.includes(seed.view.side)) { reason.sides.push(seed.view.side); reason.count += count; }
          }
          for (const item of seeds) {
            if (!item.fact.themes.includes(theme)) continue;
            const facts = item.view.facts.get(row.source), declared = facts?.frames.find(frame => frame.name === row.frame);
            if (!declared) continue;
            const { kind, source, part, token } = item.fact;
            const witness = { origin: 'build', source, part, token, via: [], mappingPointer: item.pointer };
            if (['config', 'global_css', 'environment', 'unknown'].includes(kind)) { add(item, kind === 'unknown' ? 'unknown' : 'global', 'global', witness); continue; }
            if (kind === 'token') {
              const reach = facts.tokenDependencies?.find(value => value.frame === row.frame)?.themes.find(value => value.theme === theme);
              if (reach?.names.includes(token)) add(item, 'token_dependency', 'transitive', { ...witness, origin: 'lexical', via: reach.via[token] ?? [] });
              else if (facts.source.endsWith('.mmd')) add(item, 'dependency', 'transitive', witness);
              continue;
            }
            const direct = row.source === source;
            if (direct || facts.dependencies.includes(source)) {
              if (values.explain && !direct && !item.view.routes.has(source)) item.view.routes.set(source, new Map(relatedSources(item.view.graph, source, 'usedBy').map(value => [value.path, value.via])));
              const route = values.explain && !direct ? item.view.routes.get(source)?.get(row.source) ?? [] : [];
              add(item, 'dependency', direct ? 'direct' : 'transitive', { ...witness, via: route });
            }
            const occurrences = declared.parts.filter(owner => owner.source === source && (!part || owner.part === part));
            if (occurrences.length) add(item, 'part_occurrence', direct ? 'direct' : 'transitive', { ...witness, origin: 'emitted', part: occurrences[0].part }, occurrences.length);
            if (kind === 'mapping' && direct && item.frames.includes(row.frame)) add(item, 'mapping', 'declared', { ...witness, origin: 'declaration' });
          }
          if (inputs && ['added', 'removed'].includes(row.status)) {
            const view = row.status === 'added' ? current : previous;
            let lifecycle = seeds.find(seed => seed.view === view && seed.fact.source === row.source);
            if (!lifecycle) { seed(view, row.source.endsWith('.mmd') ? 'architecture' : 'source', row.source); lifecycle = seeds.at(-1); }
            add(lifecycle, 'lifecycle', 'direct', { origin: 'build', source: row.source, part: null, token: null, via: [], mappingPointer: null });
          }
          if (inputs && requiredParents.has(JSON.stringify([row.source, row.frame]))) {
            const child = rows.find(child => child.status === 'added' && child.after.parent?.source === row.source && child.after.parent.frame === row.frame);
            let support = seeds.find(seed => seed.view === current && seed.fact.source === child.source);
            if (!support) { seed(current, 'source', child.source); support = seeds.at(-1); }
            add(support, 'dependency', 'support', { origin: 'build', source: child.source, part: null, token: null, via: [], mappingPointer: null });
          }
          const ordered = [...reasons.values()].sort((a, b) => compare(a.fact, b.fact) || compare(a.class, b.class) || compare(a.scope, b.scope));
          if (reasons.size) {
            data.coverage.candidateRows++;
            if (ordered.some(reason => reason.scope === 'direct')) data.coverage.directRows++;
            if (ordered.some(reason => reason.scope === 'transitive')) data.coverage.transitiveRows++;
          }
          const result = { theme, candidate: !!reasons.size, disposition: 'render', reasons: ordered, proof: null, unassessedReasons: [] };
          if (inputs) await timed('proofMs', async () => {
            if (row.status !== 'matched' || row.matchKind !== 'exact') result.unassessedReasons = ['missing_side'];
            else if (row.source.endsWith('.mmd')) {
              const before = architectureProjection(previous.architecture.get(row.source)), after = architectureProjection(current.architecture.get(row.source));
              result.proof = equalProof(before, after, 'architecture_inputs_equal', 'full_sheet', values.explain);
            } else {
              const builtBefore = previous.built.get(row.source), builtAfter = current.built.get(row.source);
              const before = builtBefore.frames.find(frame => frame.name === row.frame), after = builtAfter.frames.find(frame => frame.name === row.frame);
              result.unassessedReasons = [...new Set([...eligible(builtBefore, before, theme), ...eligible(builtAfter, after, theme)])].sort(compare);
              if (!result.unassessedReasons.length) {
                const reach = (view, frame) => view.facts.get(row.source).tokenDependencies.find(item => item.frame === frame.name).themes.find(item => item.theme === theme);
                const left = projection(previous, builtBefore, before, theme, reach(previous, before));
                const right = projection(current, builtAfter, after, theme, reach(current, after));
                result.proof = equalEntryProof(left, right, values.explain);
              }
            }
            if (result.proof && !requiredParents.has(JSON.stringify([row.source, row.frame]))) result.disposition = 'proven_unaffected';
            else result.proof = null;
          });
          if (inputs) {
            if (result.disposition === 'proven_unaffected') data.coverage.provenRows++;
            else data.coverage.renderRows++;
          } else if (reasons.size) data.coverage.renderRows++;
          else { result.disposition = 'unassessed'; data.coverage.unassessedRows++; }
          assessments.set(JSON.stringify([row.source, row.frame, theme]), result);
          if (result.candidate || result.disposition === 'render') frame.themes.push(result);
        }
        if (frame.themes.length) data.frames.push(frame);
      }
    });
    timings.queryMs = Math.max(0, timings.queryMs - (timings.proofMs - proofBeforeQuery));
    data.coverage.inventory = 'complete';
    if (data.unresolvedInputs.length || data.mappingFindings.length) warn('IMPACT_MAPPING_INCOMPLETE', 'Some implementation mappings are absent, unmatched or stale; inspect the resolvable targets and findings.', checkNext('Repair implementation.json and its reported locators before repeating the query.'));
    if (!data.frames.length) {
      const observed = query.kind === 'token' ? { token: query.tokens[0], theme: values.theme } : query.kind === 'file' ? { file: query.input, theme: values.theme } : null;
      warn(query.kind === 'git' ? 'IMPACT_NO_CHANGES' : 'IMPACT_NO_MATCH', 'No frame candidates matched the changed design facts.',
        query.kind === 'git' ? [] : observed ? nextActions('OWNER_UNSETTLED', { command: 'owner', values: observed }) : checkNext('Inspect design inputs and emitted part coverage.'));
    }

    if (consume) await consume({ views, rows, assessments, inputs, data });
  } catch (cause) {
    if (inputs) { try { await verifyGeneration(); } catch (changed) { cause = changed; } }
    if (cause.code === 'OWNER_INDEX_CHANGED') cause = new CliError('IMPACT_INPUT_CHANGED', cause.message, { cause });
    if (inputs) { cause.message = inputs.translate(cause.message); if (cause.context) cause.context = inputs.translate(cause.context); }
    primary = data ? commandFailure(cause, data, warnings) : cause;
  } finally {
    for (const view of [...views].reverse()) {
      try { await cleanup(() => view.index.close(), primary); } catch (cause) { primary = data ? commandFailure(cause, data, warnings) : cause; }
    }
    if (!primary) {
      try { await verifyGeneration(); data.coverage.proofComplete = !!inputs; }
      catch (cause) {
        if (cause.code === 'OWNER_INDEX_CHANGED') cause = new CliError('IMPACT_INPUT_CHANGED', cause.message, { cause });
        if (inputs) cause.message = inputs.translate(cause.message);
        primary = data ? commandFailure(cause, data, warnings) : cause;
      }
    }
    try { await cleanup(() => inputs?.close(), primary); } catch (cause) { primary = data ? commandFailure(cause, data, warnings) : cause; }
  }

  timings.totalMs = performance.now() - started;
  if (primary && data) {
    data.coverage.proofComplete = false;
    data.coverage.unassessedRows += data.coverage.provenRows; data.coverage.provenRows = 0;
    for (const frame of data.frames) for (const row of frame.themes) if (row.proof) {
      row.proof = null; row.disposition = 'unassessed'; row.unassessedReasons = ['incomplete_identity'];
    }
  }
  if (data) data.frames = groupImpactFrames(data.frames, { explain: !!values.explain });
  if (primary) throw primary;
  data.complete = true;
  if (!values.json) {
    log(`${impactFrameCount(data.frames)} listed frames; ${data.coverage.candidateRows} theme rows; ${data.coverage.unassessedRows} unassessed. ${data.coverage.provenRows} proven.`);
    for (const group of data.frames) log(`${group.source}#${group.frames.join(', ')} [${group.rows.flatMap(row => row.themes).join(',')}] ${[...new Set(group.rows.flatMap(row => (row.reasons ?? []).map(reason => reason.class)))].join(', ')}`);
    for (const warning of warnings) log(`${warning.code}: ${warning.message}`);
  }
  return { data, warnings };
}
