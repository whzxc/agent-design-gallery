import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, realpath, rename, readdir, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defaultStateDirectory } from './hub/registry.mjs';
import { CliError } from './cli-output.mjs';
import { commandFailure } from './toolkit/results.mjs';

export const SERVICE_LABEL = 'org.agent-design-gallery.hub';
const execute = promisify(execFile);
const xml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);
const unxml = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
})[entity]);

export function renderLaunchAgent({ nodePath, cliPath, stateDirectory, port = 4310 }) {
  const args = [nodePath, cliPath, 'serve', '--port', String(port), '--state-dir', stateDirectory];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(path.join(stateDirectory, 'service.stdout.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(path.join(stateDirectory, 'service.stderr.log'))}</string>
</dict></plist>
`;
}

function launchArguments(plist) {
  const array = plist?.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
  return [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(match => unxml(match[1]));
}
const readOptional = async file => {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
};

async function job(run, args) {
  try { return await run('/bin/launchctl', args); }
  catch (cause) { throw new CliError('SERVICE_FAILED', cause.message, { cause }); }
}
async function loadedJob(run, target) {
  try { return (await run('/bin/launchctl', ['print', target])).stdout; }
  catch (cause) {
    if ([3, 113].includes(cause.code)) return null;
    throw new CliError('SERVICE_FAILED', `Cannot inspect ${SERVICE_LABEL}: ${cause.stderr?.trim() || cause.message}`, { cause });
  }
}
function statusData(status, installedPlist, agentFile, stateDirectory) {
  return { label: SERVICE_LABEL, installed: installedPlist !== null, loaded: status !== null,
    state: status?.match(/^\s*state = (.+)$/m)?.[1] ?? null,
    pid: Number(status?.match(/^\s*pid = (\d+)$/m)?.[1]) || null,
    plist: agentFile, stateDirectory,
    logs: { stdout: path.join(stateDirectory, 'service.stdout.log'), stderr: path.join(stateDirectory, 'service.stderr.log') } };
}

async function migrateService(values, { home, run, nodePath, cliPath, uid, output }) {
  const oldLabel = 'org.svg-design-gallery.hub';
  const agents = path.join(home, 'Library', 'LaunchAgents');
  const oldAgent = path.join(agents, `${oldLabel}.plist`), newAgent = path.join(agents, `${SERVICE_LABEL}.plist`);
  const installed = await readOptional(oldAgent), args = launchArguments(installed);
  const argument = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
  const base = process.env.XDG_STATE_HOME || path.join(home, '.local/state');
  const oldState = path.resolve(argument('--state-dir') ?? path.join(base, 'svg-design-gallery'));
  const newState = path.resolve(values['state-dir'] ?? path.join(base, 'agent-design-gallery'));
  const data = { complete: false, from: {label:oldLabel,stateDirectory:oldState,plist:oldAgent},
    to: {label:SERVICE_LABEL,stateDirectory:newState,plist:newAgent}, changes: [], keyPrefixUpdated:false, references:[], service:null };
  const warnings = [];
  try {
    const exists = async file => (await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; })) !== null;
    if (await exists(newState)) throw new CliError('MIGRATION_CONFLICT', `Migration target already exists: ${newState}; move it aside before running adg service migrate.`);
    if (await exists(newAgent)) throw new CliError('MIGRATION_CONFLICT', `LaunchAgent already exists: ${newAgent}; inspect it before running adg service migrate.`);
    let oldInfo;
    try { oldInfo = await lstat(oldState); }
    catch (cause) { if (['ENOENT','ENOTDIR'].includes(cause.code)) throw new CliError('DIRECTORY_NOT_FOUND', cause.message, { cause }); throw cause; }
    if (!oldInfo.isDirectory()) throw new CliError('DIRECTORY_NOT_FOUND', `Hub state is not a directory: ${oldState}`);
    const executable = await realpath(nodePath), entry = await realpath(cliPath);
    const port = Number(argument('--port') ?? 4310);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError('STATE_INVALID', 'Invalid port in the old LaunchAgent; correct it before migration.');
    const oldKey = await readOptional(path.join(oldState, 'hub.key'));
    if (oldKey !== null && !/^(?:sdg|adg)_[a-f0-9]{64}$/.test(oldKey.trim())) throw new CliError('STATE_INVALID', 'Invalid hub key file; correct it before migration.');
    const domain = `gui/${uid}`, oldTarget = `${domain}/${oldLabel}`;
    let loaded = false;
    try { await run('/bin/launchctl', ['print', oldTarget]); loaded = true; }
    catch (cause) { if (![3,113].includes(cause.code)) throw new CliError('SERVICE_FAILED', cause.message, { cause }); }
    if (loaded) { await job(run, ['bootout', oldTarget]); output(`Stopped ${oldLabel}`); }
    await mkdir(path.dirname(newState), { recursive:true });
    await rename(oldState,newState);
    data.changes.push({action:'renamed',path:newState,from:oldState});
    output(`Moved ${oldState} -> ${newState}`);
    if (oldKey?.trim().startsWith('sdg_')) {
      await writeFile(path.join(newState,'hub.key'),oldKey.replace('sdg_','adg_'),{mode:0o600});
      data.changes.push({action:'updated',path:path.join(newState,'hub.key'),from:null});
      data.keyPrefixUpdated = true;
      output('Updated hub key prefix; use adg serve --print-key when updating browser access.');
    }
    await mkdir(agents,{recursive:true});
    const plist = renderLaunchAgent({nodePath:executable,cliPath:entry,stateDirectory:newState,port});
    await writeFile(newAgent,plist);
    data.changes.push({action:'created',path:newAgent,from:null});
    if (installed !== null) {
      await rm(oldAgent);
      data.changes.push({action:'deleted',path:oldAgent,from:null});
      output(`Removed ${oldAgent}`);
    }
    output(`Created ${newAgent}`);
    await job(run,['bootstrap',domain,newAgent]);
    output(`Started ${SERVICE_LABEL}`);
    data.service = statusData(await loadedJob(run,`${domain}/${SERVICE_LABEL}`),plist,newAgent,newState);
    output(`Other LaunchAgents referencing ${oldState}:`);
    for (const name of (await readdir(agents)).sort()) {
      if (!name.endsWith('.plist') || name === `${SERVICE_LABEL}.plist`) continue;
      const file=path.join(agents,name),content=await readFile(file,'utf8');
      if (unxml(content).includes(oldState)) {
        data.references.push(file); output(file);
        if (!warnings.length) warnings.push({code:'MIGRATION_REFERENCES_REMAIN',message:`Other LaunchAgents still reference ${oldState}.`,next:[]});
      }
    }
    if (!data.references.length) output('None.');
    data.complete = true;
    return {data,warnings};
  } catch (cause) {
    if (cause instanceof CliError) cause.context.stateDirectory = newState;
    if (!data.changes.length) throw cause;
    throw commandFailure(cause,data,warnings);
  }
}

// Overrides keep launchctl and the user's LaunchAgents directory out of contract checks.
export async function service(action, values = {}, {
  platform = process.platform, home = homedir(), run = execute,
  nodePath = process.execPath, cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url)),
  uid = process.getuid?.(), output = console.log,
} = {}) {
  if (platform !== 'darwin') throw new CliError('SERVICE_UNSUPPORTED','adg service is supported only on macOS (LaunchAgent).');
  if (!['install','uninstall','status','logs','migrate'].includes(action)) throw new CliError('USAGE_INVALID','Expected adg service install|uninstall|status|logs|migrate; run adg service --help.');
  if (action === 'migrate') return migrateService(values,{home,run,nodePath,cliPath,uid,output});
  const agentFile=path.join(home,'Library','LaunchAgents',`${SERVICE_LABEL}.plist`);
  const installedPlist=await readOptional(agentFile),installedArgs=launchArguments(installedPlist),stateFlag=installedArgs.indexOf('--state-dir');
  const stateDirectory=path.resolve(values['state-dir'] ?? (action === 'install' ? undefined : stateFlag >= 0 ? installedArgs[stateFlag+1] : undefined) ?? defaultStateDirectory);
  const domain=`gui/${uid}`,target=`${domain}/${SERVICE_LABEL}`;
  const stdout=path.join(stateDirectory,'service.stdout.log'),stderr=path.join(stateDirectory,'service.stderr.log');
  if (action === 'logs') {
    const logs=[];
    for (const [stream,file] of [['stdout',stdout],['stderr',stderr]]) {
      const content=await readOptional(file),lines=content?.trimEnd().split('\n').slice(-200) ?? [];
      logs.push({stream,path:file,exists:content!==null,lines:content?.trimEnd() ? lines : []});
      if (!values.json && content !== null) output(`${file}\n${lines.join('\n')}`);
    }
    return {data:{label:SERVICE_LABEL,stateDirectory,logs}};
  }
  if (action === 'status') {
    const data=statusData(await loadedJob(run,target),installedPlist,agentFile,stateDirectory);
    if (!values.json) output(JSON.stringify(data,null,2));
    return {data};
  }
  if (action === 'uninstall') {
    if (await loadedJob(run,target) !== null) await job(run,['bootout',target]);
    await rm(agentFile,{force:true});
    output(`Uninstalled ${SERVICE_LABEL}. State and logs retained in ${stateDirectory}.`);
    return {data:{label:SERVICE_LABEL,plist:agentFile,stateDirectory,retained:true}};
  }
  const port=values.port===undefined ? 4310 : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CliError('USAGE_INVALID','--port must be an integer from 1 to 65535.');
  if (installedPlist !== null) throw new CliError('SERVICE_ALREADY_INSTALLED',`${SERVICE_LABEL} is already installed; run adg service uninstall before reinstalling.`);
  const executable=await realpath(nodePath),entry=await realpath(cliPath);
  await mkdir(path.dirname(agentFile),{recursive:true});await mkdir(stateDirectory,{recursive:true});
  await Promise.all([stdout,stderr].map(file=>writeFile(file,'',{flag:'a'})));
  const plist=renderLaunchAgent({nodePath:executable,cliPath:entry,stateDirectory,port});
  await writeFile(agentFile,plist);
  try { await run('/bin/launchctl',['bootstrap',domain,agentFile]); }
  catch (cause) {
    await rm(agentFile,{force:true});
    throw new CliError('SERVICE_FAILED',`Cannot install ${SERVICE_LABEL}: ${cause.stderr?.trim() || cause.message}`,{cause});
  }
  output(`Installed ${SERVICE_LABEL}. Logs: ${stdout} and ${stderr}.`);
  return {data:{service:statusData(await loadedJob(run,target),plist,agentFile,stateDirectory),port}};
}
