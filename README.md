# SVG Design Gallery

Browse a repository's SVG designs with a local browser canvas.

```sh
npm install -g @whzxc/svg-design-gallery --registry https://npm.leow.top
sdg /path/to/design
```

Requires Node.js 22 or newer. The installed package has no runtime dependencies and starts without a build step. `sdg` opens a local server in your default browser. Use `--no-open` to print its URL, `--port 5200` to select a port, or omit the directory to open recent directories. Stop the server with Ctrl+C.

Drag or scroll to pan. Pinch, or hold Control/Command while scrolling, to zoom around the pointer. Click a module or drawing to focus it. **Fit all**, Escape, or 0 returns to the overview. Arrow keys pan; +/− zoom; 1 sets the canvas to 100%. The selected drawing's filename reveals its source in the file manager.

**Open directory** accepts a local path or a recent directory. SVG files remain in the source repository. Saving a file refreshes that drawing and its embedded SVG dependents without moving the camera. Adding and removing files updates the canvas. Git owns asset history.

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

Recent directories, theme, and camera preferences stay in `$XDG_STATE_HOME/svg-design-gallery/state.json`, defaulting to `~/.local/state/svg-design-gallery/state.json`. `--state-dir` isolates preferences for measurement or development.

## Development

```sh
npm ci
npm start -- /path/to/design --no-open
```

The server serves the checked-in frontend directly. Reload after frontend edits; restart after server edits. No production bundle or frontend framework is required.

See [performance](docs/performance.md) for reproducible ARC comparisons and [architecture](docs/architecture.md) for rendering and ownership. ARC's MIT-licensed gallery is the starting point; its attribution is retained in `LICENSE`.
