# Roadmap

[Architecture](architecture.md) · [Design toolkit](design-toolkit.md) · [Asset rules](asset-rules.md)

ADG, agent-design-gallery, is a sibling of ARC: one place where people and Agents see, check and discuss a
project's UI design sources and architecture diagrams. Milestones run in order. Each task is one
end-to-end round that ends with the push gate, the local installation update and a running result for the user.
New visual directions start in the design sources; other UI changes are implemented directly.

## 1. Architecture sources (done)

- Segment A (done): discover Mermaid `.mmd` sources under `arch/`, build them with Pele, paint both themes from project tokens,
  apply semantic phases and marks with an in-artboard legend, show sidecar notes and owners, and support `check` and
  `render`.
- Segment B (done): proposal overlays against a Git base revision (`--base`) for render, open, link and the viewer. Added,
  changed and removed nodes and edges are marked; removed elements stay visible as ghosts.
- ARC adoption (done): semantic classes and sidecars for ARC's diagrams, then ARC's rule that architecture changes update their
  diagrams for round 1.

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
   (done, 0.10.0).
5. Frames as data: element tree, text, boxes and tokens, for Agents that need structure rather than pixels
   (done: `adg inspect`).

## 5. Asset governance (done, 0.11.0)

The [asset rules](asset-rules.md) layer assets by assembly level and keep only current or proposed assets. The toolkit
checks those rules so retirement and layering no longer depend on cleanup rounds:

- Import direction rejects module-to-module and surface-to-surface imports; only the lowest layer imports within
  itself. `check.strictLayers` opts this in for existing projects, and `importDirection: false` still disables the lint.
- Frame `proposed`: a nonempty string naming the review scope. Proposed frames are reported in check output and are
  exempt from binding findings.
- Lifecycle findings when `implementation.json` exists: a production part without a binding, a surface source
  without a whole-source binding, and a surface frame without `fixture` and `capture`, each unless proposed.
- Redundant-frame warnings: two frames of one source whose structure is identical apart from text, locale and
  geometry. Warnings do not fail check.
- Reverse ownership: `adg owner --part=<source>#<Export>` (or `--part=<source>` for whole-source bindings) returns the implementation bindings of a design part, so
  implementers find the counterpart to reuse.

## 6. Board view (done, 0.15.0)

The viewer presents the design library as chapter boards. The [board view](boards.md) contract owns the details.
Doop was trialled as an external browsing and comment canvas and dropped: the board presentation came from ADG's own
generator, comments belong in ADG itself, and publishing added a service, a sync step and per-frame iframes
that loaded slowly.

- Board view (done): chapters from `gallery.json` groups with the trial board presentation, a visual Tokens board,
  column placement and tall-board widening, replacing the skyline packing. ARC and the client accepted it.
- Publishing retirement (done): the CLI, configuration, JSON diagnostics, documentation and obsolete publishing tests are removed.
- Runtime (done): omit `undefined`, `null` and `false` style values instead of serializing them.
- Review handoff (done): a review page that never shows a blank screen and reopens from a cache, one review theme
  following the Mac's appearance, changes grouped by cause, moved and renamed frames recognized, and one minimal
  inline review sheet per change, grouped into Added, Changed and Removed. The
  [review handoff](design-toolkit.md#review-handoff) contract owns the details.
- Comments (done): threads pinned to elements, frames, sources and chapters, a comment tool, one panel, review-page
  comments, public thread links and an agent command line, replacing annotations. The user accepted it. The
  [comments](comments.md) contract owns the details.

## 7. Frame transitions and viewer play (in progress)

See the [transition contract](design-toolkit.md#frame-transitions), [ownership](asset-rules.md#transition-ownership-and-lifecycle) and [agent queries](agent-interface.md#frame-transition-queries) for round 1. ARC's layer slots pilot the motion vocabulary. ADG's project switcher supplies the small, replayable viewer case.

1. **Author and check (done).** Read versioned sidecars, resolve the endpoint graph, identities and motion tokens, bind current edges and diagnose invalid or unsupported declarations. Deliver scoped check, inspect, owner and impact JSON and measure default responses on ARC.
2. **Play on a board (done).** Start at a specimen caption, the Float toolbar or the Playable filter. A flow rail names each action and groups its gestures. A transition inspector provides seekable FLIP and fades, replay, interruption, focus and reduced motion in one sandboxed document. ADG’s switcher edges and playback controls are the first consumer.
3. **Review and adopt.** Play added, changed and removed edges offline, with deterministic seek samples and motion-only Git changes. Exercise current dialog/panel fades and centered replacement, then review proposed two-sided and cross-slot fades; identify implementation gaps separately.

## 8. Review and architecture

- **Implementation motion sampling (later).** Sample real timing via the consumer compare adapter's fixtures. List differences from the declared timeline for review. This adds no acceptance gate.
- Architecture owners: from a code path to the diagrams whose sidecar owners match it, so a review can tell whether a
  change needs a diagram update.
- Expose the stable commands as an MCP server through ARC's MCP hub.
