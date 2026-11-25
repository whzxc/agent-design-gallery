---
name: adg-design
description: Design targeted UI changes in Agent Design Gallery (ADG), iterate through boards/reviews/comments, apply approved ADG designs to real application code, and keep design sources and `implementation.json` synchronized during everyday UI edits. Use when asked to design a specific component, dialog, or page state in ADG, propose visual options, address ADG board comments, implement an approved ADG design in code, or sync UI code edits back to `design/` (针对某个点做设计 / 画设计稿 / 处理画板评论 / 设计应用到真实代码 / 同步设计源).
---

# ADG design and implementation workflow

Use this skill whenever a repository has an ADG `design/` library (if not, run `adg-setup` first).

## Core mental model

- `design/*.tsx` files are **build-time static design specifications**, never runtime components. Application code must never import `design/` or depend on `@whzxc/agent-design-gallery`.
- Design and real code stay aligned through four explicit links:
  1. Shared visual tokens (`design/tokens.css` ↔ runtime CSS / Tailwind theme; `adg motion --css` / `--json` for motion tokens).
  2. Exact counterpart bindings in `design/implementation.json`.
  3. Machine queries: `adg owner`, `adg inspect`, `adg impact`, `adg check`, `adg review`, `adg comments`, and optional `adg compare`.
  4. Lifecycle graduation: every `proposed` frame or transition loses its `proposed` marker and gains its binding in the same change that implements it.

Reference contracts (read specific sections on demand rather than guessing schemas):
- Asset rules: `https://github.com/whzxc/agent-design-gallery/blob/main/docs/asset-rules.md`
- Toolkit contract: `https://github.com/whzxc/agent-design-gallery/blob/main/docs/design-toolkit.md`
- Agent CLI contract: `https://github.com/whzxc/agent-design-gallery/blob/main/docs/agent-interface.md`
- Comments contract: `https://github.com/whzxc/agent-design-gallery/blob/main/docs/comments.md`

## Choose the route

Pick the route matching the user's request:

1. **Route 1 — Targeted design / redesign (Design-first):** the user asks to design a specific feature, component, dialog, or state, compare visual options, or change visual direction before touching app code.
2. **Route 2 — Apply approved design to real code (Design → Code):** the user approved proposed frames or a direction study and wants the real UI implemented.
3. **Route 3 — Everyday UI change (Code-first):** a routine layout, copy, or behavior edit that preserves the current visual direction and shared patterns.
4. **Route 4 — Board comments:** the user left comments in the ADG viewer and wants them addressed.

Record the starting Git revision before editing so scoped checks and reviews stay exact:

```sh
base=$(git rev-parse HEAD)
```

## Route 1: Design a specific point (Design-first)

Do not redraw unrelated screens. Scope the change to the target feature or component.

1. **Locate existing design owners first:**

   ```sh
   adg owner --file=<impl-path> --json
   adg owner --text="<visible label>" --contains --json
   adg owner --token=--<token-name> --json
   ```

   If the change touches a shared component or token, preview downstream impact with:

   ```sh
   adg impact --source=design/components/<name>.tsx --part=<Export> --json
   ```

2. **Author the proposal in the right place:**
   - **Comparing 2–3 visual directions:** write temporary explorations in `design/studies/<topic>.tsx` (exempt from production layer rules; delete or convert once a direction is chosen).
   - **Proposing a concrete component/module/surface change:** edit or add the owning file under `design/components/`, `design/modules/`, or `design/surfaces/` following `docs/asset-rules.md#layers-and-placement`, and mark every new or redesigned frame with `proposed="<scope>"` (a short kebab-case review scope name).
   - Extend existing parts through props with unchanged defaults instead of duplicating markup or inventing surface-local controls.
   - If proposing an interaction transition, add a `*.motion.json` edge with the same `proposed` scope (`docs/design-toolkit.md#frame-transitions`).
   - Apply `docs/design-toolkit.md#layout-review`: group by meaning, keep one dismissal per overlay, paint via tokens only (never literal colors outside `data-brand`), and add frames only for visually distinct states (never duplicate frames for dark theme, locale, or width-only reflow).

3. **Check impacted sources:**

   ```sh
   adg check --impacted --base="$base" --read-only --json
   ```

   Resolve every error finding before showing the design.

4. **Generate and deliver the review artifact:**

   ```sh
   # Default standalone offline HTML (full multi-frame review):
   adg review --base="$base" --json
   # Compact inline embed (for Codex or Antigravity chat hosts):
   adg review --base="$base" --format=embed --target=codex --json
   adg review --base="$base" --format=embed --target=antigravity --json
   # Static 2x summary PNG (only when requested or HTML cannot render):
   adg review --base="$base" --format=png --json
   ```

   Share the artifact path returned in `data.path`. When interactive board review, Playable transitions, or pinned comments are helpful, also offer `adg open` or a `adg link` URL.

