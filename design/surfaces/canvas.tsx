import { Frame, Icon } from 'adg';
import { Canvas } from '../components/canvas';
import { CommentPin } from '../components/comment-pin';
import { Field } from '../components/field';
import { hubNotes, instances, projects, switcherFrames } from '../fixtures/hub';
import { boardFilters, nextActions, playerMoments, type FrameFilter, type PlayerMoment } from '../fixtures/board-playback';
import recentPeriods from '../fixtures/recent-updates.json';
import commentFixtures from '../fixtures/comments.json';
import { viewerBarContents, viewerBarDetails, viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';
import { BoardChapter, BoardSection } from '../modules/canvas';
import { componentBoards } from '../fixtures/component-boards';
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
      scopes={<><ScopeTabs options={viewerBarScopes} selected={scope} /><FilterPicker filter="All frames" expanded={false} /></>}
      search={<Field form="search" label="Find assets…" width={216} />}
      contentsOpen={contentsOpen}
      detailsOpen={detailsOpen}
      inspectorDisabled={inspectorDisabled}
      commentsOpen={commentsOpen}
      commentCount={commentCount}
    />
  );
}

const componentFit = { left: 527.55, top: 100, scale: 716 / 3158 };
const commentFit = { left: 236, top: 84, scale: .48 };
const sampleButton = {
  primary: ['添加服务器', 'plus'],
  secondary: ['重新连接', 'rotate-cw'],
  ghost: ['取消', ''],
  danger: ['删除', ''],
  pending: ['正在安装', 'loader-circle'],
} as const;

function ComponentSample({ source, name }: { source: string; name: string }) {
  if (source === 'button') {
    const [label, icon] = sampleButton[name as keyof typeof sampleButton];
    return <span class={`inline-flex h-[34px] items-center gap-1.5 rounded-pill px-4 text-body font-semibold
      ${name === 'primary' || name === 'pending' ? 'bg-text text-surface' : 'bg-surface-sunken text-text'}`}>
      {icon && <Icon name={icon} size={16} />}{label}
    </span>;
  }
  if (source === 'icon-button') return <Icon name={name === 'regular' ? 'rotate-cw' : 'trash-2'} size={16} />;
  if (source === 'switch') return <span class={`flex h-[26px] w-11 rounded-pill p-[3px]
    ${name === 'on' ? 'justify-end bg-accent' : 'bg-surface-sunken'}`}>
    <span class="size-5 rounded-pill bg-surface" />
  </span>;
  if (source === 'search') return <Field label="搜索服务器和工具" width={240} meta="" />;
  if (source === 'field') return <div class="grid gap-2 rounded-card bg-surface p-4 text-body" style={{ width: 280 }}>
    <strong>{name === 'error' ? '地址' : '服务器名称'}</strong>
    <Field form={name === 'error' ? 'input-error' : 'input'} label={name === 'error' ? 'tools.example' : 'docs'} width={248} />
  </div>;
  if (source === 'effort-slider') return <div class="flex h-6 w-64 items-center justify-between rounded-pill bg-surface-sunken px-2">
    <span class="size-5 rounded-pill bg-surface shadow-sm" /><span>2</span><span>3</span><span>4</span>
  </div>;
  if (source === 'quota-card') return <div class="grid w-[400px] gap-3 rounded-card bg-surface p-4 text-meta">
    <strong>ChatGPT</strong>
    {['5h 额度', '周额度', '额外用量'].map(label => <div key={label}>{label}<div class="mt-1 h-1 rounded-pill bg-accent/30" /></div>)}
  </div>;
  if (source === 'single-choice' && name === 'navigation') return <div class="grid w-[210px] gap-2 rounded-card bg-surface-sunken p-3 text-body">
    {['OpenAI', 'Anthropic', 'Google', 'xAI', 'Microsoft', 'Notion', 'Slack', 'Discord', 'Linear', 'Snowflake', 'Alibaba', 'Other'].map(label =>
      <span key={label} class="rounded-field bg-surface px-2 py-1">{label}</span>)}
  </div>;
  if (source === 'tile') return <Icon name={name === 'card' ? 'layout-grid' : 'sparkles'} size={23} />;
  const labels: Record<string, Record<string, string>> = {
    tag: { meta: 'acceptance', fact: 'Headers: Authorization', disclosure: '3 个工具', danger: '破坏性', ownership: 'ARC connector' },
    card: { default: '卡片内容', reply: 'Reply content' },
    'single-choice': { pills: '跟随系统　亮色　暗色', dropdown: '跟随系统', tabs: 'Current　Activity', 'option-card': 'Alpha' },
    'state-pill': { running: '运行中', waiting: '等待输入', done: '已完成', failed: '失败', stopped: '已停止' },
  };
  return <span class={`rounded-field bg-surface px-4 py-1.5 text-meta
    ${source === 'card' ? 'grid h-[120px] w-[560px] place-items-center' : ''}`}>{labels[source]?.[name]}</span>;
}

