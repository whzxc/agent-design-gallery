import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CliError } from './cli-output.mjs';
import { defaultStateDirectory } from './hub/registry.mjs';
const queues = new Map();
export function annotationFile(project, state = defaultStateDirectory) {
  return path.join(state, 'annotations', createHash('sha256').update(path.resolve(project)).digest('hex') + '.json');
}
export async function annotations(project, state, action = 'list', payload = {}) {
  const file = annotationFile(project, state);
  const previous = queues.get(file) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    let rows;
    try { rows = JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new CliError('STATE_INVALID', `Cannot read annotations: ${e.message}`); rows = []; }
    if (action === 'list') return rows;
    let row = rows.find(r => r.id === payload.id);
    if (action !== 'create' && !row) throw new CliError('USAGE_INVALID', 'Annotation not found. List annotations to choose an ID.');
    if (action === 'read') return row;
    if (action === 'create' || action === 'update') {
      const value = { ...row, ...payload };
      if (typeof value.note !== 'string' || !value.note.trim() || value.note.length > 10000 || typeof value.source !== 'string' || !value.source || typeof value.frame !== 'string' || !value.frame || !['x','y'].every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 1)) throw new CliError('USAGE_INVALID', 'Provide a note, source, frame and normalized x/y coordinates.');
      let revision = row?.revision ?? null;
      if (!row) { try { revision = execFileSync('git', ['rev-parse','HEAD'], {cwd:project,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch {} }
      const now = new Date().toISOString();
      const fields = {note:value.note,source:value.source,frame:value.frame,x:value.x,y:value.y,element:value.element ?? null};
      if (row) Object.assign(row, fields, {updatedAt:now});
      else { row = {...fields,id:randomUUID(),number:Math.max(0,...rows.map(r=>r.number))+1,revision,status:'open',createdAt:now,updatedAt:now}; rows.push(row); }
    } else if (action === 'resolve') Object.assign(row,{status:'resolved',updatedAt:new Date().toISOString()});
    else if (action === 'delete') rows = rows.filter(r => r.id !== payload.id);
    else throw new CliError('USAGE_INVALID','Unknown annotation action.');
    await mkdir(path.dirname(file),{recursive:true});
    const temp = file + '.' + randomUUID();
    await writeFile(temp,JSON.stringify(rows,null,2)); await rename(temp,file);
    return row;
  });
  queues.set(file,operation);
  try { return await operation; } finally { if(queues.get(file)===operation)queues.delete(file); }
}
