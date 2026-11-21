import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { Canvas } from '../components/canvas';
import { CommentPin } from '../components/comment-pin';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Separator, Toolbar } from '../components/toolbar';
import { hubNotes, instances, projects, switcherFrames } from '../fixtures/hub';
import { boardFilters, nextActions, playableNames, playerMoments, type FrameFilter, type PlayerMoment } from '../fixtures/board-playback';
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
    <button type="button" aria-label={`Filter frames: ${filter}`} aria-expanded={expanded}
      class={filter === 'Recently updated' ? 'flex h-(--control-size) items-center gap-[6px] rounded-row bg-accent px-[10px] text-body font-[550] text-on-accent' :
        `flex h-(--control-size) items-center gap-2 rounded-field border px-3 text-body font-semibold
        ${active ? 'border-accent bg-accent text-on-accent' : 'border-border text-text'}`}>
      <Icon name="list-filter" size={filter === 'Recently updated' ? 16 : 15} />{active ? filter : 'Filter frames'}<Icon name="chevron-down" size={12} />
    </button>
    {expanded && <div class="absolute top-full left-0 mt-3 w-52 rounded-menu border border-border bg-surface p-1 shadow-menu">
      {(['All frames', 'Playable', 'Recently updated'] as const).map((item, i) =>
        <button type="button" key={item} aria-pressed={item === filter}
          class="flex h-9 w-full items-center gap-2 rounded-row px-2 text-left text-body text-text">
          <Icon name={['layout-grid', 'play', 'history'][i]} size={15} />
          <span class="flex-1">{item}</span>{item === filter && <Icon name="check" size={14} />}
        </button>)}
    </div>}
  </div>;
}

function ResultRow({ name }: { name: string }) {
  return <button type="button" aria-label={`Locate ${name} on board`}
    class="flex min-h-8 w-full items-center gap-2 rounded-row px-2 text-left font-mono text-meta text-text-secondary">
    <Icon name="frame" size={13} class="shrink-0 text-text-tertiary" /><span class="min-w-0 flex-1 truncate">{name}</span>
  </button>;
}

type RecentPeriod = {
  title: string;
  subjects: string[];
  globalCauses?: string[];
  rows: { source: string; frame: string; status: string; causes?: string[]; former?: { source: string; frame: string } }[];
};
const recentExample = (sinceVisit: boolean): RecentPeriod[] =>
  recentPeriods.filter(period => !sinceVisit || period.title !== 'Earlier this week');

function RecentResults({ sinceVisit }: { sinceVisit: boolean }) {
  const groupButton = 'block w-full rounded-row bg-surface-sunken px-[10px] py-[7px] text-left font-mono';
  const detail = 'my-[3px] block text-[smaller] text-text-secondary';
  return <aside aria-label="Recently updated results"
    class="absolute top-16 left-3 z-3 max-h-[70%] w-[332px] overflow-auto rounded-panel bg-surface p-[14px] text-body leading-[1.2] text-text shadow-float">
    <header class="flex items-center justify-between"><strong>Recently updated</strong><button>Clear filter</button></header>
    <div class="my-[10px] flex rounded-field bg-surface-sunken p-[3px]">
      {['This week', 'Since my last visit'].map((range, i) =>
        <button key={range} aria-pressed={sinceVisit === Boolean(i)}
          class={`w-full rounded-row px-[10px] py-[7px] ${sinceVisit === Boolean(i) ? 'bg-surface shadow-float' : ''}`}>{range}</button>)}
    </div>
    <p>Frames whose sources or inputs changed.</p>
    {recentExample(sinceVisit).map(period => {
      const direct = period.rows.filter(row => !row.causes && row.status !== 'removed');
      const removed = period.rows.filter(row => row.status === 'removed');
      const shared = period.rows.filter(row => row.causes);
      return <section key={period.title} class="mt-3 border-t border-border">
        <header class="flex items-center justify-between">
          <h3 class="text-meta leading-normal font-medium text-text-secondary">{period.title}</h3>
          <button class="px-[10px] py-[7px] text-text-secondary">Visual changes</button>
        </header>
        {period.subjects.map(subject => <small key={subject} class={detail}>{subject}</small>)}
        {direct.map(row => <button key={row.frame} aria-label={`Locate ${row.frame} on board`}
          class="grid w-full grid-cols-[1fr_auto] gap-x-2 gap-y-[2px] px-2 py-[6px] text-left font-mono">
          <span>{row.frame}</span><span class="font-ui text-text-secondary">{row.status[0].toUpperCase() + row.status.slice(1)}</span>
          <small class={detail + ' col-span-2'}>{row.source.slice('design/'.length)}</small>
          {row.former && <small class={detail + ' col-span-2'}>From {row.former.source.slice('design/'.length)} · {row.former.frame}</small>}
        </button>)}
        {!!removed.length && <button aria-expanded="false" class={groupButton}>Removed ({removed.length})<Icon name="chevron-right" size={12} class="float-right" /></button>}
        {!!shared.length && <>
          <small class={detail}>Shared inputs</small>
          <button aria-expanded="false" class={groupButton}>{shared[0].causes?.join(', ')} → {shared.length} frames</button>
        </>}
        {period.globalCauses && <>
          <small class={detail}>Global inputs</small>
          <button aria-pressed="false" class={groupButton}>{period.globalCauses.join(', ')} → all frames</button>
        </>}
      </section>;
    })}
  </aside>;
}

