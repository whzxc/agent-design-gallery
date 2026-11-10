import { scopeNavigation } from './render-scope';
import inspectorFixtures from './inspector.json';
import menuFixtures from './menus.json';

export const viewerBarScopes = scopeNavigation.layer.scope.options.toSorted(
  (a, b) => Number(a.label !== 'Tokens') - Number(b.label !== 'Tokens'),
);
export const viewerBarProject = { name: scopeNavigation.layer.directory };
const [arrange, shortcuts] = menuFixtures.more.rows;
export const viewerBarMore = {
  width: menuFixtures.more.width,
  rows: [
    { form: 'item', label: 'Fullscreen' },
    ...menuFixtures.display.rows,
    { ...arrange, divider: true },
    shortcuts,
  ],
};

const button = inspectorFixtures['capture-component'];
export const viewerBarDetails = {
  ...button,
  rows: button.rows.map(row => ({ ...row, form: 'item' })),
  usedBy: [{ directory: 'components', entries: ['card', 'notice', 'prompt', 'request-routing'].map(name => ({ name })) }],
};
export const viewerBarContents = {
  rows: scopeNavigation.layer.rows.map(row => row.label === button.title ? { ...row, form: 'item-selected' } : row),
  scopedIndent: scopeNavigation.layer.scopedIndent,
};
export const viewerBarFrames = [
  { name: 'top-bars', fixture: 'viewer-top-bars', scope: 'Components', panels: false },
  { name: 'top-bars-panels', fixture: 'viewer-top-bars-panels', scope: 'Components', panels: true },
] as const;
