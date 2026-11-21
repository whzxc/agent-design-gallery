import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { Canvas } from '../components/canvas';
import { CommentPin } from '../components/comment-pin';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Separator, Toolbar } from '../components/toolbar';
import { Tooltip } from '../components/tooltip';
import { instances, projects, switcherFrames } from '../fixtures/hub';
import { nextActions, playbackScope, playerMoments, type PlayerMoment } from '../fixtures/board-playback';
import commentFixtures from '../fixtures/comments.json';
import { viewerBarContents, viewerBarDetails, viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';
import { BoardChapter, BoardSection, SpecimenWell } from '../modules/canvas';
import { CommentsPanel, CommentThread } from '../modules/comments';
import { Inspector } from '../modules/inspector';
import { Contents, ScopeTabs } from '../modules/navigation';
import { ProjectPicker, Switcher, SwitcherMenu } from '../modules/project-switcher';
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

function PlayableBoard({ filtered }: { filtered: boolean }) {
  return <Canvas {...screen}>
    <div class="absolute inset-x-0 top-0 z-10 p-3">
      <ViewerBars
        project={<ProjectPicker current={{name: 'agent-design-gallery'}} kind="project" />}
        scopes={<>
          <ScopeTabs options={viewerBarScopes} selected="Modules" />
          <Separator />
          <button type="button" aria-pressed={filtered}
            class={`flex h-(--control-size) items-center gap-2 rounded-field border px-3 text-body font-semibold
              ${filtered ? 'border-accent bg-accent text-on-accent' : 'border-border text-text'}`}>
            <Icon name={filtered ? 'list-filter-plus' : 'list-filter'} size={15} />Playable
            {filtered && <Icon name="check" size={14} />}
          </button>
        </>}
        search={<Field form="search" label="Find assets…" width={204} />}
      />
    </div>
    <div data-free class="absolute origin-top-left" style={{ left: 190, top: 70, transform: 'scale(0.63)' }}>
      <BoardChapter number={2} layer="Modules" title="Project access" sourceCount={3} frameCount={16}>
        <BoardSection title="project-switcher" path="modules/project-switcher.tsx">
          {switcherFrames.map(({name, current, kind, open, search, empty}) => {
            const playable = ['project-picker', 'switcher-open', 'switcher-empty'].includes(name);
            const play = playable && <button type="button" aria-label={`Play from ${name}`}
              class="flex h-10 items-center gap-[6px] rounded-field bg-accent px-3 font-ui text-title font-semibold text-on-accent">
              <Icon name="play" size={14} />Play
            </button>;
            return <SpecimenWell key={name} name={name} span={open ? 6 : 3} dimmed={filtered && !playable} captionAction={play}>
              {open ? <Switcher current={current} kind={kind} open search={search} empty={empty} /> :
                <ProjectPicker current={current} kind={kind} />}
            </SpecimenWell>;
          })}
        </BoardSection>
      </BoardChapter>
    </div>
    <div class="absolute inset-x-0 bottom-4 flex justify-center"><ZoomBar label="63%" backDisabled /></div>
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
  const instant = moment === 'reduced-motion';
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
        <span>Duration <code>--motion-switcher</code> · 160 ms</span>
        <span>Easing <code>--ease-switcher</code> · ease-out</span>
        {!instant && <strong class="text-text">{elapsed} ms elapsed</strong>}
      </div>
    </div>
  </section>;
}

function PlayerProposal({ moment }: { moment: PlayerMoment }) {
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
  const actions = rest ? nextActions.picker : instant ? nextActions.empty : nextActions.open;
  const title = terminal ? 'Open live instance' : instant ? 'Search for “Nova”' : 'Open project switcher';
  return <Canvas {...screen}>
    <div class="absolute inset-0 flex flex-col gap-4 p-5 text-text">
      <header class="flex items-center justify-between">
        <Toolbar wide><div class="flex items-center gap-3 px-2 text-title font-semibold">
          <Icon name="route" size={17} /><span>Project switcher</span>
        </div><Separator />
          <button type="button" aria-expanded={settings}
            class="flex h-(--control-size) items-center gap-2 rounded-row bg-surface-sunken px-3 text-body font-semibold">
            <Icon name="settings-2" size={15} />Playback settings
            <span class="border-l border-border pl-2 text-text-secondary">{instant ? 'Reduced motion' : '1×'}</span>
          </button>
        </Toolbar>
        <Toolbar><Button form="ghost" icon="log-out" label="Exit to board" /></Toolbar>
      </header>
      <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_350px] gap-4">
        <div class="flex min-h-0 min-w-0 flex-col gap-4">
          <div class="grid min-h-0 flex-1 place-items-center">
            {rest ? <div class="relative rounded-field outline-2 outline-offset-4 outline-accent">
              <ProjectPicker current={projects[0]} kind="project" />
              <div class="absolute top-full left-0 mt-3 whitespace-nowrap"><Tooltip label="Open project switcher" /></div>
            </div> : terminal ? <ProjectPicker current={instances[0]} kind="instance" /> :
              <div class="flex w-[410px] flex-col items-start gap-[6px]">
                <Toolbar wide><IconButton icon="panel-left" label="Contents" /><ProjectPicker current={projects[0]} kind="project" open width={240} /></Toolbar>
                <div class={`ml-[46px] ${underway ? 'opacity-[0.58]' : ''}`}>
                  <SwitcherMenu current={projects[0]} empty={instant} query="Nova" />
                </div>
              </div>}
          </div>
          {!rest && <TransitionInspector moment={moment} from={from} to={to} title={title} />}
        </div>
        <aside class="self-start rounded-panel border border-border bg-surface shadow-float">
          <div class="p-5">
            <p class={smallHeading}>Current frame</p>
            <h1 class="mt-2 font-mono text-[22px] leading-7 font-semibold">{current}</h1>
            <div class="mt-5"><p class={`mb-2 ${smallHeading}`}>Path taken</p><PathTaken frames={history} /></div>
            {history.length > 1 && <div class="mt-4"><Button form="secondary" icon="arrow-left" label={`Back to ${history[history.length - 2]}`} /></div>}
          </div>
          <div class="border-t border-border p-5">
            <h2 class="text-title font-semibold">{terminal ? 'End of flow' : 'Next actions'}</h2>
            {underway && <p class="mt-1 text-meta text-text-secondary">Continue from {to}</p>}
            {terminal ? <p class="mt-2 text-body text-text-secondary">No outgoing actions from this frame.</p> :
              <div class="mt-3 flex flex-col gap-2">
                {actions.map(([label, hint]) => <button key={label} type="button"
                  class="flex items-center justify-between gap-2 rounded-field border border-border px-3 py-[10px] text-left">
                  <span><strong class="block text-body">{label}</strong><span class="mt-1 block text-meta text-text-secondary">{hint}</span></span>
                  <Icon name="arrow-right" size={14} class="text-text-secondary" />
                </button>)}
              </div>}
          </div>
        </aside>
      </div>
      {settings && <div data-free class="absolute top-[71px] left-[184px] w-[296px] space-y-4 rounded-panel border border-border bg-surface p-4 shadow-menu">
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
  ...[false, true].map(filtered => (
    <Frame name={filtered ? 'board-playable-filter' : 'board-play-affordance'} {...screen} proposed={playbackScope}
      note={filtered ? 'Playable is on. Other specimens dim in their original positions.' : 'Play in a specimen caption starts at that frame.'}>
      <PlayableBoard filtered={filtered} />
    </Frame>
  )),
  ...playerMoments.map(([moment, note]) => (
    <Frame name={`flow-${moment}`} {...screen} proposed={playbackScope} note={note}>
      <PlayerProposal moment={moment} />
    </Frame>
  )),
];
