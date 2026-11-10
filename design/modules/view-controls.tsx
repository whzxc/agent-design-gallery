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

export function ViewerTools({ detailsOpen = false, inspectorDisabled = false, menu }: {
  detailsOpen?: boolean;
  inspectorDisabled?: boolean;
  menu?: unknown;
}) {
  return <Toolbar>
    <div class="relative">
      <div role="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu ? 'true' : 'false'}>
        <IconButton icon="ellipsis" form={menu ? 'active' : 'default'} />
      </div>
      {menu && <div class="absolute right-0 top-full mt-[14px]">{menu}</div>}
    </div>
    <div role="button" aria-label="Inspector" aria-expanded={detailsOpen ? 'true' : 'false'} aria-disabled={inspectorDisabled}>
      <IconButton icon="panel-right" form={detailsOpen ? 'active' : 'default'} disabled={inspectorDisabled} />
    </div>
  </Toolbar>;
}

export function ViewerBars({ project, scopes, search, contentsOpen, detailsOpen, inspectorDisabled }: {
  project: unknown;
  scopes: unknown;
  search: unknown;
  contentsOpen?: boolean;
  detailsOpen?: boolean;
  inspectorDisabled?: boolean;
}) {
  return <header class="flex items-start justify-between gap-3">
    <Toolbar wide>
      <div role="button" aria-label="Contents" aria-expanded={contentsOpen ? 'true' : 'false'}>
        <IconButton icon="panel-left" form={contentsOpen ? 'active' : 'default'} />
      </div>
      {project}
      <Separator />
      {scopes}
      <Separator />
      {search}
    </Toolbar>
    <ViewerTools detailsOpen={detailsOpen} inspectorDisabled={inspectorDisabled} />
  </header>;
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
