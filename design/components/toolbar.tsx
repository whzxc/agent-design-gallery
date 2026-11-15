import { Frame } from 'adg';
import { IconButton } from './icon-button';
import { Field } from './field';
import { Button } from './button';
import { toolbarSpecimens, toolbarSpecimenIcons } from '../fixtures/containers';

export function Separator() {
  return <div class="w-px h-5 bg-border shrink-0" />;
}

export function Toolbar({ children, wide = false }: { children?: unknown; wide?: boolean }) {
  return (
    <div
      class={`inline-flex items-center p-[6px] h-11 bg-surface rounded-panel shadow-float ${wide ? 'gap-2' : 'gap-1'}`}
    >
      {children}
    </div>
  );
}
const toolIcons = ['sun-moon', 'panel-right', 'maximize', 'ellipsis'];
export function Tools({ active }: { active?: string }) { return <Toolbar>{toolIcons.map(icon => <IconButton icon={icon} form={active === icon ? 'active' : 'default'} />)}</Toolbar>; }
export function ViewerTools({ detailsOpen = false, inspectorDisabled = false, menu }: any) { return <Toolbar><div class="relative"><div role="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu ? 'true' : 'false'}><IconButton icon="ellipsis" form={menu ? 'active' : 'default'} /></div>{menu && <div class="absolute right-0 top-full mt-[14px]">{menu}</div>}</div><div role="button" aria-label="Inspector" aria-expanded={detailsOpen ? 'true' : 'false'} aria-disabled={inspectorDisabled}><IconButton icon="panel-right" form={detailsOpen ? 'active' : 'default'} disabled={inspectorDisabled} /></div></Toolbar>; }
export function ViewerBars({ project, scopes, search, contentsOpen, detailsOpen, inspectorDisabled }: any) { return <header class="flex items-start justify-between gap-3"><Toolbar wide><div role="button" aria-label="Contents" aria-expanded={contentsOpen ? 'true' : 'false'}><IconButton icon="panel-left" form={contentsOpen ? 'active' : 'default'} /></div>{project}<Separator />{scopes}<Separator />{search}</Toolbar><ViewerTools detailsOpen={detailsOpen} inspectorDisabled={inspectorDisabled} /></header>; }
export function AppBar({ empty = false, specimen = false, directory = 'agent-remote-control', picker }: any) { return <Toolbar wide><IconButton icon="panel-left" /><span class="text-section font-[650]">ADG</span>{!empty && <><Separator />{picker ?? <Field form="picker" label={directory} width={specimen ? 180 : 220} />}</>}</Toolbar>; }
export function ZoomBar({ label = '48%', active = false, backDisabled = false, minimapPressed = false }: any) { return <Toolbar><IconButton icon="arrow-left" disabled={backDisabled} /><div class="ml-1"><Separator /></div><IconButton icon="minus" /><Button form={active ? 'zoom-open' : 'zoom'} label={label} /><IconButton icon="plus" /><Separator /><IconButton icon="scan" /><IconButton icon="map" form={minimapPressed ? 'active' : 'default'} /></Toolbar>; }

export default () => [
  ...toolbarSpecimens.map(({ name, wide }) => (
    <Frame name={name}>
      <div class="bg-canvas p-6">
        <Toolbar wide={wide}>
          {toolbarSpecimenIcons.map((icon) => (
            <IconButton icon={icon} />
          ))}
        </Toolbar>
      </div>
    </Frame>
  )),
  <Frame name="separator">
    <div class="bg-canvas p-6">
      <Separator />
    </div>
  </Frame>,
];
