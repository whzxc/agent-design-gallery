# Performance

The current large-project workload contains 140 TSX sources, 2,502 frames and 5,004 frame/theme combinations. Persistent geometry and ready-preview caches reduce warm browse and restart latency, and recycled build workers bound server module lifetime. Cold visible-ready latency and Chromium native memory remain the main limitations.

## Current measurements

Three sequential samples per route compare baseline `2533ce9` with the persistent-cache implementation. Browser samples use `57aa025`; saturated-cache retention uses `8eceba7`, including cache-reference recency and legacy embedded-artwork refresh corrections. The workload is one retained disposable SACP Client design snapshot; its 244 source/art files remain identical after all save tests. The original project and resident hub were not used.

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

## Transport and refresh

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

## Interaction

| Phase | Direct P95 baseline → current | Direct maximum baseline → current | Current direct/hub long tasks per run |
| --- | ---: | ---: | --- |
| Pointer pan | 16.7 → 16.8 ms | 16.8 → 16.8 ms | [0, 0, 0] / [0, 0, 0] |
| Zoom | 16.8 → 16.7 ms | 50.0 → 16.8 ms | [0, 0, 0] / [0, 0, 0] |
| Trackpad pan | 16.8 → 16.7 ms | 66.7 → 100.0 ms | [1, 1, 1] / [1, 1, 1] |

Frame maxima are medians of the per-run maxima. Current zoom has no task over 50 ms in all six direct/hub samples. Trackpad pan still has a long task in every sample, reaching 106 ms direct and 103 ms through the hub. The direct pointer-pan P95 of 16.8 ms exceeds the strict 16.7 ms target.

Direct main-thread task medians are 442 ms pan, 462 ms zoom, 454 ms trackpad pan and 7,477 ms theme switch. Main-document DOM elements stay at 546. Pan-phase uncollected JS heap changes from 80.51 to 26.34 MB; retained memory uses separate GC samples below.

## Retained memory

The server runs in a separate forked Node process from Playwright. Sample IPC collects server main-isolate garbage before reading memory. Renderer garbage is collected through CDP. Worker heaps are samples after their last build, without forced worker GC; server process RSS includes worker threads.

One process performs 24 new output generations, numbered 13 through 36, against a saturated disk cache. The final eight server main GC heaps span **126.22–126.42 MB** (0.15%). Server RSS varies **880.29–986.48 MB** as workers recycle. At the final sample, 86 workers have been recycled; no more than two are active, each has a 256 MiB old-space limit and a 32-attempt lifetime. Maximum sampled last-build worker heap is 159.08 MB.

The parent payload LRU holds 33.47 MB, metadata LRU 29.01 MB, and each disk cache has a 256 MiB budget. Every generation retains metadata for all 140 current sources and 276 ready previews. Manifest references refresh LRU recency. Preview count, decoded DOM nodes and raster-cache bytes stay at 276, 148,609 and 7.26 MB.

Chromium renderer RSS grows from **1.48 to 4.15 GB**; its final eight samples rise from 3.63 to 4.15 GB despite stable renderer JS heap and application cache counts. The remaining native-memory task is an SVG/canvas allocation trace over this refresh sequence.

## Targets and remaining work

| Target | Status | Current result |
| --- | --- | --- |
| Warm visible browse <1.5 s | **Not met** | Direct 2.82 s; hub 2.52 s. |
| Pan/zoom P95 ≤16.7 ms and no interaction tasks >50 ms | **Not met** | Zoom meets the limit; pointer pan and trackpad still miss the combined target. |
| Changed-output single-source refresh <300 ms | **Not met** | 599 ms; unchanged-output comments take 231 ms. |
| Bounded total overview memory | **Not met** | Server heap is bounded; renderer RSS continues growing. |
| Round 2 bounded server-memory requirement | **Met** | Main heap plateaus, worker/module lifetime and caches are bounded. |
| No zoom tasks over 50 ms | **Met** | Zero in all three direct and all three hub samples. |

Further work should profile native SVG/canvas retention, visible vector decode cost, trackpad long tasks and ownership-geometry measurement for changed sources. Cold priming also needs reduction. No new placeholder or level-of-detail representation was introduced; no visual design proposal needs approval.

## Verification and reproduction

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
