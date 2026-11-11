# Architecture

`src/cli.mjs` dispatches commands; `src/open.mjs` starts the loopback service and opens the default browser. `src/server.mjs` reads an explicitly opened directory, serves built TSX frames and legacy SVGs, watches file changes, and persists local preferences. `public/` contains the standalone viewer. The viewer uses `design/tokens.css` during development and its `public/tokens.css` copy in the package; `prepack` refreshes that copy. `public/icons.js` contains copied Lucide geometry with a 1.75px rendered stroke and no runtime icon dependency.

The viewer fills the window with Canvas 2D and positions floating navigation, menus, dialogs, and inspection controls above it. Camera input and drawing are coalesced into animation frames, independently of navigation rendering. Only artboards intersecting the viewport and its retained drawing margin are rasterized. After 150 ms without camera input, a settled drawing includes a quarter of the shorter viewport dimension on each side; pans translate that canvas until they reach its edge, then refresh it. Zoom changes redraw at the new scale without that margin, preserving constant-width borders. A separate canvas retains the static dot background, rebuilt only when its colors, size or pixel ratio change. During gestures the canvas uses cached preview rasters at the actual display scale; when settled it upgrades previews or draws the original SVG for detail. This avoids rebuilding a component tree or mounting inline SVG trees on every input event.

`public/assets.js` measures explicit outermost form/frame declarations on a geometry-cache miss in temporary, script-disabled sandbox documents. Measured frame lists, bounds, ownership geometry and background values persist by source output hash, theme and browser user-agent/pixel-ratio context, prefixed with the `adaptive-wrap-v1` geometry version. Viewer measurement/layout code changes invalidate that context. Warm loads arrange from this metadata before source preparation; cold loads publish measured sources as they finish and perform the same final complete arrangement regardless of completion order. Bounds are geometric, without shadow expansion. TSX component forms pack in source order with 32px gaps and 48px row gaps, wrapping at `ceil(sqrt(sum((width + 32) × (height + 48)) × 1.6))`, clamped to 1600–6400px; an oversized individual form remains intact. Legacy SVG sets preserve their source arrangement. Sets have 24px side/bottom and 36px top padding; surface frames receive 16px padding. `public/layout.js` packs sets and flows together with a height-descending skyline (width descending, then source order for ties); world sections use the same skyline. Section gaps are 64px horizontally and 112px vertically, world gaps are 240px, and section padding remains 64px at the sides/bottom and 104px at the top. Width searches minimize bounding-box area with a soft logarithmic aspect penalty of 0.6, targeting 1.6 for sections and 1.5 for the world. Width steps remain 50/100; safe-grid threshold skipping and the bounded winning-width cache avoid redundant packing. Cache keys include the algorithm version, scoring parameters, gaps and ordered geometry. Canvas order can change, while returned group/block arrays preserve source identities and order for navigation and incremental placement. Surface frame rows and the usable fit area remain independent of this packing. The reference-size unit test reproduces `fixtures/arc-sample.layout.json`. Layout is independent of camera and floating panels.

Previews are SVG images with cropped viewBoxes, preserving document-local styles, identifiers, filters, and aspect ratios. Top-level legacy annotations are omitted from crops. The inspector shows declared frames and their notes; there is no Full sheet action. `public/labels.js` retains positioned DOM text above the drawing canvas. A pan translates one retained label layer for up to 32px before refreshing visible labels without reading chrome geometry. Scale changes recompute positions and collisions on the next animation frame; gesture completion, settling, viewport changes and chrome changes also rebuild the visible set. Chrome bounds and text metrics are cached, with font readiness clearing text metrics. Captions are tested independently. Asset headings follow the visible canvas edge when their original anchor leaves the viewport, prioritize the selected asset and progressively omit optional timestamps and counts when space is limited. Labels remain accessible to DOM-based comparison. Artboards use their asset's canvas color, a 1px border, and a 2px selection ring.

