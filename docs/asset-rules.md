# Design asset rules

These rules define a reusable design library for any SDG consumer. The [toolkit contract](design-toolkit.md) defines TSX syntax, rendering and checks. A consumer owns its visual direction, implementation mappings, review process and adoption status in its own documentation. Its application does not need to import the design sources or depend on SDG.

## Layers and placement

| Location | Owns |
| --- | --- |
| `design/tokens.css` | Values: colors, typography, dimensions, radii, shadows and motion timing. |
| `design/components/` | Domain-agnostic controls and compositions usable across features. |
| `design/modules/<feature>.tsx` | One feature block per file. Split by feature, not by page: a page can use several modules, and a module can serve several pages. |
| `design/surfaces/<name>.tsx` | A small set of full-page or full-region compositions. Assemble existing assets and lay them out; introduce no new controls or visual patterns here. |
| `design/fixtures/` | Representative content, names, times and state data, separate from visual markup. |
| `design/art/` | Brand artwork and content images. Declare their display dimensions and a file-size budget in the consumer's asset notes; downscale images before importing them. |

Place a new asset in this order:

1. Put a value change in tokens.
2. Put a domain-agnostic control or composition in components.
3. Put a feature-specific part in its owning module.
4. Create a new module for a new feature block; keep unrelated features in separate files.
5. Assemble modules and components into a surface only when the full layout needs a frame.

Fixtures and artwork support these layers; they are not additional UI layers or gallery sources.

## Ownership and imports

- Components may reuse components; they never import modules or surfaces.
- Modules import components and may reuse another module's exported parts; they never import surfaces.
- Surfaces may import any production layer.
- The defining module owns a feature part. Reuse by several modules does not remove its domain meaning or transfer ownership.
- Promote a part to components only when it remains generic without domain meaning. Reuse count alone is not a reason to promote it.
- Import the defining source instead of copying its markup or creating another owner for the same part.

By default, `sources` is `['components', 'modules', 'surfaces']`. Its order is from lower to higher layers. Custom source directory names follow the same order. For example, with `sources: ['primitives', 'features', 'surfaces']`, primitives cannot import features or surfaces, and features cannot import surfaces. Same-layer imports are allowed.

`sdg check` checks resolved direct source imports against this order. It reports the importing file, the imported source and the offending layer direction. It uses the same resolved edges as the viewer's relationship graph. Imports into fixtures, artwork, tokens and other helper files are outside that graph; type-only imports removed by the build are also outside it. Review helper indirection and type-only ownership during the audit below.

A consumer with an intentional alternative dependency policy can disable only this lint:

```js
export default {
  sources: ['components', 'modules', 'surfaces'],
  check: { importDirection: false },
};
```

Record the reason and the replacement policy in the consumer's governance documentation. Frame, token, layout and source-format checks still run.

## States, frame names and fidelity

- Frame names are scoped to their source file. A single-part file names its states or variants without repeating the file or part name: `components/button.tsx` uses `primary`, `disabled` and `pending`.
- A multi-part file prefixes each frame with the part: `<part>` or `<part>-<state>`. Name parts after real usage. Give each part one named function and keep source lines under 140 characters.
- Generic component variants stay in the component source. Feature states and variants stay in their owning module. Crop part frames to their content.
- Add a surface frame only when the full-page or full-region layout changes, such as a platform layout, a minimum viewport or a banner that changes page geometry. Use full window or region dimensions. Local control states belong to their component or module.
- Both themes render automatically. Do not add separate dark frames or an undeclared matrix of theme, locale, size and state combinations.
- A surface preserves the intended production structure, content, order, states and layout. Use the consumer's implementation mapping and the library's visuals; reconcile detailed differences through the consumer's visual acceptance process.
- Flex, grid, gaps, padding and placement are surface layout glue. Controls and other visuals come from components or modules; fixture data stays separate.

A gap is an element without an asset, or an asset unable to express a required function or state. Extend the owning asset's props with unchanged defaults. If a new asset is required, stop implementation of that element, add and review the library asset, then continue. Report any remaining omission with its source evidence. Do not silently substitute another pattern or invent a surface-local control.

## Review and lifecycle

Assets progress from proposed to reviewed to having at least one page or surface consumer. A real consumer may be a composed design surface or a mapped implementation usage, including a transitive use through modules. A specimen frame or gallery entry alone does not establish adoption.

Keep proposals only while their review is active. When a batch closes, delete assets without a consumer; remove abandoned alternatives and stale imports as well. Map every adopted asset or part to its implementation location in a consumer-owned mapping document. Starter examples demonstrate authoring: replace or remove them when introducing real assets and record the real consumers.

Tokens, components, modules and surfaces share the review rule: run `sdg check`, render the changed frames in both themes and obtain reviewer approval. Later target changes land in the library first. The consumer's governance document defines who proposes, approves and implements each batch, how visual acceptance runs, and how status is recorded. Work on one surface or one cohesive library family at a time.

SDG checks source structure, rendered frames and import direction. Reviewers assess ownership quality, complete state coverage, fidelity, implementation mappings and image budgets, and identify assets without consumers for deletion.

## Studies

Temporary direction explorations live in `design/studies/` and are exempt from the production asset rules in this document. The toolkit's TSX/build and frame checks still apply; studies are excluded from the import-direction lint.

