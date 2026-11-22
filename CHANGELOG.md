# Changelog

## 0.17.11

- Load project art stylesheets and their embedded fonts in the Playable sandbox and offline transition playback.

## 0.17.10

- Embed linked art stylesheets and their data fonts in standalone review previews, with shared bytes and revision-local font selection.

## 0.17.9

- Scan authored string and template literals for Tailwind motion candidates, including variant maps. Remove unresolved class-expression findings.

## 0.17.8

- Inventory Tailwind motion in class strings, JSX and Vue bindings, and class helpers. Use exact `tailwind:` locators for mappings and exclusions, with unresolved class expressions reported separately.

## 0.17.7

- Match nested motion sidecars to their TSX sources on Windows. Keep portable path keys in motion coverage, implementation mappings, impact queries and recent-frame history.

## 0.17.6

- Keep a viewer's generated cache out of source discovery when its state directory lives inside the design tree.

## 0.17.5

- Declare instant cuts alongside timed tracks, including pattern-backed edges. Strict check recognizes the cut and the Playable inspector lists its targets.

## 0.17.4

- Compare omits text fully covered by an opaque sticky or fixed layer and retains visible overlaps.
- Playable opens a scope with flows when the default is empty and links to flows from explicitly empty scopes.
- Stabilize the browser refresh and Recent Updates cache tests by waiting for the applied edit and pinning the fixture runtime.

## 0.17.3

- Play pattern distance and scale with entry and exit opacity. The inspector identifies parameters that the discrete player omits.
- Exclude closed disclosure contents and hidden or zero-size subtrees from both sides of text comparison.

## 0.17.2

- Preserve runtime interruption and reduced-motion policies on pattern-backed edges and describe the discrete player's fallback in the inspector.
- Show authored action labels on the Playable map and reserve space for the Flow rail so the specimen remains interactive.

## 0.17.1

- Extend motion coverage and Tokens board usage to Vue, SCSS and HTML, plus element animations and recurring animation-frame callbacks. Report unscanned files and support reasoned exclusions for non-motion sites.

## 0.17.0

- Add `adg motion --coverage` to find unmapped implementation motion, ADG role defaults in use, unlabeled edges, and incomplete flow declarations during adoption.

## 0.16.0

- Add declarative frame transitions (`<stem>.motion.json`) with check/inspect/owner/impact CLI support (`--transitions`), interactive board playback and prototype stage, and offline transition playback and filmstrips in `adg review`.
- Add `adg motion --css` and `--json` for Motion tokens, spring curves, and project patterns.
- Add Playable and Recently Updated board views/filters (Git-period frame history) alongside viewer cache and cold/warm board performance fixes.
- Add `adg review --format=png` for compact 2× static summary sheets and `adg review --format=embed` for compact interactive review widgets with stacked frame cards, live light/dark switching, Before/After curtain slider, and click-to-enlarge zoom inspection.

## 0.15.0

- **Breaking:** Move Git design reviews out of the viewer. Generate a self-contained HTML file with `adg review --base=<rev>`. The `--base` viewer parameter still supports architecture overlays.
- Show native Before/After previews and pixel differences in one report. Mount frames on demand, enlarge each frame or pane, and open available source links on the project boards.
- Prefilter unchanged frames by rendered structure and fall back to pixel comparison. Use `adg review --exact` to compare every scheduled frame by pixels. Reports group direct and inherited changes, recognize moved frames, and retain healthy results when a source fails.
- **Breaking:** Remove `adg annotations` and retire old annotation data. Use pinned board comments with deep links and the `adg comments` commands to read, reply to, and resolve threads. The JSON command envelope is now schema version 2.
- Present the design library as chapter boards with responsive specimen spans, deterministic placement, layer-scoped navigation, and a visual Tokens board.
- Warn about component or module sources without chapters and chapters with more than 12 sources.
- Support `--theme=system` for render and diff. Impacted diffs include a compact, single-theme review sheet of up to 12 cells.

## 0.14.1

- Fix `impact` and `--impacted` worker builds on module feature folders so feature-internal files do not record unread `tokens.css` dependency hashes.

## 0.14.0

- Write one self-contained `index.html` review page in the overwritten `<configured output>/diff` directory from `adg diff --base=<rev> --impacted`, showing `added`, `removed` and `changed` frame counts (`data.review`) at the top followed by both-theme before, after and difference views side by side.
- Serve the same Git-derived frame review on clean viewer URLs with `?base=<rev>` in the hub and direct viewer, and emit that single review URL from `adg link <viewer-url> --base=<rev>`.
- Capture both themes of an impacted frame during `adg diff --base=<rev> --impacted` whenever either theme changes so the review page stays complete across themes.

## 0.13.2

- Fix lifecycle checks to report unbound parts and uncaptured surfaces under the configured design root, including custom roots.
- Fix single-consumer warnings for custom design roots.

## 0.13.1

