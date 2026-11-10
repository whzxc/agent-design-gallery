export const frames = [
  {
    "name": "display",
    "width": 420,
    "height": 400,
    "note": "Historical viewer layout from before the top bars.",
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
    "note": "Historical viewer layout from before the top bars.",
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
    "note": "Historical viewer layout from before the top bars.",
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
