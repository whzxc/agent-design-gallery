import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { Canvas } from '../components/canvas';
import { CommentPin } from '../components/comment-pin';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Separator, Toolbar } from '../components/toolbar';
import { hubNotes, instances, projects, switcherFrames } from '../fixtures/hub';
import { boardFilters, nextActions, playerMoments, type FrameFilter, type PlayerMoment } from '../fixtures/board-playback';
import recentPeriods from '../fixtures/recent-updates.json';
import commentFixtures from '../fixtures/comments.json';
import { viewerBarContents, viewerBarDetails, viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';
import { BoardChapter, BoardSection, SpecimenWell } from '../modules/canvas';
import { CommentsPanel, CommentThread } from '../modules/comments';
import { Inspector } from '../modules/inspector';
import { Contents, ScopeTabs } from '../modules/navigation';
import { ProjectPicker, Switcher } from '../modules/project-switcher';
import { ViewerBars, ZoomBar } from '../modules/view-controls';

const { commentCanvas, commentExample, changedExample } = commentFixtures;
const { clip, pin } = commentCanvas;

function ViewerHeader({
  scope,
  contentsOpen = false,
  detailsOpen = false,
  inspectorDisabled = false,
  commentsOpen = false,
  commentCount = 0,
}: {
  scope: string;
  contentsOpen?: boolean;
  detailsOpen?: boolean;
  inspectorDisabled?: boolean;
  commentsOpen?: boolean;
  commentCount?: number;
}) {
  return (
    <ViewerBars
      project={<ProjectPicker current={viewerBarProject} kind="project" />}
      scopes={<ScopeTabs options={viewerBarScopes} selected={scope} />}
      search={<Field form="search" label="Find assets…" width={216} />}
      contentsOpen={contentsOpen}
      detailsOpen={detailsOpen}
      inspectorDisabled={inspectorDisabled}
      commentsOpen={commentsOpen}
      commentCount={commentCount}
    />
  );
}

function EssentialsBoard({ selectedSource = false }: { selectedSource?: boolean }) {
  return (
    <BoardChapter
      number={1}
      project={viewerBarProject.name}
      layer="Components"
      title="Essentials"
      sourceCount={8}
      frameCount={32}
      width={1680}
    >
      <BoardSection title="button" path="components/button.tsx" modified="Nov 7, 13:24" selected={selectedSource}>
        <SpecimenWell name="primary" span={4} selected={selectedSource}>
          <Button form="primary" label="Open" />
        </SpecimenWell>
        <SpecimenWell name="secondary" span={4}>
          <Button form="secondary" label="Cancel" />
        </SpecimenWell>
        <SpecimenWell name="ghost" span={4}>
          <Button form="ghost" label="Reset" />
        </SpecimenWell>
      </BoardSection>
      <BoardSection title="icon-button" path="components/icon-button.tsx" modified="Nov 7, 13:24">
        <SpecimenWell name="default" span={4}>
          <IconButton icon="panel-right" label="Inspector" />
        </SpecimenWell>
        <SpecimenWell name="active" span={4}>
          <IconButton form="active" icon="panel-right" label="Inspector" />
        </SpecimenWell>
        <SpecimenWell name="pressed" span={4}>
          <IconButton form="pressed" icon="map" label="Minimap" />
        </SpecimenWell>
      </BoardSection>
      <BoardSection title="field" path="components/field.tsx" modified="Nov 7, 13:24">
        <SpecimenWell name="search" span={6}>
          <Field form="search" label="Find assets…" />
        </SpecimenWell>
        <SpecimenWell name="picker" span={6}>
          <Field form="picker" label="agent-remote-control" />
        </SpecimenWell>
      </BoardSection>
    </BoardChapter>
  );
}

const screen = { width: 1440, height: 900 };
const smallHeading = 'text-meta font-semibold text-text-secondary';

function FilterPicker({ filter, expanded }: { filter: FrameFilter; expanded: boolean }) {
  const active = filter !== 'All frames';
  return <div class="relative">
    <button type="button" aria-expanded={expanded}
      class={`flex h-(--control-size) items-center gap-[6px] rounded-row px-[10px] text-body font-[550] ${active ? 'bg-accent text-on-accent' : 'bg-surface-sunken text-text'}`}>
      <Icon name="list-filter" size={16} />{active ? filter : 'Filter frames'}<Icon name="chevron-down" size={12} />
    </button>
    {expanded && <div class="absolute top-full left-0 mt-[10px] w-40 rounded-menu bg-surface p-[5px] shadow-menu">
      {(['All frames', 'Playable', 'Recently updated'] as const).map(item =>
        <button type="button" key={item} aria-pressed={item === filter}
          class={`block w-full rounded-row px-[10px] py-[7px] text-left text-body ${item === filter ? 'bg-surface-sunken' : ''}`}>
          {item}
        </button>)}
    </div>}
  </div>;
}

function FramePlay({ name, zoom = 1, outside = false }: { name: string; zoom?: number; outside?: boolean }) {
  const size = (zoom === 1 ? 26 : Math.min(32, Math.max(20, 24 * Math.sqrt(zoom)))) / zoom;
  return <button aria-label={`Play from ${name}`} type="button"
    class="absolute grid place-items-center rounded-field bg-surface text-text shadow-float"
    style={{ top: outside ? -size - 4 / zoom : 4 / zoom, right: outside ? 0 : 4 / zoom, width: size, height: size }}>
    <Icon name="play" size={size * .55} />
  </button>;
}

function SwitcherPreview({ name }: { name: string }) {
  const { current, kind, open, search, empty } = switcherFrames.find(frame => frame.name === name) ?? switcherFrames[0];
  return open ? <Switcher current={current} kind={kind} open search={search} empty={empty} /> :
    <ProjectPicker current={current} kind={kind} />;
}

type BoardChange = { time: number; subject: string };

function ChangeStamp({ time, subject }: BoardChange) {
  const date = new Date(time);
  return <small class="grid gap-[2px] text-meta text-text-secondary">
    <time datetime={date.toISOString()}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}</time>
    <span class="truncate" title={subject}>{subject}</span>
  </small>;
}

