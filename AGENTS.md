# Development

- Keep a standalone ephemeral viewer (`adg open`) and a resident multi-project hub (`adg serve`) behind one global `adg` CLI. The ephemeral viewer never depends on the hub. Projects own their TSX design sources, tokens, artwork, optional `gallery.json`, optional `adg.config.mjs`, `.js` or `.ts`, and Git history; they do not depend on the package.
- Preserve the ARC MIT attribution. Do not depend on ARC runtime code or a personal checkout at runtime.
- Report design asset changes with links to the changed sources or frames. Use the [review handoff workflow](docs/design-toolkit.md#review-handoff) to generate live preview links and PNGs.
- Design assets follow [the asset rules](docs/asset-rules.md), which take precedence over conflicting local guidance.
  Use [the design toolkit](docs/design-toolkit.md) for source format and [ADG design](docs/design.md) for current ownership,
  mappings and approval routing. Each task is one end-to-end Codex round: implement, self-check, commit and push, then show the user the running
  result. The user judges that result; a deviation becomes the next round. Layout and behavior changes are implemented
  directly and the design sources are synced after the user accepts the result. Only a new visual direction is drawn
  in the design sources first. The push gate is `npm test` plus the tests of affected fixtures. Do not dispatch ARC
  Agents or answer their permission requests. Built-in Codex subagents are allowed.
- Keep camera input independent of page component rendering.
- `tooling/compare.mjs` is a reporting tool, not a gate. Run it when a change claims to be a pure refactor or targets performance. Retain raw output locally under `output/`; do not publish copied acceptance assets in the npm package.
- Publish `@whzxc/agent-design-gallery` to the public npm registry only when the user asks. Include only the CLI, server, browser files, toolkit runtime and types, README, and license in the package.
- MUST update the maintainer's global ADG installation after each completed task that changes the installed runtime or dependencies, once the push gate passes. Install the packed local tarball; npm publication is not needed for this. Follow [local updates](docs/local-updates.md), resolve the serving host and public endpoint through MAP, restart the hub when required, and verify the served runtime and viewer. This is part of task delivery; no additional update request is needed. Skip documentation-only, test-only and fixture-only commits. Public npm publication happens only on request.
- Use English maintainer documentation and Conventional Commits. Preserve unrelated files and changes.
