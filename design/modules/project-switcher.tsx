import { Frame, Icon } from 'adg';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { MenuItem } from '../components/menu-item';
import { Panel } from '../components/panel';
import { Toolbar } from '../components/toolbar';
import { hubCopy as copy, hubNotes, instances, projects, switcherFrames } from '../fixtures/hub';

export function ProjectPicker({ current, kind, open = false, width = 220 }: any) {
  return (
    <div
      class={open ? 'rounded-field outline outline-accent -outline-offset-1' : ''}
      role="button" tabindex="0" data-adg-id="picker"
      aria-expanded={open ? 'true' : 'false'}
      aria-label={current.name}
    >
      <Field form="picker" label={current.name} icon={kind === 'instance' ? 'radio' : 'folder'} width={width} />
    </div>
  );
}

function SwitcherRow({ item, current, kind }: any) {
  const disabled = item.incompatible || item.unavailable;
  const selected = item.id === current.id;
  const closeable = kind === 'instance' && item.stoppable;
  const detail =
    item.incompatible || item.unavailable || (kind === 'instance' ? `:${item.port} · ${item.path}` : item.path);
  const content = (
    <>
      <Icon name={kind === 'instance' ? 'radio' : 'folder'} size={16} class="shrink-0 text-text-secondary" />
      <span class="flex min-w-0 flex-1 flex-col gap-1">
        <span class="truncate text-body font-[550]">{item.name}</span>
        <span class={`truncate text-meta ${disabled ? 'text-danger' : 'text-text-secondary'}`} title={detail}>
          {detail}
        </span>
      </span>
      {selected && <Icon name="check" size={14} class="shrink-0" />}
      {disabled && <Icon name="circle-alert" size={14} class="shrink-0 text-danger" />}
    </>
  );
  const classes = `flex min-w-0 flex-1 items-center gap-3 rounded-row px-[10px] py-3
    ${selected && !closeable ? 'bg-surface-sunken' : ''}`;
  const row = disabled ? (
    <div class={classes} aria-disabled="true">
      {content}
    </div>
  ) : (
    <a class={classes} aria-label={item.name} data-adg-id={selected ? 'current-destination' : kind === 'instance' && item.stoppable ? 'live-instance' : undefined} href={`/${kind === 'instance' ? 'i' : 'p'}/${item.id}/`}>
      {content}
    </a>
  );
  const actionLabel = `${copy.closeInstance}: ${item.name} (:${item.port})`;
  if (!closeable) return row;
  return (
    <div class={`flex items-center gap-1 rounded-row pr-[6px] ${selected ? 'bg-surface-sunken' : ''}`}>
      {row}
      <div role="button" aria-label={actionLabel} title={actionLabel}>
        <IconButton icon="x" />
      </div>
    </div>
  );
}

export function SwitcherMenu({
  current,
  search = false,
  empty = false,
  query = 'Nova',
  width = 360,
}: {
  current: any;
  search?: boolean;
  empty?: boolean;
  query?: string;
  width?: number;
}) {
  const activeSearch = search || empty;
  const searchLabel = empty ? query : search ? copy.query : copy.search;

  return (
    <Panel form="menu" width={width}>
      <div class="flex flex-col gap-1 p-[6px]">
        <a href="/" class="flex items-center pr-[10px]">
          <span class="flex-1">
            <MenuItem key="home" label={copy.home} />
          </span>
          <Icon name="arrow-up-left" size={14} class="text-text-tertiary" />
        </a>
        <div class="my-1 h-px bg-border" />
        <div class="px-1 pb-1">
          <Field searchInput clearAnchor={empty ? 'clear-search' : undefined} form={activeSearch ? 'search-active' : 'search'} label={searchLabel} meta="" width={width - 20} />
        </div>
        <div class="flex flex-col gap-1" data-adg-id="results">
          {empty ? (
            <p class="px-[10px] py-3 text-body text-text-secondary">{copy.emptyMatch}</p>
          ) : (
            <>
              {!search && (
                <>
                  <MenuItem key="projects" form="label" label={copy.projects} />
                  {projects.map(item => (
                    <SwitcherRow key={item.id} item={item} current={current} kind="project" />
                  ))}
                  <div class="my-1 h-px bg-border" />
                </>
              )}
              <MenuItem key="instances" form="label" label={copy.live} />
              {(search ? instances.slice(0, 1) : instances).map(item => (
                <SwitcherRow key={item.id} item={item} current={current} kind="instance" />
              ))}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function Switcher({
  current,
  kind = 'project',
  open = false,
  search = false,
  empty = false,
  narrow = false,
}: any) {
  return (
    <div class="flex flex-col items-start gap-[6px]">
      <Toolbar wide>
        <IconButton icon="panel-left" label="Contents" />
        <ProjectPicker current={current} kind={kind} open={open} width={narrow ? 220 : 240} />
      </Toolbar>
      {open && (
        <div data-adg-id="menu" class={narrow ? '' : 'ml-[46px]'}>
          <SwitcherMenu current={current} search={search} empty={empty} width={narrow ? 366 : 360} />
        </div>
      )}
    </div>
  );
}

export default () =>
  switcherFrames.map(({ name, current, kind, open, search, empty }) => (
    <Frame name={name} note={hubNotes.switcher}>
      <div class="bg-canvas p-6">
        <Switcher current={current} kind={kind} open={open} search={search} empty={empty} />
      </div>
    </Frame>
  ));
