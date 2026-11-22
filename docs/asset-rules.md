# Design asset rules

These rules define a reusable design library for any ADG consumer. The [toolkit contract](design-toolkit.md) defines TSX syntax, rendering and checks. A consumer owns its visual direction, implementation mappings, review process and adoption status in its own documentation. Its application does not need to import the design sources or depend on ADG.

## Layers and placement

Layers follow assembly level. Components are building blocks, modules assemble them into feature blocks, and surfaces lay feature blocks out. Each layer adds only its own layout, its own presentation and its own states.

| Location | Owns |
| --- | --- |
| `design/tokens.css` | Values: colors, typography, dimensions, radii, shadows and motion timing. |
| `design/components/` | Building blocks: controls and single-purpose visual units that more than one feature block embeds, with or without domain meaning, such as a button, a status chip or an entity mark. |
| `design/modules/<feature>.tsx` or `design/modules/<feature>/` | One feature block per file or folder. A folder's `index.tsx` is its public entry and only frame source; sibling files are internal feature parts and may import each other. Split by feature, not by page: a page can use several features, and a feature can serve several pages. |
| `design/surfaces/<name>.tsx` | A small set of full-page or full-region layouts. Place modules and components and lay them out; introduce no new controls or visual patterns here. |
| `design/fixtures/` | Representative content, names, times and state data, separate from visual markup. |
| `design/art/` | Brand artwork and content images. Declare their display dimensions and a file-size budget in the consumer's asset notes; downscale images before importing them. |

Place a new asset by the first test that applies:

1. A value change goes in tokens.
2. A visual unit that another feature block embeds goes in components. Domain meaning does not keep it out of components.
3. A feature block with its own states goes in its owning module. Create a new module for a new feature; keep unrelated features in separate files.
4. A layout that places several blocks side by side goes in a surface, and only when the full layout needs a frame.

A visual unit used inside one module only stays in that module until a second feature block embeds it. Components mirror the application's shared component layer: a part implemented once and reused across features belongs in components on both sides. The consumer documents its shared implementation location.

Fixtures and artwork support these layers; they are not additional UI layers or gallery sources.

### Chapters

`design/gallery.json` groups the sources into chapters, and each chapter is one [board](boards.md). Every component and
module source belongs to a chapter; surfaces join chapters once there are more than a few. A chapter is one feature
area or one family of building blocks within one layer, usually 3 to 12 sources, with an English title that names the
area, such as `Controls` or `Timeline`. Order chapters from general to specific, and sources within a chapter in
reading order. Split a chapter along feature lines when it grows past about 12 sources. `adg check` warns about
sources in no chapter and about chapters with more than 12 sources.

## Tokens

Token names state a role, such as `--radius-control` or `--line-reading`, never their value, such as `--radius-6` or `--gray-200`. A numbered series of ordinal steps, such as chart channels, is allowed.

Paint in design sources and in the implementation references tokens. Literal paint is allowed only for named artwork: illustrations, sprites, canvas geometry and brand marks. Record each literal as an exact exception (file, selector and property) with a reason that names the artwork. Interaction states such as hover, focus and selection are not artwork.

Normalize each literal or new value against the nearest existing token of the same kind:

- A large difference gets its own role-named token.
- A small difference gets its own token only when three or more declarations use the value. Otherwise the value takes the nearest token, and the visual change is accepted.

A difference is large when:

- lengths differ by more than 2px and by more than 20%;
- colors differ by more than CIEDE2000 5 in either theme;
- font weights differ by more than 100;
- shadows differ in structure, or in any length beyond the length threshold.

Compare radius, font size, line height, stroke and tracking as separate kinds, and compare unitless line heights at the body font size. Font families are discrete roles. Count declarations across the implementation's styles, shared styles included. `adg check` does not read implementation styles, so the consumer enforces these rules there with its own style check.

## Ownership and imports

