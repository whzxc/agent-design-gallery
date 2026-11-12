# Roadmap

[Architecture](architecture.md) · [Design toolkit](design-toolkit.md) · [Asset rules](asset-rules.md)

ADG, agent-design-gallery, is a sibling of ARC: one place where people and Agents see, check and discuss a
project's UI design sources and architecture diagrams. Milestones run in order. Each starts from a controller-reviewed
specification and ends with tests, checks, the benchmark and the global installation update. New viewer chrome starts in
the design sources and needs user gallery approval before implementation.

## 1. Architecture sources (done)

- Segment A (done): discover Mermaid `.mmd` sources under `arch/`, build them with Pele, paint both themes from project tokens,
  apply semantic phases and marks with an in-artboard legend, show sidecar notes and owners, and support `check` and
  `render`.
- Segment B (done): proposal overlays against a Git base revision (`--base`) for render, open, link and the viewer. Added,
  changed and removed nodes and edges are marked; removed elements stay visible as ghosts.
- ARC adoption (done): semantic classes and sidecars for ARC's diagrams, then ARC's rule that architecture changes update their
  diagrams before implementation.

## 2. Rename to ADG (done, 0.6.0)

- Package `@whzxc/agent-design-gallery`, CLI `adg`, repository `whzxc/agent-design-gallery`.
- Scope: CLI, config file names, the TSX runtime specifier, the generated `.adg/` directory, the hub service label and
  state directory, the `X-ADG-Key` header, `window.__adg`, documentation and links.
- A one-time migration command moves consumer projects. No aliases or compatibility shims remain afterwards.
- Consumers move in the same milestone, including ARC's AGENTS.md and design configuration.
- Runs after milestone 1 and before milestone 3, so new commands and JSON contracts start under the new name.

## 3. Performance (tool phase done)

Symptom: an uncached client project with many modules took about 10 seconds to load. An earlier fix attempt was
reverted because it optimized first content while visible readiness was the real cost.

- Measure first (done): a frozen asset snapshot of that project, cold and warm phases (build, measurement, preview,
  arrangement, drawing) and four milestones (first layout, first content, visible-ready, complete). See
  [Performance](performance.md).
- Budgets (agreed): module layer cold visible-ready 5.0 s and warm 1.0 s; full workload cold 9.0 s and warm 2.5 s;
  first content 350 ms cold and 250 ms warm.
- Fix the tool (done for now): the width search runs once in a Web Worker, streaming uses provisional placement and
  final geometry stays byte-identical. Module layer cold visible-ready dropped from about 8.8 to 5.0 s. The remaining
  warm cost is per-preview SVG decoding and drawing in the browser; raising decode concurrency missed the gate and
  changed pixels, so warm budgets stay open.
- Govern consumer assets and modules afterwards, so governance does not hide tool regressions. This runs with regular
  consumer design work.

## 4. Agent experience

Agents are first-class users. In priority order:

1. Stable `--json` envelopes and error codes with next actions for every command (done, 0.7.0). See the
   [agent CLI interface](agent-interface.md).
2. `diff --base`: per-frame before/after renders with a structural classification (imperceptible, antialiasing,
   boundary bleed, bitmap resampling), consumer-configured thresholds and a verdict (done, 0.8.0). See the
   [diff contract](agent-interface.md#diff).
3. Ownership lookup: `adg owner` resolves implementation files/regions/symbols, rendered text, colors and token names
   to design sources, parts and frames with scoped evidence (done, 0.9.0). See the
   [owner contract](agent-interface.md#owner) and [machine-readable mappings](design-toolkit.md#implementation-mappings).
4. Impact: frames affected directly and transitively by a component or token change, and rendering only those frames
   (in progress).
5. Frames as data: element tree, text, boxes and tokens, for Agents that need structure rather than pixels.

## 5. Annotation collaboration

- Annotation mode on a selected node: the user marks points and writes notes. Notes render as callouts in the margin
  outside the node, with leader lines ordered top to bottom so they do not cross.
- Anchors use frame coordinates and, where possible, element identity, so annotations survive zoom and re-rendering.
- Export produces an annotated image with a visible caption (asset path, frame, revision) and a structured payload
  (asset, frame, revision hash, anchors, text). Image metadata alone is not relied on.
- Sending uses ARC's public interface as an optional integration; ADG stays usable without ARC. The default recipient
  is the project's control source session, which decides whether a design source changes first and dispatches the
  implementation.
- A node context menu offers related actions.
- Annotation inbox: Agents list, read and resolve annotations through the CLI under the same JSON contracts.

Afterwards, expose the stable commands, including the annotation inbox, as an MCP server through ARC's MCP hub.

## 6. Review and architecture

UI-side capabilities come first; these items follow milestone 5.

- Review sheets: one composite image per change (frames, both themes, before and after), so a remote reviewer reads
  one image instead of many.
- Architecture owners: from a code path to the diagrams whose sidecar owners match it, so a review can tell whether a
  change needs a diagram update.
