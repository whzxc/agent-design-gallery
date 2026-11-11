import { readFile, writeFile, mkdir, readdir, realpath, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { configFile, loadConfig, VERSION, requireMigration } from '../toolkit/config.mjs';
import { listSources, archFiles } from '../toolkit/project.mjs';

const exec = promisify(execFile);
export const defaultStateDirectory = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'agent-design-gallery');
const canonical = async directory => realpath(path.resolve(directory.replace(/^~(?=$|[\\/])/, os.homedir())));
export function projectSlug(directory) {
  return path.basename(directory).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';
}
const pathHash = directory => createHash('sha256').update(directory).digest('hex');
function assignSlugs(data, previousRoots) {
  const directories = [...new Set(data.roots.flatMap(root => root.projects.map(project => project.path)))].sort();
  const current = new Set(directories);
  const assigned = new Map(previousRoots.flatMap(root => root.projects)
    .filter(project => current.has(project.path))
    // Upgrade the old always-hashed format on the next explicit scan.
    .filter(project => data.slugVersion === 1 || project.slug !== `${projectSlug(project.path)}-${pathHash(project.path).slice(0, 12)}`)
    .map(project => [project.path, project.slug]));
  const used = new Set(assigned.values());
  const pending = [];
  for (const directory of directories) {
    if (assigned.has(directory)) continue;
    const slug = projectSlug(directory);
    if (used.has(slug)) { pending.push(directory); continue; }
    assigned.set(directory, slug);
    used.add(slug);
  }
  for (const directory of pending) {
    const base = `${projectSlug(directory)}-${projectSlug(path.dirname(directory))}`;
    let slug = base, length = 6;
    while (used.has(slug)) slug = `${base}-${pathHash(directory).slice(0, length++)}`;
    assigned.set(directory, slug);
    used.add(slug);
  }
  for (const root of data.roots) {
    for (const project of root.projects) project.slug = assigned.get(project.path);
  }
  data.slugVersion = 1;
}
async function registry(stateDirectory) {
  try { return JSON.parse(await readFile(path.join(stateDirectory, 'registry.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { roots: [] }; throw new Error(`Cannot read registry: ${error.message}`); }
}
async function save(data, stateDirectory) {
  await mkdir(stateDirectory, { recursive: true });
  const destination = path.join(stateDirectory, 'registry.json'), temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n');
  await rename(temporary, destination);
}
async function scan(root) {
  const projects = [];
  async function visit(directory, depth) {
    if (path.basename(directory).startsWith('.') || path.basename(directory) === 'node_modules') return;
    let entries;
    try {
      if ((await stat(path.join(directory, '.git')).catch(() => null))?.isFile()) return;
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return;
      throw error;
    }
    requireMigration(directory);
    if (configFile(directory)) projects.push({ path: directory });
    if (depth >= root.depth) return;
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      await visit(path.join(directory, entry.name), depth + 1);
    }
  }
  await visit(root.path, 0);
  return { ...root, projects, scannedAt: new Date().toISOString() };
}
export async function addRoot(directory, depth = 2, stateDirectory = defaultStateDirectory) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 3) throw new Error('Depth must be an integer from 0 to 3.');
  const root = await canonical(directory);
  if (!(await stat(root)).isDirectory()) throw new Error(`Not a directory: ${directory}`);
  const data = await registry(stateDirectory), entry = await scan({ path: root, depth });
  const previousRoots = data.roots;
  data.roots = [...data.roots.filter(item => item.path !== root), entry].sort((a, b) => a.path.localeCompare(b.path));
  assignSlugs(data, previousRoots);
  await save(data, stateDirectory);
  return listRoots(stateDirectory);
}
export async function removeRoot(directory, stateDirectory = defaultStateDirectory) {
  const root = await canonical(directory).catch(error => {
    if (error.code === 'ENOENT') return path.resolve(directory.replace(/^~(?=$|[\\/])/, os.homedir()));
    throw error;
  });
  const data = await registry(stateDirectory);
  if (!data.roots.some(item => item.path === root)) throw new Error(`Root is not registered: ${directory}`);
  data.roots = data.roots.filter(item => item.path !== root);
  await save(data, stateDirectory);
  return listRoots(stateDirectory);
}
export async function listRoots(stateDirectory = defaultStateDirectory) {
  return (await registry(stateDirectory)).roots.map(({ projects, ...root }) => ({ ...root, projectCount: projects.length }));
}
export async function scanRoots(directory, stateDirectory = defaultStateDirectory) {
  const data = await registry(stateDirectory), selected = directory === undefined ? null : await canonical(directory);
  if (selected && !data.roots.some(root => root.path === selected)) throw new Error(`Root is not registered: ${directory}`);
  const previousRoots = [...data.roots];
  for (let index = 0; index < data.roots.length; index++) {
    if (!selected || data.roots[index].path === selected) data.roots[index] = await scan(data.roots[index]);
  }
  assignSlugs(data, previousRoots);
  await save(data, stateDirectory);
  return listRoots(stateDirectory);
}
const git = async (directory, args) => {
  try { return (await exec('git', ['-C', directory, ...args], { maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch { return null; }
};
export async function projectMetadata(record) {
  const base = { ...record, name: path.basename(record.path), design: null, branch: null, head: null,
    lastDesignChange: { committedAt: null, dirty: false }, sourceCount: null, frameCount: null,
    compatibility: { version: VERSION, requires: null, compatible: null } };
  try {
    requireMigration(record.path);
    if (!configFile(record.path)) throw new Error('Project config is missing; rescan registered roots.');
    const config = await loadConfig(record.path, { checkVersion: false });
    const relative = path.relative(record.path, config.design) || '.';
    const [branch, head, committedAt, dirty] = await Promise.all([
      git(record.path, ['symbolic-ref', '--short', 'HEAD']), git(record.path, ['rev-parse', '--short', 'HEAD']),
      git(record.path, ['log', '-1', '--format=%cI', '--', relative]), git(record.path, ['status', '--porcelain', '--untracked-files=all', '--', relative]),
    ]);
    return { ...base, name: config.name, design: config.design, branch, head,
      lastDesignChange: { committedAt: committedAt || null, dirty: !!dirty }, sourceCount: listSources(config.design, config.sources).length + archFiles(config.arch).length,
      compatibility: { version: VERSION, requires: config.requires, compatible: config.compatible } };
  } catch (error) { return { ...base, error: error.message }; }
}
export async function listProjects(stateDirectory = defaultStateDirectory) {
  const records = (await registry(stateDirectory)).roots.flatMap(root => root.projects);
  const unique = [...new Map(records.map(project => [project.path, project])).values()].sort((a, b) => a.path.localeCompare(b.path));
  return Promise.all(unique.map(projectMetadata));
}