function BoardFrameCard({ name, badge, source = false, hovered = false, change }: {
  name: string; badge?: string; source?: boolean; hovered?: boolean; change?: BoardChange;
}) {
  return <article class="overflow-hidden rounded-card border border-border bg-surface">
    <div class="relative grid h-[148px] place-items-center bg-surface-sunken">
      <div class="scale-[.68]"><SwitcherPreview name={name} /></div>
      {hovered && <FramePlay name={name} outside />}
    </div>
    <div class="px-[10px] pt-2">
      <h4 class="text-body leading-[18px] font-semibold">{name}</h4>
      {source && <p class="mt-[3px] font-mono text-meta text-text-secondary">modules/project-switcher.tsx</p>}
      {change && <ChangeStamp {...change} />}
    </div>
    <div class="flex items-center justify-between gap-1 pt-1 pr-2 pb-[7px] pl-[10px]">
      {badge && <span class="rounded-pill bg-surface-sunken px-[7px] py-[3px] text-caption text-text-secondary">{badge}</span>}
      <button type="button" class="ml-auto min-h-[25px] px-1 text-meta text-text-secondary">Show in board</button>
    </div>
  </article>;
}

const sectionStyle = 'min-w-0 rounded-panel border border-border bg-surface p-5';
const boardAction = 'inline-flex h-(--control-size) items-center gap-[6px] rounded-row bg-surface-sunken px-[10px] text-body font-[550]';
const sourceStyle = 'font-mono text-meta';

