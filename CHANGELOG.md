# Changelog

## 0.7.0 (unreleased)

- Accept global `--json` and return schema-versioned envelopes for help, version and CLI argument errors, with stable error codes and executable recovery arguments.
- Return structured JSON for `link`, `init`, `migrate` and root actions, including completed file changes and scan warnings. Classify configuration, version, discovery, token, Git and browser-launch failures at their owning boundaries while retaining human diagnostics.
- Return structured capture geometry, coded check findings and comparison results under `--json`, including observed partial results on execution failure. `check` build and frame-execution failures now exit 2 instead of 1 in human mode too; completed rule findings still exit 1. Comparison target, adapter and unsettled-measurement failures exit 2, while completed text/position differences exit 1.
- The 0.7.0 quality-gate contract uses exit 1 with `ok:false` and `data.complete:true` for completed checks or comparisons with findings, and exit 2 whenever evaluation could not complete. The exit distinction applies in human mode too.

## 0.6.0

- Rename the toolkit to Agent Design Gallery. The package is `@whzxc/agent-design-gallery`, the CLI is `adg`, project configs are `adg.config.*`, the runtime import is `adg` and generated files live in `.adg/`. Run `adg migrate [project]` once per project and `adg service migrate` once per host. Legacy configs stop with a pointer to `adg migrate`.
- Add a resident hub. `adg root add|remove|list|scan` registers project roots, `adg serve` serves an authenticated project index and proxies live viewers, and `adg service` manages it as a macOS LaunchAgent. Root scans keep failing projects listed with a fix hint and continue with the rest.
- Add Mermaid architecture sources under `arch/`. Semantic classes mark phases and experimental, temporary or gap elements. A sidecar `.md` records owners and status, and `adg check` confirms owner paths. `--base=<rev>` on `adg open`, `adg link` and `adg render` overlays added, changed and removed elements against a Git revision.
- Move viewer navigation into top bars, render designs by scope, browse project tokens, copy review links, export captures, share gallery selections and close live instances.
- Persist content-addressed builds, preview geometry and the source working set across restarts within bounded caches.
- `adg check` accounts for text clipping, opaque occlusion and control edge hits. Frame captures run isolated with bounded concurrency. Canvas sections pack densely with adaptive form wrapping.

## 0.5.0

- Default source discovery includes components, modules and surfaces; studies join only when a direct study TSX exists. Explicit source lists retain their directories and order.
- Establish toolkit-wide design asset rules and an adoption guide with a read-only audit checklist, finding format, review batches and consumer-owned documentation.
- Scaffold a working component/module/surface composition, fixture data, tokens and artwork directory in a fresh library. Existing libraries keep their sources without added demo assets.
- Check import direction using the configured source order. `check.importDirection: false` disables only that lint; studies are exempt.
- Add `adg check --read-only` to skip generated declarations and build files during audits.
