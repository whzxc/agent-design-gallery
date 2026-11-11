import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { launch, loadFrame, browserTask, readyResources } from './browser.mjs';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { currentHead } from './arch-git.mjs';
import { pixelComparator, imageDifference } from './pixel-diff.mjs';
import { partContext, captureEvidence, capturePart, isolateParent, frameIdentity, comparisonIdentity } from './part-diff.mjs';
import { commandFailure, cleanup, emptySelection } from './results.mjs';
import { CliError, classifyError, asCliError, nextActions } from '../cli-output.mjs';
import { resolveDiffPolicy } from './diff-policy.mjs';

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

async function writePair(output, pair, thresholds) {
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
    note: { before: row.before?.note ?? null, after: row.after?.note ?? null }, paths,
  };
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
export async function diff(config, args = [], options = {}, { launchBrowser = launch, prepareInputs = prepareDiffInputs, log = console.log, clock } = {}) {
  const started = performance.now(), scale = Number(options.scale ?? 2), themeOption = options.theme ?? 'both';
  if (!Number.isFinite(scale) || scale <= 0) throw new CliError('USAGE_INVALID', 'Invalid --scale; use a positive number.');
  if (!['both', 'light', 'dark'].includes(themeOption)) throw new CliError('USAGE_INVALID', 'Choose --theme=both, light, or dark.');
  if (options['out-dir'] === '') throw new CliError('USAGE_INVALID', 'Set --out-dir to a directory.');
  const themes = themeOption === 'both' ? ['light', 'dark'] : [themeOption];
  const output = options['out-dir'] === undefined ? path.join(config.output, 'diff') : path.resolve(config.root, options['out-dir']);
  const timings = { prepareMs: 0, buildMs: 0, captureMs: 0, compareMs: 0, writeMs: 0, totalMs: 0 };
  const warnings = [], completed = [];
  const thresholds = config.diff?.thresholds ?? resolveDiffPolicy().thresholds;
  let inputs, browser, data, primary, context;
  const timed = async (name, work) => {
    const start = performance.now();
    try { return await work(); }
    finally { timings[name] += performance.now() - start; }
  };
  try {
    const head = await timed('prepareMs', async () => {
      inputs = await prepareInputs(config, args, options);
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
      classifierVersion: 1, thresholds, comparisons: [], support: [], verdict: null, reasons: [],
      summary: { sources: inputs.sources.length, frames: 0, comparisons: 0, supportComparisons: 0, isolationCaptures: 0,
        added: 0, removed: 0, matched: 0, identical: 0, structural: 0, changed: 0,
        classPixels: Object.fromEntries(classNames.map(name => [name, 0])) },
      differencePalette: { equal: '#00000000', imperceptible: '#64748b', antialiasing: '#f59e0b', boundary_bleed: '#0ea5e9', bitmap_resampling: '#a855f7', other: '#ff00ff' }, reportPath: null, timings,
    };
    if (inputs.sources.length) browser = await launchBrowser();
    const built = await timed('buildMs', () => inputs.buildFrames({ browser }));
    context = partContext(built, inputs, scale, themes, clock);
    for (const warning of inputs.warnings) if (!warnings.includes(warning)) warnings.push(warning);
    data.summary.frames = built.frames.length;
    for (const row of built.frames) data.summary[row.status]++;
    if (!built.frames.length) emptySelection(warnings);
    else browser ??= await launchBrowser();
    if (browser) data.environment.chromium = browser.version();
    const selectedOrder = new Map(built.frames.flatMap(row => themes.map(theme => comparisonIdentity(row, theme))).map((key, index) => [key, index]));
    const supportKeys = new Set(built.support.map(frameIdentity));
    const ordinary = [...built.frames.filter(row => !row.parentRow), ...built.support.map(row => ({ ...row, support: true }))];
    const ordinaryJobs = ordinary.flatMap(row => themes.map(theme => ({ row, theme })));
    const partJobs = built.frames.filter(row => row.parentRow).flatMap(row => themes.map(theme => ({ row, theme })));
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
        const rows = await phase('writeMs', compared, pair => writePair(output, pair, thresholds));
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
  timings.totalMs = performance.now() - started;
  data.reportPath = path.join(output, 'report.json');
  try {
    await mkdir(output, { recursive: true });
    await writeFile(data.reportPath, JSON.stringify(data, null, 2) + '\n');
  } catch (error) {
    data.reportPath = null; data.complete = false; data.verdict = null;
    if (primary) primary.warnings.push(classifyError(error).error);
    else primary = commandFailure(error, data, warnings);
  }
  if (primary) throw primary;
  if (!options.json) log(`${data.verdict}: ${data.summary.frames} frames. ${data.reportPath}`);
  if (data.verdict === 'changed') throw new CliError('DIFF_FAILED', 'Design differences require review.', { data, warnings });
  return { data, warnings };
}