function PlayableBoard() {
  const cards = [
    ['project-picker', 32, 225], ['switcher-open', 482, 225], ['switcher-empty', 932, 98],
    ['project-picker-instance', 932, 352], ['switcher-open-instance', 1382, 352],
    ['switcher-empty-instance', 1832, 352],
  ] as const;
  const routes = [
    { d: 'M1180 164H1194V84H468V291H482', x: 831, y: 80, label: 'Click clear search' },
    { d: 'M730 283H744V56H18V291H32', x: 381, y: 52, label: 'Click picker · Press Esc' },
    { d: 'M1180 180H1202V28H10V307H32', x: 606, y: 24, label: 'Click picker · Press Esc' },
    { d: 'M280 299C381 299,381 307,482 307', x: 381, y: 293, label: 'Click picker · Press ↓ · Press ↑' },
    { d: 'M730 299C831 299,831 172,932 172', x: 831, y: 225.5, label: 'Type Nova' },
    { d: 'M730 315C831 315,831 426,932 426', x: 831, y: 360.5, label: 'Click live instance' },
    { d: 'M1180 426H1382', x: 1281, y: 422, label: 'Click picker · Press ↓ · Press ↑' },
    { d: 'M1630 426H1832', x: 1731, y: 422, label: 'Type Nova' },
    { d: 'M2080 408H2098V324H1364V408H1382', x: 1731, y: 320, label: 'Click clear search' },
    { d: 'M1630 446H1648V298H914V408H932', x: 1281, y: 294, label: 'Click picker · Press Esc' },
    { d: 'M2080 446H2104V270H906V442H932', x: 1506, y: 266, label: 'Click picker · Press Esc' },
    { d: 'M1630 466H1660V610H20V327H32', x: 1081, y: 606, label: 'Click Atlas' },
  ];
  return <section class={sectionStyle}>
    <header class="flex items-center justify-between">
      <h2 class="text-title font-semibold">project-switcher</h2>
      <button type="button" class={boardAction}><Icon name="play" size={14} />Play flow</button>
    </header>
    <div class="mt-3 overflow-x-auto">
      <div class="relative h-[622px] w-[2120px]">
        <svg aria-hidden="true" data-free class="absolute inset-0" width={2120} height={622}>
          <defs><marker id="board-flow-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto">
            <path d="M0 0L8 4L0 8Z" class="fill-text-tertiary" />
          </marker></defs>
          {routes.map(({ d }) =>
            <path key={d} d={d} marker-end="url(#board-flow-arrow)" stroke-width={1.25} class="fill-none stroke-text-tertiary" />)}
        </svg>
        {cards.map(([name, x, y], i) => <div data-free key={name} class="absolute w-[248px]" style={{ left: x, top: y }}>
          <BoardFrameCard name={name} badge={i === 0 ? 'Start' : undefined} source />
        </div>)}
        {routes.map(({ d, x, y, label }) => <span data-free key={d}
          class="absolute -translate-x-1/2 -translate-y-full rounded-field bg-surface-sunken px-[6px] py-[3px] text-caption whitespace-nowrap"
          style={{ left: x, top: y }}>{label}</span>)}
      </div>
    </div>
  </section>;
}

type HistoryRow = { source: string; frame: string; status: string; causes?: string[]; time?: number; subject?: string };

type HistoryPeriod = {
  title: string;
  globalCauses?: string[];
  rows: HistoryRow[];
};

function GlobalInputs({ files, open }: { files: string[]; open: boolean }) {
  const named = files.slice(0, 2);
  const remaining = files.length - named.length;
  const directories = new Map<string, string[]>();
  for (const file of [...files].sort()) {
    const parts = file.split('/');
    const name = parts.pop()!;
    const directory = parts.join('/');
    directories.set(directory, [...(directories.get(directory) ?? []), name]);
  }
  return <details open={open} class="mt-[5px]">
    <summary class="flex items-center text-body whitespace-nowrap text-text-secondary">
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} class="mr-1" />
      <span>Global inputs changed: {files.length} files</span>
      <span class="ml-[.3em] truncate"> ({named.join(', ')}</span>
      <span>{remaining ? ', +' + remaining : ''})</span>
    </summary>
    {open && <div class="mt-[9px] grid grid-cols-4 gap-x-5 gap-y-3">
      {[...directories].map(([directory, names]) => <section key={directory || '.'}>
        <h3 class="font-mono text-meta text-text-secondary">{directory || 'Project root'}</h3>
        <ul class="mt-[3px] list-disc pl-[18px] text-meta text-text-secondary">
          {names.map(name => <li key={name}>{name}</li>)}
        </ul>
      </section>)}
    </div>}
  </details>;
}

