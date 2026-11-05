# Performance baseline

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

`tooling/benchmark.mjs <url> <output.json> [snapshot-design-directory]` can measure an already-running instance. Supply only a disposable copied fixture directory as the final argument: the file-save phase appends a comment to `components/button.svg` and restores it in `finally`.

## Workload and measurements

- First browse: navigation until visible assets load. Server process startup is recorded separately; their sum excludes browser launch time. Disk and OS caches are not flushed.
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
