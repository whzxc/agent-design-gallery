import { Frame } from 'sdg';
import { Screen } from '../components/canvas';
import { scenes } from '../scenes/canvas';

const frames = [
  {
    "name": "components",
    "width": 1440,
    "height": 900,
    "fixture": "sample-components",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "0 0"
    },
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "search": false,
        "rows": [
          {
            "form": "root",
            "label": "All designs",
            "meta": "25",
            "icon": "layout-grid"
          },
          {
            "form": "group",
            "label": "Essentials",
            "meta": "8",
            "icon": "chevron-down"
          },
          {
            "form": "item",
            "label": "button",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "icon-button",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "switch",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "search",
            "icon": "component"
          },
          {
            "form": "item-selected",
            "label": "field",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "tag",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "card",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "single-choice",
            "icon": "component"
          },
          {
            "form": "group",
            "label": "Agents & quota",
            "meta": "6",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Tasks & interactions",
            "meta": "5",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Connections & MCP",
            "meta": "6",
            "icon": "chevron-right"
          }
        ],
        "height": 876
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": null
      },
      {
        "left": 719,
        "top": 840,
        "kind": "zoom",
        "label": "46%",
        "active": false
      }
    ]
  },
  {
    "name": "zoomed",
    "width": 1440,
    "height": 900,
    "fixture": "sample-zoomed",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "0 0"
    },
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "search": false,
        "rows": [
          {
            "form": "root",
            "label": "All designs",
            "meta": "25",
            "icon": "layout-grid"
          },
          {
            "form": "group",
            "label": "Essentials",
            "meta": "8",
            "icon": "chevron-down"
          },
          {
            "form": "item",
            "label": "button",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "icon-button",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "switch",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "search",
            "icon": "component"
          },
          {
            "form": "item-selected",
            "label": "field",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "tag",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "card",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "single-choice",
            "icon": "component"
          },
          {
            "form": "group",
            "label": "Agents & quota",
            "meta": "6",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Tasks & interactions",
            "meta": "5",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Connections & MCP",
            "meta": "6",
            "icon": "chevron-right"
          }
        ],
        "height": 876
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": null
      },
      {
        "left": 716,
        "top": 840,
        "kind": "zoom",
        "label": "100%",
        "active": false
      },
      {
        "left": 1228,
        "top": 752,
        "kind": "minimap"
      }
    ]
  },
  {
    "name": "surfaces",
    "width": 1440,
    "height": 900,
    "fixture": "sample-surfaces",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "0 0"
    },
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "search": false,
        "rows": [
          {
            "form": "root",
            "label": "All designs",
            "meta": "25",
            "icon": "layout-grid"
          },
          {
            "form": "group",
            "label": "Essentials",
            "meta": "8",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Agents & quota",
            "meta": "6",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Tasks & interactions",
            "meta": "5",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "Connections & MCP",
            "meta": "6",
            "icon": "chevron-down"
          },
          {
            "form": "item",
            "label": "copy-field",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "setup-choice",
            "icon": "component"
          },
          {
            "form": "item-selected",
            "label": "mcp-hub",
            "icon": "app-window"
          },
          {
            "form": "item",
            "label": "connections",
            "icon": "app-window"
          },
          {
            "form": "item",
            "label": "relay-hosting",
            "icon": "app-window"
          },
          {
            "form": "item",
            "label": "platforms",
            "icon": "app-window"
          }
        ],
        "height": 876
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": null
      },
      {
        "left": 719,
        "top": 840,
        "kind": "zoom",
        "label": "30%",
        "active": false
      }
    ]
  },
  {
    "name": "overview",
    "width": 1440,
    "height": 900,
    "fixture": "sample-overview",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "0 0"
    },
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "app",
        "empty": false
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": null
      },
      {
        "left": 585,
        "top": 840,
        "kind": "zoom",
        "label": "16%",
        "active": false
      }
    ]
  }
] as const;

export default () => frames.map(({ chrome, ...frame }) =>
  <Frame {...frame}><Screen width={frame.width} height={frame.height} scene={scenes[frame.name]} chrome={chrome} /></Frame>
);