- Build only a feature folder's `index.tsx` as its frame source. Sibling files are internal parts in the import graph, ownership, mappings and single-consumer counts, and are no longer built or listed as frame sources.
- Reject Frame defaults exported from internal feature files, and report `FEATURE_INDEX_MISSING` and `FEATURE_SOURCE_NESTED` under `check.strictLayers`.

## 0.13.0

- Support module feature folders (`modules/<feature>/`): `index.tsx` is the public entry, files inside one feature may import each other, and cross-feature or surface-to-internal imports fail `IMPORT_DIRECTION` under strict layers.
- Count single-consumer components per feature folder.

## 0.12.1

- Stop the single-consumer walk at the nearest module or surface so a module and the surface composing it count as one consumer.

## 0.12.0

- Add opt-in single-consumer component warnings for lowest-layer exports and keep feature-local parts local until a second feature embeds them.
- Merge adjacent date text segments across fractional flex whitespace so compare matches visible labels across DOM text-node boundaries.


## 0.11.0

- Enforce opt-in asset governance with strict production layers, lifecycle bindings, proposed Frame scopes and redundant-frame warnings; `adg init` enables the new checks for fresh projects.
- Add reverse ownership with `adg owner --part=<source>[#<Export>]`, proposed metadata in inspect/owner/diff output, and stable `OWNER_PART_UNBOUND`, `OWNER_SURFACE_UNBOUND` and `OWNER_SURFACE_FRAME_UNCAPTURED` findings.
- Migrate ADG's design library to downward-only imports with implementation bindings for viewer and hub sources.

## 0.10.0

