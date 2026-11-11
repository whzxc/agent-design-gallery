import { spawn } from "node:child_process";
import { loadConfig } from "./toolkit/config.mjs";
import { registerInstance } from "./hub/instances.mjs";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { startServer } from "./server.mjs";
import { previewTarget, previewURL } from './link.mjs';

export async function open(positionals, values) {
    if (positionals.length > 1)
      throw new Error("Expected one directory. Run sdg --help.");
    const target = previewTarget(values);
    const port = values.port === undefined ? 0 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("--port must be an integer from 0 to 65535.");
    const input = path.resolve(positionals[0] ?? process.cwd());
    const config = await loadConfig(input);
    if(values.base!==undefined && (!target.asset || target.asset.endsWith('.mmd'))) await (await import('./toolkit/arch-git.mjs')).resolveBase(config,values.base);
    const directory = config.root === input && existsSync(config.design) ? config.design : input;
    const server = await startServer({
      directory,
      port,
      stateDirectory: values["state-dir"],
    });
    let instance;
    try { instance = await registerInstance({ directory: server.directory, port: server.port, id: server.id, stateDirectory: values['state-dir'] }); }
    catch (error) { await server.close(); throw error; }
    const cleanup = () => { try { unlinkSync(instance.file); } catch {} };
    process.once('exit', cleanup);
    const url = previewURL(server.url, target).href;
    console.log(`SDG: ${url}`);
    if (!values["no-open"]) {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "rundll32.exe"
            : "xdg-open";
      const args =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", url]
          : [url];
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.on("error", () =>
        console.error(`Open ${url} in your browser.`),
      );
      child.unref();
    }
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () =>
        server.close().then(() => instance.remove()).catch((e) => {
          console.error(e.message);
          process.exitCode = 2;
        }),
      );
  return 0;
}
