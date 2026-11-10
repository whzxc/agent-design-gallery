export const frames = [
  {
    "name": "empty",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "app",
        "empty": true
      },
      {
        "left": 500,
        "top": 270,
        "kind": "dialog",
        "directory": "empty"
      }
    ]
  },
  {
    "name": "dialog",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
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
        "left": 583,
        "top": 840,
        "kind": "zoom",
        "label": "10%",
        "active": false,
        "backDisabled": true,
        "minimapPressed": false
      },
      {
        "kind": "scrim"
      },
      {
        "left": 500,
        "top": 270,
        "kind": "dialog",
        "directory": "dialog"
      }
    ]
  },
  {
    "name": "error",
    "width": 560,
    "height": 464,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "kind": "scrim"
      },
      {
        "left": 60,
        "top": 40,
        "kind": "dialog",
        "directory": "error"
      }
    ]
  }
] as const;
