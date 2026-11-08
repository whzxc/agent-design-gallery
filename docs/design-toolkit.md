# Design toolkit

[Asset rules and adoption](asset-rules.md) · [SDG design](design.md) · [Architecture](architecture.md) · [Performance](performance.md)

A project's `design/` directory holds TSX sources that define how its UI looks. The implementation follows them. The `sdg` toolkit builds the sources into static frames, checks them, renders them for review, compares them with the running implementation, and browses them in the viewer (`sdg <directory>`).

This document is the format and command contract. The [design asset rules](asset-rules.md) define layers, ownership, states, frame naming, fidelity and lifecycle, with an adoption guide for existing projects. A project's own mapping and governance documents keep its direction, declared forms, implementation locations, approval process and concrete gaps.

## Install

`sdg` is installed once per machine and shared by every project. Projects do not list it in their dependencies.

```sh
npm install -g @whzxc/svg-design-gallery
```

The package comes from the public npm registry. Run the same install again to update. `check`, `render` and `compare` launch Chromium through the Playwright that ships with `sdg`; the viewer and the build start without it. When Chromium is missing, those commands stop with the command that installs it for that Playwright version.

A project may set `requires` in `sdg.config.mjs`, such as `'>=0.4.0'`. Older versions stop with exit code 2 and the update command, so every contributor checks with the same rules.

## Project layout

- `sdg.config.mjs` at the project root configures paths, `sources`, `check` and `compare`. Every field is optional.
- `design/tokens.css` holds color, type, radius, size and shadow tokens for the light and dark themes.
- `design/components/<name>.tsx` holds one shared component. It exports the functions other sources use, and its default export returns the component's declared forms as frames.
- `design/modules/<feature>.tsx` owns feature parts and their states, composed from components and other modules' exported parts.
- `design/surfaces/<name>.tsx` holds a panel, dialog, page or screen composed from components. Its default export returns its declared forms as frames.
- `design/art/` holds SVG illustrations and brand artwork that sources import.
- `design/fixtures/` holds representative content and state data. `design/studies/` holds temporary direction explorations only while they are active.
- `design/gallery.json` optionally arranges sources into groups for the viewer.
- `design/tsconfig.json` lets editors resolve the toolkit's types. `sdg init` writes it; every command refreshes the ignored `design/.sdg/` declarations it points to.
- `output/design/` receives builds, renders and compare reports. Keep it and `design/.sdg/` out of Git.

`sources` is an optional array of plain top-level directory names. Since 0.5.0 it defaults to `['components', 'modules', 'surfaces']`, adding `studies` only when a direct `design/studies/*.tsx` file exists. Empty study directories and nested helpers do not enable studies. Saving the first study or removing the last one updates default viewer discovery. Explicit lists retain their exact directories and order, including whether to include studies. Names use letters, digits, underscores or hyphens; nested paths are rejected. Only direct TSX files in those directories are source entries. Other files under `design/`, such as shared scene data, remain imports.

Production directories in `sources` are ordered from lower to higher layers. `check` rejects imports into a higher layer and permits imports within the same layer. With the default order, components cannot import modules or surfaces, and modules cannot import surfaces. Custom names use the configured order; studies are exempt. A consumer can set `check: { importDirection: false }` in `sdg.config.mjs` to disable only this lint and document its alternative policy locally. The check uses resolved direct source imports from the relationship graph, including extension/index resolution and re-exports.

Commands run from any directory inside the project. They find the nearest `sdg.config.mjs` or, without one, the nearest `package.json`, and resolve paths from there.

## Tokens

`design/tokens.css` has exactly two blocks, `:root { … }` for light and `:root[data-theme="dark"] { … }` for dark. Each declaration sits on its own line. The dark block overrides only the tokens that change.

Sources require `--font-ui`, `--font-mono`, `--canvas` and `--text`. Name the rest by role, such as `--surface`, `--text-secondary`, `--text-body` or `--radius-panel`. A `--shadow-<name>` token is a CSS box-shadow list.

## Sources

Sources are TSX modules that run at build time. JSX produces static markup: there is no React, state, effect or event handling, and the output contains no scripts or event attributes. A component is a plain function of its props. Use `class`, not `className`; other attribute names follow HTML and SVG.

