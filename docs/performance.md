# Performance


## Current large-project results

The current acceptance workload is a verified disposable copy of SACP Client's design directory: 140 TSX sources, 2,502 frames and 5,004 frame/theme combinations. All 244 original files matched the snapshot by SHA-256. The original project remained read-only. Raw data, copied sources and detailed reports stay under `output/perf/`, outside the npm package.

Three paired runs compare `4fffc21` with `ed8c068` using `tooling/compare.mjs`, the same snapshot, fresh server processes, preferences and Chromium contexts. Environment: Apple M4 Pro, macOS ARM64, Node 24.22.0, Chromium 156.0.8078.4 headless, 1440 × 900 CSS pixels, DPR 2. Values below are medians. Warm browse means a reload with an already-built server; OS caches were not flushed.

| Direct viewer metric | Baseline | Current |
| --- | ---: | ---: |
| CLI startup, discovery complete before builds | 115 ms | 110 ms |
| First browse to visible previews | 11,748 ms | 6,835 ms |
| Warm reload to visible previews | 14,173 ms | 7,504 ms |
| First-view source requests / body bytes | 140 / 81.18 MB | 140 / 81.18 MB |
| Pointer-pan P95 / maximum frame | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Zoom P95 / maximum frame | 16.8 / 83.3 ms | 16.8 / 50.0 ms |
| Trackpad-pan P95 / maximum frame | 33.4 / 99.9 ms | 16.8 / 66.6 ms |
| Pan / zoom / trackpad main-thread task time | 332 / 735 / 3,952 ms | 304 / 573 / 3,383 ms |
| Theme completion, including 200 ms settle | 14,827 ms | 9,461 ms |
| Shared button save to refreshed visible previews | 13,891 ms | 6,948 ms |
| Shared button save source requests | 99 | 99 |
| Leaf settings source save | 4,314 ms | 705 ms |
| Main-document DOM elements at overview | 546 | 546 |
| JS heap after overview pan, without forced GC | 36.6 MB | 50.0 MB |

The leaf metric uses three sequential comment-only saves of `surfaces/settings.tsx`, waiting for the new revision, completed preparation/layout, global drawn readiness and two animation frames. It requests exactly one source. That source can be outside the clamped overview viewport, so this measurement does not guarantee a newly decoded visible settings preview. The shared-button metric measures visible updates and dependency fan-out. Every sample preserves the camera and reports no page errors. Uncollected JS heap samples vary with GC and do not establish native memory usage.

Through an isolated hub at `/p/<slug>/`, baseline first browse/reload/shared save measured 12,368 / 13,394 / 13,655 ms in one valid sample. Current medians over three fresh hub processes and isolated registries are 6,652 / 7,649 / 6,717 ms. Current hub pan/zoom/trackpad P95 is 16.7 / 16.8 / 16.8 ms. The resident LaunchAgent and port 4310 were never used. Warm endpoint proxy overhead remains sub-millisecond; no registry, slug or proxy change was justified.

### Retained memory and targets

A separate harness collects renderer and server garbage, samples CDP DOM counters and renderer RSS, and repeats four detail → overview → shared-save cycles on the same snapshot. Browser preview entries remain at 276 with 7.22 MB of cached canvas pixels after each updated overview. Decoded DOM nodes plateau at 149,345; the baseline rises from 310,055 after the first save to 391,210 after the fourth. Main-document element counts exclude these decoded SVG documents.

Renderer RSS goes from 1.67 to 3.58 GB in the baseline and 1.47 to 2.58 GB currently (initial overview to fourth save). RSS includes native allocations and allocator high-water marks. Server GC heap still grows from 301 to 656 MB, about 88 MB per shared save, because uniquely imported data-URL build modules remain in Node's ESM cache. A plateau in preview counters does not imply bounded total memory.

