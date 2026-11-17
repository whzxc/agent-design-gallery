import { Frame, Icon } from 'adg';
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
export function ViewerTools({ detailsOpen = false, inspectorDisabled = false, menu, commentsOpen = false, commentCount = 0 }: {
  detailsOpen?: boolean; inspectorDisabled?: boolean; menu?: unknown; commentsOpen?: boolean; commentCount?: number;
}) {
  return <Toolbar>
    <button type="button" aria-label={`Comments, ${commentCount} open`} aria-expanded={commentsOpen}
      class={`flex h-(--control-size) shrink-0 items-center justify-center gap-1 rounded-row
        ${commentCount ? 'px-[6px]' : 'w-(--control-size)'}
        ${commentsOpen ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}>
      <Icon name="messages-square" />
      {commentCount > 0 && <span class="inline-grid min-h-4 min-w-4 place-items-center rounded-full bg-surface-sunken px-1 text-caption leading-none font-[650] text-text-secondary tabular-nums">{commentCount}</span>}
    </button>
    <div class="relative">
      <div role="button" aria-label="More" aria-haspopup="menu" aria-expanded={!!menu}>
        <IconButton icon="ellipsis" form={menu ? 'active' : 'default'} />
      </div>
      {menu && <div class="absolute right-0 top-full mt-[14px]">{menu}</div>}
    </div>
    <div role="button" aria-label="Inspector" aria-expanded={detailsOpen} aria-disabled={inspectorDisabled}>
      <IconButton icon="panel-right" form={detailsOpen ? 'active' : 'default'} disabled={inspectorDisabled} />
    </div>
  </Toolbar>;
}

export function ViewerBars({ project, scopes, search, contentsOpen = false, ...tools }: {
  project: unknown; scopes: unknown; search: unknown; contentsOpen?: boolean;
  detailsOpen?: boolean; inspectorDisabled?: boolean; commentsOpen?: boolean; commentCount?: number;
}) {
  return <header class="flex items-start justify-between gap-3">
    <Toolbar wide>
      <div role="button" aria-label="Contents" aria-expanded={contentsOpen}>
        <IconButton icon="panel-left" form={contentsOpen ? 'active' : 'default'} />
      </div>
      {project}<Separator />{scopes}<Separator />{search}
    </Toolbar>
    <ViewerTools {...tools} />
  </header>;
}
export function AppBar({ empty = false, specimen = false, directory = 'agent-remote-control', picker }: any) { return <Toolbar wide><IconButton icon="panel-left" /><span class="text-section font-[650]">ADG</span>{!empty && <><Separator />{picker ?? <Field form="picker" label={directory} width={specimen ? 180 : 220} />}</>}</Toolbar>; }
export function ZoomBar({
  label = '48%', active = false, backDisabled = false, minimapPressed = false, commentPressed = false,
}: { label?: string; active?: boolean; backDisabled?: boolean; minimapPressed?: boolean; commentPressed?: boolean }) {
  return <Toolbar>
    <IconButton icon="arrow-left" disabled={backDisabled} />
    <div class="ml-1"><Separator /></div>
    <IconButton icon="minus" />
    <Button form={active ? 'zoom-open' : 'zoom'} label={label} />
    <IconButton icon="plus" />
    <div class="ml-1"><Separator /></div>
    <IconButton icon="scan" />
    <IconButton icon="map" form={minimapPressed ? 'pressed' : 'default'} />
    <button type="button" aria-label="Comment" aria-pressed={commentPressed}
      class={`grid size-(--control-size) shrink-0 place-items-center rounded-row text-text-secondary ${commentPressed ? 'bg-surface-sunken' : ''}`}>
      <Icon name="message-square-plus" />
    </button>
  </Toolbar>;
}

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
