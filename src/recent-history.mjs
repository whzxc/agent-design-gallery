import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { lstat, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { revisionChanges } from './toolkit/arch-git.mjs';

const exec = promisify(execFile);
const git = async (root, ...args) =>
  (await exec('git', ['--no-optional-locks', '-C', root, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout;
export async function visitRevision(root) {
  let head;
  try {
    head = (await git(root, 'rev-parse', '--verify', 'HEAD')).trim();
  } catch (error) {
    if (error.code !== 128) throw error;
    try {
      await git(root, 'rev-parse', '--show-toplevel');
      return { head: null, branch: (await git(root, 'symbolic-ref', '--short', 'HEAD')).trim() };
    } catch {
      return { head: null, branch: null };
    }
  }
  const branch = (await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
  return { head, branch };
}

export async function emptyTree(root) {
  // The empty tree is addressable without creating objects, including before the first commit.
  const child = exec('git', ['-C', root, 'hash-object', '-t', 'tree', '--stdin']);
  child.child.stdin.end();
  return (await child).stdout.trim();
}

export async function dirtyGeneration(root, head, output) {
  const repository = await realpath((await git(root, 'rev-parse', '--show-toplevel')).trim());
  const changes = (await revisionChanges({ root: repository, sha: head ?? (await emptyTree(root)) })).filter((c) =>
    [c.before, c.after].filter(Boolean).some((n) => {
      const file = path.resolve(repository, n);
      return !(file === output || file.startsWith(output + path.sep) || n.split('/').includes('.adg'));
    })
  );
  const hash = createHash('sha256').update(JSON.stringify(changes));
  for (const { after } of changes) {
    if (!after) continue;
    const file = path.join(repository, after);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) hash.update(await readlink(file));
    else if (stat.isFile()) {
      const content = createHash('sha256');
      for await (const bytes of createReadStream(file)) content.update(bytes);
      hash.update(content.digest());
    } else hash.update(String(stat.mtimeMs));
  }
  return { repository, count: changes.length, generation: hash.digest('hex') };
}

export async function historyPeriods(root, head, { day, week, since }) {
  let notice = null;
  if (since) {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(since)) throw Error('Invalid visit revision.');
    try {
      await git(root, 'merge-base', '--is-ancestor', since, head);
    } catch {
      notice = 'History changed since your last visit. Showing this week.';
      since = null;
    }
  }
  const raw = await git(
    root,
    'log',
    '--first-parent',
    '--format=%H%x00%P%x00%ct%x00%s',
    '-z',
    ...(since ? [since + '..' + head] : ['--since-as-filter=@' + Math.floor(week / 1000), head]),
    '--'
  );
  const fields = raw.split('\0'),
    periods = [];
  for (let i = 0; i + 3 < fields.length; i += 4) {
    const [sha, parents, time, subject] = fields.slice(i, i + 4);
    const ms = Number(time) * 1000;
    const title = ms >= day ? 'Today' : ms >= week ? 'Earlier this week' : 'Earlier';
    let period = periods.at(-1);
    if (period?.title !== title) {
      period = { title, head: sha, subjects: [] };
      periods.push(period);
    }
    period.base = parents.split(' ')[0] || null;
    period.subjects.push(subject);
  }
  if (since && periods.length) periods.at(-1).base = since;
  return { periods, notice };
}
