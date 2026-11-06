import image0 from "../art/arc-previews/arc-dark-components-button.svg?url";
import image1 from "../art/arc-previews/arc-dark-components-field.svg?url";
import image2 from "../art/arc-previews/arc-dark-components-icon-button.svg?url";
import image3 from "../art/arc-previews/arc-dark-components-switch.svg?url";
import image4 from "../art/arc-previews/arc-dark-components-tag.svg?url";
import image5 from "../art/arc-previews/arc-dark-surfaces-mcp-hub.svg?url";
import image6 from "../art/arc-previews/arc-light-components-button.svg?url";
import image7 from "../art/arc-previews/arc-light-components-field.svg?url";
import image8 from "../art/arc-previews/arc-light-components-icon-button.svg?url";
import image9 from "../art/arc-previews/arc-light-components-switch.svg?url";
import image10 from "../art/arc-previews/arc-light-components-tag.svg?url";
import image11 from "../art/arc-previews/arc-light-surfaces-mcp-hub.svg?url";

export const scenes = {
  "frame": [
    {
      "at": [-445.5, -287.8],
      "size": [2836.2, 1827.1],
      "kind": "section",
      "children": [
        {
          "at": [45.3, 411.8],
          "size": [2196.5, 668.0],
          "kind": "asset",
          "outline": false,
          "children": [
            {
              "at": [0.0, 0.0],
              "size": [702.0, 491.1],
              "kind": "asset",
              "preview": {
                "crop": "57.4 79.4 989.2 691.2",
                "size": [1104.0, 2328.0],
                "light": image11,
                "dark": image5
              }
            },
            {
              "at": [747.3, 0.0],
              "size": [702.0, 668.0],
              "kind": "asset",
              "selected": true,
              "preview": {
                "crop": "57.4 819.4 989.2 941.2",
                "size": [1104.0, 2328.0],
                "light": image11,
                "dark": image5
              },
              "labels": [
                [0.0, -12.0, "selected-frame", "failed"]
              ]
            },
            {
              "at": [1494.5, 0.0],
              "size": [702.0, 328.3],
              "kind": "asset",
              "preview": {
                "crop": "57.4 1809.4 989.2 461.2",
                "size": [1104.0, 2328.0],
                "light": image11,
                "dark": image5
              },
              "labels": [
                [0.0, -12.0, "form", "empty"]
              ]
            }
          ]
        },
        {
          "at": [45.3, 1221.4],
          "size": [560.4, 164.2],
          "kind": "asset",
          "outline": false
        },
        {
          "at": [651.0, 1221.4],
          "size": [1449.2, 560.4],
          "kind": "asset",
          "outline": false
        }
      ]
    }
  ],
  "component": [
    {
      "at": [228.6, 269.3],
      "size": [2530.6, 1935.0],
      "kind": "section",
      "children": [
        {
          "at": [80.0, 130.0],
          "size": [778.8, 117.5],
          "kind": "asset",
          "selected": true,
          "preview": {
            "crop": "16.8 26.8 621.4 92.4",
            "size": [655.0, 136.0],
            "light": image6,
            "dark": image0
          },
          "labels": [
            [0.0, -12.0, "selected-set", "button"],
            [42.8, -12.0, "count", "5 forms"],
            [30.0, 35.5, "form", "primary"],
            [218.8, 35.5, "form", "secondary"],
            [391.3, 35.5, "form", "ghost"],
            [503.8, 35.5, "form", "danger"],
            [616.3, 35.5, "form", "pending"]
          ]
        },
        {
          "at": [938.8, 130.0],
          "size": [180.0, 117.5],
          "kind": "asset",
          "preview": {
            "crop": "16.8 26.8 142.4 92.4",
            "size": [320.0, 156.0],
            "light": image8,
            "dark": image2
          },
          "labels": [
            [30.0, 35.5, "form", "regular"],
            [112.5, 35.5, "form", "compact"],
            [0.0, -12.0, "set", "icon-button"],
            [74.9, -12.0, "count", "2 forms"]
          ]
        },
        {
          "at": [1198.8, 130.0],
          "size": [210.0, 107.5],
          "kind": "asset",
          "preview": {
            "crop": "16.8 26.8 166.4 84.4",
            "size": [200.0, 128.0],
            "light": image9,
            "dark": image3
          }
        },
        {
          "at": [80.0, 387.5],
          "size": [799.4, 181.9],
          "kind": "asset",
          "preview": {
            "crop": "16.8 26.8 637.9 143.9",
            "size": [672.0, 188.0],
            "light": image7,
            "dark": image1
          },
          "labels": [
            [0.0, -12.0, "set", "field"],
            [31.1, -12.0, "count", "2 forms"],
            [30.0, 35.5, "form", "default"],
            [418.8, 35.5, "form", "error"]
          ]
        },
        {
          "at": [959.4, 387.5],
          "size": [651.3, 255.0],
          "kind": "asset",
          "preview": {
            "crop": "16.8 26.8 519.4 202.4",
            "size": [553.0, 246.0],
            "light": image10,
            "dark": image4
          },
          "labels": [
            [0.0, -12.0, "set", "tag"],
            [24.4, -12.0, "count", "5 forms"]
          ]
        }
      ]
    }
  ]
};
