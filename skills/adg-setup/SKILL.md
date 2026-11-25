---
name: adg-setup
description: Install Agent Design Gallery (ADG), initialize a repository's `design/` library for a greenfield or existing UI codebase, split existing UI code into ADG layers (`tokens.css`, `components/`, `modules/`, `surfaces/`), audit and govern an existing `design/` library, or adopt ADG motion coverage. Use when asked to set up ADG, initialize ADG in an existing project, structure or split components under ADG rules, govern design assets, or adopt ADG motion (初始化 ADG / 现有项目接入 ADG / 按规范拆组件 / 设计资产治理).
---

# ADG setup

Set up [Agent Design Gallery (ADG)](https://github.com/whzxc/agent-design-gallery) for a repository so agents and humans share one checkable TSX design source of truth.

## Sources of truth

Link these public specifications from project documentation; do not copy their generic rules into consumer repos:

- Asset rules (layers, tokens, imports, frames, lifecycle, adoption, motion): `https://github.com/whzxc/agent-design-gallery/blob/main/docs/asset-rules.md`
- Toolkit contract (TSX syntax, Tailwind v4 tokens, `check`, `implementation.json`, `compare`, `review`, `motion`): `https://github.com/whzxc/agent-design-gallery/blob/main/docs/design-toolkit.md`
- Agent CLI contract (`--json` schemas, exit codes, error codes, `next` recovery actions): `https://github.com/whzxc/agent-design-gallery/blob/main/docs/agent-interface.md`

Check exact CLI flags with `adg --help --json` or `adg <command> --help --json`.

## 1. Ensure ADG CLI and skills are installed

1. Check `adg --version`. If missing or older than the project's `requires` range in `adg.config.*`, install globally:

   ```sh
   npm install -g @whzxc/agent-design-gallery
   ```

   Never add `@whzxc/agent-design-gallery` to a project's `package.json` or vendor the toolkit.

2. Install the bundled ADG skills (`adg-setup`, `adg-design`) for the active agent so later sessions have them:

   ```sh
   adg skill install --target=codex --json        # or claude-code, antigravity, cursor, agents
   # Or target a custom / project-local skills directory:
   adg skill install --dir=.agents/skills --json
   ```

3. Browser-backed commands (`check`, `render`, `compare`, `diff`) use Playwright's Chromium. If a command returns `CHROMIUM_UNAVAILABLE`, run the exact `error.next[0].argv` it reports (for example `npx playwright@<version> install chromium`).

## 2. Inspect the repository before editing

Inspect the repository root and detect which track applies:

- Legacy `sdg.config.{mjs,js,ts}` present: run `adg migrate --json` first before other commands.
- **Track A — Greenfield (no UI code, no `design/`):** start from direction studies before tokens and surfaces.
- **Track B — Existing UI codebase without `design/`:** onboard incrementally through one pilot page/feature.
- **Track C — Existing `design/` library:** run a read-only audit and govern in check-decided batches (or adopt motion).

Always identify the frontend stack (React, Vue, plain HTML/CSS, Tailwind, CSS custom properties, design tokens, local dev server, and test/fixture setup) before proposing changes.

## Track A: Greenfield project

1. Run `adg init --json`.
2. Author 2–3 contrasting visual direction specimens in `design/studies/` (varying palette, density, and chrome).
3. Run `adg check --read-only --json` and deliver a review via `adg review --base=<start-commit> --json` (or `adg open`).
4. **Stop and wait for the user to pick a direction** before authoring `design/tokens.css`, `design/components/`, a pilot `design/surfaces/` entry, and removing the starter `example.tsx` files and chosen study.

## Track B: Existing UI codebase without `design/`

Do **not** draw the whole application at once. Onboard one cohesive pilot first.

### Step 1: Propose pilot scope (stop if ambiguous)

Inspect the app's pages, shared components, and stylesheets, then report:
- Detected stack and existing token/style files
- Proposed pilot scope (1 representative screen or feature, plus its shared controls)
- Adoption stage target (Stage 1: boards + review; Stage 2: `implementation.json` + `strictLayers`/`lifecycle`; Stage 3: `compare` adapter + implementation style checks + motion)
- Whether token normalization may adjust minor visual differences up front or must ask per change

Pause for user confirmation if the pilot scope or appearance policy was not already stated.

### Step 2: Bootstrap configuration and tokens

1. Run `adg init --json`.
2. Update `adg.config.mjs`:
   - Set `requires` to `>=<installed-version>`.
   - During initial pilot authoring, keep `check: { strictLayers: true, lifecycle: false }` until `design/implementation.json` covers the pilot, then enable `lifecycle: true`.
3. Extract the app's existing visual tokens into `design/tokens.css`:
   - Exactly two blocks: `:root { ... }` (light) and `:root[data-theme="dark"] { ... }` (only overrides that change in dark).
   - Keep the four required tokens: `--font-ui`, `--font-mono`, `--canvas`, `--text`.
   - Name all tokens by semantic role (`--surface`, `--text-secondary`, `--radius-panel`), never by raw value (`--gray-200`, `--radius-6`). Follow `docs/asset-rules.md#tokens`.
4. Delete starter `example.tsx` / `fixtures/example.ts` files as soon as real pilot sources exist.

### Step 3: Split existing UI into ADG layers

Core mental model: **`design/*.tsx` are build-time static visual specs, never imported by application runtime code.** Two authoring modes exist (`docs/design-toolkit.md#sources`):
- **Default zero-dependency string-JSX** (best for irregular UI, games, or custom chrome): no React state/hooks/effects, no `<style>` tags, no npm package imports, and HTML `class` (not `className`).
- **Optional Component-library `kit` mode (`engine: 'react'`)** (best for regular standard-UI apps): configures `kit` in `adg.config.mjs` so `design/` shares `kit.ui` primitives and stateless presentational views directly with app code instead of duplicating markup, while preserving `design/tokens.css`, `@theme inline` color mappings in `kit.css` (guarded by `KIT_THEME_UNMAPPED`), and `< ~300`-line section-split shared views. Pass variants via plain props (including explicit `timeZone` when formatting clocks), put sample data in `design/fixtures/`, and put brand SVGs/images in `design/art/`.

Map existing UI code to ADG layers using the first rule that applies (`docs/asset-rules.md#layers-and-placement`):

1. **Values** (colors, type sizes, radii, shadows, spacing roles, motion timing) → `design/tokens.css`.
2. **Shared building blocks** embedded by **two or more** feature blocks (buttons, fields, badges, status pills, shared cards, entity marks — domain meaning is allowed) → `design/components/<name>.tsx`.
   - Do **not** mirror a catch-all `src/components/` folder blindly: if a component is used by only one feature, keep it inside that feature's module until a second feature embeds it (`check.singleConsumer` warns otherwise).
3. **Feature blocks** with their own states and composition → `design/modules/<feature>.tsx`.
   - Split by feature, not by page.
   - When a feature module grows large (roughly >400 lines), convert it into a feature folder: `design/modules/<feature>/index.tsx` (the public entry and only frame source) plus sibling internal TSX part files. Surfaces import only `index.tsx`.
4. **Full-page / full-region layouts** placing modules and components side by side → `design/surfaces/<name>.tsx`.
   - Surfaces contain only layout glue (`flex`, `grid`, `gap`, `padding`) and introduce no new controls or inline visual patterns.

Frame authoring rules (`docs/asset-rules.md#states-frame-names-and-fidelity`):
- Declare frames in reading order (default first, then variants, states, edge cases).
- Add a frame only for a visually distinct appearance. Never add separate frames for dark theme (rendered automatically from tokens), width-only reflow, or extra locales.
- Single-part files name frames by state (`primary`, `disabled`); multi-part files prefix with the part (`<part>-<state>`).
- Group component and module sources into `design/gallery.json` chapters (3–12 sources per chapter, within one layer).

### Step 4: Bind implementation counterparts and verify

1. Create `design/implementation.json` (`version: 1`, or `version: 2` when binding motion transitions; schema in `docs/design-toolkit.md#implementation-mappings`):
   - Map each pilot implementation file/symbol/CSS to its defining `design/` source and `part`.
   - Bind surfaces as whole sources (omit `part`).
   - Use exported JS/TS symbol names for automatic lexical lookup, or an exact unique `anchor` substring for non-exported / non-JS/TS symbols (such as Vue or CSS).
2. Run verification:

   ```sh
   adg check --read-only --json
   adg owner --file=<pilot-impl-file> --json
   adg owner --part=design/components/<name>.tsx#<Export> --json
   ```

3. For Stage 2+, once pilot bindings pass (and surface frames either have `fixture`/`capture` or reasoned `captureExemptions` in `design/implementation.json`), set `check.lifecycle: true` and re-run `adg check --read-only --json`.
4. For Stage 3 (optional, when the app has deterministic local fixtures):
   - Add a `compare` adapter to `adg.config.mjs` (`docs/design-toolkit.md#compare`).
   - Add consumer-side literal-paint, shared-consumer, and token-naming checks (`docs/asset-rules.md#4-add-implementation-checks`).

### Step 5: Wire project agent instructions

Add a concise ADG section to the repository's `AGENTS.md` (or `CLAUDE.md`) linking the public ADG docs, naming the project's `design/implementation.json` and check command (`adg check --read-only --json`), and directing UI tasks to the `adg-design` skill. Keep project-specific visual direction, declared forms, exceptions, and gaps in a short local design doc (see ADG's own `docs/design.md` as an example) with no duplicated counterpart tables.

## Track C: Existing `design/` library (governance and motion)

1. **Governance:** follow `docs/asset-rules.md#adopting-an-existing-project` in order:
   - Inventory existing sources, layers, consumers, and bindings.
   - Run `adg check --read-only --json` and report findings in a `File | Problem | Suggested fix` table without editing files during the audit.
   - Stop for user confirmation on batch order and appearance changes from token normalization.
   - Execute check-decided governance steps in batches (Enforce → Placement → Tokens → Lifecycle → Close).
2. **Motion adoption:** follow `docs/asset-rules.md#adopting-motion` using `adg motion --coverage --json`:
   - Round 1: inventory and map runtime motion sites in `design/motion-patterns.json` (design-only).
   - Round 2: author and bind one pilot playable flow (`*.motion.json`), verify clean `adg check`, and enable `check.strictMotion: true`.
   - Round 3: list runtime alignment gaps and **stop for project owner approval** before changing runtime behavior.

## Guardrails

- Always pass `--json` when reading CLI output programmatically; branch on `ok`, `error.code`, and `error.next`.
- Do not patch or vendor ADG to work around a toolkit bug; stop and report a minimal reproduction.
- Report what changed, the checks run and their results, remaining exceptions/gaps, and any decisions needed from the user.
