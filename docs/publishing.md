# Doop publishing

[Roadmap](roadmap.md) · [Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md)

Status: planned, [roadmap milestone 6](roadmap.md#6-doop-canvas-next). This document is the implementation contract
for `adg publish`. When it lands, it describes current behavior.

[Doop](https://github.com/kgoedecke/doop) is a self-hosted multiplayer canvas. Its frames render complete HTML
documents, and its comments anchor to elements. ADG publishes a project's design library to one Doop canvas. People
browse and comment there. TSX sources remain the only source of truth. ADG keeps sources, checks, `diff`, `owner`,
`impact`, `inspect` and `compare`. ADG's own canvas viewer is frozen: it receives fixes only, and its removal is decided
after the first consumer pilot. The `?base=<rev>` review page stays.

## Model

Tokens, components, modules and surfaces are assembly layers: they decide who owns a visual. A published sheet is a
view: it owns no visual, has no implementation binding and has no source file. Publishing derives every sheet from the
source tree. Nobody authors, classifies or maintains boards.

| Doop | Derived from |
| --- | --- |
| Canvas | One project |
| Page | One layer, in layer order: Tokens, Components, Modules, Surfaces |
| Tokens sheet | `tokens.css`: colour roles with light and dark values, type scale, families, radii, shadows, sizes and motion |
| Component or module sheet | One source file (a module folder publishes its `index.tsx`): every declared frame in declaration order, captioned with its frame name and source note; proposed frames are marked |
| Surface frame | One surface frame as its own Doop frame at its declared size; the frames of one source form one row in declaration order |

Sheets carry no authored prose. ADG adds only the source path, frame names, source notes and proposal markers, so a
sheet uses the source language. Sheets lay frames out in document flow at a fixed reading width: frames keep their
natural size, and a frame wider than half the sheet takes a full row. Sheets and surface rows sit on their page in
source order on a fixed grid; ADG computes no packing.

Surfaces are separate frames for two reasons. A surface is a screen, which is the unit a Doop frame represents. A
surface also needs its own viewport so its responsive layout renders at its real size.

## Rendering

- Every published document is standalone HTML: the source's compiled CSS and frame markup, with no other scripts than
  the theme switch below.
- A sheet is a tall document, so viewport media queries would answer for the sheet rather than its frames. Publishing
  resolves `width`, `height` and `orientation` media queries in sheet CSS against the presentation viewport, 1440 × 900
  by default and configurable per project. It keeps preference queries such as reduced motion. Surface frames keep
  their CSS unchanged because each renders in its own viewport.
- A frame with a declared width renders at that width. A frame without one renders at `max-content`.
- Each document carries a light/dark switch that sets `data-theme` on its root. Light is the published state.

## Identity, provenance and comments

- Each specimen carries `data-specimen="<source>#<frame>"`, and each surface document carries it on its frame root.
  A comment maps to its owning source and frame through it.
- Each document carries a provenance meta with the generator, the project-relative source path and the Git revision.
  Publishing also writes a canvas style guide (Doop guidelines) stating that ADG generates the canvas, that frames are
  not edited in Doop and that changes go to the sources.
- Publishing is one-way. A re-publish replaces HTML in place, and Doop keeps the previous version. It never recreates
  a frame, which would lose comments and versions. Unchanged documents are skipped by content hash.
- Doop stamps `data-doop-id` on an element only when someone comments on or links to it. A re-publish carries every
  existing id into the new HTML by stable landmarks: the specimen identity, then the `nth-of-type` path inside the
  frame. Ids without a match are reported as orphaned. A removed source deletes its sheet, and the report names the
  comments removed with it.
- The comment loop: an agent reads comments, maps `data-specimen` to the source and frame, changes the source,
  re-publishes and replies. People resolve comments.

## Branch drafts

Layer pages track the project's default branch. On another branch, `adg publish` writes only the sheets and surface
frames that the branch changes, compared with its merge base, to a page named `Draft: <branch>`. A draft page is
deleted when its branch merges. Proposals are reviewed and commented on in their draft page.

## Configuration

The publish target is personal environment data. Project repositories keep no Doop endpoint, canvas id or key. The
endpoint and agent key come from the environment (`DOOP_URL`, `DOOP_AGENT_KEY`). ADG records each project's canvas,
page and frame ids in its state directory. ADG talks to Doop through its MCP endpoint.

## Not used

- Doop components and variants: a second component model stored in Doop, which would duplicate the TSX components.
  A sheet already groups a source's variants.
- Doop tokens: `tokens.css` stays the only token source, and the Tokens sheet presents it.
- Doop approval status: every re-publish clears it, and proposed frames already carry their review scope.
- Prototype wiring: deferred until a concrete flow needs it. Wiring must not add Doop attributes to design sources.
- Editing generated frames in Doop, by people or by Doop agents.

## Source rules

Publishing relies on the frame order, host width and narrow-form rules in
[States, frame names and fidelity](asset-rules.md#states-frame-names-and-fidelity).

## Prototype

`tooling/boards/` holds the hand-authored prototype behind this contract: a renderer with media query resolution,
anchor carry-over and a minimal Doop MCP client. It is superseded and is removed when `adg publish` lands.
