# Agent Design Gallery

Build and browse a repository's TSX design frames with a local browser canvas.

```sh
npm install -g @whzxc/agent-design-gallery
adg /path/to/design
```

Requires Node.js 22 or newer. Installation starts without a build step. TSX builds never load Chromium. Architecture builds use the bundled Playwright dependency to measure labels in Chromium, including in the viewer and hub. Each build worker starts one browser lazily, reuses it, and closes it after 30 seconds idle or on worker retirement. Browser toolkit commands also use Chromium; `check` and `render` share their existing browser with architecture measurement.

`adg` opens a loopback server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to use the current project. Stop the server with Ctrl+C.

## Migrate an existing installation

Install the new package, then run these one-time commands:

```sh
adg migrate /path/to/project
adg service migrate
```

`adg migrate [project]` defaults to the current directory. It renames `sdg.config.mjs`, `.js` or `.ts` to
`adg.config.*`, rewrites design-source imports from `sdg` (including runtime subpaths and `sdg:self`) to `adg`,
updates design editor paths and `.sdg/` entries in the project's `.gitignore` files, deletes the old generated
`design/.sdg/` directory and regenerates `design/.adg/` (using the configured design directory). It prints each
change and is safe to repeat. When both config names exist, it refuses before changing files. Normal commands
finding only an old current-project config stop with guidance to run `adg migrate`. `diff` migrates a legacy base inside its disposable historical tree and reports the change.

On macOS, `adg service migrate` stops `org.svg-design-gallery.hub`, moves its entire state directory from
`svg-design-gallery` to `agent-design-gallery`, and replaces the LaunchAgent with `org.agent-design-gallery.hub`
using the current Node and CLI paths and the previous port. It resolves the source from the old LaunchAgent's
`--state-dir`, or `$XDG_STATE_HOME/svg-design-gallery` (default `~/.local/state/svg-design-gallery`). The destination
is `$XDG_STATE_HOME/agent-design-gallery` by default; `--state-dir` selects a different destination. It refuses an
existing target directory or new LaunchAgent. It prints steps and then lists other LaunchAgents still referencing
the old state path without editing them or printing keys. Registry, preferences, caches and logs move together.
The stored key prefix changes to `adg_`; update browser access with the new key through `adg serve --print-key`.

## Viewer controls

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a frame to select its variant; double-click or press Enter to focus it. Hover an exported component inside a frame to outline its root, then click to inspect its source and export. Arrow keys pan; +/− zoom; 0 fits all; 1 sets the canvas to 100% around the usable canvas center. Escape clears the selection (or closes the current search, dialog or menu). Back returns to the previous selection and camera.

The left toolbar holds Contents, the project picker, scope tabs, and search. **Tokens** appears first when the project provides a token file. A clean project URL opens the first nonempty design layer, normally **Components**. Use the tabs to switch layers or choose **All designs**. Contents starts closed and opens over the canvas. Asset search opens Contents with matches from the current scope. Click a group or asset name to focus it, or use its trailing **Render only** action to open it independently. An isolated asset lists its frames in Contents. Search and Fit all work within the current scope. Back restores the previous scope, selection and camera.

Path links locate a selection within its design hierarchy. Query links open an independent layer, group, source, or frame. Copy the viewer URL to share its current view, or use `adg link` to generate either form for a specific target.

## Share a design update

```sh
adg link https://gallery.example/p/project/ --asset=components/button.tsx --frame=disabled
adg link https://gallery.example/p/project/ --asset=components/button.tsx --frame=disabled --mode=path
adg open ./design --asset=components/button.tsx --frame=disabled --no-open
adg render components/button --frame=disabled --theme=dark --out-dir=output/review --json
```

