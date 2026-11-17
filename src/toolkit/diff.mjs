import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { launch, loadFrame, browserTask, readyResources } from './browser.mjs';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { currentHead } from './arch-git.mjs';
import { pixelComparator, imageDifference } from './pixel-diff.mjs';
import { partContext, captureEvidence, capturePart, isolateParent, frameIdentity, comparisonIdentity } from './part-diff.mjs';
import { commandFailure, cleanup, emptySelection } from './results.mjs';
import { CliError, classifyError, asCliError, nextActions } from '../cli-output.mjs';
import { withImpacted } from './impact-selection.mjs';
import { resolveDiffPolicy } from './diff-policy.mjs';
import { buildReview, reviewDocumentHtml } from '../../public/review.js';
import { resolveThemes, systemTheme } from './theme.mjs';
import { renderReviewSheet, reviewForTheme } from './review-sheet.mjs';
import { reviewCacheKey, writeReviewCache } from '../review-cache.mjs';

const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const safeName = name => encodeURIComponent(name).replace(/\./g, '%2E');
const classNames = ['imperceptible', 'antialiasing', 'boundary_bleed', 'bitmap_resampling', 'other'];

function frameFailure(error, row, theme) {
  const failure = asCliError(error, 'RENDER_FAILED');
  failure.message = `${row.source}: ${row.frame}: ${theme}: ${failure.message}`;
  return failure;
}

async function capturePair(browser, row, theme, scale, context) {
  const captures = { before: null, after: null };
  let page;
  try {
    for (const side of ['before', 'after']) {
      if (!row[side]) continue;
      page ??= await browserTask(browser, () => browser.newPage({ deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'UTC' }));
      await loadFrame(page, row[side], theme);
      captures[side] = await browserTask(browser, async () => {
        await page.evaluate(readyResources);
        const element = page.locator('[data-adg-frame]');
        const box = await element.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) throw new Error('Frame has no visible bounds.');
        const capture = () => element.screenshot({ animations: 'disabled', caret: 'hide' });
        const targets = context?.targets.get(frameIdentity(row));
        const evidence = targets ? await captureEvidence(page, targets, row, side, theme, context, capture) : { png: await capture() };
        const png = evidence.png;
        return { ...evidence, size: { width: box.width, height: box.height, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20) } };
      });
    }
    if (context?.targets.has(frameIdentity(row))) context.parents.set(comparisonIdentity(row, theme), captures);
    return { row, theme, page, ...captures };
  } catch (error) {
    const failure = frameFailure(error, row, theme);
    await cleanup(() => page?.close(), failure);
    throw failure;
  }
}

async function comparePair(browser, pair, thresholds, context) {
  try {
    return await browserTask(browser, async () => {
      const compare = await pair.page.evaluateHandle(pixelComparator);
      try {
        const encoded = side => pair[side] ? `data:image/png;base64,${pair[side].png.toString('base64')}` : null;
        const args = { before: encoded('before'), after: encoded('after'), compare, crop: pair.crop ?? null,
          evidence: pair.evidence ? { ...pair.evidence, thresholds } : null };
        let result = await pair.page.evaluate(imageDifference, args);
        if (result.needsIsolation) {
          await compare.dispose();
          const isolated = await isolateParent(pair, context);
          // Reloading the parent replaces the document and its function handle.
          const isolatedCompare = await pair.page.evaluateHandle(pixelComparator);
          try { result = await pair.page.evaluate(imageDifference, { ...args, compare: isolatedCompare, isolated: `data:image/png;base64,${isolated.toString('base64')}` }); }
          finally { await isolatedCompare.dispose(); }
        }
        return { ...pair, ...result,
          before: result.beforePng ? { ...pair.before, png: Buffer.from(result.beforePng, 'base64') } : pair.before,
          isolated: result.isolatedPng ? Buffer.from(result.isolatedPng, 'base64') : null,
          bleedMask: result.bleedPng ? Buffer.from(result.bleedPng, 'base64') : null,
          difference: Buffer.from(result.png, 'base64') };
      } finally { await compare.dispose(); }
    });
  } catch (error) { throw frameFailure(error, pair.row, pair.theme); }
}

