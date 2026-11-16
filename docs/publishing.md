# Doop publishing

[Roadmap](roadmap.md) · [Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md)

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
page and frame ids in its state directory. ADG talks to Doop through its MCP endpoint, using gzip request bodies for large documents.

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

Set `publish: { viewport: '1440x900' }` in `adg.config.mjs` to override the sheet presentation viewport.
Sheet width is 1680 CSS pixels, with 48px padding and 32px gaps. Sheets form a vertical column with 120px gaps;
surface sources form rows with 80px frame gaps and 120px row gaps. Drafts stack layer sections with 160px gaps.
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
HTML replacement retains the Doop frame ID and matches anchors by specimen and relative nth-of-type path.
Structural moves inside a specimen can orphan an anchor; the result lists its ID, source, frame ID and matching
comments. Deleted-document results include the comments removed with the frame. Orphans are warnings on a completed
publish, with `PUBLISH_ORPHANED_ANCHORS` and a review/retry action; publishing does not resolve comments.

Generated categories, token names/values, source captions and the theme button are derived UI. No authored board
prose, architecture diagrams, studies or feature-internal helper sheets are published.

## Verification

Contract tests use an in-process fake Doop MCP server and local Chromium; `npm test` needs no external network.
A maintainer smoke test uses a separate state directory, publishes ADG's own library, inspects every page with Doop
screenshots, checks a fully skipped re-publish, retains a comment anchor through a source edit, and publishes one
branch draft. Keep the scratch canvas link so the maintainer can delete it. Consumer pilots run separately.