| Target | Current status |
| --- | --- |
| Warm visible browse <1.5 s | **Not met:** direct 7.50 s; hub 7.65 s. |
| Pan and zoom P95 ≤16.7 ms, no interaction tasks >50 ms | **Not met:** zoom/trackpad P95 16.8 ms; each direct zoom run has one long task. Hub trackpad also has one long task in one run. |
| Single-source file-save refresh <300 ms | **Not met:** leaf median 705 ms; shared dependencies take longer. |
| Bounded overview memory | **Not met overall:** stale preview generations are fixed, but server module retention continues to grow. |

### Current implementation and remaining costs

- TSX numeric crops parse only their exact frame range. Identical, unadorned generated stylesheets are submitted once per overview/full preview; legacy, differing and authored styles retain their original cascade. Preview XML shrinks about 70% on the set workload, without changing source documents.
- Packing skips grid widths with identical placements, retaining the original first-best tie rule. Non-grid SVG widths keep exhaustive search. A bounded cache retains only winning widths and repacks fresh metadata. The 126 component/module set blocks take 3,320 → 1,361 ms on first packing and about 1.3 ms with unchanged geometry; this targeted profile excludes surfaces.
- Preview eviction uses full source-version/theme/frame identities, so a visible path cannot pin old generations. Refresh lookups use indexes. Current visible previews remain exempt from the small offscreen LRU; this is not a strict byte budget.
- Export transforms share exact-content work, capped at 256 entries and 8 MiB. Isolated 140-source build passes improve from 2,483/2,160 ms cold/warm to 1,996/1,883/1,801 ms across three current passes. Render documents, CSS and imports remain exact.

Remaining browse work still prepares every frame and transfers 81 MB of repeated source data. Full-source SVG decoding and ownership geometry measurement remain substantial. Further work should investigate compact source transport and reusable measurement metadata, a raster/decoded-image byte budget, and recycled build workers to bound ESM module retention. No new placeholder or level-of-detail appearance was introduced or proposed.

Validation: all 5,004 light/dark frame documents, CSS and imports are byte-identical; both full snapshot checks pass all 140 sources. Static preview PNG comparisons match for all 252 set source/theme previews at overview scale and a higher scale bounded to 2,048 pixels on the longest edge (504 pairs). Comparison-only animation freezing was applied identically to both variants because foreignObject SVG image animations ignore the emulated reduced-motion media; product animations are unchanged. Regression/property tests cover cropped XML, stylesheet cascade guards, repeated preview generations, exact-content build invalidation and packing against an exhaustive oracle. `npm test` passes 91 tests in about 26 seconds; the repository's own `sdg check` passes 26 sources.

Reproduce the paired browser measurements from a disposable design copy:

```sh
node tooling/compare.mjs /path/to/snapshot/design output/comparison 3 --sdg-baseline=/path/to/baseline-sdg
```

Use `tooling/benchmark.mjs` against an isolated hub URL for the hub samples, with a fresh hub process, state directory and free port for each run. The local targeted scripts and exact raw samples remain in `output/perf/`; `baseline.md` and `result.md` record the commands, exclusions, endpoint timings and retained-memory samples. The initial interrupted zoom run and premature legacy theme waits are excluded from final comparisons.

## Comparison tooling and historical reference workloads

Run from the gallery checkout with Node.js and an ARC checkout whose npm dependencies are installed:

```sh
npm ci
npx playwright install chromium
node tooling/compare.mjs /path/to/agent-remote-control output/comparison 3
```

To reuse an existing exact source snapshot instead of the current ARC checkout:

```sh
node tooling/compare.mjs output/performance-v2 output/comparison-new 3 --reuse-snapshot
```

Use a new output directory for each comparison. The runner exports the exact ARC HEAD into an isolated source snapshot, reuses its installed build dependencies, extracts its product grouping into the snapshot's `design/gallery.json`, and serves the same 46 SVG assets to both implementations. It never saves into the original ARC checkout. Each candidate run uses an isolated preferences directory. ARC and SDG runs are sequential, with fresh browser contexts and server processes. The output retains the source snapshot, JSON samples, screenshots, environment, server logs, and source commit.

To compare an SDG change against an earlier SDG checkout using a project's current TSX assets:

