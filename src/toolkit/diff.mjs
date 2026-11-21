import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { launch, loadFrame, browserTask, readyResources } from './browser.mjs';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { pairFrameMoves } from './move-pairing.mjs';
import { currentHead } from './arch-git.mjs';
import { relative, sourceDirectories, sourceFeature } from './project.mjs';
import { pixelComparator, imageDifference } from './pixel-diff.mjs';
import { partContext, captureEvidence, capturePart, isolateParent, frameIdentity, comparisonIdentity } from './part-diff.mjs';
import { commandFailure, cleanup, emptySelection } from './results.mjs';
import { CliError, classifyError, asCliError, nextActions } from '../cli-output.mjs';
import { withImpacted } from './impact-selection.mjs';
import { resolveDiffPolicy } from './diff-policy.mjs';
import { buildReview, reviewDocumentHtml } from './diff-document.mjs';
import { resolveThemes, systemTheme } from './theme.mjs';
import { renderReviewSheet } from './review-sheet.mjs';

const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const safeName = name => encodeURIComponent(name).replace(/\./g, '%2E');
const classNames = ['imperceptible', 'antialiasing', 'boundary_bleed', 'bitmap_resampling', 'other'];
const allThemes = ['light', 'dark'];

/** Git owns direct changes; impact reasons own inherited cause sets when available. */
export function reviewChange(row, inputs, built, selection = null) {
  const changed = new Set((inputs.changes ?? []).flatMap(change => [change.before, change.after]).filter(Boolean));
  const sides = [inputs.before, inputs.after ?? inputs.before];
  const own = [...changed].filter(name => sides.some(({ config }) => {
    const design = path.relative(config.root, config.design).split(path.sep).join('/');
    const relativeSource = path.posix.relative(design, row.source);
    const feature = sourceFeature(relativeSource, sourceDirectories(config));
    return name === row.source || feature !== relativeSource && name.startsWith(path.posix.join(design, feature) + '/');
  }));
  if (own.length) return { kind: 'direct', causes: own.sort() };
  const causes = new Set();
  if (selection) {
    const facts = new Map(selection.facts.map(fact => [fact.id, fact]));
    for (const group of selection.frames) {
      if (group.source !== row.source || !group.frames.includes(row.frame)) continue;
      for (const entry of group.rows) for (const reason of entry.reasons ?? []) {
        const source = facts.get(reason.fact)?.source;
        if (source && reason.scope !== 'support') causes.add(source);
      }
    }
  } else {
    for (const [index, side] of sides.entries()) {
      const source = [built.before, built.after][index]?.get(row.source);
      for (const dependency of source?.dependencies ?? []) {
        const name = path.relative(side.config.root, dependency).split(path.sep).join('/');
        if (changed.has(name)) causes.add(name);
      }
    }
    for (const name of inputs.globalChanges ?? []) causes.add(name);
  }
  return { kind: 'inherited', causes: [...causes].sort() };
}

function frameFailure(error, row, theme) {
  const failure = asCliError(error, 'RENDER_FAILED');
  failure.message = `${row.source}: ${row.frame}: ${theme}: ${failure.message}`;
  return failure;
}

