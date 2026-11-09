// Fictional registry snapshot; no filesystem or resident-server access.
export const projects = [
  {
    id: 'atlas', name: 'Atlas', path: '~/Studio/atlas/design', changed: '12 min ago', dirty: true,
    branch: 'feat/navigation', head: '7c42b1e', sources: 24, frames: 68,
  },
  {
    id: 'folio', name: 'Folio', path: '~/Studio/folio/design', changed: '3 hours ago', dirty: false,
    branch: 'main', head: 'a901d6c', sources: 16, frames: 42,
  },
  {
    id: 'orbit', name: 'Orbit', path: '~/Archive/orbit/design', changed: '2 days ago', dirty: false,
    branch: 'main', head: 'c83f902', sources: 31, frames: 86,
    incompatible: 'Requires SDG ≥0.6.0 · hub 0.5.0',
  },
];

export const instances = [
  {
    id: 'hub-review', name: 'atlas.wt/hub-review', path: '~/Studio/atlas.wt/hub-review/design',
    branch: 'design/hub-review', started: 'Started 24 min ago', port: 54734, stoppable: true,
  },
  {
    id: 'folio-review', name: 'folio.wt/review', path: '~/Studio/folio.wt/review/design',
    branch: 'fix/inspector', started: 'Started 2 hours ago', port: 4369, unavailable: 'Proxy unavailable', stoppable: false,
  },
];

export const hubCopy = {
  brand: 'SDG', projects: 'Projects', live: 'Live instances', rescan: 'Rescan', pending: 'Rescanning…',
  changed: 'Design changed', git: 'Git', designs: 'Designs', dirty: 'Uncommitted design changes',
  incompatible: 'Version incompatible', liveState: 'Live', search: 'Find project or instance…',
  home: 'All projects', emptyMatch: 'No matches', query: 'hub', closeInstance: 'Close instance',
};

export const emptyStates = [
  { name: 'no-roots', title: 'No roots registered', detail: 'Register a root in the hub configuration to list projects.' },
  { name: 'no-projects', title: 'No projects found', detail: 'No design sources found in the 2 registered roots.' },
];

export const accessStates = [
  { name: 'missing', code: '401', title: 'Key required', detail: 'This browser needs an access key.' },
  { name: 'rejected', code: '401', title: 'Key required', detail: 'The key saved in this browser was rejected.' },
];

export const homeFrames = [
  { name: 'desktop', width: 1440, height: 900, narrow: false },
  { name: 'phone', width: 390, height: 844, narrow: true },
];

export const switcherFrames = [
  { name: 'project', current: projects[0], kind: 'project', open: false, search: false },
  { name: 'instance', current: instances[0], kind: 'instance', open: false, search: false },
  { name: 'open', current: projects[0], kind: 'project', open: true, search: false },
  { name: 'search', current: instances[0], kind: 'instance', open: true, search: true },
];

export const hubNotes = {
  proposed: 'User-approved resident hub UI. Runtime implementation and compare fixtures are pending.',
  switcher: 'Search appears for 5 or more destinations. The filtered state matches names, paths and branches.',
  access: 'Hub/viewer shell state after a missing or rejected localStorage key. No key entry form.',
};
