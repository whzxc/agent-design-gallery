# SDG design

[Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

The TSX sources in `design/` define how the viewer looks. This document records the current direction, ownership,
implementation mappings and review process. The asset rules take precedence over conflicting project guidance.

## Governance

- Minimum toolkit: SDG `>=0.5.0`, declared in `sdg.config.mjs`.
- Design root: `design/`; discovery order: `components`, `modules`, `surfaces`. No explicit source override or
  import-direction opt-out is configured. There are currently no modules or studies.
- Review platform: macOS with system UI fonts. The declared implementation capture viewport is 1440 × 900,
  locale `en-US`, timezone `UTC`; ARC artwork retains its own content language. Other viewport and locale forms
  are not declared.
- Codex proposes and implements each authorized batch. The delegating Claude conversation reviews the completed report,
  ownership, mappings and renders after the Codex turn ends. Codex does not dispatch other Agents or answer their
  permission requests.
  The controller may release a structure-only batch when every affected frame is pixel-identical in both themes and
  no choice remains unresolved. Visual differences or unresolved choices go to the user for gallery approval.
- Capture a baseline in a disposable copy outside the checkout before editing. Run `sdg check`, render all affected
  frames in both themes, inspect them and compare decoded pixels per frame and theme. Commit only the authorized
  batch. Open review with `sdg open <design-directory> --port=<free-port>`; port 4310 is reserved.
- This document keeps current mappings, approval/adoption state, exceptions and scope. Render, pixel-comparison and
  controller-review evidence stays in local `output/` or the external baseline copy. This document has no batch log.

### Ownership and current scope

| Owner | Current assets | Current scope / remaining work |
| --- | --- | --- |
| Shared values and button controls | `tokens.css`, `components/button.tsx`, `components/icon-button.tsx`, `fixtures/buttons.ts` | Reviewed; part defaults belong to components and frame specimens belong to fixtures. |
| Fields | `components/field.tsx`, `fixtures/fields.ts` | Reviewed; part defaults belong to the component and frame specimens belong to fixtures. |
| Rows | `components/tree-row.tsx`, `components/menu-item.tsx`, `fixtures/rows.ts` | Row/menu specimens, dimension tokens, fixture data and states. Controller review pending. |
| Viewer shell | `Panel`, `Toolbar`, `Separator`, `Canvas`, `Screen` | Separate generic containers from feature composition before moving their consumers. |
| Navigation | `Sidebar` | Own the sidebar/search feature and its fixture data. |
| View controls | `Tools`, `AppBar`, `ZoomBar`, `Menu` | Own tool and menu states; reconcile Fit geometry and disabled/pressed states. |
| Inspector | `Inspector`, `DetailInspector` | Establish one defining inspector module and its local states. |
| Directory opening | `OpenDialog` | Own recent directories, errors and dialog states. |
| Shortcuts | `Shortcuts`, `Kbd` | Own shortcut content and reconcile keycap radius. |
| Canvas presentation | `Drawing`, `Artboard`, `Flow`, `Section`, `AssetLabel`, `Minimap`, `Tooltip`, `scenes/`, `art/arc-previews/` | Resolve duplicate ownership, unknown consumers and artwork governance. |
| Full-region composition | The four `surfaces/*.tsx` sources | Review one source at a time after its dependencies; relocate feature-local frames. |

The remaining migration scope is tracked above; its legacy placement is an open gap, not an intentional layer exception.
There are no approved dependency-policy exceptions. `scenes/*.ts` are generated supporting data rather than frame sources.
The repository's separate `fixtures/arc-sample/design/` tree is acceptance content, not this viewer's UI library.

### Part mappings and state

Paths in the source column are relative to `design/`. An implementation mapping names the corresponding runtime
location; the application does not import design TSX. "In use" includes a composed design consumer or mapped runtime
usage. "Unrecorded" means current approval evidence has not been linked. Unknown mappings stay explicit until their
owning scope resolves them.

| Source / part | Implementation location | Design consumers | Approval / adoption / remaining gap |
| --- | --- | --- | --- |
| `tokens.css` | `public/index.html` `/tokens.css`; `public/style.css`; `public/app.js` `applyTheme` | All sources | In use. Shared button/field values Reviewed; row/menu sizing pending controller review. |
| `components/button.tsx` / `Button` | `public/index.html` `#directory-form .primary`, `#zoom-options`; `public/style.css` `.primary`, `#zoom-options` | `panel`, `toolbar` → `canvas` → all surfaces; `panel` → `source-relationships` | Reviewed; in use. Frames: `primary`, `secondary`, `zoom`, `zoom-open`. `secondary` is a specimen variant with unknown current runtime usage, assigned to the view-controls scope. Submit-disabled state remains a later gap. |
| `components/icon-button.tsx` / `IconButton` | `public/index.html` `.icon-button`; `public/style.css` `.icon-button`, pressed/current states | `panel`, `toolbar` → `canvas` → all surfaces; `panel` → `source-relationships` | Reviewed; in use. Frames: `default`, `active`. Disabled Back and Minimap pressed coverage belong to the view-controls scope. |
| `components/field.tsx` / `Field` | `public/index.html` `.picker`, `.search-field`, `#path`; `public/style.css` `.picker`, `.search-field`, `.searching .search-field`, `#path`, `#path[aria-invalid="true"]` | `panel`, `toolbar` → `canvas` → all surfaces; `panel` → `source-relationships` | Reviewed; in use. Frames: `search`, `search-active`, `picker`, `input`, `input-error`, `input-empty`. Default height uses `--field-height`; numeric height overrides are supported. |
| `components/tree-row.tsx` / `TreeRow` | `public/app.js` `makeRow`, `renderNav`, `selection`, `recent`; `public/style.css` `.tree-row`, `.frame-row`, `#recent button` | `panel` → `canvas` → all surfaces; `panel` → `source-relationships` | Controller review pending; in use. Frames: `root`, `root-selected`, `group`, `group-selected`, `item`, `item-selected`, `two-line`, `two-line-selected`. Single-line/multiline minimum height uses `--row-height`; two-line height uses `--row-height-two-line`. Numeric height overrides are supported; multiline rows follow content. |
| `components/menu-item.tsx` / `MenuItem` | `public/index.html` menu buttons/headings; `public/style.css` `.menu button`, `.menu h3` | `panel` → `canvas` → all surfaces | Controller review pending; in use. Frames: `item`, `item-active`, `check`, `option`, `label`. Heights use `--menu-item-height` and `--menu-label-height`. |
| `components/kbd.tsx` / `Kbd` | `public/index.html` `#keys kbd`; `public/style.css` `kbd` | `panel` / `Shortcuts` → `surfaces/menus.tsx` | Approval unrecorded; in use; 6px design versus 7px implementation radius. |
| `components/panel.tsx` / `Panel` | `public/style.css` `.floating`, `.menu`, `dialog` | Other parts in `panel`; `source-relationships`; via `canvas` to surfaces | Approval unrecorded; in use; separate the generic shell. |
| `components/panel.tsx` / `Sidebar` | `public/index.html` `#sidebar`; `public/app.js` `renderNav`; `public/style.css` `#sidebar` | `canvas` / `Screen` → canvas, inspector and menus surfaces | Approval unrecorded; in use; navigation module pending. |
| `components/panel.tsx` / `Inspector` | `public/index.html` `#source`; `public/app.js` `selection`; `public/style.css` `#source` | `canvas` / `Screen`; `source-relationships` / `DetailInspector` | Approval unrecorded; in use; two inspector compositions need consolidation. |
| `components/panel.tsx` / `Menu` | `public/index.html` `#display-menu`, `#zoom-menu`, `#more-menu`; `public/style.css` `.menu` | `canvas` / `Screen` → menus surface | Approval unrecorded; in use; feature states remain in a surface. |
| `components/panel.tsx` / `OpenDialog` | `public/index.html` `#directories`; `public/app.js` `showOpen`, `open`, `recent` | `canvas` / `Screen` → open-directory surface | Approval unrecorded; in use; recent data and SVG-specific copy need reconciliation. |
| `components/panel.tsx` / `Shortcuts` | `public/index.html` `#keys`; `public/style.css` `#keys` | `canvas` / `Screen` → menus surface | Approval unrecorded; in use; no owning feature module. |
| `components/toolbar.tsx` / `Toolbar` | `public/style.css` `#tools`, `#app-bar`, `.zoom` | `Tools`, `AppBar`, `ZoomBar` → `canvas` → surfaces | Approval unrecorded; in use; keep generic container separate from feature controls. |
| `components/toolbar.tsx` / `Separator` | `public/index.html` `.separator`; `public/style.css` `.separator` | `AppBar`, `ZoomBar` → `canvas` → surfaces | Approval unrecorded; in use. |
| `components/toolbar.tsx` / `Tools` | `public/index.html` `#tools`; `public/app.js` display/inspector/fullscreen handlers | `canvas` / `Screen` → surfaces | Approval unrecorded; in use; view-controls module pending. |
| `components/toolbar.tsx` / `AppBar` | `public/index.html` `#app-bar`; `public/app.js` `updateChrome` | `canvas` / `Screen` → canvas and open-directory surfaces | Approval unrecorded; in use; view-controls module pending. |
| `components/toolbar.tsx` / `ZoomBar` | `public/index.html` `.zoom`; `public/app.js` zoom/fit handlers | `canvas` / `Screen` → canvas, inspector, menus and open-directory surfaces | Approval unrecorded; in use; Fit icon and control-state gaps. |
| `components/canvas.tsx` / `Canvas` | `public/index.html` `.gallery-viewport`; `public/app.js` `drawBackground` | `Screen` → all surfaces | Approval unrecorded; in use. |
| `components/canvas.tsx` / `Drawing` | `public/app.js` `draw`, `drawLabels`; `public/labels.js` `Labels` | `Screen` → all surfaces | Approval unrecorded; in use; drawing and label ownership need reconciliation. |
| `components/canvas.tsx` / `Screen` | `public/index.html` `.gallery`; `public/app.js` `updateChrome`, `draw` | All four surfaces | Approval unrecorded; in use; feature dispatch currently lives in components. |
| `components/minimap.tsx` / `Minimap` | `public/index.html` `#minimap`; `public/app.js` `drawMap` | `canvas` / `Screen` → canvas surface | Approval unrecorded; in use; specimen geometry differs from runtime geometry. |
| `components/tooltip.tsx` / `Tooltip` | `public/index.html` `#tooltip`; `public/app.js` `[data-tooltip]` handlers, `hideTooltip`; `public/style.css` `#tooltip` | `canvas` / `Screen` → menus surface | Approval unrecorded; in use. |
| `components/asset-label.tsx` / `AssetLabel` | `public/labels.js` `Labels`; `public/app.js` `drawLabels`; `public/style.css` `.label-copy` | No imported design consumer; mapped runtime usage | Reviewed; in use; canvas designs still draw labels through `Drawing`. |
| `components/source-relationships.tsx` / `DetailInspector` | `public/app.js` `selection`, `renderRelationships`; `public/index.html` `#source`, `#relationships` | No imported design consumer; mapped runtime usage | Approval unrecorded; in use; inspector surface uses the older composition. |
| `components/artboard.tsx` / `Artboard` | Unknown; runtime drawing overlaps this responsibility | None found | Approval and adoption unknown; resolve in canvas scope before retention or deletion. |
| `components/flow.tsx` / `Flow` | Unknown; runtime drawing overlaps this responsibility | None found | Approval and adoption unknown; resolve in canvas scope before retention or deletion. |
| `components/section.tsx` / `Section` | Unknown; runtime drawing overlaps this responsibility | None found | Approval and adoption unknown; resolve in canvas scope before retention or deletion. |
| `surfaces/canvas.tsx` / frame renderer | `public/index.html` gallery; `public/app.js` layout/camera/chrome | Entry surface | Approval unrecorded; mapped fixtures below; full-frame scope pending. |
| `surfaces/inspector.tsx` / frame renderer | `public/index.html` gallery and `#source`; `public/app.js` `selection` | Entry surface | Approval unrecorded; mapped fixtures below; export-element state remains a gap. |
| `surfaces/menus.tsx` / frame renderer | `public/index.html` menus, sidebar, tooltip and `#keys` | Entry source | Approval unrecorded; mapped fixtures below; feature-local frames need relocation. |
| `surfaces/open-directory.tsx` / frame renderer | `public/index.html` gallery and `#directories` | Entry surface | Approval unrecorded; mapped fixtures below; full-frame scope pending. |

`fixtures/buttons.ts`, `fixtures/fields.ts` and `fixtures/rows.ts` own frame presentation data for Button, IconButton,
Field, TreeRow and MenuItem.
Part defaults belong to their defining components. The fixtures have no independent implementation mapping.
Frame names are listed above, and composition is owned by the consumers in the mapping table.

### Captures and artwork budget

Surface fixture identities and states are listed under Frames and fixtures. Their exact page crops, origins and
viewports live in each `Frame.capture`; the adapter is `sdg.config.mjs`, with runtime states in `fixtures/viewer.mjs`.
Fresh frame renders use `output/design/<source>/<frame>-<theme>.png`. Existing files at that location may be stale;
each review uses its own baseline and newly rendered affected frames. The button specimens have no implementation
capture of their own; their composed usage is reachable through the surface fixtures.

| Artwork | Display dimensions | Resolution and file-size budget | Owner |
| --- | --- | --- | --- |
| `art/arc-previews/*.png` | Each preview's `size` in `scenes/{canvas,inspector,menus,open-directory}.ts`; declared placements are at most 1200px wide and 668px high | Twice the largest specimen scale, capped at 4096px per bitmap dimension; at most 256 KiB per PNG and 3 MiB for the complete light/dark snapshot | Canvas presentation; generated by `fixtures/refresh-arc-scenes.mjs` |

The preview snapshot has 188 PNGs representing 94 ARC artboards in both themes. All are referenced by scene data.
Source provenance and palette ownership remain with the ARC fixture. Preview artwork is repository-only and excluded
from the npm package. Per-image downsizing and owner consolidation belong to the canvas scope.

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
- The right inspector follows source, frame and exported-element selection. It opens by default and remembers its collapsed state. Source path and frame name have inline copy controls, followed by frame sizes, a scrollable frame list and Relationships. Uses and Used by group direct and indirect sources by directory; indirect entries are muted and name their shortest route. The TSX review states are in `design/components/source-relationships.tsx`; the shared inspector shell is in `design/components/panel.tsx`.
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

Every surface frame declares its fixture and a page capture at a 1440 × 900 viewport. Canvas and inspector frames, plus the empty/open dialog frames, cover the viewport. Menu, tooltip, shortcuts and error frames retain their local crop sizes and origins in `Frame.capture`. Fixtures open `fixtures/arc-sample/design/` with isolated preferences.

| Asset | Frame | Fixture theme | State |
| --- | --- | --- | --- |
| canvas | components | light | Essentials open, `field` selected, Fit group |
| canvas | zoomed | dark | As above at 100%, section top-left at (292, 112), minimap on |
| canvas | surfaces | light | Connections & MCP open, mcp-hub `failed` selected, 30%, section top-left at (292, 112) |
| canvas | overview | dark | Sidebar collapsed, nothing selected, Fit all |
| inspector | frame | light | mcp-hub `failed` selected, inspector open, Fit selection |
| inspector | component | dark | `button` selected, inspector open, 125% centered on the set |
| menus | display, zoom, more | light | The menu open over the components state |
| menus | search | light | Query `pill` with the first result selected |
| menus | tooltip | light | Pointer resting on the Inspector button |
| menus | shortcuts | light | Keyboard shortcuts open |
| open-directory | empty | light | No directory open |
| open-directory | dialog | dark | The picker activated over the overview |
| open-directory | error | light | `~/projects/empty` submitted |

## Implementation notes

The asset metadata heading and its copy interaction in `design/components/asset-label.tsx` are reviewed and adopted.
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

Ordinary controls use flex/grid layout and shared component functions. Only the free-form drawing canvas and floating chrome positions use coordinates, under `data-free`. Panels and lists follow content through padding and gaps; buttons size from their label and icon. The scene modules hold section, asset, crop and label data for loop-based drawing. The ARC preview pictures in `design/art/arc-previews/` are light/dark PNG renders of the TSX fixture artboards, imported as data URLs only by scenes that display them; their palettes are independent of SDG chrome. `node fixtures/refresh-arc-scenes.mjs` regenerates these images and the scene data from the local fixture and its layout reference. Preview resolution is twice the largest specimen scale, capped at 4096 pixels. They are not package contents.

The ARC snapshot at `b9e18beb` contains 51 sources (31 components and 20 surfaces), 94 artboards and six sections: Essentials (8), Agents & quota (6), Tasks & interactions (5), Connections & MCP (6), components (14) and surfaces (12). The four curated groups retain their source order; the final two contain unlisted sources. Fit all is about 7% at the declared viewport. The MCP inspector includes the source frame notes and its empty frame is 960 × 434.

The inspector exposes source, frame and export detail. Canvas labels occluded by the selection inspector are omitted.
Browser text metrics can differ from SVG central-baseline metrics by about one pixel.