```sh
node tooling/compare.mjs /path/to/project/design output/loading-comparison 3 --sdg-baseline=/path/to/baseline-sdg
```

This mode copies the design directory once, excluding generated `.sdg` files, then runs both viewers sequentially against that snapshot with separate preferences. The original project is never written. The baseline needs access to its installed dependencies. Results include first browse and a subsequent reload, plus the first animation frames showing the catalog, completed layout and loaded visible previews. Reload measures browser measurement and preview work with an already-running, warm server.

The benchmark opens Fit all through the Float zoom menu and switches to the opposite theme through the Display menu. Its zoom anchor stays inside the viewport, including very large worlds clamped to 2.5% scale. SDG theme timing waits for SDG readiness rather than the legacy image fallback. Legacy buttons and radios remain supported for the baseline viewers; gesture counts, timing, and measurements are unchanged.

`tooling/benchmark.mjs <url> <output.json> [snapshot-design-directory]` can measure an already-running instance. Supply only a disposable copied fixture directory as the final argument: the file-save phase appends a comment to `components/button.tsx` (falling back to `.svg`) and restores it in `finally`. A shared component save includes all transitive consumers; it is not an isolated-source rebuild.

## Workload and measurements

- First browse: navigation until visible assets load. Server process startup is recorded separately; their sum excludes browser launch time. Disk and OS caches are not flushed.
- Reload: refresh the same browser page after first browse, with the server's compiled assets cached. Catalog and layout milestones are sampled on animation frames independently of loaded previews.
- Pan: 120 pointer moves on a fixed sinusoidal path, paced by an 8 ms delay after each dispatched event.
- Zoom: overview to the first asset's detail and back. Wheel deltas account for the two implementations' different zoom sensitivities. A reach check requires detail zoom; the baseline reaches the same 877% peak in both viewers.
- Trackpad-style scrolling: 90 two-axis wheel events. ARC maps these to zoom; SDG maps them to pan. This row measures each implementation's response to the same input, not equivalent camera trajectories. Physical trackpad hardware is not part of the automated workload.
- Theme: switch from system dark to light, wait for loaded assets and a settling interval.
- File save: time from writing the copied asset to refreshed visible assets and two animation frames. Record asset requests and before/after cameras.

Frame intervals come from `requestAnimationFrame`. P95 and maximum describe scheduling smoothness; they are not display latency measurements. Chromium Performance metrics provide main-thread task, layout, and script durations plus JavaScript heap usage. Heap usage excludes raster, GPU, and total browser memory. Raw files also retain long tasks and DOM counts.

## Initial result, 2026-11-06

ARC source: `963560b2eb805910f8b6f0507a43baed1fc06359`. Asset set: 46 SVGs. Environment: Apple M4 Pro, 14 cores, macOS Darwin 27.2.0 ARM64, Node 24.22.0, Chromium 156.0.8078.4 headless, 1440 × 900 CSS pixels, DPR 2. Three runs per implementation; values below are medians. Raw data is retained locally at `output/performance-v2/`.

| Metric                          |      ARC |     SDG |
| ------------------------------- | -------: | ------: |
| Server startup                  | 2,277 ms |   53 ms |
| First browse after server ready |   644 ms |  611 ms |
| Startup + first browse          | 2,998 ms |  672 ms |
| Pan frame P95                   |  50.1 ms | 16.7 ms |
| Pan maximum frame interval      |  83.4 ms | 16.8 ms |
| Pan main-thread task time       | 4,728 ms |  540 ms |
| Zoom frame P95                  |  16.8 ms | 16.7 ms |
| Zoom maximum frame interval     |  50.0 ms | 16.8 ms |
| Zoom main-thread task time      |   298 ms |  606 ms |
| Two-axis scroll frame P95       |  16.7 ms | 16.7 ms |
| Theme switch frame P95          |  66.7 ms | 16.8 ms |
| File-save refresh               |   340 ms |  206 ms |
| Asset requests after one save   |       46 |       2 |
| JavaScript heap after pan       |  7.39 MB | 2.87 MB |

