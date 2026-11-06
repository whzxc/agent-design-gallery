# SVG Design Gallery

Browse a repository's SVG designs with a local browser canvas.

```sh
npm install -g @whzxc/svg-design-gallery --registry https://npm.leow.top
sdg /path/to/design
```

Requires Node.js 22 or newer. The installed package starts without a build step. Browser toolkit commands use the bundled Playwright dependency; the viewer and sync do not load it. `sdg` opens a local server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to open recent directories. Stop the server with Ctrl+C.

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a drawing to select it; double-click or press Enter to focus it. Group names focus their collection. **Fit all** or 0 returns to the overview. **Back** restores the previous camera; Escape closes the active search or inspector first, then goes back. Arrow keys pan; +/− zoom; 1 sets the canvas to 100%.

The sidebar can collapse without moving the world point at the viewport center. Control/Command+F searches filenames and declared forms; Escape restores the previous view and sidebar state. Enter a zoom percentage or use the adjacent menu to fit the directory, group, or selection. The inspector provides form selection, Full sheet, Copy path, and Reveal file. Fullscreen, an optional overview map, and an independent canvas background are available in the toolbar.

Component collections use aligned, content-sized preview regions. Small forms share their original arrangement; similarly sized container forms can share a baseline. A family with a much taller form shows a compact representative and its explicit form count. Every declared form remains available in the inspector. Surface frames retain their own proportions. Layout stays fixed while panning, zooming, or collapsing the sidebar.

**Open directory** accepts a local path or a recent directory. SVG files remain in the source repository. Saving a file refreshes that drawing and its embedded SVG dependents without moving the camera or losing keyboard focus. Unchanged regions retain their positions. New or enlarged regions are placed below existing content; use **Arrange current group** to compact the layout after structural changes. Git owns asset history.

The viewer preserves each SVG's styles and sets `data-theme="light"` or `data-theme="dark"` on its root. SVGs with their own matching theme rules follow System, Light, and Dark. Relative embedded SVG images and local PNG, JPEG, and WebP images are resolved within the design directory. Keep designs self-contained; external CSS, fonts, and active SVG interactions are not a viewer feature.

Files are grouped by directory by default. An optional `gallery.json` in the design directory can arrange product modules:

```json
{
  "groups": [
    {
      "title": "Controls",
      "assets": ["components/button.svg", "components/field.svg"]
    },
    { "title": "Settings", "assets": ["surfaces/settings.svg"] }
  ]
}
```

Unlisted SVGs remain visible in directory groups. Grouping and design variables belong to the project; the viewer does not rewrite them.

Recent directories, theme, sidebar, inspector, and camera preferences stay in `$XDG_STATE_HOME/svg-design-gallery/state.json`, defaulting to `~/.local/state/svg-design-gallery/state.json`. `--state-dir` isolates preferences for measurement or development.

## Declared forms and frames

The viewer recognizes explicit SVG declarations:

- A root with `data-design="component"` can contain outermost `g[data-component][data-form]` groups. `data-form` supplies the form name.
- A surface can contain outermost `g[data-part="frame-NAME"]` groups. The suffix supplies the frame name.
- Nested component instances inside a frame remain part of that frame. Arbitrary nested groups are not split. SVGs without these declarations retain their complete viewBox.

Bounds are measured in SVG units with shadow padding. The viewer crops only its in-memory previews and preserves the original file. Top-level `.note` captions are omitted from cropped previews; form names are available through the inspector, while **Full sheet** retains all source annotations.

## Design toolkit

Install the shared CLI from GitHub with `npm install -g github:whzxc/svg-design-gallery`.
Run `sdg init` to scaffold a project, `sdg sync` to embed tokens, and `sdg check` to validate assets in both themes. `render`, `measure`, and `compare` support design review and implementation comparison. See the [design toolkit contract](docs/design-toolkit.md) for asset rules, commands, and the project adapter.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
```

The server serves the checked-in frontend directly. Reload after frontend edits; restart after server edits. No production bundle or frontend framework is required.

See [performance](docs/performance.md) for reproducible ARC comparisons and [architecture](docs/architecture.md) for rendering and ownership. ARC's MIT-licensed gallery is the starting point; its attribution is retained in `LICENSE`.
