# SDG design

[Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

The TSX sources in `design/` define how the viewer looks. This document records the current direction, ownership,
implementation mappings and review process. The asset rules take precedence over conflicting project guidance.

## Governance

- Minimum toolkit: SDG `>=0.5.0`, declared in `sdg.config.mjs`.
- Design root: `design/`; discovery order: `components`, `modules`, `surfaces`. No explicit source override or
  import-direction opt-out is configured. The module sources are navigation, inspector, menus, open-directory, shortcuts, view-controls and canvas; there are no studies.
- Review platform: macOS with system UI fonts. The declared implementation capture viewport is 1440 × 900,
  locale `en-US`, timezone `UTC`; ARC artwork retains its own content language. Other viewport and locale forms
  are not declared.
- Codex proposes and implements each authorized batch. The delegating Claude conversation reviews the completed report,
  ownership, mappings and renders after the Codex turn ends. Codex does not dispatch other Agents or answer their
  permission requests.
  The controller may release a structure-only batch when every affected frame is pixel-identical in both themes and
  no choice remains unresolved. When explicitly authorized, Codex may release structural governance changes with exact
  existing renders and content-cropped new part frames. Missing states and visual corrections remain known gaps.
  New visual changes or unresolved choices otherwise go to the user for gallery approval.
- Capture a baseline in a disposable copy outside the checkout before editing. Run `sdg check`, render all affected
  frames in both themes and compare decoded pixels per frame/theme. Use the repository `src/cli.mjs` render command,
  which waits for fonts and captures each frame/theme in an isolated page/context with bounded concurrency.
  Commit only the authorized batch. Open review with `sdg open <design-directory> --port=<free-port>`; port 4310 is reserved.
- This document keeps current mappings, approval/adoption state, exceptions and scope. Render, pixel-comparison and
  controller-review evidence stays in local `output/` or the external baseline copy. This document has no batch log.

### Ownership and current scope

| Owner | Current assets | Current scope / remaining work |
| --- | --- | --- |
| Shared values and controls | `tokens.css`, button, icon-button, field, tree-row and menu-item components; their fixtures | Reviewed; IconButton disabled is approved; defaults belong to parts and frame presentation data belongs to fixtures. |
| Generic containers | `components/panel.tsx`, `components/toolbar.tsx`, `components/canvas.tsx`, `fixtures/containers.ts` | Independent source entries and minimal specimens; Reviewed. |
| Surface layout | `surfaces/canvas.tsx` / `ViewerChrome`; three surface renderers | Reviewed; all three surfaces compose approved parts around the generic Screen and own their capture/layout records in fixtures. |
| Navigation | `modules/navigation.tsx` / `Sidebar` | Reviewed; navigation/search fixtures are separate. |
| Inspector | `modules/inspector.tsx` / `Inspector`; `fixtures/inspector.json` | Reviewed; one Inspector composition with separate fixtures and approved source, exported-element, nested-element and empty-match states. |
| Menus | `modules/menus.tsx` / `Menu` | Reviewed; menu captures and their fixtures belong to the menus module. |
| View controls | `modules/view-controls.tsx` / `Tools`, `AppBar`, `ZoomBar` | Reviewed; tools, AppBar, ZoomBar and tooltip capture are approved, including Fit scan, Back disabled and Minimap pressed. |
| Directory opening | `modules/open-directory.tsx` / `OpenDialog` | Reviewed; directory states and recent entries have one fixture owner; current visual gaps are listed below. |
| Shortcuts | `modules/shortcuts.tsx` / `Shortcuts`; `components/kbd.tsx` | Reviewed; keyboard content belongs to shortcuts fixtures; keycap geometry uses dedicated tokens at its current values. |
| Canvas presentation | `modules/canvas.tsx` / `Drawing`, `Minimap`, `AssetLabel`; `fixtures/canvas.ts`, `scenes/`, `art/arc-previews/` | Reviewed; one canvas feature owner. Drawing owns section/artboard/flow layers; mapped AssetLabel specimens and preview artwork remain in use. |

The seven feature modules own their parts and specimens. Remaining coverage and fidelity gaps are listed below. There are no approved dependency-policy exceptions. `scenes/*.ts` are generated supporting data,
not frame sources. The separate `fixtures/arc-sample/design/` tree is acceptance content, not the viewer UI library.

### Part mappings and state

Paths in the source column are relative to `design/`. An implementation mapping names the corresponding runtime
location; the application does not import design TSX. "In use" includes a composed design consumer or mapped runtime
usage. Reviewed structural compositions preserve their existing visuals; remaining fidelity and capture gaps stay explicit below.

| Source / part | Implementation location | Design consumers | Approval / adoption / remaining gap |
| --- | --- | --- | --- |
| `tokens.css` | `public/index.html` `/tokens.css`; `public/style.css`; `public/app.js` `applyTheme` | All sources | Reviewed; in use. Shared theme, typography and geometry values. |
| `components/button.tsx` / `Button` | `public/index.html` `#directory-form .primary`, `#zoom-options`; `public/style.css` `.primary`, `#zoom-options` | `modules/open-directory`, `modules/view-controls` → surface chrome | Reviewed; in use. Frames: `primary`, `secondary`, `zoom`, `zoom-open`. Secondary is an unadopted generic variant; directory submit-disabled coverage remains a known gap. |
| `components/icon-button.tsx` / `IconButton` | `public/index.html` `.icon-button`; `public/style.css` `.icon-button`, pressed/current states | Inspector, navigation, directory, shortcuts and view-controls modules; Toolbar specimens | Reviewed; in use. Approved frames: `default`, `active`, `disabled`. Disabled uses the runtime 45% opacity and is adopted by ZoomBar. |
| `components/field.tsx` / `Field` | `public/index.html` `.picker`, `.search-field`, `#path`; `public/style.css` corresponding selectors | Navigation, directory and view-controls modules | Reviewed; in use. Frames: `search`, `search-active`, `picker`, `input`, `input-error`, `input-empty`. Default height uses `--field-height`; numeric overrides are supported. |
| `components/tree-row.tsx` / `TreeRow` | `public/app.js` `makeRow`, `renderNav`, `selection`, `recent`; `public/style.css` `.tree-row`, `.frame-row`, `#recent button` | Navigation, inspector and directory modules | Reviewed; in use. Frames: `root`, `root-selected`, `group`, `group-selected`, `item`, `item-selected`, `two-line`, `two-line-selected`. Heights use row tokens; numeric overrides are supported; multiline follows content. |
| `components/menu-item.tsx` / `MenuItem` | `public/index.html` menu buttons/headings; `public/style.css` `.menu button`, `.menu h3` | Menus module | Reviewed; in use. Frames: `item`, `item-active`, `check`, `option`, `label`. Heights use `--menu-item-height` and `--menu-label-height`. |
| `components/kbd.tsx` / `Kbd` | `public/index.html` `#keys kbd`; `public/style.css` `kbd` | Shortcuts module | Reviewed; in use; current 6px radius and 22px minimum size use dedicated keycap tokens; runtime radius gap is retained. |
| `components/panel.tsx` / `Panel` | `public/style.css` `.floating`, `.menu`, `dialog` | Navigation, inspector, menus, directory and shortcuts modules | In use; generic specimens `floating`, `menu`, `dialog` Reviewed. Default form remains `sidebar`. |
| `components/toolbar.tsx` / `Toolbar` | `public/style.css` `#tools`, `#app-bar`, `.zoom` | View-controls module | In use; generic specimens `toolbar`, `toolbar-wide` Reviewed. |
| `components/toolbar.tsx` / `Separator` | `public/index.html` `.separator`; `public/style.css` `.separator` | AppBar and ZoomBar in view-controls | In use; generic specimen `separator` Reviewed. |
| `components/canvas.tsx` / `Canvas` | `public/index.html` `.gallery-viewport`; `public/app.js` `drawBackground` | Screen, Scrim specimen | In use; `canvas-dots` specimen Reviewed. |
| `modules/canvas.tsx` / `Drawing` | `public/app.js` `draw`, `drawLabels`; `public/labels.js` `Labels` | Screen → surfaces and feature-module captures | Reviewed; in use; owns section fills, artboard/flow outlines, preview images and SVG labels. The cropped `drawing` specimen shows its existing section layer. |
| `components/canvas.tsx` / `Screen` | `public/index.html` gallery layers; `public/app.js` `draw` | Three surfaces and captured feature modules | In use; generic scene layer with child content, independent of feature dispatch; callers supply the drawing content. Specimen `screen` Reviewed. |
| `components/canvas.tsx` / `Scrim` | `public/style.css` `dialog::backdrop` | ViewerChrome and shortcuts module | In use; existing 60% canvas overlay. Specimen `scrim` Reviewed. |
| `modules/navigation.tsx` / `Sidebar` | `public/index.html` `#sidebar`; `public/app.js` `renderNav` | ViewerChrome → surfaces | Reviewed; in use; frames: `search`, captured `search-results`. Fixtures own rows, directory, query and count. |
| `modules/inspector.tsx` / `Inspector` | `public/index.html` `#source`, `#relationships`; `public/app.js` `selection`, `renderRelationships`; `public/selection.js` `exportFrames` | ViewerChrome → inspector surface; mapped source and export selection | Reviewed; in use. Approved states: `frames`, `frame`, `element`, `source`, `export-element`, `export-element-nested`, `export-element-empty`. Export rows show owning-frame sizes while the header shows the selected element size; export rows have no selected frame highlight. |
| `modules/menus.tsx` / `Menu` | `public/index.html` `#display-menu`, `#zoom-menu`, `#more-menu` | Menus module captures; mapped runtime menus | Reviewed; in use; frames: `default`, `display`, `zoom`, `more`, with separate menu fixtures. |
| `modules/open-directory.tsx` / `OpenDialog` | `public/index.html` `#directories`; `public/app.js` `showOpen`, `open`, `recent` | ViewerChrome → open-directory surface | Reviewed; in use; `error` specimen and captured states preserve existing visuals. Recent labels/paths are shared with runtime fixtures. Two-line rows use their existing height token. |
| `modules/shortcuts.tsx` / `Shortcuts` | `public/index.html` `#keys`; `public/style.css` `#keys` | Mapped runtime usage; module capture | Reviewed; in use; captured `default` consumes shared keyboard fixtures; its module owns the local dialog capture. |
| `modules/view-controls.tsx` / `Tools` | `public/index.html` `#tools`; display/inspector/fullscreen handlers | ViewerChrome → surfaces; menus and view-controls module captures | Reviewed; in use; frames: `tools`, `tools-tooltip`. |
| `modules/view-controls.tsx` / `AppBar` | `public/index.html` `#app-bar`; `public/app.js` `updateChrome` | ViewerChrome → canvas/open-directory surfaces | Reviewed; in use; `app-bar` uses a separate presentation fixture. |
| `modules/view-controls.tsx` / `ZoomBar` | `public/index.html` `.zoom`; zoom/fit handlers | ViewerChrome → surfaces; menus module | Reviewed; in use; Fit uses `scan`, Back exposes `backDisabled`, and Minimap exposes `minimapPressed` through the existing active form. All four state specimens are approved. Frames: `zoom-bar`, `zoom-bar-menu-open`, `zoom-bar-back-disabled`, `zoom-bar-minimap-pressed`. |
| `surfaces/canvas.tsx` / `ViewerChrome` | `public/index.html` floating chrome; `public/app.js` `updateChrome` | All three surface renderers | In use; boundary Reviewed. Only chooses and positions imported feature parts. |
| `modules/canvas.tsx` / `Minimap` | `public/index.html` `#minimap`; `public/app.js` `drawMap` | ViewerChrome → canvas surface | Reviewed; in use; `minimap` preserves the existing specimen geometry; its fidelity gap is listed below. |
| `components/tooltip.tsx` / `Tooltip` | `public/index.html` `#tooltip`; tooltip handlers; `public/style.css` `#tooltip` | View-controls module capture | Reviewed; in use; existing tooltip geometry and its default specimen are preserved. |
| `modules/canvas.tsx` / `AssetLabel` | `public/labels.js` `Labels`; `public/app.js` `drawLabels`; `.label-copy` | Mapped runtime usage; no imported design consumer | Reviewed; in use; frames: `asset-label-modified`, `asset-label-hover`, `asset-label-copied`. Drawing retains SVG labels under this same feature owner. |
| `surfaces/canvas.tsx` / frame renderer | Gallery layout/camera/chrome | Entry surface | Reviewed structural composition; existing full-region layouts and camera states retained; capture identities remain mapped below. |
| `surfaces/inspector.tsx` / frame renderer | Gallery and source inspector | Entry surface | Reviewed structural composition; frame/component captures use the unified Inspector and retain their existing full-window crops. Approved source/export states belong to the module. |
| `surfaces/open-directory.tsx` / frame renderer | Gallery and directories dialog | Entry surface | Reviewed structural composition; empty/dialog/error captures retain their current crops, chrome and shared directory fixtures. |

`fixtures/buttons.ts`, `fixtures/fields.ts` and `fixtures/rows.ts` own frame presentation data for Button, IconButton,
Field, TreeRow and MenuItem. `fixtures/containers.ts` owns only neutral generic-container specimen dimensions and icon content.
`fixtures/navigation.json` owns Sidebar presentation records for module and surface consumers. The compact `search`
specimen shows one of two results; the captured `search-results` frame shows both, matching the runtime fixture.
Part defaults belong to their defining components. The fixtures have no independent implementation mapping.
`fixtures/menus.json` owns menu rows and widths; `fixtures/view-controls.json` owns AppBar presentation data and ZoomBar state specimens.
`fixtures/inspector.json` owns Inspector specimens and captured surface content. The `frame` and `element` records
retain illustrative external source names; `source` and exported-element states use the local ARC snapshot.
Their part mappings are `StatePill` in `components/state-pill.tsx` and nested `Input` in `components/field.tsx`;
`SetupAction` in `components/setup-choice.tsx` has no owning-frame match when selected in `surfaces/setup.tsx` / `source-empty`.
Only frame/component states have dedicated runtime captures; extra local source/export specimens use ARC owner/geometry data.
`fixtures/open-directory.json` owns recent labels/paths and dialog presentation states; `fixtures/viewer.mjs`
derives runtime recent paths from that same record.
`fixtures/shortcuts.json` owns shortcut labels/key sequences and the keycap specimen.
`fixtures/canvas.ts` owns neutral drawing/minimap data and AssetLabel presentation content.
`fixtures/canvas-surfaces.ts` owns the canvas surface's four frame/capture records and chrome placement.
`fixtures/inspector-surfaces.ts` owns inspector surface capture/layout records; content remains in `fixtures/inspector.json`.
`fixtures/menu-captures.ts` owns the three local menu capture/layout records; no menus surface source remains.
`fixtures/open-directory-surfaces.ts` owns the empty/dialog/error surface capture and placement records.
Frame names are listed above, and composition is owned by the consumers in the mapping table.


### Generic container specimens

These sources remain direct gallery entries. The outer `bg-canvas p-6` specimen wrapper provides shadow space;
it is review framing, not product chrome. Panel owns no internal padding or border. Neutral Panel height and Toolbar
icons are fixture content. Container fills, radii, shadows, padding and gaps use their existing part definitions.

| Specimen | Corresponding functional frame / existing layer |
| --- | --- |
| `components/panel` / `floating` | `modules/navigation` / `search`: outer Panel, 260px wide, panel radius and floating shadow |
| `components/panel` / `menu` | `modules/menus` / `default`: outer Panel, 220px wide, menu radius and shadow |
| `components/panel` / `dialog` | `modules/open-directory` / `error`: outer Panel, 360px wide, dialog radius and menu shadow |
| `components/toolbar` / `toolbar` | `modules/view-controls` / `tools`: outer Toolbar, 44px high, 6px padding and 4px gap |
| `components/toolbar` / `toolbar-wide` | `modules/view-controls` / `app-bar`: outer Toolbar, 44px high, 6px padding and 8px gap |
| `components/toolbar` / `separator` | `modules/view-controls` / `app-bar`: 1 × 20px border-colored divider |
| `components/canvas` / `screen` | `surfaces/canvas` / `components`: Canvas background and scene-layer layout with empty content |
| `components/canvas` / `scrim` | `surfaces/open-directory` / `dialog`: 60% canvas-colored overlay above the Canvas |

### Captures and artwork budget

Surface and feature-module fixture identities and states are listed under Frames and fixtures. Their exact page crops, origins and
viewports live in each `Frame.capture`; the adapter is `sdg.config.mjs`, with runtime states in `fixtures/viewer.mjs`.
Fresh frame renders use `output/design/<source>/<frame>-<theme>.png`. Existing files at that location may be stale;
each review uses its own baseline and newly rendered affected frames. The button specimens have no implementation
capture of their own; their composed usage is reachable through the surface fixtures.

| Artwork | Display dimensions | Resolution and file-size budget | Owner |
| --- | --- | --- | --- |
| `art/arc-previews/*.png` | Each preview's `size` in `scenes/{canvas,inspector,menus,navigation,open-directory,shortcuts,view-controls}.ts`; declared placements are at most 1200px wide and 668px high | Twice the largest specimen scale, capped at 4096px per bitmap dimension; at most 256 KiB per PNG and 3 MiB for the complete light/dark snapshot | Canvas presentation; generated by `fixtures/refresh-arc-scenes.mjs` |

The preview snapshot has 188 PNGs representing 94 ARC artboards in both themes. All are referenced by scene data.
Source provenance and palette ownership remain with the ARC fixture. Preview artwork is repository-only and excluded
from the npm package. Every referenced bitmap fits the declared per-image and total budgets; the canvas module owns scene presentation.

### Known gaps

- Directory copy remains SVG-specific and includes a redundant description; disabled/pending submit states are missing.
- Keycap radius is 6px in design and 7px at runtime.
- Canvas scenes use SVG labels; runtime labels use DOM. Minimap specimen geometry differs from runtime.
- Inspector retains legacy full-window crops and content-fit layout; runtime header/scroll geometry and independent
  source/export captures are missing.
- Button's secondary variant has no mapped runtime consumer.

## Direction

SDG uses the Float direction. A dotted canvas fills the window. Chrome floats above it as rounded panels: the sidebar card, the tool pill at the top right, the zoom bar at the bottom center, and the inspector, menus and minimap when open. Selection is a monochrome ring. Chrome stays neutral in both themes, so each project's palette reads true on its own canvas color.

## Screen

- There is no header row. Back is the first control in the zoom bar.
- The tool pill holds Display, Inspector, Fullscreen and More. Display is one menu for theme and canvas background.
- Search lives only in the sidebar and opens with ⌘F. Results replace the tree until the query clears.
- A directory opens only through the directory picker, in the sidebar or the app bar. The picker opens the open-directory dialog, which lists recent directories.
- The zoom bar is back, then zoom out, the zoom menu and zoom in, then Fit and the minimap toggle. The zoom menu holds Fit all (0), Fit group, Fit selection and Zoom to 100% (1).
- More holds Arrange current group and Keyboard shortcuts (?).
- Collapsing the sidebar leaves the app bar: the sidebar toggle, SDG and the directory picker.
- The right inspector follows source, frame and exported-element selection. It opens by default and remembers its collapsed state. Source path and frame name have inline copy controls, followed by frame sizes, a scrollable frame list and Relationships. Uses and Used by group direct and indirect sources by directory; indirect entries are muted and name their shortest route. The TSX review states and shared inspector composition are in `design/modules/inspector.tsx`; the generic shell is in `design/components/panel.tsx`.
- Frame clicks select the variant. Hovering an exported component outlines its root; clicking it shows the owning source/export and matching frames. Selecting a relationship focuses its source, and selecting a matching frame focuses that variant. Source-title clicks select the source and retain copying; the copy icon alone copies. Escape clears selection and Back restores selection and camera.
- With no directory open, the screen shows only the app bar and the open-directory dialog without a close button.

Geometry, in CSS pixels at a 1440 × 900 viewport:

| Element | Position and size |
| --- | --- |
| Sidebar | 12 from the top, left and bottom; 260 wide. Toggle at (6, 6); title at x 48; picker at y 48 and search at y 92, both 236 × 32 at x 12; tree from y 136 |
| Tree rows | 28 high, radius 8. Groups advance 30, items 28 and indent 20; an open group adds 6 after its items. A divider follows All designs |
| Tool pill | 12 from the top and right; 44 high; four 32px buttons on a 36px pitch with 6 padding |
| App bar | 12 from the top and left; 44 high; toggle, title at x 46, a separator, then a 220-wide picker |
| Zoom bar | 16 from the bottom; 44 high; centered over the canvas between the sidebar or left edge and the inspector or right edge |
| Inspector | 300 wide, right edge 12 from the window, top at 64; height follows its content |
| Minimap | 200 × 132, 12 from the right and 16 from the bottom |
| Menus | 6 below their trigger and right-aligned to the tool pill; the zoom menu is centered on its trigger and 8 above the bar |
| Dialogs | Centered, 440 wide for Open and 380 for shortcuts, over a `--canvas` scrim at 60% opacity |

## Canvas layout

The world is laid out in SVG units and never changes while panning, zooming or collapsing the sidebar. Groups come from `gallery.json`, or from directories without one. `fixtures/arc-sample.layout.json` is the reference result for `fixtures/arc-sample/design/`.

- **Sets.** A component source is one set. Its forms run left to right in source order with a 32 gap and wrap before 1600, with 48 between rows. The set's bounds are its forms padded 24 at the sides, 36 at the top and 24 at the bottom.
- **Flows.** A surface source is one flow. Each frame takes its size plus 16 on every side. Frames run left to right with a 64 gap and wrap before 3600, with 112 between lines.
- **Sections.** Each group is one section. Sets pack first with skyline packing in group order: each set goes to the lowest available position, then the leftmost, with 64 between sets and 112 between rows. Flows follow 200 below the sets, packed in rows with 64 between flows and 200 between rows. The section's content width is the width from the widest block upward, in steps of 50, whose packed aspect ratio is closest to 1.6. The section pads its content 64 at the sides and bottom and 104 at the top.
- **World.** Sections pack in rows with 480 between them. The row width is chosen in steps of 100 so the whole world's aspect ratio is closest to 1.5.
- **Fit.** Fit places the target inside the canvas area inset 20 from the sidebar or left edge, 24 from the right edge or inspector, 100 from the top and 84 from the bottom, centered. Fit selection insets that area by 24 on every side. Zoom to 100% keeps the point at the center of that area.

## Labels

Labels draw at constant screen size. Each label is drawn only when it fits its slot and does not collide with floating chrome or another label; otherwise it is omitted.

- Section title: `--text-section` 650 at 16 above the section's top-left, followed 8 later by the asset count in `--text-meta` tertiary.
- Set name: `--text-meta` 550 secondary, or `--text` when selected, 12 above the artboard, followed 6 later by its form count and 10 later by the source's last modification time. Time uses local `MMM d, HH:mm`; hovering it shows the full local timestamp. Shown from 20% zoom. When space narrows, omit the time first, then the count, retaining the name whenever it fits.
- Headings whose original anchor moves above or left of the viewport follow the visible canvas edge with an 8px inset, avoiding floating chrome by 12px. The selected asset's heading gets priority when labels collide.
- Form names: `--text-caption` tertiary, with its center 9.5 above each form's top, inside the artboard. Shown from 75% zoom for sets with two or more forms. Visible captions are tested individually; offscreen or occluded siblings do not hide them.
- Flow name: `--text-meta` 600 secondary, 34 above the flow, followed by its frame count and source modification time, with the same priority and clipping rules as set headings. Frame name: `--text-caption` tertiary, or 550 `--text` when selected, 12 above the frame. Both shown from 20% zoom.
- Artboards have a 1px `--border` stroke, radius 6, and the asset's own canvas color. Selection replaces the stroke with a 2px `--accent` ring. Previews never stretch.

## Frames and fixtures

Each captured surface or feature-module frame declares its fixture and a page capture at a 1440 × 900 viewport. Canvas and inspector frames, plus the empty/open dialog frames, cover the viewport. Menu, tooltip, shortcuts and error frames retain their local crop sizes and origins in `Frame.capture`. Fixtures open `fixtures/arc-sample/design/` with isolated preferences.

| Asset | Frame | Fixture theme | State |
| --- | --- | --- | --- |
| canvas | components | light | Essentials open, `field` selected, Fit group |
| canvas | zoomed | dark | As above at 100%, section top-left at (292, 112), minimap on |
| canvas | surfaces | light | Connections & MCP open, mcp-hub `failed` selected, 30%, section top-left at (292, 112) |
| canvas | overview | dark | Sidebar collapsed, nothing selected, Fit all |
| inspector | frame | light | mcp-hub `failed` selected, inspector open, Fit selection |
| inspector | component | dark | `button` selected, inspector open, 125% centered on the set |
| menus module | display, zoom, more | light | The menu open over the components state |
| navigation module | search-results | light | Query `pill` with the first result selected |
| view-controls module | tools-tooltip | light | Pointer resting on the Inspector button |
| shortcuts module | default | light | Keyboard shortcuts open |
| open-directory | empty | light | No directory open |
| open-directory | dialog | dark | The picker activated over the overview |
| open-directory | error | light | `~/projects/empty` submitted |

## Implementation notes

The asset metadata heading and its copy interaction in `design/modules/canvas.tsx` / `AssetLabel` are reviewed and adopted.
Clicking a component, flow, frame, form or section name, or its adjacent 12px copy icon, copies the displayed name.
The copy icon appears on title hover or keyboard focus. A successful copy shows a check for 1.2 seconds. Its 16px
space, including the gap, stays reserved while the icon is transparent so metadata does not shift; the space yields
when needed to keep a narrow name visible. Title buttons support Enter and Space without triggering canvas gestures.
Clipboard failures use the existing error alert. Modification times describe the source file on disk. Fixture
timestamps use November 7, 2026 at 13:24:08 UTC so comparisons remain deterministic.

- The runtime theme uses `design/tokens.css` as its only token source.
- Icons use Lucide geometry at a 1.75px stroke. Do not use Unicode glyphs as icons.
- Canvas labels are positioned DOM text or reported through the compare `texts` hook, so `compare` reads them.
- Form bounds for layout are the frames' sizes without shadow padding; the set padding covers shadows.

## Scene data

Ordinary controls use flex/grid layout and shared component functions. Only the free-form drawing canvas and floating chrome positions use coordinates, under `data-free`. Panels and lists follow content through padding and gaps; buttons size from their label and icon. The seven scene data files hold section, asset, crop and label data for loop-based drawing. The ARC preview pictures in `design/art/arc-previews/` are light/dark PNG renders of the TSX fixture artboards, imported as data URLs only by scenes that display them; their palettes are independent of SDG chrome. `node fixtures/refresh-arc-scenes.mjs` regenerates these images and the scene data from the local fixture and its layout reference. Preview resolution is twice the largest specimen scale, capped at 4096 pixels. They are not package contents.

The ARC snapshot at `b9e18beb` contains 51 sources (31 components and 20 surfaces), 94 artboards and six sections: Essentials (8), Agents & quota (6), Tasks & interactions (5), Connections & MCP (6), components (14) and surfaces (12). The four curated groups retain their source order; the final two contain unlisted sources. Fit all is about 7% at the declared viewport. The MCP inspector includes the source frame notes and its empty frame is 960 × 434.

The inspector exposes source, frame and export detail. Canvas labels occluded by the selection inspector are omitted.
Browser text metrics can differ from SVG central-baseline metrics by about one pixel.

The server-only resident hub ships minimal unstyled navigation pending the separate hub UI approval. The viewer directory dialog is retired: `open-dialog` and `open-error` fixture IDs now resolve to the baseline canvas; their existing design snapshots await the UI lane update. The `open-empty` fixture retains an empty canvas without a filesystem input.