With default discovery, SDG adds `studies` only when a direct `design/studies/*.tsx` file exists. An empty directory, a README or nested helpers do not enable it. Explicit `sources` lists are preserved exactly: add `studies` to such a list when the first study exists, and remove it after the last study is deleted or converted. `sdg init` does not create a study or an empty studies directory.

Once a direction is chosen, delete the study or turn it into real assets under the production rules. Studies do not become a permanent alternative library.

## Adopting an existing project

### 1. Inventory before editing

Identify the actual design root, SDG configuration, declared source directories and entry surfaces. Follow imports to inventory the parts that those surfaces use. Include unlisted sources, fixture data, artwork, studies and implementation locations recorded by the consumer.

For each source, record its parts, frames, current layer and owner, direct and transitive consumers, and known implementation mapping. Note missing mappings as unknown. Inventory image dimensions and budgets, declared states, reviewed renders and known implementation gaps. The viewer's Uses / Used by lists and `GET /relationships` can help trace the graph.

Version 0.5.0 adds modules to default discovery. Projects with an explicit `sources` list retain that list. Inspect an existing `modules/` directory before adopting the default: top-level TSX files there become frame sources and need a default frame renderer. Move data-only helpers to their supporting directories in a later review batch.

### 2. Run a read-only audit

Use the project's installed or chosen toolkit version from inside the consumer:

```sh
sdg check --read-only
# Narrow the same checks to one source when reviewing a finding:
sdg check modules/example --read-only
```

`--read-only` skips generated type declarations and build files. It keeps import, frame and theme checks. During this audit, do not edit configuration, move sources, rename frames, change implementation code or delete assets. Review existing renders; if new captures are needed, render a disposable copy outside the consumer checkout and state which copy was inspected.

Audit checklist:

- Placement: values in tokens, generic controls in components, feature parts in their own modules, and only layout glue in surfaces. Look for page-named modules that combine unrelated features.
- Dependencies: upward source imports, copied markup, helper files that hide an upward dependency, and type-only imports that cross ownership boundaries. Confirm that reuse preserves the defining owner.
- Frames: duplicate state coverage across layers, module states represented only by surface frames, missing required variants, needless full-page permutations, incorrect crop sizes and separate dark frames.
- Names: repeated file/part prefixes in a single-part source, missing part prefixes in a multi-part source, unclear part ownership, unnamed reusable parts and lines over 140 characters.
- Fidelity and gaps: altered content or order, surface-local visuals, assets with insufficient props, missing elements and stale implementation mappings. Distinguish source evidence from an unobserved implementation.
- Lifecycle: orphaned or abandoned parts, alternatives with no consumer, proposals without an active review, and studies left after a direction was selected. Trace transitive use before declaring an asset unused.
- Supporting data: fixture content embedded in markup, duplicate fixture records, oversized artwork, missing display dimensions and unspecified image budgets.
- Local process: an identifiable reviewer, approval state, mapping location and acceptance procedure. Missing evidence stays an explicit finding.

Report findings with these columns. Include the relevant frame, export, import target or source line in the problem; suggest a specific next edit without doing it during the audit.

| File | Problem | Suggested fix |
| --- | --- | --- |
| `design/components/toolbar.tsx` | Imports `modules/search.tsx`, an upward source dependency. | Move feature composition into the search module and keep the generic toolbar in components. |
| `design/modules/profile.tsx` | Single-part frames repeat the `profile-` prefix. | Rename frames to their states and update the consumer's references in the same batch. |
| `design/surfaces/settings.tsx` | An inline control has no mapped library asset. | Add or extend its owning component/module, review it, then compose it here. |
| `design/modules/unused.tsx` | No consumer found in the import graph; implementation mapping is missing. | Verify the implementation mapping before deciding whether to delete the source. |

Include the audited scope and the commands actually run, with their results. Report confirmed violations separately from missing evidence when the consumer's review protocol requires that distinction. Record ownership, fidelity and lifecycle findings from the manual audit alongside automated results.

### 3. Split changes into review batches

1. Agree on ownership boundaries, naming and local mapping/governance locations from the inventory. Record the dependency findings that each batch will resolve.
2. Review tokens and one cohesive component family. Keep the batch small enough to inspect every changed frame in both themes.
3. Take one feature module at a time: establish its owner, move its states and update its importers together. Preserve part defaults while adding missing capabilities.
4. Take one composed surface at a time after its dependencies are reviewed. Preserve structure and fixture content; reconcile it with the mapped implementation through local acceptance.
5. Close the batch by updating mappings and status, removing assets without consumers, and deleting or converting completed studies.

A move, frame rename or extraction includes all affected imports, captures and mapping references in the same batch. Keep new visual proposals in their own review scope rather than mixing them into a structural migration.

### 4. Document locally

The consumer keeps:

- Its selected visual direction, tokens, declared forms and supported platforms/viewports/locales.
- Its source directories in lower-to-higher order, feature owners, and any deliberate policy exception or import-lint opt-out.
- Asset/part-to-implementation mappings, reachable fixtures/captures, review and adoption status, and concrete remaining gaps.
- Image display dimensions and file-size budgets.
- Review batch scope, proposer/reviewer responsibilities, approval and visual acceptance procedures, and the minimum SDG version.

Choose local filenames and status conventions that fit the project. Link this toolkit standard instead of copying its generic rules into every consumer's governance documents.
