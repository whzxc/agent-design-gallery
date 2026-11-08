import { Frame } from 'sdg';
import { Screen } from '../components/canvas';
import { ViewerChrome } from './canvas';
import { scenes } from '../scenes/inspector';

const frames = [
  {
    "name": "frame",
    "width": 1440,
    "height": 900,
    "fixture": "sample-inspect-frame",
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
    "fixture": "sample-inspect-component",
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

export default () =>
  frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} scene={scenes[frame.name]}>
        <ViewerChrome chrome={chrome} />
      </Screen>
    </Frame>
  ));
