import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import path from 'node:path';
import { directLocal } from '../http.mjs';
import { defaultStateDirectory } from './registry.mjs';

export async function hubKey(stateDirectory = defaultStateDirectory, { rotate = false } = {}) {
  const file = path.join(stateDirectory, 'hub.key');
  if (!rotate) {
    try {
      const key = (await readFile(file, 'utf8')).trim();
      if (!/^adg_[a-f0-9]{64}$/.test(key)) throw new Error(`Invalid hub key in ${file}; run adg serve --rotate-key.`);
      await chmod(file, 0o600);
      return key;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(stateDirectory, { recursive: true });
  const key = `adg_${randomBytes(32).toString('hex')}`;
  if (rotate) {
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, `${key}\n`, { mode: 0o600 });
    await rename(temporary, file);
  } else {
    try { await writeFile(file, `${key}\n`, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code === 'EEXIST') return hubKey(stateDirectory); throw error; }
  }
  return key;
}
export function equalKey(actual, expected) {
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(typeof actual === 'string' ? actual : ''), digest(expected));
}
export async function authorized(request, url, stateDirectory) {
  if (directLocal(request)) return true;
  const key = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1] ?? request.headers['x-adg-key'] ?? url.searchParams.get('key');
  // Read back on every request so CLI rotation also applies to a running service.
  const expected = (await readFile(path.join(stateDirectory, 'hub.key'), 'utf8')).trim();
  const equal = equalKey(key, expected);
  return /^adg_[a-f0-9]{64}$/.test(expected) && equal;
}
