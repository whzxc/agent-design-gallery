import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { realpath, mkdtemp, mkdir, open, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { CliError, asCliError } from '../cli-output.mjs';
import { cleanup } from './results.mjs';
const exec = promisify(execFile);

export function revisionValue(value, directory, root) {
  if (typeof value === 'string') return value.replaceAll(pathToFileURL(directory).href, pathToFileURL(root).href).replaceAll(directory, root);
  if (Array.isArray(value)) return value.map(item => revisionValue(item, directory, root));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, revisionValue(item, directory, root)]));
  return value;
}

export function revisionError(error, directory, base) {
  const failure = asCliError(error);
  failure.message = `Base ${base.sha.slice(0, 7)}: ${revisionValue(failure.message, directory, base.root)}`;
  failure.context = revisionValue(failure.context, directory, base.root);
  failure.warnings = revisionValue(failure.warnings, directory, base.root);
  failure.data = null;
  return failure;
}
async function physicalPath(file) {
  try { return await realpath(file); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    // Deleted sources still resolve through their closest existing ancestor.
    return path.join(await physicalPath(path.dirname(file)),path.basename(file));
  }
}
async function git(root, args) {
  try {
    const task = exec('git', ['-C', root, ...args], { maxBuffer: 16 * 1024 * 1024 });
    task.child.stdin.end();
    return (await task).stdout;
  }
  catch(error) {
    if(error.code==='ENOENT')throw new CliError('GIT_UNAVAILABLE', 'Git is unavailable; install Git and retry --base.', { cause: error });
    throw new CliError('GIT_BASE_INVALID', error.message, { cause: error, context: { project: root, gitCause: 'read' } });
  }
}

async function writeBaseBlobs(base, directory, entries) {
  const child = spawn('git', ['-C', base.root, 'cat-file', '--batch']);
  let stderr = '', spawnError;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', text => { stderr = (stderr + text).slice(-16384); });
  child.stdin.on('error', () => {});
  const done = new Promise((resolve, reject) => {
    child.once('error', error => { spawnError = error; reject(error); });
    child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr || `Git cat-file exited ${code}.`)));
  });
  done.catch(() => {});
  const chunks = child.stdout[Symbol.asyncIterator]();
  let pending = Buffer.alloc(0);
  const refill = async () => {
    const next = await chunks.next();
    if (next.done) throw new Error(stderr || 'Git blob stream ended early.');
    pending = next.value;
  };
  try {
    for (const entry of entries) {
      if (entry.type !== 'blob') continue;
      const target = path.join(directory, entry.name);
      await mkdir(path.dirname(target), { recursive: true });
      child.stdin.write(`${entry.blob}\n`);
      let header = '';
      for (;;) {
        if (!pending.length) await refill();
        const end = pending.indexOf(10);
        if (end >= 0) {
          header += pending.subarray(0, end).toString('ascii');
          pending = pending.subarray(end + 1);
          break;
        }
        header += pending.toString('ascii'); pending = Buffer.alloc(0);
      }
      const [id, type, length] = header.split(' ');
      if (id !== entry.blob || type !== 'blob' || !/^\d+$/.test(length)) throw new Error(`Cannot read Git blob ${entry.blob}.`);
      const linkChunks = [];
      const file = entry.mode === '120000' ? null : await open(target, 'w', entry.mode === '100755' ? 0o755 : 0o644);
      try {
        let remaining = Number(length);
        while (remaining > 0) {
          if (!pending.length) await refill();
          const count = Math.min(remaining, pending.length), bytes = pending.subarray(0, count);
          if (file) await file.writeFile(bytes);
          else linkChunks.push(bytes);
          pending = pending.subarray(count); remaining -= count;
        }
      } finally { await file?.close(); }
      if (!pending.length) await refill();
      if (pending[0] !== 10) throw new Error('Invalid Git blob separator.');
      pending = pending.subarray(1);
      if (!file) {
        const link = Buffer.concat(linkChunks).toString('utf8');
        const relative = path.relative(directory, path.resolve(path.dirname(target), link));
        if (!path.isAbsolute(link) && relative !== '..' && !relative.startsWith(`..${path.sep}`)) await symlink(link, target);
      }
    }
    child.stdin.end();
    await done;
  } catch (error) {
    if (spawnError?.code === 'ENOENT') throw new CliError('GIT_UNAVAILABLE', 'Git is unavailable; install Git and retry --base.', { cause: spawnError });
    if (error.code) throw error;
    throw new CliError('GIT_BASE_INVALID', error.message, { cause: error, context: { project: base.root, gitCause: 'read' } });
  } finally {
    if (child.exitCode === null) child.kill();
    await done.catch(() => {});
  }
}

