import { Frame, Icon } from 'sdg';
import { Button } from '../components/button';
import { IconButton } from '../components/icon-button';
import { Toolbar } from '../components/toolbar';
import { projects, instances, hubCopy as copy, emptyStates, hubNotes } from '../fixtures/hub';

export function HubBar() {
  return <Toolbar><span class="px-2 text-section font-[650]">{copy.brand}</span></Toolbar>;
}

export function Rescan({ pending = false }: { pending?: boolean }) {
  return <div aria-disabled={pending ? 'true' : undefined} class={pending ? 'opacity-60' : ''}>
    <Button form="secondary" label={pending ? copy.pending : copy.rescan} icon={pending ? 'loader-circle' : 'refresh-cw'} />
  </div>;
}

export function HubHeading({ pending = false }: { pending?: boolean }) {
  return <div class="flex items-center justify-between gap-4">
    <h1 class="text-title font-[650]">{copy.projects}</h1>
    <Rescan pending={pending} />
  </div>;
}

export function ProjectList({ narrow = false }: { narrow?: boolean }) {
  return <div class="overflow-hidden rounded-panel bg-surface shadow-float">
    {!narrow && <div class="grid grid-cols-[minmax(0,1fr)_144px_200px_148px] gap-6 border-b border-border px-5 py-3
      text-caption text-text-tertiary">
      {[copy.projects, copy.changed, copy.git, copy.designs].map(label => <span>{label}</span>)}
    </div>}
    {projects.map((project, index) => <div
      class={`${index ? 'border-t border-border' : ''} ${narrow ? 'p-4' : 'px-5 py-5'}`}
    >
      <div class={narrow ? 'flex flex-col gap-3' : 'grid grid-cols-[minmax(0,1fr)_144px_200px_148px] items-center gap-6'}>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <Icon name="folder" size={16} class="shrink-0 text-text-secondary" />
            {project.incompatible ? <span class="text-body font-[600]">{project.name}</span>
              : <a href={`/p/${project.id}/`} class="text-body font-[600]">{project.name}</a>}
            {narrow && <span class="ml-auto flex items-center gap-1 text-meta text-text-secondary">
              {project.dirty && <span role="img" aria-label={copy.dirty} title={copy.dirty}
                class="h-[5px] w-[5px] rounded-full bg-text-secondary" />}
              {project.changed}
            </span>}
            {!narrow && !project.incompatible && <Icon name="arrow-up-right" size={12} class="text-text-tertiary" />}
          </div>
          <div class="mt-1 truncate text-meta text-text-secondary" title={project.path}>{project.path}</div>
        </div>
        {!narrow && <div class="flex items-center gap-2 text-meta text-text-secondary">
          {project.dirty && <span role="img" aria-label={copy.dirty} title={copy.dirty}
            class="h-[5px] w-[5px] rounded-full bg-text-secondary" />}
          <span>{project.changed}</span>
        </div>}
        <div class="flex min-w-0 items-center gap-2 text-meta text-text-secondary">
          <Icon name="git-branch" size={13} class="shrink-0" />
          <span class="truncate" title={project.branch}>{project.branch}</span>
          <span class="shrink-0 font-mono text-caption text-text-tertiary">{project.head}</span>
        </div>
        <div class="text-meta text-text-secondary">{project.sources} sources · {project.frames} frames</div>
      </div>
      {project.incompatible && <div class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-danger">
        <Icon name="circle-alert" size={14} />
        <span>{copy.incompatible}</span>
        <span class="text-text-secondary">{project.incompatible}</span>
      </div>}
    </div>)}
  </div>;
}

export function LiveInstances({ narrow = false }: { narrow?: boolean }) {
  return <section class="flex flex-col gap-3">
    <h2 class="text-section font-[600]">{copy.live}</h2>
    <div class="overflow-hidden rounded-panel bg-surface shadow-float">
      {instances.map((instance, index) => <div
        class={`${index ? 'border-t border-border' : ''} ${narrow ? 'p-4' : 'px-5 py-4'}`}
      >
        <div class={`flex ${narrow && !instance.stoppable ? 'flex-col gap-2' : 'items-center justify-between gap-4'}`}>
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex items-center gap-2">
              <Icon name="radio" size={16} class="shrink-0 text-text-secondary" />
              {instance.unavailable ? <span class="truncate text-body font-[600]">{instance.name}</span>
                : <a href={`/i/${instance.id}/`} class="truncate text-body font-[600]">{instance.name}</a>}
              {!instance.unavailable && <Icon name="arrow-up-right" size={12} class="shrink-0 text-text-tertiary" />}
            </div>
            <div class="flex min-w-0 items-center gap-2 text-meta text-text-secondary">
              <Icon name="git-branch" size={13} class="shrink-0" />
              <span class="truncate">{instance.branch}</span>
              <span class="shrink-0 text-text-tertiary">· {instance.started}</span>
            </div>
          </div>
          {instance.unavailable && <span class="flex shrink-0 items-center gap-2 text-meta text-danger">
            <Icon name="circle-alert" size={14} />{instance.unavailable}
          </span>}
          {instance.stoppable && <div role="button" aria-label={`${copy.closeInstance}: ${instance.name} (:${instance.port})`}
            title={`${copy.closeInstance}: ${instance.name} (:${instance.port})`}>
            <IconButton icon="x" />
          </div>}
        </div>
      </div>)}
    </div>
  </section>;
}

export function HubEmpty({ title, detail }: { title: string; detail: string }) {
  return <div class="flex flex-col items-center gap-3 rounded-panel bg-surface px-6 py-12 text-center shadow-float">
    <Icon name="folders" size={24} class="text-text-tertiary" />
    <div class="flex flex-col gap-1">
      <h2 class="text-section font-[600]">{title}</h2>
      <p class="text-body text-text-secondary">{detail}</p>
    </div>
  </div>;
}

export default () => [
  <Frame name="rescan-pending" note={hubNotes.proposed}><Rescan pending /></Frame>,
  ...emptyStates.map(({ name, ...state }) => <Frame name={name} width={560} note={hubNotes.proposed}>
    <div class="flex w-full flex-col gap-5 bg-canvas p-6">
      <HubHeading /><HubEmpty {...state} />
    </div>
  </Frame>),
];
