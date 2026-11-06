# Design toolkit

[SDG design](design.md) · [Architecture](architecture.md) · [Performance](performance.md)

SVG assets in a project's `design/` directory define how its UI looks. The implementation follows them. The `sdg` toolkit keeps assets consistent, renders them for review, and compares them with the running implementation. The viewer (`sdg <directory>`) browses the same files.

This document is the format and command contract. A project's own design document keeps only its decisions: the forms it declares, its fixtures and its implementation notes.

## Install

`sdg` is installed once per machine and shared by every project. Projects do not list it in their dependencies.

```sh
npm install -g github:whzxc/svg-design-gallery
```

Run the same install again to update. `check`, `render`, `measure` and `compare` launch Chromium through the Playwright that ships with `sdg`; the viewer and `sync` start without it. When Chromium is missing, those commands stop with the command that installs it for that Playwright version.

A project may set `requires` in `sdg.config.mjs`, such as `'>=0.3.0'`. Older versions stop with exit code 2 and the update command, so every contributor checks with the same rules.

## Project layout

- `sdg.config.mjs` at the project root configures paths and `compare`. Every field is optional.
- `design/tokens.css` holds color, type, radius, size and shadow tokens for the light and dark themes.
- `design/components/<name>.svg` holds one shared component. Each top-level `data-component` group in the file is one presentation form.
- `design/surfaces/<name>.svg` holds a panel, dialog, page or screen composed from component instances. Each declared form is a `data-part="frame-<form>"` group whose first component is the surface shell. A frame may name its compare fixture with `data-fixture`. A frame that shows a whole page, or a crop of one, declares the page size with `data-viewport="<w>x<h>"` and its own top-left within the page with `data-origin="<x> <y>"`.
- `design/gallery.json` optionally arranges assets into groups for the viewer.
- `output/design/` receives renders and compare reports. Keep it out of Git.

Commands run from any directory inside the project. They find the nearest `sdg.config.mjs` or, without one, the nearest `package.json`, and resolve paths from there.

## Tokens

`design/tokens.css` has exactly two blocks, `:root { … }` for light and `:root[data-theme="dark"] { … }` for dark. Each declaration sits on its own line. The dark block overrides only the tokens that change.

Assets require these tokens: `--font-ui`, `--font-mono`, `--text-caption`, `--text-tertiary` and `--canvas`. Name the rest by role, such as `--surface`, `--text-secondary` or `--radius-panel`.

A `--shadow-<name>` token is a comma-separated list of `<x> <y> <blur> <color>` layers. `sync` derives an `--elev-<name>` SVG filter for each theme. Spread and inset have no SVG equivalent and are rejected.

## Asset format

- Each file is a standalone SVG with numeric `width`, `height` and `viewBox`. A `data-canvas` rect paints `var(--canvas)` behind the content.
- `sync` writes the region between `<!-- design:tokens -->` and `<!-- /design:tokens -->`. Do not edit that region by hand. It defines both themes, follows `data-theme` on the root and then the system theme, sets `font-family:var(--font-ui)` and `dominant-baseline:central` on text, styles `.mono` and `.note`, and shows `.only-light` or `.only-dark` content for the active theme.
- Paint through tokens in `style`, for example `style="fill:var(--surface)"`. Literal colors are allowed only inside a `data-brand` group.
- A tinted surface uses the token color with `fill-opacity`. A group can set `color:var(--token)` so its children paint with `currentColor`.
- Elevation uses `style="filter:var(--elev-<name>)"`.
- Text `y` is the vertical center. Set `font-size` through a `--text-*` token and `font-weight` in `style`. Add `class="mono"` for monospace text.
- Geometry stays literal. Corner radii and heights follow the radius and size tokens.
- A form or instance is `<g data-component="<name>" data-form="<form>" transform="translate(x y)">` with local coordinates. Its first `rect` child is the container.
- Icons are `<g data-icon="<lucide-name>">` groups with Lucide geometry. They keep a 1.75px rendered stroke.
- Form labels and other annotations use `class="note"` and stay outside component groups.
- An embedded image is an `<image>` with a relative path inside the design directory or a `data:` URI. A drawing that embeds another project's assets as sample content embeds each theme once, as images rendered with `data-theme` set, and marks them `only-light` and `only-dark`.
- An asset may animate with CSS or SMIL to show timing and easing. Interactive behavior stays in the project's UI conventions.

An instance matches its form's container height, radius, fill, stroke and elevation. It uses only text styles that the form uses, compared as fill, size, weight and family. Width and content may vary. A form whose container rect carries `data-fluid="height"` may also change height with its content.

## Presentation forms

- The user declares the forms each asset contains, such as three densities of one card.
- Draw only declared forms. Do not add frames for combinations of theme, width, locale or interaction state.
- Themes come from tokens. Every asset renders in both themes without extra frames.
- Each asset shows one representative language.

## Check

`check` loads every asset in Chromium in both themes and reports:

