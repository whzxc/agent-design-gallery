# Experimental design boards

Boards are chapter pages that present a design library the way a design-system document does: a title and intro, then sections with prose on the left and specimens on the right. They reference declared frames instead of redrawing them. `framesOf(source)` indexes a source's default export by frame name, so a specimen is the frame itself, and matrices call the same exported components with each variant.

`arc/` holds the first trial against ARC (`whzxc/agent-remote-control`): Foundations, Controls, Containers and display, and the Task timeline module. They are ARC studies: copy `arc/*.tsx` and `arc/kit/` into ARC's `design/studies/`, then generate `design/studies/kit/tokens.ts`:

```sh
node tooling/boards/gen-tokens.mjs <arc>/design/tokens.css <arc>/design/studies/kit/tokens.ts
```

Build and review with a running `adg open <arc> --no-open --port=4517`:

```sh
node tooling/boards/render.mjs http://127.0.0.1:4517 <out-dir> light studies/board-01-foundations.tsx
```

`render.mjs` writes compact standalone HTML (one document per board) and a PNG. `doop.mjs` is a minimal Doop MCP client (agent key from `DOOP_AGENT_KEY`). `publish.mjs` creates one canvas and one frame per board, replacing HTML in place on re-runs; `shots.mjs` saves Doop server renders for review.

Findings that need toolkit support before boards become an ADG feature:

- Sources cannot read `tokens.css`, so token tables are generated into `kit/tokens.ts`; a runtime `tokens` export would remove that step.
- Dark tokens are scoped to the document root, so one board cannot show a dark specimen next to a light one.
- Studies are the only discovered directory that exempts boards from production asset rules; a dedicated `boards` layer with a coverage check (every production frame appears on a board) is the intended shape.
