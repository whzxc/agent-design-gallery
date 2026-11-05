# Canvas v2 — review draft

Status: proposed design, pending user review. These assets revise the viewer's navigation, layout and inspection experience. They do not change the installed application. The earlier `design/gallery.svg` remains the approved v1 reference until this proposal is accepted.

## Review frames

1. `01-component-board.svg`: expanded asset sidebar and eight representative ARC components at one shared 64% scale. Long strips, small controls, and large collections occupy different amounts of canvas space. The selection is a review fixture, not an inventory of the full ARC component library.
2. `02-expanded-canvas.svg`: completely collapsed sidebar; five ARC files displayed as eight explicitly declared frames/component sheets at one shared 60% scale. A tall overview panel, short empty state, and compact slider preserve their relative sizes.
3. `03-frame-inspection.svg`: one explicit panel frame at 83%, with an optional source/frame inspector. Its parent sheet and sibling frame remain accessible.

The embedded SVG content comes from the retained ARC baseline at commit `963560b2eb805910f8b6f0507a43baed1fc06359`, under ARC's MIT license. Each draft is a standalone SVG containing the real assets. Product UI remains English; the embedded fixture text retains its original language.

## Layout

- Use intrinsic SVG/frame dimensions and preserve aspect ratio. Files do not share a fixed tile width or height. A group uses one common content scale, so similar controls and text have comparable visual size.
- Pack content rectangles in stable reading order with consistent gaps. Short controls may share a row; tall panels reserve tall regions. Group bounds follow their contents. Never repack while the camera moves or the sidebar opens or closes.
- Keep filenames and frame labels in screen space at a readable size. At distant overview levels show group names first and suppress labels that collide; restore asset labels as there is room. Do not enlarge filenames with the artwork.
- Overview exposes group relationships. Group focus fits one group; frame focus fits one declared frame. The default initial overview remains available, while subsequent opens restore the saved camera. Do not promise readable body text for an entire large project in one viewport.
- Where an SVG explicitly declares frames, allow those frames to be arranged separately while keeping their file association. Never infer frames from arbitrary nested groups. A generic SVG remains one sheet.
- Use content bounds to avoid spending preview space on an empty artboard. Preserve annotations that identify forms and meaningful graphic content, include filter/shadow padding, and keep Full sheet available. Never rewrite or crop the source file. The component draft uses declared component bounds to demonstrate the proposed compact layout; annotation handling remains part of implementation review.
- A file save updates its content and dimensions without moving the camera. Preserve the selected item and keyboard focus. Retain unrelated item positions; an explicit Arrange action may compact the current group after structural changes.

## Navigation and basic controls

| Control | Proposed behavior |
| --- | --- |
| Sidebar toggle, top left | Completely hide/show the sidebar; remember the preference per device. Keep the world point at viewport center fixed. |
| Directory dropdown | Open a directory or recent directory using the existing picker. |
| Search / Cmd or Ctrl+F | Search filenames and declared frame names. Enter focuses a result; Escape restores the previous camera. A collapsed sidebar opens temporarily for search and returns to its prior state when search closes. |
| Sidebar group row | Focus the group; its chevron expands/collapses the file list. |
| Asset selection | One click selects; double-click or Enter focuses. Dragging pans and never also selects. |
| Back / Escape | Restore the camera before the most recent focus action, including pan and zoom. Escape closes an open popup or inspector before navigating back. |
| All designs / Fit all | Fit the full directory. Do not overload Escape to always reset to the whole project. |
| Zoom percentage | Click to enter a percentage; menu provides Fit all, Fit group, Fit selection, and 100%. The percentage describes SVG units relative to CSS pixels. |
| Minus / plus | Zoom around the viewport center. Pointer wheel/pinch remains anchored under the pointer. |
| Bottom fit icon | Fit the current selection, or current group when nothing is selected. |
| Theme icon | System, Light, Dark; this controls the SVG theme as well as the viewer. |
| Canvas background | Dark, light, or neutral background independent of the SVG theme, for checking light/transparent artwork. |
| Fullscreen icon | Enter/exit browser fullscreen. Sidebar collapse and fullscreen remain independent. |
| Inspector icon | Toggle file path, dimensions, explicit frames, Full sheet, Copy path, and Reveal file. No editing controls. |
| Map icon | Toggle a small overview map for spatial navigation; hidden by default. It is an overlay the user can close and is not part of asset layout. |
| More menu | Arrange current group and keyboard shortcuts. Avoid persistent instructional copy on the canvas. |

Copy path uses the full local source path. Reveal file opens the owning file manager. Selecting a frame changes the view only. Persist theme, sidebar state, directory camera, and inspector visibility locally; grouping and SVG content stay in the project.

## Implementation acceptance after approval

Use real ARC controls, a tall multi-frame sheet such as Setup, and a generic SVG with no frame metadata. Verify stable placement while zooming, sidebar collapse without a camera jump, collision-free labels at distant zoom, keyboard-accessible search and selection, accurate 100% scale, returning to the previous viewport, and file updates without lost focus. Include the existing cold-start, pan/zoom, theme, and file-save benchmarks; the layout change must retain the current interaction performance.
