import { Frame } from 'sdg';
import { Screen } from '../components/canvas';
import { ViewerChrome } from './canvas';
import { scenes } from '../scenes/inspector';

const frames = [
  {
    "name": "frame",
    "width": 1440,
    "height": 900,
    "fixture": "sample-inspect-frame",
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
            "meta": "51",
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
          },
          {
            "form": "group",
            "label": "components",
            "meta": "14",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "surfaces",
            "meta": "12",
            "icon": "chevron-right"
          }
        ],
        "height": 876
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": "panel-right"
      },
      {
        "left": 564,
        "top": 840,
        "kind": "zoom",
        "label": "71%",
        "active": false
      },
      {
        "left": 1128,
        "top": 64,
        "kind": "inspector",
        "title": "mcp-hub",
        "path": "surfaces/mcp-hub.tsx",
        "rows": [
          {
            "form": "item",
            "label": "ready",
            "meta": "960 × 662",
            "icon": "app-window",
            "note": "The implementation uses full workspace height. Its shell follows the viewport; the older content-fit heights (662, 912 and 432px) are not capture-size requirements."
          },
          {
            "form": "item-selected",
            "label": "failed",
            "meta": "960 × 912",
            "icon": "app-window",
            "note": "The implementation uses full workspace height. Its shell follows the viewport; the older content-fit heights (662, 912 and 432px) are not capture-size requirements."
          },
          {
            "form": "item",
            "label": "empty",
            "meta": "960 × 434",
            "icon": "app-window",
            "note": "The implementation uses full workspace height. Its shell follows the viewport; the older content-fit heights (662, 912 and 432px) are not capture-size requirements."
          }
        ],
        "heading": "Frames"
      }
    ]
  },
  {
    "name": "component",
    "width": 1440,
    "height": 900,
    "fixture": "sample-inspect-component",
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
            "meta": "51",
            "icon": "layout-grid"
          },
          {
            "form": "group",
            "label": "Essentials",
            "meta": "8",
            "icon": "chevron-down"
          },
          {
            "form": "item-selected",
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
            "form": "item",
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
          },
          {
            "form": "group",
            "label": "components",
            "meta": "14",
            "icon": "chevron-right"
          },
          {
            "form": "group",
            "label": "surfaces",
            "meta": "12",
            "icon": "chevron-right"
          }
        ],
        "height": 876
      },
      {
        "left": 1276,
        "top": 12,
        "kind": "tools",
        "active": "panel-right"
      },
      {
        "left": 559,
        "top": 840,
        "kind": "zoom",
        "label": "125%",
        "active": false
      },
      {
        "left": 1128,
        "top": 64,
        "kind": "inspector",
        "title": "button",
        "path": "components/button.tsx",
        "rows": [
          {
            "form": "item-selected",
            "label": "primary",
            "meta": "119 × 34",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "secondary",
            "meta": "106 × 34",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "ghost",
            "meta": "58 × 34",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "danger",
            "meta": "58 × 34",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "pending",
            "meta": "106 × 34",
            "icon": "component"
          }
        ],
        "heading": "Forms"
      }
    ]
  }
] as const;

export default () =>
  frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} scene={scenes[frame.name]}>
        <ViewerChrome chrome={chrome} />
      </Screen>
    </Frame>
  ));