/** Materialize tracked bytes without export attributes or a Git worktree. */
export async function materializeBase(base) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'adg-diff-')));
  const close = async () => {
    try { await cleanup(() => rm(directory, { recursive: true, force: true })); }
    catch (error) { throw revisionError(error, directory, base); }
  };
  try {
    const tree = await git(base.root, ['ls-tree', '-r', '-z', base.sha]);
    const entries = tree.split('\0').filter(Boolean).map(entry => {
      const [, mode, type, blob, name] = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
      return { mode, type, blob, name };
    });
    await writeBaseBlobs(base, directory, entries);
    return { directory, close };
  } catch (error) {
    const failure = revisionError(error, directory, base);
    await cleanup(() => rm(directory, { recursive: true, force: true }), failure);
    failure.warnings = revisionValue(failure.warnings, directory, base.root);
    throw failure;
  }
}

export async function currentHead(base) {
  try { return (await git(base.root, ['rev-parse', '--verify', 'HEAD'])).trim(); }
  catch (error) { if (error.code === 'GIT_UNAVAILABLE') throw error; return null; }
}

/** Rename hints include staged and unstaged tracked changes against the base. */
export async function sourceRenames(base) {
  const fields = (await git(base.root, ['diff', '--name-status', '-z', '--find-renames', '--diff-filter=R', base.sha, '--'])).split('\0');
  const renames = [];
  for (let index = 0; index < fields.length - 1; index += 3) {
    renames.push({ before: fields[index + 1], after: fields[index + 2] });
  }
  return renames;
}

/** Actual endpoint changes; working-tree mode includes staged, unstaged and untracked paths. */
export async function revisionChanges(base, head = null) {
  const fields = (await git(base.root, ['diff', '--name-status', '-z', '--find-renames', base.sha, ...(head ? [head.sha] : []), '--'])).split('\0');
  const changes = [];
  for (let i = 0; i < fields.length - 1;) {
    const code = fields[i++], first = fields[i++];
    if (code.startsWith('R') || code.startsWith('C')) {
      const second = fields[i++];
      changes.push(code.startsWith('R') ? { before: first, after: second, status: 'renamed' } : { before: null, after: second, status: 'added' });
    } else changes.push({ before: code === 'A' ? null : first, after: code === 'D' ? null : first,
      status: code === 'A' ? 'added' : code === 'D' ? 'deleted' : code === 'T' ? 'type_changed' : 'modified' });
  }
  if (!head) {
    const names = (await git(base.root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
    for (const name of names) if (!changes.some(change => change.after === name)) changes.push({ before: null, after: name, status: 'added' });
  }
  return changes.sort((a, b) => (a.after ?? a.before) < (b.after ?? b.before) ? -1 : (a.after ?? a.before) > (b.after ?? b.before) ? 1 : 0);
}
export async function resolveBase(config, rev) {
  if(typeof rev!=='string'||!rev.trim())throw new CliError('USAGE_INVALID', 'Set --base to a Git revision, for example HEAD.');
  let root;
  try { root=await realpath((await git(config.root,['rev-parse','--show-toplevel'])).trim()); }
  catch(error) {
    if(error.code==='GIT_UNAVAILABLE')throw error;
    throw new CliError('GIT_BASE_INVALID', 'This project is not in a Git repository; run from a repository or initialize one before using --base.', { cause: error, context: { project: config.root, gitCause: 'repository' } });
  }
  try {
    const sha=(await git(root,['rev-parse','--verify','--end-of-options',`${rev}^{commit}`])).trim();
    return {root,rev,sha};
  } catch(error) {
    if(error.code==='GIT_UNAVAILABLE')throw error;
    throw new CliError('GIT_BASE_INVALID', `Unknown Git revision ${rev}; choose an existing commit or fetch the revision and retry --base.`, { cause: error, context: { project: root, gitCause: 'revision' } });
  }
}
export async function readBase(base, file) {
  const name=path.relative(base.root,await physicalPath(file)).split(path.sep).join('/');
  const entry=await git(base.root,['ls-tree','-z',base.sha,'--',name]);
  if(!entry)return {text:null,blob:null};
  const blob=/^100(?:644|755) blob ([a-f0-9]+)\t/.exec(entry)?.[1];
  if(!blob)return {text:null,blob:null};
  return {blob,text:await git(base.root,['show',`${base.sha}:${name}`])};
}
export async function baseArchFiles(config,base) {
  if(!config.archDirectory)return [];
  const directory=await physicalPath(config.archDirectory);
  const prefix=path.relative(base.root,directory).split(path.sep).join('/');
  return (await git(base.root,['ls-tree','-r','-z',base.sha,'--',prefix])).split('\0')
    .flatMap(entry=>/^100(?:644|755) blob [a-f0-9]+\t(.+\.mmd)$/.exec(entry)?.slice(1)??[])
    .map(name=>path.relative(directory,path.join(base.root,name)))
    .filter(name=>!name.split(path.sep).some(part=>part.startsWith('.')))
    .map(name=>path.join(config.archDirectory,name));
}
