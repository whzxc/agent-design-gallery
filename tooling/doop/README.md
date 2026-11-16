# Experimental Doop bridge

One-way publication of a project's declared components, modules and surfaces from the globally installed `adg` into one dedicated Doop canvas. Git owns the source. A sync replaces remote HTML edits, preserves frame IDs, and removes retired managed frames. It does not import canvas edits or approval state into Git. Tooling is excluded by the package's `files` allowlist.

## Run

Use Node 22+, this checkout's installed dependencies and a global ADG compatible with the project. Start an upstream Doop checkout with `bun install` and `bun run dev`. The default local frontend is `http://localhost:4300`; its server and embedded PGlite use port 4400 and `data/pg`. Create a local account and an agent key. Keep the key in `DOOP_AGENT_KEY` in the process environment.

```sh
node tooling/doop/bridge.mjs sync \
  --project=/absolute/path/to/project \
  --state=/absolute/path/outside/git/doop-state.json \
  --endpoint=http://localhost:4300/mcp \
  --port=4317

node tooling/doop/bridge.mjs comments \
  --state=/absolute/path/outside/git/doop-state.json \
  --endpoint=http://localhost:4300/mcp

node --test tooling/doop/bridge.test.mjs
```

`sync` starts and stops an isolated `adg open` process and a local Chromium used to measure frames. Use an unused port. The state file binds one project and endpoint to a canvas, maps frame and element IDs, and is saved after each successful mutation. A lock directory rejects simultaneous writers using that state. After an interrupted process, verify that it has stopped before removing its stale `.lock` directory. Keep the state file for subsequent runs. Start a separate state file for another instance. The command prints JSON counts and build/upload times. It reads back the canvas after synchronization.

Pages are `components`, `modules` and `surfaces`. Each source frame is a row with light on the left and dark on the right, at its measured intrinsic size. Names are `<project-relative-source>#<frame> [<theme>]`. The document carries the original compiled CSS, token blocks, inline SVG and data URLs. Theme is fixed on its document root. Doop's appearance setting controls its shell independently.

The bridge uses stateless HTTP MCP with the agent key as bearer. Upstream REST `/api` requires a browser session. Doop adds a `data-doop-webfonts` stylesheet to stored HTML; the bridge ignores that injected link when deciding whether authored content changed. No-op synchronization leaves HTML and approval history untouched. Canvas position and dimensions are restored to generated layout on sync.

## Feedback mapping and limits

`comments` calls MCP `get_comments` and returns its threads with `adg.source`, `adg.frame`, `adg.theme`, element DOM path and enclosing exported owners. Canvas-level comments and unknown elements have no element mapping. Doop retains at most 100 comments per canvas in this API.

Element IDs are six-character hashes of structural DOM paths. They remain stable for text/style updates. Sibling insertion, reordering or replacement can move a path onto a different element. Comments report `mapped-at-last-sync`, not verified semantic identity. Before acting, compare the comment snippet with current HTML and use `adg inspect` / `adg owner` to identify the authored location. This POC does not carry a Git revision on comments, AST source ranges, or a semantic anchor migration. Structural drift needs handling before unattended use.

Use comment-only sharing for reviewers. The bridge account needs write access. A canvas owner can still edit in Doop, and the next sync restores Git content. Native Doop components, tokens, prototype links and approvals are not an ADG source model. ADG's CLI remains responsible for check/render/diff/owner/impact, token ownership and dependency information.

## Evaluation boundaries

The local evaluation can compare computed typography, paint, resource state and element geometry in macOS Chromium without taking screenshots. This checks the layout represented by `adg render`'s document construction. Pixel-level rasterization, pseudo-elements, shadows and remote-host/font behavior require a separate visual review when screenshots are allowed. Keep evidence outside the package and repository.