function RecentBoard({ sinceVisit }: { sinceVisit: boolean }) {
  const example: HistoryPeriod[] = recentPeriods.filter(period => !sinceVisit || period.title !== 'Earlier this week');
  const direct = example.flatMap(period => period.rows).filter(row => !row.causes);
  const removed = direct.filter(row => row.status === 'removed');
  const selected = sinceVisit ? 'Since my last visit' : 'Latest';
  return <>
    <div class="flex flex-wrap gap-1">
      {['Latest', 'This week', 'Since my last visit'].map(range =>
        <button key={range} type="button" aria-pressed={selected === range}
          disabled={!sinceVisit && range === 'Since my last visit'}
          class={'h-(--control-size) shrink-0 rounded-row px-3 text-body font-[550] whitespace-nowrap ' +
            (selected === range ? 'bg-surface-sunken text-text' : 'text-text-secondary') +
            (!sinceVisit && range === 'Since my last visit' ? ' opacity-45' : '')}>{range}</button>)}
    </div>
    <section class={sectionStyle}>
      <h2 class="mb-3 text-title font-semibold">Direct changes</h2>
      <div class="grid grid-cols-5 gap-3">
        {direct.filter(row => row.status !== 'removed').map(row =>
          <BoardFrameCard key={row.frame} name={row.frame} source
            badge={row.status === 'added' ? 'New' : row.status === 'moved' ? 'Moved' : 'Edited'}
            change={{ time: row.time!, subject: row.subject! }} />)}
      </div>
      <h3 class="mt-4 text-meta font-semibold">Removed frames</h3>
      <ul class="mt-3 list-disc pl-5 font-mono text-meta text-text-secondary">
        {removed.map(row => <li key={row.frame}>{row.source.slice('design/'.length)} · {row.frame}
          <ChangeStamp time={row.time!} subject={row.subject!} />
        </li>)}
      </ul>
      <button type="button" class={boardAction + ' mt-4'}>Load more</button>
    </section>
    <section class={sectionStyle}>
      <h2 class="mb-3 text-title font-semibold">{sinceVisit ? 'Shared and global impact' : 'Shared and global impact this week'}</h2>
      {!sinceVisit && <button type="button" class={boardAction}>Show impact</button>}
    </section>
    {sinceVisit && example.filter(period => period.globalCauses).map(period => {
      const sources = [...new Set(period.rows.filter(row => row.causes).map(row => row.source))];
      return <section key={period.title} class={sectionStyle}>
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-title font-semibold">{period.title}</h2>
            {period.globalCauses && <GlobalInputs files={period.globalCauses} open />}
          </div>
          <button type="button" class={boardAction}>Visual changes</button>
        </header>
        {sources.map(source => {
          const shared = period.rows.filter(row => row.source === source && row.causes);
          return <section key={source} class="mt-4 border-t border-border pt-[14px]">
            <h3 class={sourceStyle + ' mb-3 text-text'}>{source.slice('design/'.length)}</h3>
            <details class="mt-2 text-meta text-text-secondary">
              <summary class="py-[7px]">{shared[0].causes?.join(', ')} · {shared.length} affected {shared.length === 1 ? 'frame' : 'frames'}</summary>
            </details>
          </section>;
        })}
      </section>;
    })}
  </>;
}