The server uses `src/toolkit/build-store.mjs` for TSX builds. Each source has a content hash over its rendered frames, CSS, imports and source identity; its input hash covers the actual bytes read from the source and dependency closure. Package/toolkit versions, discovery configuration and the code-file inventory identify the persistent build namespace. Dependency hashes are validated on restart. A helper addition or removal invalidates resolution-sensitive builds; ordinary edits use reverse dependency edges. Superseded work is cancelled, including first builds whose dependency closure is not known yet. The next scoped manifest rehashes invalidated, previously built sources in that scope. Unchanged output hashes reuse the existing geometry and previews. Filesystem modification times still update in navigation and labels.

`src/toolkit/build-worker.mjs` evaluates project modules in a lazy pool of two workers, each with a 256 MiB old-space limit. A worker is replaced after 32 attempts, including failures, so Node's ESM module map has a bounded lifetime. The parent retains compact payloads in a 32 MiB LRU; its build-cache disk budget is 256 MiB. CLI check/render commands keep their direct builder path. `GET /api/cache-stats` reports process memory, live workers, recycling/cancellation counts and cache sizes for performance tooling.

`src/viewer-cache.mjs` stores measured metadata and ready-cropped SVGs under the server's state directory, separate from design sources. Its metadata LRU is 32 MiB; its disk LRU is 256 MiB with at most 2,048 records. Manifest references refresh LRU recency so unchanged current sources stay cached while old revisions are evicted. The initial manifest supplies measured metadata for the requested theme; subsequent manifests carry source hashes, metadata references and cached preview IDs. The compact source response carries frame HTML and one shared stylesheet, with no second copy of every full frame document. Relationships use the cached source graph. Cache writes persist geometry and generated cropped previews once; the browser does not upload a second full-source SVG.

The browser prioritizes preview work by viewport proximity and defers new preparation/decode work during camera gestures. It first uses ready-cropped persistent SVGs; a missing or evicted crop lazily rebuilds only its owning source. Its prepared-source LRU is 64 MiB and shares identical stylesheet text while restoring the exact stylesheet for individual crops. The existing offscreen preview LRU evicts obsolete output hashes and themes while retaining current visible previews. Packing retains only bounded winning widths and repacks fresh metadata; those scalar choices are persisted for warm restart. No alternative far-zoom representation is used.

Local legacy SVG references are embedded recursively and retain their dependency invalidation behavior. An update sends an SSE revision after invalidation, before any scoped rebuild. The camera belongs to the directory and scope and survives refresh; unchanged regions retain positions while enlarged or new regions move below existing content until Arrange current group is invoked. Initial cold streaming always uses fresh arrangement, so source completion order does not change the final layout.

The directory tree renders from the manifest before asset preparation. Group expansion and filename search are available immediately; a navigation choice made during preparation runs after layout. On a measurement miss, forms from one TSX source share a single sandbox document and its compiled stylesheet. Each form replaces the specimen and restores its declared viewport before fonts, images and bounds are measured, avoiding a document navigation for every form.

Preferences store the camera and selected source, named form and group per directory and render scope. The viewer saves selection changes as well as camera input, and flushes pending state with a keepalive request on page hide or backgrounding. The Contents and Inspector overlays start closed on each page entry. Toggling them leaves the camera unchanged. Restoring a scope resolves saved names against its current assets. The manifest also exposes each source's filesystem `modifiedAt` in milliseconds; canvas headings render that value in the browser's local time zone.

The ephemeral server writes viewer preferences, refreshes ignored editor declarations and binds to `127.0.0.1`. The CLI selects its directory once. Browser mutations are limited to preferences and derived cache data; directory opening and reveal APIs are removed. Asset paths come from discovered source entries; symlinks are not scanned.

The viewer shell sets the base URL to the direct viewer, project, or live instance root. This keeps data requests scoped to that viewer while its address bar navigates through `view/` paths. Query locators choose a render scope and path locators choose a position within a layer or the full canvas. `public/view-route.js` encodes these locators for the browser and CLI.

