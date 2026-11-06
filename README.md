# SVG Design Gallery

Build and browse a repository's TSX design frames with a local browser canvas.

```sh
npm install -g @whzxc/svg-design-gallery
sdg /path/to/design
```

Requires Node.js 22 or newer. Installation starts without a build step. Browser toolkit commands use the bundled Playwright dependency; the viewer and build do not load it. `sdg` opens a loopback server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to open recent directories. Stop the server with Ctrl+C.

## Viewer controls

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a drawing to select it; double-click or press Enter to focus it. Arrow keys pan; +/− zoom; 0 fits all; 1 sets the canvas to 100% around the usable canvas center. Escape closes search or the inspector before returning to the previous camera.

The floating sidebar holds the directory picker, search, and project groups. Control/Command+F opens search; results replace the tree. Clear the query to return to the tree, or Escape to restore the previous selection, camera, and sidebar state. Group names fit their collection, and asset names focus their set or first frame. Collapse the sidebar to keep only the app bar. Collapsing panels does not move the world.

The tool pill opens **Display**, **Inspector**, **Fullscreen**, and **More**. Display chooses System, Light, or Dark and an independent canvas background. More contains **Arrange current group** and **Keyboard shortcuts** (also available with ?).

The bottom zoom bar holds Back, zoom out, the zoom menu, zoom in, Fit, and Minimap. The zoom menu offers Fit all, Fit group, Fit selection, and Zoom to 100%. Fit uses the selected drawing or current group. The minimap moves the camera when clicked. The inspector lists forms or frames with their geometric sizes, their notes, Copy path, and Reveal file.

The directory picker opens **Open a design directory**. Enter a path or select a recent directory, then choose Open; double-click a recent directory to open it immediately. Inline errors leave the current directory intact. With no directory open, the dialog has no close button.

## Sources and layout

Design sources are TSX modules. Import `Frame` and `Icon` from `sdg`, export reusable component functions, and default-export a function returning the declared frames. JSX builds static HTML and inline SVG without React or browser scripts. Tailwind v4 utilities resolve through the project's `design/tokens.css`; light and dark are selected by the document's `data-theme`.

A component source is one set: frames run in source order with 32px gaps, wrap before 1600px, and have 48px between rows. Sets pad forms by 24px at the sides and bottom and 36px at the top. A surface source is one flow: each frame receives 16px padding and follows the flow layout. Frame notes appear in the inspector, outside the drawing. Full sheet has been removed; choose a declared form or frame.

Legacy SVGs remain browsable with their existing geometric crops and relative embedded artwork. Files without declarations keep a whole-file preview. New toolkit commands accept TSX only; an SVG directly in `design/components/` or `design/surfaces/` must be converted. Imported SVG artwork belongs in `design/art/`; PNG, JPEG and WebP imports become data URLs. Add `?url` to an import under `design/art/` to embed any file as a data URL, including self-contained SVG previews.

Sets and flows pack into sections, and sections into a stable world. Saving a source, imported component, artwork or tokens refreshes affected previews without moving the camera. Unchanged regions retain their positions; new or enlarged regions move below existing content. Use Arrange current group to compact after structural changes. Labels retain constant screen sizes and hide when they collide with chrome or other labels.

Files group by directory unless `gallery.json` supplies project groups:

```json
{
  "groups": [
    { "title": "Controls", "assets": ["components/button.tsx", "components/field.tsx"] },
    { "title": "Settings", "assets": ["surfaces/settings.tsx"] }
  ]
}
```

Unlisted assets remain in directory groups. Projects own their TSX sources, artwork, tokens, configuration, and Git history. Recent directories, theme, sidebar, inspector, and camera preferences stay in `$XDG_STATE_HOME/svg-design-gallery/state.json`, defaulting to `~/.local/state/svg-design-gallery/state.json`. `--state-dir` isolates preferences.

## Design toolkit

Run commands from inside the project:

```sh
sdg init
sdg check
sdg render surfaces/settings --frame=ready --scale=2
sdg compare surfaces/settings --frame=ready
sdg compare --all
```

`init` creates tokens, source/art directories, editor configuration and ignore entries without overwriting existing files. Each command refreshes declarations in `design/.sdg/`; projects do not install SDG as a dependency. Builds produce standalone HTML and renders produce `<frame>-light.png` and `<frame>-dark.png` under `output/design/<source>/`. Compare uses Frame fixture/capture props, with CLI flags taking precedence. `--all` writes a linked HTML index and `summary.json` under `output/design/compare/`. `sync` and `measure` have been removed.

See the [v2 toolkit contract](docs/design-toolkit.md) for source rules and compare adapters. Node.js executes design modules at build time; open sources you trust.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
npm test
```

The server serves the checked-in frontend and `design/tokens.css` directly. Reload after frontend edits; restart after server edits. `npm pack` copies the shared viewer tokens into the packaged browser files. No frontend framework is required. Maintainers publish only to the configured private registry, `https://npm.leow.top`.

See [SDG design](docs/design.md), [architecture](docs/architecture.md), and [performance](docs/performance.md). ARC's MIT-licensed gallery is the starting point; the MIT license and Lucide/Feather icon notices are retained in `LICENSE`.
