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
        "navigation": "inspector-frame"
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
        "navigation": "inspector-component"
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
