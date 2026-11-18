import inspectorFixtures from './inspector.json';
import menuFixtures from './menus.json';
import navigationFixtures from './navigation.json';
import { scopeNavigation, scopeTabOptions } from './render-scope';

export const viewerBarScopes = scopeTabOptions;
export const viewerBarProject = { id: 'arc', name: scopeNavigation.layer.directory };

export const viewerBarMore = menuFixtures.more;

const button = inspectorFixtures['capture-component'];
export const viewerBarDetails = {
  ...button,
  rows: button.rows.map(row => ({ ...row, form: 'item' })),
  usedBy: [
    {
      directory: 'components',
      entries: ['card', 'notice', 'prompt', 'request-routing'].map(name => ({ name })),
    },
  ],
};

export const viewerElementInspector = inspectorFixtures.element;
export const viewerTokenContents = navigationFixtures.tokens;

export const viewerBarContents = {
  rows: scopeNavigation.layer.rows.map(row => (row.label === button.title ? { ...row, form: 'item-selected' } : row)),
  scopedIndent: scopeNavigation.layer.scopedIndent,
};

export const viewerMinimap = {
  boxes: [
    [18, 22, 76, 88],
    [106, 22, 76, 64],
  ],
  viewport: [14, 18, 84, 96],
};
