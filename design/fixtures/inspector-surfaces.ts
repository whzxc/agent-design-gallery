export const frames = [
  {
    "name": "frame",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
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
        "active": false,
        "backDisabled": false,
        "minimapPressed": false
      },
      {
        "left": 1128,
        "top": 64,
        "kind": "inspector",
        "inspector": "frames"
      }
    ]
  },
  {
    "name": "component",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
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
        "active": false,
        "backDisabled": false,
        "minimapPressed": false
      },
      {
        "left": 1128,
        "top": 64,
        "kind": "inspector",
        "inspector": "capture-component"
      }
    ]
  }
] as const;
