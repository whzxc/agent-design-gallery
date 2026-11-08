# SVG Design Gallery

Build and browse a repository's TSX design frames with a local browser canvas.

```sh
npm install -g @whzxc/svg-design-gallery
sdg /path/to/design
```

Requires Node.js 22 or newer. Installation starts without a build step. Browser toolkit commands use the bundled Playwright dependency; the viewer and build do not load it. `sdg` opens a loopback server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to open recent directories. Stop the server with Ctrl+C.

## Viewer controls

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a frame to select its variant; double-click or press Enter to focus it. Hover an exported component inside a frame to outline its root, then click to inspect its source and export. Arrow keys pan; +/− zoom; 0 fits all; 1 sets the canvas to 100% around the usable canvas center. Escape clears the selection (or closes the current search, dialog or menu). Back returns to the previous selection and camera.

The floating sidebar holds the directory picker, search, and project groups. Control/Command+F opens search; results replace the tree. Clear the query to return to the tree, or Escape to restore the previous selection, camera, and sidebar state. Group names fit their collection, and asset names focus their set or first frame. Collapse the sidebar to keep only the app bar. Collapsing panels does not move the world.

The right inspector follows the selection and remembers its open state. It shows source path, frame name, dimensions, frames, and **Uses** / **Used by**, grouped by source directory. Indirect relationships are muted with their shortest `via` path. Click a relationship to select and focus that source. An element selection shows its owning export and the frames in that source that render it; click one to jump there. `GET /relationships` returns the underlying direct graph as JSON, keyed by source path with `uses` and `usedBy` arrays.

Click a canvas source or frame title to select it and copy its name. The copy icon copies without changing the selection and appears on hover or keyboard focus. Section titles also copy their names. Enter and Space activate a focused title. A check confirms a successful copy for 1.2 seconds. The inspector has separate source-path and frame-name copy controls.

The tool pill opens **Display**, **Inspector**, **Fullscreen**, and **More**. Display chooses System, Light, or Dark and an independent canvas background. More contains **Arrange current group** and **Keyboard shortcuts** (also available with ?).

The bottom zoom bar holds Back, zoom out, the zoom menu, zoom in, Fit, and Minimap. The zoom menu offers Fit all, Fit group, Fit selection, and Zoom to 100%. Fit uses the selected frame or element, source, or current group. The minimap moves the camera when clicked. The inspector lists forms or frames with their geometric sizes and notes.

The directory picker opens **Open a design directory**. Enter a path or select a recent directory, then choose Open; double-click a recent directory to open it immediately. Inline errors leave the current directory intact. With no directory open, the dialog has no close button.

## Sources and layout

Design sources are TSX files directly in `design/components/`, `design/modules/` and `design/surfaces/`. Default discovery also includes `design/studies/` once it contains a direct TSX study; explicit `sources` lists remain unchanged. Fixtures and artwork stay in their supporting directories. Import `Frame` and `Icon` from `sdg`, export reusable component functions, and default-export a function returning the declared frames. JSX builds static HTML and inline SVG without React or browser scripts. Tailwind v4 utilities resolve through the project's `design/tokens.css`; light and dark are selected by the document's `data-theme`.

Follow the [design asset rules](docs/asset-rules.md) for placement, ownership, states, frame names, fidelity, lifecycle and studies. The [adoption guide](docs/asset-rules.md#adopting-an-existing-project) covers inventory, a read-only audit with `file / problem / suggested fix` findings, review batches, and the mappings/governance each consumer keeps locally. `sources` orders production layers from lower to higher; `check` reports upward imports. Set `check: { importDirection: false }` to opt out of that lint while keeping frame checks.

A component source is one set: frames run in source order with 32px gaps, wrap before 1600px, and have 48px between rows. Sets pad forms by 24px at the sides and bottom and 36px at the top. A surface source is one flow: each frame receives 16px padding and follows the flow layout. Frame notes appear in the inspector, outside the drawing. Full sheet has been removed; choose a declared form or frame.

Legacy SVGs remain browsable with their existing geometric crops and relative embedded artwork. Files without declarations keep a whole-file preview. New toolkit commands accept TSX only; an SVG directly in `design/components/` or `design/surfaces/` must be converted. Imported SVG artwork belongs in `design/art/`; PNG, JPEG and WebP imports become data URLs. Add `?url` to an import under `design/art/` to embed any file as a data URL, including self-contained SVG previews.

Sets and flows pack into sections, and sections into a stable world. Saving a source, imported component, artwork or tokens refreshes affected previews without moving the camera. Unchanged regions retain their positions; new or enlarged regions move below existing content. Use Arrange current group to compact after structural changes. Labels retain constant screen sizes and hide when they collide with chrome or other labels.

Files group by directory unless `gallery.json` supplies project groups. Entries must point directly into configured source directories:

```json
{
  "groups": [
    { "title": "Controls", "assets": ["components/button.tsx", "components/field.tsx"] },
    { "title": "Settings", "assets": ["surfaces/settings.tsx"] }
  ]
}
```

Unlisted assets remain in directory groups. Projects own their TSX sources, artwork, tokens, configuration, and Git history. Recent directories, theme, sidebar, inspector, and per-directory camera and selection preferences stay in `$XDG_STATE_HOME/svg-design-gallery/state.json`, defaulting to `~/.local/state/svg-design-gallery/state.json`. Refreshing or reopening a directory restores its zoom, position, selected component and form. Canvas asset headings show the source's last modification time in local time; hover for the complete timestamp. `--state-dir` isolates preferences.

## Design toolkit

Run commands from inside the project:

```sh
sdg init
sdg check
sdg render surfaces/example --frame=default --scale=2
sdg check --read-only
```

`init` creates tokens, components/modules/surfaces, fixtures/art, editor configuration and ignore entries. A fresh library gets one `example.tsx` per production layer, composed downward with shared fixture data; existing libraries receive no demo sources. Existing authored files are preserved, declarations are refreshed, and missing ignore entries are appended. Starter configuration requires SDG 0.5.0 or newer. `check --read-only` skips declarations and build files for an audit. Projects do not install SDG as a dependency.

Builds produce standalone HTML and renders produce `<frame>-light.png` and `<frame>-dark.png` under `output/design/<source>/`. After configuring an implementation adapter and frame fixture/capture, use `sdg compare <source> --frame=<name>` or `sdg compare --all`. Flags override Frame capture props; `--all` writes a linked HTML index and `summary.json` under `output/design/compare/`. `sync` and `measure` have been removed.

See the [toolkit contract](docs/design-toolkit.md) for source format and compare adapters, and the [changelog](CHANGELOG.md) for version changes. Node.js executes design modules at build time; open sources you trust.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
npm test
```

The server serves the checked-in frontend and `design/tokens.css` directly. Reload after frontend edits; restart after server edits. `npm pack` copies the shared viewer tokens into the packaged browser files. No frontend framework is required. Maintainers publish to the public npm registry; a scope registry in the local npm config takes precedence over `publishConfig`, so override it with `npm publish --@whzxc:registry=https://registry.npmjs.org/`.

See [SDG design](docs/design.md), [architecture](docs/architecture.md), and [performance](docs/performance.md). ARC's MIT-licensed gallery is the starting point; the MIT license and Lucide/Feather icon notices are retained in `LICENSE`.