```tsx
import { Frame, Icon } from 'sdg';

export function Panel(props: { title: string; children?: unknown }) {
  return (
    <section class="w-[420px] rounded-panel bg-surface p-4 shadow-md">
      <h2 class="flex items-center gap-2 text-title font-semibold text-text">
        <Icon name="plug" />
        {props.title}
      </h2>
      {props.children}
    </section>
  );
}

export default () => [
  <Frame name="ready" fixture="mcp-hub-ready" capture={{ region: 'MCP', viewport: '1280x1200' }}>
    <Panel title="MCP" />
  </Frame>,
];
```

The specifier `sdg` resolves to the installed toolkit's runtime. Relative imports resolve within `design/`. Importing an `.svg` file under `design/` yields a component that inlines the drawing and passes its props to the drawing's root; importing a PNG, JPEG or WebP file yields a data URL. `import url from './x.svg?url'` yields a data URL for any file under `design/art/`, preserving self-contained artwork as an image. Packages from npm are not available to sources.

Reuse components and pass parameters instead of copying markup between sources. Generate repeated geometry with ordinary functions and loops in the source.

### Frame

A `Frame` is one declared form of a component or surface.

- `name` is the form name, unique within the source.
- `width` and `height` are CSS pixels. Without width or height, the frame takes its content's size.
- `fixture` names the compare fixture for this form.
- `capture` tells `compare` what to capture in the implementation: `{ region }`, `{ selector }` or `{ page: true }`, each with optional `viewport` (`'<w>x<h>'`) and `clicks` (accessible names, in order). A page capture clips the page at `origin` (`'<x> <y>'`, default `'0 0'`) with the frame's size.
- `note` is a caption that the viewer shows in the inspector. It is not part of the drawing.

A frame contains exactly one root element, its shell. `compare` measures design positions from the shell's top-left. The frame paints `var(--canvas)` behind the shell.

### Icon

`<Icon name="<lucide-name>" />` renders Lucide geometry in `currentColor` with a 1.75px rendered stroke. `size` defaults to 16; `class` passes through.

## Styling

Style with Tailwind CSS v4 utility classes. The build compiles only the classes the sources use, against a theme generated from `design/tokens.css`:

| Token | Theme variable | Example classes |
| --- | --- | --- |
| `--<name>` with a color value | `--color-<name>` | `bg-surface`, `text-text-secondary`, `border-border` |
| `--text-<name>` with a length | `--text-<name>` (font size) | `text-body`, `text-meta` |
| `--font-<name>` | `--font-<name>` | `font-ui`, `font-mono` |
| `--radius-<name>` | `--radius-<name>` | `rounded-panel` |
| `--shadow-<name>` | `--shadow-<name>` | `shadow-md` |
| any other token | the token itself | `h-(--control-height)` |

Tailwind's default colors, font sizes, font families, radii and shadows are removed, so those classes resolve only to project tokens. Spacing keeps Tailwind's 4px scale, and arbitrary lengths such as `w-[480px]` or `mt-[19px]` are allowed. Use a `style` attribute only for computed geometry. Sources contain no `<style>` elements.

Paint resolves through tokens. Opacity modifiers on token colors, such as `bg-warning/10`, are allowed. A literal color is allowed only inside an element with `data-brand`. The build defines both token blocks and the root's `data-theme` selects one, so every frame renders in both themes without extra frames. Text uses `font-ui` unless a class says otherwise.

A frame may animate with CSS to show timing and easing. `check`, `render` and `compare` run with motion reduced.

## Authoring

A source describes structure, not coordinates. Write it the way the UI is built.

- Lay out with flex and grid, gap and padding. Sizes follow content; fix a width or height only where the design fixes it, such as a panel, a dialog, a list row or the frame.
- Use whole CSS pixels. Spacing uses the 4px scale where it fits, otherwise an arbitrary whole-pixel value.
- Keep fixture text and repeated items as data at the top of the source and render them with `map`.
- Mark free-form geometry with `data-free`: canvas content, topology, charts, and chrome placed at fixed screen positions. Inside it, `style` may position elements with values computed from data.
- Outside `data-free`, `style` sets only width, height and custom properties.

