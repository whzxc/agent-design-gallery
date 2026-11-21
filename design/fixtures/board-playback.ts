// Captured moments on the project switcher route.
export const playerMoments = [
  ['at-rest', 'The picker is ready for playback with Hotspots off.'],
  ['hotspots', 'Hotspots stays on across transitions. Labels sit outside their targets.'],
  ['playing', 'Opening the switcher, 64 ms into its 160 ms transition.'],
  ['paused', 'The reviewer paused at 64 ms. Focus and history still belong to the source frame.'],
  ['completed', 'The committed frame offers the next actions and retains the last transition.'],
  ['terminal', 'Navigation to the live instance picker, which has no outgoing edges.'],
  ['reduced-motion', 'The search example has settled immediately under the system motion preference.'],
  ['settings', 'One grouped speed control and a session motion override.'],
] as const;
export type PlayerMoment = typeof playerMoments[number][0];

export const nextActions = {
  picker: [
    ['Open project switcher', 'Click “Atlas”', 'Press Down Arrow', 'Press Up Arrow'],
  ],
  open: [
    ['Search for “Nova”', 'Enter “Nova” in “Find project or instance”'],
    ['Close project switcher', 'Press Esc', 'Click “Atlas”'],
    ['Open live instance','Click “atlas.wt/hub-review”'],
  ],
  empty: [
    ['Clear project search', 'Click “Clear project search”'],
    ['Close project switcher', 'Press Esc', 'Click “Atlas”'],
  ],
};

export const boardFilters = [
  ['board-play-affordance', 'All frames', 'The selected or hovered frame shows Play in its top-right corner.'],
  ['board-playable-filter', 'Playable', 'A prototype map connects the switcher frames and marks the start.'],
  ['board-frame-filters', 'All frames', 'The filter opens another board in the current scope.'],
  ['recent-updates-list', 'Recently updated', 'Git periods group frames by source, with shared inputs collapsed.'],
  ['recent-updates-on-board', 'Recently updated', 'Since my last visit, with one shared-input group expanded.'],
] as const;
export type FrameFilter = typeof boardFilters[number][1];
