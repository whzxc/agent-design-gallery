import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, readlink, realpath, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveBase, currentHead } from './toolkit/arch-git.mjs';

const exec = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');

/** Shared by CLI and hub. Hash actual working bytes, including untracked inputs. */
export async function reviewCacheKey(config, rev, theme, stateDirectory = path.join(os.homedir(), '.agent-design-gallery')) {
  const base = await resolveBase(config, rev);
  const project = await realpath(config.root);
  const head = await currentHead(base);
  const git = async args => (await exec('git', ['-C', base.root, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout;
  const names = [...new Set((await git(['diff', '--name-only', '-z', 'HEAD', '--']) + await git(['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean))].sort();
  const fingerprint = createHash('sha256');
  for (const name of names) {
    fingerprint.update(JSON.stringify(name));
    const file = path.join(base.root, name);
    try {
      const info = await lstat(file);
      fingerprint.update(String(info.mode));
      fingerprint.update(info.isSymbolicLink() ? await readlink(file) : await readFile(file));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      fingerprint.update('deleted');
    }
  }
  const identity = { version: 3, project, base: base.sha, head, fingerprint: fingerprint.digest('hex'), theme };
  return { ...identity, directory: path.join(stateDirectory, 'cache', 'reviews', hash(project), hash(JSON.stringify(identity))) };
}

export async function readReviewCache(key) {
  try { return JSON.parse(await readFile(path.join(key.directory, 'review.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeReviewCache(key, review) {
  await mkdir(key.directory, { recursive: true });
  const temporary = path.join(key.directory, `${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(review));
  await rename(temporary, path.join(key.directory, 'review.json'));
}
