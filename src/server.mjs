// Adapted from ARC's MIT-licensed tooling/design-server.mjs.
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  realpath,
} from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
const defaultState = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"),
  "svg-design-gallery",
);
export async function startServer({
  directory,
  port = 0,
  stateDirectory = defaultState,
} = {}) {
  let state = { recent: [], views: {}, theme: "system" };
  const statePath = path.join(stateDirectory, "state.json");
  try {
    state = { ...state, ...JSON.parse(await readFile(statePath, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT")
      throw new Error(`Cannot read preferences: ${e.message}`);
  }
  let root,
    files = new Map(),
    groups = [],
    watcher,
    refreshTimer,
    revision = 0,
    closing = false;
  const clients = new Set(),
    svgCache = new Map(),
    touched = new Set();
  let writes = Promise.resolve();
  const persist = () => {
    const data = JSON.stringify(state, null, 2);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(stateDirectory, { recursive: true });
        await writeFile(statePath, data);
      });
    return writes;
  };
  const emit = (data) => {
    for (const client of clients)
      client.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  async function collect(base, relative = "", out = new Map()) {
    for (const entry of await readdir(path.join(base, relative), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await collect(base, name, out);
      else if (entry.isFile() && /\.svg$/i.test(name)) {
        const info = await stat(path.join(base, name));
        const version = `${info.mtimeMs}-${info.size}`;
        const old = base === root ? files.get(name) : undefined;
        out.set(
          name,
          old?.stamp === version
            ? old
            : {
                path: name,
                name: path.basename(name, ".svg"),
                version,
                stamp: version,
                size: info.size,
              },
        );
      }
    }
    return out;
  }
  async function readGroups(base) {
    try {
      const data = JSON.parse(
        await readFile(path.join(base, "gallery.json"), "utf8"),
      );
      if (
        !Array.isArray(data.groups) ||
        data.groups.some(
          (g) =>
            typeof g.title !== "string" ||
            !Array.isArray(g.assets) ||
            g.assets.some((a) => typeof a !== "string"),
        )
      )
        throw new Error(
          "Expected groups with title and assets (relative SVG paths).",
        );
      return data.groups;
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw new Error(`gallery.json: ${e.message}`);
    }
  }
  async function openDirectory(input) {
    const next = await realpath(
      path.resolve(input.replace(/^~(?=$|[\\/])/, os.homedir())),
    );
    if (!(await stat(next)).isDirectory())
      throw new Error("Choose a directory containing SVG files.");
    const nextFiles = await collect(next),
      nextGroups = await readGroups(next);
    // Complete reads before switching, so an invalid directory leaves the current canvas intact.
    const nextWatcher = watch(next, { recursive: true }, (_event, filename) => {
      if (filename) touched.add(String(filename).split(path.sep).join("/"));
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => refresh().catch((e) => emit({ error: e.message })),
        80,
      );
    });
    nextWatcher.on("error", (e) =>
      emit({ error: `File watcher: ${e.message}` }),
    );
    watcher?.close();
    watcher = nextWatcher;
    root = next;
    touched.clear();
    files = nextFiles;
    groups = nextGroups;
    revision++;
    svgCache.clear();
    state.recent = [root, ...state.recent.filter((p) => p !== root)].slice(
      0,
      12,
    );
    await persist();
    emit({ revision });
  }
  let refreshing = false,
    refreshAgain = false;
  async function refresh() {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      const observed = [...touched];
      touched.clear();
      const base = root,
        next = await collect(base),
        nextGroups = await readGroups(base);
      if (root !== base) return;
      const changed = [...new Set([...files.keys(), ...next.keys()])].filter(
        (k) => files.get(k)?.version !== next.get(k)?.version,
      );
      for (const name of observed) {
        if (
          !/\.svg$/i.test(name) &&
          [...svgCache.values()].some((entry) =>
            entry.dependencies.includes(name),
          )
        )
          changed.push(name);
      }
      const grouping = JSON.stringify(groups) !== JSON.stringify(nextGroups);
      if (!changed.length && !grouping) return;
      // Relative embedded SVG dependencies inherit their dependency's revision.
      for (const [key, entry] of svgCache)
        if (entry.dependencies.some((p) => changed.includes(p))) {
          svgCache.delete(key);
          const dependent = key.split("\0")[0];
          if (next.has(dependent) && !changed.includes(dependent)) {
            next.set(dependent, {
              ...next.get(dependent),
              version: `${next.get(dependent).version}-${revision + 1}`,
            });
            changed.push(dependent);
          }
        }
      files = next;
      groups = nextGroups;
      revision++;
      emit({ revision, changed });
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        await refresh();
      }
    }
  }
  const manifest = () => ({
    directory: root ?? null,
    label: root
      ? `${path.basename(path.dirname(root))} / ${path.basename(root)}`
      : "SVG Design Gallery",
    assets: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    groups,
    revision,
    recent: state.recent,
    view: state.views[root] ?? null,
    theme: state.theme,
  });
  async function svg(name, theme, chain = []) {
    if (chain.includes(name))
      throw new Error(`Circular SVG reference: ${name}`);
    const asset = files.get(name);
    if (!asset) throw new Error(`Unknown SVG: ${name}`);
    const key = `${name}\0${theme}`,
      cached = svgCache.get(key);
    if (cached?.version === asset.version) return cached;
    let content = await readFile(path.join(root, name), "utf8");
    content = content.replace(
      /<svg\b([^>]*)>/,
      (_, attrs) =>
        `<svg${attrs.replace(/\sdata-theme\s*=\s*(['"]).*?\1/g, "")} data-theme="${theme}">`,
    );
    const dependencies = [name];
    const matches = [
      ...content.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])([^"']+)\1/g),
    ];
    for (const match of matches) {
      const target = match[2];
      if (/^(?:#|data:|https?:|\/)/.test(target)) continue;
      const [relative, fragment] = target.split("#");
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(name), decodeURIComponent(relative)),
      );
      if (dependency.startsWith("../"))
        throw new Error(`SVG reference leaves design directory: ${target}`);
      let data, type;
      if (/\.svg$/i.test(dependency)) {
        const nested = await svg(dependency, theme, [...chain, name]);
        data = nested.body;
        type = "image/svg+xml";
        dependencies.push(...nested.dependencies);
      } else {
        const resolved = await realpath(path.join(root, dependency));
        if (!resolved.startsWith(root + path.sep))
          throw new Error("Asset reference leaves design directory.");
        data = await readFile(resolved);
        dependencies.push(dependency);
        type = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".webp": "image/webp",
        }[path.extname(dependency).toLowerCase()];
        if (!type) continue;
      }
      content = content.replace(
        match[0],
        `href="data:${type};base64,${Buffer.from(data).toString("base64")}${fragment ? "#" + fragment : ""}"`,
      );
    }
    const entry = {
      version: asset.version,
      body: Buffer.from(content),
      dependencies: [...new Set(dependencies)],
    };
    svgCache.set(key, entry);
    return entry;
  }
  async function body(request) {
    let text = "";
    for await (const chunk of request) {
      text += chunk;
      if (text.length > 16384) throw new Error("Request too large.");
    }
    return JSON.parse(text || "{}");
  }
  const server = createServer(async (request, response) => {
    try {
      const host = `127.0.0.1:${server.address().port}`;
      if (request.headers.host !== host) {
        response.writeHead(403);
        response.end("Use the local server URL.");
        return;
      }
      const url = new URL(request.url, `http://${host}`);
      if (request.method === "POST") {
        if (
          request.headers.origin &&
          request.headers.origin !== `http://${host}`
        ) {
          response.writeHead(403);
          response.end("Cross-origin request refused.");
          return;
        }
        const data = await body(request);
        if (url.pathname === "/open") {
          if (typeof data.directory !== "string")
            throw new Error("Enter a directory path.");
          await openDirectory(data.directory);
        } else if (url.pathname === "/preferences") {
          if (["system", "light", "dark"].includes(data.theme))
            state.theme = data.theme;
          if (
            root &&
            data.directory === root &&
            data.view &&
            ["x", "y", "scale"].every((k) => Number.isFinite(data.view[k])) &&
            data.view.scale > 0
          )
            state.views[root] = data.view;
          await persist();
        } else if (url.pathname === "/reveal") {
          if (!files.has(data.path)) throw new Error("Select an existing SVG.");
          const file = path.join(root, data.path),
            command =
              process.platform === "darwin"
                ? "open"
                : process.platform === "win32"
                  ? "explorer.exe"
                  : "xdg-open";
          const args =
            process.platform === "darwin"
              ? ["-R", file]
              : process.platform === "win32"
                ? [`/select,${file}`]
                : [path.dirname(file)];
          await new Promise((resolve, reject) => {
            const p = spawn(command, args, { stdio: "ignore" });
            p.on("error", reject);
            p.on("exit", (code) =>
              code === 0
                ? resolve()
                : reject(new Error("Could not reveal file.")),
            );
          });
        } else {
          response.writeHead(404);
          response.end();
          return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(manifest()));
        return;
      }
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        response.end();
        return;
      }
      if (url.pathname === "/events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
        });
        response.write(`data: ${JSON.stringify({ revision })}\n\n`);
        clients.add(response);
        response.on("close", () => clients.delete(response));
        return;
      }
      let content, type, etag;
      if (url.pathname === "/manifest") {
        content = JSON.stringify(manifest());
        type = "application/json";
      } else if (url.pathname.startsWith("/asset/")) {
        const name = decodeURIComponent(url.pathname.slice(7));
        if (!files.has(name)) {
          response.writeHead(404);
          response.end("Unknown SVG.");
          return;
        }
        const theme =
          url.searchParams.get("theme") === "dark" ? "dark" : "light";
        etag = `"${files.get(name).version}-${theme}"`;
        if (request.headers["if-none-match"] === etag) {
          response.writeHead(304);
          response.end();
          return;
        }
        content = (await svg(name, theme)).body;
        type = "image/svg+xml";
      } else {
        const file = {
          "/": "index.html",
          "/app.js": "app.js",
          "/style.css": "style.css",
        }[url.pathname];
        if (!file) {
          response.writeHead(404);
          response.end("Not found.");
          return;
        }
        content = await readFile(path.join(publicRoot, file));
        type = {
          "index.html": "text/html",
          "app.js": "text/javascript",
          "style.css": "text/css",
        }[file];
      }
      response.writeHead(200, {
        "Content-Type": `${type}; charset=utf-8`,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        ...(etag ? { ETag: etag } : {}),
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
  if (directory) {
    try {
      await openDirectory(directory);
    } catch (error) {
      watcher?.close();
      throw error;
    }
  }
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
  } catch (error) {
    watcher?.close();
    throw error;
  }
  const close = async () => {
    if (closing) return;
    closing = true;
    clearTimeout(refreshTimer);
    watcher?.close();
    for (const c of clients) c.end();
    await writes;
    await new Promise((resolve) => server.close(resolve));
  };
  return { url: `http://127.0.0.1:${server.address().port}/`, close };
}
