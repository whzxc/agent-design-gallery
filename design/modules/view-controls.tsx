import { Frame } from 'adg';
import { Drawing } from '../components/canvas';
import { Screen } from '../components/canvas';
import { Tooltip } from '../components/tooltip';
import viewControlFixtures from '../fixtures/view-controls.json';
import { scenes } from '../scenes/view-controls';
import { Toolbar, Separator, ViewerTools, ZoomBar } from '../components/toolbar';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
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
      <span class="text-section font-[650]">ADG</span>
      {!empty && (
        <>
          <Separator />
          {picker ?? <Field form="picker" label={directory} width={specimen ? 180 : 220} />}
        </>
      )}
    </Toolbar>
  );
}
const frames = [
  {
    "name": "tools-tooltip",
    "width": 420,
    "height": 120,
    "note": "Historical viewer layout from before the top bars.",
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
  <Frame name="tools"><ViewerTools inspectorDisabled /></Frame>,
  <Frame name="tools-comments-open"><ViewerTools inspectorDisabled commentsOpen commentCount={2} /></Frame>,
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
