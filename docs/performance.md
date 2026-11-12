# Performance

## Agreed milestone 3 budgets

The frozen large-project workload has 143 TSX sources and 2,722 frames. Its module layer has 89 sources and 2,204 frames. Budgets are medians of five per route on the same Apple M4 Pro machine and frozen input, with minimum–maximum retained.

| Workload | Cold visible-ready | Warm reload and restart visible-ready | Cold / warm first content |
| --- | ---: | ---: | ---: |
| Module layer | ≤5.0 s | ≤1.0 s | ≤350 / ≤250 ms |
| Full workload | ≤9.0 s | ≤2.5 s | ≤350 / ≤250 ms |

## Arrangement-only measurements

Baseline `e2bca11` versus the arrangement Worker and provisional stream placement. Values are **median [minimum–maximum]**, with five samples for each route/scenario/implementation. Apple M4 Pro, macOS ARM64, Node v24.22.0, Chromium 156.0.8078.4 headless, 1440 × 900 CSS pixels, DPR 2, dark theme; isolated direct and hub processes. The same frozen source path is used throughout; OS file caches are not purged.

| Workload | Route | Scenario | Baseline visible-ready (s) | Current visible-ready (s) | Baseline first content (ms) | Current first content (ms) | Readiness budget |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| modules | direct | cold | 8.761 [8.595–9.172] | 5.202 [4.861–5.761] | 268.9 [224.2–307.7] | 263.7 [251.0–306.1] | missed |
| modules | direct | warm reload | 1.368 [1.366–1.429] | 1.319 [1.285–1.437] | 145.1 [143.9–148.4] | 138.8 [133.8–152.4] | missed |
| modules | direct | warm restart | 1.457 [1.393–1.623] | 1.459 [1.430–1.612] | 190.1 [185.8–221.7] | 180.7 [178.0–210.8] | missed |
| modules | hub | cold | 8.887 [8.476–9.515] | 4.925 [4.826–5.545] | 309.6 [260.0–383.3] | 320.8 [255.4–335.6] | met |
| modules | hub | warm reload | 1.368 [1.316–1.399] | 1.333 [1.269–1.363] | 146.6 [145.9–148.9] | 134.4 [132.6–146.0] | missed |
| modules | hub | warm restart | 1.529 [1.493–1.563] | 1.546 [1.495–1.562] | 238.7 [229.0–249.7] | 231.5 [226.4–245.4] | missed |
| full | direct | cold | 12.495 [12.173–15.648] | 9.142 [8.796–10.922] | 247.2 [205.5–251.7] | 243.3 [240.5–369.1] | missed |
| full | direct | warm reload | 3.776 [3.508–3.825] | 3.697 [3.545–4.364] | 193.8 [182.6–205.2] | 209.0 [190.7–216.4] | missed |
| full | direct | warm restart | 3.246 [3.107–3.406] | 3.224 [3.037–3.630] | 197.8 [192.6–204.0] | 199.1 [176.1–219.5] | missed |
| full | hub | cold | 12.964 [12.226–16.309] | 9.178 [8.963–9.478] | 260.7 [233.4–307.6] | 261.4 [234.2–319.4] | missed |
| full | hub | warm reload | 3.814 [3.676–4.074] | 3.748 [3.677–3.914] | 199.7 [192.0–217.1] | 205.6 [188.7–217.8] | missed |
| full | hub | warm restart | 3.431 [3.279–3.594] | 3.346 [3.146–3.477] | 249.4 [242.8–287.8] | 249.9 [246.5–270.8] | missed |

Streaming uses linear provisional rows without populating width choices. A complete width-search miss runs once in a Web Worker; complete cached inputs repack directly at their known winning widths without searching. Occupied-edge scans preserve the original width search and exact tie/Float rules while avoiding temporary candidate arrays and sorting. Final group, block, frame/crop, item and world geometry is byte-identical to the baseline for both workloads. All 120 rendered item-position arrays match the stored geometry. A seeded Property test verifies provisional-to-complete convergence and cache/input isolation.

