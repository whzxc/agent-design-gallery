# Development

- Keep this a local design viewer and toolkit behind one global `sdg` CLI. Projects own their TSX design sources, tokens, artwork, optional `gallery.json`, optional `sdg.config.mjs`, and Git history; they do not depend on the package.
- Preserve the ARC MIT attribution. Do not depend on ARC runtime code or a personal checkout at runtime.
- Design assets follow [the asset rules](docs/asset-rules.md), which take precedence over conflicting local guidance.
  Use [the design toolkit](docs/design-toolkit.md) for source format and [SDG design](docs/design.md) for current ownership,
  mappings and approval routing. Codex proposes and implements; the delegating Claude conversation reviews the completed
  report after the Codex turn ends. Do not dispatch other Agents or answer their permission requests. The controller may release
  a structure-only batch when every affected frame is pixel-identical in both themes and nothing remains undecided.
  The user approves visual differences or unresolved choices in the gallery.
- Keep camera input independent of page component rendering. Measure changes affecting rendering, input, loading, or file refresh with the existing benchmark and the same asset snapshot.
- Use `tooling/compare.mjs` for reproducible performance comparisons. Retain raw output locally under `output/`; do not publish copied acceptance assets in the npm package.
- Publish `@whzxc/svg-design-gallery` to the public npm registry. Include only the CLI, server, browser files, toolkit runtime and types, README, and license in the package.
- Use English maintainer documentation and Conventional Commits. Preserve unrelated files and changes.
