import { Frame, Icon } from 'sdg';
import { Field } from '../components/field';
import { Panel } from '../components/panel';
import { MenuItem } from '../components/menu-item';
import { IconButton } from '../components/icon-button';
import { AppBar } from './view-controls';
import { projects, instances, hubCopy as copy, switcherFrames, hubNotes } from '../fixtures/hub';

export function ProjectPicker({ current, kind, open = false, width = 220 }: any) {
  return <div class={open ? 'rounded-field outline outline-accent -outline-offset-1' : ''}
    aria-expanded={open ? 'true' : 'false'} aria-label={current.name}>
    <Field form="picker" label={current.name} icon={kind === 'instance' ? 'radio' : 'folder'} width={width} />
  </div>;
}

export function SwitcherRow({ item, current, kind }: any) {
  const disabled = item.incompatible || item.unavailable;
  const selected = item.id === current.id;
  const closeable = kind === 'instance' && item.stoppable;
  const detail = item.incompatible || item.unavailable || (kind === 'instance' ? `:${item.port} · ${item.path}` : item.path);
  const content = <>
    <Icon name={kind === 'instance' ? 'radio' : 'folder'} size={16} class="shrink-0 text-text-secondary" />
    <span class="flex min-w-0 flex-1 flex-col gap-1">
      <span class="truncate text-body font-[550]">{item.name}</span>
      <span class={`truncate text-meta ${disabled ? 'text-danger' : 'text-text-secondary'}`} title={detail}>{detail}</span>
    </span>
    {selected && <Icon name="check" size={14} class="shrink-0" />}
    {disabled && <Icon name="circle-alert" size={14} class="shrink-0 text-danger" />}
  </>;
  const classes = `flex min-w-0 flex-1 items-center gap-3 rounded-row px-[10px] py-3
    ${selected && !closeable ? 'bg-surface-sunken' : ''}`;
  const row = disabled ? <div class={classes} aria-disabled="true">{content}</div>
    : <a class={classes} href={`/${kind === 'instance' ? 'i' : 'p'}/${item.id}/`}>{content}</a>;
  const actionLabel = `${copy.closeInstance}: ${item.name} (:${item.port})`;
  return closeable ? <div class={`flex items-center gap-1 rounded-row pr-[6px] ${selected ? 'bg-surface-sunken' : ''}`}>
    {row}<div role="button" aria-label={actionLabel} title={actionLabel}><IconButton icon="x" /></div>
  </div> : row;
}

export function SwitcherMenu({ current, search = false, width = 360 }: any) {
  return <Panel form="menu" width={width}>
    <div class="flex flex-col gap-1 p-[6px]">
      <a href="/" class="flex items-center pr-[10px]">
        <span class="flex-1"><MenuItem label={copy.home} /></span>
        <Icon name="arrow-up-left" size={14} class="text-text-tertiary" />
      </a>
      <div class="h-px bg-border my-1" />
      <div class="px-1 pb-1">
        <Field form={search ? 'search-active' : 'search'} label={search ? copy.query : copy.search} meta="" width={width - 20} />
      </div>
      {!search && <>
        <MenuItem form="label" label={copy.projects} />
        {projects.map(item => <SwitcherRow item={item} current={current} kind="project" />)}
        <div class="h-px bg-border my-1" />
      </>}
      <MenuItem form="label" label={copy.live} />
      {(search ? instances.slice(0, 1) : instances).map(item => <SwitcherRow item={item} current={current} kind="instance" />)}
    </div>
  </Panel>;
}

export function Switcher({ current, kind, open = false, search = false, narrow = false }: any) {
  return <div class="flex flex-col items-start gap-[6px]">
    <AppBar picker={<ProjectPicker current={current} kind={kind} open={open} width={narrow ? 220 : 240} />} />
    {open && <div class={narrow ? '' : 'ml-[94px]'}>
      <SwitcherMenu current={current} search={search} width={narrow ? 366 : 360} />
    </div>}
  </div>;
}

export default () => switcherFrames.map(({ name, ...state }) => <Frame name={name} note={hubNotes.switcher}>
  <div class="bg-canvas p-6"><Switcher {...state} /></div>
</Frame>);
