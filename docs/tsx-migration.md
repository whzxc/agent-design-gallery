# ADG 0.4 migration review

The v2 contract from `0f16871`, including structural authoring and art URL imports, is implemented on main. The package version is 0.4.0; release remains with the control source. No contract deviations are required. The previous design document's blanket 1440×900 statement was corrected to match the existing local crops and their origins.

## Visual parity

Both themes were rendered for every declared frame and reviewed beside crops from `output/design-baseline-0.3.3/render`. The authoring rework was rendered at scale 1 in both themes. Review sheets pair each new frame with its 0.3.3 crop under `output/authoring-parity/`.

| Source | Result |
| --- | --- |
| components/artboard | Fine; geometric bounds include its label. |
| components/button | Fine; width follows label, icon, padding and gap. Zoom forms gain about 2px from whole-pixel spacing. |
| components/canvas | Fine. |
| components/field | Fine; CSS outlines stay inside the shell. |
| components/flow | Fine. |
| components/icon-button | Fine; pinned Lucide geometry and 1.75px rendered stroke. |
| components/kbd | Fine; width follows text plus 7px padding on each side, with a 22px minimum. |
| components/menu-item | Fine. |
| components/minimap | Fine. |
| components/panel | Sidebar, inspector and dialog samples retain their 200px content height. The three-row menu sample is 96px rather than 108px: content plus 6px padding removes 12px of old blank space. CSS shadows replace SVG filters. |
| components/section | Fine. |
| components/toolbar | Fine; app-bar title and picker follow flex gaps, with small intrinsic text-width differences. |
| components/tooltip | Fine; intrinsic text width replaces the old fractional width. |
| components/tree-row | Fine; selected icons follow the selected text color. |
| surfaces/canvas | Fine, including the minimap and both ARC preview palettes. |
| surfaces/inspector | Full sheet is removed as requested. The shorter panel exposes the adjacent icon-button label. Other geometry matches. |
| surfaces/menus | Fine. |
| surfaces/open-directory | Fine; retained fixture artwork remains independent of ADG's token palette. |

Whole-pixel frame bounds for artboard, section and flow labels round the old fractional crop bounds by at most 1.5px. Text rasterization and natural text widths differ slightly between HTML and SVG. The menu sample's removed blank space is the only deliberate panel-size change in this rework; all fixture comparisons retain their baseline counts. Full sheet removal remains the previously approved inspector difference. No authoring-rule exceptions are needed.

## Authoring size

Components use flex/grid, padding and gaps. Fixture rows and forms are data arrays. The screen has one `data-free` layer for floating chrome; sections, assets, preview crops and labels are canvas data rendered by loops. Only the drawing data retains subpixel positions.

Counts below describe authored TSX, not fractional dimensions produced by browser font metrics. A style object is a `style={{…}}` occurrence. All 603 old objects were outside an explicit `data-free` boundary; four remain outside that boundary, each setting only width and height. The fifth object positions chrome inside the free-form screen layer. The surface style count is 535 → 0.

