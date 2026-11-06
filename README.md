# SVG Design Gallery

Browse a repository's SVG designs with a local browser canvas.

```sh
npm install -g github:whzxc/svg-design-gallery
sdg /path/to/design
```

Requires Node.js 22 or newer. Installation starts without a build step. Browser toolkit commands use the bundled Playwright dependency; the viewer and sync do not load it. `sdg` opens a loopback server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to open recent directories. Stop the server with Ctrl+C.

## Viewer controls

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a drawing to select it; double-click or press Enter to focus it. Arrow keys pan; +/− zoom; 0 fits all; 1 sets the canvas to 100% around the usable canvas center. Escape closes search or the inspector before returning to the previous camera.

The floating sidebar holds the directory picker, search, and project groups. Control/Command+F opens search; results replace the tree. Clear the query to return to the tree, or Escape to restore the previous selection, camera, and sidebar state. Group names fit their collection, and asset names focus their set or first frame. Collapse the sidebar to keep only the app bar. Collapsing panels does not move the world.

The tool pill opens **Display**, **Inspector**, **Fullscreen**, and **More**. Display chooses System, Light, or Dark and an independent canvas background. More contains **Arrange current group** and **Keyboard shortcuts** (also available with ?).

The bottom zoom bar holds Back, zoom out, the zoom menu, zoom in, Fit, and Minimap. The zoom menu offers Fit all, Fit group, Fit selection, and Zoom to 100%. Fit uses the selected drawing or current group. The minimap moves the camera when clicked. The inspector lists forms or frames with their geometric sizes, plus Full sheet, Copy path, and Reveal file.

The directory picker opens **Open a design directory**. Enter a path or select a recent directory, then choose Open; double-click a recent directory to open it immediately. Inline errors leave the current directory intact. With no directory open, the dialog has no close button.

## Assets and layout

A component file is one set: all outermost `g[data-component][data-form]` declarations keep their original arrangement within a padded geometric crop. A surface file is one flow: outermost `g[data-part="frame-NAME"]` frames run in rows. Files without declarations retain a complete-sheet preview. Labels stay at constant screen size and are omitted when they cannot fit or would collide with floating controls or another label.

Sets and flows pack into sections, and sections pack into a stable world. Previews retain their proportions. Layout does not change while panning, zooming, or collapsing panels. Saving a file refreshes that drawing and embedded SVG dependents without losing camera position or keyboard focus. Unchanged regions retain their positions; new or enlarged regions move below existing content. Use Arrange current group to compact after structural changes. Git owns asset history.

The viewer sets `data-theme="light"` or `data-theme="dark"` on each SVG root. Relative embedded SVGs and local PNG, JPEG, and WebP images resolve within the design directory. Keep assets self-contained; external CSS, fonts, and active SVG interactions are not a viewer feature. Cropped previews omit top-level `.note` captions; Full sheet preserves the original artwork.

Files group by directory unless `gallery.json` supplies project groups:

```json
{
  "groups": [
    { "title": "Controls", "assets": ["components/button.svg", "components/field.svg"] },
    { "title": "Settings", "assets": ["surfaces/settings.svg"] }
  ]
}
```

Unlisted assets remain in directory groups. Projects own their SVGs, tokens, configuration, and Git history. Recent directories, theme, sidebar, inspector, and camera preferences stay in `$XDG_STATE_HOME/svg-design-gallery/state.json`, defaulting to `~/.local/state/svg-design-gallery/state.json`. `--state-dir` isolates preferences.

## Design toolkit

Run `sdg init` to scaffold a project, `sdg sync` to embed tokens, and `sdg check` to validate assets in both themes. `render`, `measure`, and `compare` support design review and implementation comparison. See the [design toolkit contract](docs/design-toolkit.md) for asset rules, commands, and project adapters.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
npm test
```

The server serves the checked-in frontend and `design/tokens.css` directly. Reload after frontend edits; restart after server edits. No frontend framework or production bundle is required. Maintainers publish only to the configured private registry, `https://npm.leow.top`.

See [SDG design](docs/design.md), [architecture](docs/architecture.md), and [performance](docs/performance.md). ARC's MIT-licensed gallery is the starting point; the MIT license and Lucide/Feather icon notices are retained in `LICENSE`.
