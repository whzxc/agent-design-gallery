import { CliError, classifyError } from '../cli-output.mjs';

/** @typedef {'light' | 'dark'} Theme */
/** @typedef {{source: string | null, frame: string | null, theme: Theme | null, line: number | null, column: number | null}} Location */
/** @typedef {Location & {code: string, message: string}} Finding */
/** @typedef {{project: string, readOnly: boolean, complete: boolean, impact: object | null, sources: string[], summary: {sources: number, frames: number, evaluations: number, problems: number}, findings: Finding[]}} CheckData */
/** @typedef {{source: string, frame: string, theme: Theme, path: string, scale: number, width: number, height: number, pixelWidth: number, pixelHeight: number}} Capture */
/** @typedef {{project: string, outputDirectory: string, complete: boolean, impact: object | null, base: {rev: string, sha: string} | null, captures: Capture[], deleted: string[]}} RenderData */
/** @typedef {{source: string, frame: string, fixture: string, theme: Theme, settled: boolean, size: {design: [number, number], implementation: [number, number]}, matched: number, offBy2px: {text: string, dx: number, dy: number, dw: number, off: number}[], missing: string[], extra: string[], paths: {design: string, implementation: string, overlay: string, report: string, html: string}}} Comparison */
/** @typedef {{project: string, complete: boolean, all: boolean, comparisons: Comparison[], skipped: {source: string, frame: string, reason: 'no_fixture'}[], summary: {frames: number, matched: number, offsets: number, missing: number, extra: number}, indexPath: string | null, summaryPath: string | null}} CompareData */

/**
 * Attach observed command data without replacing a typed boundary's code or message.
 * @param {unknown} error
 * @param {{complete: boolean}} data
 * @param {import('../cli-output.mjs').Diagnostic[]} warnings
 * @param {import('../cli-output.mjs').ErrorCode} [fallback]
 */
export function commandFailure(error, data, warnings, fallback = 'INTERNAL_ERROR') {
  const classified = classifyError(error);
  const failure = error instanceof CliError ? error : new CliError(classified.error.code === 'INTERNAL_ERROR' ? fallback : classified.error.code, classified.error.message, { cause: error });
  if (!['CHECK_FAILED', 'COMPARE_FAILED', 'DIFF_FAILED'].includes(failure.code)) data.complete = false;
  failure.data = data;
  failure.warnings = [...new Set([...warnings, ...failure.warnings])];
  return failure;
}

/** Always attempt cleanup, retaining an earlier operation failure as primary.
 * @param {() => Promise<unknown>} close
 * @param {unknown} primary
 */
export async function cleanup(close, primary) {
  try { await close(); }
  catch (error) {
    const failure = new CliError('SHUTDOWN_FAILED', error instanceof Error ? error.message : String(error), { cause: error });
    if (primary instanceof CliError) primary.warnings.push(classifyError(failure).error);
    else if (!primary) throw failure;
  }
}

/** @param {import('../cli-output.mjs').Diagnostic[]} warnings */
export function emptySelection(warnings) {
  warnings.push({ code: 'EMPTY_SELECTION', message: 'No sources or fixture frames were selected.', next: [] });
}