async function writePair(output, pair, thresholds, reviewImages) {
  const { row, theme } = pair;
  const directory = path.join(output, row.support ? 'support' : 'frames', ...row.source.split('/').map(safeName), safeName(row.frame), theme);
  await mkdir(directory, { recursive: true });
  const paths = {
    before: pair.before ? path.join(directory, 'before.png') : null,
    after: pair.after ? path.join(directory, 'after.png') : null,
    difference: path.join(directory, 'difference.png'),
    beforeSnapshot: pair.snapshots ? path.join(directory, 'before.snapshot.json') : null,
    afterSnapshot: pair.snapshots ? path.join(directory, 'after.snapshot.json') : null,
    parentCurrentSnapshot: pair.snapshots ? path.join(directory, 'parent-current.snapshot.json') : null,
    report: path.join(directory, 'comparison.json'), parentIsolated: pair.isolated ? path.join(directory, 'parent-isolated.png') : null,
    bleedMask: pair.bleedMask ? path.join(directory, 'bleed-mask.png') : null,
  };
  const beforeSize = pair.before?.size ?? null, afterSize = pair.after?.size ?? null;
  const reasons = [];
  if (!pair.parent && row.status !== 'matched') reasons.push(row.status);
  if (row.matchKind === 'renamed_or_unknown') reasons.push('renamed_or_unknown');
  if (beforeSize && afterSize && Object.keys(beforeSize).some(key => beforeSize[key] !== afterSize[key])) reasons.push('size_changed');
  if (pair.parent) {
    if (pair.snapshots.findings.length) reasons.push('snapshot_mismatch');
    if (pair.parentChanged) reasons.push('parent_changed');
    if (pair.singleTheme) reasons.push('theme_coverage_incomplete');
    if (pair.pixels.classes.other.pixels) reasons.push('other_pixels');
    if (!pair.pixels.classes.antialiasing.withinThreshold || !pair.pixels.classes.bitmap_resampling.withinThreshold) reasons.push('threshold_exceeded');
  } else if (pair.pixels.differentPixels) reasons.push('pixels_changed');
  const ref = { source: row.source, frame: row.frame };
  const comparison = {
    id: JSON.stringify([row.source, row.frame, theme, ...(row.support ? ['support'] : [])]), ...ref, theme,
    status: row.status, matchKind: row.matchKind, matchCandidates: row.matchCandidates,
    relation: pair.parent ? 'parent_crop' : 'revision', before: pair.parent?.ref ?? (pair.before ? ref : null), after: pair.after ? ref : null,
    beforeSize, afterSize, parent: pair.parent ?? null, snapshots: pair.snapshots ?? null, pixels: pair.pixels,
    verdict: reasons.length ? 'changed' : pair.parent ? 'structural' : 'identical', reasons,
    note: { before: row.before?.note ?? null, after: row.after?.note ?? null },
    proposed: row.after?.proposed ?? row.before?.proposed ?? null,
    metadata: { before: row.before ? { locale: row.before.locale ?? null, proposed: row.before.proposed ?? null, fixture: row.before.fixture ?? null, capture: row.before.capture ?? null } : null,
      after: row.after ? { locale: row.after.locale ?? null, proposed: row.after.proposed ?? null, fixture: row.after.fixture ?? null, capture: row.after.capture ?? null } : null }, paths,
  };
  if (!row.support) {
    reviewImages.set(comparison.id, {
      before: pair.before ? `data:image/png;base64,${pair.before.png.toString('base64')}` : null,
      after: pair.after ? `data:image/png;base64,${pair.after.png.toString('base64')}` : null,
      difference: `data:image/png;base64,${pair.difference.toString('base64')}`,
    });
  }
  await Promise.all([
    pair.before && writeFile(paths.before, pair.before.png),
    pair.after && writeFile(paths.after, pair.after.png),
    writeFile(paths.difference, pair.difference),
  ]);
  if (pair.snapshotFiles) await Promise.all(Object.entries(pair.snapshotFiles).map(([name, value]) => writeFile(paths[name], JSON.stringify(value, null, 2) + '\n')));
  if (pair.isolated) await writeFile(paths.parentIsolated, pair.isolated);
  if (pair.bleedMask) await writeFile(paths.bleedMask, pair.bleedMask);
  await writeFile(paths.report, JSON.stringify({ classifierVersion: 1, thresholds, comparison }, null, 2) + '\n');
  return comparison;
}

