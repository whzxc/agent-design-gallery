import { Frame } from 'sdg';
import { Drawing } from './canvas';
import { Screen } from '../components/canvas';
import { Tooltip } from '../components/tooltip';
import viewControlFixtures from '../fixtures/view-controls.json';
import { scenes } from '../scenes/view-controls';
import { Toolbar, Separator } from '../components/toolbar';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Button } from '../components/button';
const tools = ['sun-moon', 'panel-right', 'maximize', 'ellipsis'];
export function Tools({ active }: { active?: string }) {
  return (
    <Toolbar>
      {tools.map((icon) => (
        <IconButton icon={icon} form={active === icon ? 'active' : 'default'} />
      ))}
    </Toolbar>
  );
}
export function AppBar({
  empty = false,
  specimen = false,
  directory = 'agent-remote-control',
  picker,
}: {
  empty?: boolean;
  specimen?: boolean;
  directory?: string;
  picker?: unknown;
}) {
  return (
    <Toolbar wide>
      <IconButton icon="panel-left" />
      <span class="text-section font-[650]">SDG</span>
      {!empty && (
        <>
          <Separator />
          {picker ?? <Field form="picker" label={directory} width={specimen ? 180 : 220} />}
        </>
      )}
    </Toolbar>
  );
}
export function ZoomBar({
  label = '48%',
  active = false,
  backDisabled = false,
  minimapPressed = false,
}: {
  label?: string;
  active?: boolean;
  backDisabled?: boolean;
  minimapPressed?: boolean;
}) {
  return (
    <Toolbar>
      <IconButton icon="arrow-left" disabled={backDisabled} />
      <div class="ml-1">
        <Separator />
      </div>
      <IconButton icon="minus" />
      <Button form={active ? 'zoom-open' : 'zoom'} label={label} />
      <IconButton icon="plus" />
      <Separator />
      <IconButton icon="scan" />
      <IconButton icon="map" form={minimapPressed ? 'active' : 'default'} />
    </Toolbar>
  );
}
const frames = [
  {
    "name": "tools-tooltip",
    "width": 420,
    "height": 120,
    "fixture": "tooltip-inspector",
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
        "active": null
      },
      {
        "left": 279,
        "top": 62,
        "kind": "tooltip",
        "label": "Inspector"
      }
    ]
  }
] as const;

export default () => [
  <Frame name="tools">
    <Tools />
  </Frame>,
  <Frame name="app-bar">
    <AppBar {...viewControlFixtures.appBar} />
  </Frame>,
  ...viewControlFixtures.zoomBarStates.map(({ name, ...props }) => (
    <Frame name={name}>
      <ZoomBar {...props} />
    </Frame>
  )),
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        {chrome.map(({ kind, left, top, ...props }: any) => {
          const Component = kind === 'tools' ? Tools : Tooltip;
          return (
            <div class="absolute" style={{ left, top }}>
              <Component {...props} />
            </div>
          );
        })}
      </Screen>
    </Frame>
  )),
];
