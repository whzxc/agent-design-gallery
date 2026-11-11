import { mkdir, readFile, writeFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig, VERSION } from '../toolkit/config.mjs';

// Shared instance discovery does not load or start the resident hub.
const defaultStateDirectory = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'agent-design-gallery');
const exec = promisify(execFile);
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const validPort = port => Number.isInteger(port) && port > 0 && port <= 65535;
const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
};
async function git(directory, args) {
  try { return (await exec('git', ['-C', directory, ...args], { maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch { return null; }
}

export async function registerInstance({ directory, port, stateDirectory = defaultStateDirectory, id = randomUUID() }) {
  if (!validId(id)) throw new Error('Instance id must contain only letters, numbers, underscores or hyphens.');
  if (!validPort(port)) throw new Error('Instance port must be an integer from 1 to 65535.');
  directory = await realpath(directory);
  const config = await loadConfig(directory, { checkVersion: false });
  const [branch, gitRoot] = await Promise.all([
    git(directory, ['symbolic-ref', '--short', 'HEAD']), git(directory, ['rev-parse', '--show-toplevel']),
  ]);
  const worktree = !!gitRoot && !!(await stat(path.join(gitRoot, '.git')).catch(() => null))?.isFile();
  const record = { id, pid: process.pid, port, directory, name: config.name, branch, worktree,
    startedAt: new Date().toISOString(), version: VERSION };
  const folder = path.join(stateDirectory, 'instances'), destination = path.join(folder, `${id}.json`);
  await mkdir(folder, { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(record, null, 2) + '\n');
  await rename(temporary, destination);
  return { record, file: destination, remove: () => rm(destination, { force: true }) };
}

async function inspectInstance(file) {
  let record;
  try { record = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) { await rm(file, { force: true }); return null; }
    throw error;
  }
  if (!record || !validId(record.id) || `${record.id}.json` !== path.basename(file) || !validPort(record.port) ||
      !Number.isInteger(record.pid) || record.pid <= 0 || !alive(record.pid)) {
    await rm(file, { force: true });
    return null;
  }
  let health;
  const unavailable = reason => ({ ...record, proxyable: false, stoppable: false, url: null, reason });
  try {
    const response = await fetch(`http://127.0.0.1:${record.port}/api/health`, { signal: AbortSignal.timeout(750), redirect: 'error' });
    if (!response.ok) return unavailable('health-unavailable');
    health = await response.json();
  } catch { return unavailable('health-unavailable'); }
  if (typeof health?.id !== 'string') return unavailable('health-contract-missing');
  if (health.id !== record.id) {
    await rm(file, { force: true });
    return null;
  }
  const proxyable = health.capabilities?.keyAuth === 1;
  return { ...record, proxyable, stoppable: proxyable && record.pid !== process.pid,
    url: proxyable ? `/i/${record.id}/` : null,
    ...(!proxyable ? { reason: 'proxy-auth-unsupported' } : {}) };
}

export async function listInstances(stateDirectory = defaultStateDirectory) {
  const folder = path.join(stateDirectory, 'instances');
  let entries;
  try { entries = await readdir(folder, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const instances = await Promise.all(entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => inspectInstance(path.join(folder, entry.name))));
  return instances.filter(Boolean).sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)) || a.id.localeCompare(b.id));
}

export async function stopInstance(id, stateDirectory = defaultStateDirectory) {
  if (!validId(id)) return 404;
  const file = path.join(stateDirectory, 'instances', `${id}.json`);
  const record = await inspectInstance(file);
  if (!record) return 404;
  if (!record.stoppable) return 409;
  try { process.kill(record.pid, 'SIGTERM'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  const deadline = Date.now() + 5000;
  while (alive(record.pid)) {
    if (Date.now() >= deadline) return 503;
    await delay(50);
  }
  await rm(file, { force: true });
  return 200;
}
