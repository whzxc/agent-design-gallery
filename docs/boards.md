# Board view

[Roadmap](roadmap.md) · [Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md)

The viewer presents a project's design library as boards. A board is a view: it owns no visual, has no
implementation binding and has no source file. The viewer derives every board from the source tree and the project's
optional `gallery.json`. Nobody authors boards or writes board prose. TSX sources remain the only source of truth.

## Model

| Board view | Derived from |
| --- | --- |
| Layer view | One layer scope: Tokens, Components, Modules, Surfaces, and Studies when the project has them. A scope that spans several layers stacks their bands top to bottom in layer order |
| Board | One chapter. A `gallery.json` group is a chapter: its title is the board title and its sources are its sections, in file order. Sources in no group form one chapter per directory group. A chapter is one board at any height |
| Section | One source. A module folder shows its `index.tsx` under the feature directory name. A legacy SVG source is a section too |
| Specimen | One declared frame, in declaration order, captioned with its frame name, note and proposal marker. A legacy SVG crop is a specimen; an SVG file without declarations is one specimen |
| Tokens board | `tokens.css`, presented as the [Tokens board](#tokens-board) describes |

Layer views stay layer-pure. A group that mixes layers splits by layer: each layer's sources form a chapter with the
group title in that layer's view. Projects keep each group within one layer so no split leaves a one-source chapter.
Boards carry no authored prose: the viewer adds only titles, source paths, modification times, counts, frame names,
notes and proposal markers, so a board uses the source language. Matrices and other views of undeclared prop
combinations are not shown.

Surfaces are boards like every other layer. Specimen previews are the previews the viewer renders today, at their
declared sizes; board view changes their placement and the chrome around them, not their pixels.

### Frame filters

**Filter frames** opens All frames, Playable or Recently updated within the current design scope. Playable and Recently updated are computed boards with shareable `?view=playable` and `?view=recent` URLs. **All frames** or Escape restores the canvas at its previous camera. Every derived frame has **Show in board** to select and focus its canonical specimen. Derived cards reuse measured frame geometry and the preview cache, mounting previews as they approach the viewport. A direct link measures only the sources needed for those previews and prepares the full canvas on return.

### Playable

The prototype map groups frames by connected transition edges and places them in columns from each flow's start. Each directed frame pair shares one arrow with its distinct action names. Use the authored edge label when present and the trigger text otherwise. Different source frames keep separate return lanes and entry points. **Play flow** starts at the marked frame. The project's motion graph supplies the start and any available flow label and ID. If the current scope excludes the start, the visible edges determine the entry frame.

Hover or select a playable specimen to reveal Play at the top-right of its card, outside the frame content. When the padding is too small, Play looks for space just beyond that corner. It stays inside the viewport and clear of floating toolbars. If no space outside the content is visible, it uses the visible top-right of the content. The icon scales from 20 to 32 screen pixels and disappears at thumbnail sizes. Press **P** to play the selected frame. Exiting playback restores focus to the invoking control. Project discovery caches compact edge summaries per sidecar, and the watcher updates changed owners. Static browsing and the map reuse this index. Opening the player loads a scene.

### Recently updated

**Latest** shows 20 distinct directly changed frames, newest first. Each entry shows its committer time and subject, or the working-tree edit time and **Uncommitted changes**. **Load more** adds 20. Added and changed frames show **New** or **Edited**. Moved frames show their former path and use the current specimen. Removed frames appear as a text list.

The feed scans first-parent Git history for changed design sources and compares frames in those sources at each commit and its parent. It also compares staged, unstaged and untracked sources with HEAD. It stops when it has a page and enough evidence to offer another. Previews stream separately as cards come into view. **This week** and **Since my last visit** filter the same feed. Weeks start Monday at midnight in the viewer's local time zone. Both ranges include working-tree edits.

**Show impact** runs the structural comparison on demand. From **Latest** it covers this week. Shared components, fixtures, tokens and CSS appear as collapsed groups with counts. Expanding a group shows **Affected by shared input** cards. Period headers summarize global changes with a file count and up to two named causes. Expand the summary to see all files grouped by directory. Global inputs do not populate the direct feed.

**Visual changes** runs the two-endpoint, two-theme comparison for the selected impact period on request. The board shows progress and a cancel control. Leaving the board or changing ranges cancels pending work. The hub caches complete structural and visual results independently by endpoint SHAs, working-tree generation and comparison environment. The direct feed caches pages for the current history and working-tree snapshot.

The browser stores the previous viewed HEAD per project and branch and freezes it for the current visit. **Since my last visit** becomes available once there is a baseline. A rewritten history falls back to **This week** with a notice. Outside Git the board explains why history is unavailable.

The derived board frames in `surfaces/canvas.tsx` and the history fixture share example changes from `design/fixtures/recent-updates.json`.

## Board presentation

The visual reference is the trial board set at commit `1e2b897` (`tooling/boards/arc/`, with its kit
`tooling/boards/arc/kit/board.tsx`) and the chapter-board renderer of the retired `adg publish` command at commit
`00a1ddb` (`src/publish/board.mjs` and `src/publish/token-board.mjs`). Boards match that presentation, without the
trial's prose, Chinese copy and matrices. Boards style themselves from the project's tokens in the viewer's current
theme, with neutral fallbacks for any token a project does not define.

- **Board**: 1680 pixels wide, with 80px side padding, 64px top and 80px bottom padding on the surface colour. A board
  widens when a specimen needs more room: its specimen area grows to the widest specimen plus well padding, and the
  12-column grid widens with it. Nothing is clipped. A tall board widens too: while it is more than twice as tall as it
  is wide, its specimen area grows by another 12 columns (1184px plus one 24px gap), up to four times the base area,
  and its specimens reflow in declaration order. The rule is deterministic per board, so saving a source changes only
  that board's width.
- **Header**: a chapter number in a filled pill, an uppercase eyebrow `<project> · <layer>`, the chapter title at
  48/56 semibold, and on the right a meta line with the chapter's source and frame counts. A rule separates it from the
  sections.
- **Section**: a row with a top rule and 48px vertical padding, laid out as a 280px label column and a specimen area
  with a 56px gap. The label column holds the source title (its file name) at 22/28 semibold, the project-relative
  source path in the monospace caption style with a file icon, and the source's last modification time in the
  tertiary caption style.
- **Specimen area**: a 12-column grid with 24px column and 32px row gaps. Each specimen spans the columns its rendered
  width needs, well padding included, and takes the full row when wider than one row of columns allows. Declaration
  order is kept.
- **Specimen**: the frame at its rendered size, centred on a well (canvas colour, card radius, 24px horizontal and
  32px vertical padding, 96px minimum height), with a caption below it: the frame name in the monospace meta style,
  then the note and proposal marker in the tertiary meta style.
- **One backdrop**: the well is a specimen's only backdrop. It uses the canvas colour that frame documents already
  paint, and the frame is drawn without its own fill, border or corner radius, so the frame's empty area merges into
  the well. Paint that overflows the frame, such as a dialog's shadow or a focus ring, continues into the well padding
  instead of ending at the frame bounds; a specimen never shows part of a neighbouring frame. Hover and selection
  outlines still mark the frame bounds. A surface frame is a screen, so a 1px line in the project border colour marks
  its edge.

Board chrome and text belong to the drawing. They scale with the camera like the specimens, at the sizes above in
board pixels; they are not constant-screen-size labels. Board text stays crisp at every zoom level.

## Tokens board

The Tokens board leads the Tokens scope and the bands of scopes that include it. Within every section, tokens group by
the comment headings inside the `:root` block of `tokens.css` (a `/* Heading */` line before a run of tokens). Without
headings, groups follow the first segment of the token name. Sections:

- **Colour**: one group per heading. Each swatch is a 72px tile
  split into the light value on the left and the dark value on the right, with the token name and both values below,
  seven per row.
- **Type**: one row per text size token with a sample line set in that size and its paired line height and weight
  when names match, then family cards with a sample in each family.
- **Shape, elevation, sizing and motion**: radius squares, shadow cards on the canvas colour, size bars, easing
  curves and duration bars. A size bar is a horizontal bar whose length is the token value. When a group's largest
  value exceeds the bar track, the whole group scales to fit and its heading shows the scale.

Samples use neutral English text. Project artwork such as brand marks belongs to components, not to this board. The
existing token table stays available in the Tokens scope as a list view with its search, category filter and copy
behaviour; `?scope=tokens` opens the board.

## Placement

- Boards of one layer flow in chapter order into columns. Each board goes to the currently shortest column, the
  leftmost on a tie. The column count is the one that brings the layer band closest to a 16:10 aspect ratio. A column
  is as wide as its widest board; boards are left-aligned in it. Columns and the boards within a column are 240px
  apart.
- A scope that spans several layers stacks the layer bands top to bottom in layer order, 480px apart.
- A group scope shows that chapter's boards. An asset scope shows one board holding that source's section under its
  chapter header.
- Saving a source re-lays out its board. Boards below it in the same column move by its height change; other columns
  keep their positions, and the camera stays. **Arrange** recomputes the column assignment.

## Interaction

Existing viewer behaviour keeps working on boards: selection, the inspector, element hover and selection, Uses and
Used by, comments, Back, Fit, the minimap, search, keyboard shortcuts, accessible asset buttons and fixture states.
Clicking a section's source title selects the source and copies its name. Clicking a specimen selects that frame.
[Comments](comments.md) stay anchored to their targets. Architecture diagrams keep their own scope and Git overlays.

## Performance

Board placement is deterministic and replaces the skyline packing and its width search. A large library has many
more specimens than sources (the frozen workload in [Performance](performance.md) has 2,722 frames in 143 sources),
so board view adds no preview decoding beyond today's: a component set's specimens draw from its set preview, and
surface frames keep their own crops. Board view meets
the milestone 3 measurement method: on the frozen workload, module-layer and full-scope cold and warm visible-ready
medians stay within the maximum samples of the `00a1ddb` baseline.
