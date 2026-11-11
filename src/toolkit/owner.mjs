import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError, nextActions } from '../cli-output.mjs';
import { openProjectIndex } from './project-index.mjs';
import { loadImplementationMap, implementationFiles } from './implementation-map.mjs';
import { portablePath, selectorMatches, resolveLocator, symbolRegions, regionAt, sourceLineCount } from './owner-locators.mjs';
import { launch, loadFrame, readyResources, browserTask } from './browser.mjs';
import { observeOwnerFrame, observeOwnerPalette, occurrenceContext, observationEnvironment } from './owner-observation.mjs';
import { commandFailure, cleanup } from './results.mjs';
import { escape } from './runtime.mjs';
import { indexDigest } from './index-store.mjs';

export const compareRanks = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0); return 0; };
export const compareNames = (a, b) => { const x = [...(a ?? '')], y = [...(b ?? '')]; for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i].codePointAt(0) - y[i].codePointAt(0); return x.length - y.length; };
export function fileRank(selector, locator = null) {
  const rank = locator === 'mapping_symbol' ? 0 : locator === 'mapping_symbol_region' ? 1 : 2;
  if (selector.file) return [0, 0, 0, 0, rank];
  if (selector.directory) return [1, -selector.directory.split('/').filter(Boolean).length, 0, 0, rank];
  const prefix = selector.glob.search(/[?*]/);
  return [2, -(prefix < 0 ? selector.glob.length : prefix), selector.glob.split('/').filter(segment => /[?*]/.test(segment)).length, -selector.glob.replace(/[?*]/g, '').length, rank];
}

async function normalizeFileQuery(config, values) {
  const root = await realpath(config.root), input = values.file;
  if (typeof input !== 'string' || !input.trim()) throw new CliError('USAGE_INVALID', 'Set one nonempty --file input.');
  let absolute = path.resolve(root, input);
  if (path.isAbsolute(input) && !/[?*]/.test(input)) {
    try { absolute = await realpath(input); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; throw new CliError('OWNER_INPUT_NOT_FOUND', 'Ownership input does not name an existing file or directory.'); }
  }
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new CliError('USAGE_INVALID', 'Ownership input must stay inside the project root.');
  let pathKind, normalized = relative;
  if (/[?*]/.test(relative)) {
    if (!portablePath(relative, { glob: true })) throw new CliError('USAGE_INVALID', 'Use a POSIX glob with *, ? and whole-segment **.');
    pathKind = 'glob';
  } else {
    let info;
    try { info = await stat(absolute); } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; throw new CliError('OWNER_INPUT_NOT_FOUND', 'Ownership input does not name an existing file or directory.'); }
    const physical = path.relative(root, await realpath(absolute));
    if (physical === '..' || physical.startsWith('..' + path.sep) || path.isAbsolute(physical)) throw new CliError('USAGE_INVALID', 'Ownership input resolves outside the project root.');
    if (!info.isFile() && !info.isDirectory()) throw new CliError('USAGE_INVALID', 'Choose a regular implementation file or directory.');
    pathKind = info.isDirectory() ? 'directory' : 'file';
    if (pathKind === 'directory') normalized = relative ? relative + '/' : './';
  }
  const line = values.line === undefined ? null : Number(values.line), symbol = values.symbol ?? null;
  if ((line !== null || symbol !== null) && pathKind !== 'file') throw new CliError('USAGE_INVALID', '--line and --symbol require a single file.');
  const text = line !== null || symbol !== null ? await readFile(absolute, 'utf8') : null;
  if (line !== null && (!Number.isSafeInteger(line) || line < 1 || line > sourceLineCount(text))) throw new CliError('USAGE_INVALID', '--line must name an existing 1-based line in the implementation file.');
  if (values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme)) throw new CliError('USAGE_INVALID', 'Use --theme=both, light or dark.');
  return { query: { kind: 'file', input, normalized, pathKind, line, symbol, contains: false, locale: null, themes: !values.theme || values.theme === 'both' ? ['light', 'dark'] : [values.theme], rgba: null }, text };
}

function bindingKind(selector, query) {
  return selector.symbol && query.symbol && query.line === null ? 'mapping_symbol' : selector.symbol && query.line !== null ? 'mapping_symbol_region'
    : selector.file ? 'mapping_file' : selector.directory ? 'mapping_directory' : 'mapping_glob';
}

