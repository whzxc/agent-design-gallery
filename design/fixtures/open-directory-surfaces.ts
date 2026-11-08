export const frames = [
  {
    "name": "empty",
    "width": 1440,
    "height": 900,
    "fixture": "open-empty",
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
    "fixture": "open-dialog",
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
    "fixture": "open-error",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "440 218"
    },
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
