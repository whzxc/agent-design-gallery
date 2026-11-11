import { spawn } from 'node:child_process';
import { loadConfig } from './toolkit/config.mjs';
import { registerInstance } from './hub/instances.mjs';
import { defaultStateDirectory } from './hub/registry.mjs';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { startServer } from './server.mjs';
import { previewTarget, previewURL } from './link.mjs';
import { CliError, asCliError, sanitize } from './cli-output.mjs';
import { cleanup } from './toolkit/results.mjs';

export async function open(positionals, values, {
  cwd = process.cwd(), startViewer = startServer, register = registerInstance, spawnBrowser = spawn,
  onDiagnostic, onFatal,
} = {}) {
  if (positionals.length > 1) throw new CliError('USAGE_INVALID','Expected one directory. Run adg --help.');
  const target = previewTarget(values), port = values.port === undefined ? 0 : Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new CliError('USAGE_INVALID','--port must be an integer from 0 to 65535.');
  const input = path.resolve(cwd,positionals[0] ?? '.');
  const config = await loadConfig(input);
  if (values.base !== undefined && (!target.asset || target.asset.endsWith('.mmd'))) await (await import('./toolkit/arch-git.mjs')).resolveBase(config,values.base);
  const directory = config.root === input && existsSync(config.design) ? config.design : input;
  const stateDirectory = path.resolve(cwd,values['state-dir'] ?? defaultStateDirectory);
  const server = await startViewer({directory,port,stateDirectory,onDiagnostic,onFatal});
  let instance;
  try { instance = await register({directory:server.directory,port:server.port,id:server.id,stateDirectory}); }
  catch (cause) {
    const primary = asCliError(cause);
    await cleanup(() => server.close(),primary);
    throw primary;
  }
  const exitCleanup = () => { try { unlinkSync(instance.file); } catch {} };
  process.once('exit',exitCleanup);
  const url = previewURL(server.url,target).href;
  let closing;
  return {
    id:server.id,url,port:server.port,directory:server.directory,stateDirectory,
    close() {
      return closing ??= (async () => {
        let primary;
        try { await server.close(); }
        catch (cause) { primary = new CliError('SHUTDOWN_FAILED',cause.message,{cause}); }
        try { await cleanup(() => instance.remove(),primary); }
        catch (cause) { primary = cause; }
        finally { process.off('exit',exitCleanup); }
        if (primary) throw primary;
      })();
    },
    openBrowser() {
      if (values['no-open']) return;
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler',url] : [url];
      const warn=()=>{
        const diagnostic={code:'BROWSER_OPEN_FAILED',message:`Open ${url} in your browser.`,next:[]};
        if(onDiagnostic)onDiagnostic(diagnostic);else console.error(sanitize(diagnostic.message));
      };
      try {const child=spawnBrowser(command,args,{stdio:'ignore',detached:true});child.on('error',warn);child.unref();}
      catch {warn();}
    },
  };
}
