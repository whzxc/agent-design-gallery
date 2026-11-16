# Board prototype (superseded)

This directory holds the hand-authored prototype behind [Doop publishing](../../docs/publishing.md). It is kept as
implementation reference and is removed when `adg publish` lands. Do not extend it.

Its hand-written boards, role-based grouping and board prose are superseded: published sheets are generated from the
source tree and carry no authored prose.

Reusable parts:

- `render.mjs` builds a study through a running `adg open`, writes compact standalone HTML with its measured size,
  and resolves viewport media queries against a 1440 × 900 presentation viewport.
- `anchors.mjs` carries Doop `data-doop-id` anchors into a re-render by landmarks and reports orphaned ids.
- `doop.mjs` is a minimal Doop MCP client. It reads the agent key from `DOOP_AGENT_KEY`.
- `publish.mjs` and `shots.mjs` publish one frame per board and save Doop server renders.
- `gen-tokens.mjs` turns `tokens.css` into a light/dark token table for a study.
- `arc/` holds the four trial boards against ARC and the board kit, including the `data-specimen` identity and the
  desktop stage for layer-hosted containers.

Findings that the contract absorbs:

- A tall board triggers the `orientation: portrait` and narrow-width variants of the frames on it.
- Doop stamps `data-doop-id` lazily, so a full HTML replace orphans comments unless ids are carried over.
- The runtime serializes `undefined` style values as `height:undefined`.