| Measure | Before rework | After rework |
| --- | ---: | ---: |
| Style objects outside `data-free` | 603 | 4 |
| Decimal number occurrences in TSX (the review's count) | 1,214 | 19 |
| TSX source bytes | 189,417 | 41,710 |
| Extracted canvas data bytes | 0 | 51,785 |
| TSX plus canvas data bytes | 189,417 | 93,495 |
| Preview artwork bytes | 1,020,163 (one TS data-URL literal) | 762,713 (50 SVG files) |

There are **zero authored fractional pixel lengths outside `data-free`**, checked in both themes. Of the 19 decimal occurrences remaining in TSX, 17 are free-form minimap geometry/stroke values and two are unitless `1.2` line heights. Decimal coordinates in `scenes/*.ts` belong to the free-form canvas; their bytes are included above, so moving data out of TSX is not counted as removal.

| Source | Before bytes | After bytes | Styles outside `data-free` | Fractional px outside `data-free` |
| --- | ---: | ---: | ---: | ---: |
| components/artboard.tsx | 2,465 | 1,116 | 0 | 0 |
| components/button.tsx | 1,371 | 1,032 | 0 | 0 |
| components/canvas.tsx | 1,198 | 2,980 | 1 | 0 |
| components/field.tsx | 2,152 | 1,860 | 1 | 0 |
| components/flow.tsx | 1,290 | 816 | 0 | 0 |
| components/icon-button.tsx | 683 | 458 | 0 | 0 |
| components/kbd.tsx | 506 | 360 | 0 | 0 |
| components/menu-item.tsx | 1,437 | 1,007 | 0 | 0 |
| components/minimap.tsx | 989 | 824 | 0 | 0 |
| components/panel.tsx | 8,313 | 5,948 | 1 | 0 |
| components/section.tsx | 828 | 524 | 0 | 0 |
| components/toolbar.tsx | 2,279 | 1,558 | 0 | 0 |
| components/tooltip.tsx | 470 | 324 | 0 | 0 |
| components/tree-row.tsx | 2,582 | 2,264 | 1 | 0 |
| surfaces/canvas.tsx | 70,822 | 7,756 | 0 | 0 |
| surfaces/inspector.tsx | 36,261 | 6,453 | 0 | 0 |
| surfaces/menus.tsx | 19,185 | 4,573 | 0 | 0 |
| surfaces/open-directory.tsx | 36,586 | 1,857 | 0 | 0 |
| scenes/canvas.ts | — | 29,570 | 0 | 0 |
| scenes/inspector.ts | — | 5,295 | 0 | 0 |
| scenes/open-directory.ts | — | 16,920 | 0 | 0 |

## Comparison against 0.3.3

Counts are offsets above 2px / missing / extra. Reports are under `output/design/compare/`; `summary.json` and `index.html` cover all 15 fixture frames.

| Source / frame | 0.3.3 | 0.4.0 |
| --- | --- | --- |
| canvas / components | 1 / 0 / 0 | 1 / 0 / 0 |
| canvas / zoomed | 2 / 0 / 0 | 2 / 0 / 0 |
| canvas / surfaces | 1 / 0 / 0 | 1 / 0 / 0 |
| canvas / overview | 5 / 0 / 0 | 5 / 0 / 0 |
| inspector / frame | 0 / 0 / 0 | 0 / 0 / 0 |
| inspector / component | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / display | 0 / 0 / 1 | 0 / 0 / 1 |
| menus / zoom | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / more | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / search | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / tooltip | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / shortcuts | 1 / 0 / 0 | 1 / 0 / 0 |
| open-directory / empty | 0 / 0 / 0 | 0 / 0 / 0 |
| open-directory / dialog | 4 / 2 / 0 | 4 / 2 / 0 |
| open-directory / error | 0 / 0 / 0 | 0 / 0 / 0 |

Totals remain 14 offsets, 2 missing and 1 extra. Existing findings are section/count label offsets, one shortcut-key offset, the display crop's extra canvas label, and two covered labels behind the open dialog. Same-line merging and nearest duplicate pairing have dedicated passing reader tests; no new unmatched text remains after the conversion.

## ARC handoff

Keep the token names in `design/tokens.css`. Light is `:root`; dark is `:root[data-theme="dark"]`. `--surface` produces `bg-surface`, `--text-secondary` produces `text-text-secondary`, and a length-valued `--text-body` produces `text-body`. Fonts, radii and shadows retain their suffixes: `font-ui`, `rounded-panel`, `shadow-md`. Tailwind's palette/type/radius/shadow defaults are unavailable. Use `class`, static markup and plain component functions; React and npm imports are unavailable. Keep shared helpers and imports inside `design/`.

Import brand artwork from `design/art/` and mark its literal paints:

```tsx
import ArcMark from '../art/arc-mark.svg';

<ArcMark data-brand width={24} height={24} />
```

The drawing is inlined and the props override its SVG root. Remove embedded style/script elements and event attributes from artwork; use SVG paint attributes for brand colors. PNG/JPEG/WebP imports return data URLs. For a self-contained preview that should remain an image, use `import preview from '../art/preview.svg?url'` and `<img src={preview} />` (or SVG `<image href={preview} />`). Any file under `design/art/` supports `?url`; this also tracks the file for refresh. Sources import only the preview files they display. Repeated geometry belongs in component functions and loops. Use content-sized controls with padding and gap; do not pass measured label widths. Keep repeated fixture items in data arrays. Put screen placement and drawing geometry under `data-free`; outside it, styles are limited to width, height and custom properties and pixel lengths are whole numbers. Reuse imported components instead of copying a sheet's markup. Each source's default export returns its declared Frames; do not add light/dark copies.

Map ARC's `docs/dev/design.md` frames table as follows:

| Existing column or attribute | TSX |
| --- | --- |
| Asset | Rename the source to `.tsx`; keep it under `surfaces/`. |
| Frame | `Frame name`, without the old `frame-` prefix. |
| Fixture / `data-fixture` | `Frame fixture`; omit for unavailable presentations. |
| Named region/dialog target | `capture={{ region: 'exact accessible name', viewport: '…' }}`. |
| Explicit CSS selector | `capture={{ selector: 'exact selector', viewport: '…' }}`. |
| Page target / `data-origin` | `capture={{ page: true, viewport: '…', origin: 'x y' }}`; origin defaults to `0 0`. |
| Viewport | Always retain it, including for region/selector captures. It sets browser size, not element size. |
| Ordered clicks | `capture.clicks`, preserving every exact accessible name and its order. |
| Prepared fixture notes | Keep preparation in the adapter's `ready`; do not put descriptions in clicks. |

For example, `coordination/gap` uses fixture `coordination-gap` and `capture={{ region: 'Board', viewport: '1280x800', clicks: ['Open board', 'Activity'] }}`. `task-detail/needs-you` uses `selector: '.dialog:has(.task-detail-layer)'` with `1280x1100`. Preserve the permission and question sheets' distinct `510x844` and `525x844` viewports, followed by `打开`. Preserve the explicit selector for nested model/effort dialogs; capture-target ancestors' `aria-hidden` is ignored. Portrait frames retain their page dimensions, origin and the adapter's `Asia/Shanghai` timezone. Unavailable frames remain fixture-free and are omitted by `compare --all`.

Set `requires: '>=0.4.0'`. Replace all top-level component/surface SVG sources before running toolkit commands; the viewer remains available during conversion. Refresh declarations with a toolkit command and use `design/tsconfig.json`. Delete old generated token regions, SVG shadow filters, sync/measure instructions and Full sheet references. Compare flags override Frame defaults.

## Validation

- `adg check`: all 18 sources passed in both themes, including the two authoring rules.
- Per-frame light/dark renders at scale 1: completed and reviewed against the 0.3.3 crops for all 18 sources.
- `adg compare --all`: all 15 frames have the same counts as 0.3.3; exit 1 records the retained findings above. Local log: `output/authoring-compare-final.log`.
- Unit tests cover fractional class/style/frame lengths, disallowed layout styles, inherited `data-free`, allowed width/height/custom properties, art URL boundaries/dependencies/declarations and content-sized Frames.
- `npm test` ran once: 31/32 passed. The fixture-coverage test now reads built Frames instead of scanning JSX attributes. Its targeted recheck and the content-sizing test using ADG's actual Button both passed (2/2). Logs: `output/authoring-npm-test.log` and `output/authoring-targeted-tests.log`.

## ARC TSX fixture refresh

The fixture now contains all 51 sources from ARC `b9e18beb`, with 94 artboards in six sections. All 87 copied files match that commit; the local gallery preserves the four curated groups. The remaining sources use directory groups. The layout reference, scene data and 188 theme-specific PNG previews are regenerated from this snapshot. Legacy SVG coverage uses two standalone sheets.

`adg check` passed for all 18 ADG sources. Changed frames were rendered and visually reviewed in both themes on macOS, including the canvas, inspector, menus, open-directory and their changed components. `npm test` ran once: 41/41 passed.

`adg compare --all` completed all 15 frames; every capture settled. Counts are offsets above 2px / missing / extra.

| Source / frame | 0.4.0 | ARC TSX snapshot |
| --- | --- | --- |
| canvas / components | 1 / 0 / 0 | 0 / 0 / 0 |
| canvas / zoomed | 2 / 0 / 0 | 0 / 0 / 0 |
| canvas / surfaces | 1 / 0 / 0 | 0 / 0 / 0 |
| canvas / overview | 5 / 0 / 0 | 0 / 0 / 0 |
| inspector / frame | 0 / 0 / 0 | 0 / 0 / 0 |
| inspector / component | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / display | 0 / 0 / 1 | 0 / 0 / 0 |
| menus / zoom | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / more | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / search | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / tooltip | 0 / 0 / 0 | 0 / 0 / 0 |
| menus / shortcuts | 1 / 0 / 0 | 1 / 0 / 0 |
| open-directory / empty | 0 / 0 / 0 | 0 / 0 / 0 |
| open-directory / dialog | 4 / 2 / 0 | 0 / 0 / 0 |
| open-directory / error | 0 / 0 / 0 | 0 / 0 / 0 |

Totals are **1 / 0 / 0**, down from **14 / 2 / 1**. No frame got worse. Regenerated canvas labels eliminate the previous section/count offsets and covered-dialog labels. The new layout leaves no canvas label in the display menu crop. The retained shortcut finding is the same isolated `←` key horizontal offset of 2.6875px; compare exits 1 for that finding. Preview bounds, selection outlines, minimap geometry and inspector source notes were also checked in the overlays.

One informational benchmark ran on a separate copy of the new fixture; this snapshot replaces the old one, so it is not a before/after performance gate. Environment: macOS arm64, Apple M4 Pro, Node 24.22.0, Chromium 156.0.8078.4, 1440 × 900 at DPR 2. First browse: **1295.3ms**.

| Phase | Frame p95 (ms) | Maximum (ms) | Task time (ms) | Heap (MiB) |
| --- | ---: | ---: | ---: | ---: |
| pan | 16.7 | 16.8 | 225.7 | 6.47 |
| zoom | 16.8 | 16.8 | 611.1 | 4.63 |
| trackpad-pan | 16.8 | 16.8 | 164.7 | 3.09 |
| theme | 16.7 | 16.7 | 214.6 | 32.69 |

All phases recorded zero long tasks and zero frames above 33.4ms. Saving the shared TSX button refreshed 22 dependent asset requests in **1376.5ms**, with the camera unchanged and no page errors. The benchmark save probe accepts TSX and retains SVG support. Raw logs, render review sheets and the benchmark JSON remain local in `output/arc-refresh/`; compare reports are in `output/design/compare/`.