| Route | Purpose |
| --- | --- |
| `GET manifest?scope=...&context=...&theme=...` | Catalog for `default`, `all`, `layer:<name>`, `group:<name>` or `asset:<path>`, with the resolved scope and layer list. An omitted scope returns the full catalog for tooling. `metadata=1` includes measured geometry for the requested theme. `initial=1` honors the persisted theme. |
| `GET asset/<source>` | Compact TSX `{hash,frames,css,imports,component}` or a legacy SVG. `frame=<name>` returns only the named TSX frame. This variant has a distinct ETag and uses session-local browser metadata and previews. |
| `GET metadata/<hash>?theme=...&context=...` | One cached geometry record and available crop IDs. |
| `POST metadata/<hash>?theme=...&context=...` | Persist browser-measured geometry. |
| `GET/POST preview/<hash>?theme=...&context=...&crop=...` | Load or persist an exact ready-cropped SVG. |
| `POST catalog?context=...` | Persist the bounded scalar packing cache. |
| `GET relationships` | Full source graph; builds uncached sources when explicitly requested. The viewer uses the import data already available from its manifests and asset requests. |
| `GET events` | Revision/error SSE stream. |

`window.__adg.metadataComplete`, `cachePending` and `cacheFlush` let tooling separate visible-ready latency from cache priming before a warm reload or server restart. Cache misses regenerate the same output; design sources and Git history remain project-owned.


`src/hub.mjs` adds the resident loopback hub. `src/hub/registry.mjs` persists registered roots and explicit scan results in `registry.json` under the state directory. Only config-bearing directories are projects. Discovery does not build or watch sources. Project metadata reads current Git state and config compatibility; exact frame counts remain null until a viewer builds all sources. Slugs use the normalized directory basename, adding the parent name and then a short path hash only for collisions. New projects are assigned in canonical path order; persisted assignments take priority on rescans. The next explicit scan upgrades legacy always-hashed slugs. `/p/<slug>/` forwards to an on-demand viewer server with isolated project preferences. Relative browser URLs preserve the prefix. A five-minute idle timeout releases the server, watcher and caches; active streaming requests prevent eviction. Root rescans update the registry; project proxy POSTs are limited to preferences and derived cache data.

`src/toolkit/` implements the [v2 contract](design-toolkit.md):

- `config.mjs` discovers project roots and validates version requirements and compare adapters. `project.mjs` scaffolds projects, refreshes editor declarations and selects TSX sources; legacy source SVGs fail with a conversion path.
- `runtime.mjs` is the automatic JSX string runtime. It escapes text/attributes, emits void elements, records Frame metadata and draws pinned Lucide geometry. `runtime.d.ts` supplies JSX, Frame, Icon and capture types; generated asset module declarations cover SVG and raster imports.
- `build.mjs` bundles each TSX entry through esbuild. The resolver maps `adg` and JSX runtime imports to the installed runtime, confines relative imports to the design directory, and inlines artwork. Imports ending in `?url` embed any file under `design/art/` as a data URL; they retain a normal file dependency for watcher invalidation. Development JSX locations identify forbidden markup. Modules execute at build time and are trusted project code.
- `tokens.mjs` parses the two token blocks and generates an inline reference Tailwind theme. Default palettes, font sizes/families, radii and shadows are removed; spacing remains. Classes are collected from rendered markup, then `compile().build()` produces CSS referencing original token variables. Each frame becomes a standalone HTML document.
- `commands.mjs` loads frames in both themes, checks computed paint, root/capture constraints and geometry, or renders selected frames at the requested device scale. TSX builds never load Chromium; architecture builds use it for label measurement. Browser commands also load Chromium; `check` and `render` pass their existing browser into architecture builds.
- `render`/`compare` design raster captures use a fresh page and browser context per frame and theme. `render` reuses the browser process and closes each page after its capture; `compare` creates independent design and implementation pages. Replacing a shared page's content retains Chromium image resampling state and can change PNG bytes with render order.
- `document.mjs` reads rendered text lines, fields and clipping for both comparison sides, merging adjacent same-line segments. `text.mjs` pairs equal text nearest-first and compares anchored edges, centers and widths.
- `compare.mjs` applies the fixture environment and Frame capture settings with flag overrides, waits for stable text geometry, captures both sides and writes reports. Browser canvas composes overlays. `--all` adds a linked HTML index and JSON summary.

ADG's repository-only `adg.config.mjs` starts the server on `fixtures/arc-sample` with temporary state and the explicit states in `fixtures/viewer.mjs`. These servers disable preference persistence. Only a server explicitly given fixture definitions interprets the fixture query parameter; normal installations ignore it. The viewer applies selection, camera, theme, panels, and menus before setting `data-fixture-ready`, and waits for visible previews to draw. The tooltip adapter then hovers Inspector. Fixture modules and sample assets stay outside the npm package.


