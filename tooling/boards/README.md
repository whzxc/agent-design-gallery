# Experimental design boards

Boards are chapter pages that present a design library the way a design-system document does: a title and intro, then sections with prose on the left and specimens on the right. They reference declared frames instead of redrawing them. `framesOf(source, path)` indexes a source's default export by frame name and tags each frame with its source path, so a specimen is the frame itself, and matrices call the same exported components with each variant.

`arc/` holds the first trial against ARC (`whzxc/agent-remote-control`): Foundations, Controls, Containers and display, and the Task timeline module. They are ARC studies: copy `arc/*.tsx` and `arc/kit/` into ARC's `design/studies/`, then generate `design/studies/kit/tokens.ts`:

```sh
node tooling/boards/gen-tokens.mjs <arc>/design/tokens.css <arc>/design/studies/kit/tokens.ts
```

Build and review with a running `adg open <arc> --no-open --port=4517`:

```sh
node tooling/boards/render.mjs http://127.0.0.1:4517 <out-dir> light studies/board-01-foundations.tsx
```

`render.mjs` writes compact standalone HTML (one document per board), its measured size and a PNG. A board is a tall document, so viewport media queries (`orientation`, `width`) would answer for the board instead of the frames on it; `render.mjs` resolves them against a 1440×900 desktop presentation viewport and keeps preference queries such as reduced motion. Containers that live in a viewport-wide layer use `Specimen stage="desktop"` so they get the full well.

`doop.mjs` is a minimal Doop MCP client (agent key from `DOOP_AGENT_KEY`). `publish.mjs` creates one canvas and one frame per board, replacing HTML in place on re-runs; `shots.mjs` saves Doop server renders for review. Doop stamps `data-doop-id` on an element only when someone comments on it, so a full replace would orphan the comment: `anchors.mjs` carries every stamped id into the new render by board landmarks (outermost section order, specimen caption, then the nth-of-type path below it). Text edits keep anchors; structural moves inside a specimen or section do not, and `publish.mjs` reports those as orphaned.

Board prose (titles, descriptions, notes written on the board) is for the reviewer and defaults to Chinese. Frame names and frame notes belong to their sources and keep the source language. Specimens carry `data-specimen="<source>#<frame>"` and matrices carry `data-derived="matrix"`, so a comment maps back to a declared frame or is known to sit on a derived view.

Findings that need toolkit support before boards become an ADG feature:

- Sources cannot read `tokens.css`, so token tables are generated into `kit/tokens.ts`; a runtime `tokens` export would remove that step.
- Dark tokens are scoped to the document root, so one board cannot show a dark specimen next to a light one.
- The runtime serializes `undefined` style values (`height:undefined`); they are dropped by the browser but leak into snippets and diffs.
- Studies are the only discovered directory that exempts boards from production asset rules; a dedicated `boards` layer with a coverage check (every production frame appears on a board) is the intended shape.