function FilteredBoard({ filter, menuOpen, sinceVisit }: { filter: FrameFilter; menuOpen: boolean; sinceVisit: boolean }) {
  const derived = filter !== 'All frames', scale = .63;
  return <Canvas {...screen}>
    <div class="absolute inset-x-0 top-0 z-10 p-3">
      <ViewerBars
        project={<ProjectPicker current={{name: 'agent-design-gallery'}} kind="project" />}
        scopes={<><ScopeTabs options={viewerBarScopes} selected="Modules" /><FilterPicker filter={filter} expanded={menuOpen} /></>}
        hideContents={derived} hideComments={derived} hideInspector={derived}
        search={<Field form="search" label="Find assets…" width={216} />}
      />
    </div>
    {derived ? <div class="absolute inset-x-0 top-16 px-[58px] pt-7">
      <header class="mb-6 flex items-center gap-[18px]">
        <button type="button" class={boardAction}><Icon name="arrow-left" size={14} />All frames</button>
        <h1 class="text-[34px] leading-[1.2] font-[650] tracking-[-.025em]">{filter}</h1>
      </header>
      <div class="grid gap-4">{filter === 'Playable' ? <PlayableBoard /> : <RecentBoard sinceVisit={sinceVisit} />}</div>
    </div> : <>
      <div data-free class="absolute top-[70px] left-[190px] origin-top-left" style={{ transform: `scale(${scale})` }}>
        <BoardChapter width={1680} number={2} layer="Modules" title="Project access" sourceCount={3} frameCount={16}>
          <BoardSection title="project-switcher" path="modules/project-switcher.tsx" modified="Nov 7, 13:24">
            {switcherFrames.map(({ name, open }) => (
              <SpecimenWell key={name} name={name} note={hubNotes.switcher} span={open ? 6 : 3}
                overlay={!menuOpen && name === 'project-picker' ? <FramePlay name={name} zoom={scale} /> : undefined}>
                <SwitcherPreview name={name} />
              </SpecimenWell>
            ))}
          </BoardSection>
        </BoardChapter>
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center"><ZoomBar label="63%" backDisabled /></div>
    </>}
  </Canvas>;
}

function SettingChoices({ title, choices, selected }: { title: string; choices: string[]; selected: string }) {
  return <fieldset class="min-w-0">
    <legend class={smallHeading}>{title}</legend>
    <div class="mt-2 flex rounded-field bg-surface-sunken p-1">
      {choices.map(choice => <button type="button" key={choice} aria-pressed={choice === selected}
        class={`h-8 flex-1 rounded-row text-body font-semibold ${choice === selected ? 'bg-accent text-on-accent' : 'text-text-secondary'}`}>
        {choice}
      </button>)}
    </div>
  </fieldset>;
}

function PathTaken({ frames }: { frames: string[] }) {
  return <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta" aria-label="Path taken">
    {frames.map((name, i) => <span key={name} class="inline-flex items-center gap-2">
      {i > 0 && <Icon name="chevron-right" size={12} class="text-text-tertiary" />}
      <span class={i === frames.length - 1 ? 'font-semibold text-text' : 'text-text-secondary'}>{name}</span>
    </span>)}
  </div>;
}

function TransitionInspector({ moment, from, to, title }: { moment: PlayerMoment; from: string; to: string; title: string }) {
  const playing = moment === 'playing';
  const paused = moment === 'paused';
  const instant = moment === 'reduced-motion' || moment === 'terminal';
  const elapsed = playing || paused ? 64 : 160;
  return <section aria-label="Transition inspector" class="rounded-panel border border-border bg-surface p-5 shadow-float">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class={smallHeading}>{playing ? 'Playing transition' : paused ? 'Paused transition' : 'Last transition'}</p>
        <h2 class="mt-1 text-[22px] leading-7 font-semibold">{title}</h2>
        <div class="mt-1 flex items-center gap-2 font-mono text-meta text-text-secondary">
          {from}<Icon name="arrow-right" size={14} />{to}
        </div>
      </div>
      <div class="flex gap-2">
        {(playing || paused) && <Button label={playing ? 'Pause transition' : 'Resume transition'}
          icon={playing ? 'pause' : 'play'} />}
        <Button form="secondary" label="Replay transition" icon="rotate-ccw" />
      </div>
    </div>
    <div class="mt-4 border-t border-border pt-3">
      {instant ? <p class="flex items-center gap-2 text-body font-semibold">
        <Icon name="check" size={15} />Applied instantly · 0 ms
      </p> : <div class="flex items-center gap-3">
        <span class="w-12 font-mono text-meta">0 ms</span>
        <input aria-label={`Scrub ${title}`} aria-valuetext={`${elapsed} milliseconds`}
          type="range" min="0" max="160" value={elapsed} class="min-w-0 flex-1 accent-(--accent)" />
        <span class="font-mono text-meta">160 ms</span>
      </div>}
      <div class="mt-2 flex items-center justify-between gap-3 text-meta text-text-secondary">
        <span>Duration <code>{moment === 'terminal' ? '--motion-navigation' : '--motion-switcher'}</code> · {moment === 'terminal' ? '0' : '160'} ms</span>
        <span>Easing <code>--ease-switcher</code> · ease-out</span>
        {!instant && <strong class="text-text">{elapsed} ms elapsed</strong>}
      </div>
    </div>
  </section>;
}