async function capturePair(browser, row, theme, scale, context, cachedTheme) {
  const captures = { before: null, after: null };
  let page;
  try {
    for (const side of ['before', 'after']) {
      if (!row[side]) continue;
      page ??= await browserTask(browser, () => browser.newPage({ deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'UTC' }));
      if (!context?.targets.has(frameIdentity(row)) && cachedTheme?.has(row[side])) {
        captures[side] = cachedTheme.get(row[side]);
        cachedTheme.delete(row[side]);
        continue;
      }
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

// Normalize decoded screenshot pixels before hashing so PNG encoding does not affect matching.
async function renderFingerprints(browser, candidates, theme, scale, cachedTheme, concurrency) {
  const fingerprints = new Map();
  for (let start = 0; start < candidates.length; start += concurrency) {
    const results = await Promise.allSettled(candidates.slice(start, start + concurrency).map(async row => {
      const pair = await capturePair(browser, row, theme, scale, null);
      const frame = row.before ?? row.after, capture = pair.before ?? pair.after;
      let failure;
      try {
        const pixels = await browserTask(browser, () => pair.page.evaluate(async base64 => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + base64;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d', { colorSpace: 'srgb' }).drawImage(image, 0, 0);
          return canvas.toDataURL('image/png');
        }, capture.png.toString('base64')));
        cachedTheme.set(frame, capture);
        fingerprints.set(row, createHash('sha256').update(JSON.stringify(capture.size)).update(pixels).digest('hex'));
      } catch (error) { failure = frameFailure(error, row, theme); throw failure; }
      finally { await cleanup(() => pair.page.close(), failure); }
    }));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  return fingerprints;
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

function revisionReasons(pair) {
  const before = pair.before?.size, after = pair.after?.size;
  const reasons = [];
  if (before && after && Object.keys(before).some(key => before[key] !== after[key])) reasons.push('size_changed');
  if (!pair.parent && pair.pixels.differentPixels) reasons.push('pixels_changed');
  return reasons;
}

async function writePair(output, pair, thresholds, reviewImages, reviewFormat) {
  const { row, theme } = pair;
  const directory = output && path.join(output, row.support ? 'support' : 'frames', ...row.source.split('/').map(safeName), safeName(row.frame), theme);
  const paths = directory ? {
    before: pair.before ? path.join(directory, 'before.png') : null,
    after: pair.after ? path.join(directory, 'after.png') : null,
    difference: path.join(directory, 'difference.png'),
    beforeSnapshot: pair.snapshots ? path.join(directory, 'before.snapshot.json') : null,
    afterSnapshot: pair.snapshots ? path.join(directory, 'after.snapshot.json') : null,
    parentCurrentSnapshot: pair.snapshots ? path.join(directory, 'parent-current.snapshot.json') : null,
    report: path.join(directory, 'comparison.json'), parentIsolated: pair.isolated ? path.join(directory, 'parent-isolated.png') : null,
    bleedMask: pair.bleedMask ? path.join(directory, 'bleed-mask.png') : null,
  } : null;
  const beforeSize = pair.before?.size ?? null, afterSize = pair.after?.size ?? null;
  const reasons = [];
  if (!pair.parent && row.status !== 'matched' && row.status !== 'moved') reasons.push(row.status);
  if (row.matchKind === 'renamed_or_unknown') reasons.push('renamed_or_unknown');
  reasons.push(...revisionReasons(pair));
  if (pair.parent) {
    if (pair.snapshots.findings.length) reasons.push('snapshot_mismatch');
    if (pair.parentChanged) reasons.push('parent_changed');
    if (pair.singleTheme) reasons.push('theme_coverage_incomplete');
    if (pair.pixels.classes.other.pixels) reasons.push('other_pixels');
    if (!pair.pixels.classes.antialiasing.withinThreshold || !pair.pixels.classes.bitmap_resampling.withinThreshold) reasons.push('threshold_exceeded');
  }
  const ref = { source: row.source, frame: row.frame };
  const beforeRef = row.previousSource ? { source: row.previousSource, frame: row.previousFrame } : ref;
  const comparison = {
    id: JSON.stringify([row.source, row.frame, theme, ...(row.support ? ['support'] : [])]), ...ref, theme,
    status: row.status, matchKind: row.matchKind, matchCandidates: row.matchCandidates, change: row.change,
    ...(row.previousSource ? { previousSource: row.previousSource } : {}),
    relation: pair.parent ? 'parent_crop' : 'revision',
    before: pair.parent?.ref ?? (pair.before ? beforeRef : null), after: pair.after ? ref : null,
    beforeSize, afterSize, parent: pair.parent ?? null, snapshots: pair.snapshots ?? null, pixels: pair.pixels,
    verdict: reasons.length ? 'changed' : pair.parent ? 'structural' : 'identical', reasons,
    note: { before: row.before?.note ?? null, after: row.after?.note ?? null },
    proposed: row.after?.proposed ?? row.before?.proposed ?? null,
    metadata: { before: row.before ? { locale: row.before.locale ?? null, proposed: row.before.proposed ?? null, fixture: row.before.fixture ?? null, capture: row.before.capture ?? null } : null,
      after: row.after ? { locale: row.after.locale ?? null, proposed: row.after.proposed ?? null, fixture: row.after.fixture ?? null, capture: row.after.capture ?? null } : null }, paths,
  };
  const pngSummary = reviewFormat === 'png';
  const omitDifference = pngSummary || reviewFormat === 'embed';
  const shownInSummary = row.status === 'added' ||
    (row.status !== 'removed' && (row.previousSource || comparison.verdict === 'changed'));
  const embedCaptures = output || pngSummary;
  if (reviewFormat !== 'rows' && !row.support && row.status !== 'moved' && (!pngSummary || shownInSummary)) {
    reviewImages.set(comparison.id, {
      before: embedCaptures && pair.before ? `data:image/png;base64,${pair.before.png.toString('base64')}` : null,
      after: embedCaptures && pair.after ? `data:image/png;base64,${pair.after.png.toString('base64')}` : null,
      difference: omitDifference ? null : `data:image/png;base64,${pair.difference.toString('base64')}`,
    });
  }
  if (!directory) return comparison;
  await mkdir(directory, { recursive: true });
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
export async function diff(config, args = [], options = {}, { launchBrowser = launch, prepareInputs = prepareDiffInputs, log = console.log, clock, session, onReview, readSystemTheme = systemTheme, renderSheet = renderReviewSheet, sheetTheme, reviewFormat } = {}) {
  const started = performance.now(), scale = Number(options.scale ?? 2);
  if (!Number.isFinite(scale) || scale <= 0) throw new CliError('USAGE_INVALID', 'Invalid --scale; use a positive number.');
  const themes = resolveThemes(options.theme, readSystemTheme);
  sheetTheme ??= themes.length === 1 ? themes[0] : readSystemTheme();
  options = { ...options, theme: themes.length === 2 ? 'both' : themes[0] };
  if (options['out-dir'] === '') throw new CliError('USAGE_INVALID', 'Set --out-dir to a directory.');
  if (options.impacted && !session) {
    return withImpacted(config, args, options, 'diff', selected =>
      diff(config, args, options, { launchBrowser, prepareInputs, log, clock, session: selected,
        readSystemTheme, renderSheet, sheetTheme, onReview, reviewFormat }));
  }
  const output = reviewFormat ? null : path.resolve(config.root, options['out-dir'] ?? path.join(config.output, 'diff'));
  const timings = { prepareMs: 0, buildMs: 0, captureMs: 0, compareMs: 0, writeMs: 0, totalMs: 0 };
  const warnings = [], completed = [], reviewImages = new Map();
  const hiddenMoveReasons = new Set(), pendingMoveComparisons = new Map();
  const cachedCaptures = new Map(allThemes.map(theme => [theme, new Map()]));
  const concurrency = Math.min(4, availableParallelism());
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
      return inputs.after?.revision?.sha ?? currentHead(inputs.base);
    });
    warnings.push(...inputs.warnings);
    data = {
      project: config.root, outputDirectory: output, complete: false,
      base: { rev: inputs.base.rev, sha: inputs.base.sha }, current: { kind: inputs.after?.revision ? 'revision' : 'working_tree', head },
      selection: { sources: inputs.sources, frame: options.frame ?? null, themes, scale,
        existingCoverage: !inputs.sources.length ? 'empty' : args.length || options.frame !== undefined || themes.length !== 2 ? 'partial' : 'full' },
      environment: { adg: metadata.version, node: process.version, platform: process.platform, arch: process.arch, chromium: null,
        ...metadata.dependencies, locale: 'en-US', timezone: 'UTC', ...inputs.environment, baseThresholds: inputs.before.config.diff.thresholds },
      impact: session?.selection ?? null, classifierVersion: 1, thresholds, comparisons: [], support: [], failures: [], verdict: null, reasons: [],
      summary: { sources: inputs.sources.length, frames: 0, comparisons: 0, supportComparisons: 0, isolationCaptures: 0,
        added: 0, removed: 0, moved: 0, matched: 0, identical: 0, structural: 0, changed: 0,
        classPixels: Object.fromEntries(classNames.map(name => [name, 0])) },
      review: { added: 0, removed: 0, moved: 0, changed: 0, direct: 0, inherited: 0, groups: [], movePairs: [], sheet: null },
      differencePalette: { equal: '#00000000', imperceptible: '#64748b', antialiasing: '#f59e0b', boundary_bleed: '#0ea5e9', bitmap_resampling: '#a855f7', other: '#ff00ff' }, reportPath: null, indexPath: null, timings,
    };
    if (output) await timed('writeMs', () => Promise.all(['frames', 'support', 'report.json', 'index.html', 'review-sheet.png'].map(entry =>
      rm(path.join(output, entry), { recursive: true, force: true }))));
    if (session ? session.chosen.some(row => row.source.endsWith('.mmd') && session.themes.some(theme => session.scheduled(row, theme))) : inputs.sources.length) browser = await launchBrowser();
    const built = await timed('buildMs', () => inputs.buildFrames({ browser, deferParts: true }));
    data.failures = built.failures ?? [];
    if (session) built.frames = built.frames.filter(row => themes.some(theme => session.scheduled(row, theme)));
    const moveThemes = [...new Set([...themes, ...allThemes])];
    built.frames = await pairFrameMoves(built.frames, inputs, async (candidates, theme) => {
      browser ??= await launchBrowser();
      return timed('captureMs', () => renderFingerprints(browser, candidates, theme, scale, cachedCaptures.get(theme), concurrency));
    }, moveThemes);
    if (themes.length === 1) {
      const offThemeCaptures = cachedCaptures.get(moveThemes[1]);
      const pairedFrames = new Set(built.frames.filter(row => row.previousSource).flatMap(row => [row.before, row.after]));
      for (const frame of offThemeCaptures.keys()) if (!pairedFrames.has(frame)) offThemeCaptures.delete(frame);
    }
    if (built.prepareParts) await timed('buildMs', built.prepareParts);
    for (const row of [...built.frames, ...built.support]) row.change ??= reviewChange(row, inputs, built, session?.selection);
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
    const ordinaryJobs = ordinary.flatMap(row => (row.previousSource ? moveThemes :
      themes.filter(theme => !session || row.support || session.scheduled(row, theme))).map(theme => ({ row, theme })));
    const partJobs = built.frames.filter(row => row.parentRow).flatMap(row => themes.filter(theme => !session || session.scheduled(row, theme)).map(theme => ({ row, theme })));
    let comparedJobs = 0;
    for (const jobs of [ordinaryJobs, partJobs]) for (let start = 0; start < jobs.length; start += concurrency) {
      const failures = [], openPairs = [];
      const changes = [];
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
          : capturePair(browser, job.row, job.theme, scale, context, cachedCaptures.get(job.theme))));
        const compared = await phase('compareMs', openPairs, pair => comparePair(browser, pair, thresholds, context));
        const selected = compared.flatMap(pair => {
          const { row } = pair;
          if (!row.previousSource) return [pair];
          const pairs = pendingMoveComparisons.get(row) ?? [];
          pairs.push(pair);
          if (pairs.length < allThemes.length) { pendingMoveComparisons.set(row, pairs); return []; }
          pendingMoveComparisons.delete(row);
          if (pairs.every(item => revisionReasons(item).length === 0)) {
            row.status = 'moved';
            data.summary.matched--;
            data.summary.moved++;
          }
          for (const item of pairs) if (!themes.includes(item.theme)) {
            for (const reason of revisionReasons(item)) hiddenMoveReasons.add(reason);
          }
          return pairs.filter(item => themes.includes(item.theme));
        });
        const rows = await phase('writeMs', selected, pair => writePair(output, pair, thresholds, reviewImages, reviewFormat));
        for (const row of rows) {
          context?.comparisons.set(comparisonIdentity(row, row.theme), row);
          if (supportKeys.has(frameIdentity(row))) { data.support.push(row); data.summary.supportComparisons++; }
          else {
            if (options.onProgress && (row.status !== 'matched' || row.verdict==='changed')) {
              changes.push({source:row.source,frame:row.frame,status:row.status==='matched'?'changed':row.status,
                ...(row.previousSource ? {former:row.before} : {})});
            }
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
      comparedJobs += Math.min(concurrency,jobs.length-start);
      options.onProgress?.({phase:'Comparing frame images',completed:comparedJobs,total:ordinaryJobs.length+partJobs.length,changes});
      data.comparisons = completed;
      completed.sort((a, b) => selectedOrder.get(comparisonIdentity(a, a.theme)) - selectedOrder.get(comparisonIdentity(b, b.theme)));
      data.summary.isolationCaptures = context?.isolation.size ?? 0;
      if (failures.length) {
        failures.sort((a, b) => a.index - b.index);
        for (const item of failures.slice(1)) warnings.push(classifyError(item.error).error);
        throw failures[0].error;
      }
    }
    if (output && options.impacted) await timed('writeMs', async () => {
      await mkdir(output, { recursive: true });
      browser ??= await launchBrowser();
      const model = buildReview({ ...data, complete: !data.failures.length }, reviewImages, { label: config.name ?? path.basename(config.root) });
      const designDirs = { before: relative(inputs.before.config, inputs.before.config.design), after: relative(config, config.design) };
      data.review.sheet = await renderSheet(browser, model, sheetTheme, path.join(output, 'review-sheet.png'), completed, designDirs);
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
    data.verdict = data.summary.changed || hiddenMoveReasons.size || data.support.some(row => row.verdict === 'changed') ? 'changed' : data.summary.structural ? 'structural' : 'identical';
    data.reasons = [...new Set([...completed, ...data.support].flatMap(row => row.reasons).concat([...hiddenMoveReasons]))];
    if (data.summary.structural && data.selection.existingCoverage !== 'full') {
      data.verdict = 'changed'; data.reasons.push('existing_coverage_incomplete');
    }
    if (data.reasons.includes('existing_coverage_incomplete') || data.reasons.includes('theme_coverage_incomplete')) {
      const next = nextActions('DIFF_FAILED', { command: 'diff', values: { ...options, frame: undefined, theme: 'both' }, positionals: [] }).map(action => ({ ...action, reason: 'Compare all existing frames in both themes before a structural batch verdict.' }));
      warnings.push({ code: 'DIFF_COVERAGE_INCOMPLETE', message: 'A structural batch requires every existing frame in both themes.', next });
    }
  }
  const reviewModel = buildReview(data, reviewImages, { label: config.name ?? path.basename(config.root) });
  data.review = { ...reviewModel.counts, movePairs: reviewModel.movePairs ?? [], groups: (reviewModel.groups ?? []).map(group => ({
    causes: group.causes, frames: group.frames.map(({ source, frame }) => ({ source, frame })),
    representative: { source: group.representative.source, frame: group.representative.frame },
    outliers: group.outliers.map(({ source, frame }) => ({ source, frame })), medianArea: group.medianArea,
  })), sheet: data.review.sheet };
  onReview?.(reviewModel);
  timings.totalMs = performance.now() - started;
  if (output) try {
    data.reportPath = path.join(output, 'report.json');
    data.indexPath = path.join(output, 'index.html');
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
    if (sourceFailureOnly) primary.partialSourceFailures = true;
    throw primary;
  }
  if (!options.json) log(`${data.verdict}: ${data.review.added} added, ${data.review.removed} removed, ${data.review.moved} moved, ${data.review.changed} changed (${data.summary.frames} frames). ${data.indexPath}`);
  if (data.verdict === 'changed') throw new CliError('DIFF_FAILED', 'Design differences require review.', { data, warnings });
  return { data, warnings };
}
