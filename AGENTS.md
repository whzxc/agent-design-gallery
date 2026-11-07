# Development

- Keep this a local design viewer and toolkit behind one global `sdg` CLI. Projects own their TSX design sources, tokens, artwork, optional `gallery.json`, optional `sdg.config.mjs`, and Git history; they do not depend on the package.
- Preserve the ARC MIT attribution. Do not depend on ARC runtime code or a personal checkout at runtime.
- Visual changes start with a TSX source in `design/`, a rendered review, and user approval. Follow [the design toolkit](docs/design-toolkit.md) for the source format and [SDG design](docs/design.md) for the approved direction, layout rules and fixtures.
- Keep camera input independent of page component rendering. Measure changes affecting rendering, input, loading, or file refresh with the existing benchmark and the same asset snapshot.
- Use `tooling/compare.mjs` for reproducible performance comparisons. Retain raw output locally under `output/`; do not publish copied acceptance assets in the npm package.
- Publish `@whzxc/svg-design-gallery` to the public npm registry. Include only the CLI, server, browser files, toolkit runtime and types, README, and license in the package.
- Use English maintainer documentation and Conventional Commits. Preserve unrelated files and changes.