Use the independent link in a change report. Add the path link when the surrounding assets matter. Use the project URL on a hub the recipient can reach. `adg open` provides a live loopback preview while its server runs. `render` exports exact frame PNGs for attachments or automation. Without `--theme`, it exports both themes. See the [review handoff workflow](docs/design-toolkit.md#review-handoff).

Every command accepts `--json`: finite commands return one versioned envelope, while foreground `open`/`serve` stream NDJSON events. `render` PNGs are in `data.captures`, with CSS and PNG pixel dimensions. See the [agent CLI interface](docs/agent-interface.md) for schemas, exits and recovery actions.

The rightmost toolbar button opens the Inspector for the selected node. It starts closed and overlays the canvas. It follows the selection and shows source path, frame name, dimensions, frames, and discovered **Uses** / **Used by** relationships. Indirect relationships are muted with their shortest `via` path. Click a relationship to focus the source, or to open it by itself when outside the current scope. An element selection shows its owning export and matching frames from the current scope. `GET /relationships` explicitly computes the complete direct graph as JSON, keyed by source path with `uses` and `usedBy` arrays.

Click a canvas source or frame title to select it and copy its name. The copy icon copies without changing the selection and appears on hover or keyboard focus. Section titles also copy their names. Enter and Space activate a focused title. A check confirms a successful copy for 1.2 seconds. The inspector has separate source-path and frame-name copy controls.

**More** opens Fullscreen, System/Light/Dark theme choices, canvas background choices, **Arrange current group**, and **Keyboard shortcuts** (also available with ?).

The bottom zoom bar holds Back, zoom out, the zoom menu, zoom in, Fit, and Minimap. The zoom menu offers Fit all, Fit group, Fit selection, and Zoom to 100%. Fit uses the selected frame or element, source, or current group. The minimap moves the camera when clicked. The inspector lists forms or frames with their geometric sizes and notes.



## Sources and layout

Design sources are TSX files directly in `design/components/`, `design/modules/` and `design/surfaces/`. Default discovery also includes `design/studies/` once it contains a direct TSX study; explicit `sources` lists remain unchanged. Fixtures and artwork stay in their supporting directories. Import `Frame` and `Icon` from `adg`, export reusable component functions, and default-export a function returning the declared frames. JSX builds static HTML and inline SVG without React or browser scripts. Tailwind v4 utilities resolve through the project's `design/tokens.css`; light and dark are selected by the document's `data-theme`.

Choose the **Tokens** tab to inspect the current project's `design/tokens.css`. Filter by category in Contents or search the table by name or value from the toolbar, compare light and dark declarations side by side, and click a token name to copy it. Colors show swatches, and pixel values for spacing, sizes, and radii show a visual sample. Share `?scope=tokens` to open the catalog directly.

Follow the [design asset rules](docs/asset-rules.md) for placement, ownership, states, frame names, fidelity, lifecycle and studies. The [adoption guide](docs/asset-rules.md#adopting-an-existing-project) covers inventory, a read-only audit with `file / problem / suggested fix` findings, review batches, and the mappings/governance each consumer keeps locally. `sources` orders production layers from lower to higher; `check` reports upward imports. Set `check: { importDirection: false }` to opt out of that lint while keeping frame checks.

A component source is one set: frames run in source order with 32px gaps, wrap before 1600px, and have 48px between rows. Sets pad forms by 24px at the sides and bottom and 36px at the top. A surface source is one flow: each frame receives 16px padding and follows the flow layout. Frame notes appear in the inspector, outside the drawing. Full sheet has been removed; choose a declared form or frame.

Legacy SVGs remain browsable with their existing geometric crops and relative embedded artwork. Files without declarations keep a whole-file preview. New toolkit commands accept TSX only; an SVG directly in `design/components/` or `design/surfaces/` must be converted. Imported SVG artwork belongs in `design/art/`; PNG, JPEG and WebP imports become data URLs. Add `?url` to an import under `design/art/` to embed any file as a data URL, including self-contained SVG previews.

Sets and flows pack into sections, and sections into a stable world. Saving a source, imported component, artwork or tokens refreshes affected previews without moving the camera. Unchanged regions retain their positions; new or enlarged regions move below existing content. Use Arrange current group to compact after structural changes. Labels retain constant screen sizes and hide when they collide with chrome or other labels.

Files group by directory unless `gallery.json` supplies project groups. Entries must point directly into configured source directories:

```json
{
  "groups": [
    { "title": "Controls", "assets": ["components/button.tsx", "components/field.tsx"] },
    { "title": "Settings", "assets": ["surfaces/settings.tsx"] }
  ]
}
```

Unlisted assets remain in directory groups. Projects own their TSX sources, artwork, tokens, configuration, and Git history. Theme, sidebar, inspector, and per-directory camera and selection preferences stay in `$XDG_STATE_HOME/agent-design-gallery/state.json`, defaulting to `~/.local/state/agent-design-gallery/state.json`. Refreshing or reopening a directory restores its zoom, position, selected component and form. Canvas asset headings show the source's last modification time in local time; hover for the complete timestamp. `--state-dir` isolates preferences.

## Design toolkit

Run commands from inside the project:

```sh
adg init
adg check
adg render surfaces/example --frame=default --scale=2
adg check --read-only
adg diff --base=HEAD --json
adg owner --file=ui/controls.tsx --symbol=Button --json
adg owner --text="Save changes" --locale=en --json
adg impact --source=design/components/button.tsx --part=Button --json
adg impact --base=HEAD --json
```

`init` creates tokens, components/modules/surfaces, fixtures/art, editor configuration and ignore entries. A fresh library gets one `example.tsx` per production layer, composed downward with shared fixture data; existing libraries receive no demo sources. Existing authored files are preserved, declarations are refreshed, and missing ignore entries are appended. Starter configuration requires ADG 0.5.0 or newer. `check --read-only` skips declarations and build files for an audit. Projects do not install ADG as a dependency.

Builds produce standalone HTML and renders produce `<frame>-light.png` and `<frame>-dark.png` under `output/design/<source>/`. After configuring an implementation adapter and frame fixture/capture, use `adg compare <source> --frame=<name>` or `adg compare --all`. Flags override Frame capture props; `--all` writes a linked HTML index and `summary.json` under `output/design/compare/`. `sync` and `measure` have been removed.

`adg diff --base=<rev>` writes per-frame/theme before, after and difference PNGs plus
`report.json` for Git and working-tree sources, including added/removed frames. Existing
frames require exact pixels and size. New part Frames can declare `parent` and use
consumer `diff.thresholds`; a `structural` batch requires full existing-frame coverage
in both themes. Exit 0 is `identical`/`structural`, 1 is completed `changed`, and 2 is
incomplete execution. See [parts and classifier limits](docs/design-toolkit.md#git-frame-diff)
and the [JSON contract](docs/agent-interface.md#diff).

`adg owner` looks up design sources, parts, frames and tokens from an implementation
file/directory/glob, rendered text, absolute CSS color or token name. File lookup uses
optional [implementation.json mappings](docs/design-toolkit.md#implementation-mappings).
Text answers include literal-search `authoredIn` copy locations; token references remain
separate from computed paint. Both themes are searched by default. Broad color/token
answers can be around 100 KB; read `owners` first and narrow with `--theme`. See the
[owner JSON contract](docs/agent-interface.md#owner) for ranks, evidence and diagnostics.

`adg impact` lists conservative direct/transitive frame candidates from sources, parts, tokens,
implementation mappings or exact Git endpoints. It uses emitted provenance and lexical token
reachability, with compact optional `--explain` witnesses. Noncandidates are counted, not listed.
This segment supplies candidate queries; it does not yet prove unaffected frames or selectively
render them. See the [impact contract](docs/agent-interface.md#impact).

See the [toolkit contract](docs/design-toolkit.md) for source format and compare adapters, and the [changelog](CHANGELOG.md) for version changes. Node.js executes design modules at build time; open sources you trust.

## Architecture sources

ADG discovers Mermaid `.mmd` files recursively under the project-root `arch/` directory.
They appear in the Arch scope alongside UI sources, with one `default` frame per diagram.
Set `arch: 'architecture'` or `arch: false` in the project config to change discovery.
Project tokens paint both themes; an optional adjacent `.md` supplies Inspector notes,
code owners and status. Pele is pinned to 1.12.0.

```sh
adg open . --asset=arch/system-map.mmd
adg check arch/system-map.mmd --read-only
adg render arch/system-map.mmd --theme=both --json
adg open . --asset=arch/system-map.mmd --base=HEAD
```

See [architecture source format](docs/design-toolkit.md#architecture-sources) for the
semantic vocabulary, sidecar grammar and checks.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
npm test
```

The development server serves the checked-in frontend and `design/tokens.css` directly. A globally installed server serves its installed package; repository edits and Git commits do not update that installation. Reload after static frontend edits. Restart after server/toolkit edits or changes to `public/assets.js`, `public/layout.js` or `public/selection.js`, whose combined hash identifies the viewer cache context. `npm pack` copies the shared viewer tokens into the packaged browser files. No frontend framework is required.

After a completed runtime or dependency milestone passes its relevant checks and required design approvals, maintainers update the global installation and verify the deployed viewer as part of delivery. Follow [local updates](docs/local-updates.md) for packing, installation, restart conditions and endpoint verification. Documentation-only, test-only and fixture-only commits skip this update.

Maintainers publish releases through [GitHub Actions](https://github.com/whzxc/agent-design-gallery/actions/workflows/publish.yml) using [npm trusted publishing](docs/npm-release.md). Local milestone updates can install a tarball without publishing or changing the package version.

See [ADG design](docs/design.md), [architecture](docs/architecture.md), and [performance](docs/performance.md). ARC's MIT-licensed gallery is the starting point; the MIT license and Lucide/Feather icon notices are retained in `LICENSE`.

## Resident hub

`adg open <dir>` stays independent: no registry or hub is required, and the port is random by default. It accepts a design directory or a configured project root. The browser is read-only apart from viewer preferences. Select directories from the CLI; the browser has no reveal action.

```sh
adg root add ~/Developer --depth 2
adg root list
adg root scan                 # Explicit rescan of registered roots
adg root scan ~/Developer
adg root remove ~/Developer
adg serve --port 4310
```

Root commands output JSON. `--state-dir <path>` isolates registry and preferences. Scans run on add and explicit CLI/web rescan only. Depth defaults to 2 and accepts 0–3; hidden directories, node_modules, symlinks and Git worktrees (`.git` is a file) are skipped. Only directories containing `adg.config.mjs`, `.js` or `.ts` are projects. TypeScript configs load through esbuild.

The hub binds 127.0.0.1. `GET /api/projects` returns name, path, design directory, stable slug and `/p/<slug>/` route, branch, short HEAD, last design commit time and dirty flag, source count and version compatibility. `frameCount` is null until an active viewer has built every source, then reports the exact count. Config errors are returned per project. `GET /api/roots` lists roots; `POST /api/rescan` rescans registered roots with no path input. Project viewers start on demand and stop after five idle minutes; an open SSE stream keeps a viewer active. The initial hub page is intentionally unstyled pending design approval.

### Access keys and instances

The hub creates `hub.key` in its state directory on first start with mode 0600. Direct-local data requests are exempt: Host must be localhost, 127.0.0.1 or ::1, with no Forwarded or X-Forwarded-* header present. The peer IP is never used for this decision.

```sh
adg serve --print-key                 # Print the current key and exit
adg serve --rotate-key                # Replace the key and exit
adg serve --rotate-key --print-key    # Replace and print it
```

Rotation applies to new requests in a running hub immediately. Existing streams end when disconnected. Open the hub or a canonical viewer URL with `?key=adg_...` once: the public HTML/JS shell stores the key in localStorage (`adg-key`) and removes the parameter using history.replaceState. There is no cookie or authentication redirect. Shells contain no project data. Data requests use `Authorization: Bearer <key>`; the server also accepts `X-ADG-Key` and `?key=`. SSE uses a query key. Frames, SVGs and artwork are fetched with headers and become self-contained blob/data previews. Missing or invalid credentials return JSON 401 and the shell shows a minimal 401 state.

`adg open` registers itself in `<state>/instances/<id>.json` and removes its record on exit, independently of whether a hub is running. `GET /api/health` returns `{ id, capabilities: { keyAuth: 1 } }`. `GET /api/instances` checks PID liveness and the health ID, pruning dead or mismatched records. An alive PID with missing health or a viewer without the key-auth capability remains listed as not proxyable. Records include pid, port, directory, project name, branch, worktree flag, start time and ADG version.

Close a verified live instance from its row on the hub home or in the project switcher. Closing the current viewer returns to the hub home. The switcher shows the instance's port to distinguish viewers with the same name. `POST /api/instances/<id>/stop` rechecks the registered instance before asking its process to shut down.

`/i/<id>/` streams from that instance's own server, including its viewer runtime and SSE. The hub serves the project switcher and its instance controls for both prefixed routes. Public shell requests pass through without data; every proxied data request is authenticated before forwarding, then Authorization, X-ADG-Key, query key, cookies and forwarded headers are removed upstream. Relative viewer URLs preserve `/p/<slug>/` and `/i/<id>/`. Browser writes through either prefix are limited to viewer preferences and derived cache data.

### nginx

Keep the listener on loopback and terminate remote HTTPS at nginx. Preserve the original Host, the full URI prefixes and all query parameters. nginx must set forwarded headers on **every** request, including requests whose original Host is localhost: this prevents the direct-local exemption through a local proxy. Supply the following in a root location:

```nginx
location / {
    proxy_pass http://127.0.0.1:4310;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Forwarded "";
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-ADG-Key $http_x_adg_key;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

The proxy_pass has no URI suffix; do not strip `/p/<slug>/` or `/i/<id>/`. Disable SSE buffering and caching. Avoid logging query strings or key headers: the initial URL and SSE carry the key. Cookies are not used.


### macOS resident service

```sh
adg service install [--port 4310] [--state-dir /absolute/state/path]
adg service status
adg service logs
adg service uninstall
```

The LaunchAgent `org.agent-design-gallery.hub` starts the resident hub at login with RunAtLoad and keeps it running with KeepAlive. It binds loopback and uses the same registry/key and auth contract as `adg serve`. Installation records absolute Node and CLI paths in `~/Library/LaunchAgents/org.agent-design-gallery.hub.plist`, so launchd needs no shell PATH. Reinstall after moving the CLI or replacing the recorded Node installation.

`status` prints JSON with installed/loaded state, PID, plist and log paths. `logs` prints the last 200 lines of each log. stdout and stderr go to `service.stdout.log` and `service.stderr.log` in the state directory. After an install with a custom state directory, status/logs/uninstall recover that directory from the plist when no override is given. Uninstall unloads the job and removes its plist, retaining registry, key, preferences and logs. Service commands on other platforms return an explicit unsupported error; `adg serve` remains available there.
