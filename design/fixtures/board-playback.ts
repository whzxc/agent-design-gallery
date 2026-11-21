// Captured moments on the project switcher route.
export const playbackScope = 'Board playback redesign';
export const playerMoments = [
  ['at-rest', 'A click on the stage background reveals the available hotspot.'],
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
  ['board-play-affordance', 'All frames', 'Play in a specimen caption starts at that frame.'],
  ['board-playable-filter', 'Playable', 'The sidebar locates playable frames. Other specimens dim in place.'],
  ['board-frame-filters', 'All frames', 'One board filter chooses which frames to locate.'],
  ['recent-updates-list', 'Recently updated', 'Illustrative Git history. Expand an inherited cause to see its frames. Removed entries stay in the list.'],
  ['recent-updates-on-board', 'Recently updated', 'Since my last visit. Selecting switcher-open focuses the existing specimen.'],
] as const;
export type FrameFilter = typeof boardFilters[number][1];
export const playableNames = ['project-picker', 'switcher-open', 'switcher-empty'];
// A scoped example within the Modules board. The collapsed cause also reaches frames in other sections.
export const recentGroups = [
  {period:'Uncommitted', changes:[
    {subject:'Working tree', frames:[['switcher-open', 'Changed'], ['legacy-picker', 'Removed']]},
  ]},
  {period:'Today', changes:[
    {subject:'Add an empty search state', frames:[['switcher-empty', 'Added']]},
    {subject:'Adjust menu elevation', frames:[], cause:'tokens.css', affected:12},
  ]},
  {period:'Earlier this week', changes:[
    {subject:'Move the live instance picker', frames:[['project-picker-instance', 'Moved']]},
  ]},
];