- Imports go strictly downward. Modules import components. Surfaces import module feature indexes and components.
- Components may import other components. They never import modules or surfaces.
- Files inside one module feature folder may import each other and components. A module file never imports another feature, and a surface never imports another surface or a feature-internal file.
- When a module needs another feature's part, move the part to components if the module embeds it inside its own structure. Compose the two blocks in a surface if they only sit side by side.
- The defining source owns a part. Import it instead of copying its markup or creating another owner for the same part.

By default, `sources` is `['components', 'modules', 'surfaces']`. Its order is from lower to higher layers. Custom source directory names follow the same order. For example, with `sources: ['primitives', 'features', 'surfaces']`, primitives cannot import features or surfaces, and features cannot import surfaces or other features. Only the lowest layer imports within itself.

`adg check` checks resolved direct source imports against this order. It reports the importing file, the imported source and the offending layer direction. It uses the same resolved edges as the viewer's relationship graph. Imports into fixtures, artwork, tokens and other helper files are outside that graph; type-only imports removed by the build are also outside it. With `check.strictLayers` enabled, same-layer imports above the lowest layer fail the check; when it is disabled, reviewers must still resolve those dependencies during the audit below.

A consumer with an intentional alternative dependency policy can disable only this lint:

```js
export default {
  sources: ['components', 'modules', 'surfaces'],
  check: { importDirection: false },
};
```

Record the reason and the replacement policy in the consumer's governance documentation. Frame, token, layout and source-format checks still run.

Existing consumers keep `check.strictLayers` and `check.lifecycle` disabled unless they opt in. `check.singleConsumer` defaults on and can be disabled for a deliberate exception. `adg init` enables strict layers and lifecycle checks for a new project.

## Implementation counterparts

