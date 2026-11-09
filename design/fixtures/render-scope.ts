import navigation from './navigation.json';

const options = [
  { label: 'Components' }, { label: 'Modules' }, { label: 'Surfaces' },
  { label: 'All designs', divider: true },
];
const groups = [
  { form: 'group', label: 'Agents & quota', meta: '4', icon: 'chevron-right' },
  { form: 'group', label: 'Tasks & interactions', meta: '3', icon: 'chevron-right' },
  { form: 'group', label: 'Connections & MCP', meta: '2', icon: 'chevron-right' },
  { form: 'group', label: 'components', meta: '14', icon: 'chevron-right' },
];
const assets = navigation['canvas-components'].rows.filter(row => row.form.startsWith('item'))
  .map(row => ({ ...row, form: 'item' }));
const scope = (label: string) => ({
  label,
  options: options.some(option => option.label === label) ? options : [{ label }, ...options.map((option, i) =>
    i === 0 ? { ...option, divider: true } : option)],
});
const layerRows = [
  { form: 'group', label: 'Essentials', meta: '8', icon: 'chevron-down' },
  ...assets,
  ...groups,
];
const shared = { directory: navigation['canvas-components'].directory, height: 876 };
export const scopeNavigation = {
  layer: { ...shared, scope: scope('Components'), rows: layerRows, scopedIndent: 20 },
  group: { ...shared, scope: scope('Essentials'), rows: assets },
  asset: {
    ...shared, scope: scope('field'),
    rows: ['default', 'error'].map(label => ({ form: 'item', label, icon: 'app-window' })),
  },
};
export const scopeSpecimens = [
  {
    name: 'scope-picker-open',
    navigation: { ...scopeNavigation.layer, scopeOpen: true },
  },
  {
    name: 'scope-group-action',
    navigation: { ...scopeNavigation.layer, scopeAction: 'Essentials' },
  },
  {
    name: 'scope-asset-action',
    navigation: { ...scopeNavigation.group, scopeAction: 'field' },
  },
];
export const scopeFrames = [
  { name: 'scope-layer', key: 'layer', navigation: scopeNavigation.layer },
  { name: 'scope-group', key: 'group', navigation: scopeNavigation.group },
  { name: 'scope-asset', key: 'asset', navigation: scopeNavigation.asset },
] as const;
