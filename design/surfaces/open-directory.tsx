import { Frame } from 'sdg';
import { Screen } from '../components/canvas';
import { scenes } from '../scenes/open-directory';

const frames = [
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
        "error": false,
        "close": false
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
        "left": 587,
        "top": 840,
        "kind": "zoom",
        "label": "7%",
        "active": false
      },
      {
        "kind": "scrim"
      },
      {
        "left": 500,
        "top": 270,
        "kind": "dialog",
        "error": false,
        "close": true
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
        "error": true,
        "close": true
      }
    ]
  }
] as const;

export default () => frames.map(({ chrome, ...frame }) =>
  <Frame {...frame}><Screen width={frame.width} height={frame.height} scene={scenes[frame.name]} chrome={chrome} /></Frame>
);
