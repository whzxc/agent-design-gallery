# Doop publishing

[Roadmap](roadmap.md) · [Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md)

[Doop](https://github.com/kgoedecke/doop) is a self-hosted multiplayer canvas. Its frames render complete HTML
documents, and its comments anchor to elements. ADG publishes a project's design library to one Doop canvas. People
browse and comment there. TSX sources remain the only source of truth. ADG keeps sources, checks, `diff`, `owner`,
`impact`, `inspect` and `compare`. ADG's own canvas viewer is frozen: it receives fixes only, and its removal is decided
after the first consumer pilot. The `?base=<rev>` review page stays.

## Model

Tokens, components, modules and surfaces are assembly layers: they decide who owns a visual. A board is a view: it
owns no visual, has no implementation binding and has no source file. Publishing derives every board from the source
tree and the project's optional `gallery.json`. Nobody authors boards or writes board prose.

| Doop | Derived from |
| --- | --- |
| Canvas | One project |
| Page | One layer, in layer order: Tokens, Components, Modules, Surfaces |
| Board (one Doop frame) | One chapter. A `gallery.json` group is a chapter; its title is the board title and its sources are its sections, in file order. Component and module sources in no group form one chapter per directory group. A chapter taller than the height budget continues on a second board, split at a section boundary |
| Section | One component or module source (a module folder publishes its `index.tsx`) |
| Specimen | One declared frame, in declaration order, captioned with its frame name, source note and proposal marker |
| Tokens board | `tokens.css`, presented as the [Tokens board](#tokens-board) describes |
| Surface frame | One surface frame as its own Doop frame at its declared size. Surface sources form rows in declaration order; a `gallery.json` group gathers its surface sources into consecutive rows under its title |

Pages stay layer-pure. A group that mixes layers splits by layer: each layer's sources form a chapter with the
group title on that layer's page, and surface sources become surface rows. Projects keep each group within one layer
so no split leaves a one-source chapter. Boards carry no authored prose: ADG adds only titles, source
paths, counts, frame names, source notes and proposal markers, so a board uses the source language. Matrices and other
views of undeclared prop combinations are not published.

Surfaces are separate frames for two reasons. A surface is a screen, which is the unit a Doop frame represents. A
surface also needs its own viewport so its responsive layout renders at its real size.

## Board presentation

The visual reference is the trial board set from the prototype: `tooling/boards/arc/` and its kit
`tooling/boards/arc/kit/board.tsx` at commit `1e2b897`. Published boards match its presentation, without its prose,
its Chinese copy and its matrices. Boards style themselves from the project's tokens, with neutral fallbacks for any
token a project does not define.

- **Board**: 1680 CSS pixels wide, with 80px side padding, 64px top and 80px bottom padding on the surface colour.
- **Header**: a chapter number in a filled pill, an uppercase eyebrow `<project> · <layer>`, the chapter title at
  48/56 semibold, and on the right a meta line with source and frame counts. A rule separates it from the sections.
- **Section**: a row with a top rule and 48px vertical padding, laid out as a 280px label column and a specimen area
  with a 56px gap. The label column holds the source title (its file name) at 22/28 semibold and the
  project-relative source path in the monospace caption style with a file icon.
- **Specimen area**: a 12-column grid with 24px column and 32px row gaps. Each specimen spans the columns its rendered
  width needs, well padding included, and takes the full row when wider than the area. Declaration order is kept.
- **Specimen**: the frame centred on a well (canvas colour, card radius, 24px horizontal and 32px vertical padding,
  96px minimum height, clipped), with a caption below it: the frame name in the monospace meta style, then the source
  note and proposal marker in the tertiary meta style.

## Tokens board

The Tokens board follows the trial Foundations board. Sections:

- **Colour**: one group per comment heading inside the `:root` block of `tokens.css` (a `/* Heading */` line before a
  run of tokens). Without headings, groups follow the first segment of the token name. Each swatch is a 72px tile
  split into the light value on the left and the dark value on the right, with the token name and both values below,
  seven per row.
- **Type**: one row per text size token with a sample line set in that size and its paired line height and weight
  when names match, then family cards with a sample in each family.
- **Shape, elevation, sizing and motion**: radius squares, shadow cards on the canvas colour, size bars at their
  height, easing curves and duration bars.

Samples use neutral English text. Project artwork such as brand marks belongs to components, not to this board.

## Rendering

- Every published document is standalone HTML: the source's compiled CSS and frame markup, with no other scripts than
  the theme switch below.
- A board is a tall document, so viewport media queries would answer for the board rather than its frames. Publishing
  resolves `width`, `height` and `orientation` media queries in board CSS against the presentation viewport, 1440 × 900
  by default and configurable per project. It keeps preference queries such as reduced motion. Surface frames keep
  their CSS unchanged because each renders in its own viewport.
- A frame with a declared width renders at that width. A frame without one renders at `max-content`.
- Each document carries a light/dark switch that sets `data-theme` on its root. Light is the published state.

## Identity, provenance and comments

- Each specimen carries `data-specimen="<source>#<frame>"`, and each surface document carries it on its frame root.
  A comment maps to its owning source and frame through it.
- Each document carries a provenance meta with the generator, project-relative source paths and the Git revision.
  Publishing also writes a canvas style guide (Doop guidelines) stating that ADG generates the canvas, that frames are
  not edited in Doop and that changes go to the sources.
- Publishing is one-way. A re-publish replaces retained board and surface HTML in place, preserving their Doop frame
  IDs and versions. Unchanged documents are skipped by content hash.
- Doop stamps `data-doop-id` on an element only when someone comments on or links to it. A re-publish carries every
  existing id into the new HTML by stable landmarks: the section or specimen identity, then the `nth-of-type` path
  inside it. Ids without a match are reported as orphaned. Removing a source updates its chapter, and removing the
  last source removes the board. Deleted-board results name the comments removed with the frame.
- The comment loop: an agent reads comments, maps `data-specimen` to the source and frame, changes the source,
  re-publishes and replies. People resolve comments.

## Branch drafts

Layer pages track the project's default branch. On another branch, `adg publish` writes only the boards and surface
frames that the branch changes, compared with its merge base, to a page named `Draft: <branch>`. A draft page is
deleted when its branch merges. Proposals are reviewed and commented on in their draft page.

## Configuration

The publish target is personal environment data. Project repositories keep no Doop endpoint, canvas id or key. The
endpoint and agent key come from the environment (`DOOP_URL`, `DOOP_AGENT_KEY`). ADG records each project's canvas,
page and frame ids in its state directory. ADG talks to Doop through its MCP endpoint, using gzip request bodies for large documents.

## Not used

- Doop components and variants: a second component model stored in Doop, which would duplicate the TSX components.
  A source section already groups its declared variants.
- Doop tokens: `tokens.css` stays the only token source, and the Tokens board presents it.
- Doop approval status: every re-publish clears it, and proposed frames already carry their review scope.
- Prototype wiring: deferred until a concrete flow needs it. Wiring must not add Doop attributes to design sources.
- Editing generated frames in Doop, by people or by Doop agents.

## Source rules

Publishing relies on the frame order, host width and narrow-form rules in
[States, frame names and fidelity](asset-rules.md#states-frame-names-and-fidelity).

## Commands and state

```sh
export DOOP_URL=https://doop.example
export DOOP_AGENT_KEY=your-agent-key
adg publish [project] --json
adg publish [project] --state-dir=/path/to/private-state --json
```

`DOOP_URL` accepts the origin or its `/mcp` endpoint. No target configuration is written to the project.
IDs and document hashes live in `<state-dir>/publish/<project-and-origin-hash>.json`; the default state directory
is `~/.agent-design-gallery`. Use a separate state directory for a scratch canvas. Retain its state if you intend
to re-publish to that same canvas. The endpoint, key and canvas IDs never enter design sources.

The board height budget is 4800 CSS pixels. Chapters and Tokens split at section boundaries; an individual
section taller than the budget remains intact. Gallery group titles must be distinct within each layer.

Set `publish: { viewport: '1440x900' }` in `adg.config.mjs` to override the board presentation viewport.
Boards on a page sit side by side in one row in chapter order with 240px gaps, tops aligned. Surface sources form
rows with 80px frame gaps and 120px row gaps. Drafts place each layer's changed boards and surface rows in the same
way, one band per layer.
Chromium measures content-sized documents before upload. It closes before the command completes.
Width/height media features support pixel and em/rem lengths (16px media-query em), ranges, lists and nested
conditions. Remaining preference queries stay live. Surfaces retain the original compiled CSS.

The default branch comes from `origin/HEAD`, falling back to a local `main` or `master`; detached HEAD is rejected.
Draft selection compares generated content with the merge base, including imported changes and current working
files. Deleted documents are reported and removed from an existing draft; a source deleted only on the branch
has no current document to publish. On a default-branch publish, draft pages whose last published commit is an
ancestor of that branch are removed. Squash/rebase merges need the draft branch merged or its page retired manually.

Hash comparison excludes revision-only provenance changes: skipped documents retain their last published revision.
A changed document carries the current HEAD revision, even when its current source includes uncommitted edits.
HTML replacement retains the Doop frame ID and matches anchors by section or specimen and relative nth-of-type path.
Structural moves inside a specimen can orphan an anchor; the result lists its ID, source, frame ID and matching
comments. Deleted-document results include the comments removed with the frame. Orphans are warnings on a completed
publish, with `PUBLISH_ORPHANED_ANCHORS` and a review/retry action; publishing does not resolve comments.

Generated categories, token names/values, source captions and the theme button are derived UI. No authored board
prose, architecture diagrams, studies or feature-internal helper sources are published.

## Migration from per-source sheets

The first publish with chapter boards replaces per-source sheet frames on the existing canvas. The layer pages and
surface frames remain on that canvas. The publish result lists each removed frame and its comments under
`data.removed`; inspect those comments when following up on the migration. Later publishes reconcile chapter boards
and surface frames in place.

## Verification

Contract tests use an in-process fake Doop MCP server and local Chromium; `npm test` needs no external network.
A maintainer smoke test uses a separate state directory, publishes ADG's own library, inspects every page with Doop
screenshots, checks a fully skipped re-publish, retains a comment anchor through a source edit, and publishes one
branch draft. Keep the scratch canvas link so the maintainer can delete it. Consumer pilots run separately.