## Presentation forms

- The user declares the forms each source contains, such as three densities of one card.
- Draw only declared forms. Do not add frames for combinations of theme, width, locale or interaction state.
- Themes come from tokens. Every source renders in both themes without extra frames.
- Each source shows one representative language.

## Check

`check` builds every source and loads each frame in Chromium in both themes. It reports:

- a build or render error, with its source location;
- a duplicate frame name, a frame without exactly one root element, or an invalid `capture`;
- a computed text, background, border, outline, fill, stroke or shadow color that matches no token value in the active theme, outside `data-brand`;
- text that overflows its box without an ellipsis, leaves the frame, or overlaps other text;
- content that overflows the frame's declared width or height;
- a `<style>` element, script or event attribute in the output;
- a fractional pixel length in a class or style outside `data-free`;
- a `style` outside `data-free` that sets anything but width, height or custom properties.

Each problem is one line, `<path>: <frame>: <problem>`. A nonzero exit means the source is not ready.

An import-direction problem is one line, `<path>: import <source> violates import direction (<lower> -> <higher>); ...`. It names the resolved source rather than a manual dependency annotation. Named-source checks lint those sources' outgoing imports, including targets outside the selected subset. Other imported helpers and erased type-only imports are outside the graph; review their ownership in the [read-only audit](asset-rules.md#2-run-a-read-only-audit).

## Workflow

1. Start from the user's request and the fixture data the frame will be compared against.
2. Write or update the source, reusing components.
3. Run `check` and fix every problem.
4. Run `render` and review both theme renders against the layout review.
5. Show the renders to the user and iterate until they approve them.
6. Implement with the project's shared components and runtime tokens.
7. Run `compare` for the frame's fixture and review the overlay. Fix structural differences and systematic offsets. Accept small isolated offsets when the implementation reads as well as the design.

A frame uses the language and text of its fixture, including dates under the fixture clock and time zone. A drafter may propose forms. Approving the renders approves those forms. Frames whose state the implementation cannot reach have no fixture; record them in the project's design doc as drift instead of forcing a capture.

A new project starts with a visual direction before any source: two or three specimen frames that differ in palette, density and chrome, one chosen by the user. Then tokens, then the component sources, then one pilot surface taken through implementation and `compare` before the remaining surfaces.

## Layout review

Review the composition of every frame before showing it. A frame that copies the current implementation also copies its layout problems.

- Group by meaning. Items that serve one decision sit together, and the gap between groups is clearly larger than the gap inside a group.
- End a decision with one action row. Attach scope and consequence text to the title or content it qualifies.
- Settings use one setting per row, with its name and effect on the left and its control on the right. Group rows by the scope they affect.
- Join short metadata into one line with ` · `. A short status or count does not own a row.
- Give a row or step at most a title and one meta line.
- Show each state once.
- Pad a container equally on all sides. Its height follows its content.
- Give an overlay one dismissal. Do not add a footer button that repeats close.
- Keep navigation, filters and actions apart. Panel actions sit with close in the header. Filters share one toolbar row.
- Keep a transition in place. A running action turns its own control into the pending state and disables its siblings.
- Anchor a menu or popover to its trigger, with the trigger in its open state.
- Floating chrome never hides the only copy of a label. A label that would collide with chrome or another label is omitted.
- Cut advisory text that the user does not need in order to act.

## Commands

```sh
sdg [open] [directory] [--port=<n>] [--no-open] [--state-dir=<path>]
sdg init
sdg check [source...] [--read-only]
sdg render [source...] [--frame=<name>] [--scale=2]
sdg compare <source> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css> | --page] [--origin=<x> <y>] [--click=<name>...] [--viewport=<w>x<h>]
sdg compare --all
```

A first argument that names a command runs it; any other argument is a directory to open. `sdg open check` opens a directory named `check`.

