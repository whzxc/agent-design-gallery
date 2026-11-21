import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { realpath, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { hubProjectURL } from '../hub/project-link.mjs';
import { previewTarget, previewURL } from '../link.mjs';
import { launch, loadFrame } from './browser.mjs';
import { diff } from './diff.mjs';
import { installFramePrimitives } from './frame-primitives.mjs';
import { impactRowKey, withImpacted } from './impact-selection.mjs';
import { readGroups, relative } from './project.mjs';
import { reviewDocument } from './review-document.mjs';
import { observeFrame } from './review-observation.mjs';
import { renderReviewSheet } from './review-sheet.mjs';
import { compileSpecimens } from './review-specimens.mjs';
import { resolveThemes } from './theme.mjs';

const identity = ({ source, frame }) => JSON.stringify([source, frame]);
const abbreviations = { adg: 'ADG', ai: 'AI', api: 'API', hpc: 'HPC', html: 'HTML', llm: 'LLM', macos: 'macOS', mcp: 'MCP', pdf: 'PDF', scnet: 'SCNet', ui: 'UI' };

function readable(value, titleCase = false) {
  return value.split(/[-_]+/).map((part, index) => abbreviations[part.toLowerCase()] ?? (index === 0 || titleCase
    ? part.charAt(0).toUpperCase() + part.slice(1) : part)).join(' ');
}

function sourceLocator(config, viewer) {
  const design = path.relative(config.root, config.design).split(path.sep).join('/');
  const chapters = new Map();
  for (const { title, assets } of readGroups(config.design, config.sources)) for (const asset of assets) {
    if (!chapters.has(asset)) chapters.set(asset, title);
  }
  return ({ source, frame }, removed = false) => {
    const architecture = source.endsWith('.mmd');
    const asset = architecture ? source : path.posix.relative(design, source);
    const parts = asset.split('/'), layer = architecture ? 'arch' : parts[0];
    const filename = parts.at(-1);
    const title = filename === 'index.tsx' ? parts.at(-2) : filename.replace(/\.(tsx|svg|mmd)$/, '');
    const target = !removed ? { asset, frame } : existsSync(path.join(config.root, source)) ? { asset } : { layer };
    return { layer: architecture ? 'Architecture' : readable(layer, true), chapter: chapters.get(asset), title: readable(title, true),
      frame: readable(frame), href: viewer ? previewURL(viewer.href, previewTarget(target)).href : null };
  };
}

async function observeUnchanged(session, theme) {
  const key = row => impactRowKey(row, theme);
  const candidates = session.chosen.filter(row => row.status === 'matched' && session.scheduled(row, theme) &&
    row.source.endsWith('.tsx') && !session.assessments.get(key(row))?.unassessedReasons?.length);
  const skipped = new Set();
  if (!candidates.length) return skipped;
  const browser = await launch();
  try {
    const parents = new Set(session.chosen.filter(row => row.status === 'added' && row.after.parent).map(row => key(row.after.parent)));
    const prepared = await session.diffInputs.buildFrames({ browser, deferParts: true });
    const eligible = new Set(candidates.map(key));
    const frames = prepared.frames.filter(row => eligible.has(key(row)) && !parents.has(key(row)));
    const context = await browser.newContext({ deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC' });
    const pages = await Promise.all(Array.from({ length: Math.min(4, availableParallelism(), frames.length) }, () => context.newPage()));
    let index = 0;
    await Promise.all(pages.map(async page => {
      async function read(frame) {
        await loadFrame(page, frame, theme);
        await page.evaluate(installFramePrimitives);
        return page.evaluate(observeFrame);
      }
      while (index < frames.length) {
        const row = frames[index++];
        try {
          const before = await read(row.before);
          if (before.uncertain.length) continue;
          const after = await read(row.after);
          if (!after.uncertain.length && JSON.stringify(before) === JSON.stringify(after)) skipped.add(key(row));
        } catch (error) {
          if (!browser.isConnected()) throw error;
          // Unobserved frames remain eligible for pixel comparison.
        }
      }
    }));
    return skipped;
  } finally {
    await browser.close();
  }
}

function buildHtmlReview(model, data, built, theme, locate) {
  const { compileFrame, assets } = compileSpecimens({ built, theme });
  const comparisons = new Map(data.comparisons.filter(row => row.theme === theme).map(row => [identity(row), row]));
  const cards = [...model.sections.added, ...model.sections.changed].map((entry, index) => {
    const row = comparisons.get(identity(entry));
    const changed = entry.status === 'changed';
    const before = changed ? compileFrame(row.before, row.beforeSize, 'before') : null;
    const after = compileFrame(row.after, row.afterSize, 'after');
    const difference = changed ? entry.themes.find(item => item.theme === theme)?.images.difference : null;
    return { index, source: entry.source, frame: entry.frame, status: entry.status, change: entry.change, origin: locate(entry),
      previousOrigin: entry.previousSource && locate(row.before), before, after, difference, differentPixels: row.pixels?.differentPixels };
  });
  const report = { title: model.label, theme, base: model.base.sha, head: model.current.head, counts: model.counts, cards,
    groups: data.review.groups, removed: model.sections.removed.map(entry => ({ ...entry, origin: locate(entry, true) })),
    moved: model.movePairs.map(({ before, after }) => ({ before: locate(before, true), after: locate(after) })), failures: model.failures };
  return reviewDocument(report, assets());
}

/** Generate a standalone, single-theme review without starting a viewer. */
export async function review(config, values, { log = console.log } = {}) {
  const started = performance.now();
  const format = values.format ?? 'html';
  const [theme] = resolveThemes(values.theme ?? 'system');
  const destination = path.resolve(config.root, values.out ?? path.join(config.output, `review.${format}`));
  let locate;
  if (format === 'html') {
    const projectURL = values['viewer-url'] ?? await hubProjectURL(config.root);
    const viewer = projectURL ? previewURL(projectURL, previewTarget({})) : null;
    if (viewer) viewer.search = '';
    locate = sourceLocator(config, viewer);
  }
  const options = { base: values.base, theme, impacted: true, json: true };
  let model, built, skipped, baseConfig;
  const { data, warnings } = await withImpacted(config, [], options, 'diff', async session => {
    skipped = values.exact ? new Set() : await observeUnchanged(session, theme);
    const scheduled = session.scheduled;
    if (format === 'html') {
      const buildFrames = session.diffInputs.buildFrames;
      session.diffInputs.buildFrames = async options => (built = await buildFrames(options));
    }
    baseConfig = session.diffInputs.before.config;
    session.scheduled = (row, theme) => scheduled(row, theme) && !skipped.has(impactRowKey(row, theme));
    try {
      return await diff(config, [], options, { session, reviewFormat: format, onReview: value => { model = value; } });
    } catch (error) {
      if (error.code !== 'DIFF_FAILED' && !error.partialSourceFailures) throw error;
      return { data: error.data, warnings: error.warnings };
    } finally {
      session.scheduled = scheduled;
    }
  });

  const temporary = `${destination}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(destination), { recursive: true });
  let bytes;
  try {
    if (format === 'png') {
      const browser = await launch();
      try {
        const designDirs = { before: relative(baseConfig, baseConfig.design), after: relative(config, config.design) };
        await renderReviewSheet(browser, model, theme, temporary, data.comparisons, designDirs);
      } finally {
        await browser.close();
      }
    } else {
      await writeFile(temporary, buildHtmlReview(model, data, built, theme, locate));
    }
    ({ size: bytes } = await stat(temporary));
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  const result = { path: destination, format, base: model.base, current: model.current, theme, counts: model.counts, groups: data.review.groups,
    mode: values.exact ? 'exact' : 'hybrid', structureMatches: skipped.size, pixelComparisons: data.summary.comparisons,
    complete: model.complete, failures: model.failures, bytes, generationMs: performance.now() - started };
  if (!values.json) log(`${destination}\n${result.counts.added} added, ${result.counts.changed} changed, ${result.counts.removed} removed, ${result.counts.moved} moved.`);
  if (!result.complete) throw new CliError('SOURCE_BUILD_FAILED', 'Review contains source build failures.', { data: result, warnings });
  return { data: result, warnings };
}

// Project the same two-theme visual verdicts into rows before generating any report or image assets.
export async function reviewFrameChanges(config, options) {
  const values = { ...options, theme: 'both', impacted: true, json: true };
  let model;
  const dependencies = new Map(), chapters = {};
  const { data } = await withImpacted(config, [], values, 'diff', async session => {
    const scheduled = session.scheduled;
    const skipped = new Set();
    for (const theme of session.themes)
      for (const key of await observeUnchanged(session, theme)) skipped.add(key);
    session.scheduled = (row, theme) => scheduled(row, theme) && !skipped.has(impactRowKey(row, theme));
    const resolvedFiles = new Set();
    for (const view of session.views) {
      const prefix = relative(view.config,view.config.design);
      chapters[view.side] = new Map();
      for (const group of readGroups(view.config.design,view.config.sources))
        for (const name of group.assets) chapters[view.side].set(path.posix.join(prefix,name),group.title);
      for (const built of view.built.values()) {
        for (const [name, hash] of Object.entries(built.dependencyHashes ?? {})) {
          const file = path.resolve(view.config.design, name);
          if (resolvedFiles.has(file)) continue;
          resolvedFiles.add(file);
          if (!file.startsWith(options.temporaryDirectory + path.sep) || file.includes(path.sep + 'node_modules' + path.sep)) {
            const physical = await realpath(file).catch(() => file);
            if (!physical.startsWith(options.temporaryDirectory + path.sep)) dependencies.set(physical, hash);
          }
        }
      }
    }
    try {
      return await diff(session.diffInputs.after.config, [], values, {
        session, reviewFormat: 'rows', onReview: value => { model = value; }
      });
    } catch (error) {
      if (error.code !== 'DIFF_FAILED' && !error.partialSourceFailures) throw error;
      return { data: error.data, warnings: error.warnings ?? [] };
    }
  });
  const rows = Object.values(model.sections).flat().map(({source,frame,status,change,previousSource}) => {
    const former = previousSource && data.comparisons.find(c => c.source === source && c.frame === frame)?.before;
    return { source,frame,status, ...(former ? {former} : {}), ...(change?.kind === 'inherited' ? {causes:change.causes} : {}) };
  });
  for (const {before,after} of model.movePairs) rows.push({...after,status:'moved',former:before});
  for (const row of rows) {
    const chapter = chapters[row.status === 'removed' ? 'before' : 'after'].get(row.source);
    if (chapter) row.chapter = chapter;
  }
  return { rows, complete:model.complete, failures:model.failures, dependencies:[...dependencies] };
}
