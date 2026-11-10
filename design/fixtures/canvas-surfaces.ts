export const frames = [
  {
    "name": "components",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "navigation": "canvas-components"
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
        "label": "53%",
        "active": false,
        "backDisabled": false,
        "minimapPressed": false
      }
    ]
  },
  {
    "name": "zoomed",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "navigation": "canvas-zoomed"
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
        "active": false,
        "backDisabled": false,
        "minimapPressed": true
      },
      {
        "left": 1228,
        "top": 752,
        "kind": "minimap",
        "boxes": [
          [
            16.400747448612904,
            99.90110679890758,
            30.638879905131525,
            16.098893201092427
          ],
          [
            50.48939018254995,
            99.90110679890758,
            31.73781802501078,
            14.948972258157252
          ],
          [
            137.1424464568061,
            51.99252551387092,
            43.35201954865603,
            27.008768147189883
          ],
          [
            137.1424464568061,
            16,
            46.456806094581,
            32.542762685065405
          ],
          [
            137.1424464568061,
            82.45105648986632,
            32.66449259738393,
            23.472761247664224
          ],
          [
            16.400747448612904,
            16,
            117.29193617938768,
            80.45134397010206
          ]
        ],
        "viewport": [
          33.441812203536,
          97.29941066551676,
          16.156389248239183,
          10.2917924392698
        ]
      }
    ]
  },
  {
    "name": "surfaces",
    "width": 1440,
    "height": 900,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "navigation": "canvas-surfaces"
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
        "active": false,
        "backDisabled": false,
        "minimapPressed": false
      }
    ]
  },
  {
    "name": "overview",
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
      }
    ]
  }
] as const;
