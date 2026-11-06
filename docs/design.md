# SDG design

[Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

The assets in `design/` define how the viewer looks. This document records the decisions the frames cannot show: the direction, the screen structure, the canvas layout algorithm and the fixtures each frame is compared against. Asset format and commands are in the [design toolkit](design-toolkit.md).

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

The world is laid out in SVG units and never changes while panning, zooming or collapsing the sidebar. Groups come from `gallery.json`, or from directories without one. `fixtures/arc-sample.layout.json` is the reference result for `fixtures/arc-sample/`.

- **Sets.** A component file is one set. Its bounds are the union of its outermost form groups' geometric bounds, padded 24 at the sides, 36 at the top and 24 at the bottom. The preview shows that crop of the original sheet, so forms keep their source arrangement.
- **Flows.** A surface file is one flow. Each frame is cropped to its bounds plus 16 on every side. Frames run left to right with a 64 gap and wrap before 3600, with 112 between lines.
- **Sections.** Each group is one section. Sets pack first with skyline packing in group order: each set goes to the lowest available position, then the leftmost, with 64 between sets and 112 between rows. Flows follow 200 below the sets, packed in rows with 64 between flows and 200 between rows. The section's content width is the width from the widest block upward, in steps of 50, whose packed aspect ratio is closest to 1.6. The section pads its content 64 at the sides and bottom and 104 at the top.
- **World.** Sections pack in rows with 480 between them. The row width is chosen in steps of 100 so the whole world's aspect ratio is closest to 1.5.
- **Fit.** Fit places the target inside the canvas area inset 20 from the sidebar or left edge, 24 from the right edge or inspector, 100 from the top and 84 from the bottom, centered. Fit selection adds 24 on every side. Zoom to 100% keeps the point at the center of that area.

## Labels

Labels draw at constant screen size. Each label is drawn only when it fits its slot and does not collide with floating chrome or another label; otherwise it is omitted.

- Section title: `--text-section` 650 at 16 above the section's top-left, followed 8 later by the asset count in `--text-meta` tertiary.
- Set name: `--text-meta` 550 secondary, or `--text` when selected, 12 above the artboard, followed 6 later by its form count. Shown from 20% zoom when the name fits the set width plus its gap.
- Form names: `--text-caption` tertiary, 16 above each form inside the artboard. Shown from 75% zoom for sets with two or more forms, for all forms or none.
- Flow name: `--text-meta` 600 secondary, 34 above the flow, followed by its frame count. Frame name: `--text-caption` tertiary, or 550 `--text` when selected, 12 above the frame. Both shown from 20% zoom.
- Artboards have a 1px `--border` stroke, radius 6, and the asset's own canvas color. Selection replaces the stroke with a 2px `--accent` ring. Previews never stretch.

## Frames and fixtures

Every frame declares a 1440 × 900 viewport and names its fixture with `data-fixture`. Fixtures open `fixtures/arc-sample/` with isolated preferences.

| Asset | Frame | Theme | State |
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

- The runtime theme uses `design/tokens.css` as its only token source.
- Icons use Lucide geometry at a 1.75px stroke. Do not use Unicode glyphs as icons.
- Canvas labels are positioned DOM text or reported through the compare `texts` hook, so `compare` reads them.
- Form bounds for layout are geometric bounds without shadow padding; the set padding covers shadows.
