import { CliError } from '../cli-output.mjs';
import { impact } from './impact.mjs';
import { selectedSources } from './diff-inputs.mjs';
import { groupImpactFrames } from './impact-output.mjs';
import { commandFailure } from './results.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const impactRowKey = (row, theme) => JSON.stringify([row.source, row.frame, theme]);

/** Keep fresh proofs, captures and final generation validation in one owned operation. */
export async function withImpacted(config, args, options, command, work) {
  if (typeof options.base !== 'string' || !options.base.trim() || options.frame === '' || options.theme !== undefined && !['both', 'light', 'dark'].includes(options.theme)) throw new CliError('USAGE_INVALID', 'Choose --impacted --base=<rev> and a valid frame/theme selection.');
  let outcome, failure, selection, workMs = 0;
  const warnings = [];
  function discardProofs() {
    if (selection) {
      selection.coverage.proofComplete = false;
      selection.coverage.uncoveredRows += selection.coverage.provenRows; selection.coverage.provenRows = 0; selection.coverage.scope = 'partial'; selection.coverage.basis = command === 'check' ? 'selected' : 'rendered';
      for (const group of selection.frames) for (const row of group.rows) if (row.proof) { delete row.proof; row.disposition = 'unassessed'; row.unassessedReasons = ['incomplete_identity']; }
    }
    if (outcome?.data && 'verdict' in outcome.data) outcome.data.verdict = null;
  }
  try {
    const plan = await impact(config, { base: options.base, json: true, 'state-dir': options['state-dir'], 'out-dir': options['out-dir'], explain: options.explain }, {
      consume: async session => {
        const { rows, views, assessments, inputs, data } = session;
        const sources = await selectedSources(views[1].config, views[0].config, views[1].config.root, new Set(rows.map(row => row.source)), args);
        const themes = options.theme && options.theme !== 'both' ? [options.theme] : ['light', 'dark'];
        const chosen = rows.filter(row => sources.includes(row.source) && (options.frame === undefined || row.frame === options.frame));
        if (options.frame !== undefined && !chosen.length) {
          throw new CliError('FRAME_NOT_FOUND', `Unknown frame ${options.frame}; choose a frame present on either side.`);
        }
        const exclusions = { source_filter: 0, frame_filter: 0, theme_filter: 0, hypothetical_input: 0, not_checked: 0 };
        for (const row of rows) for (const theme of ['light', 'dark']) {
          if (!sources.includes(row.source)) exclusions.source_filter++;
          else if (options.frame !== undefined && row.frame !== options.frame) exclusions.frame_filter++;
          else if (!themes.includes(theme)) exclusions.theme_filter++;
        }
        selection = { query: data.query, facts: data.facts, frames: groupImpactFrames(data.frames.filter(frame => chosen.some(row => row.source === frame.ref.source && row.frame === frame.ref.frame))
          .map(frame => ({ ...frame, themes: frame.themes.filter(row => themes.includes(row.theme)) })).filter(frame => frame.themes.length), { explain: !!options.explain }),
        coverage: { scope: 'partial', basis: command === 'check' ? 'selected' : 'proven', expectedRows: rows.length * 2, renderedRows: 0,
          provenRows: 0, uncoveredRows: 0, deletedRows: 0, exclusions, proofComplete: false }, timings: data.timings };
        const usedFacts = new Set(selection.frames.flatMap(group => group.rows.flatMap(row => (row.reasons ?? []).map(reason => reason.fact))));
        selection.facts = data.facts.filter(fact => usedFacts.has(fact.id));
        const selected = new Set(chosen.flatMap(row => themes.map(theme => impactRowKey(row, theme))));
        const scheduled = (row, theme) => selected.has(impactRowKey(row, theme)) && assessments.get(impactRowKey(row, theme)).disposition === 'render';
        for (const row of chosen) for (const theme of themes) {
          if (row.status === 'removed') selection.coverage.deletedRows++;
          if (assessments.get(impactRowKey(row, theme)).disposition === 'proven_unaffected') {
            if (command === 'check') exclusions.not_checked++;
            else selection.coverage.provenRows++;
          }
        }
        const finalize = data => {
          const coverage = selection.coverage;
          coverage.renderedRows = command === 'diff' ? data.summary.comparisons + data.summary.supportComparisons : command === 'check' ? data.summary.evaluations : data.captures.length;
          const deleted = command === 'render' ? coverage.deletedRows : 0;
          coverage.uncoveredRows = Math.max(0, coverage.expectedRows - coverage.renderedRows - coverage.provenRows - deleted);
          coverage.scope = !coverage.expectedRows ? 'empty' : coverage.uncoveredRows || args.length || options.frame !== undefined || themes.length !== 2 ? 'partial' : 'full';
          coverage.basis = command === 'check' ? 'selected' : coverage.renderedRows ? coverage.provenRows ? 'rendered_and_proven' : 'rendered' : coverage.provenRows ? 'proven' : 'selected';
          data.impact = selection;
        };
        const next = [{ argv: ['adg', command, ...(command === 'diff' ? [`--base=${options.base}`] : command === 'check' ? ['--read-only'] : []),
          ...(options.scale !== undefined && command !== 'check' ? [`--scale=${options.scale}`] : []), '--json'], reason: 'Evaluate the full project without impact filtering.' }];
        session.selection = selection; session.sources = sources; session.chosen = chosen; session.themes = themes; session.scheduled = scheduled;
        session.diffInputs = { ...inputs.session, sources, close: async () => {},
          buildFrames: async ({ browser }) => inputs.session.buildFrames({ browser, materialized: views.map(view => view.built),
            frame: options.frame, sources: [...new Set(chosen.filter(row => themes.some(theme => scheduled(row, theme))).map(row => row.source))] }) };
        const workStarted = performance.now();
        try { outcome = await work(session); } catch (cause) { failure = cause; outcome = { data: cause.data, warnings: cause.warnings ?? [] }; }
        workMs = performance.now() - workStarted;
        if (outcome?.data) {
          finalize(outcome.data);
          if (selection.coverage.scope === 'partial') warnings.push({ code: 'IMPACT_COVERAGE_PARTIAL', message: 'Impact selection has partial frame/theme coverage.', next });
          if (!failure && !chosen.some(row => (command === 'diff' || row.after) && themes.some(theme => scheduled(row, theme)))) warnings.push({ code: 'IMPACT_NO_CHANGES', message: 'No capture or browser-evaluation jobs were scheduled.', next });
        }
        if (failure && !['CHECK_FAILED', 'DIFF_FAILED'].includes(failure.code)) throw failure;
      },
    });
    warnings.push(...plan.warnings.filter(w => !['IMPACT_NO_CHANGES', 'IMPACT_NO_MATCH'].includes(w.code)));
    if (selection) selection.coverage.proofComplete = true;
    if (outcome?.data) outcome.data.timings = { ...outcome.data.timings, impactMs: plan.data.timings.totalMs - workMs, workMs, materializeMs: plan.data.timings.materializeMs, proofMs: plan.data.timings.proofMs, totalMs: plan.data.timings.totalMs };
  } catch (cause) {
    discardProofs();
    if (!outcome?.data) cause.data = null;
    failure = outcome?.data ? commandFailure(cause, outcome.data, warnings) : cause;
  }
  if (outcome) outcome.warnings = [...new Set([...outcome.warnings, ...warnings])];
  if (outcome?.data?.reportPath) {
    try { await mkdir(path.dirname(outcome.data.reportPath), { recursive: true }); await writeFile(outcome.data.reportPath, JSON.stringify(outcome.data, null, 2) + '\n'); }
    catch (cause) { discardProofs(); outcome.data.reportPath = null; failure = commandFailure(cause, outcome.data, outcome.warnings); }
  }
  if (failure) { if (outcome?.data) failure = commandFailure(failure, outcome.data, outcome.warnings); throw failure; }
  return outcome;
}