function FlowPlayer({ moment }: { moment: PlayerMoment }) {
  const hotspots = moment === 'hotspots';
  const rest = moment === 'at-rest' || hotspots;
  const underway = moment === 'playing' || moment === 'paused';
  const terminal = moment === 'terminal';
  const instant = moment === 'reduced-motion';
  const settings = moment === 'settings';
  const picker = 'project-picker', open = 'switcher-open', empty = 'switcher-empty', instance = 'project-picker-instance';
  const from = terminal || instant ? open : picker;
  const to = terminal ? instance : instant ? empty : open;
  const current = rest || underway ? picker : to;
  const history = current === picker ? [picker] : current === open ? [picker, open] : [picker, open, current];
  const flowOpen = moment === 'completed';
  const inspectorOpen = underway || moment === 'completed';
  const title = terminal ? 'Open live instance' : instant ? 'Search for “Nova”' : 'Open project switcher';
  return <Canvas {...screen}>
    <div class="absolute inset-0 text-text">
      <header class="absolute inset-x-5 top-3 flex items-center justify-between">
        <Toolbar wide><div class="flex items-center gap-2 px-2 text-title font-semibold">
          <Icon name="route" size={17} /><span>Project switcher</span>
        </div><Separator />
          <button type="button" aria-expanded={settings}
            class="flex h-(--control-size) items-center gap-2 rounded-row bg-surface-sunken px-3 text-body font-semibold">
            <Icon name="settings-2" size={15} />Playback settings
            <span class="whitespace-nowrap border-l border-border pl-2">{instant ? 'Reduced motion' : '1×'}</span>
          </button>
        </Toolbar>
        <Toolbar wide>
          <div class="flex items-center gap-1">
            <div class={rest || underway ? 'opacity-50' : ''}><Button form="secondary" icon="arrow-left" label="Back" /></div>
            <Button form="secondary" icon="rotate-ccw" label="Restart" />
            <span class={`whitespace-nowrap text-meta text-text-secondary ${terminal ? '' : 'invisible'}`}>End of flow</span>
          </div>
          <button type="button" aria-pressed={hotspots}
            class={`flex h-(--control-size) items-center gap-2 rounded-row px-3 text-body font-semibold ${hotspots ? 'bg-accent text-on-accent' : 'bg-surface-sunken'}`}>
            <Icon name="scan" size={14} />Hotspots
          </button>
          <Button form="secondary" icon="map" label="Flow map" />
          <Button form="secondary" icon="route" label="Flow" />
          <div class={rest ? 'opacity-50' : ''}>
            <Button form="secondary" icon="panel-right" label="Transition inspector" />
          </div>
          <Button form="secondary" icon="log-out" label="Exit to board" />
        </Toolbar>
      </header>
      <div class={`absolute left-[493px] top-[179px] bg-canvas p-6 ${underway ? '[&_[data-adg-id=menu]]:opacity-[0.58]' : ''}`}>
        <Switcher current={terminal ? instances[0] : projects[0]} kind={terminal ? 'instance' : 'project'}
          open={!rest && !terminal} empty={instant} />
      </div>
      {hotspots && <div aria-hidden="true" class="absolute left-[563px] top-[209px] h-8 w-60 outline-2 outline-dashed outline-accent">
        <span class="absolute bottom-full left-0 mb-1 whitespace-nowrap bg-surface px-1 py-0.5 text-[11px]">Open project switcher</span>
      </div>}
      {flowOpen && <aside class="absolute top-[68px] right-5 w-[350px] rounded-panel border border-border bg-surface shadow-float">
        <div class="p-5">
          <p class={smallHeading}>Current frame</p>
          <h1 class="mt-2 font-mono text-[22px] leading-7 font-semibold">{current}</h1>
          <div class="mt-5"><p class={`mb-2 ${smallHeading}`}>Path taken</p><PathTaken frames={history} /></div>
        </div>
        <div class="border-t border-border p-5">
          <h2 class="text-title font-semibold">Next actions</h2>
          <div class="mt-3 flex flex-col gap-2">
              {nextActions.open.map(([label, ...gestures]) => <div key={label} class="rounded-field border border-border px-3 py-[10px]">
                <strong class="block text-body">{label}</strong>
                <div class="mt-1 flex flex-wrap gap-1">{gestures.map(gesture =>
                  <Button key={gesture} form="secondary" label={gesture} />)}</div>
              </div>)}
          </div>
        </div>
      </aside>}
      {inspectorOpen && <div class="absolute bottom-5 left-5 w-[640px]">
        <TransitionInspector moment={moment} from={from} to={to} title={title} />
      </div>}
      {settings && <div data-free class="absolute top-[68px] left-[184px] w-[296px] space-y-4 rounded-panel border border-border bg-surface p-4 shadow-menu">
        <SettingChoices title="Playback speed" choices={['0.25×', '0.5×', '1×']} selected="1×" />
        <SettingChoices title="Reduced motion" choices={['System', 'On', 'Off']} selected="System" />
      </div>}
    </div>
  </Canvas>;
}