export async function owner(config, values, { log = console.log, openIndex = openProjectIndex, launchBrowser = launch, environment = observationEnvironment } = {}) {
  if (values.file === undefined) return (await import('./owner-search.mjs')).searchOwner(config, values, { log, openIndex, launchBrowser, environment });
  const { query, text } = await normalizeFileQuery(config, values);
  const data = { project: config.root, complete: false, query, region: null, owners: [], tokens: [], ambiguous: false, tokenAmbiguous: false, matchedImplementationFiles: [], mappingFindings: [],
    coverage: { discoveredSources: 0, builtSources: 0, requestedObservations: 0, completedObservations: 0, mappingState: 'absent', activeBindings: 0, excludedBindings: 0, domain: 'tsx' } };
  const warnings = [], context = { command: 'owner', values }, warned = new Set();
  const warn = (code, message, retry = false) => {
    if (warned.has(code)) return; warned.add(code);
    warnings.push({ code, message, next: retry ? nextActions('OWNER_UNSETTLED', context).map(action => ({ ...action, reason: message })) : [{ argv: ['adg', 'check', '--read-only', '--json'], reason: message }] });
  };
  let index, browser, page, primary;
  const rows = new Map(), tokenResults = new Map(), frameOrder = new Map();
  try {
    const selector = { [query.pathKind === 'directory' ? 'directory' : query.pathKind === 'glob' ? 'glob' : 'file']: query.normalized };
    const files = await implementationFiles(config, selector); data.matchedImplementationFiles = files;
    const map = await loadImplementationMap(config);
    data.coverage.mappingState = map.present ? 'valid' : 'absent';
    index = await openIndex(config, { stateDirectory: values['state-dir'] }); data.coverage.discoveredSources = index.inventory.tsx.length;
    const mapSelectors = map.mappings.map(mapping => mapping.implementation).filter(s => s.file === query.normalized && s.symbol);
    const queryRegion = text === null ? null : regionAt(symbolRegions(text, query.normalized, mapSelectors), query.line ?? 1);
    if (query.line !== null && queryRegion) data.region = { boundaryLine: queryRegion.line, symbol: queryRegion.symbol, mapped: queryRegion.mapped.length > 0, nextBoundaryLine: queryRegion.nextBoundaryLine };
    const mappingIndices = new Set();
    map.mappings.forEach((mapping, i) => {
      const s = mapping.implementation;
      if (!files.some(file => selectorMatches(s, file))) return;
      if (s.symbol && query.symbol !== null && s.symbol !== query.symbol) return;
      if (s.symbol && query.line !== null && (queryRegion?.line !== resolveLocator(text, s).line || !queryRegion?.mapped.includes(s.symbol))) return;
      mappingIndices.add(i);
    });
    const validated = await index.mappings({ map, mappingIndices, implementationSelection: files, onFinding: finding => { data.mappingFindings.push(finding); data.coverage.mappingState = 'stale'; } });
    data.mappingFindings = validated.findings;
    data.coverage.mappingState = !map.present ? 'absent' : validated.findings.length ? 'stale' : 'valid';
    const active = validated.bindings.filter(binding => binding.active);
    data.coverage.activeBindings = active.length; data.coverage.excludedBindings = validated.bindings.length - active.length;
    if (!map.present) warn('OWNER_MAPPING_MISSING', 'Add implementation.json to declare implementation ownership, then validate it.');
    if (validated.findings.length) warn('OWNER_MAPPING_STALE', 'Repair the reported implementation mapping findings, then repeat the query.');
    if ((query.line !== null || query.symbol !== null) && !active.some(binding => binding.implementation.symbol)) warn('OWNER_LOCATOR_UNMAPPED', 'Add or refine a symbol/anchor binding for this implementation region, then repeat the query.', true);
    const tasks = new Map();
    for (const binding of active) {
      const target = binding.design, key = JSON.stringify([target.source, target.part ?? null]), kind = bindingKind(binding.implementation, query), rank = fileRank(binding.implementation, kind);
      if (!rows.has(key)) rows.set(key, { source: target.source, part: target.part ?? null, matchKind: kind, rank, frames: [], tokens: [], evidence: [] });
      const row = rows.get(key); if (compareRanks(rank, row.rank) < 0) { row.rank = rank; row.matchKind = kind; }
      if (target.part && !binding.frames.length) warn('OWNER_PART_UNOBSERVED', 'The declared part has no rendered specimen in its owning source; add coverage when needed.');
      if (!binding.frames.length) addMapping(row, binding, null, null, []);
      for (const frame of binding.frames) for (const theme of query.themes) {
        const identity = JSON.stringify([target.source, frame, theme]);
        if (!tasks.has(identity)) tasks.set(identity, { source: target.source, frame, theme, bindings: [] });
        tasks.get(identity).bindings.push({ row, binding });
      }
    }
    function projectOwners(owners) { return owners.map(item => ({ source: path.posix.join(path.relative(config.root, config.design).split(path.sep).join('/'), item.source), part: item.export })); }
    function addMapping(row, binding, ref, theme, roots) {
      const kind = bindingKind(binding.implementation, query);
      for (const implementation of binding.files) {
        const boundary = binding.anchorLine === null ? null : regionAt(validated.regions[implementation] ?? [], binding.anchorLine);
        const matches = roots.length ? roots : [null];
        for (const node of matches) row.evidence.push({ matchKind: kind, frame: ref, theme, elementPath: node?.path ?? null, boxes: node ? [node.box] : [], owners: node ? projectOwners(node.owners) : [],
          detail: { kind: 'mapping', file: map.source, pointer: binding.pointer, implementation, selector: binding.implementation, locatorMatched: query.line === null && query.symbol === null ? null : !!binding.implementation.symbol,
            anchorLine: binding.anchorLine, nextBoundaryLine: boundary?.nextBoundaryLine ?? null } });
      }
    }
    const definitions = tasks.size ? index.tokens() : [], byName = new Map(definitions.map(token => [token.name, token]));
    data.coverage.requestedObservations = tasks.size;
    const env = tasks.size ? await environment() : null;
    const getPage = async () => { browser ??= await launchBrowser(); page ??= await browserTask(browser, () => browser.newPage({ locale: 'en-US', timezoneId: 'UTC' })); return page; };
    const palettes = new Map(), tokenSource = tasks.size ? await readFile(path.join(config.design, 'tokens.css'), 'utf8') : '';
    function tokenVia(name, theme, seen = new Set([name])) {
      const result = [];
      for (const ref of byName.get(name)?.values.find(value => value.theme === theme)?.references ?? []) if (!seen.has(ref)) { seen.add(ref); result.push(ref, ...tokenVia(ref, theme, seen)); }
      return result;
    }
    for (const task of tasks.values()) {
      const built = await index.getBuild(task.source), frame = built.frames.find(frame => frame.name === task.frame);
      frameOrder.set(task.source, built.frames.map(frame => frame.name));
      const observation = await observeOwnerFrame(index, task.source, built, frame, task.theme, env, getPage, definitions);
      if (!palettes.has(task.theme)) palettes.set(task.theme, await observeOwnerPalette(index, definitions, task.theme, env, getPage, tokenSource));
      const ref = { source: task.source, frame: task.frame }, palette = new Map(palettes.get(task.theme).map(value => [value.name, value]));
      for (const { row, binding } of task.bindings) {
        const roots = binding.design.part ? observation.nodes.filter(node => node.box && node.owners.some(owner => projectOwners([owner]).some(part => part.source === row.source && part.part === row.part))) : observation.nodes.filter(node => node.path === '0' && node.box);
        if (row.part && !roots.length) warn('OWNER_PART_UNOBSERVED', 'The declared part has no painted occurrence in a bound frame; inspect its authored coverage.');
        if (!row.frames.some(frame => frame.source === ref.source && frame.frame === ref.frame && frame.theme === task.theme)) row.frames.push({ ...ref, theme: task.theme, locale: frame.locale ?? null });
        addMapping(row, binding, ref, task.theme, roots);
        for (const rawReference of observation.references) {
          const reference = occurrenceContext(observation, rawReference);
          if (row.part && !roots.some(root => reference.ancestors.includes(root.path))) continue;
          if (!row.tokens.includes(reference.token)) row.tokens.push(reference.token);
          const token = byName.get(reference.token), value = token?.values.find(value => value.theme === task.theme), observed = palette.get(reference.token);
          if (!value || !observed) continue;
          if (!tokenResults.has(token.name)) tokenResults.set(token.name, { name: token.name, source: token.source, matchKind: 'token_name', values: [], evidence: [] });
          const result = tokenResults.get(token.name);
          if (!result.values.some(value => value.theme === task.theme)) {
            const via = tokenVia(token.name, task.theme);
            result.values.push({ theme: task.theme, declaration: value.declaration, line: value.line, inherited: value.inherited, resolved: observed.resolved, rgba: observed.rgba, via });
            result.evidence.push({ matchKind: 'token_name', frame: null, theme: task.theme, elementPath: null, boxes: [], owners: [], detail: { kind: 'token', token: token.name, declaration: value.declaration, resolved: observed.resolved, via, source: token.source, line: value.line, inherited: value.inherited } });
            if (observed.resolved === null) warn('OWNER_TOKEN_UNRESOLVED', `Repair unresolved token ${token.name} in its reported theme, then validate the token sheet.`);
          }
        }
      }
      data.coverage.completedObservations++;
      data.owners = [...rows.values()]; data.tokens = [...tokenResults.values()];
    }
    await index.verifyInputs();
    const inputs = { ...validated.implementationHashes, ...(text !== null ? { [query.normalized]: indexDigest(text) } : {}) };
    for (const [file, expected] of Object.entries(inputs)) if (indexDigest(await readFile(path.join(config.root, file))) !== expected) throw new CliError('OWNER_INDEX_CHANGED', `Implementation locator changed during query: ${file}.`);
    let mapHash = null;
    try { mapHash = indexDigest(await readFile(map.file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (mapHash !== (map.inputHash ?? null)) throw new CliError('OWNER_INDEX_CHANGED', 'Implementation mappings changed during the query.');
    data.owners = [...rows.values()]; data.tokens = [...tokenResults.values()];
  } catch (cause) { primary = commandFailure(cause, data, warnings); }
  if (index) {
    try { const stats = await index.stats(); data.coverage.builtSources = stats.requestedSources?.length ?? 0; }
    catch (cause) { if (!primary) primary = commandFailure(cause, data, warnings); }
  }
  for (const close of [() => page?.close(), () => browser?.close(), () => index?.close()]) {
    try { await cleanup(close, primary); } catch (cause) { primary = commandFailure(cause, data, warnings); }
  }
  if (primary) throw primary;
  data.owners.sort((a, b) => compareRanks(a.rank, b.rank) || compareNames(a.source, b.source) || compareNames(a.part, b.part));
  for (const row of data.owners) {
    const order = (a, b) => compareNames(a.source, b.source) || (frameOrder.get(a.source)?.indexOf(a.frame) ?? -1) - (frameOrder.get(b.source)?.indexOf(b.frame) ?? -1) || query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme);
    row.frames.sort(order);
    row.evidence.sort((a, b) => order(a.frame ? { ...a.frame, theme: a.theme } : { source: '', frame: '', theme: null }, b.frame ? { ...b.frame, theme: b.theme } : { source: '', frame: '', theme: null }) || Number(a.elementPath ?? -1) - Number(b.elementPath ?? -1) || compareNames(a.detail.kind, b.detail.kind) || compareNames(JSON.stringify(a.detail), JSON.stringify(b.detail)));
    row.tokens.sort(compareNames); row.evidence = [...new Map(row.evidence.map(evidence => [JSON.stringify(evidence), evidence])).values()];
  }
  for (const token of data.tokens) { token.values.sort((a, b) => query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme)); token.evidence.sort((a, b) => query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme)); }
  data.tokens.sort((a, b) => compareNames(a.name, b.name));
  data.ambiguous = data.owners.length > 1 && compareRanks(data.owners[0].rank, data.owners[1].rank) === 0;
  if (data.ambiguous) warn('OWNER_AMBIGUOUS', 'Several owners share the best rank; narrow the file locator, text or theme before choosing an owner.', true);
  if (!data.owners.length && !data.tokens.length) warn('OWNER_NO_MATCH', 'No ownership evidence matched. Validate current sources and add or refine an implementation mapping.');
  if (!data.coverage.discoveredSources) warnings.push({ code: 'EMPTY_SELECTION', message: 'No TSX design sources were discovered.', next: [] });
  data.complete = true;
  if (!values.json) {
    if (!data.owners.length) log('No ownership evidence matched.');
    if (data.ambiguous) log('Multiple owners share the best rank.');
    for (const row of data.owners) log(`${row.source}${row.part ? `#${row.part}` : ''} [${row.matchKind}] ${[...new Set(row.frames.map(frame => frame.frame))].join(', ')}${row.tokens.length ? `; tokens: ${row.tokens.join(', ')}` : ''}`);
    for (const warning of warnings) log(`${warning.code}: ${warning.message}`);
  }
  return { data, warnings };
}