The 6.5-second module cold stop threshold is not hit. First-content guardrails are met; readiness budget status is shown per row. The next proposed step targets SVG preview decode/raster/drawing on warm navigation, with prototype savings targets of 0.4–0.6 s for modules and 0.8–1.3 s for the full workload. It has not been implemented. Renderer arrangement is now milliseconds; remaining asynchronous decode intervals include image loading, native rendering and scheduler waits and are not CPU-only timings.

Raw comparisons, geometry proof and the report remain locally under ignored `output/perf-m3/step2a/`. Reproduce with `node tooling/compare.mjs <frozen-project> <new-output> 5 --phases --scope=all --adg-baseline=<e2bca11-archive>`, and repeat with `--scope=layer:modules`. The runner alternates baseline/current, isolates state per sample, waits for complete before reload and reuses only that sample's persistent state for restart. Runtime tests pass all 147 checks.

## Earlier persistent-cache measurements

The following results use the earlier 140-source, 2,502-frame snapshot and are retained as historical measurements.

The earlier large-project workload contains 140 TSX sources, 2,502 frames and 5,004 frame/theme combinations. Persistent geometry and ready-preview caches reduce warm browse and restart latency, and recycled build workers bound server module lifetime. Cold visible-ready latency and Chromium native memory remain the main limitations.

### Measurements

Three sequential samples per route compare baseline `2533ce9` with the persistent-cache implementation. Browser samples use `57aa025`; saturated-cache retention uses `8eceba7`, including cache-reference recency and legacy embedded-artwork refresh corrections. The workload is one retained disposable large-project design snapshot; its 244 source/art files remain identical after all save tests. The original project and resident hub were not used.

Environment: Apple M4 Pro, macOS ARM64, Node 24.22.0, Chromium 156 headless, 1440 × 900 CSS pixels, DPR 2. Values below are medians. Browser contexts and server processes are fresh per sample; disk/OS caches are not flushed. Startup is recorded separately from browser navigation.

| Latency | Direct baseline | Direct current | Hub baseline | Hub current |
| --- | ---: | ---: | ---: | ---: |
| Server / hub creation startup | 105 ms | 85 ms | 4 ms | 5 ms |
| First layout | 2,876 ms | 176 ms | 3,241 ms | 194 ms |
| Cold visible-ready | 6,961 ms | 8,941 ms | 7,228 ms | 9,874 ms |
| Warm reload to visible-ready | 7,911 ms | 2,818 ms | 7,884 ms | 2,522 ms |
| Warm restart to visible-ready | 8,342 ms | 2,485 ms | 8,056 ms | 2,626 ms |
| Unchanged-output shared button save | 6,804 ms | 1,713 ms | 7,115 ms | 1,931 ms |

Warm restart closes the viewer, restarts it with the same project/state/cache, then navigates a fresh browser context after server readiness. The hub runs in an isolated process on a free port with fresh registry/preferences per sample. Each restart reuses only that sample's state. Port 4310 and the resident LaunchAgent are excluded.

Cold layout streams partial source results, then produces the same complete arrangement. Cold visible-ready regresses 28.4% direct and 36.6% through the hub. Direct complete cache priming takes 10,629 ms, including metadata writes and offscreen queue drainage. First-run preparation and persistence still cost more than the baseline's eager path.

### Transport and refresh

| Direct transport metric | Baseline | Current |
| --- | ---: | ---: |
| Complete cold source requests | 140 | 140 |
| Complete cold source response bodies | 81.18 MB | 20.00 MB |
| Cold derived-cache uploads | 0 | 25.83 MB |
| Warm source requests | 140 | 0 |
| Warm ready-preview requests at visible-ready | 0 | 179 |
| Warm total data response bodies | 81.23 MB | 19.06 MB |
| Unchanged-output shared save source/preview requests | 99 | 0 |

Cold uploads contain 2.70 MB geometry and 23.13 MB cropped SVGs. Full-source SVGs are not uploaded. Complete cold data download plus uploads is 45.91 MB; warm data responses fall 76.5%. Later background preview requests are recorded separately from the visible-ready cutoff.

