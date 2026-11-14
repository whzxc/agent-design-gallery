import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CliError } from './cli-output.mjs';
import { defaultStateDirectory } from './hub/registry.mjs';
import { relative } from './toolkit/project.mjs';

const queues = new Map();
const validStatuses = ['open', 'addressed', 'resolved'];

export function annotationFile(project, state = defaultStateDirectory) {
  return path.join(state, 'annotations', createHash('sha256').update(path.resolve(project)).digest('hex') + '.json');
}

function gitHead(project) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function validateElement(element) {
  if (element === null || element === undefined) return null;
  if (typeof element !== 'object' || Array.isArray(element) ||
      typeof element.id !== 'string' || !element.id.trim() ||
      typeof element.owner !== 'object' || !element.owner || Array.isArray(element.owner) ||
      typeof element.owner.source !== 'string' || !element.owner.source.trim() ||
      !(element.owner.export === null || (typeof element.owner.export === 'string' && element.owner.export.trim())) ||
      !['x', 'y'].every(k => Number.isFinite(element[k]) && element[k] >= 0 && element[k] <= 1)) {
    throw new CliError('USAGE_INVALID', 'Provide a valid element anchor with id, owner and normalized x/y coordinates.');
  }
  return {
    id: element.id.trim(),
    owner: { source: element.owner.source.trim(), export: element.owner.export === null ? null : element.owner.export.trim() },
    x: element.x,
    y: element.y,
  };
}

function normalizeRow(row) {
  return {
    ...row,
    element: row.element ?? null,
    replies: Array.isArray(row.replies) ? row.replies : [],
    status: validStatuses.includes(row.status) ? row.status : 'open',
  };
}

export async function annotations(project, state, action = 'list', payload = {}) {
  const file = annotationFile(project, state);
  const previous = queues.get(file) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    let rows;
    try { rows = JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new CliError('STATE_INVALID', `Cannot read annotations: ${e.message}`); rows = []; }
    if (!Array.isArray(rows)) throw new CliError('STATE_INVALID', 'Cannot read annotations: expected a JSON array.');
    rows = rows.map(normalizeRow);
    if (action === 'list') {
      const status = payload.status ?? 'all';
      if (![...validStatuses, 'all'].includes(status)) throw new CliError('USAGE_INVALID', 'Choose --status=open, addressed, resolved or all.');
      return status === 'all' ? rows : rows.filter(r => r.status === status);
    }
    let row = rows.find(r => r.id === payload.id);
    if (action !== 'create' && !row) throw new CliError('USAGE_INVALID', 'Annotation not found. List annotations to choose an ID.');
    if (action === 'read') return row;
    const now = new Date().toISOString();
    if (action === 'create' || action === 'update') {
      const value = { ...row, ...payload };
      if (typeof value.note !== 'string' || !value.note.trim() || value.note.length > 10000 ||
          typeof value.source !== 'string' || !value.source ||
          typeof value.frame !== 'string' || !value.frame ||
          !['x', 'y'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1)) {
        throw new CliError('USAGE_INVALID', 'Provide a note, source, frame and normalized x/y coordinates.');
      }
      const element = validateElement(Object.hasOwn(payload, 'element') ? payload.element : row?.element ?? null);
      const fields = { note: value.note, source: value.source, frame: value.frame, x: value.x, y: value.y, element };
      if (row) {
        Object.assign(row, fields, { updatedAt: now });
      } else {
        row = {
          ...fields,
          id: randomUUID(),
          number: Math.max(0, ...rows.map(r => r.number)) + 1,
          replies: [],
          revision: gitHead(project),
          status: 'open',
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
      }
    } else if (action === 'reply') {
      if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 10000) {
        throw new CliError('USAGE_INVALID', 'Provide a non-empty --message up to 10000 characters.');
      }
      const author = payload.author ?? 'agent';
      if (!['user', 'agent'].includes(author)) throw new CliError('USAGE_INVALID', 'Reply author must be user or agent.');
      row.replies = [...row.replies, { author, message: payload.message.trim(), at: now }];
      row.updatedAt = now;
    } else if (action === 'address') {
      if (typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 10000) {
        throw new CliError('USAGE_INVALID', 'Provide a non-empty --message explaining what was addressed.');
      }
      row.replies = [...row.replies, { author: 'agent', message: payload.message.trim(), at: now }];
      row.status = 'addressed';
      row.updatedAt = now;
    } else if (action === 'resolve') {
      Object.assign(row, { status: 'resolved', updatedAt: now });
    } else if (action === 'reopen') {
      Object.assign(row, { status: 'open', updatedAt: now });
    } else if (action === 'delete') {
      rows = rows.filter(r => r.id !== payload.id);
    } else {
      throw new CliError('USAGE_INVALID', 'Unknown annotation action.');
    }
    await mkdir(path.dirname(file), { recursive: true });
    const temp = file + '.' + randomUUID();
    await writeFile(temp, JSON.stringify(rows, null, 2));
    await rename(temp, file);
    return row;
  });
  queues.set(file, operation);
  try { return await operation; } finally { if (queues.get(file) === operation) queues.delete(file); }
}

