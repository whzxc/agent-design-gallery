// Repository-only deterministic Float states; the installed viewer has no fixtures.
export const assetModifiedAt = Date.UTC(2026, 10, 7, 13, 24, 8);
const components = { theme: 'light', sidebar: true, group: 'Essentials', asset: 'components/field.tsx', camera: 'group' };
const overview = { theme: 'dark', sidebar: false, camera: 'all' };
export const states = {
  'sample-components': { ...components },
  'sample-zoomed': { ...components, theme: 'dark', camera: 'selection', scale: 1, minimap: true },
  'sample-surfaces': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', camera: 'origin', scale: .3, origin: [292,112] },
  'sample-overview': { ...overview },
  'sample-inspect-frame': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', inspector: true, camera: 'selection' },
  'sample-inspect-component': { theme: 'dark', sidebar: true, group: 'Essentials', asset: 'components/button.tsx', form: 'primary', inspector: true, camera: 'selection', scale: 1.25 },
  'menu-display': { ...components, themeChoice: 'system', menu: 'display-menu' },
  'menu-zoom': { ...components, scale: .48, menu: 'zoom-menu' },
  'menu-more': { ...components, menu: 'more-menu' },
  'sidebar-search': { theme: 'light', sidebar: true, group: 'Agents & quota', asset: 'components/state-pill.tsx', query: 'pill', camera: 'selection' },
  'tooltip-inspector': { ...components, tooltip: true },
  'dialog-shortcuts': { ...components, dialog: 'keys' },
  'open-empty': { theme: 'light', sidebar: false, empty: true, camera: 'all' },
  'open-dialog': { ...overview },
  'open-error': { ...overview, theme: 'light' },
};
export const recent = [];