## Git frame diff pipeline

[`src/toolkit/diff.mjs`](../src/toolkit/diff.mjs) orchestrates the finite `diff` command.
Its [agent contract](agent-interface.md#diff) defines the envelope, report and artifacts;
[the toolkit](design-toolkit.md#git-frame-diff) defines authoring, policy and classifier
limits. The working tree remains the current input throughout the command.

1. **Revision inputs.** `diff-inputs.mjs` uses `arch-git.mjs` to resolve a commit and
   materialize its tracked tree, preserving a nested project's repository-relative
   location. Binary `cat-file --batch` blobs stream to disk with backpressure rather
   than accumulating a repository-sized buffer. The owned directory is disposable,
   without a Git worktree registration. Required unavailable external inputs retain
   actionable diagnostics at the original repository path.
2. **Historical environment.** Load the base revision's config/helpers, tokens, art,
   imports and source directories. If it has a legacy config, run the existing project
   migration on the disposable tree before loading it. Record changes and emit
   `DIFF_BASE_MIGRATED`. Base config always uses current `node_modules`; differing
   applicable manifests/lockfiles emit `DIFF_BASE_ENVIRONMENT_REUSED`. Only an actual
   failed historical import yields `DIFF_BASE_DEPENDENCIES_UNAVAILABLE`. Temporary
   paths in errors, logs and recovery context are translated to original paths. No
   dependency installation or compare-adapter lifecycle callback runs.
3. **Union and builds.** Match the selected source/frame union by exact source/name.
   Preserve added/removed rows and attach rename candidates without auto-matching.
   Build revision-local documents with `write:false`, sharing captured dependency
   bytes within each side and the existing bounded source-registration transform
   cache. Only selected sources and active parent dependencies build. A TSX entry
   executes its declared frames and compiles shared CSS, but only selected frames
   and explicit support parents are captured. Architecture sources borrow the same
   browser for label measurement and use plain revision-local tokens/sidecars.
4. **Exact capture.** One browser serves up to four pair jobs. An ordinary pair uses
   one fresh page/context for its frame/theme, replacing the document between base
   and current, then reusing that page for canvas decoding. Font/image readiness,
   fixed locale/timezone, reduced motion and capture scale are shared. CSS/device
   sizes and decoded pixels alone decide ordinary frames; no subtree snapshots or
   isolation work run for them. Captures are fresh, independent of viewer previews.
5. **Part evidence.** `Frame.parent` is shape-validated in `build.mjs` and preserved
   by the runtime/types. Only added TSX frames activate references. `part-diff.mjs`
   resolves parents and deduplicates support rows and target selectors.
   `part-snapshot.mjs` collects the current part and base/current parent target only:
   semantic elements/text, exact local geometry, computed paint, complete tokens,
   resource identities, clipping/backdrop, raster masks and edge regions. Two equal
   animation-frame observations and unchanged post-capture evidence share one
   monotonic five-second deadline. Unstable or unattributable paint produces a typed
   execution failure. The native parent PNG supplies the outward-rounded device
   crop with no resampling; crop origin and clipping remain report evidence.
6. **Classification.** `pixel-diff.mjs` runs the same pure comparator in unit tests
   and the browser, assigning every unequal pixel exactly once under classifier
   version 1. `diff-policy.mjs` resolves current consumer thresholds. Matching part
   snapshots with nonimperceptible residuals trigger one deduplicated base-parent
   isolation capture per selector/theme, with sibling paint temporarily hidden and
   original styles restored. External paint only receives boundary bleed inside the
   edge band; interior external paint stays `other`. Same-image raster regions have
   their own strict budget. Antialiasing requires stable local anchors, convex
   blends, bounded channel delta and a strict intermediate beyond anchor rounding
   residual. Full parent equality, snapshot/size equality and both-theme/full-project
   coverage gate structural approval independently of candidate pixel counts.
7. **Artifacts and cleanup.** Publish each comparison only after its PNG/snapshot
   artifacts and per-row JSON finish. Store selected rows and extra `support` rows
   separately; their IDs link full parent renders to cropped parts. JSON includes
   policy, class counts, findings, environment and phase wall timings. Close pages,
   browser and the disposable base tree before a completed gate verdict. Execution
   or cleanup failure retains completed rows with `complete:false` and `verdict:null`.
   The final manifest supports later review-sheet composition without re-rendering.

## Access and instance boundary

`src/http.mjs` defines the shared static shell allowlist and direct-local Host/header check. Static HTML, scripts and package viewer styles contain no project data and are public. Project shells do not start viewers; the first authenticated data request does. `src/hub/auth.mjs` creates the mode-0600 state key, reads the current key for every data request and compares SHA-256 digests with timingSafeEqual. Forwarded requests need Authorization Bearer, X-ADG-Key or a query key; any Forwarded or X-Forwarded-* header disables the loopback Host exemption. No decision depends on peer IP.

`public/auth.js` captures a query key into same-origin localStorage and removes it with history.replaceState. Shared dataFetch adds the header to every data fetch and shows a minimal 401 state. EventSource uses the query-key helper. Rendered SVG/HTML, artwork and cached previews remain behind the authenticated data boundary. Preview image URLs use the same key helper; fetch/blob fallback preserves the unauthorized flow and handles disk-cache misses. There are no auth cookies or auth redirects. The hub shell fetches its lists and rescan through the same helper.

`src/hub/instances.mjs` is independent of hub startup and registry discovery. `adg open` registers the actual bound port and health ID after startup, and removes its JSON record on normal or signaled exit. The hub probes each record's PID and health ID, deleting dead/reused records while retaining alive legacy instances as not proxyable. Capability `keyAuth: 1` advertises the instance viewer's header/query auth protocol; without it the instance cannot be proxied. The reverse proxy always uses the instance's own server. Public shell routes use that server's static code; authenticated data and SSE are piped without buffering, with credentials and forwarded headers stripped upstream so the loopback-only instance stays independent of the hub. Only preference and derived-cache POSTs are forwarded; source and filesystem mutation APIs remain unavailable. Hub shutdown closes proxy streams without stopping independent instances.

Key rotation is atomic and applies to new requests immediately, including when the hub is already running. Existing authenticated SSE connections retain request-time authorization until reconnect. The nginx contract in README preserves Host, URI prefixes, headers and query keys, always marks forwarded requests, and disables SSE buffering/cache.


## Resident service

`src/service.mjs` manages the macOS user LaunchAgent `org.agent-design-gallery.hub`. ProgramArguments contain real absolute Node and CLI paths, `serve`, the selected port and an absolute state directory. RunAtLoad and KeepAlive provide login startup and process recovery. launchctl bootstrap/bootout/print manage only this job. stdout/stderr logs remain under the state directory, outside the package and project design files.

Install writes the plist under the user's Library/LaunchAgents and bootstraps the GUI domain. A bootstrap failure removes the new plist. Status returns structured installed/loaded state and runtime PID; logs prints a bounded tail. Existing plist arguments supply the custom state path for later status/logs/uninstall calls. Uninstall removes the job/plist while retaining state and logs. Other platforms fail explicitly. Absolute runtime paths must be refreshed by reinstalling after the Node or CLI location changes.

The resident service loads its installed package independently of the development checkout. Static shell files are read on each request with `Cache-Control: no-cache`; open browser tabs load new JavaScript on reload. Server and toolkit modules remain loaded until process restart. `src/server.mjs` also hashes `assets.js`, `layout.js` and `selection.js` once at module load to identify the viewer cache context, so updates to those frontend files require a hub restart and browser reload. Existing independent `adg open` processes retain their own runtime until reopened. See [local updates](local-updates.md) for milestone delivery.

## Architecture source pipeline

Configuration discovers regular `.mmd` files recursively in the project-root `arch`
directory, or the configured relative alternative. The server retains existing
TSX asset identities and adds project-root-relative architecture identities with
`layer: 'arch'`. Only Mermaid files and their sidecars enter this discovery. The
architecture watcher feeds both public asset names and design-relative dependency
names into the existing invalidation path; `.md` creation, edits and deletion all
refresh notes and cached previews through SSE.

`toolkit/arch.mjs` validates source statements and the small sidecar grammar, parses
with exactly Pele 1.12.0, measures label requests in Chromium using the project fonts,
and passes the structural model to Pele's synchronous Node renderer.
`arch-browser.mjs` gives each build worker one lazy measurement browser, reused
across builds with a fresh, closed page/context for each source. The browser closes
after 30 seconds without an active architecture build. Worker retirement requests
browser shutdown before terminating the thread; superseded or unresponsive workers
have a bounded shutdown. Chromium launch errors retain their installation guidance
and fail only architecture builds; the same worker continues building TSX sources.
CLI `check` and `render` supply the browser they already own and close it at command
completion.

The `renderArch(model, tokenSource)` boundary renders ordinary models and proposal
overlay models; `buildArch` also accepts a precomputed `model`. Pele's actual SVG edge IDs are
preserved: state diagrams use `edgeN`, flowcharts use model edge IDs such as
`L_A_B_0`, and sequence messages use `iN`. A future overlay must map these through
its diagram's parse model and source order, rather than assume one universal ID.

Each diagram produces one `default` frame, empty imports, shared token/architecture
CSS, and an Inspector note. The existing compact frame transport and HTML sandbox
measurement path are reused (their internal format tag remains `tsx`). Every new
visual, including the used-class legend, belongs inside the architecture artboard.
Viewer chrome, scope controls, navigation and camera handling are unchanged.

The build worker dispatches `.mmd` by kind, with a content snapshot covering source,
sidecar and tokens. A missing optional sidecar has an explicit hash state, so its
creation invalidates both live and restart caches. Build-store fingerprints include
the architecture renderer; payload hashes reuse existing geometry and cropped
preview caches for unchanged output. Pele loads only for architecture builds;
TSX-only builds retain their existing bundler and rendering path.

CLI source selection combines architecture and TSX inventories. `check` uses Pele
model edge/message counts (the flattened `graph.edges` for composite states), sidecar ownership checks and Chromium SVG shape/text
checks in both themes. `render` uses the existing isolated capture path and preserves
project-relative architecture output directories. The resident registry includes
architecture source counts and proxies the same viewer endpoints.

Semantic class extraction is restricted to flowchart and state diagrams. It reads
assigned classes from Pele's model and recognizes additional source assignments
within one line; classDiagram declarations and methods remain structural content.
Init/frontmatter paint checks inspect property keys, preserving prose titles and
quoted values such as `Background work`.

## Git proposal overlays

`arch-git.mjs` resolves a revision to one commit SHA for each request, locates the
repository even for a nested project and reads the base blob with Git. `arch-overlay.mjs`
compares parsed flowchart, state and sequence models. Flowchart membership and the
flattened state graph preserve node identity and parent relationships. Parallel
edges match by endpoints and occurrence; sequence messages use LCS alignment, with
adjacent same-endpoint replacements becoming changes. Removed elements are reinserted
as ghosts with surviving base parents or root placement. The combined model is still
a Pele parse model: its internal brand is retained, and base objects are copied before
reinsertion.

Label prefixes are part of the model before font measurement. After Pele renders,
computed classes are stamped onto the node/cluster, edge and edge-label groups using
actual rendered IDs: flowchart model edge IDs, state `edgeN`, and sequence `iN` IDs.
This also covers Pele renderers that omit edge class lists. Overlay CSS adds token
roles and stronger diff borders while preserving phase fills. The used-class legend,
commit caption and Inspector change list are assembled in the frame document.

The viewer carries `base` through its existing query/path locators and data/cache
requests, including hub proxies. The server creates independent build stores per
resolved base and displayed revision. Worker configuration selects the overlay builder;
ordinary requests keep the segment A builder and payload format. Overlay input/output
hashes include the immutable base blob identity as well as commit and current inputs.
Live source, sidecar and token invalidation reaches all active overlay stores. Browser
leases and worker retirement use the existing segment A lifecycle.

Overlay metadata/previews use their own content hashes and base cache context.
Camera/selection preferences also include the requested base, preserving normal views. Normal
metadata, build payloads and catalog caches are not overwritten. A source deleted
since base has no artboard; CLI rendering reports selected deletions in its base JSON
envelope. Unsupported kinds or type changes retain the current drawing and report the
comparison limit in the Inspector note. There is no viewer chrome addition.