export default () => [
  <Frame
    name="comment-thread"
    width={clip.width}
    height={clip.height}
    fixture={commentCanvas.fixture}
    capture={{ page: true, viewport: '1440x900', origin: `${clip.x} ${clip.y}` }}
  >
    <div data-free class="relative bg-surface" style={{ width: clip.width, height: clip.height }}>
      <div class="absolute" style={{ left: pin.x, top: pin.y - 26 }}>
        <CommentPin number={commentExample.number} expanded />
      </div>
      <div class="absolute" style={{ left: pin.x - 332 - 12, top: pin.y - 26 }}>
        <CommentThread thread={{ ...commentExample, displayName: undefined }} />
      </div>
    </div>
  </Frame>,
  <Frame name="board" width={1440} height={900} fixture="viewer-top-bars" capture={{ page: true, viewport: '1440x900' }}>
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 317, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" inspectorDisabled />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled />
      </div>
    </Canvas>
  </Frame>,
  <Frame
    name="board-panels"
    width={1440}
    height={900}
    fixture="viewer-top-bars-panels"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 297, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard selectedSource />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" contentsOpen detailsOpen />
      </div>
      <div class="absolute inset-x-3 top-16 flex items-start justify-between">
        <Contents {...viewerBarContents} />
        <Inspector {...viewerBarDetails} />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled />
      </div>
    </Canvas>
  </Frame>,
  <Frame
    name="board-comments"
    width={1440}
    height={900}
    fixture="viewer-board-comments"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 236, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard />
        </div>
        <div class="absolute" style={{ left: 536, top: 244 }}>
          <CommentPin number={commentExample.number} target={commentExample.target} />
        </div>
        <div class="absolute" style={{ left: 486, top: 280 }}>
          <CommentPin number={changedExample.number} changed target={changedExample.target} />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" inspectorDisabled commentsOpen commentCount={2} />
      </div>
      <div class="absolute top-16 right-3">
        <CommentsPanel threads={[commentExample, changedExample]} group="components / Essentials" />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled commentPressed />
      </div>
    </Canvas>
  </Frame>,
  ...boardFilters.map(([name, filter, note]) => (
    <Frame name={name} {...screen} fixture={name} capture={{page:true,viewport:'1440x900'}} note={note}>
      <FilteredBoard filter={filter} menuOpen={name === 'board-frame-filters'} sinceVisit={name === 'recent-updates-on-board'} />
    </Frame>
  )),
  ...playerMoments.map(([moment, note]) => (
    <Frame name={`flow-${moment}`} {...screen} fixture={`flow-${moment}`} capture={{region:'Play transitions',viewport:'1440x900'}} note={note}>
      <FlowPlayer moment={moment} />
    </Frame>
  )),
];
