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

**Filter frames** lives beside the scope tabs. Choose All frames, Playable or Recently updated. One filter is active at a time and applies inside the current board scope. All frames or Clear filter restores normal emphasis. Each filter supplies matches and their context to the same sidebar and board highlight. A future filter adds a predicate. A list row locates and selects the existing specimen and brings it into view. Selection, comment pins and Back keep their usual frame identity. Switching filters never repacks wells, changes zoom, or moves the camera. A selection ring and the foreground of matching previews remain distinct from the dimmed wells. A separate Recent board would duplicate specimens and introduce a second navigation path for the same comment target.

The caption Play button uses a fixed screen-space target so zooming out keeps the entry point usable. The board retains atlas previews. Outgoing names are cached per sidecar owner. Project discovery indexes new sidecars once. A reopened project reuses the stored outgoing frame names for unchanged files, and the watcher refreshes only changed owners. The ordinary manifest carries the compact frame names. Board navigation, zoom, filtering and selection do not open sidecars or fetch scenes.

### Recently updated

**Recently updated** lists frames whose sources or inputs changed. Opening the filter starts a background Git impact query. A normal board visit reads only its revision checkpoint. The default **This week** starts Monday at midnight in the viewer's local time zone. Show Uncommitted (HEAD to the working tree, including untracked inputs), Today, then Earlier this week. Group first-parent history by committer time. Commit subjects give context for each period's net change. Older commits in a last-visit window form one Earlier period.

Compare the source inventories at both endpoints. A direct row identifies a changed Frame declaration, an edit to a part used by the frame in its owning source or feature, or a change to its locally generated frame content. Siblings keep their own identities. Additions and removals follow the inventory. Match relocations by a Git source rename and a stable frame name, or by a frame name unique in both inventories. Ambiguous identities retain separate Added and Removed rows. Moved rows show their former path and locate the current specimen. Removed rows have no board target.

Show direct edits first. Group shared component, fixture, token and CSS inputs by their sorted cause paths. Omit a frame from a shared group when the Git impact proofs establish unchanged materialized inputs in both themes. Config and dependency environment changes, including lockfiles, share one global group per period, labelled “all frames”. Direct rows alone set the initial board highlight. Expanding a shared group lists its frames and highlights only its live specimens. Selecting a global group highlights its period's live specimens without expanding a list. Activating the same group again restores the direct highlight. Changing emphasis preserves the camera and selection.

**Visual changes** runs the two-endpoint, two-theme review comparison for the selected period on request. The sidebar shows progress and a cancel control. Completed verdicts annotate the source rows, including visually unchanged results. An incomplete comparison leaves missing verdicts unknown. Clearing the filter, changing ranges or leaving the board cancels pending work. The worker materializes Git objects in private hub cache directories and cleans up after completion or cancellation.

Cache complete structural results by project, HEAD, endpoint SHAs, classification and comparison environment, and local period boundaries. Visual results cache independently by project, endpoint pair and comparison environment. Both caches validate working-tree generations for dirty endpoints and recheck live dependencies. Revalidate on reopen, on saves and on HEAD changes. Keep unclassified frames at normal emphasis during loading or incomplete coverage. Outside Git the filter explains its unavailable state and Playable remains available.

**Since my last visit** freezes the previous visit's revision for the entire current visit. Store the last viewed HEAD in the viewer's directory preferences, independently of scope, with a browser-profile and checked-out branch key so another reviewer or branch does not advance it. Capture the baseline before recording this visit; ordinary saves, filter opens, reloads within the visit and stale tabs must preserve it. Advance the checkpoint only after a successful board visit. Recording it needs only the project HEAD. A revision checkpoint cannot distinguish dirty edits already seen at that HEAD; current working changes always have their own group. Compare that baseline with current HEAD and include current uncommitted work. A first visit offers This week and explains that the next visit will have a baseline. When a saved revision is missing or is no longer an ancestor after a branch switch or rebase, offer This week with an explicit history-change notice.

The board and sidebar examples in `surfaces/canvas.tsx` use illustrative Git subjects and a motion-independent token change. The sidebar's three playable rows address the actual switcher frames.

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
