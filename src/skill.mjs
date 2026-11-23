import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './cli-output.mjs';

export const skillTargets = Object.freeze({
  codex: ['.codex', 'skills'],
  'claude-code': ['.claude', 'skills'],
  antigravity: ['.gemini', 'config', 'skills'],
  cursor: ['.cursor', 'skills'],
  agents: ['.agents', 'skills'],
});

export const defaultSkillsRoot = fileURLToPath(new URL('../skills', import.meta.url));

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { name: null, description: '' };
  const fields = {};
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (entry) {
      current = entry[1];
      const raw = entry[2].trim();
      fields[current] = raw === '>' || raw === '|-' || raw === '>-' || raw === '|' ? '' : raw.replace(/^['"]|['"]$/g, '');
    } else if (current && /^\s+/.test(line)) {
      const text = line.trim();
      if (text) fields[current] = fields[current] ? `${fields[current]} ${text}` : text;
    }
  }
  return { name: fields.name || null, description: fields.description || '' };
}

export function listBundledSkills({ skillsRoot = defaultSkillsRoot } = {}) {
  if (!existsSync(skillsRoot)) {
    throw new CliError('IO_FAILED', `Bundled skills directory not found at ${skillsRoot}.`);
  }
  const entries = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
  const skills = [];
  for (const name of entries) {
    const directory = path.join(skillsRoot, name);
    const skillPath = path.join(directory, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    const { description } = parseFrontmatter(readFileSync(skillPath, 'utf8'));
    skills.push({ name, description, directory, path: skillPath });
  }
  return skills;
}

function selectSkills(skills, names) {
  if (!names.length) return skills;
  const byName = new Map(skills.map(skill => [skill.name, skill]));
  const available = skills.map(skill => skill.name).join(', ');
  const selected = [];
  const seen = new Set();
  for (const name of names) {
    if (!byName.has(name)) {
      throw new CliError('USAGE_INVALID', `Unknown ADG skill "${name}". Available skills: ${available}.`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      selected.push(byName.get(name));
    }
  }
  return selected;
}

function resolveHome(homeDir) {
  if (homeDir) return path.resolve(homeDir);
  const envHome = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  const resolved = envHome || os.homedir();
  if (!resolved) throw new CliError('IO_FAILED', 'Home directory unavailable; use --dir=<path> instead.');
  return resolved;
}

function samePath(a, b) {
  const left = existsSync(a) ? realpathSync(a) : path.resolve(a);
  const right = existsSync(b) ? realpathSync(b) : path.resolve(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function runSkill(action, names, values, { cwd = process.cwd(), skillsRoot = defaultSkillsRoot, homeDir, log = console.log } = {}) {
  const skills = listBundledSkills({ skillsRoot });
  if (action === 'list') {
    const data = { root: skillsRoot, skills };
    if (!values.json) {
      for (const skill of skills) log(`${skill.name}\t${skill.path}`);
    }
    return { data };
  }
  if (action === 'path') {
    if (!names.length) {
      const data = { root: skillsRoot, skills };
      if (!values.json) log(skillsRoot);
      return { data };
    }
    const [skill] = selectSkills(skills, [names[0]]);
    const data = { name: skill.name, directory: skill.directory, path: skill.path };
    if (!values.json) log(skill.path);
    return { data };
  }
  if (action === 'install') {
    const chosen = selectSkills(skills, names);
    const target = values.target ?? null;
    const directory = target
      ? path.join(resolveHome(homeDir), ...skillTargets[target])
      : path.resolve(cwd, values.dir);
    for (const skill of chosen) {
      const destination = path.join(directory, skill.name);
      if (samePath(skill.directory, destination)) {
        throw new CliError('USAGE_INVALID', `Destination ${destination} resolves to the bundled skill source; choose another directory.`);
      }
    }
    mkdirSync(directory, { recursive: true });
    const installed = [];
    for (const skill of chosen) {
      const destination = path.join(directory, skill.name);
      if (existsSync(destination) || lstatSafe(destination)) rmSync(destination, { recursive: true, force: true });
      cpSync(skill.directory, destination, { recursive: true });
      const installedPath = path.join(destination, 'SKILL.md');
      installed.push({ name: skill.name, source: skill.directory, destination, path: installedPath });
      if (!values.json) log(`installed ${skill.name} -> ${destination}`);
    }
    return { data: { target, directory, installed } };
  }
  throw new CliError('USAGE_INVALID', 'Invalid skill action; run adg skill --help.');
}

function lstatSafe(target) {
  try { return lstatSync(target); }
  catch { return null; }
}