- Add `adg impact` queries for design sources, named parts, tokens, implementation files/regions/symbols, and exact Git endpoints. Compact grouped JSON keeps emitted occurrences, conservative dependencies, lexical token reachability, mappings and lifecycle evidence distinct. See the [impact contract](docs/agent-interface.md#impact).
- Prove eligible frames unaffected only through fresh materialized-input equality within the operation. Reuse the shared project index/build pool, preserve theme-local token declarations or absence, compare full architecture inputs, and reject concurrent input changes with `IMPACT_INPUT_CHANGED`. Proofs are never reused across invocations.
- Add Git-only `render/check/diff --impacted --base=<rev>`. Render captures plain current frames and reports deletions; zero-job runs return literal zero work without advertising old PNGs. Ordinary architecture `render --base` keeps proposal overlays.
- Keep static/token/mapping/import validation in selective check; skipped browser evaluations remain `not_checked` with partial coverage. Unqualified both-theme impacted diff can count fresh proofs toward full coverage while always capturing required parents/support and retaining structural gates and restricted-coverage failures.
- Document grouped proof metadata, coverage basis and literal counters, scoped `--explain`, warnings with recovery argv, exits, and portable reproduction methods. See the [authoring examples](docs/design-toolkit.md#impact-and-selective-commands) and [proof limits](docs/architecture.md#impact-proofs-and-selection).

## 0.9.0

- Add finite `adg owner` lookups from implementation files, directories, globs, symbols and export/anchor line regions, rendered text, absolute CSS colors and token names. Schema-version-1 JSON returns ranked design sources/parts, host frames, tokens, ambiguity, scoped evidence and actionable recovery argv. Empty, stale and ambiguous observations exit 0; incomplete requests exit 2. See the [owner contract](docs/agent-interface.md#owner).
- Add optional version-1 `design/implementation.json` counterparts with strict selectors, defining-source parts and frame subsets. JS/TS exported symbols resolve lexically without redundant anchors; explicit unique anchors support non-exported and other-language symbols. Read-only check reports stale/missing/duplicate bindings. See [authoring and table migration](docs/design-toolkit.md#implementation-mappings).
- Search normalized painted text in both themes with exact/contains matching and optional Frame `locale` filtering. Text evidence and owner rows include literal-search `authoredIn` copy candidates from design and fixture/data dependencies; escaped or concatenated strings can be missed. Normalize supported CSS colors to 8-bit sRGB RGBA and resolve theme-local tokens/aliases, keeping authored references separate from computed paint.
- Share demand-driven build/source/part/token/architecture facts and bounded external observation/palette shards. File queries observe mapped targets only; warm queries reuse valid shards under build, collector, font and environment identities. Batch index manifests avoid per-write directory scans. See the [index architecture](docs/architecture.md#ownership-project-index).

## 0.8.0

- Add `adg diff --base=<rev>` for per-frame, both-theme Git/working-tree comparison of TSX and architecture sources, including added/removed frames and explicit rename candidates. Ordinary frames require exact decoded pixels and CSS/device sizes. The schema-version-1 JSON envelope uses exit 0 for identical/structural, exit 1 with `DIFF_FAILED` for a completed changed gate, and exit 2 for incomplete execution.
- Add Frame `parent: { source, frame, selector }` declarations for extracted parts and consumer `diff.thresholds`. Classifier version 1 combines exact part/parent snapshots with imperceptible, stable-anchor antialiasing, proven boundary bleed and same-image bitmap resampling classes. Near-anchor flips are excluded from strict intermediate blends. Structural batches require unchanged existing frames and parent renders in both themes with full coverage; restricted runs retain local evidence and report partial coverage.
- Build historical inputs with revision-local config, tokens, artwork, imports and source inventories. Stream Git blobs to a disposable tree, migrate legacy base projects there, and reuse current installed dependencies with explicit environment warnings. Historical import failures and recovery argv refer to the original project rather than temporary paths.
- Write before/after/difference PNGs, part snapshots, deduplicated parent support and single-capture isolation artifacts with `report.json`, resolved policy, findings, class counts, environment and phase timings. These artifacts support later review-sheet composition without re-rendering. See the [diff agent contract](docs/agent-interface.md#diff) and [part workflow](docs/asset-rules.md#crop-and-part-frames).

## 0.7.0

- Every CLI command and subcommand accepts global `--json`. Finite commands, help, version and argument errors return one envelope with `schemaVersion:1`, canonical `command`, `ok`, `data`, `warnings` and `error`. See the [agent CLI interface](docs/agent-interface.md) for the complete contract.
- Add stable UPPER_SNAKE error codes with executable `next` argv arrays and short reasons. Classify configuration, version requirements, migration, discovery, tokens, Git, browser, hub/service, network and I/O failures at their owning boundaries.
- Change `render --json` from the unversioned capture array or base-result object to one envelope whose `data` always has `project`, `outputDirectory`, `complete`, `base`, `captures` and `deleted`. Captures use project-root-relative source paths, measured CSS dimensions and actual PNG pixel dimensions, and advertise only completed PNGs. Consumers must read `data.captures`.
- Return coded check findings and structured single/all comparison results, including observed partial data on execution failure. Completed failing gates exit 1 with `ok:false` and `data.complete:true`. `check` build and frame-execution failures now exit 2 instead of 1, with `complete:false`; this exit distinction applies in human mode too. Comparison target, adapter and unsettled-measurement failures exit 2, while completed text/position differences exit 1. Empty selections succeed with a warning.
- Return structured link, init, project migration and root results, including completed file changes and scan warnings. Service actions return observed status, two bounded log rows with missing-file state, and completed migration changes even on later failure.
- Foreground `open` and `serve` emit NDJSON readiness, recoverable diagnostic and terminal events. Readiness confirms listener/startup readiness only. Clean SIGINT/SIGTERM closes owned resources and exits 0; terminal failures exit 2. Human readiness retains the `ADG: <url>` line.
- Keep human logs, configuration-hook output and build-worker output on stderr under JSON mode. Sanitize data, diagnostics, recovery arguments and service log lines. Only explicit `serve --print-key --json` may expose the key in `data.key`; rotation returns `rotated:true`. Conflicting key flags and `--port` with either key flag now fail with a usage error in both modes.

## 0.6.0

- Rename the toolkit to Agent Design Gallery. The package is `@whzxc/agent-design-gallery`, the CLI is `adg`, project configs are `adg.config.*`, the runtime import is `adg` and generated files live in `.adg/`. Run `adg migrate [project]` once per project and `adg service migrate` once per host. Legacy configs stop with a pointer to `adg migrate`.
- Add a resident hub. `adg root add|remove|list|scan` registers project roots, `adg serve` serves an authenticated project index and proxies live viewers, and `adg service` manages it as a macOS LaunchAgent. Root scans keep failing projects listed with a fix hint and continue with the rest.
- Add Mermaid architecture sources under `arch/`. Semantic classes mark phases and experimental, temporary or gap elements. A sidecar `.md` records owners and status, and `adg check` confirms owner paths. `--base=<rev>` on `adg open`, `adg link` and `adg render` overlays added, changed and removed elements against a Git revision.
- Move viewer navigation into top bars, render designs by scope, browse project tokens, copy review links, export captures, share gallery selections and close live instances.
- Persist content-addressed builds, preview geometry and the source working set across restarts within bounded caches.
- `adg check` accounts for text clipping, opaque occlusion and control edge hits. Frame captures run isolated with bounded concurrency. Canvas sections pack densely with adaptive form wrapping.

## 0.5.0

- Default source discovery includes components, modules and surfaces; studies join only when a direct study TSX exists. Explicit source lists retain their directories and order.
- Establish toolkit-wide design asset rules and an adoption guide with a read-only audit checklist, finding format, review batches and consumer-owned documentation.
- Scaffold a working component/module/surface composition, fixture data, tokens and artwork directory in a fresh library. Existing libraries keep their sources without added demo assets.
- Check import direction using the configured source order. `check.importDirection: false` disables only that lint; studies are exempt.
- Add `adg check --read-only` to skip generated declarations and build files during audits.
