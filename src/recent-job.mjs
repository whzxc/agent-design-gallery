import { fork, execFile } from 'node:child_process';
import { mkdtemp, mkdir, realpath, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

// One request owns the worker and its materializations. Only completed period rows outlive it.
export async function runRecentJob(options, signal) {
  await mkdir(options.directory, { recursive: true });
  const temporaryDirectory = await realpath(await mkdtemp(path.join(options.directory, 'job-')));
  let child, timer;
  try {
    signal.throwIfAborted();
    child = fork(new URL('./recent-worker.mjs', import.meta.url), [], {
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: {
        ...process.env,
        TMPDIR: temporaryDirectory,
        TMP: temporaryDirectory,
        TEMP: temporaryDirectory,
        GIT_OPTIONAL_LOCKS: '0'
      }
    });
    const kill = (force) => {
      if (!child.pid || child.exitCode !== null || child.signalCode) return;
      if (process.platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
      else {
        try {
          process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    };
    const abort = () => {
      kill(false);
      timer = setTimeout(() => kill(true), 1200);
      timer.unref();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', resolve);
        child.send({ ...options, temporaryDirectory });
      });
      signal.throwIfAborted();
      if (code !== 0) throw Error('The history comparison worker stopped before completing.');
      const reply = JSON.parse(await readFile(path.join(temporaryDirectory,'result.json'),'utf8'));
      if (reply.error) throw Error(reply.error);
      return reply.result;
    } finally {
      signal.removeEventListener('abort', abort);
      clearTimeout(timer);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 3 });
  }
}