Compact source responses contain frame HTML and one stylesheet. Input hashes cover actual dependency bytes and the resolution-sensitive code-file inventory; output hashes cover source identity, frame data, CSS and imports. Shared edits evaluate reverse-graph candidates, cancel superseded work and reuse unchanged output hashes. Unchanged consumers receive no source payload, measurement or preview update.

A separate isolated refresh sequence takes three samples per case at overview:

| Refresh case | Current median | Source GETs | Preview GETs |
| --- | ---: | --- | --- |
| Unchanged-output leaf comment | 231 ms | [0, 0, 0] | [0, 0, 0] |
| Changed-output leaf attribute | 599 ms | [1, 1, 1] | [0, 0, 0] |
| Unchanged-output shared comment, saturated cache | 3,099 ms | [0, 0, 0] | [0, 0, 0] |

The changed-output case temporarily adds a data attribute, changing serialized output while preserving pixels and geometry. Leaf refresh waits for the new revision, preparation, layout, global visible readiness and two animation frames. The settings source can be outside the clamped overview viewport, so a newly visible settings preview decode is not included reliably. Save timing starts after preceding camera/cache work settles. The saturated-cache sequence is separate from the fresh-state shared-save browser row.

### Interaction

| Phase | Direct P95 baseline → current | Direct maximum baseline → current | Current direct/hub long tasks per run |
| --- | ---: | ---: | --- |
| Pointer pan | 16.7 → 16.8 ms | 16.8 → 16.8 ms | [0, 0, 0] / [0, 0, 0] |
| Zoom | 16.8 → 16.7 ms | 50.0 → 16.8 ms | [0, 0, 0] / [0, 0, 0] |
| Trackpad pan | 16.8 → 16.7 ms | 66.7 → 100.0 ms | [1, 1, 1] / [1, 1, 1] |

Frame maxima are medians of the per-run maxima. Current zoom has no task over 50 ms in all six direct/hub samples. Trackpad pan still has a long task in every sample, reaching 106 ms direct and 103 ms through the hub. The direct pointer-pan P95 of 16.8 ms exceeds the strict 16.7 ms target.

Direct main-thread task medians are 442 ms pan, 462 ms zoom, 454 ms trackpad pan and 7,477 ms theme switch. Main-document DOM elements stay at 546. Pan-phase uncollected JS heap changes from 80.51 to 26.34 MB; retained memory uses separate GC samples below.

### Retained memory

The server runs in a separate forked Node process from Playwright. Sample IPC collects server main-isolate garbage before reading memory. Renderer garbage is collected through CDP. Worker heaps are samples after their last build, without forced worker GC; server process RSS includes worker threads.

One process performs 24 new output generations, numbered 13 through 36, against a saturated disk cache. The final eight server main GC heaps span **126.22–126.42 MB** (0.15%). Server RSS varies **880.29–986.48 MB** as workers recycle. At the final sample, 86 workers have been recycled; no more than two are active, each has a 256 MiB old-space limit and a 32-attempt lifetime. Maximum sampled last-build worker heap is 159.08 MB.

The parent payload LRU holds 33.47 MB, metadata LRU 29.01 MB, and each disk cache has a 256 MiB budget. Every generation retains metadata for all 140 current sources and 276 ready previews. Manifest references refresh LRU recency. Preview count, decoded DOM nodes and raster-cache bytes stay at 276, 148,609 and 7.26 MB.

Chromium renderer RSS grows from **1.48 to 4.15 GB**; its final eight samples rise from 3.63 to 4.15 GB despite stable renderer JS heap and application cache counts. The remaining native-memory task is an SVG/canvas allocation trace over this refresh sequence.

### Targets and remaining work

