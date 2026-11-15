# ADG design

[Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

This document records ADG's visual direction, declared forms, open proposals, deliberate exceptions and remaining gaps. Machine-readable counterparts live in `design/implementation.json`; this document does not duplicate that map or maintain a status ladder.

## Direction

ADG uses the Float direction. A dotted canvas fills the window. Neutral rounded panels carry the sidebar, top toolbars, zoom controls, inspector, menus and resident hub surfaces. Selection uses a monochrome ring. Themes come from `design/tokens.css`; no separate dark frames are authored.

The review platform is macOS with system UI fonts. The primary implementation viewport is 1440 × 900, locale `en-US`, timezone `UTC`. The resident hub also declares 390 × 844 home and switcher forms. Runtime fixtures are defined by `adg.config.mjs` and `fixtures/viewer.mjs`.

## Declared forms

The library declares component forms in `design/components/`, feature forms in `design/modules/`, and full layouts in `design/surfaces/`:

- Components cover buttons, icon buttons, fields, rows, menu items, keycaps, panels, toolbars, tooltips and canvas primitives.
- Modules cover canvas presentation, navigation, inspector, menus, directory opening, shortcuts, view controls, token catalog, project switching and resident hub states.
- Surfaces cover canvas, token catalog, inspector, directory opening, resident hub home, hub switcher and access shell.
- Fixtures under `design/fixtures/` own representative content and capture records. Scenes and artwork remain supporting data.

Each source contains only distinct appearances. Width-only reflow, locale-only copies and explanatory specimens are not declared forms. Surfaces use `fixture` and `capture` metadata when they describe an implemented page or region.

## Open proposals

New visual directions are marked with `Frame proposed="<review scope>"` while review is active. Current proposals are kept in their source files and are listed by `adg check`; they are removed or bound to implementation when the review closes.

## Exceptions

- `scenes/*.ts`, fixture JSON/TS and `design/art/` are supporting data, not gallery layers.
- The repository keeps ARC-derived preview artwork under `design/art/arc-previews/`; it is repository-only and excluded from the npm package.
- ADG's compare adapter uses fictional development fixtures and temporary state; it does not represent a production account or service.

## Gaps

- Directory copy remains SVG-specific and disabled/pending submit states are not yet represented.
- Keycap radius and minimap geometry still differ from parts of the runtime CSS.
- Some inspector and canvas captures retain historical crops while runtime header and scroll geometry continue to converge.
- Hub compare fixtures remain a follow-up after the resident hub implementation settles.