The second refresh request is an embedded dependent asset. All three runs preserve the camera during the file-save phase and report no page errors. Canvas drawing spends more main-thread time during continuous zoom, while avoiding the original frame spikes; retain both measurements when evaluating future changes.

Use the initial numbers as a regression reference on this environment. Compare the same source snapshot, browser, viewport, pixel ratio, and input workload. Investigate sustained frame intervals above the display's frame budget, changed camera behavior, missing detail, or renewed full-set refreshes before accepting a rendering change. Visual review also covers SVG sharpness, both themes, directory switching, keyboard focus, and recent-directory camera restoration.

## TSX loading, 2026-11-07

Compared the SDG baseline at `38e2253` with sandbox-document reuse and early catalog rendering using a copied SCNet design snapshot containing 34 TSX sources. Three sequential runs per implementation used fresh servers, preferences and browser contexts on Apple M4 Pro, macOS ARM64, Node 24.22.0 and Chromium 156.0.8078.4 at 1440 × 900, DPR 2. Values are medians. Raw samples, copied sources and screenshots remain local under `output/loading-20261107/client-comparison/`.

| Metric | Baseline | Updated |
| --- | ---: | ---: |
| First browse | 1,045 ms | 635 ms |
| Reload to visible previews | 885 ms | 600 ms |
| Reload to catalog | 526 ms | 27 ms |
| Reload to completed layout | 526 ms | 211 ms |
| Pan frame P95 | 16.7 ms | 16.7 ms |
| File-save refresh | 428 ms | 334 ms |

All six runs reported no page errors and preserved the camera on file save. The viewer regression suite also checks the reference layout, both-theme fixture readiness and selection queued before asset preparation finishes.

## Selection and label refresh, 2026-11-07

The state-persistence and label changes were compared with `15f80c9` using the same 34-source snapshot, environment and three sequential runs per implementation. Raw data is retained under `output/state-labels-20261107/performance/`. Median reload time was 598 ms before and 580 ms after; catalog time was 27 ms and 26 ms. Pan frame P95 stayed at 16.8 ms and zoom frame P95 at 16.7 ms. Refreshing visible labels during pans increased main-thread task time from 259 ms to 282 ms across 120 moves. Zoom task time was 603 ms and 601 ms. File-save refresh was 341 ms and 339 ms; all runs preserved the camera and reported no page errors.

## Click-to-copy labels, 2026-11-07

One paired run against `6b07f5e` used the same 34-source snapshot and benchmark environment. Raw output remains under `output/copy-labels-20261107/performance/`. Reload measured 577 ms before and 543 ms after; catalog time was 24 ms and 23 ms. Pan frame P95 stayed at 16.7 ms; zoom frame P95 was 16.8 ms and 16.7 ms. Both runs preserved the camera on file save and reported no page errors.

## Selection and source exports, 2026-11-07

Three paired runs against `2891fba` used one copied SCNet snapshot with 63 TSX sources. Raw samples remain under `output/selection-details/performance/`. Medians: first browse 1,909 → 1,959 ms, reload 1,628 → 1,692 ms, catalog visibility 23.9 → 24.2 ms, pan P95 16.8 → 16.8 ms, and file-save refresh 2,344 → 2,354 ms. All six runs preserved the camera on file save and reported no page errors. Source-export registration and root-bound measurement add about 65 ms to reload in this workload. The selection tests separately exercise frame/element hit regions, inspector navigation and collapse persistence, clipboard controls, Back and Escape, and confirm that camera pans retain the existing label work bounds.

## Default layers and studies discovery, 2026-11-07

One paired run against `da9e0af` used the same copied 63-source SCNet snapshot to check discovery and file refresh. Raw samples remain under `output/asset-rules/performance/`. First browse measured 2,028 → 2,044 ms, reload 1,768 → 1,726 ms, catalog visibility 27.7 → 23.7 ms, pan P95 16.7 → 16.7 ms, and file-save refresh 2,509 → 2,378 ms. Both runs preserved the camera and reported no page errors. These are single-run observations; the study-discovery regression separately checks adding the first study and removing the last one through the live file watcher.
