import { Frame } from 'sdg';
import { Drawing } from './canvas';
import { Panel } from '../components/panel';
import { IconButton } from '../components/icon-button';
import { Kbd } from '../components/kbd';
import { Screen, Scrim } from '../components/canvas';
import { scenes } from '../scenes/shortcuts';
import shortcutFixtures from '../fixtures/shortcuts.json';
export function Shortcuts({ shortcuts = [] }: { shortcuts?: string[][][] | any[] }) {
  return (
    <Panel form="dialog" width={380}>
      <div class="px-5 pt-5 pb-3">
        <div class="flex items-center justify-between h-5">
          <h2 class="text-title font-[650] leading-5">Keyboard shortcuts</h2>
          <div class="-mr-2">
            <IconButton icon="x" />
          </div>
        </div>
        <div class="mt-6">
          {shortcuts.map(([label, keys]) => (
            <div class="flex items-start justify-between h-[34px] leading-[22px] text-body text-text-secondary">
              <span>{label}</span>
              <div class="flex gap-[6px]">
                {keys.map((label) => (
                  <Kbd label={label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

const frames = [
  {
    "name": "default",
    "width": 480,
    "height": 374,
    "fixture": "dialog-shortcuts",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "480 263"
    },
    "chrome": [
      {
        "kind": "scrim"
      },
      {
        "left": 50,
        "top": 30,
        "kind": "shortcuts"
      }
    ]
  }
] as const;

export default () =>
  frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        {chrome.map(({ kind, left, top }: any) =>
          kind === 'scrim' ? (
            <Scrim />
          ) : (
            <div class="absolute" style={{ left, top }}>
              <Shortcuts shortcuts={shortcutFixtures.items} />
            </div>
          ),
        )}
      </Screen>
    </Frame>
  ));
