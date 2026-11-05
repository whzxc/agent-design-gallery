# Development

- Keep this a local SVG viewer with a global `sdg` CLI. Projects own their SVGs, tokens, optional `gallery.json`, and Git history.
- Preserve the ARC MIT attribution. Do not depend on ARC runtime code or a personal checkout at runtime.
- Visual changes start with an SVG in `design/`, a rendered review, and user approval. The initial overview and open-directory forms are approved.
- Keep camera input independent of page component rendering. Measure changes affecting rendering, input, loading, or file refresh with the existing benchmark and the same asset snapshot.
- Use `tooling/compare.mjs` for reproducible performance comparisons. Retain raw output locally under `output/`; do not publish copied acceptance assets in the npm package.
- Publish `@whzxc/svg-design-gallery` only to the configured private registry. Include only the CLI, server, browser files, README, and license in the package.
- Use English maintainer documentation and Conventional Commits. Preserve unrelated files and changes.
