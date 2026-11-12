import path from 'node:path';
import { frameDocument } from './frame-document.mjs';
import { tokenReachability } from './token-reachability.mjs';
import { indexDigest } from './index-store.mjs';

export function canonicalBytes(value) {
  const normalize = value => {
    if (typeof value === 'function') return { function: Function.prototype.toString.call(value) };
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    return value;
  };
  return JSON.stringify(normalize(value));
}

/** Resolved design-capture policy; implementation compare hooks are never invoked. */
export function capturePolicy(config) {
  return { initialViewport: { width: 1600, height: 1200 }, reducedMotion: 'reduce',
    locale: 'en-US', timezone: 'UTC', animations: 'disabled', caret: 'hide', diff: config.diff };
}

export function materializedProjection(built, frame, theme, policy, reach = undefined) {
  const documentWithoutTokens = frameDocument(frame, theme, built.cssBeforeTokens + built.cssAfterTokens);
  reach ??= tokenReachability(documentWithoutTokens, built.tokenCss, theme);
  const replacement = reach.mode === 'full_sheet' ? built.tokenCss : canonicalBytes(reach.declarations);
  return { bytes: canonicalBytes({ document: frameDocument(frame, theme, built.cssBeforeTokens + replacement + built.cssAfterTokens),
    structural: { parent: frame.parent ?? null, width: frame.width ?? null, height: frame.height ?? null }, policy }),
  tokenMode: reach.mode };
}

export function architectureConfig(config) {
  return { arch: config.arch ? path.relative(config.root, config.arch).split(path.sep).join('/') : false,
    check: config.check, capture: capturePolicy(config) };
}

export function architectureProjection({ source, sidecar, tokens, config }) {
  // null sidecar and an empty present file are deliberately different inputs.
  const identity = value => value == null ? null : Buffer.from(value).toString('base64');
  return canonicalBytes({ source: identity(source), sidecar: identity(sidecar), tokens: identity(tokens), config: architectureConfig(config) });
}

export function equalProof(before, after, kind, tokenMode, explain) {
  if (before !== after) return null;
  return { kind, version: 1, tokenMode, ...(explain ? { projection: indexDigest(before) } : {}) };
}

/** Compare an exact document as its shared style bytes and remaining document bytes.
 * The fixed builder boundary makes this equivalent to whole-document equality.
 * Keep large style strings out of per-frame JSON serialization. */
export function entryProjection(built, policy) {
  const styles = new Map(), policyBytes = canonicalBytes(policy);
  return (frame, theme, reach) => {
    const replacement = reach.mode === 'full_sheet' ? built.tokenCss : canonicalBytes(reach.declarations);
    if (!styles.has(replacement)) styles.set(replacement, (built.cssBeforeTokens + replacement + built.cssAfterTokens).replace(/<\/style/gi, '<\\/style'));
    return { css: styles.get(replacement), markup: frameDocument(frame, theme, ''),
      metadata: canonicalBytes({ parent: frame.parent ?? null, width: frame.width ?? null, height: frame.height ?? null }),
      policy: policyBytes, tokenMode: reach.mode,
      canonical: () => materializedProjection(built, frame, theme, policy, reach).bytes };
  };
}

export function equalEntryProof(before, after, explain) {
  if (before.css !== after.css || before.markup !== after.markup || before.metadata !== after.metadata || before.policy !== after.policy) return null;
  return { kind: 'materialized_inputs_equal', version: 1,
    tokenMode: before.tokenMode === 'full_sheet' || after.tokenMode === 'full_sheet' ? 'full_sheet' : 'reachable_declarations',
    ...(explain ? { projection: indexDigest(before.canonical()) } : {}) };
}
