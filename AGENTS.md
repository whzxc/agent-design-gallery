# Development

- Keep a standalone ephemeral viewer (`adg open`) and a resident multi-project hub (`adg serve`) behind one global `adg` CLI. The ephemeral viewer never depends on the hub. Projects own their TSX design sources, tokens, artwork, optional `gallery.json`, optional `adg.config.mjs`, `.js` or `.ts`, and Git history; they do not depend on the package.
- Preserve the ARC MIT attribution. Do not depend on ARC runtime code or a personal checkout at runtime.
- Report design asset changes with links to the changed sources or frames. Use the [review handoff workflow](docs/design-toolkit.md#review-handoff) to generate live preview links and PNGs.
- Design assets follow [the asset rules](docs/asset-rules.md), which take precedence over conflicting local guidance.
  Use [the design toolkit](docs/design-toolkit.md) for source format and [ADG design](docs/design.md) for current ownership,
  mappings and approval routing. Codex proposes and implements; the delegating Claude conversation reviews the completed
  report after the Codex turn ends. Do not dispatch ARC Agents or answer their permission requests. Built-in Codex subagents are allowed. The controller may release
  a structure-only batch when every affected frame is pixel-identical in both themes and nothing remains undecided.
  The user approves visual differences or unresolved choices in the gallery.
- Keep camera input independent of page component rendering. Measure changes affecting rendering, input, loading, or file refresh with the existing benchmark and the same asset snapshot.
- Use `tooling/compare.mjs` for reproducible performance comparisons. Retain raw output locally under `output/`; do not publish copied acceptance assets in the npm package.
- Publish `@whzxc/agent-design-gallery` to the public npm registry. Include only the CLI, server, browser files, toolkit runtime and types, README, and license in the package.
- MUST update the maintainer's global ADG installation after each completed milestone commit that changes the installed runtime or dependencies, once the relevant checks and required design approvals pass. Follow [local updates](docs/local-updates.md), resolve the serving host and public endpoint through MAP, restart the hub when required, and verify the served runtime and viewer. This is part of milestone delivery; no additional update request is needed. Skip documentation-only, test-only and fixture-only commits. Public npm publication follows the release scope separately.
- Use English maintainer documentation and Conventional Commits. Preserve unrelated files and changes.
