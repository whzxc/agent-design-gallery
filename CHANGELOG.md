# Changelog

## 0.5.0

- Default source discovery includes components, modules and surfaces; studies join only when a direct study TSX exists. Explicit source lists retain their directories and order.
- Establish toolkit-wide design asset rules and an adoption guide with a read-only audit checklist, finding format, review batches and consumer-owned documentation.
- Scaffold a working component/module/surface composition, fixture data, tokens and artwork directory in a fresh library. Existing libraries keep their sources without added demo assets.
- Check import direction using the configured source order. `check.importDirection: false` disables only that lint; studies are exempt.
- Add `sdg check --read-only` to skip generated declarations and build files during audits.
