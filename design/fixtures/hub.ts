// Fictional registry snapshot; no filesystem or resident-server access.
export const projects = [
  {
    id: 'atlas',
    name: 'Atlas',
    path: '~/Studio/atlas/design',
    changed: '12 min ago',
    dirty: true,
    branch: 'feat/navigation',
    head: '7c42b1e',
    sources: 24,
    frames: 68,
  },
  {
    id: 'folio',
    name: 'Folio',
    path: '~/Studio/folio/design',
    changed: '3 hours ago',
    dirty: false,
    branch: 'main',
    head: 'a901d6c',
    sources: 16,
    frames: 42,
  },
  {
    id: 'orbit',
    name: 'Orbit',
    path: '~/Archive/orbit/design',
    changed: '2 days ago',
    dirty: false,
    branch: 'main',
    head: 'c83f902',
    sources: 31,
    frames: 86,
    incompatible: 'Requires ADG ≥0.6.0 · hub 0.5.0',
  },
];

export const instances = [
  {
    id: 'hub-review',
    name: 'atlas.wt/hub-review',
    path: '~/Studio/atlas.wt/hub-review/design',
    detail: ':54734 · ~/Studio/atlas.wt/hub-review/design',
    branch: 'design/hub-review',
    started: 'Started 24 min ago',
    port: 54734,
    stoppable: true,
  },
  {
    id: 'folio-review',
    name: 'folio.wt/review',
    path: '~/Studio/folio.wt/review/design',
    detail: ':4369 · ~/Studio/folio.wt/review/design',
    branch: 'fix/inspector',
    started: 'Started 2 hours ago',
    port: 4369,
    unavailable: 'Proxy unavailable',
    stoppable: false,
  },
];

export function formatDesigns(sources: number, frames?: number) {
  const sourceLabel = `${sources} ${sources === 1 ? 'source' : 'sources'}`;
  if (frames === undefined) return sourceLabel;
  return `${sourceLabel} · ${frames} ${frames === 1 ? 'frame' : 'frames'}`;
}

export const hubCopy = {
  brand: 'ADG',
  projects: 'Projects',
  live: 'Live instances',
  rescan: 'Rescan',
  pending: 'Rescanning…',
  changed: 'Design changed',
  git: 'Git',
  designs: 'Designs',
  dirty: 'Uncommitted design changes',
  incompatible: 'Version incompatible',
  liveState: 'Live',
  search: 'Find project or instance…',
  home: 'All projects',
  emptyMatch: 'No matches',
  query: 'hub',
  closeInstance: 'Close instance',
};

export const emptyStates = [
  {
    name: 'no-projects',
    title: 'No projects found',
    detail: 'No design sources found in the 2 registered roots.',
    noRoots: false,
  },
  {
    name: 'no-roots',
    title: 'No roots registered',
    detail: 'Run adg root add <dir> to register a workspace.',
    noRoots: true,
  },
];

export const accessStates = [
  {
    name: 'missing',
    code: '401',
    title: 'Key required',
    detail: 'This browser needs an access key.',
    rejected: false,
  },
  {
    name: 'rejected',
    code: '401',
    title: 'Key required',
    detail: 'The key saved in this browser was rejected.',
    rejected: true,
  },
];

export const homeFrames = [
  { name: 'desktop', width: 1440, height: 900, narrow: false },
  { name: 'phone', width: 390, height: 844, narrow: true },
];

export const switcherFrames = [
  { name: 'project-picker', current: projects[0], kind: 'project' },
  { name: 'project-picker-instance', current: instances[0], kind: 'instance' },
  { name: 'switcher-open', current: projects[0], kind: 'project', open: true },
  { name: 'switcher-open-instance', current: instances[0], kind: 'instance', open: true },
  { name: 'switcher-search', current: instances[0], kind: 'instance', open: true, search: true },
  { name: 'switcher-empty', current: projects[0], kind: 'project', open: true, empty: true },
  { name: 'switcher-empty-instance', current: instances[0], kind: 'instance', open: true, empty: true },
];

export const hubNotes = {
  switcher: 'Search appears for 5 or more destinations. The filtered state matches names, paths and branches.',
  access: 'Hub and viewer 401 shell with direct access key or ?key= URL entry.',
};