function FilterResults({ filter, sinceVisit }: { filter: FrameFilter; sinceVisit: boolean }) {
  if (filter === 'Recently updated') return <RecentResults sinceVisit={sinceVisit} />;
  return <aside aria-label="Playable results"
    class="absolute top-[72px] left-3 w-[332px] rounded-panel border border-border bg-surface p-4 text-text shadow-float">
    <header class="flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-title font-semibold"><Icon name="play" size={16} />Playable</h2>
      <Button form="ghost" label="Clear filter" />
    </header>
    <section class="mt-3 border-t border-border pt-3">
      <h3 class={smallHeading}>Project switcher</h3>
      <div class="mt-1">{playableNames.map(name => <ResultRow key={name} name={name} />)}</div>
    </section>
  </aside>;
}

function FilteredBoard({ filter, menuOpen, sinceVisit }: { filter: FrameFilter; menuOpen: boolean; sinceVisit: boolean }) {
  const history = filter === 'Recently updated';
  // The located switcher fills the area beside the 332 px results panel.
  const camera = sinceVisit ? { left: -766.4, top: -205.9, scale: 1.096 } : { left: 190, top: 70, scale: .63 };
  const recent = recentExample(sinceVisit).flatMap(period => period.rows
    .filter(row => !row.causes && row.status !== 'removed').map(row => row.frame));
  return <Canvas {...screen}>
    <div class="absolute inset-x-0 top-0 z-10 p-3">
      <ViewerBars
        project={<ProjectPicker current={{name: 'agent-design-gallery'}} kind="project" />}
        scopes={<>
          <ScopeTabs options={viewerBarScopes} selected="Modules" />
          {!history && <Separator />}
          <FilterPicker filter={filter} expanded={menuOpen} />
        </>}
        search={<Field form="search" label="Find assets…" width={history ? 216 : 204} />}
      />
    </div>
    <div data-free class="absolute origin-top-left" style={{ left: camera.left, top: camera.top, transform: `scale(${camera.scale})` }}>
      <BoardChapter titleTracking={history ? '-.02em' : undefined} eyebrowTracking={history ? '.16em' : undefined}
        width={history ? 2888 : 1680} number={2} layer={history ? 'modules' : 'Modules'} title="Project access" sourceCount={3} frameCount={16}>
        <BoardSection wide={history} title="project-switcher" path="modules/project-switcher.tsx" modified={history ? 'Nov 7, 13:24' : undefined}>
          {switcherFrames.map(({name, current, kind, open, search, empty}) => {
            const playable = playableNames.includes(name);
            const match = filter === 'All frames' || (filter === 'Playable' ? playable : recent.includes(name));
            const play = playable && <button type="button" aria-label={`Play from ${name}`}
              class={history ? 'absolute right-0 bottom-[calc(100%-17px)] flex h-[26px] origin-bottom-right items-center gap-1 rounded-field bg-accent px-2 font-ui text-meta leading-normal font-semibold text-on-accent' :
                'flex h-10 items-center gap-[6px] rounded-field bg-accent px-3 font-ui text-title font-semibold text-on-accent'}
              style={history ? { transform: `scale(${1 / camera.scale})` } : undefined}>
              <Icon name="play" size={14} />Play
            </button>;
            const preview = open ? <Switcher current={current} kind={kind} open search={search} empty={empty} /> :
              <ProjectPicker current={current} kind={kind} />;
            return <SpecimenWell key={name} name={name} note={history ? hubNotes.switcher : undefined} span={open ? 6 : history ? 4 : 3} selected={sinceVisit && name === 'switcher-open'} dimmed={!match} captionAction={play} overlayAction={history}>
              {history ? <div class="bg-canvas p-6">{preview}</div> : preview}
            </SpecimenWell>;
          })}
        </BoardSection>
      </BoardChapter>
    </div>
    {filter !== 'All frames' && <FilterResults filter={filter} sinceVisit={sinceVisit} />}
    <div class="absolute inset-x-0 bottom-4 flex justify-center"><ZoomBar label={sinceVisit ? '110%' : '63%'} backDisabled /></div>
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
  const rest = moment === 'at-rest';
  const underway = moment === 'playing' || moment === 'paused';
  const terminal = moment === 'terminal';
  const instant = moment === 'reduced-motion';
  const settings = moment === 'settings';
  const picker = 'project-picker', open = 'switcher-open', empty = 'switcher-empty', instance = 'project-picker-instance';
  const from = terminal || instant ? open : picker;
  const to = terminal ? instance : instant ? empty : open;
  const current = rest || underway ? picker : to;
  const history = current === picker ? [picker] : current === open ? [picker, open] : [picker, open, current];
  const flowOpen = moment === 'completed' || terminal;
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
            <span class="border-l border-border pl-2">{instant ? 'Reduced motion' : '1×'}</span>
          </button>
        </Toolbar>
        <Toolbar wide>
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
      {rest && <div class="absolute left-[563px] top-[209px] h-8 w-60 outline-2 outline-dashed outline-accent">
        <span class="align-top bg-surface text-[11px]">Open project switcher</span>
      </div>}
      {flowOpen && <aside class="absolute top-[68px] right-5 w-[350px] rounded-panel border border-border bg-surface shadow-float">
        <div class="p-5">
          <p class={smallHeading}>Current frame</p>
          <h1 class="mt-2 font-mono text-[22px] leading-7 font-semibold">{current}</h1>
          <div class="mt-5"><p class={`mb-2 ${smallHeading}`}>Path taken</p><PathTaken frames={history} /></div>
          <div class="mt-3 flex flex-wrap gap-1">
            <Button form="secondary" icon="arrow-left" label={`Back to ${history[history.length - 2]}`} />
            <Button form="secondary" icon="rotate-ccw" label="Restart flow" />
          </div>
        </div>
        <div class="border-t border-border p-5">
          <h2 class="text-title font-semibold">{terminal ? 'End of flow' : 'Next actions'}</h2>
          {terminal ? <p class="mt-2 text-body text-text-secondary">No outgoing actions from this frame.</p> :
            <div class="mt-3 flex flex-col gap-2">
              {nextActions.open.map(([label, ...gestures]) => <div key={label} class="rounded-field border border-border px-3 py-[10px]">
                <strong class="block text-body">{label}</strong>
                <div class="mt-1 flex flex-wrap gap-1">{gestures.map(gesture =>
                  <Button key={gesture} form="secondary" label={gesture} />)}</div>
              </div>)}
            </div>}
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
