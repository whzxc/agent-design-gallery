import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile, symlink, cp } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import { loadConfig } from '../src/toolkit/config.mjs';
const [arc, destination = `output/comparison-${Date.now()}`, count = "3"] =
  process.argv.slice(2);
const baseline = process.argv.find(arg => arg.startsWith('--sdg-baseline='))?.slice('--sdg-baseline='.length);
if (!arc)
  throw new Error(
    "Usage: node tooling/compare.mjs <ARC checkout or design directory> [output-directory] [runs] [--reuse-snapshot | --sdg-baseline=<checkout>] [--warm-restart]",
  );
const root = process.cwd(),
  out = path.resolve(destination),
  snapshot = path.join(out, baseline ? "project" : "arc");
await mkdir(snapshot, { recursive: true });
let sha, assetCount;
if (baseline) {
  sha = execFileSync('git', ['-C', arc, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
  await cp(path.resolve(arc), path.join(snapshot, 'design'), {
    recursive: true,
    filter: source => path.basename(source) !== '.sdg',
  });
  const config = await loadConfig(path.resolve(arc));
  await writeFile(path.join(snapshot, 'sdg.config.mjs'), `export default { sources: ${JSON.stringify(config.sources)} };\n`);
} else if (process.argv.includes("--reuse-snapshot")) {
  const previous = JSON.parse(
    await readFile(path.join(arc, "comparison.json"), "utf8"),
  );
  sha = previous.arcCommit;
  assetCount = previous.assetCount;
  await cp(path.join(arc, "arc"), snapshot, {
    recursive: true,
    verbatimSymlinks: true,
  });
} else {
  sha = execFileSync("git", ["-C", arc, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  execFileSync("tar", ["-x", "-C", snapshot], {
    input: execFileSync("git", ["-C", arc, "archive", sha], {
      maxBuffer: 128 * 1024 * 1024,
    }),
  });
  await symlink(
    path.join(path.resolve(arc), "node_modules"),
    path.join(snapshot, "node_modules"),
  );
  const source = await readFile(
    path.join(snapshot, "ui/design-gallery.tsx"),
    "utf8",
  );
  const names = execFileSync(
    "git",
    ["-C", arc, "ls-tree", "-r", "--name-only", sha, "design"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((x) => x.endsWith(".svg"));
  const groups = [
    ...source.matchAll(/title: '([^']+)', names: \[([^\]]+)\]/g),
  ].map(([, title, list]) => ({
    title,
    assets: [...list.matchAll(/'([^']+)'/g)].flatMap(([, n]) =>
      names
        .filter((p) => path.basename(p, ".svg") === n)
        .map((p) => p.slice(7)),
    ),
  }));
  if (!groups.length)
    throw new Error(
      "ARC grouping format changed; update the benchmark adapter.",
    );
  await writeFile(
    path.join(snapshot, "design/gallery.json"),
    JSON.stringify({ groups }, null, 2),
  );

  assetCount = names.length;
}
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
async function start(command, args, env) {
  const start = performance.now(),
    child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
  let log = "";
  const ready = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Server startup timed out. " + log));
    }, 60000);
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${log}`));
    });
    child.stderr.on("data", (b) => (log += b));
    child.stdout.on("data", (b) => {
      log += b;
      const match = log.match(/(?:DESIGN|SDG): (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve({ url: match[1], startupMs: performance.now() - start });
      }
    });
  });
  return {
    ...ready,
    child,
    get log() {
      return log;
    },
  };
}
const records = [];
for (let run = 1; run <= Number(count); run++)
  for (const implementation of baseline ? ["baseline", "sdg"] : ["arc", "sdg"]) {
    const port = await freePort();
    const launch = () => start(
      process.execPath,
      implementation === "arc"
        ? [path.join(snapshot, "tooling/design-server.mjs")]
        : [
            implementation === 'baseline' ? path.resolve(baseline, 'src/cli.mjs') : "src/cli.mjs",
            path.join(snapshot, "design"),
            "--no-open",
            "--port",
            String(port),
            "--state-dir",
            path.join(out, `state-${implementation}-${run}`),
          ],
      { ARC_DESIGN_PORT: String(port) },
    );
    const server = await launch();
    const file = path.join(out, `${implementation}-${run}.json`);
    try {
      if (baseline && assetCount === undefined) assetCount = (await (await fetch(new URL('/manifest', server.url))).json()).assets.length;
      await new Promise((resolve, reject) => {
        const p = spawn(
          process.execPath,
          [
            "tooling/benchmark.mjs",
            server.url,
            file,
            path.join(snapshot, "design"),
          ],
          { stdio: "inherit" },
        );
        p.on("error", reject);
        p.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Benchmark exited ${code}`)),
        );
      });
      records.push({
        implementation,
        run,
        startupMs: server.startupMs,
        result: path.basename(file),
      });
    } finally {
      server.child.kill("SIGTERM");
      await new Promise((resolve) => server.child.on("exit", resolve));
      await writeFile(
        path.join(out, `${implementation}-${run}-server.log`),
        server.log,
      );
    }
    if (process.argv.includes('--warm-restart') && implementation !== 'arc') {
      const restarted = await launch(), restartFile = path.join(out, `${implementation}-${run}-restart.json`);
      try {
        await new Promise((resolve,reject) => {
          const child=spawn(process.execPath,['tooling/benchmark.mjs',restarted.url,restartFile,'--browse-only'],{stdio:'inherit'});
          child.on('error',reject);child.on('exit',code=>code?reject(new Error(`Restart benchmark exited ${code}`)):resolve());
        });
        const result=JSON.parse(await readFile(restartFile,'utf8'));
        Object.assign(records.at(-1), {warmRestartStartupMs:restarted.startupMs,warmRestartBrowseMs:result.firstBrowseMs,warmRestartResult:path.basename(restartFile)});
      } finally {
        restarted.child.kill('SIGTERM');
        await new Promise(resolve=>restarted.child.on('exit',resolve));
        await writeFile(path.join(out,`${implementation}-${run}-restart-server.log`),restarted.log);
      }
    }
  }
const summary = { ...(baseline ? {sourceCommit:sha,baseline:path.resolve(baseline)} : {arcCommit:sha}), assetCount, records };
await writeFile(
  path.join(out, "comparison.json"),
  JSON.stringify(summary, null, 2),
);
console.log(
  JSON.stringify({ out, ...summary }, null, 2),
);