| Target | Status | Current result |
| --- | --- | --- |
| Warm visible browse <1.5 s | **Not met** | Direct 2.82 s; hub 2.52 s. |
| Pan/zoom P95 ≤16.7 ms and no interaction tasks >50 ms | **Not met** | Zoom meets the limit; pointer pan and trackpad still miss the combined target. |
| Changed-output single-source refresh <300 ms | **Not met** | 599 ms; unchanged-output comments take 231 ms. |
| Bounded total overview memory | **Not met** | Server heap is bounded; renderer RSS continues growing. |
| Round 2 bounded server-memory requirement | **Met** | Main heap plateaus, worker/module lifetime and caches are bounded. |
| No zoom tasks over 50 ms | **Met** | Zero in all three direct and all three hub samples. |

Further work should profile native SVG/canvas retention, visible vector decode cost, trackpad long tasks and ownership-geometry measurement for changed sources. Cold priming also needs reduction. No new placeholder or level-of-detail representation was introduced; no visual design proposal needs approval.

### Verification and reproduction

- All 5,004 theme-frame documents, CSS and imports match the baseline builder byte-for-byte.
- All 552 cropped preview SVGs match before/after compaction and through actual cache POST/disk/GET.
- Baseline and current full snapshot `adg check --read-only` both pass all 140 sources with identical output.
- `npm test` passes 97 tests in 21.21 seconds, within the previous 36-second budget. All fixture assertions remain; independent fixture pages run with concurrency two.
- Final samples preserve the camera on save and report no page errors.

Run the comparison from this repository against a disposable source copy:

```sh
node tooling/compare.mjs /path/to/snapshot/design output/comparison 3 --adg-baseline=/path/to/baseline-code --warm-restart
```

Pass `--browse-only` to the comparison runner to measure navigation without interactions, saves or screenshots.

The runner derives an isolated design copy, uses separate preferences and free ports, and retains raw JSON, screenshots and logs. A baseline archive needs its dependencies available. `tooling/benchmark.mjs <url> <output.json> [snapshot-design-directory]` measures an existing direct or isolated hub URL; `--browse-only` records restart navigation without interactions. The save phase modifies only the supplied disposable copy and restores it in `finally`.

The benchmark uses Fit all and an interior viewport zoom anchor, switches to the opposite theme, and waits for ADG readiness. Resource entries distinguish source/preview GETs from cache uploads. Metadata, image queues and cache writes settle before warm/restart samples and isolated save timing.

Detailed commands and raw results are retained locally in `output/perf-round2/baseline.md`, `result.md` and `summary.json`. The local retention harness records server/driver process identities, worker statistics, current metadata coverage and renderer RSS. Copied acceptance assets and raw measurements stay under ignored `output/` and are excluded from the npm package.

## Impact performance methodology

For new impact material, retain workload identities, local machine paths, measured results, copied
assets and traces under ignored `output/`. The following procedures use fictional examples; the
agreed milestone 3 budgets and historical evidence above remain unchanged.

## Freeze the workload

Use a disposable project copy with its own configuration, design sources, tokens, artwork and Git
history. Keep the original project read-only. Pin the baseline runtime to a commit or release export
and install each runtime's locked dependencies. Record the runtime versions, host/browser settings,
source/frame counts and exact edits with the raw results. Do not change inputs between paired runs.

Use identical viewport, device scale, theme and scope across implementations. Separate process
startup from browser navigation; distinguish cold state, warm reload and restart with the same state.
OS file caches are not automatically purged. Alternate baseline/current samples on the same host,
retain each sample, and report medians and ranges rather than treating one run as a stable budget.
Set workload-specific budgets before comparing results; they are not portable timing guarantees.

## Viewer comparison

From the ADG repository, with fictional project/runtime exports:

```sh
node tooling/compare.mjs /tmp/catalog-project output/performance/viewer 3 \
  --phases --scope=all --adg-baseline=/tmp/adg-baseline --no-screenshots
```

The phase runner uses isolated state and free ports, alternates baseline/current for direct and hub
routes, and measures cold navigation, warm reload and process restart. `--route=direct` or `hub`
selects one route. Repeat with the same frozen inputs and a narrower scope when diagnosing a layer.
Choose a new output directory per comparison so stale state cannot be mistaken for a cold sample.

Read first layout, first content, visible-ready and complete separately. Build, geometry measurement,
preview preparation, arrangement, drawing, network bytes and cache writes are different costs.
Readiness is a user-visible boundary; complete also includes cache/metadata drainage. A shorter
first-content interval does not establish faster visible readiness.