- a token region that differs from what `sync` would write;
- a literal paint outside `data-brand`, or a `var()` that names no token;
- text that leaves the canvas, overlaps other text, or overflows the container whose vertical middle it sits in;
- an instance of an unknown component or form;
- an instance whose container height, radius, fill, stroke or filter differs from its form, unless the form is fluid;
- an instance text style that its form does not use;
- a surface frame without a component shell, or a declared viewport that the frame's origin and size do not fit.

Each problem is one line, `<path>: <problem>`. A nonzero exit means the asset is not ready.

## Workflow

1. Start from the user's request and the fixture data the frame will be compared against.
2. Draw or update the asset. Use `measure` for text widths.
3. Run `check` and fix every problem.
4. Run `render` and review both theme renders against the layout review.
5. Show the renders to the user and iterate until they approve the asset.
6. Implement with the project's shared components and runtime tokens.
7. Run `compare` against the matching fixture and review the overlay. Fix structural differences and systematic offsets. Accept small isolated offsets when the implementation reads as well as the asset.

A frame uses the language and text of its fixture, including dates under the fixture clock. Generate repetitive geometry with a script kept outside the repository, measure text with `measure`, and copy icon geometry from Lucide. A drafter may propose forms. Approving the renders approves those forms.

A new project starts with a visual direction before any asset: two or three specimen sheets that differ in palette, density and chrome, one chosen by the user. Then tokens, then the component sheets, then one pilot surface taken through implementation and `compare` before the remaining surfaces.

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
sdg sync
sdg check [asset...]
sdg render [asset...] [--scale=2]
sdg measure <text> [--size=<px|token>] [--weight=400] [--mono]
sdg compare <asset> --frame=<name> [--fixture=<name>] [--region=<name> | --selector=<css>] [--click=<name>...] [--viewport=<w>x<h>]
```

A first argument that names a command runs it; any other argument is a directory to open. `sdg open check` opens a directory named `check`.

- `init` creates `sdg.config.mjs`, `design/tokens.css` with the required tokens, `design/components/` and `design/surfaces/`. It never overwrites a file and lists what it created and skipped.
- `sync` rewrites the token region of every asset and reports the files it changed.
- `check` checks the named assets, or all of them.
- `render` writes `output/design/<path>-light.png` and `-dark.png` at the given scale.
- `measure` prints the rendered width in pixels. `--size` accepts pixels or a `--text-*` token suffix such as `body`.
- `compare` renders one frame next to the implementation; see below.

Asset arguments are paths under the design directory, with or without `design/`. Exit codes are 0 for success, 1 when `check` or `compare` found problems, and 2 for a usage, configuration or environment error, with one line on stderr naming the fix.

## Compare

`compare` renders one frame of an asset, the `data-part` group named by `--frame` (`failed` or `frame-failed`), and the implementation in the fixture's theme, locale and clock. `--fixture` defaults to the frame's `data-fixture`. A frame with `data-viewport` sets that viewport and captures the page clip at `data-origin` with the frame's size. Otherwise `--region` captures the element with role `region` or `dialog` and that accessible name, and `--selector` captures the first element matching a CSS selector. Each `--click` activates a button by accessible name, in order, before capture.

It reads one text per rendered line, including the placeholders of empty fields, skips text clipped outside the captured element, and pairs texts by content. Positions are relative to the frame's shell, the first component container in the frame, and to the captured element. It reports anchored-edge, vertical-center and width differences above 2px, plus texts missing from either side. It does not compare shapes, so review the overlay as well.

`output/design/compare/<asset>-<frame>-<fixture>/` receives `design.png`, `implementation.png`, `overlay.png`, `report.json` and `index.html`. A nonzero exit means it found differences. Treat them as a review list, not a zero gate. Missing or extra texts, wrong order or grouping, and one offset shared by many texts point to real defects, such as a lost font rule or a leftover border. An isolated offset of a few pixels can stay.

The project describes how to run its implementation in `sdg.config.mjs`:

```js
export default {
  requires: '>=0.3.0',
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
      return { url: `/?scenario=${encodeURIComponent(name)}`, theme: 'light', locale: 'en-US', clock: '2026-01-01T00:00:00Z' };
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
- `fixture` returns `url`, relative to `http://127.0.0.1:<port>` or absolute, plus `theme` (`light` or `dark`), `locale` and `clock`. A `clock` fixes `Date` and `Date.now()` while timers keep running. Motion is reduced.
- `ready` defaults to the page's `load` event.
- `texts` returns `{ text, x, y, width, height, fill, size, weight, family }` entries in page coordinates. They join the DOM texts inside the captured element.

## Viewer conventions

The viewer reads the same files. A root with component forms shows one set per file; a surface shows its frames as a flow. `.note` captions are omitted from cropped previews. `gallery.json` lists groups of asset paths; unlisted assets stay in directory groups. See the [README](../README.md) for viewer controls.

## Limits

- Assets name the system font stack. Linux renders use fallback fonts, so final visual review runs on macOS.
- SVG has no layout engine. Positions are explicit, and a geometry change to a form requires updating its instances. `check` lists the instances that no longer match.
- Static assets do not show hover response, focus movement, dragging, springs or interruption.
