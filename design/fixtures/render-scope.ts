import navigation from './navigation.json';

export const scopeTabOptions = [
  { label: 'Tokens' },
  { label: 'Components' },
  { label: 'Modules' },
  { label: 'Surfaces' },
  { label: 'All designs' },
];

export const reviewScopeTabOptions = [{ label: 'Review' }, ...scopeTabOptions];

const options = [
  { label: 'Components' },
  { label: 'Modules' },
  { label: 'Surfaces' },
  { label: 'All designs', divider: true },
  { label: 'Tokens', divider: true },
];

const layerRows = navigation.layer.rows.map(row =>
  row.form.startsWith('item') ? { ...row, form: 'item' } : row,
);

const assets = layerRows.filter(row => row.form === 'item');
const shared = { directory: 'agent-remote-control', height: 876 };

export const scopeNavigation = {
  layer: {
    ...shared,
    scope: { label: 'Components', options },
    rows: layerRows,
    scopedIndent: 20,
  },
  group: {
    ...shared,
    scope: { label: 'Essentials', options },
    rows: assets,
  },
  asset: {
    ...shared,
    scope: { label: 'field', options },
    rows: ['default', 'error'].map(label => ({ form: 'item', label, icon: 'app-window' })),
  },
};
