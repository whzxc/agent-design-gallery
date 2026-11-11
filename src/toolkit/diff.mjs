import path from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { launch, loadFrame, browserTask } from './browser.mjs';
import { prepareDiffInputs } from './diff-inputs.mjs';
import { currentHead } from './arch-git.mjs';
import { pixelComparator, imageDifference } from './pixel-diff.mjs';
import { commandFailure, cleanup, emptySelection } from './results.mjs';
import { CliError, classifyError, asCliError } from '../cli-output.mjs';

const metadata = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const safeName = name => encodeURIComponent(name).replace(/\./g, '%2E');
const classNames = ['imperceptible', 'antialiasing', 'boundary_bleed', 'bitmap_resampling', 'other'];

function frameFailure(error, row, theme) {
  const failure = asCliError(error, 'RENDER_FAILED');
  failure.message = `${row.source}: ${row.frame}: ${theme}: ${failure.message}`;
  return failure;
}

async function readyResources() {
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode()));
  const urls = new Set();
  for (const element of document.querySelectorAll('*')) {
    const background = getComputedStyle(element).backgroundImage;
    for (const match of background.matchAll(/url\(["']?(.+?)["']?\)/g)) urls.add(match[1]);
  }
  for (const element of document.querySelectorAll('svg image')) {
    const href = element.getAttribute('href') ?? element.getAttribute('xlink:href');
    if (href) urls.add(href);
  }
  await Promise.all([...urls].map(async url => { const image = new Image(); image.src = url; await image.decode(); }));
}

async function capturePair(browser, row, theme, scale) {
  const captures = { before: null, after: null };
  let page;
  try {
    for (const side of ['before', 'after']) {
      if (!row[side]) continue;
      if (page) await cleanup(() => page.close());
      page = await browserTask(browser, () => browser.newPage({ deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'UTC' }));
      await loadFrame(page, row[side], theme);
      captures[side] = await browserTask(browser, async () => {
        await page.evaluate(readyResources);
        const element = page.locator('[data-adg-frame]');
        const box = await element.boundingBox();
        if (!box || box.width <= 0 || box.height <= 0) throw new Error('Frame has no visible bounds.');
        const png = await element.screenshot({ animations: 'disabled', caret: 'hide' });
        return { png, size: { width: box.width, height: box.height, pixelWidth: png.readUInt32BE(16), pixelHeight: png.readUInt32BE(20) } };
      });
    }
    return { row, theme, page, ...captures };
  } catch (error) {
    const failure = frameFailure(error, row, theme);
    await cleanup(() => page?.close(), failure);
    throw failure;
  }
}

async function comparePair(browser, pair) {
  try {
    return await browserTask(browser, async () => {
      const compare = await pair.page.evaluateHandle(pixelComparator);
      try {
        const encoded = side => pair[side] ? `data:image/png;base64,${pair[side].png.toString('base64')}` : null;
        const result = await pair.page.evaluate(imageDifference, { before: encoded('before'), after: encoded('after'), compare });
        return { ...pair, ...result, difference: Buffer.from(result.png, 'base64') };
      } finally { await compare.dispose(); }
    });
  } catch (error) { throw frameFailure(error, pair.row, pair.theme); }
}

async function writePair(output, pair) {
  const { row, theme } = pair;
  const directory = path.join(output, 'frames', ...row.source.split('/').map(safeName), safeName(row.frame), theme);
  await mkdir(directory, { recursive: true });
  const paths = {
    before: pair.before ? path.join(directory, 'before.png') : null,
    after: pair.after ? path.join(directory, 'after.png') : null,
    difference: path.join(directory, 'difference.png'),
    beforeSnapshot: null, afterSnapshot: null, parentCurrentSnapshot: null,
    report: path.join(directory, 'comparison.json'), parentIsolated: null, bleedMask: null,
  };
  const beforeSize = pair.before?.size ?? null, afterSize = pair.after?.size ?? null;
  const reasons = [];
  if (row.status !== 'matched') reasons.push(row.status);
  if (row.matchKind === 'renamed_or_unknown') reasons.push('renamed_or_unknown');
  if (beforeSize && afterSize && Object.keys(beforeSize).some(key => beforeSize[key] !== afterSize[key])) reasons.push('size_changed');
  if (pair.pixels.differentPixels) reasons.push('pixels_changed');
  const ref = { source: row.source, frame: row.frame };
  const comparison = {
    id: JSON.stringify([row.source, row.frame, theme]), ...ref, theme,
    status: row.status, matchKind: row.matchKind, matchCandidates: row.matchCandidates,
    relation: 'revision', before: pair.before ? ref : null, after: pair.after ? ref : null,
    beforeSize, afterSize, parent: null, snapshots: null, pixels: pair.pixels,
    verdict: reasons.length ? 'changed' : 'identical', reasons,
    note: { before: row.before?.note ?? null, after: row.after?.note ?? null }, paths,
  };
  await Promise.all([
    pair.before && writeFile(paths.before, pair.before.png),
    pair.after && writeFile(paths.after, pair.after.png),
    writeFile(paths.difference, pair.difference),
  ]);
  await writeFile(paths.report, JSON.stringify({ classifierVersion: null, thresholds: null, comparison }, null, 2) + '\n');
  return comparison;
}

/** Exact revision comparison. Part evidence and structural classification follow separately. */
export async function diff(config, args = [], options = {}, { launchBrowser = launch, log = console.log } = {}) {
  const started = performance.now(), scale = Number(options.scale ?? 2), themeOption = options.theme ?? 'both';
  if (!Number.isFinite(scale) || scale <= 0) throw new CliError('USAGE_INVALID', 'Invalid --scale; use a positive number.');
  if (!['both', 'light', 'dark'].includes(themeOption)) throw new CliError('USAGE_INVALID', 'Choose --theme=both, light, or dark.');
  if (options['out-dir'] === '') throw new CliError('USAGE_INVALID', 'Set --out-dir to a directory.');
  const themes = themeOption === 'both' ? ['light', 'dark'] : [themeOption];
  const output = options['out-dir'] === undefined ? path.join(config.output, 'diff') : path.resolve(config.root, options['out-dir']);
  const timings = { prepareMs: 0, buildMs: 0, captureMs: 0, compareMs: 0, writeMs: 0, totalMs: 0 };
  const warnings = [], completed = [];
  let inputs, browser, data, primary;
  const timed = async (name, work) => {
    const start = performance.now();
    try { return await work(); }
    finally { timings[name] += performance.now() - start; }
  };
  try {
    const head = await timed('prepareMs', async () => {
      inputs = await prepareDiffInputs(config, args, options);
      return currentHead(inputs.base);
    });
    warnings.push(...inputs.warnings);
    data = {
      project: config.root, outputDirectory: output, complete: false,
      base: { rev: inputs.base.rev, sha: inputs.base.sha }, current: { kind: 'working_tree', head },
      selection: { sources: inputs.sources, frame: options.frame ?? null, themes, scale,
        existingCoverage: !inputs.sources.length ? 'empty' : args.length || options.frame !== undefined || themes.length !== 2 ? 'partial' : 'full' },
      environment: { adg: metadata.version, node: process.version, platform: process.platform, arch: process.arch, chromium: null,
        ...metadata.dependencies, locale: 'en-US', timezone: 'UTC', ...inputs.environment },
      classifierVersion: null, thresholds: null, comparisons: [], support: [], verdict: null, reasons: [],
      summary: { sources: inputs.sources.length, frames: 0, comparisons: 0, supportComparisons: 0,
        added: 0, removed: 0, matched: 0, identical: 0, structural: 0, changed: 0,
        classPixels: Object.fromEntries(classNames.map(name => [name, 0])) },
      differencePalette: { equal: '#00000000', other: '#ff00ff' }, reportPath: null, timings,
    };
    if (inputs.sources.some(source => source.endsWith('.mmd'))) browser = await launchBrowser();
    const built = await timed('buildMs', () => inputs.buildFrames({ browser }));
    for (const warning of inputs.warnings) if (!warnings.includes(warning)) warnings.push(warning);
    data.summary.frames = built.frames.length;
    for (const row of built.frames) data.summary[row.status]++;
    if (!built.frames.length) emptySelection(warnings);
    else browser ??= await launchBrowser();
    if (browser) data.environment.chromium = browser.version();
    const jobs = built.frames.flatMap(row => themes.map(theme => ({ row, theme })));
    const concurrency = Math.min(4, availableParallelism());
    for (let start = 0; start < jobs.length; start += concurrency) {
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
        openPairs.push(...await phase('captureMs', batch, job => capturePair(browser, job.row, job.theme, scale)));
        const compared = await phase('compareMs', openPairs, pair => comparePair(browser, pair));
        const rows = await phase('writeMs', compared, pair => writePair(output, pair));
        completed.push(...rows);
      } finally {
        for (const pair of openPairs) {
          try { await cleanup(() => pair.page.close()); }
          catch (error) { failures.push({ index: jobs.length, error }); }
        }
      }
      data.comparisons = completed;
      data.summary.comparisons = completed.length;
      for (const row of completed.slice(data.summary.identical + data.summary.changed)) {
        data.summary[row.verdict]++;
        for (const name of classNames) data.summary.classPixels[name] += row.pixels.classes[name].pixels;
      }
      if (failures.length) {
        failures.sort((a, b) => a.index - b.index);
        for (const item of failures.slice(1)) warnings.push(classifyError(item.error).error);
        throw failures[0].error;
      }
    }
  } catch (error) {
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
    data.verdict = data.summary.changed ? 'changed' : 'identical';
    data.reasons = [...new Set(completed.flatMap(row => row.reasons))];
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