A library with an implementation keeps every counterpart in `design/implementation.json` (or
under the configured design root), version 1 or 2. The map is the only counterpart record:
human documentation links to it and keeps no counterpart rows. Every production part
has a binding unless it is proposed. A surface binds as a whole source without `part`.
The [mapping authoring contract](design-toolkit.md#implementation-mappings)
defines its strict schema, exact file/directory/glob selectors, defining-source parts
and optional frame subsets. File symbols in JS/TS auto-resolve only when one exported
declaration line matches the documented lexical rule. Use a unique literal anchor for
non-exported or other-language symbols. No absolute line ranges are authored; line
lookup uses export/anchor regions, including unmapped export boundaries.

Update bindings with file/export/frame moves in the same change. A stale selector, locator, source, part,
frame or part/frame mismatch is an `OWNER_*` check finding; duplicate bindings are also
findings. Full `check --read-only --json` audits the map, exiting 1 for completed
findings and 2 for invalid schema or incomplete execution. A library without an implementation may omit the map.
Lookup excludes stale bindings and exposes their findings; it does not silently repair
or pick a replacement identity.

Migrate human-readable tables in small checked slices: split `file#Export` into `file`
and `symbol`, map styles explicitly, omit `part` for inline compositions, and keep
multi-target/frame bindings intact. Delete each migrated counterpart row from the human
document in the same slice. Follow the [migration steps](design-toolkit.md#migrate-a-mapping-table).

Feature implementation composes the counterparts of components and adds the feature's
own layout and presentation. Its paint uses tokens only. It does not restyle a counterpart
or redraw a visual that a component already defines. A part enters the shared component
layer when a second feature embeds it; a shared part with a single consumer moves back to
its feature, on both the implementation and the library side.
An implementation visual without a library asset is a gap; see below.

Declare Frame `locale` when a language-specific specimen should be discoverable with
`owner --locale`, for example `<Frame name="ready" locale="en">`. It is an authored
language annotation, canonicalized as BCP 47, with exact filtering and no translation
or rendering effects. It does not justify a second frame for another language.

## States, frame names and fidelity

- Frame names are scoped to their source file. A single-part file names its states or variants without repeating the file or part name: `components/button.tsx` uses `primary`, `disabled` and `pending`.
- A multi-part file prefixes each frame with the part: `<part>` or `<part>-<state>`. Name parts after real usage. Give each part one named function and keep source lines under 140 characters.
- Generic component variants stay in the component source. Feature states and variants stay in their owning module. Crop part frames to their content.
- Add a surface frame only when the full-page or full-region layout changes, such as a platform layout, a minimum viewport or a banner that changes page geometry. Use full window or region dimensions. Local control states belong to their component or module.
- A surface preserves the intended production structure, content, order, states and layout. Use the consumer's implementation mapping and the library's visuals; reconcile detailed differences through the consumer's visual acceptance process.
- Flex, grid, gaps, padding and placement are surface layout glue. Controls and other visuals come from components or modules; fixture data stays separate.
- Declare frames in reading order: the default state first, then variants, states and edge cases. Declaration order is presentation order on the viewer's [boards](boards.md).
- A part that sizes itself against its host (the viewport or a layer slot), such as a panel or dialog, declares a frame width at which it reaches its desktop size. Presentation never infers a host.
- In components and modules, a narrow-viewport form is its own frame driven by props, such as a viewport width. A viewport media query alone does not produce a frame form; boards present each frame at one viewport.

Frames show what the implementation renders. Explanatory diagrams, annotated specimens,
hand-placed illustrations and flow pictures are not production frames. Put mechanism
diagrams in `arch/` and direction explorations in `studies/`.

Each frame shows one distinct appearance:

- An element appears or disappears, the arrangement changes, or semantic paint changes.
- Width-only reflow, truncation, wrapping, longer content and translated copy are not distinct appearances. The consumer's layout acceptance covers them, not frames.
- A viewport frame exists only when the layout changes structure at that viewport, such as a different arrangement or solver.
- Each source shows one representative language. Do not duplicate frames per locale.
- Draw one frame per declared state. Draw a combination only when it shows an appearance that neither state shows alone.
- Both themes render automatically. Do not add separate dark frames.

A gap is an element without an asset, or an asset unable to express a required function or state. Extend the owning asset's props with unchanged defaults. If a new asset is required, stop implementation of that element, add and review the library asset, then continue. Report any remaining omission with its source evidence. Do not silently substitute another pattern or invent a surface-local control.

## Status and lifecycle

A production asset is either current or proposed. There are no other states.

- **Current**: the part has an implementation binding, and each of its frames shows a state the implementation reaches. A surface frame also declares the `fixture` and `capture` that reach it.
- **Proposed**: a new frame or part under active review, marked with the Frame `proposed` property that names its review scope. It has no binding yet.

Approval of a proposal starts its implementation. When it is implemented, remove the
marker and add the binding in the same change. When its review closes without
implementation, delete it.

A frame that no longer matches its implementation is drift, not a status. Fix the
source or the implementation in the task that found it. After the user accepts an
implementation change that alters a mapped part's appearance, update the owning source
in the same task.

Only an implementation binding keeps a part alive. A design surface, a gallery entry or
a specimen frame does not. When a task removes or replaces an implementation, it deletes
or rebinds the design counterpart in the same change; a stale `OWNER_IMPLEMENTATION_MISSING`
binding is that signal. Delete unbound, unproposed assets, abandoned alternatives and
stale imports as soon as they appear. Do not defer retirement to cleanup rounds.

Starter examples demonstrate authoring: replace or remove them when introducing real assets.

Changes to tokens, components, modules and surfaces follow the [design workflow](design-toolkit.md#workflow).
The consumer's governance document records owners and project-specific acceptance. Work on one surface or one cohesive library family at a time.

ADG checks source structure, rendered frames, import direction and implementation bindings. Reviewers assess placement, frame admission, fidelity and image budgets, and delete assets without a binding.

## Transition ownership and lifecycle

Milestone 7 adds one optional [motion sidecar](design-toolkit.md#frame-transitions) beside the source owning the trigger frame. A link names frame data and introduces no TSX import. All production endpoints must be existing configured TSX frames. Paths use the configured layer order.

| Declaring layer | Admitted edge |
| --- | --- |
| Component | Between two forms in its own source, for a reusable control interaction. |
| Module | Between states of its own feature entry. A sibling internal file cannot declare edges. |
| Surface | Between full layouts in its own source or another surface in the same project. Model cross-feature navigation here only when each layout independently qualifies as a surface frame. |
| Tokens, artwork, fixtures, boards, studies, architecture | No production edge ownership. |

Use motion tokens in both themes for every authored timing value. Add a semantic duration or easing only when the project needs that role. Keep intermediate samples generated. Additional frames still require a distinct reachable appearance.

An edge without `proposed` is current. It connects current frames and names a reachable action. For projects with implementation counterparts, bind that behavior to its implementation handler or motion owner. In **version 2** of `implementation.json`, a mapping's `design` array additionally accepts `{"source":"design/surfaces/layers.tsx","transition":"workspace-show-settings"}`. This is an exact edge target, exclusive of `part` and `frames`. Existing implementation selectors, including symbols and anchors, keep their semantics. Many edges may share a handler. Version 1 remains readable with its strict schema. Upgrade the map version when adding an edge binding and set the project's ADG version requirement to ADG 0.16.0 or newer. Endpoint bindings alone cannot attest that the action exists.

A proposed edge has a nonempty `proposed` review scope and can connect two current frames. Every proposed endpoint must share the edge's scope. A current edge cannot enter or leave a proposal. Approval starts implementation. Once the action exists, bind it and remove its marker in the same change, along with any graduating endpoints. Rejected proposals, removed actions and incident edges of deleted frames retire in that change. On a rename or move, update all references and the binding together and retain the edge ID for the same action. On replacement, retire the old ID. Apply the existing lifecycle opt-in to *missing* bindings. Validate declared bindings whenever a map exists. Libraries without an implementation may omit the map.

**Alternatives considered.** A project-wide flow manifest splits local changes from their source. JSX callbacks and pairing by frame order cannot describe a reusable, reviewable data edge. Peer module imports would weaken feature boundaries. A board-owned graph would give a derived chapter a second authoring role. Inferring current behavior from both endpoint bindings keeps removed actions alive. The sidecar, layer rule and explicit behavior binding address these separately.

## Crop and part frames

Extract a part by reusing its defining component/function in the owning module or
component source. Preserve the full parent composition and add a tightly sized Frame
with a `parent` declaration pointing at the original instance:

```tsx
<Frame name="compact" width={320} height={48} parent={{
  source: 'design/surfaces/home.tsx',
  frame: 'ready',
  selector: '[data-part="toolbar"]',
}}>
  <Toolbar />
</Frame>
```

Mark that instance in the parent with `data-part="toolbar"`. The relation lives on the
part; it is metadata and does not import the surface into a lower layer. `check` validates
only its shape. The selector must resolve to one visible target in both revisions when
an added part activates the declaration.

Run the full both-theme gate from the project:

```sh
adg check --read-only
adg diff --base=HEAD --json
```

Use the commit before extraction as the base. Every existing frame must keep exact
pixels and CSS/device sizes in both themes. A new part additionally needs equal
base/current parent target and standalone-part snapshots: element/text/resource identity,
exact local geometry, paint, clipping/backdrop and the full token map. Its parent must
also remain exactly identical in both themes. Device crops round outward without
resampling. New part roots must fill their Frame and parent targets must fit inside
their full frame.

Classifier version 1 permits only configured imperceptible, stable-anchor antialiasing,
proven edge-band external bleed and tightly budgeted same-image resampling differences.
One isolation capture per parent target/theme attributes outside paint; interior outside
paint stays `other`. Stable-anchor and near-anchor limits, defaults and validation are
in the [toolkit contract](design-toolkit.md#git-frame-diff). Snapshot mismatches always
mean `changed`, including a token edit or hidden/new element that leaves pixels unchanged.
Unmapped additions, removals, rename candidates and size changes also need review.

An unqualified, both-theme run can return `structural` for a crop/part batch. A source,
frame or theme restriction reports partial coverage and cannot release a structural
batch, even if its local rows pass. Read `report.json`, parent support references and
per-theme before/after/difference images; retain them for review. A `changed` verdict
requires the consumer's visual review process. Failed or incomplete evidence never
supplies structural approval. Once a part exists at the chosen base, its retained
parent declaration is inactive and exact ordinary-frame comparison applies.

## Studies

Temporary direction explorations live in `design/studies/` and are exempt from the production asset rules in this document. The toolkit's TSX/build and frame checks still apply; studies are excluded from the import-direction lint.

With default discovery, ADG adds `studies` only when a direct `design/studies/*.tsx` file exists. An empty directory, a README or nested helpers do not enable it. Explicit `sources` lists are preserved exactly: add `studies` to such a list when the first study exists, and remove it after the last study is deleted or converted. `adg init` does not create a study or an empty studies directory.

Once a direction is chosen, delete the study or turn it into real assets under the production rules. Studies do not become a permanent alternative library.

## Adopting an existing project

### 1. Inventory before editing

Identify the actual design root, ADG configuration, declared source directories and entry surfaces. Follow imports to inventory the parts that those surfaces use. Include unlisted sources, fixture data, artwork, studies and implementation locations recorded by the consumer.

For each source, record its parts, frames, current layer and owner, direct and transitive consumers, and known implementation mapping. Note missing mappings as unknown. Inventory image dimensions and budgets, declared states, reviewed renders and known implementation gaps. The viewer's Uses / Used by lists and `GET /relationships` can help trace the graph.

Version 0.5.0 adds modules to default discovery. Projects with an explicit `sources` list retain that list. Inspect an existing `modules/` directory before adopting the default: top-level TSX files there become frame sources and need a default frame renderer. Move data-only helpers to their supporting directories in a later review batch.

### 2. Run a read-only audit

Use the project's installed or chosen toolkit version from inside the consumer:

```sh
adg check --read-only
# Narrow the same checks to one source when reviewing a finding:
adg check modules/example --read-only
```

`--read-only` skips generated type declarations and build files. It keeps import, frame and theme checks. During this audit, do not edit configuration, move sources, rename frames, change implementation code or delete assets. Review existing renders; if new captures are needed, render a disposable copy outside the consumer checkout and state which copy was inspected.

Audit checklist:

- Placement: values in tokens, building blocks embedded by more than one feature block in components, feature blocks in their own modules, and only layout glue in surfaces. Look for page-named modules that combine unrelated features, components that only one module uses, and feature folders that expose internal files.
- Feature folders: keep one feature's files together, expose only `index.tsx` to surfaces, and test a new visual unit against the folder's feature boundary before promoting it to components.
- Dependencies: upward source imports, module-to-module and surface-to-surface imports, copied markup, helper files that hide an upward or same-layer dependency, and type-only imports that cross ownership boundaries. Confirm that reuse preserves the defining owner.
- Shared parts: consumers are counted per source file, so every export in one file shares one verdict. The consumers are the nearest module or surface source files that import the component directly or through other components; a lowest-layer export reached by fewer than two distinct higher-layer sources is a warning. Move it back to its feature unless a second feature consumer is planned.
- Frames: duplicate state coverage across layers, module states represented only by surface frames, missing required variants, width-only or locale-only duplicates, needless full-page permutations, explanatory diagrams, incorrect crop sizes and separate dark frames.
- Names: repeated file/part prefixes in a single-part source, missing part prefixes in a multi-part source, unclear part ownership, unnamed reusable parts and lines over 140 characters.
- Fidelity and gaps: altered content or order, surface-local visuals, assets with insufficient props, missing elements and stale implementation mappings. Distinguish source evidence from an unobserved implementation.
- Lifecycle: parts without an implementation binding, frames the implementation cannot reach, proposals without an active review, abandoned alternatives and studies left after a direction was selected. A design surface does not count as a consumer.
- Tokens: value-named tokens, literal paint outside named artwork, and values a small step from an existing token that fewer than three declarations use.
- Implementation: literal paint in implementation styles, shared exports with one feature consumer, feature styles that restyle shared visuals, and modules over about 400 lines. Report counts.
- Supporting data: fixture content embedded in markup, duplicate fixture records, oversized artwork, missing display dimensions and unspecified image budgets.
- Local process: an identifiable reviewer, approval state, mapping location and acceptance procedure. Missing evidence stays an explicit finding.

Report findings with these columns. Include the relevant frame, export, import target or source line in the problem; suggest a specific next edit without doing it during the audit.

| File | Problem | Suggested fix |
| --- | --- | --- |
| `design/components/toolbar.tsx` | Imports `modules/search.tsx`, an upward source dependency. | Move feature composition into the search module and keep the generic toolbar in components. |
| `design/modules/profile.tsx` | Single-part frames repeat the `profile-` prefix. | Rename frames to their states and update the consumer's references in the same batch. |
| `design/surfaces/settings.tsx` | An inline control has no mapped library asset. | Add or extend its owning component/module, review it, then compose it here. |
| `design/modules/unused.tsx` | No implementation binding; only a design surface imports it. | Bind it to its implementation counterpart, or delete it with its surface usage. |

Include the audited scope and the commands actually run, with their results. Report confirmed violations separately from missing evidence when the consumer's review protocol requires that distinction. Record ownership, fidelity and lifecycle findings from the manual audit alongside automated results.

### 3. Govern in check-decided steps

Audit `MOTION_SOURCE_CSS` warnings before enabling `check.strictMotion: true`. This flag defaults to false and covers active CSS motion and dormant timing declarations in sources. Repair authored sidecar errors independently of the flag.

Enforcement comes first, so that checks decide the remaining work. Each step runs to completion in one agent turn: commit per batch with the cheap checks, run the full validation once at the end, and stop early only for a decision that belongs to the user, such as a visual direction or an appearance change that has not been approved.

1. Enforce. Add the [implementation checks](#4-add-implementation-checks) with exact exception lists and tests, and run them and `adg check` from the project's check script. Current violations form the burn-down list. Enable `check.strictLayers` when Placement clears its findings and `check.lifecycle` when Lifecycle does, so that `adg check` keeps passing.
2. Placement. Agree on feature owners and naming from the inventory. Move single-consumer shared parts back to their features on both the implementation and library sides, promote a part when a second feature embeds it, and split modules over about 400 lines into feature folders. Preserve part defaults while adding missing capabilities.
3. Tokens. Normalize literals under [Tokens](#tokens), with a decision table of value, nearest token, difference, uses and decision. The user approves appearance changes once, up front. The report then lists the changed scenarios and the compare review list instead of screenshots.
4. Lifecycle. Bind every part, remove assets without a binding, and delete or convert completed studies.
5. Close. Run the full tests, each affected acceptance scenario once and `adg compare` on the affected frames as a review list.

A move, frame rename or extraction includes all affected imports, captures and mapping references in the same batch. Keep new visual proposals in their own review scope rather than mixing them into a structural migration. When a step needs a toolkit change, stop and report a reproduction to the ADG maintainers instead of patching or vendoring ADG; resume once a release fixes it and the project raises `requires`.

Pitfalls seen in practice:

- A rule that a check can satisfy by relocation. A layout-only rule for feature styles moved feature visuals into the shared layer; state the rule's purpose and its allowed form.
- Literals wrapped in value-named or single-use tokens to pass a literal check.
- A module and the surface that composes it counted as two consumers of one shared part.
- Hover, focus or selection paint recorded as an artwork exception.
- Cleanup started before the checks exist, or check-decided work split into several review rounds.
- Compare missing or extra counts read as regressions without the same counts at the pre-change commit.

### 4. Add implementation checks

`adg check` covers the design sources. The consumer adds three checks on its implementation, each with exact exceptions and tests:

- Literal paint: paint properties (color, background, border, radius, shadow, font, line height, letter spacing, fill and stroke) reference tokens. An exception records the file, selector and property, with a reason that names the artwork.
- Shared consumers: each export of the shared component location has at least two feature consumers. Count each feature directory once, follow re-exports and shared-to-shared imports, and ignore tests and type-only imports. An export with one consumer moves back to its feature.
- Tokens: names state a role, and small differences follow the [Tokens](#tokens) thresholds and use counts.

[ARC](https://github.com/whzxc/agent-remote-control) implements these checks in `tooling/check-ui-styles.mjs`, `tooling/check-ui-consumers.mjs`, `tooling/check-ui-tokens.mjs` and `tooling/token-distance.mjs`, with tests in `tests/ui-style-policy.test.mjs`. Adapt their paths and feature mapping rather than importing them.

### 5. Document locally

The consumer keeps:

- Its selected visual direction, tokens, declared forms and supported platforms/viewports/locales.
- Its source directories in lower-to-higher order, feature owners, and any deliberate policy exception or import-lint opt-out.
- Every implementation counterpart in implementation.json, plus proposals under review and concrete remaining gaps in human documentation. Human documentation keeps no counterpart rows.
- Image display dimensions and file-size budgets.
- The implementation style checks that enforce token-only paint and shared-part consumers, with their exact exception lists.
- Agent instructions that link these rules and the [toolkit contract](design-toolkit.md), require `adg check` and the implementation checks before a commit, and stay within a size budget.
- Review batch scope, proposer/reviewer responsibilities, approval and visual acceptance procedures, and the minimum ADG version.

Choose local filenames that fit the project. Link this toolkit standard instead of copying its generic rules into every consumer's governance documents.

## Adopting motion

1. **Inventory (design only).** Run `adg motion --coverage` from the consumer root. Map a small shared scale to motion roles. Use durations such as fast, base, slow and loop, easings such as standard, enter, exit and linear, and distance and scale steps where used. Follow the [Tokens rules](#tokens). Put product meaning in pattern names.

   Snap a runtime literal to the nearest existing step in design only if it preserves the effect's character. The literal must lie within the scale's range, the step must change the runtime duration by no more than about 25%, and the easing must stay in the same family. For each snapped value, record the site, runtime value and chosen design value as a round-3 gap. If any condition fails, add a shared step named for its position in the scale and map the site exactly.

   Declare patterns and variants in `design/motion-patterns.json` and use their standard consumer mappings for in-scope sites. Record non-motion sites with an exact locator and a reason in that same file. Document effects outside ADG's scope, such as native Go or AppKit window effects, in the project's design doc. Keep unused built-ins grouped on the Tokens board. This round is done when coverage reports zero unscanned files, zero unmapped implementation sites, and zero ADG defaults for roles the project uses.
2. **One pilot flow.** Pick a frequent, contained interaction with a stable anchor. Compare its frames against the implementation and sync any design-source drift before authoring the flow. Keep the flow within one screen composition. Author the states and edges, name each edge for the action the user takes, and declare the flow's anchor and ends. Give each state a next action, a reset path, or a declared end. Bind the current edges to their implementation owners and enable `check.strictMotion`. This round is done when `adg check` is clean and the flow plays end to end on the Playable board.
3. **Runtime alignment.** List the implementation gaps exposed by the flow and bring them to the project owner. This round is done when the owner has reviewed the gaps and any approved runtime changes have been implemented and verified. Begin runtime changes only after the owner approves them.

See the [motion patterns, transitions and flow syntax](design-toolkit.md#frame-transitions).

## Architecture assets

Keep one Mermaid diagram per `.mmd` file in the configured project-root `arch`
directory. Each has one `default` frame. An optional same-basename `.md` records an
English review note, `owners` mapping to existing project files/globs and a status.
Keep explanation in that note and preserve the diagram as the structural source.

Use the toolkit's phase/mark vocabulary and project tokens. Architecture assets follow
the [design workflow](design-toolkit.md#workflow) and its HTML handoff. Check mapped
diagrams against changes to their owning code paths. ADG checks that owners match files
and leaves semantic freshness to reviewers.

Architecture is a separate `arch` gallery layer with no source imports. Internal
layer conventions such as a consumer's L0 system map, L1 components and L2 mechanisms
belong to that consumer's documentation and directory structure. ADG imposes no such
hierarchy. See [architecture sources](design-toolkit.md#architecture-sources) for the
format, sidecar grammar and commands.
