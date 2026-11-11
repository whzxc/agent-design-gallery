import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { realpath, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { CliError } from '../cli-output.mjs';
import { cleanup } from './results.mjs';
const exec = promisify(execFile);
async function physicalPath(file) {
  try { return await realpath(file); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    // Deleted sources still resolve through their closest existing ancestor.
    return path.join(await physicalPath(path.dirname(file)),path.basename(file));
  }
}
async function git(root, args, { input, encoding = 'utf8', maxBuffer = 16 * 1024 * 1024 } = {}) {
  try {
    const task = exec('git', ['-C', root, ...args], { encoding, maxBuffer });
    task.child.stdin.end(input);
    return (await task).stdout;
  }
  catch(error) {
    if(error.code==='ENOENT')throw new CliError('GIT_UNAVAILABLE', 'Git is unavailable; install Git and retry --base.', { cause: error });
    throw new CliError('GIT_BASE_INVALID', error.message, { cause: error, context: { project: root, gitCause: 'read' } });
  }
}

/** Materialize tracked bytes without export attributes or a Git worktree. */
export async function materializeBase(base) {
  const directory = await mkdtemp(path.join(tmpdir(), 'adg-diff-'));
  const close = () => cleanup(() => rm(directory, { recursive: true, force: true }));
  try {
    const tree = await git(base.root, ['ls-tree', '-r', '-z', base.sha]);
    const entries = tree.split('\0').filter(Boolean).map(entry => {
      const [, mode, type, blob, name] = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(entry);
      return { mode, type, blob, name };
    });
    const ids = [...new Set(entries.filter(entry => entry.type === 'blob').map(entry => entry.blob))];
    const bytes = await git(base.root, ['cat-file', '--batch'], {
      input: ids.map(id => `${id}\n`).join(''), encoding: 'buffer', maxBuffer: 256 * 1024 * 1024,
    });
    const blobs = new Map();
    let offset = 0;
    for (const id of ids) {
      const end = bytes.indexOf(10, offset);
      const [actual, type, size] = bytes.subarray(offset, end).toString('ascii').split(' ');
      if (actual !== id || type !== 'blob') throw new CliError('GIT_BASE_INVALID', `Cannot read Git blob ${id}.`);
      offset = end + 1;
      blobs.set(id, bytes.subarray(offset, offset + Number(size)));
      offset += Number(size) + 1;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.type === 'commit') continue;
      const content = blobs.get(entry.blob);
      await mkdir(path.dirname(target), { recursive: true });
      if (entry.mode === '120000') {
        const link = content.toString('utf8');
        const resolved = path.resolve(path.dirname(target), link);
        const relative = path.relative(directory, resolved);
        if (path.isAbsolute(link) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
          continue;
        }
        await symlink(link, target);
      } else await writeFile(target, content, { mode: entry.mode === '100755' ? 0o755 : 0o644 });
    }
    return { directory, close };
  } catch (error) {
    await cleanup(() => rm(directory, { recursive: true, force: true }), error);
    throw error;
  }
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