5. **Hard stop:** do **not** implement a new visual direction or redesign in application code until the user approves the proposed frames.

## Route 2: Apply approved design to real code (Design → Code)

1. **Read exact design facts — do not eyeball:**
   - Read the approved TSX source(s) and any updated tokens in `design/tokens.css`.
   - Query computed layout, typography, colors, and token bindings when exact measurements matter:

     ```sh
     adg inspect design/modules/<feature>.tsx --frame=<name> --json
     ```

   - For every composed ADG component/module used in the frame, look up its existing runtime counterpart so you reuse it instead of rebuilding it:

     ```sh
     adg owner --part=design/components/<name>.tsx#<Export> --json
     ```

   - If motion edges or patterns changed, inspect them with `adg inspect --transition=<id> --explain --json` and export tokens/springs via `adg motion --css` or `adg motion --json`.

2. **Sync runtime tokens first:**
   - Propagate any new or changed declarations from `design/tokens.css` into the application's runtime stylesheet or Tailwind theme so both sides resolve identical semantic roles.
   - Keep feature styles free of literal paint values outside explicitly documented artwork exceptions.

3. **Implement in the real codebase:**
   - Build the UI using the project's framework, state/data layer, accessibility semantics, shared runtime components, and runtime tokens.
   - Keep layer ownership aligned on both sides: a control reused by ≥2 features belongs in the project's shared component layer; a single-feature visual stays inside its feature directory.
   - If implementation exposes a real gap (a required state or element missing from the design), extend the owning design source rather than silently inventing a mismatched control.

4. **Graduate the design assets in the same change:**
   - Remove `proposed="..."` from the implemented `<Frame>` elements (and any graduated `*.motion.json` edges).
   - Delete rejected proposal frames and completed `design/studies/*` files immediately.
   - Update `design/implementation.json` (`docs/design-toolkit.md#implementation-mappings`) with exact bindings for new or moved files/symbols/styles (whole-source bindings without `part` for surfaces; version 2 transition bindings for motion edges).
   - For current surface frames under `check.lifecycle: true`, declare `fixture` and `capture` when the project uses `compare`, or add a reasoned `captureExemptions` entry in `design/implementation.json` when faithful capture is unavailable.

5. **Verify end to end (two-tier loop):**
   - **Fast iteration tier (while refining layout/styles):** use selective checks and targeted visual QA first:
     ```sh
     adg check --impacted --base="$base" --read-only --json
     adg compare --impacted --base="$base" --json   # when compare is configured
     ```
   - **Final closeout tier (once visual QA passes):** run full `adg check --read-only --json`, full `adg compare --all --json` (when configured), and generate any `adg review` handoff ONCE. Omit `adg review` HTML during direct live-preview micro-iterations when no approval handoff is requested.
   - Run the repository's own typecheck, unit/integration tests, and any implementation style/consumer/token checks.
   - Treat `adg compare` findings as a review list (fix missing/extra text, wrong order, or systematic offsets; isolated 2–3 px differences do not require pixel-chasing). Without `compare`, verify the running app directly (browser / accessibility tree / visual check) in the affected themes.

## Route 3: Everyday UI change (Code-first)

For routine changes that do not alter the visual direction:

1. Implement the change in real code using existing shared components and runtime tokens.
2. Locate affected design sources:

   ```sh
   adg owner --file=<changed-impl-file> --json
   ```

3. Update the owning `design/*.tsx` sources and `design/implementation.json` in the same task. Delete retired counterparts and unreferenced assets immediately; never leave stale `OWNER_IMPLEMENTATION_MISSING` bindings.
4. Follow the two-tier verification loop: during edits run `adg check --impacted --base="$base" --read-only --json` and targeted `adg compare --impacted --base="$base" --json` (if configured) plus repository checks/tests. Once visual QA is clean, run full `adg check --read-only --json` / `adg compare --all --json` and generate `adg review --base="$base" --json` once (omitting `adg review` during direct live-preview micro-iterations when no approval handoff is requested). Keep shared `kit` views split by section (`< ~300` lines per file).

## Route 4: Iterate on ADG board comments

1. Read open threads:

   ```sh
   adg comments list --json
   adg comments read <n> --json
   ```

2. Apply the requested design edits (and code edits if already approved/in-scope), then verify with `adg check --impacted --base="$base" --read-only --json` and `adg review --base="$base" --json`.
3. Reply or resolve each addressed thread once verified:

   ```sh
   adg comments reply <n> --author=<agent-name> --message="<summary>" --json
   adg comments resolve <n> --author=<agent-name> --message="<summary>" --json
   ```

## Guardrails

- Always pass `--json` when reading CLI output programmatically and check `ok`, `error.code`, and `error.next`.
- Never treat a `proposed` frame as implemented or leave an implemented frame marked `proposed`.
- Keep each change cohesive: do not mix speculative redesigns into structural refactors or unrelated bug fixes.
- Report verified commands, review artifact paths, bindings updated, and any unverified scope.