function ComponentBoards({ camera, sourceSelected = false }: { camera: typeof componentFit; sourceSelected?: boolean }) {
  return <div data-free class="absolute inset-0 overflow-hidden">
    <div class="absolute origin-top-left" style={{ left: camera.left, top: camera.top, transform: `scale(${camera.scale})` }}>
      {componentBoards.map(([title, x, height, sections], index) =>
        <div key={title} class="absolute bg-surface" style={{ left: x, width: 1680, height }}>
          <BoardChapter number={index + 1} project={viewerBarProject.name} layer="components" title={title}
            sourceCount={sections.length} frameCount={sections.reduce((count, [, , frames]) => count + frames.length, 0)}>
            {sections.map(([source, top, frames]) => <div key={source} class="absolute left-20 right-20" style={{ top }}>
              <BoardSection title={source} path={`components/${source}.tsx`} modified="Nov 7, 13:24" />
              {frames.map(([name, left, top, width, height]) => <div key={name}
                class="absolute font-mono text-meta leading-[17px]" style={{ left: left - 80, top, width }}>
                <div aria-hidden="true" class={`mb-3 grid place-items-center overflow-hidden rounded-card bg-canvas font-ui
                    ${sourceSelected && source === 'button' && name === 'primary' ? 'outline-2 -outline-offset-2 outline-accent' : ''}`}
                  style={{ height }}>
                  <ComponentSample source={source} name={name} />
                </div>
                <span>{name}</span>
              </div>)}
            </div>)}
          </BoardChapter>
        </div>)}
    </div>
  </div>;
}

const screen = { width: 1440, height: 900 };

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
          class={`block w-full rounded-row px-[10px] py-[7px] text-left text-body leading-[1.2] ${item === filter ? 'bg-surface-sunken' : ''}`}>
          {item}
        </button>)}
    </div>}
  </div>;
}

function FramePlay({ name, zoom }: { name: string; zoom: number }) {
  const size = Math.min(32, Math.max(20, 24 * Math.sqrt(zoom))) / zoom;
  return <button aria-label={`Play from ${name}`} type="button"
    class="absolute grid place-items-center rounded-field bg-surface text-text shadow-float"
    style={{ top: 4 / zoom, right: 4 / zoom, width: size, height: size }}>
    <Icon name="play" size={size * .55} />
  </button>;
}

function SwitcherPreview({ name }: { name: string }) {
  const { current, kind, open, search, empty } = switcherFrames.find(frame => frame.name === name) ?? switcherFrames[0];
  return <div class="bg-canvas p-6"><Switcher current={current} kind={kind} open={open} search={search} empty={empty} /></div>;
}

type BoardChange = { time: number; subject: string };

function ChangeStamp({ time, subject, removed = false }: BoardChange & { removed?: boolean }) {
  const date = new Date(time);
  return <small class={`grid gap-[2px] text-meta text-text-secondary ${removed ? "leading-[1.65]" : "leading-[1.2]"}`}>
    <time datetime={date.toISOString()}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date)}</time>
    <span class="truncate" title={subject}>{subject}</span>
  </small>;
}

