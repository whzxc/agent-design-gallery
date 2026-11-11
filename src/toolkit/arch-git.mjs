import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { CliError } from '../cli-output.mjs';
const exec = promisify(execFile);
async function physicalPath(file) {
  try { return await realpath(file); }
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    // Deleted sources still resolve through their closest existing ancestor.
    return path.join(await physicalPath(path.dirname(file)),path.basename(file));
  }
}
async function git(root, args) {
  try { return (await exec('git',['-C',root,...args],{maxBuffer:16*1024*1024})).stdout; }
  catch(error) {
    if(error.code==='ENOENT')throw new CliError('GIT_UNAVAILABLE', 'Git is unavailable; install Git and retry --base.', { cause: error });
    throw new CliError('GIT_BASE_INVALID', error.message, { cause: error, context: { project: root, gitCause: 'read' } });
  }
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
