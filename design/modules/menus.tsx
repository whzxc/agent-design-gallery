import { Frame } from 'sdg';
import { Drawing } from './canvas';
import { Screen } from '../components/canvas';
import { Tools, ZoomBar } from './view-controls';
import menuFixtures from '../fixtures/menus.json';
import { scenes } from '../scenes/menus';
import { Panel } from '../components/panel';
import { MenuItem } from '../components/menu-item';
export function Menu({ rows, width = 220 }: any) {
  return (
    <Panel form="menu" width={width}>
      <div class="p-[6px]">
        {rows.map((row: any, i: number) => (
          <>
            {i > 0 && (row.form === 'label' || row.divider) && <div class="h-px bg-border my-1 mx-[2px]" />}
            <MenuItem {...row} />
          </>
        ))}
      </div>
    </Panel>
  );
}
const frames = [
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

export default () => [
  <Frame name="default">
    <Menu {...menuFixtures.default} />
  </Frame>,
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        {chrome.map(({ kind, left, top, menu, ...props }: any) => {
          const Component = kind === 'menu' ? Menu : kind === 'tools' ? Tools : ZoomBar;
          return (
            <div class="absolute" style={{ left, top }}>
              <Component {...(kind === 'menu' ? menuFixtures[menu] : props)} />
            </div>
          );
        })}
      </Screen>
    </Frame>
  )),
];
