import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError, nextActions } from '../cli-output.mjs';
import { openProjectIndex } from './project-index.mjs';
import { loadImplementationMap } from './implementation-map.mjs';
import { observeOwnerFrame, observeOwnerPalette, occurrenceContext, normalizeOwnerText, observationEnvironment } from './owner-observation.mjs';
import { installColorResolver, resolveQueryColor, colorHex } from './owner-colors.mjs';
import { launch, browserTask } from './browser.mjs';
import { commandFailure, cleanup } from './results.mjs';
import { compareNames, compareRanks } from './owner.mjs';

function queryFor(values) {
  const kinds = ['text', 'color', 'token'].filter(kind => values[kind] !== undefined);
  if (kinds.length !== 1 || typeof values[kinds[0]] !== 'string' || !values[kinds[0]].trim()) throw new CliError('USAGE_INVALID', 'Choose one nonempty --text, --color or --token query.');
  const kind = kinds[0], input = values[kind]; let locale = null;
  if (values.locale !== undefined) {
    try { locale = Intl.getCanonicalLocales(values.locale)[0]; if (!locale) throw Error(); }
    catch { throw new CliError('USAGE_INVALID', '--locale requires a BCP 47 language tag.'); }
  }
  if (kind === 'token' && !/^--[\w-]+$/.test(input)) throw new CliError('USAGE_INVALID', 'Use an exact custom-property name such as --accent.');
  if (values.theme !== undefined && !['both', 'light', 'dark'].includes(values.theme)) throw new CliError('USAGE_INVALID', 'Use --theme=both, light or dark.');
  return { kind, input, normalized: kind === 'text' ? normalizeOwnerText(input) : input, pathKind: null, line: null, symbol: null, contains: !!values.contains, locale,
    themes: !values.theme || values.theme === 'both' ? ['light', 'dark'] : [values.theme], rgba: null };
}

