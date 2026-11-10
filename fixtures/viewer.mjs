// Repository-only deterministic Float states; the installed viewer has no fixtures.
export const assetModifiedAt = Date.UTC(2026, 10, 7, 13, 24, 8);
const components = { theme: 'light', sidebar: true, group: 'Essentials', asset: 'components/field.tsx', camera: 'group' };
const overview = { theme: 'dark', sidebar: false, camera: 'all' };
const layerScope = { theme: 'light', sidebar: true, scope: 'layer:components', group: 'Essentials', camera: 'all' };
const groupScope = { theme: 'light', sidebar: true, scope: 'group:Essentials', camera: 'all' };
const topBars = { ...layerScope, themeChoice: 'system', sidebar: false, camera: 'origin', scale: 0.2392248580020047, origin: [276.76, 556.07] };
export const states = {
  'sample-components': { ...components },
  'sample-zoomed': { ...components, theme: 'dark', camera: 'selection', scale: 1, minimap: true },
  'sample-surfaces': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', camera: 'origin', scale: .3, origin: [292,112] },
  'sample-overview': { ...overview },
  'sample-inspect-frame': { theme: 'light', sidebar: true, group: 'Connections & MCP', asset: 'surfaces/mcp-hub.tsx', form: 'failed', inspector: true, camera: 'selection' },
  'sample-inspect-component': { theme: 'dark', sidebar: true, group: 'Essentials', asset: 'components/button.tsx', form: 'primary', inspector: true, camera: 'selection', scale: 1.25 },
  'menu-zoom': { ...components, scale: .48, menu: 'zoom-menu' },
  'sidebar-search': { theme: 'light', sidebar: true, group: 'Agents & quota', asset: 'components/state-pill.tsx', query: 'pill', camera: 'selection' },
  'tooltip-inspector': { ...components, tooltip: true },
  'dialog-shortcuts': { ...components, dialog: 'keys' },
  'open-empty': { theme: 'light', sidebar: false, empty: true, camera: 'all' },
  'open-dialog': { ...overview },
  'open-error': { ...overview, theme: 'light' },
  'scope-layer': layerScope,
  'scope-group': groupScope,
  'scope-asset': { ...groupScope, scope: 'asset:components/field.tsx' },
  'tokens-light': { theme: 'light', themeChoice: 'system', sidebar: true, scope: 'tokens' },
  'viewer-top-bars': topBars,
  'viewer-top-bars-panels': { ...topBars, sidebar: true, inspector: true, asset: 'components/button.tsx', sourceOnly: true },
  'viewer-top-bars-tokens': { theme: 'light', themeChoice: 'system', sidebar: false, scope: 'tokens' },
  'viewer-top-bars-more': { ...topBars, themeChoice: 'system', origin: [-400, 556.07], menu: 'more-menu' },
  'scope-group-action': { ...layerScope, camera:'origin', scale:.24, origin:[650,140], hoverScope: 'Render only this group: Essentials' },
  'scope-asset-action': { ...groupScope, group:'Essentials', camera:'origin', scale:.53, origin:[650,140],
    hoverScope: 'Render only this asset: field' },
};
export const recent = [];
