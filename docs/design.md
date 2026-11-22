# ADG design

[Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

This document records ADG's visual direction, declared forms, artwork budget, open proposals, deliberate exceptions and remaining gaps. Exact implementation counterparts live in `design/implementation.json` (version 2); this document keeps no counterpart rows or status ladder.

## Direction and tokens

ADG uses the Float direction: a dotted canvas fills the window, neutral rounded panels carry floating chrome and resident hub surfaces, and selection uses a monochrome ring. Typography uses system UI fonts (`--font-ui`) and SF Mono (`--font-mono`).

`design/tokens.css` (mirrored byte-for-byte to `public/tokens.css`) defines light and dark tokens grouped under section comments (`Typography`, `Shape`, `Control sizing`, `Surfaces and borders`, `Text and accents`, `Elevation`) so the Tokens Board derives group titles directly from the stylesheet. Both themes render from the same frames.

The review platform is macOS at 1440 × 900 (`en-US`, `UTC`), plus 390 × 844 phone forms for the resident hub home and project switcher. `adg.config.mjs` requires ADG `>=0.16.0` and enables `check.strictLayers`, `check.lifecycle` and `check.strictMotion`.

## Motion adoption

The Tokens board includes live Motion specimens, parameter variants under their base, and source links for consumers. Built-in families use mapped project token roles and group unused families under Not adopted. ADG declares its shared loading spinner in `design/motion-patterns.json`.

The project switcher is the board playback pilot. The shared toolbar keeps the picker and Contents control in place across states. Its routes open the picker, filter by entering `Nova`, clear search, dismiss and follow the enabled live-instance link. Instance navigation uses the instant token. The instance picker can reopen its own switcher, dismiss it back to the instance, or select Atlas to return to the project. The `flow-*` surfaces capture these states. See [board playback](design-toolkit.md#board-playback) and [frame filters](boards.md#frame-filters).

## Layers and declared forms

Sources follow strict downward layer order (`components` → `modules` → `surfaces`) and are grouped into viewer chapters by `design/gallery.json`:

- `design/components/`: shared controls and containers (`Button`, `IconButton`, `Field`, `TreeRow`, `MenuItem`, `CommentPin`, `Canvas`, `Panel`, `Toolbar`, `Separator`, `Tooltip`).
- `design/modules/`: feature compositions and states:
  - Viewer: live Board View (`BoardChapter`, `BoardSection`, `SpecimenWell`, `Minimap`), frame filter and derived boards (`FilterPicker`, `PlayableBoard`, `RecentBoard`, `FramePlay`), scope tabs and contents sidebar (`ScopeTabs`, `ScopeRow`, `Contents`), top and bottom toolbars (`ViewerBars`, `ViewerTools`, `ZoomBar`), popovers (`Menu`), selection details (`Inspector`), comment composer/thread/preview/panel (`CommentComposer`, `CommentThread`, `CommentPreview`, `CommentsPanel`), keyboard shortcuts (`Shortcuts`, including `P`, `C` and `⇧C`), and token views (`TokenBoardPreview`, `TokenCatalog`).
  - Standalone review report (`ReviewHeader`, `ReviewFrameCard`, `ReviewMotionCard`, `ReviewLayout`, `ReviewZoom`).
  - Embedded review (`EmbedReview`, `EmbedFrameCard`, `EmbedReviewDetail`) uses a shared compact icon toolbar, stacked cards, and an enlarged inspection view for Codex and Antigravity. The Codex card exposes follow-up when the chat host provides it.
  - Project access: resident hub picker and popover (`ProjectPicker`, `SwitcherMenu`, `Switcher`), hub home (`HubBar`, `HubHeading`, `Rescan`, `ProjectList`, `LiveInstances`, `HubEmpty`), and 401 access card (`AccessState` with inline key/`?key=` URL entry, `Unlock` submit, inline rejection error and `adg serve --print-key` hint).
- `design/surfaces/`: full layouts for `canvas`, `tokens`, `inspector`, `review`, `hub-home`, `hub-switcher` and `hub-access`, bound as whole sources with `fixture` and `capture` metadata.

## Artwork and budgets

- `design/art/adg-mark.svg`: vector brand/favicon mark (`32 × 32` viewBox, served at `/favicon.svg`), budget `<= 4 KB` (currently 317 B). Literal brand fills/strokes (`#5743AE`, `#FAF9FF`, `#DDD3FF`) are restricted to this mark.
- Retired raster preview sheets (`design/art/arc-previews/`) have been removed; board frames compose live TSX specimens directly.

## Open proposals

There are no open proposals.

## Exceptions

- `design/fixtures/` holds representative content and state data, not gallery sources.
- Standalone reports in `src/toolkit/review-document.mjs`, `diff-document.mjs`, `review-sheet.mjs` and `compare.mjs` inline their style tokens for offline viewing.
- `public/comments.css` embeds a `24 × 24` SVG `cursor: url(...)` data URI with literal `#fff` and `#1c1c1a` paint because CSS cursor images cannot resolve custom properties.
- Compare adapters in `adg.config.mjs`, `fixtures/viewer.mjs` and `fixtures/hub-compare.mjs` use fictional sample projects and temporary state directories.

## Gaps

- None currently open across declared viewer and hub surfaces.
