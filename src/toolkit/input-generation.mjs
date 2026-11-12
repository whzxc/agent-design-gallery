import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../cli-output.mjs';
import { indexDigest } from './index-store.mjs';
import { canonicalBytes } from './impact-proof.mjs';
import { loadConfig, configFile } from './config.mjs';

/** Literal local config imports supply path roles; opaque inputs retain unknown classification. */
export async function configInputFiles(config) {
  const found = new Set(), entry = configFile(config.root);
  async function visit(file) {
    file = await realpath(file);
    if (found.has(file)) return;
    found.add(file);
    const text = await readFile(file, 'utf8');
    for (const [, specifier] of text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\(\s*)['"](\.[^'"]+)['"]/g)) {
      const requested = path.resolve(path.dirname(file), specifier);
      for (const candidate of [requested, ...['.ts', '.js', '.mjs', '/index.ts', '/index.js'].map(extension => requested + extension)]) {
        try { if ((await stat(candidate)).isFile()) { await visit(candidate); break; } }
        catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      }
    }
  }
  if (entry) await visit(entry);
  return [...found];
}

export const trackedHash = contents => indexDigest(contents === null ? 'missing\0' : Buffer.concat([Buffer.from('present\0'), contents]));
export async function inputBytes(file) {
  try { return await readFile(file); } catch (error) { if (['ENOENT','ENOTDIR'].includes(error.code)) return null; throw error; }
}

/** Verify both sides of configuration evaluation; callers stop builders before final verification. */
export async function verifyInputGeneration({ tracked, views, inputs, verifyConfig=!!inputs, code='IMPACT_INPUT_CHANGED' }) {
  const fail = message => { throw new CliError(code,message); };
  const verifyTracked=async()=>{for(const [file,expected] of tracked)if(trackedHash(await inputBytes(file))!==expected)fail(`Input changed during query: ${file}.`);};
  await verifyTracked();
  for(const view of views){
    await view.index.verifyInputs();
    if(verifyConfig){
      let resolved;
      try {resolved=await loadConfig(view.config.root,{discover:false,fresh:true});}
      catch(cause){throw new CliError(code,`Configuration could not be revalidated: ${view.config.root}. ${cause.message}`,{cause});}
      if(canonicalBytes(resolved)!==view.resolved)fail(`Resolved configuration changed during query: ${view.config.root}.`);
      const files=await configInputFiles(resolved);
      const names=files.map(file=>path.relative(resolved.root,file).split(path.sep).join('/')).sort();
      if(canonicalBytes(names)!==canonicalBytes([...view.configInputs].sort()))fail('Configuration dependency inventory changed during query.');
    }
  }
  await verifyTracked();await inputs?.verifyChanges();
}
