import { installFramePrimitives } from './frame-observation.mjs';
import { loadTokens } from './project.mjs';
import { loadFrame, readyResources } from './browser.mjs';
import { collectPartSnapshot, normalizeSnapshot, snapshotFindings, settlePart } from './part-snapshot.mjs';
import { CliError } from '../cli-output.mjs';
import { cleanup } from './results.mjs';

export const frameIdentity = row => JSON.stringify([row.source, row.frame]);
export const comparisonIdentity = (row, theme) => JSON.stringify([row.source, row.frame, theme]);

export function partContext(built, inputs, scale, themes, clock) {
  const parts = built.frames.filter(row => row.parentRow);
  if (!parts.length) return null;
  const targets = new Map();
  for (const row of parts) {
    const key = frameIdentity(row.parentRow), values = targets.get(key) ?? [];
    if (!values.includes(row.after.parent.selector)) values.push(row.after.parent.selector);
    targets.set(key, values);
  }
  const tokens = {};
  for (const [side, config] of [['before', inputs.before.config], ['after', inputs.after.config]]) {
    const parsed = loadTokens(config);
    tokens[side] = Object.fromEntries(themes.map(theme => [theme, [...new Map([...parsed.light, ...(theme === 'dark' ? parsed.dark : [])])].sort(([a], [b]) => a.localeCompare(b))]));
  }
  return { targets, tokens, scale, themes, clock, parents: new Map(), comparisons: new Map(), isolation: new Map() };
}

async function readSnapshot(page, args) {
  await page.evaluate(installFramePrimitives);
  const snapshot = await page.evaluate(collectPartSnapshot, args);
  if (snapshot.referenceError) throw new CliError('DIFF_REFERENCE_INVALID', snapshot.referenceError);
  if (snapshot.unsupported.length) {
    const first = snapshot.unsupported[0];
    throw new CliError('DIFF_SNAPSHOT_UNSUPPORTED', `${first.path}: ${first.property}: ${first.value}`);
  }
  return normalizeSnapshot(snapshot);
}

export async function captureEvidence(page, selectors, row, side, theme, context, capture) {
  const read = () => Promise.all(selectors.map(selector => readSnapshot(page, { selector, tokens: context.tokens[side][theme], scale: context.scale, ref: { source: row.source, frame: row.frame }, theme })));
  const { snapshot, png } = await settlePart(read, capture, {
    now: context.clock?.now,
    wait: context.clock?.wait ?? (() => page.evaluate(() => new Promise(requestAnimationFrame))),
  });
  return { png, targets: new Map(selectors.map((selector, index) => [selector, snapshot[index]])) };
}

