import { Frame } from 'sdg';
import { Screen } from '../components/canvas';

const frames = [
  {
    "name": "display",
    "width": 420,
    "height": 400,
    "fixture": "menu-display",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "1020 0"
    },
    "chrome": [
      {
        "left": 256,
        "top": 12,
        "kind": "tools",
        "active": "sun-moon"
      },
      {
        "left": 188,
        "top": 62,
        "kind": "menu",
        "width": 220,
        "rows": [
          {
            "form": "label",
            "label": "Theme"
          },
          {
            "form": "check",
            "label": "System",
            "icon": "check"
          },
          {
            "form": "option",
            "label": "Light"
          },
          {
            "form": "option",
            "label": "Dark"
          },
          {
            "form": "label",
            "label": "Canvas"
          },
          {
            "form": "check",
            "label": "Match theme",
            "icon": "check"
          },
          {
            "form": "option",
            "label": "Light"
          },
          {
            "form": "option",
            "label": "Dark"
          },
          {
            "form": "option",
            "label": "Neutral"
          }
        ]
      }
    ]
  },
  {
    "name": "zoom",
    "width": 420,
    "height": 310,
    "fixture": "menu-zoom",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "646 590"
    },
    "chrome": [
      {
        "left": 73,
        "top": 250,
        "kind": "zoom",
        "label": "48%",
        "active": true
      },
      {
        "left": 92,
        "top": 101,
        "kind": "menu",
        "width": 200,
        "rows": [
          {
            "form": "item",
            "label": "Fit all",
            "meta": "0"
          },
          {
            "form": "item-active",
            "label": "Fit group"
          },
          {
            "form": "item",
            "label": "Fit selection"
          },
          {
            "form": "item",
            "label": "Zoom to 100%",
            "divider": true,
            "meta": "1"
          }
        ]
      }
    ]
  },
  {
    "name": "more",
    "width": 420,
    "height": 180,
    "fixture": "menu-more",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "1020 0"
    },
    "chrome": [
      {
        "left": 256,
        "top": 12,
        "kind": "tools",
        "active": "ellipsis"
      },
      {
        "left": 168,
        "top": 62,
        "kind": "menu",
        "width": 240,
        "rows": [
          {
            "form": "item",
            "label": "Arrange current group"
          },
          {
            "form": "item",
            "label": "Keyboard shortcuts",
            "meta": "?"
          }
        ]
      }
    ]
  },
  {
    "name": "search",
    "width": 284,
    "height": 272,
    "fixture": "sidebar-search",
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
        "search": true,
        "rows": [
          {
            "form": "item-selected",
            "label": "state-pill",
            "meta": "5 forms",
            "icon": "component"
          },
          {
            "form": "item",
            "label": "single-choice · pills",
            "meta": "form",
            "icon": "component"
          }
        ],
        "height": 248
      }
    ]
  },
  {
    "name": "tooltip",
    "width": 420,
    "height": 120,
    "fixture": "tooltip-inspector",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "1020 0"
    },
    "chrome": [
      {
        "left": 256,
        "top": 12,
        "kind": "tools",
        "active": null
      },
      {
        "left": 279,
        "top": 62,
        "kind": "tooltip",
        "label": "Inspector"
      }
    ]
  },
  {
    "name": "shortcuts",
    "width": 480,
    "height": 374,
    "fixture": "dialog-shortcuts",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "480 263"
    },
    "chrome": [
      {
        "left": 50,
        "top": 30,
        "kind": "shortcuts"
      }
    ]
  }
] as const;

export default () => frames.map(({ chrome, ...frame }) =>
  <Frame {...frame}><Screen width={frame.width} height={frame.height} chrome={chrome} /></Frame>
);
