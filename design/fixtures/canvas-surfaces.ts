export const frames = [
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
        "label": "49%",
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
        "active": false,
        "backDisabled": true,
        "minimapPressed": false
      }
    ]
  }
] as const;
