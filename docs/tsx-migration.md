# SDG 0.4 migration review

The v2 contract from `0f16871` is implemented on main. The package version is 0.4.0; release remains with the control source. No contract deviations are required. The previous design document's blanket 1440×900 statement was corrected to match the existing local crops and their origins.

## Visual parity

Both themes were rendered for every declared frame and reviewed beside crops from `output/design-baseline-0.3.3/render`. Local review sheets are `output/migration/parity-*.png`.

| Source | Result |
| --- | --- |
| components/artboard | Fine; geometric bounds include its label. |
| components/button | Fine; HTML baseline differs from SVG central baseline by about one pixel. |
| components/canvas | Fine. |
| components/field | Fine; CSS outlines stay inside the shell. |
| components/flow | Fine. |
| components/icon-button | Fine; pinned Lucide geometry and 1.75px rendered stroke. |
| components/kbd | Fine. |
| components/menu-item | Fine. |
| components/minimap | Fine. |
| components/panel | Fine; CSS box shadows replace SVG filters. |
| components/section | Fine. |
| components/toolbar | Fine. |
| components/tooltip | Fine. |
| components/tree-row | Fine; selected icons follow the selected text color. |
| surfaces/canvas | Fine, including the minimap and both ARC preview palettes. |
| surfaces/inspector | Full sheet is removed as requested. The shorter panel exposes the adjacent icon-button label. Other geometry matches. |
| surfaces/menus | Fine. |
| surfaces/open-directory | Fine; retained fixture artwork remains independent of SDG's token palette. |

Small text rasterization differences remain between HTML and SVG. These do not add comparison findings.

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

The drawing is inlined and the props override its SVG root. Remove embedded style/script elements and event attributes from artwork; use SVG paint attributes for brand colors. PNG/JPEG/WebP imports return data URLs. Repeated geometry belongs in component functions and loops. Reuse imported components instead of copying a sheet's markup. Each source's default export returns its declared Frames; do not add light/dark copies.

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

- `sdg check`: all 18 sources passed in both themes.
- Per-frame light/dark renders: completed and visually reviewed.
- `sdg compare --all`: all 15 frames are no worse than their 0.3.3 reports; exit 1 records the retained review findings above.
- `npm test` ran once: 25 passed, 2 failed. The temporary-directory realpath output bug was fixed; the dependent-refresh test now awaits asynchronous polling correctly. Both failed cases passed targeted rechecks. The final theme and compare-boundary changes also passed their two targeted tests.
- `npm pack --dry-run`: runtime, declarations and browser token copy are included; design sources, copied ARC artwork and output artifacts are excluded.