function toProjectPath(config, candidate) {
  if (!candidate) return null;
  const inDesign = path.join(config.design, candidate);
  if (existsSync(inDesign)) return relative(config, inDesign);
  const inRoot = path.join(config.root, candidate);
  if (existsSync(inRoot)) return relative(config, inRoot);
  const prefix = path.relative(config.root, config.design).split(path.sep).join('/');
  if (!prefix || candidate === prefix || candidate.startsWith(prefix + '/')) return candidate;
  return path.posix.join(prefix, candidate);
}

const quoteShell = value => /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'`;

export async function readAnnotationContext(config, state, id) {
  const row = await annotations(config.root, state, 'read', { id });
  const sourcePath = toProjectPath(config, row.source);
  const ownerSourcePath = row.element?.owner?.source ? toProjectPath(config, row.element.owner.source) : null;
  const head = gitHead(config.root);
  let stale = true, frameBox = null, elementBox = null;
  const fullFile = path.join(config.root, sourcePath);
  if (sourcePath?.endsWith('.tsx') && existsSync(fullFile)) {
    const [{ buildSource }, { frameDocument }, { launch, browserTask }, { installFramePrimitives }, { elementIdentities }] = await Promise.all([
      import('./toolkit/build.mjs'),
      import('./toolkit/frame-document.mjs'),
      import('./toolkit/browser.mjs'),
      import('./toolkit/frame-primitives.mjs'),
      import('./toolkit/frame-identity.mjs'),
    ]);
    let browser;
    try {
      const built = await buildSource(config, fullFile, { write: false });
      const frame = built.frames.find(f => f.name === row.frame);
      if (frame) {
        browser = await launch();
        const page = await browserTask(browser, () => browser.newPage({
          viewport: { width: frame.width ?? 1600, height: frame.height ?? 1200 },
          locale: 'en-US', timezoneId: 'UTC', deviceScaleFactor: 1,
        }));
        await page.setContent(frameDocument(frame, 'light', built.css), { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: `${installFramePrimitives}; installFramePrimitives();` });
        const observed = await page.evaluate(() => {
          const shell = document.querySelector('[data-adg-frame]'), root = shell?.firstElementChild;
          if (!root || shell.children.length !== 1) return null;
          const { inventory, relativeBox, reads, identityNode } = globalThis.__adgFramePrimitives;
          const origin = shell.getBoundingClientRect(), { elements, paths, neutralCandidates } = inventory(root);
          const { style, rect } = reads();
          const box = r => relativeBox(r, origin, true);
          function clipped(node) {
            const nr = rect(node);
            let left = Math.max(nr.left, origin.left), right = Math.min(nr.right, origin.right);
            let top = Math.max(nr.top, origin.top), bottom = Math.min(nr.bottom, origin.bottom);
            for (let p = node; p && p !== shell; p = p.parentElement) {
              const s = style(p);
              if (s.display === 'none' || (p === node && s.visibility !== 'visible') || Number(s.opacity) === 0) return null;
              if (p !== node && s.display !== 'inline') {
                const cr = rect(p);
                if (/(hidden|clip|scroll|auto)/.test(s.overflowX)) { left = Math.max(left, cr.left); right = Math.min(right, cr.right); }
                if (/(hidden|clip|scroll|auto)/.test(s.overflowY)) { top = Math.max(top, cr.top); bottom = Math.min(bottom, cr.bottom); }
              }
            }
            return right > left && bottom > top ? box({ left, right, top, bottom }) : null;
          }
          const identities = [], boxes = {};
          for (const node of elements) {
            const p = paths.get(node), own = JSON.parse(node.getAttribute('data-adg-owners') ?? '[]');
            identities.push(identityNode(node, p, paths.get(node.parentElement) ?? null, own, style(node), neutralCandidates.has(node)));
            boxes[p] = clipped(node);
          }
          return { frameBox: { x: 0, y: 0, width: origin.width, height: origin.height }, identities, boxes };
        });
        if (observed) {
          frameBox = observed.frameBox;
          if (!row.element) {
            stale = false;
          } else {
            const assigned = elementIdentities(observed.identities, { source: sourcePath, frame: frame.name });
            const hit = assigned.find(item => item.id === row.element.id);
            const box = hit ? observed.boxes[hit.path] : null;
            if (box) {
              stale = false;
              elementBox = box;
            }
          }
        }
      }
    } catch {
      stale = true;
    } finally {
      await browser?.close();
    }
  }
  const inspectElementFlag = row.element?.id && !stale ? ` --element=${quoteShell(row.element.id)}` : '';
  return {
    ...row,
    project: config.root,
    sourcePath,
    ownerSourcePath,
    export: row.element?.owner?.export ?? null,
    elementId: row.element?.id ?? null,
    stale,
    frameBox,
    elementBox,
    head,
    commands: {
      inspect: `adg inspect ${quoteShell(sourcePath)} --frame=${quoteShell(row.frame)}${inspectElementFlag} --json`,
      render: `adg render ${quoteShell(sourcePath)} --frame=${quoteShell(row.frame)} --json`,
    },
  };
}
