// Repository-only deterministic board-view states; the installed viewer has no fixtures.
export const assetModifiedAt = Date.UTC(2026, 10, 7, 13, 24, 8);
const components = { theme: 'light', sidebar: true, group: 'Essentials', asset: 'components/field.tsx', camera: 'group' };
const overview = { theme: 'dark', sidebar: false, camera: 'all' };
const layerScope = { theme: 'light', sidebar: true, scope: 'layer:components', group: 'Essentials', camera: 'all' };
const groupScope = { theme: 'light', sidebar: true, scope: 'group:Essentials', camera: 'all' };
const topBars = { ...layerScope, themeChoice: 'system', sidebar: false, camera: 'group' };
export const states = {
  'sample-components': { ...components },
  'sample-zoomed': { ...components, theme: 'dark', camera: 'group', minimap: true },
  'sample-surfaces': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', camera: 'group' },
  'sample-overview': { ...overview },
  'sample-inspect-frame': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', inspector: true, camera: 'selection' },
  'sample-inspect-component': { theme: 'light', themeChoice: 'system', scope: 'layer:surfaces', sidebar: false, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'ready', inspector: true, minimap: true, camera: 'selection', scale: 0.48 },
  'menu-zoom': { ...components, scale: .48, menu: 'zoom-menu' },
  'sidebar-search': { theme: 'light', sidebar: true, group: 'Agents & quota', asset: 'components/state-pill.tsx', query: 'pill', camera: 'selection' },
  'tooltip-inspector': { ...components, tooltip: true },
  'dialog-shortcuts': { ...components, dialog: 'keys' },
  'scope-layer': layerScope,
  'scope-group': groupScope,
  'scope-asset': { ...groupScope, scope: 'asset:components/field.tsx' },
  'tokens-light': { theme: 'light', themeChoice: 'system', sidebar: true, scope: 'tokens' },
  'viewer-top-bars': topBars,
  'viewer-top-bars-panels': { ...topBars, sidebar: true, inspector: true, asset: 'components/button.tsx', sourceOnly: true },
  'viewer-board-comments': { ...topBars, camera: 'origin', origin: [236, 84], scale: 0.48 },
  'viewer-top-bars-tokens': { theme: 'light', themeChoice: 'system', sidebar: false, scope: 'tokens' },
  'viewer-tokens-list': { theme: 'light', themeChoice: 'system', sidebar: true, scope: 'tokens' },
  'viewer-top-bars-more': { ...topBars, themeChoice: 'system', menu: 'more-menu' },
  'scope-group-action': { ...layerScope, camera: 'group', hoverScope: 'Render only this group: Essentials' },
  'scope-asset-action': { ...groupScope, group: 'Essentials', camera: 'group',
    hoverScope: 'Render only this asset: field' },
};
export const recent = [];