- `init` creates `sdg.config.mjs` requiring `>=0.5.0`, required tokens, production source directories, fixtures/art, editor configuration and ignore entries. A fresh library gets `components/example.tsx`, `modules/example.tsx`, `surfaces/example.tsx` and `fixtures/example.ts`: one runnable downward composition with frame name `default` in each source. Explicit source names are used in place of the defaults. Existing source libraries or an existing example fixture receive no demo assets. Authored files are preserved, generated declarations are refreshed, missing ignore entries are appended, and created/skipped files are listed. It creates no study or empty studies directory.
- `check` checks import direction and the named sources' frames, or all sources. `--read-only` skips generated type declarations and HTML build files; it runs the same import and both-theme frame checks without changing consumer files.
- `render` writes `output/design/<path>/<frame>-light.png` and `-dark.png` at the given scale, for every frame or the one named.
- `compare` compares one frame; its flags override the frame's `fixture` and `capture`.
- `compare --all` compares every frame that has a fixture and writes `output/design/compare/summary.json` and `index.html`, one row per frame with its counts and report link.

Each design capture in `render` and `compare` uses a fresh page and browser context, including between themes, so PNG bytes are independent of frame order. `render` reuses one Chromium process for the batch, runs up to four captures concurrently within the available CPU parallelism, and closes each page after capture. Console output follows source, frame and theme order.

Source arguments are paths under the design directory, with or without `design/` and `.tsx`. Exit codes are 0 for success, 1 when `check` or `compare` found problems, and 2 for a usage, configuration or environment error, with one line on stderr naming the fix.

## Compare

`compare` builds the frame and renders it in Chromium beside the implementation in the fixture's theme, locale, time zone and clock. The capture comes from the frame's `capture`, overridden by flags. A page capture sets the viewport and clips the page at `origin` with the frame's size; `region` captures the element with role `region` or `dialog` and that accessible name; `selector` captures the first element matching a CSS selector. Each click activates the first visible control with that exact accessible name among buttons, radios, tabs, checkboxes, switches, menu items, options and links. After the clicks, `compare` waits until the captured texts and their boxes stay unchanged for 300ms, up to 5s.

Both sides are read the same way. The reader takes one text per rendered line, including the placeholders of empty fields, and skips text clipped outside the captured element. Adjacent texts on one line with less than one space between them read as one text. `aria-hidden` on the capture target and its ancestors is ignored; `aria-hidden` subtrees inside it are skipped. Texts pair by content, and repeated texts pair with the nearest position first. Positions are relative to the frame's shell and to the captured element. It reports anchored-edge, vertical-center and width differences above 2px, plus texts missing from either side. It does not compare shapes, so review the overlay as well.

`output/design/compare/<source>-<frame>-<fixture>/` receives `design.png`, `implementation.png`, `overlay.png`, `report.json` and `index.html`. `report.json` records `settled: false` when the texts did not settle. A nonzero exit means it found differences. Treat them as a review list, not a zero gate. Missing or extra texts, wrong order or grouping, and one offset shared by many texts point to real defects, such as a lost font rule or a leftover border. An isolated offset of a few pixels can stay.

The project describes how to run its implementation in `sdg.config.mjs`:

```js
export default {
  requires: '>=0.4.0',
  design: 'design',
  output: 'output/design',
  compare: {
    port: 5188,
    viewport: '1280x800',
    // Starts the app under test and returns a function that stops it.
    async start({ port, root }) {
      const { createServer } = await import('vite');
      const server = await createServer({ root, server: { port, strictPort: true }, logLevel: 'error' });
      await server.listen();
      return () => server.close();
    },
    // Resolves a fixture name to the page to open and its environment.
    fixture(name) {
      return { url: `/?scenario=${encodeURIComponent(name)}`, theme: 'light', locale: 'en-US', timezone: 'Asia/Shanghai', clock: '2026-01-01T00:00:00Z' };
    },
    // Resolves once the page shows the fixture; throws to fail.
    async ready(page, name) {
      await page.waitForFunction(n => document.documentElement.dataset.scenarioReady === n, name, { timeout: 15000 });
    },
    // Request patterns to abort, so fixtures never reach live services.
    block: ['**/api/**'],
    // Optional: texts the page draws outside the DOM, such as on a canvas.
    async texts(page) { return []; },
  },
};
```

