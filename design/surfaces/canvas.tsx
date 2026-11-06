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
        "active": null
      },
      {
        "left": 718,
        "top": 840,
        "kind": "zoom",
        "label": "49%",
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
        "active": null
      },
      {
        "left": 715,
        "top": 840,
        "kind": "zoom",
        "label": "100%",
        "active": false
      },
      {
        "left": 1228,
        "top": 752,
        "kind": "minimap",
        "boxes": [
          [
            23.954386430231395,
            16.000000000000007,
            20.53147418409619,
            14.893402041022531
          ],
          [
            49.33581514600385,
            16.000000000000007,
            21.90562796807113,
            15.398605638072143
          ],
          [
            76.09139764575124,
            16.000000000000007,
            27.36182681620693,
            24.694351823784984
          ],
          [
            108.30317899363445,
            16.000000000000007,
            38.47630595129837,
            24.653935536021013
          ],
          [
            151.6294394766091,
            16.000000000000007,
            24.41617409315954,
            16.782863493988074
          ],
          [
            23.954386430231395,
            45.54430635546126,
            106.8606648479337,
            70.45569364453874
          ]
        ],
        "viewport": [
          23.954386430231395,
          15.8787511367081,
          11.356976861675255,
          7.234515509750429
        ]
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
        "active": null
      },
      {
        "left": 718,
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
        "left": 587,
        "top": 840,
        "kind": "zoom",
        "label": "7%",
        "active": false
      }
    ]
  }
] as const;

export default () => frames.map(({ chrome, ...frame }) =>
  <Frame {...frame}><Screen width={frame.width} height={frame.height} scene={scenes[frame.name]} chrome={chrome} /></Frame>
);