/** Exact ordinary frames and evidence-backed structural part comparisons. */
export async function diff(config, args = [], options = {}, { launchBrowser = launch, prepareInputs = prepareDiffInputs, log = console.log, clock, session, onReview, readSystemTheme = systemTheme, renderSheet = renderReviewSheet, sheetTheme } = {}) {
  const started = performance.now(), scale = Number(options.scale ?? 2);
  if (!Number.isFinite(scale) || scale <= 0) throw new CliError('USAGE_INVALID', 'Invalid --scale; use a positive number.');
  const themes = resolveThemes(options.theme, readSystemTheme);
  sheetTheme ??= themes.length === 1 ? themes[0] : readSystemTheme();
  options = { ...options, theme: themes.length === 2 ? 'both' : themes[0] };
  if (options['out-dir'] === '') throw new CliError('USAGE_INVALID', 'Set --out-dir to a directory.');
  if (options.impacted && !session) {
    const keys = !args.length && options.frame === undefined && scale === 2
      ? await Promise.all(themes.map(theme => reviewCacheKey(config, options.base, theme, options['state-dir']))) : [];
    let reviewModel, outcome, failure;
    try {
      outcome = await withImpacted(config, args, options, 'diff', selected =>
        diff(config, args, options, { launchBrowser, prepareInputs, log, clock, session: selected, readSystemTheme, renderSheet, sheetTheme,
          onReview: model => { reviewModel = model; onReview?.(model); } }));
    } catch (error) { failure = error; }
    // withImpacted has now verified the generation and closed the real input trees.
    const data = outcome?.data ?? failure?.data;
    if (reviewModel && (data?.complete && (!failure || failure.code === 'DIFF_FAILED') || failure?.reviewCacheable === true)) {
      try { await Promise.all(keys.map(key => writeReviewCache(key, reviewForTheme(reviewModel, key.theme)))); }
      catch (error) { throw commandFailure(error, data, outcome?.warnings ?? failure.warnings); }
    }
    if (failure) throw failure;
    return outcome;
  }
  const output = options['out-dir'] === undefined ? path.join(config.output, 'diff') : path.resolve(config.root, options['out-dir']);
  const timings = { prepareMs: 0, buildMs: 0, captureMs: 0, compareMs: 0, writeMs: 0, totalMs: 0 };
  const warnings = [], completed = [], reviewImages = new Map();
  const thresholds = config.diff?.thresholds ?? resolveDiffPolicy().thresholds;
  let inputs, browser, data, primary, context;
  const timed = async (name, work) => {
    const start = performance.now();
    try { return await work(); }
    finally { timings[name] += performance.now() - start; }
  };
  try {
    const head = await timed('prepareMs', async () => {
      inputs = session ? session.diffInputs : await prepareInputs(config, args, options);
      return currentHead(inputs.base);
    });
    warnings.push(...inputs.warnings);
    data = {
      project: config.root, outputDirectory: output, complete: false,
      base: { rev: inputs.base.rev, sha: inputs.base.sha }, current: { kind: 'working_tree', head },
      selection: { sources: inputs.sources, frame: options.frame ?? null, themes, scale,
        existingCoverage: !inputs.sources.length ? 'empty' : args.length || options.frame !== undefined || themes.length !== 2 ? 'partial' : 'full' },
      environment: { adg: metadata.version, node: process.version, platform: process.platform, arch: process.arch, chromium: null,
        ...metadata.dependencies, locale: 'en-US', timezone: 'UTC', ...inputs.environment, baseThresholds: inputs.before.config.diff.thresholds },
      impact: session?.selection ?? null, classifierVersion: 1, thresholds, comparisons: [], support: [], failures: [], verdict: null, reasons: [],
      summary: { sources: inputs.sources.length, frames: 0, comparisons: 0, supportComparisons: 0, isolationCaptures: 0,
        added: 0, removed: 0, matched: 0, identical: 0, structural: 0, changed: 0,
        classPixels: Object.fromEntries(classNames.map(name => [name, 0])) },
      review: { added: 0, removed: 0, changed: 0, sheet: null },
      differencePalette: { equal: '#00000000', imperceptible: '#64748b', antialiasing: '#f59e0b', boundary_bleed: '#0ea5e9', bitmap_resampling: '#a855f7', other: '#ff00ff' }, reportPath: null, indexPath: null, timings,
    };
    await timed('writeMs', () => Promise.all(['frames', 'support', 'report.json', 'index.html', 'review-sheet.png'].map(entry =>
      rm(path.join(output, entry), { recursive: true, force: true }))));
    if (session ? session.chosen.some(row => row.source.endsWith('.mmd') && session.themes.some(theme => session.scheduled(row, theme))) : inputs.sources.length) browser = await launchBrowser();
    const built = await timed('buildMs', () => inputs.buildFrames({ browser }));
    data.failures = built.failures ?? [];
    if (session) built.frames = built.frames.filter(row => themes.some(theme => session.scheduled(row, theme)));
    context = partContext(built, inputs, scale, themes, clock);
    for (const warning of inputs.warnings) if (!warnings.includes(warning)) warnings.push(warning);
    data.summary.frames = built.frames.length;
    for (const row of built.frames) data.summary[row.status]++;
    if (!built.frames.length && !data.failures.length && (!session || !session.selection.coverage.expectedRows)) emptySelection(warnings);
    else if (built.frames.length) browser ??= await launchBrowser();
    if (browser) data.environment.chromium = browser.version();
    const selectedOrder = new Map(built.frames.flatMap(row => themes.map(theme => comparisonIdentity(row, theme))).map((key, index) => [key, index]));
    const supportKeys = new Set(built.support.map(frameIdentity));
    const ordinary = [...built.frames.filter(row => !row.parentRow), ...built.support.map(row => ({ ...row, support: true }))];
    const ordinaryJobs = ordinary.flatMap(row => themes.filter(theme => !session || row.support || session.scheduled(row, theme)).map(theme => ({ row, theme })));
    const partJobs = built.frames.filter(row => row.parentRow).flatMap(row => themes.filter(theme => !session || session.scheduled(row, theme)).map(theme => ({ row, theme })));
    const concurrency = Math.min(4, availableParallelism());
    for (const jobs of [ordinaryJobs, partJobs]) for (let start = 0; start < jobs.length; start += concurrency) {
      const failures = [], openPairs = [];
      const phase = async (name, items, work) => {
        const settled = await timed(name, () => Promise.allSettled(items.map(work)));
        return settled.flatMap((result, index) => {
          if (result.status === 'fulfilled') return [result.value];
          failures.push({ index, error: result.reason });
          return [];
        });
      };
      try {
        const batch = jobs.slice(start, start + concurrency);
        openPairs.push(...await phase('captureMs', batch, job => job.row.parentRow
          ? browserTask(browser, () => capturePart(browser, job.row, job.theme, context)).catch(error => { throw frameFailure(error, job.row, job.theme); })
          : capturePair(browser, job.row, job.theme, scale, context)));
        const compared = await phase('compareMs', openPairs, pair => comparePair(browser, pair, thresholds, context));
        const rows = await phase('writeMs', compared, pair => writePair(output, pair, thresholds, reviewImages));
        for (const row of rows) {
          context?.comparisons.set(comparisonIdentity(row, row.theme), row);
          if (supportKeys.has(frameIdentity(row))) { data.support.push(row); data.summary.supportComparisons++; }
          else {
            completed.push(row); data.summary.comparisons++; data.summary[row.verdict]++;
            for (const name of classNames) data.summary.classPixels[name] += row.pixels.classes[name].pixels;
          }
        }
      } finally {
        for (const pair of openPairs) {
          try { await cleanup(() => pair.page.close()); }
          catch (error) { failures.push({ index: jobs.length, error }); }
        }
      }
      data.comparisons = completed;
      completed.sort((a, b) => selectedOrder.get(comparisonIdentity(a, a.theme)) - selectedOrder.get(comparisonIdentity(b, b.theme)));
      data.summary.isolationCaptures = context?.isolation.size ?? 0;
      if (failures.length) {
        failures.sort((a, b) => a.index - b.index);
        for (const item of failures.slice(1)) warnings.push(classifyError(item.error).error);
        throw failures[0].error;
      }
    }
    if (options.impacted) await timed('writeMs', async () => {
      await mkdir(output, { recursive: true });
      browser ??= await launchBrowser();
      const model = buildReview({ ...data, complete: !data.failures.length }, reviewImages, { label: config.name ?? path.basename(config.root) });
      data.review.sheet = await renderSheet(browser, model, sheetTheme, path.join(output, 'review-sheet.png'), completed);
    });
  } catch (error) {
    if (inputs) {
      if (error.message) error.message = inputs.translateDiagnostic(error.message);
      if (error.context) error.context = inputs.translateDiagnostic(error.context);
      if (error.warnings) error.warnings = inputs.translateDiagnostic(error.warnings);
    }
    primary = data ? commandFailure(error, data, warnings) : error;
  } finally {
    for (const close of [() => browser?.close(), () => inputs?.close()]) {
      try { await cleanup(close, primary); }
      catch (error) { primary = data ? commandFailure(error, data, warnings) : error; }
    }
  }
  if (!data) throw primary;
  let sourceFailureOnly = !primary && data.failures.length > 0;
  if (sourceFailureOnly) primary = commandFailure(new CliError('SOURCE_BUILD_FAILED',
    `${new Set(data.failures.map(failure => failure.source)).size} source(s) could not be compared; review the source failures.`, { data }), data, warnings);
  data.complete = !primary;
  if (!primary) {
    data.verdict = data.summary.changed || data.support.some(row => row.verdict === 'changed') ? 'changed' : data.summary.structural ? 'structural' : 'identical';
    data.reasons = [...new Set([...completed, ...data.support].flatMap(row => row.reasons))];
    if (data.summary.structural && data.selection.existingCoverage !== 'full') {
      data.verdict = 'changed'; data.reasons.push('existing_coverage_incomplete');
    }
    if (data.reasons.includes('existing_coverage_incomplete') || data.reasons.includes('theme_coverage_incomplete')) {
      const next = nextActions('DIFF_FAILED', { command: 'diff', values: { ...options, frame: undefined, theme: 'both' }, positionals: [] }).map(action => ({ ...action, reason: 'Compare all existing frames in both themes before a structural batch verdict.' }));
      warnings.push({ code: 'DIFF_COVERAGE_INCOMPLETE', message: 'A structural batch requires every existing frame in both themes.', next });
    }
  }
  const reviewModel = buildReview(data, reviewImages, { label: config.name ?? path.basename(config.root) });
  data.review = { ...reviewModel.counts, sheet: data.review.sheet };
  onReview?.(reviewModel);
  timings.totalMs = performance.now() - started;
  data.reportPath = path.join(output, 'report.json');
  data.indexPath = path.join(output, 'index.html');
  try {
    await mkdir(output, { recursive: true });
    await writeFile(data.indexPath, reviewDocumentHtml(reviewModel));
    if (!session) await writeFile(data.reportPath, JSON.stringify(data, null, 2) + '\n');
  } catch (error) {
    sourceFailureOnly = false;
    data.reportPath = null; data.indexPath = null; data.complete = false; data.verdict = null;
    if (primary) primary.warnings.push(classifyError(error).error);
    else primary = commandFailure(error, data, warnings);
  }
  if (primary) {
    if (sourceFailureOnly) primary.reviewCacheable = true;
    throw primary;
  }
  if (!options.json) log(`${data.verdict}: ${data.review.added} added, ${data.review.removed} removed, ${data.review.changed} changed (${data.summary.frames} frames). ${data.indexPath}`);
  if (data.verdict === 'changed') throw new CliError('DIFF_FAILED', 'Design differences require review.', { data, warnings });
  return { data, warnings };
}