- `start` is optional when `url` values are absolute and the app already runs.
- `fixture` returns `url`, relative to `http://127.0.0.1:<port>` or absolute, plus `theme` (`light` or `dark`), `locale`, optional `timezone` (an IANA name) and `clock`. A `clock` fixes `Date` and `Date.now()` while timers keep running. Motion is reduced.
- `ready` defaults to the page's `load` event. A fixture name may stand for a scenario plus preparation steps that `ready` performs.
- `texts` returns `{ text, x, y, width, height, fill, size, weight, family }` entries in page coordinates. They join the DOM texts inside the captured element.

## Viewer conventions

The viewer reads the same sources and rebuilds a source, and the sources that import it, when it is saved. A component source is one set of its forms; a surface source is one flow of its frames. Frame notes appear in the inspector. `gallery.json` lists groups of source paths; unlisted sources stay in directory groups. See the [README](../README.md) for viewer controls.

Since 0.4.5, clicking a frame selects that variant. Clicking a source title selects its source; title clicks also retain copy-name behavior, while the copy icon alone leaves the selection unchanged. Escape clears the selection. Back restores the preceding selection and camera. Drag, pan, zoom, double-click and Enter focus remain available.

The right inspector follows the selection and remembers whether it is expanded, including across navigation and reload. It opens by default; the toolbar Inspector control and the panel's collapse control toggle it. It shows the source path and frame name with copy controls, dimensions and a scrollable frame list. A source selection has no selected variant. A selected frame keeps its outline and frame name through reload. An element selection shows its owning source and export, the host frame name and the element's dimensions, plus **Frames using this export** from the owning source. Clicking one selects and focuses that variant. The relation lists live in this inspector; the left sidebar remains source navigation and search.

**Uses** and **Used by** include direct and transitive sources, grouped by directory (`surfaces`, `modules`, then `components` for the standard composition layers). Direct entries precede indirect entries in each group. An indirect entry is muted and shows its shortest `via` path; equal-length routes use source-path ordering. Each source appears once and the selected source is excluded from cyclic traversals. For example, `surfaces/home → modules/home → modules/composer` displays `composer · via home`. A direct import takes precedence over an indirect route to the same source. Click an entry to select and focus its source; Back returns to the previous frame or element.

The graph comes from imports resolved by the existing bundler, including relative extensions, directory indexes and re-exports. Only TSX entries directly in configured `sources` directories are nodes. Fixtures, nested helper modules, tokens, artwork and the `sdg` runtime are excluded. Imports removed by the TypeScript transform, such as type-only imports, are excluded. Saving, adding or removing a source updates relationships through the existing file watcher.

The build registers named exported functions from configured sources by their function identity, including aliases. Static JSX rendering stamps their HTML/SVG roots with `data-sdg-owners`, preserving nested exports that return the same root. Fragments and arrays stamp each element root without adding wrappers. The default export remains the frame renderer. During the viewer's existing preview measurement, it records each stamped root's bounds, clipped to the frame and scrolling ancestors. Hover outlines the innermost root under the pointer; click selects it. Matching frames are those whose rendered roots contain the same source/export identity. Camera input only transforms these recorded bounds; it never reruns the page components. Plain text returns have no element root to hit, and unexported helper functions do not introduce a source boundary.

For non-interactive inspection, `GET /relationships` on the local viewer server returns the direct graph, keyed by source path with `uses` and `usedBy` arrays. For example, `curl http://127.0.0.1:<port>/relationships`. It reuses compiled source caches; asset responses carry direct source paths in `imports` and root stamps in frame HTML. The viewer derives shortest transitive routes from that graph. `window.__sdg.selection` exposes the host source, frame name and selected element's owning source/export for local automation.

## Limits

- Sources name the system font stack. Linux renders use fallback fonts, so final visual review runs on macOS.
- Frames are static. They do not show hover response, focus movement, dragging, springs or interruption; a state the user declares is its own form.
- An `.svg` file directly in `design/components/` or `design/surfaces/` stops a command that runs over all sources, including `compare --all`, with exit code 2 and names the file to convert. Commands that name sources check only those, so a project can convert in stages. Illustrations belong in `design/art/`.
