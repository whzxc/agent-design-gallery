// Static review moments. The terminal route illustrates an instance destination with no outgoing edges.
export const playbackScope = 'Board playback redesign';
export const playerMoments = [
  ['at-rest', 'A click on the stage background reveals the available hotspot.'],
  ['playing', 'Opening the switcher, 64 ms into its 160 ms transition.'],
  ['paused', 'The reviewer paused at 64 ms. Focus and history still belong to the source frame.'],
  ['completed', 'The committed frame offers the next actions and retains the last transition.'],
  ['terminal', 'Illustrative route to the existing instance picker, which has no outgoing edges.'],
  ['reduced-motion', 'The search example has settled immediately under the system motion preference.'],
  ['settings', 'One grouped speed control and a session motion override.'],
] as const;
export type PlayerMoment = typeof playerMoments[number][0];

export const nextActions = {
  picker: [
    ['Open project switcher', 'Click “Atlas”'],
    ['Press Down Arrow', 'On “Atlas”'],
    ['Press Up Arrow', 'On “Atlas”'],
  ],
  open: [
    ['Search for “Nova”', 'In project search'],
    ['Close project switcher', 'Click “Atlas”'],
    ['Press Esc', 'Close project switcher'],
  ],
  empty: [
    ['Clear project search', 'Show all destinations'],
    ['Close project switcher', 'Click “Atlas”'],
    ['Press Esc', 'Close project switcher'],
  ],
};