export async function capturePart(browser, row, theme, context) {
  const parent = context.parents.get(comparisonIdentity(row.parentRow, theme));
  const selector = row.after.parent.selector;
  const beforeSnapshot = parent.before.targets.get(selector), parentCurrentSnapshot = parent.after.targets.get(selector);
  const page = await browser.newPage({ deviceScaleFactor: context.scale, locale: 'en-US', timezoneId: 'UTC' });
  try {
    await loadFrame(page, row.after, theme);
    await page.evaluate(readyResources);
    const after = await captureEvidence(page, [null], row, 'after', theme, context, () => page.locator('[data-adg-frame]').screenshot({ animations: 'disabled', caret: 'hide' }));
    const afterSnapshot = after.targets.get(null), findings = [
      ...snapshotFindings(beforeSnapshot, afterSnapshot),
      ...snapshotFindings(beforeSnapshot, parentCurrentSnapshot, 'parent'),
    ];
    if (!afterSnapshot.frameAligned) findings.push({ code: 'PART_FRAME_GEOMETRY_CHANGED', kind: 'layout', path: 'part', property: 'frameAlignment', before: true, after: false });
    if (beforeSnapshot.frameClipped || parentCurrentSnapshot.frameClipped) findings.push({ code: 'CLIPPING_CHANGED', kind: 'layout', path: 'parent', property: 'frameClipped', before: beforeSnapshot.frameClipped, after: parentCurrentSnapshot.frameClipped });
    const beforeSize = beforeSnapshot.size;
    const afterSize = { width: afterSnapshot.size.width, height: afterSnapshot.size.height, pixelWidth: after.png.readUInt32BE(16), pixelHeight: after.png.readUInt32BE(20) };
    const currentRaster = new Set(afterSnapshot.rasterMask);
    const edgeBoxes = [beforeSnapshot, afterSnapshot].flatMap(snapshot => snapshot.edgeBoxes.map(box => ({
      x: box.x * context.scale + snapshot.fractionalOrigin.x, y: box.y * context.scale + snapshot.fractionalOrigin.y,
      width: box.width * context.scale, height: box.height * context.scale,
    })));
    const supportRows = context.themes.map(theme => context.comparisons.get(comparisonIdentity(row.parentRow, theme)));
    return { row, theme, page,
      before: { png: parent.before.png, size: beforeSize }, after: { png: after.png, size: afterSize },
      crop: beforeSnapshot.deviceCrop,
      parent: { ref: { source: row.after.parent.source, frame: row.after.parent.frame }, selector,
        cssCrop: beforeSnapshot.cssCrop, deviceCrop: beforeSnapshot.deviceCrop, fractionalOrigin: beforeSnapshot.fractionalOrigin,
        clipping: { before: beforeSnapshot.contextEffects.clipping, current: parentCurrentSnapshot.contextEffects.clipping, after: afterSnapshot.contextEffects.clipping },
        supportIds: supportRows.map(row => row.id) },
      snapshots: { elementEqual: !findings.some(item => item.kind === 'element' || item.kind === 'resource'), layoutEqual: !findings.some(item => item.kind === 'layout'), colorEqual: !findings.some(item => item.kind === 'color'), findings },
      snapshotFiles: { beforeSnapshot, afterSnapshot, parentCurrentSnapshot },
      parentChanged: supportRows.some(row => row.verdict !== 'identical'),
      singleTheme: context.themes.length !== 2,
      evidence: { snapshotsMatch: !findings.length, rasterMask: beforeSnapshot.rasterMask.filter(pixel => currentRaster.has(pixel)), edgeBoxes },
    };
  } catch (error) { await cleanup(() => page.close(), error); throw error; }
}

export async function isolateParent(pair, context) {
  const key = JSON.stringify([frameIdentity(pair.row.parentRow), pair.parent.selector, pair.theme]);
  if (!context.isolation.has(key)) context.isolation.set(key, (async () => {
    const page = pair.page, row = pair.row.parentRow;
    await loadFrame(page, row.before, pair.theme);
    await page.evaluate(readyResources);
    const args = { selector: pair.parent.selector, tokens: context.tokens.before[pair.theme], scale: context.scale, ref: pair.parent.ref, theme: pair.theme };
    const before = await readSnapshot(page, args);
    if (snapshotFindings(pair.snapshotFiles.beforeSnapshot, before).length || JSON.stringify(before.deviceCrop) !== JSON.stringify(pair.crop)) throw new CliError('DIFF_UNSETTLED', 'The parent target changed before isolation.');
    await page.evaluate(selector => {
      const frame = document.querySelector('[data-adg-frame]'), target = frame.querySelector(selector);
      window.__adgIsolation = [...frame.querySelectorAll('*')].filter(node => !target.contains(node) && !node.contains(target)).map(node => [node, node.getAttribute('style')]);
      for (const [node] of window.__adgIsolation) node.style.setProperty('visibility', 'hidden', 'important');
    }, pair.parent.selector);
    let primary;
    try {
      const after = await readSnapshot(page, args);
      if (snapshotFindings(before, after).length) throw new CliError('DIFF_UNSETTLED', 'Isolation changed the target snapshots.');
      const png = await page.locator('[data-adg-frame]').screenshot({ animations: 'disabled', caret: 'hide' });
      const captured = await readSnapshot(page, args);
      if (snapshotFindings(after, captured).length) throw new CliError('DIFF_UNSETTLED', 'The target changed during isolation capture.');
      return png;
    } catch (error) { primary = error; throw error; }
    finally {
      await cleanup(() => page.evaluate(() => {
        for (const [node, style] of window.__adgIsolation) {
          if (style === null) node.removeAttribute('style'); else node.setAttribute('style', style);
        }
        delete window.__adgIsolation;
      }), primary);
    }
  })());
  return context.isolation.get(key);
}
