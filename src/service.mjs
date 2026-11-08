import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { defaultStateDirectory } from './hub/registry.mjs';

export const SERVICE_LABEL = 'org.svg-design-gallery.hub';
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

// Overrides keep launchctl and the user's LaunchAgents directory out of contract checks.
export async function service(action, values = {}, {
  platform = process.platform, home = homedir(), run = execute,
  nodePath = process.execPath, cliPath = fileURLToPath(new URL('./cli.mjs', import.meta.url)),
  uid = process.getuid?.(), output = console.log,
} = {}) {
  if (platform !== 'darwin') throw new Error('sdg service is supported only on macOS (LaunchAgent).');
  if (!['install', 'uninstall', 'status', 'logs'].includes(action)) {
    throw new Error('Expected sdg service install|uninstall|status|logs; run sdg service --help.');
  }
  const agentFile = path.join(home, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
  let installedPlist = null;
  try { installedPlist = await readFile(agentFile, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const argumentsXml = installedPlist?.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? '';
  const installedArgs = [...argumentsXml.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(match => unxml(match[1]));
  const stateFlag = installedArgs.indexOf('--state-dir');
  const installedStateDirectory = stateFlag >= 0 ? installedArgs[stateFlag + 1] : undefined;
  const stateDirectory = path.resolve(values['state-dir'] ?? (action === 'install' ? undefined : installedStateDirectory) ?? defaultStateDirectory);
  const domain = `gui/${uid}`, target = `${domain}/${SERVICE_LABEL}`;
  const stdout = path.join(stateDirectory, 'service.stdout.log');
  const stderr = path.join(stateDirectory, 'service.stderr.log');
  const loaded = async () => {
    try { return (await run('/bin/launchctl', ['print', target])).stdout; }
    catch (error) {
      if ([3, 113].includes(error.code)) return null;
      throw new Error(`Cannot inspect ${SERVICE_LABEL}: ${error.stderr?.trim() || error.message}`);
    }
  };
  if (action === 'logs') {
    for (const file of [stdout, stderr]) {
      let content;
      try { content = await readFile(file, 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      output(`${file}\n${content.trimEnd().split('\n').slice(-200).join('\n')}`);
    }
    return 0;
  }
  if (action === 'status') {
    const status = await loaded();
    output(JSON.stringify({ label: SERVICE_LABEL, installed: installedPlist !== null, loaded: status !== null,
      state: status?.match(/^\s*state = (.+)$/m)?.[1] ?? null,
      pid: Number(status?.match(/^\s*pid = (\d+)$/m)?.[1]) || null,
      plist: agentFile, stateDirectory, logs: { stdout, stderr } }, null, 2));
    return 0;
  }
  if (action === 'uninstall') {
    if (await loaded() !== null) await run('/bin/launchctl', ['bootout', target]);
    await rm(agentFile, { force: true });
    output(`Uninstalled ${SERVICE_LABEL}. State and logs retained in ${stateDirectory}.`);
    return 0;
  }
  const port = values.port === undefined ? 4310 : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be an integer from 1 to 65535.');
  if (installedPlist !== null) throw new Error(`${SERVICE_LABEL} is already installed; run sdg service uninstall before reinstalling.`);
  const executable = await realpath(nodePath), entry = await realpath(cliPath);
  await mkdir(path.dirname(agentFile), { recursive: true });
  await mkdir(stateDirectory, { recursive: true });
  await Promise.all([stdout, stderr].map(file => writeFile(file, '', { flag: 'a' })));
  await writeFile(agentFile, renderLaunchAgent({ nodePath: executable, cliPath: entry, stateDirectory, port }));
  try { await run('/bin/launchctl', ['bootstrap', domain, agentFile]); }
  catch (error) {
    await rm(agentFile, { force: true });
    throw new Error(`Cannot install ${SERVICE_LABEL}: ${error.stderr?.trim() || error.message}`);
  }
  output(`Installed ${SERVICE_LABEL}. Logs: ${stdout} and ${stderr}.`);
  return 0;
}