function BoardFrameCard({ name, badge, source = false, change, former }: {
  name: string; badge?: string; source?: boolean; change?: BoardChange; former?: { source: string; frame: string };
}) {
  const previewScale = name.startsWith('switcher-open') ? .204 : name.startsWith('switcher-empty') ? .452 : .60;
  return <article class="min-w-0 rounded-card border border-border bg-surface">
    <div class="relative grid h-[148px] place-items-center overflow-hidden rounded-t-card bg-surface-sunken">
      <div data-free aria-hidden="true" class="absolute top-1/2 left-1/2" style={{ transform: `translate(-50%, -50%) scale(${previewScale})` }}>
        <SwitcherPreview name={name} />
      </div>
    </div>
    <div class="grid gap-[3px] px-[10px] pt-2">
      <h4 class="text-body leading-[18px] font-semibold">{name}</h4>
      {source && <p class="font-mono text-meta leading-[1.45] text-text-secondary">modules/project-switcher.tsx</p>}
      {former && <p class="truncate font-mono text-meta leading-[1.45] text-text-secondary">
        From {former.source.slice('design/'.length)} · {former.frame}
      </p>}
      {change && <ChangeStamp {...change} />}
    </div>
    <div class="flex items-center justify-between gap-1 pt-1 pr-2 pb-[7px] pl-[10px]">
      {badge && <span class="rounded-pill bg-surface-sunken px-[7px] py-[3px] text-caption leading-[1.2] text-text-secondary">{badge}</span>}
      <button type="button" class="ml-auto min-h-[25px] px-1 py-[2px] text-meta leading-[1.2] text-text-secondary">Show in board</button>
    </div>
  </article>;
}

const sectionStyle = 'min-w-0 rounded-panel border border-border bg-surface p-5';
const boardAction = 'inline-flex h-(--control-size) items-center gap-[6px] rounded-row bg-surface-sunken px-[10px] text-body font-[550]';
const sourceStyle = 'font-mono text-meta';

function PlayableBoard() {
  const cards = [
    ['project-picker', 40, 337], ['switcher-open', 490, 337], ['switcher-empty', 940, 210],
    ['project-picker-instance', 940, 464], ['switcher-open-instance', 1390, 337], ['switcher-empty-instance', 1840, 337],
  ] as const;
  const routes = [
    { d: 'M1188 276 H1202 V196 H476 V403 H490', x: 839, y: 192, label: 'Click clear search' },
    { d: 'M738 395 H752 V168 H26 V395 H40', x: 389, y: 164, label: 'Click picker · Press Esc' },
    { d: 'M1188 292 H1210 V140 H18 V411 H40', x: 614, y: 136, label: 'Click picker · Press Esc' },
    { d: 'M2088 403 H2102 V112 H1376 V403 H1390', x: 1739, y: 108, label: 'Click clear search' },
    { d: 'M1638 395 H1652 V84 H926 V522 H940', x: 1289, y: 80, label: 'Click picker · Press Esc' },
    { d: 'M2088 419 H2110 V56 H918 V538 H940', x: 1514, y: 52, label: 'Click picker · Press Esc' },
    { d: 'M1638 411 H1660 V28 H10 V427 H40', x: 835, y: 24, label: 'Click atlas project' },
    { d: 'M288 411 C389 411,389 419,490 419', x: 389, y: 405, label: 'Click picker · Press ↓ · Press ↑' },
    { d: 'M738 411 C839 411,839 284,940 284', x: 839, y: 338, label: 'Type Nova' },
    { d: 'M738 427 C839 427,839 554,940 554', x: 839, y: 481, label: 'Click live instance' },
    { d: 'M1188 538 C1289 538,1289 419,1390 419', x: 1289, y: 469, label: 'Click picker · Press ↓ · Press ↑' },
    { d: 'M1638 427 C1739 427,1739 411,1840 411', x: 1739, y: 409, label: 'Type Nova' },
  ];
  return <section class={sectionStyle}>
    <header class="flex items-center justify-between">
      <h2 class="text-title leading-5 font-[650]">project-switcher</h2>
      <button type="button" class={boardAction}><Icon name="play" size={14} />Play flow</button>
    </header>
    <div class="mt-3 overflow-x-auto">
      <div class="relative h-[702px] w-[2120px]">
        <svg aria-hidden="true" data-free class="absolute inset-0" width={2120} height={702} >
          <defs><marker id="board-flow-arrow" viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto">
            <path d="M0 0L8 4L0 8Z" class="fill-text-tertiary" />
          </marker></defs>
          {routes.map(({ d }) =>
            <path key={d} d={d} marker-end="url(#board-flow-arrow)" stroke-width={1.25} class="fill-none stroke-text-tertiary" />)}
        </svg>
        {cards.map(([name, x, y], i) => <div data-free key={name} class="absolute h-[230px] w-[248px]" style={{ left: x, top: y }}>
          <BoardFrameCard name={name} badge={i === 0 ? 'Start' : undefined} source />
        </div>)}
        {routes.map(({ d, x, y, label }) => <span data-free key={d}
          class="absolute max-w-[188px] -translate-x-1/2 -translate-y-full truncate rounded-field bg-surface-sunken px-[6px] py-[3px] text-center text-caption leading-[1.2]"
          style={{ left: x, top: y }}>{label}</span>)}
      </div>
    </div>
  </section>;
}

