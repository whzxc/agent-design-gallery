import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { defaultStateDirectory, registeredProject } from './registry.mjs';

const hubFile = stateDirectory => path.join(stateDirectory, 'hub.json');

export function hubPublicOrigin(value, setting = 'ADG_PUBLIC_ORIGIN') {
  if (value === undefined) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
        url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {}
  throw new CliError('USAGE_INVALID', `Set ${setting} to an HTTP(S) origin, for example https://design.example.com.`);
}

export async function publishHubAddress(stateDirectory, address) {
  const file = hubFile(stateDirectory);
  const temporary = `${file}.${address.id}.tmp`;
  await writeFile(temporary, JSON.stringify(address) + '\n');
  await rename(temporary, file);
}

export async function hubProjectLocation(root, stateDirectory = defaultStateDirectory) {
  let hub;
  try { hub = JSON.parse(await readFile(hubFile(stateDirectory), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
  if (!hub || !Number.isInteger(hub.port) || hub.port < 1 || hub.port > 65535 || typeof hub.id !== 'string') return null;
  const project = await registeredProject(root, stateDirectory);
  if (!project?.slug) return null;
  const localOrigin = `http://127.0.0.1:${hub.port}`;
  try {
    const response = await fetch(localOrigin + '/api/health', { signal: AbortSignal.timeout(750), redirect: 'error' });
    if (!response.ok || (await response.json()).id !== hub.id) return null;
  } catch { return null; }
  const pathname = `/p/${project.slug}/`;
  return {
    slug: project.slug,
    local: new URL(pathname, localOrigin).href,
    url: new URL(pathname, hub.publicOrigin ?? localOrigin).href,
  };
}

export async function hubProjectURL(root, stateDirectory = defaultStateDirectory) {
  return (await hubProjectLocation(root, stateDirectory))?.url ?? null;
}

export function hubReviewURL(location, filePath, outputDirectory) {
  if (!location || !filePath || !outputDirectory) return null;
  const resolved = path.resolve(filePath);
  const outputRoot = path.resolve(outputDirectory);
  if (path.dirname(resolved) !== outputRoot) return null;
  const base = path.basename(resolved);
  if (base === 'review.html' || base === 'review-embed.html') return new URL(base, location.local).href;
  if (/^[A-Za-z0-9._-]+\.html$/i.test(base) && !base.includes('..')) return new URL(`review/${base}`, location.local).href;
  return null;
}
