import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { indexDigest } from './index-store.mjs';
import { CliError } from '../cli-output.mjs';
import { loadFrame, browserTask, readyResources } from './browser.mjs';
import { frameDocument } from './frame-document.mjs';
import { collectOwnerObservation, installFramePrimitives } from './frame-observation.mjs';
import { elementIdentities } from './frame-identity.mjs';
export { collectOwnerObservation } from './frame-observation.mjs';
import { installColorResolver } from './owner-colors.mjs';

export const normalizeOwnerText = text => text.normalize('NFC').replace(/\p{White_Space}+/gu, ' ').trim();
const contexts = new WeakMap();
const preparedPages = new WeakSet();

export function occurrenceContext(observation, occurrence) {
  if (!contexts.has(observation)) contexts.set(observation, new Map(observation.nodes.map(node => [node.path, node])));
  const byPath = contexts.get(observation);
  const path = occurrence.ownerPath ?? occurrence.path?.replace(/::(?:before|after)$|\/text-\d+$/g, '');
  let node = byPath.get(path), distance = 0; const ancestors = [], owners = [];
  while (node) {
    ancestors.push(node.path);
    if (!owners.length && node.owners?.length) owners.push(...node.owners.map(owner => ({ ...owner, distance })));
    node = byPath.get(node.parentPath); distance++;
  }
  return { ...occurrence, ...(byPath.get(path)?.elementId ? {elementId:byPath.get(path).elementId} : {}), ancestors: occurrence.ancestors ?? ancestors, owners: occurrence.owners ?? owners, box: occurrence.box ?? byPath.get(path)?.box, distance: owners[0]?.distance ?? distance };
}

export async function observeOwnerFrame(index, source, built, frame, theme, environment, getPage, tokens) {
  const observed=await index.observation(source, built, frame, theme, environment, async () => {
    const page = await getPage();
    const rendered = { ...frame, document: value => frameDocument(frame,value,built.css) };
    await loadFrame(page, rendered, theme);
    return browserTask(page.context().browser(), async () => {
      await page.evaluate(readyResources);
      if (!preparedPages.has(page)) {
        await page.evaluate(installColorResolver); await page.evaluate(installFramePrimitives);
        preparedPages.add(page);
      }
      const observation=await settleOwnerObservation(() => page.evaluate(collectOwnerObservation, { tokens, theme }), () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve))));
      if(observation.identities){
        const ids=new Map(elementIdentities(observation.identities,{source,frame:frame.name},{metadata:false}).map(n=>[n.path,n]));
        for(const node of observation.nodes){node.elementId=ids.get(node.path).id;}
        delete observation.identities;
      }
      return observation;
    });
  });
  // A rich shared hit retains raw identity inputs for inspect; owner projects the same addresses.
  if(observed.identities){const ids=new Map(elementIdentities(observed.identities,{source,frame:frame.name},{metadata:false}).map(n=>[n.path,n.id]));for(const node of observed.nodes)node.elementId=ids.get(node.path);}
  return observed;
}

export function collectOwnerPalette({ tokens }) {
  return tokens.map(token => {
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(token.name).trim() || null;
    return { name: token.name, resolved, rgba: resolved && !/\b(?:currentcolor|inherit|initial|unset|revert(?:-layer)?)\b/i.test(resolved) ? globalThis.__adgOwnerColor(resolved) : null };
  });
}

export async function observeOwnerPalette(index, tokens, theme, environment, getPage, tokenSource) {
  return index.palette(tokens, theme, environment, async () => {
    const page = await getPage();
    return browserTask(page.context().browser(), async () => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${tokenSource.replace(/<\/style/gi, '<\\/style')}</style></head><body></body></html>`);
      await page.evaluate(installColorResolver);
      return page.evaluate(collectOwnerPalette, { tokens });
    });
  });
}

/** Font inventory plus platform/browser identity; computed once per finite query. */
export async function observationEnvironment() {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (cause) { throw new CliError('PLAYWRIGHT_UNAVAILABLE', 'Restore the packaged Playwright dependency before observing frames.', { cause }); }
  const roots = process.platform === 'darwin' ? ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library/Fonts')]
    : process.platform === 'win32' ? [path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'Microsoft/Windows/Fonts')]
    : ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.local/share/fonts'), path.join(os.homedir(), '.fonts')];
  const files = [], seen = new Set();
  async function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    try {
      const info = await stat(file);
      if (info.isDirectory()) for (const name of await readdir(file)) await visit(path.join(file, name));
      else files.push([file, info.size, info.mtimeMs, info.ctimeMs]);
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
  }
  try { for (const root of roots) await visit(root); await visit(chromium.executablePath()); }
  catch (error) { if (['EACCES', 'EPERM'].includes(error.code)) return null; throw error; }
  return indexDigest(JSON.stringify({ platform: process.platform, release: os.release(), arch: process.arch, locale: 'en-US', timezone: 'UTC', deviceScaleFactor: 1, files: files.sort() }));
}


export async function settleOwnerObservation(read, wait, now = () => performance.now()) {
  const start = now(); let previous = JSON.stringify(await read());
  while (true) {
    await wait(); const value = await read(), current = JSON.stringify(value);
    if (current === previous) return value;
    if (now() - start >= 5000) throw new CliError('OWNER_UNSETTLED', 'Ownership observations did not settle within five seconds.');
    previous = current;
  }
}