Compare final source/frame positions and dimensions, not just latency. Inspect page errors, failed
requests and cache failures. Reuse the retained geometry for exact baseline/current assertions.
Keep camera input independent of page-component rendering; layout/cache work must not change
pan, zoom, selection or refresh behavior. For interaction and disposable save/restore coverage,
use the [existing reproduction procedure](#verification-and-reproduction).

## Selective command comparison

Prepare a frozen Git base and one working-tree edit per disposable copy. Fictional edit families:

- A data attribute on the Badge root, preserving its pixels while changing materialized markup.
- A shared component class that can change an entry's common utility stylesheet.
- A rarely reached token, a dark-only override, and a global token/config/CSS change.
- A shared-helper comment with identical output, and a leaf surface edit.
- A newly extracted part with an explicit `Frame.parent`, plus restricted and single-theme runs.

Run ordinary full and impacted diff on the same pair, with separate output directories:

```sh
adg diff --base=HEAD --out-dir=output/performance/full --json
adg diff --base=HEAD --impacted --out-dir=output/performance/selected --json
adg render --base=HEAD --impacted --out-dir=output/performance/render --json
adg check --base=HEAD --impacted --read-only --json
```

Take repeated samples without editing between them. Record wall time, every reported phase,
source/frame/theme universe, actual jobs, proven/uncovered/deleted rows, fallback counts and JSON
stdout bytes. Compare matched before/after PNGs and CSS/device dimensions between full and selected
runs; independently verify every proven row against the full oracle when validating proof changes.
Verdicts and structural coverage must agree for unqualified both-theme runs. Restricted structural
runs must retain coverage failures. Check also needs a preexisting violation in an unchanged frame:
selective check leaves it `not_checked`, while ordinary check still reports it.

## Planner cost and proof limits

The shared project index supplies dependency graphs, emitted occurrences, mappings and token facts.
Git operations materialize every TSX entry on both endpoints once, through the existing build pool.
Transform reuse is allowed; executed payloads and proof verdicts are never reused across operations.
CSS identifier decoding and CSS eligibility run once per entry/side; only frame markup is scanned
per frame. Exact shared-style/markup segments preserve whole-projection byte equality. Digests are
explanation/index keys, never equality evidence. See the [proof rule](architecture.md#impact-proofs-and-selection).

`materializeMs` measures fresh build/execution. `proofMs` measures eligibility and exact projection
comparison; token/source collection also appears in `indexMs`. Consumer `impactMs` includes planning
and final validation, `workMs` includes the consuming command and cleanup, and diff retains capture,
compare and write phases. These intervals have different boundaries: do not add nested timings or
claim planner time as capture time. Query totals include CLI-owned operation work; wall time also
includes process startup and output handling.

Selective rendering saves only the capture/comparison work actually omitted. A global change can
retain every frame and add planner overhead. Entry-wide generated CSS can widen a shared component's
render set beyond its emitted occurrences. Architecture conservatively includes the entire token
sheet. Hypothetical token candidates assume unchanged Tailwind classification; only actual Git input
comparison can establish skips after a classification change.

Proofs require fresh eligible materialized-input equality and final generation validation. Time and
randomness are evaluated again; external resources or script-capable documents require rendering.
Fonts, rasterization and allowed animation/media/canvas behavior retain ordinary diff's shared-context
assumptions. A proof is not a persisted visual receipt or a completed check. Reports carry descriptive
metadata and literal work counts; all-proven diff can have no captures, while selective check remains
partial for skipped evaluations.

## Retain evidence and close resources

Retain raw command JSON, PNGs, geometry, traces, server logs and environment/sample details locally
under `output/`. Inspect cache/worker counts and memory over repeated refreshes when relevant;
stable application caches alone do not establish stable native renderer memory. Benchmark processes
must close their browsers, pages, servers and workers. Do not use a resident production hub or modify
an original project to collect a sample. Package-content checks exclude all local evidence.
