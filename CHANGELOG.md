# Changelog

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
