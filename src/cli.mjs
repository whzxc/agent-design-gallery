#!/usr/bin/env node
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { startServer } from "./server.mjs";
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      port: { type: "string" },
      "no-open": { type: "boolean" },
      "state-dir": { type: "string" },
    },
  });
  if (values.help)
    console.log(
      "Usage: sdg [directory] [--port <number>] [--no-open]\n\nBrowse SVG designs from a local directory. Omit directory to open recent directories.\nDrag or scroll to pan; pinch or Ctrl/Command+scroll to zoom.\n\nOptions:\n  --port <number>     Local port (default: automatic)\n  --no-open           Print URL without opening the browser\n  --state-dir <path>  Preferences directory (for isolated benchmarks)\n  -v, --version       Print version\n  -h, --help          Show help",
    );
  else if (values.version)
    console.log(
      JSON.parse(
        await readFile(new URL("../package.json", import.meta.url), "utf8"),
      ).version,
    );
  else {
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
          process.exitCode = 1;
        }),
      );
  }
} catch (error) {
  console.error(`sdg: ${error.message}`);
  process.exitCode = 1;
}
