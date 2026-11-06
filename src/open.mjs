import { spawn } from "node:child_process";
import { startServer } from "./server.mjs";

export async function open(positionals, values) {
    if (positionals.length > 1)
      throw new Error("Expected one directory. Run sdg --help.");
    const port = values.port === undefined ? 0 : Number(values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("--port must be an integer from 0 to 65535.");
    const server = await startServer({
      directory: positionals[0],
      port,
      stateDirectory: values["state-dir"],
    });
    console.log(`SDG: ${server.url}`);
    if (!values["no-open"]) {
      const command =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "rundll32.exe"
            : "xdg-open";
      const args =
        process.platform === "win32"
          ? ["url.dll,FileProtocolHandler", server.url]
          : [server.url];
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.on("error", () =>
        console.error(`Open ${server.url} in your browser.`),
      );
      child.unref();
    }
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () =>
        server.close().catch((e) => {
          console.error(e.message);
          process.exitCode = 2;
        }),
      );
  return 0;
}
