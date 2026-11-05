# Canvas v2

Status: approved and implemented. These SVGs are the reference for content-sized collections, collapsible navigation, and frame inspection. The runtime adapts region widths and heights to the opened project's declared forms and frames.

## Review frames

1. `01-component-board.svg`: expanded sidebar and eight representative ARC components arranged in bounded, aligned preview regions at a shared 80% content scale. Headers and gutters have consistent dimensions; region widths and row heights follow their contents. The 1440 × 960 review frame shows the complete collection without squeezing the bottom row. The selection is a review fixture, not an inventory of the full ARC component library.
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

## Small-component collection

- Give each source file one clearly bounded preview region with a consistent 40 px header, aligned rows, 16 px gutters, and at least 16 px content clearance. Keep header contrast subtle and use a continuous preview background, so tiny isolated controls do not float among unrelated labels.
- Allocate wider regions to long button groups and input fields, narrower regions to icon buttons and switches, and a full row to larger container forms. These regions share alignment and chrome, not a uniform artwork size. Center compact previews within their region while preserving a common SVG content scale.
- Show compact sibling forms together. The card example places Default and Reply on the same baseline at the same scale, preserving their form names and source association.
- For a collection with a much larger form, use an explicitly identified compact preview. SingleChoice shows Pills with `1 / 5`; the form menu exposes all five forms. Choosing a form opens its inspection view. Returning restores the collection and its compact preview. The navigation-list form remains fully available without stretching every neighboring preview.
- Only declared forms may be separated or selected this way. A generic SVG with no form metadata retains its complete sheet. Never infer or silently discard arbitrary source content.
- The surface board and individual-frame inspection retain their existing compositions. Component collection chrome is used for groups of small controls; it is not imposed on every full-page surface.

## Navigation and basic controls

| Control                  | Behavior                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar toggle, top left | Completely hide/show the sidebar; remember the preference per device. Keep the world point at viewport center fixed.                                                                                        |
| Directory dropdown       | Open a directory or recent directory using the existing picker.                                                                                                                                             |
| Search / Cmd or Ctrl+F   | Search filenames and declared frame names. Enter focuses a result; Escape restores the previous camera. A collapsed sidebar opens temporarily for search and returns to its prior state when search closes. |
| Sidebar group row        | Focus the group; its chevron expands/collapses the file list.                                                                                                                                               |
| Asset selection          | One click selects; double-click or Enter focuses. Dragging pans and never also selects.                                                                                                                     |
| Back / Escape            | Restore the camera before the most recent focus action, including pan and zoom. Escape closes an open popup or inspector before navigating back.                                                            |
| All designs / Fit all    | Fit the full directory. Do not overload Escape to always reset to the whole project.                                                                                                                        |
| Zoom percentage          | Click to enter a percentage; menu provides Fit all, Fit group, Fit selection, and 100%. The percentage describes SVG units relative to CSS pixels.                                                          |
| Minus / plus             | Zoom around the viewport center. Pointer wheel/pinch remains anchored under the pointer.                                                                                                                    |
| Bottom fit icon          | Fit the current selection, or current group when nothing is selected.                                                                                                                                       |
| Theme icon               | System, Light, Dark; this controls the SVG theme as well as the viewer.                                                                                                                                     |
| Canvas background        | Dark, light, or neutral background independent of the SVG theme, for checking light/transparent artwork.                                                                                                    |
| Fullscreen icon          | Enter/exit browser fullscreen. Sidebar collapse and fullscreen remain independent.                                                                                                                          |
| Inspector icon           | Toggle file path, dimensions, explicit frames, Full sheet, Copy path, and Reveal file. No editing controls.                                                                                                 |
| Map icon                 | Toggle a small overview map for spatial navigation; hidden by default. It is an overlay the user can close and is not part of asset layout.                                                                 |
| More menu                | Arrange current group and keyboard shortcuts. Avoid persistent instructional copy on the canvas.                                                                                                            |

Copy path uses the full local source path. Reveal file opens the owning file manager. Selecting a frame changes the view only. Persist theme, sidebar state, directory camera, and inspector visibility locally; grouping and SVG content stay in the project.

## Implementation acceptance after approval

Use real ARC controls, a tall multi-frame sheet such as Setup, and a generic SVG with no frame metadata. Verify stable placement while zooming, sidebar collapse without a camera jump, collision-free labels at distant zoom, keyboard-accessible search and selection, accurate 100% scale, returning to the previous viewport, and file updates without lost focus. Include the existing cold-start, pan/zoom, theme, and file-save benchmarks; the layout change must retain the current interaction performance.