export async function searchOwner(config, values, { log = console.log, openIndex = openProjectIndex, launchBrowser = launch, environment = observationEnvironment } = {}) {
  const query = queryFor(values);
  if (!query.normalized) throw new CliError('USAGE_INVALID', 'Text must contain a non-whitespace character.');
  const data = { project: config.root, complete: false, query, region: null, owners: [], tokens: [], ambiguous: false, tokenAmbiguous: false, matchedImplementationFiles: [], mappingFindings: [],
    coverage: { discoveredSources: 0, builtSources: 0, requestedObservations: 0, completedObservations: 0, mappingState: 'absent', activeBindings: 0, excludedBindings: 0, domain: 'tsx' } };
  const warnings = [], codes = new Set(), rows = new Map(), tokenResults = new Map(), frameOrder = new Map();
  let index, browser, page, primary;
  const warn = (code, message, retry = false) => {
    if (codes.has(code)) return; codes.add(code);
    warnings.push({ code, message, next: retry ? nextActions('OWNER_UNSETTLED', { command: 'owner', values }).map(action => ({ ...action, reason: message })) : [{ argv: ['adg','check','--read-only','--json'], reason: message }] });
  };
  const getPage = async () => { browser ??= await launchBrowser(); page ??= await browserTask(browser, () => browser.newPage({ locale: 'en-US', timezoneId: 'UTC' })); return page; };
  try {
    index = await openIndex(config, { stateDirectory: values['state-dir'] }); data.coverage.discoveredSources = index.inventory.tsx.length;
    const mapping = await loadImplementationMap(config); data.coverage.mappingState = mapping.present ? 'valid' : 'absent';
    const definitions = index.tokens(), byName = new Map(definitions.map(token => [token.name, token]));
    const unknown = query.kind === 'token' && !byName.has(query.normalized);
    const env = unknown ? null : await environment(), palettes = new Map();
    const source = unknown ? '' : await readFile(path.join(config.design, 'tokens.css'), 'utf8');
    async function palette(theme) {
      if (!palettes.has(theme)) {
        const values = await observeOwnerPalette(index, definitions, theme, env, getPage, source);
        palettes.set(theme, new Map(values.map(value => [value.name, value])));
        const unresolved = values.filter(value => value.resolved === null).map(value => value.name);
        if (unresolved.length) warn('OWNER_TOKEN_UNRESOLVED', `Repair unresolved ${theme} tokens: ${unresolved.join(', ')}.`);
      }
      return palettes.get(theme);
    }
    if (query.kind === 'color') {
      query.rgba = await resolveQueryColor(query.input, async input => index.color(input, env, async () => {
        const page = await getPage();
        return browserTask(browser, async () => { await page.setContent('<!doctype html><html><body></body></html>'); await page.evaluate(installColorResolver); return page.evaluate(value => globalThis.__adgOwnerColor(value), input); });
      }));
      query.normalized = colorHex(query.rgba);
    }
    const projectOwners = owners => owners.map(owner => ({ source: path.posix.join(path.relative(config.root, config.design).split(path.sep).join('/'), owner.source), part: owner.export }));
    function via(name, theme, seen = new Set([name])) {
      const names = [];
      for (const ref of byName.get(name)?.values.find(v => v.theme === theme)?.references ?? []) if (!seen.has(ref)) { seen.add(ref); names.push(ref, ...via(ref, theme, seen)); }
      return names;
    }
    async function addToken(name, theme, kind = 'token_name') {
      const token = byName.get(name), observed = (await palette(theme)).get(name);
      if (!token || !observed) return;
      if (!tokenResults.has(name)) tokenResults.set(name, { name, source: token.source, matchKind: kind, values: [], evidence: [] });
      const row = tokenResults.get(name); if (row.values.some(v => v.theme === theme)) return;
      const value = token.values.find(v => v.theme === theme), aliases = via(name, theme);
      row.values.push({ theme, declaration: value.declaration, line: value.line, inherited: value.inherited, resolved: observed.resolved, rgba: observed.rgba, via: aliases });
      row.evidence.push({ matchKind: kind, frame: null, theme, elementPath: null, boxes: [], owners: [], detail: { kind: 'token', token: name, declaration: value.declaration, resolved: observed.resolved, via: aliases, source: token.source, line: value.line, inherited: value.inherited } });
      if (observed.resolved === null) warn('OWNER_TOKEN_UNRESOLVED', `Repair unresolved token ${name} in its reported theme, then validate tokens.css.`);
    }
    if (!unknown && query.kind !== 'text') for (const theme of query.themes) {
      if (query.kind === 'token') await addToken(query.normalized, theme);
      else for (const token of definitions) if (JSON.stringify((await palette(theme)).get(token.name)?.rgba) === JSON.stringify(query.rgba)) await addToken(token.name, theme, 'token_value');
    }
    if (!unknown) for (const source of index.inventory.tsx) {
      const built = await index.getBuild(source); frameOrder.set(source, built.frames.map(frame => frame.name));
      for (const frame of built.frames) {
        if (query.locale !== null && frame.locale !== query.locale) continue;
        data.coverage.requestedObservations += query.themes.length;
        for (const theme of query.themes) {
          const observation = await observeOwnerFrame(index, source, built, frame, theme, env, getPage, definitions), ref = { source, frame: frame.name };
          const matches = query.kind === 'text' ? (observation.texts ?? []).filter(run => run.normalized === query.normalized || query.contains && run.normalized.includes(query.normalized))
            : query.kind === 'color' ? (observation.paints ?? []).filter(paint => JSON.stringify(paint.rgba) === JSON.stringify(query.rgba))
            : observation.references.filter(reference => reference.token === query.normalized);
          for (const match of matches) {
            const ctx = occurrenceContext(observation, match), owners = projectOwners(ctx.owners), owning = owners.length ? owners : [{ source, part: null }];
            const kind = query.kind === 'text' ? match.normalized === query.normalized ? 'text_exact' : 'text_contains' : query.kind === 'color' ? 'color_value' : match.matchKind;
            const rank = query.kind === 'text' ? [kind === 'text_exact' ? 0 : 1, [...match.normalized].length - [...query.normalized].length, ctx.distance]
              : query.kind === 'color' ? [0, ctx.distance] : [kind === 'token_reference' ? 0 : kind === 'token_alias_reference' ? 1 : 2, match.via.length, ctx.distance];
            const detail = query.kind === 'text' ? { kind: 'text', raw: match.raw, normalized: match.normalized, fragments: match.fragments }
              : query.kind === 'color' ? { kind: 'paint', property: match.property, computed: match.computed, rgba: match.rgba, usage: 'computed_value' }
              : { kind: 'reference', token: match.token, property: match.property, declaration: match.declaration, via: match.via, usage: 'authored_reference' };
            const evidence = { matchKind: kind, frame: ref, theme, elementPath: match.path, boxes: query.kind === 'text' ? match.fragments.flatMap(f => f.boxes) : ctx.box ? [ctx.box] : [], owners, detail };
            const scope = new Set(ctx.ancestors);
            for (const fragment of match.fragments ?? []) for (const ancestor of occurrenceContext(observation, { path: fragment.elementPath }).ancestors) scope.add(ancestor);
            const references = query.kind === 'token' ? [match] : observation.references.filter(reference => scope.has(reference.path));
            for (const target of owning) {
              const key = JSON.stringify([target.source, target.part]);
              if (!rows.has(key)) rows.set(key, { source: target.source, part: target.part, matchKind: kind, rank, frames: [], tokens: [], evidence: [] });
              const row = rows.get(key); if (compareRanks(rank, row.rank) < 0) { row.rank = rank; row.matchKind = kind; }
              if (!row.frames.some(f => f.source === source && f.frame === frame.name && f.theme === theme)) row.frames.push({ ...ref, theme, locale: frame.locale ?? null });
              row.evidence.push(evidence);
              for (const reference of references) {
                if (!row.tokens.includes(reference.token)) row.tokens.push(reference.token);
                if (query.kind === 'text') await addToken(reference.token, theme);
                const context = occurrenceContext(observation, reference);
                if (query.kind !== 'token') row.evidence.push({ matchKind: reference.matchKind, frame: ref, theme, elementPath: reference.path, boxes: context.box ? [context.box] : [], owners: projectOwners(context.owners), detail: { kind: 'reference', token: reference.token, property: reference.property, declaration: reference.declaration, via: reference.via, usage: 'authored_reference' } });
              }
            }
          }
          data.coverage.completedObservations++; data.owners = [...rows.values()]; data.tokens = [...tokenResults.values()];
        }
      }
    }
    await index.verifyInputs();
    data.owners = [...rows.values()]; data.tokens = [...tokenResults.values()];
  } catch (cause) { primary = commandFailure(cause, data, warnings); }
  if (index) { try { data.coverage.builtSources = (await index.stats()).requestedSources?.length ?? 0; } catch (cause) { if (!primary) primary = commandFailure(cause, data, warnings); } }
  for (const close of [() => page?.close(), () => browser?.close(), () => index?.close()]) { try { await cleanup(close, primary); } catch (cause) { primary = commandFailure(cause, data, warnings); } }
  if (primary) throw primary;
  data.owners.sort((a, b) => compareRanks(a.rank, b.rank) || compareNames(a.source, b.source) || compareNames(a.part, b.part));
  const order = (a, b) => compareNames(a.source, b.source) || (frameOrder.get(a.source)?.indexOf(a.frame) ?? -1) - (frameOrder.get(b.source)?.indexOf(b.frame) ?? -1) || query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme);
  for (const row of data.owners) {
    row.frames.sort(order); row.tokens.sort(compareNames);
    row.evidence = [...new Map(row.evidence.map(e => [JSON.stringify(e), e])).values()].sort((a, b) => order({ ...a.frame, theme: a.theme }, { ...b.frame, theme: b.theme }) || compareNames(a.elementPath, b.elementPath) || compareNames(a.matchKind, b.matchKind));
  }
  data.tokens.sort((a, b) => compareNames(a.name, b.name));
  for (const token of data.tokens) { token.values.sort((a, b) => query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme)); token.evidence.sort((a, b) => query.themes.indexOf(a.theme) - query.themes.indexOf(b.theme)); }
  data.ambiguous = data.owners.length > 1 && compareRanks(data.owners[0].rank, data.owners[1].rank) === 0;
  data.tokenAmbiguous = query.kind === 'color' && data.tokens.length > 1;
  if (data.ambiguous || data.tokenAmbiguous) warn('OWNER_AMBIGUOUS', 'Several owner or token identities share this match; inspect their explicit evidence before choosing one.', true);
  if (!data.owners.length && !data.tokens.length) warn('OWNER_NO_MATCH', 'No ownership evidence matched; inspect authored text or token declarations.');
  if (!data.coverage.requestedObservations && query.kind !== 'token') warnings.push({ code: 'EMPTY_SELECTION', message: 'No TSX frames matched the query locale/domain.', next: [] });
  data.complete = true;
  if (!values.json) {
    if (!data.owners.length && !data.tokens.length) log('No ownership evidence matched.');
    for (const row of data.owners) log(`${row.source}${row.part ? '#' + row.part : ''} [${row.matchKind}] ${row.frames.length} frame/theme observations`);
    for (const token of data.tokens) log(`${token.source}#${token.name} ${token.values.map(value => `${value.theme}: ${value.rgba ? colorHex(value.rgba) : value.resolved ?? 'unresolved'}`).join(', ')}`);
    for (const warning of warnings) log(`${warning.code}: ${warning.message}`);
  }
  return { data, warnings };
}
