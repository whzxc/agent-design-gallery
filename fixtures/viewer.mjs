// Repository-only deterministic Float states; the installed viewer has no fixtures.
const components = { theme: 'light', sidebar: true, group: 'Essentials', asset: 'components/field.svg', camera: 'group' };
const overview = { theme: 'dark', sidebar: false, camera: 'all' };
export const states = {
  'sample-components': { ...components },
  'sample-zoomed': { ...components, theme: 'dark', camera: 'origin', scale: 1, origin: [292,112], minimap: true },
  'sample-surfaces': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.svg', form: 'failed', camera: 'origin', scale: .3, origin: [292,112] },
  'sample-overview': { ...overview },
  'sample-inspect-frame': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.svg', form: 'failed', inspector: true, camera: 'selection' },
  'sample-inspect-component': { theme: 'dark', sidebar: true, group: 'Essentials', asset: 'components/button.svg', form: 'primary', inspector: true, camera: 'selection', scale: 1.25 },
  'menu-display': { ...components, themeChoice: 'system', menu: 'display-menu' },
  'menu-zoom': { ...components, scale: .48, menu: 'zoom-menu' },
  'menu-more': { ...components, menu: 'more-menu' },
  'sidebar-search': { theme: 'light', sidebar: true, group: 'Agents & quota', asset: 'components/state-pill.svg', query: 'pill', camera: 'selection' },
  'tooltip-inspector': { ...components, tooltip: true },
  'dialog-shortcuts': { ...components, dialog: 'keys' },
  'open-empty': { theme: 'light', sidebar: false, empty: true, camera: 'all', dialog: 'directories' },
  'open-dialog': { ...overview, dialog: 'directories' },
  'open-error': { ...overview, theme: 'light', dialog: 'directories', submit: '~/projects/empty' },
};
export const recent = ['~/projects/arc/design','~/projects/hub/design','~/projects/gateway/design'];