type HistoryRow = { source: string; frame: string; status: string; former?: { source: string; frame: string }; causes?: string[]; time?: number; subject?: string };

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
    <summary class="flex items-center text-body leading-[1.2] whitespace-nowrap text-text-secondary">
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} class="mr-1" />
      <span>Global inputs changed: {files.length} files</span>
      <span class="ml-[.3em] truncate"> ({named.join(', ')}</span>
      <span>{remaining ? ', +' + remaining : ''})</span>
    </summary>
    {open && <div class="mt-[9px] grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-x-5 gap-y-3">
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
      <h2 class="mb-3 text-title leading-5 font-[650]">Direct changes</h2>
      <div class="grid grid-cols-5 gap-3">
        {direct.filter(row => row.status !== 'removed').map(row =>
          <BoardFrameCard key={row.frame} name={row.frame} former={row.former} source
            badge={row.status === 'added' ? 'New' : row.status === 'moved' ? 'Moved' : 'Edited'}
            change={{ time: row.time!, subject: row.subject! }} />)}
      </div>
      <h3 class="mt-4 text-meta leading-4 font-[550]">Removed frames</h3>
      <ul class="mt-3 list-disc pl-5 font-mono text-meta leading-[1.65] text-text-secondary">
        {removed.map(row => <li key={row.frame}>{row.source.slice('design/'.length)} · {row.frame}
          <ChangeStamp time={row.time!} subject={row.subject!} removed />
        </li>)}
      </ul>
      <button type="button" class={boardAction + ' mt-4'}>Load more</button>
    </section>
    <section class={sectionStyle}>
      <h2 class="mb-3 text-title leading-5 font-[650]">{sinceVisit ? 'Shared and global impact' : 'Shared and global impact this week'}</h2>
      {!sinceVisit && <button type="button" class={boardAction}>Show impact</button>}
    </section>
    {sinceVisit && example.filter(period => period.globalCauses).map(period => {
      const sources = [...new Set(period.rows.filter(row => row.causes).map(row => row.source))];
      return <section key={period.title} class={sectionStyle}>
        <header class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-title leading-5 font-[650]">{period.title}</h2>
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
    {derived ? <div class="absolute inset-x-0 top-[66px] px-[4vw] pt-7">
      <header class="mb-6 flex items-center gap-[18px]">
        <button type="button" class={boardAction}><Icon name="arrow-left" size={14} />All frames</button>
        <h1 class="text-[34px] leading-[1.2] font-[650] tracking-[-.025em]">{filter}</h1>
      </header>
      <div class="grid gap-4">{filter === 'Playable' ? <PlayableBoard /> : <RecentBoard sinceVisit={sinceVisit} />}</div>
    </div> : <>
      <div data-free class="absolute top-[70px] left-[190px] origin-top-left" style={{ transform: `scale(${scale})` }}>
        <div class="relative h-[3744px] w-[2888px] bg-surface">
          <BoardChapter width={2888} number={2} layer="modules" title="Project access" sourceCount={3} frameCount={18}>
            <BoardSection title="project-switcher" path="modules/project-switcher.tsx" modified="Nov 7, 13:24" />
            {([
              ['project-picker', 416, 269, 479, 437],
              ['project-picker-instance', 919.5, 269, 479, 437],
              ['switcher-open', 1423, 269, 580, 955],
              ['switcher-open-instance', 2027, 269, 580, 955],
              ['switcher-search', 416, 1007, 580, 1406],
              ['switcher-empty', 1020, 1007, 580, 1356],
              ['switcher-empty-instance', 1624, 1007, 580, 1356],
            ] as const).map(([name, left, top, width, caption]) => <figure key={name}
              class="absolute" style={{ left, top, width }}>
              <div class="relative grid place-items-center rounded-card bg-canvas" style={{ height: caption - top - 12 }}>
                <div aria-hidden="true"><SwitcherPreview name={name} /></div>
                {!menuOpen && name === 'project-picker' && <FramePlay name={name} zoom={scale} />}
              </div>
              <figcaption class="mt-3 font-mono text-meta leading-[17px]">
                {name}
                <small class="block font-ui text-meta leading-[17px] text-text-tertiary">{hubNotes.switcher}</small>
              </figcaption>
            </figure>)}
          </BoardChapter>
        </div>
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center"><ZoomBar label="63%" backDisabled /></div>
    </>}
  </Canvas>;
}

const playerButton = 'inline-flex min-h-(--control-size) items-center justify-center gap-2 rounded-field px-3 py-[6px] text-body leading-4 font-[550] disabled:opacity-50';
const playerBar = 'flex items-center gap-3 rounded-panel border border-border bg-surface px-2 py-[5px] shadow-float';

function PlayerButton({ label, icon, disabled = false, active = false }: {
  label: string; icon?: string; disabled?: boolean; active?: boolean;
}) {
  return <button type="button" disabled={disabled} class={`${playerButton} ${active ? 'bg-accent text-on-accent' : 'bg-surface-sunken'}`}>
    {icon && <Icon name={icon} size={14} />}{label}
  </button>;
}

function SettingChoices({ title, choices, selected }: { title: string; choices: string[]; selected: string }) {
  return <fieldset class="flex min-w-0 gap-[2px] rounded-field bg-surface-sunken p-1">
    <legend class="text-body font-semibold">{title}</legend>
    {choices.map(choice => <button type="button" key={choice} aria-pressed={choice === selected}
      class={`${playerButton} flex-1 ${choice === selected ? 'bg-accent text-on-accent' : 'bg-surface-sunken'}`}>
      {choice}
    </button>)}
  </fieldset>;
}

function TransitionInspector({ moment, from, to, title }: { moment: PlayerMoment; from: string; to: string; title: string }) {
  const playing = moment === 'playing';
  const paused = moment === 'paused';
  const elapsed = playing || paused ? 64 : 160;
  return <section aria-label="Transition inspector" class="rounded-panel border border-border bg-surface p-5 shadow-float">
    <div class="flex items-start justify-between gap-[10px]">
      <div>
        <small class="text-meta leading-[normal] text-text-secondary">{playing ? 'Playing transition' : paused ? 'Paused transition' : 'Last transition'}</small>
        <h2 class="my-1 text-[22px] leading-5 font-[650]">{title}</h2>
        <code class="whitespace-nowrap font-mono text-body leading-[normal]">{from} → {to}</code>
      </div>
      <div class="flex shrink-0 gap-[5px] whitespace-nowrap">
        {(playing || paused) && <PlayerButton label={playing ? 'Pause transition' : 'Resume transition'}
          active icon={playing ? 'pause' : 'play'} />}
        <PlayerButton label="Replay transition" icon="rotate-ccw" />
      </div>
    </div>
    <div class="mt-[15px] mb-2 flex items-center gap-[10px] border-t border-border pt-3 text-body">
      <span>0 ms</span>
      <input aria-label={`Scrub ${title}`} aria-valuetext={`${elapsed} milliseconds`}
        type="range" min="0" max="160" value={elapsed} class="h-4 min-w-0 flex-1 accent-(--accent)" />
      <span>160 ms</span>
    </div>
    <div class="flex items-center justify-between gap-[10px] text-meta text-text-secondary">
      <span>Duration --motion-switcher · 160 ms</span>
      <span>Easing --ease-switcher · ease-out</span>
      <strong>{elapsed} ms elapsed</strong>
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
    <div class="absolute inset-0 text-text leading-[normal]">
      <header class="absolute inset-x-5 top-3 flex items-center justify-between">
        <div class={playerBar}>
          <div class="flex items-center gap-2 border-r border-border pr-3 pl-[6px] text-title font-bold">
            <Icon name="route" size={17} /><span>Project switcher</span>
          </div>
          <button type="button" aria-expanded={settings} class={`${playerButton} bg-surface-sunken`}>
            <Icon name="settings-2" size={15} />Playback settings
            <span class="ml-[6px] whitespace-nowrap border-l border-border pl-2">{instant ? 'Reduced motion' : '1×'}</span>
          </button>
        </div>
        <nav class={playerBar} aria-label="Playback controls">
          <div class="flex items-center gap-1">
            <PlayerButton icon="arrow-left" label="Back" disabled={rest} />
            <PlayerButton icon="rotate-ccw" label="Restart" />
            <span class={`whitespace-nowrap text-meta text-text-secondary ${terminal ? '' : 'invisible'}`}>End of flow</span>
          </div>
          <PlayerButton icon="scan" label="Hotspots" active={hotspots} />
          <PlayerButton icon="map" label="Flow map" />
          <PlayerButton icon="route" label="Flow" />
          <PlayerButton icon="panel-right" label="Transition inspector" disabled={rest} />
          <PlayerButton icon="log-out" label="Exit to board" />
        </nav>
      </header>
      <div aria-hidden={underway ? "true" : undefined} class="absolute left-[493px] top-[179px] p-6 leading-normal">
        <Switcher current={terminal ? instances[0] : projects[0]} kind={terminal ? 'instance' : 'project'}
          open={!rest && !terminal} empty={instant} menuClass={underway ? 'opacity-[0.58]' : undefined} />
      </div>
      {hotspots && <div aria-hidden="true" class="absolute left-[563px] top-[209px] h-8 w-60 outline-2 outline-dashed outline-accent">
        <span class="absolute bottom-full left-0 mb-1 whitespace-nowrap bg-surface px-1 py-0.5 text-[11px]">Open project switcher</span>
      </div>}
      {flowOpen && <aside class="absolute top-[68px] right-5 w-[350px] rounded-panel border border-border bg-surface shadow-float">
        <div class="p-5">
          <small class="text-meta leading-[normal] text-text-secondary">Current frame</small>
          <h1 class="mt-2 mb-4 font-mono text-[22px] leading-7 font-[650]">{current}</h1>
          <small class="text-meta leading-[normal] text-text-secondary">Path taken</small>
          <p class="mt-2 text-meta leading-[normal]">{history.join(' › ')}</p>
          <div class="mt-3" />
        </div>
        <div class="border-t border-border p-5">
          <h2 class="text-[16px] leading-5 font-[650]">Next actions</h2>
          <div class="mt-3 flex flex-col gap-2">
              {nextActions.open.map(([label, ...gestures]) => <div key={label} class="rounded-field border border-border p-[10px]">
                <strong class="mb-[6px] block text-body">{label}</strong>
                <div class="flex flex-wrap">{gestures.map(gesture =>
                  <button key={gesture} type="button" class={`${playerButton} m-[2px] max-w-full bg-surface-sunken whitespace-normal text-left`}>{gesture}</button>)}</div>
              </div>)}
          </div>
        </div>
      </aside>}
      {inspectorOpen && <div class="absolute bottom-5 left-5 w-[640px]">
        <TransitionInspector moment={moment} from={from} to={to} title={title} />
      </div>}
      {settings && <div data-free class="absolute top-[68px] left-[184px] w-[296px] space-y-[10px] rounded-panel border border-border bg-surface p-[15px] shadow-float">
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
        <ComponentBoards camera={componentFit} />
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" inspectorDisabled />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="23%" backDisabled />
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
        <ComponentBoards camera={componentFit} sourceSelected />
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" contentsOpen detailsOpen />
      </div>
      <div class="absolute inset-x-3 top-16 flex items-start justify-between">
        <Contents {...viewerBarContents} />
        <Inspector {...viewerBarDetails} />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="23%" />
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
        <ComponentBoards camera={commentFit} />
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
