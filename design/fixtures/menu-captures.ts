export const frames = [
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
        "menu": "display"
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
        "left": 72,
        "top": 250,
        "kind": "zoom",
        "label": "48%",
        "active": true,
        "backDisabled": false,
        "minimapPressed": false
      },
      {
        "left": 92,
        "top": 101,
        "kind": "menu",
        "menu": "zoom"
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
        "menu": "more"
      }
    ]
  }
] as const;
