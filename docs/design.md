# ADG design

[Asset rules](asset-rules.md) · [Design toolkit](design-toolkit.md) · [Architecture](architecture.md)

This document records ADG's visual direction, declared forms, artwork budget, open proposals, deliberate exceptions and remaining gaps. Exact implementation counterparts live in `design/implementation.json` (version 2); this document keeps no counterpart rows or status ladder.

## Direction and tokens

ADG uses the Float direction: a dotted canvas fills the window, neutral rounded panels carry floating chrome and resident hub surfaces, and selection uses a monochrome ring. Typography uses system UI fonts (`--font-ui`) and SF Mono (`--font-mono`).

`design/tokens.css` (mirrored byte-for-byte to `public/tokens.css`) defines light and dark tokens grouped under section comments (`Typography`, `Shape`, `Control sizing`, `Surfaces and borders`, `Text and accents`, `Elevation`) so the Tokens Board derives group titles directly from the stylesheet. Both themes render from the same frames.

The review platform is macOS at 1440 × 900 (`en-US`, `UTC`), plus 390 × 844 phone forms for the resident hub home and project switcher. `adg.config.mjs` requires ADG `>=0.16.0` and enables `check.strictLayers`, `check.lifecycle` and `check.strictMotion`.

## Motion adoption

Select the project switcher's `project-picker` form and choose **Play**. Its graph connects the picker, open popover and empty search result. Entering `z` in the search specimen represents the filter action. Clearing, clicking the picker again, and Escape follow the real switcher's handlers. JSX keys distinguish Home, the two section labels and the project/instance rows. Behavior bindings live beside the existing visual bindings in the v2 implementation map.

The floating Play control and dock use the existing Float controls, focus ring and surface tokens. The `viewer-tools-play`, `player-ready` and `player-paused` forms in `view-controls.tsx` document entry and playback. The viewer owns the controls and focus history. See [board playback](design-toolkit.md#board-playback).

## Layers and declared forms

Sources follow strict downward layer order (`components` → `modules` → `surfaces`) and are grouped into viewer chapters by `design/gallery.json`:

- `design/components/`: shared controls and containers (`Button`, `IconButton`, `Field`, `TreeRow`, `MenuItem`, `CommentPin`, `Canvas`, `Panel`, `Toolbar`, `Separator`, `Tooltip`).
- `design/modules/`: feature compositions and states:
  - Viewer: live Board View (`BoardChapter`, `BoardSection`, `SpecimenWell`, `Minimap`), scope tabs and contents sidebar (`ScopeTabs`, `ScopeRow`, `Contents`), top and bottom toolbars (`ViewerBars`, `ViewerTools`, `ZoomBar`), popovers (`Menu`), selection details (`Inspector`), comment composer/thread/preview/panel (`CommentComposer`, `CommentThread`, `CommentPreview`, `CommentsPanel`), keyboard shortcuts (`Shortcuts`, including `C` and `⇧C`), and token views (`TokenBoardPreview`, `TokenCatalog`).
  - Standalone review report (`ReviewHeader`, `ReviewFrameCard`, `ReviewLayout`, `ReviewZoom`).
  - Project access: resident hub picker and popover (`ProjectPicker`, `SwitcherMenu`, `Switcher`), hub home (`HubBar`, `HubHeading`, `Rescan`, `ProjectList`, `LiveInstances`, `HubEmpty`), and 401 access card (`AccessState` with inline key/`?key=` URL entry, `Unlock` submit, inline rejection error and `adg serve --print-key` hint).
- `design/surfaces/`: full layouts for `canvas`, `tokens`, `inspector`, `review`, `hub-home`, `hub-switcher` and `hub-access`, bound as whole sources with `fixture` and `capture` metadata.

## Artwork and budgets

- `design/art/adg-mark.svg`: vector brand/favicon mark (`32 × 32` viewBox, served at `/favicon.svg`), budget `<= 4 KB` (currently 317 B). Literal brand fills/strokes (`#5743AE`, `#FAF9FF`, `#DDD3FF`) are restricted to this mark.
- Retired raster preview sheets (`design/art/arc-previews/`) have been removed; board frames compose live TSX specimens directly.

## Open proposals

New visual directions carry `Frame proposed="<scope>"` while under review, are listed by `adg check`, and are either bound in `design/implementation.json` or deleted when review closes. The **Board playback redesign** scope in `design/surfaces/canvas.tsx` is open for approval before implementation. Compare `board-play-affordance` with `board-playable-filter`, then follow the `flow-*` frames. The board pair uses the same camera and specimens. A caption Play button marks each frame with outgoing edges and starts there. The existing Float Play shortcut can serve a selected frame. The shared Filter frames control offers Playable and Recently updated. Each opens a result list and dims other specimens in place. Review the picker, Git groups and focused result in the three additional board frames. See [frame filters](boards.md#frame-filters-proposed) for history and cache semantics. Keeping captions legible and the Play target usable at overview zoom matters more than packing matches into a new grid.

The player rail names the committed frame, its visited path and the available actions. During a transition the rail labels the destination's actions explicitly. Choosing one finishes the current edge before dispatch. An initial frame omits Back. A terminal frame offers its named Back action and Exit. The terminal example uses a hypothetical edge to the existing instance picker, which has no outgoing edges. Each pictured moment is static.

The transition inspector appears on the first action and stays through completion. It names the action and both endpoints beside elapsed milliseconds, duration and easing tokens. Scrubbing previews the edge without adding a history step. Back returns directly to the prior frame and clears the inspector. Reduced motion commits immediately and shows the authored timing alongside the actual 0 ms result. Replay respects the session preference. Playback settings group the three speeds into one segmented control and put the motion override below it.

Hover or keyboard focus outlines a hotspot and shows its action. Clicking unused stage space reveals all hotspots; the next action clears that reveal. A click on a hotspot invokes its click action; a target with only keyboard or text gestures offers its named actions on click. The keyboard action list remains available throughout. Exit returns focus to the caption Play button or toolbar button that opened the player.

For the filter example, propose **Search for “Nova”** on the search field. The live switcher filters as text arrives; clicking or focusing the field alone keeps its results. The proposed trigger matches the exact committed input value `Nova` in viewer-owned input, including paste. Other values never dispatch this edge. The action list can invoke the same frozen example directly. This would extend the current key-only search example; the existing v1 sidecar still uses `z`. Approve this input extension separately from the [edge label proposal](design-toolkit.md#proposed-action-labels).

## Exceptions

- `design/fixtures/` holds representative content and state data, not gallery sources.
- Standalone reports in `src/toolkit/review-document.mjs`, `diff-document.mjs`, `review-sheet.mjs` and `compare.mjs` inline their style tokens for offline viewing.
- `public/comments.css` embeds a `24 × 24` SVG `cursor: url(...)` data URI with literal `#fff` and `#1c1c1a` paint because CSS cursor images cannot resolve custom properties.
- Compare adapters in `adg.config.mjs`, `fixtures/viewer.mjs` and `fixtures/hub-compare.mjs` use fictional sample projects and temporary state directories.

## Gaps

- None currently open across declared viewer and hub surfaces.
