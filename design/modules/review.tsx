import { Frame, Icon } from 'adg';
import { addedFrame, changedFrame, reviewProject } from '../fixtures/review';

type Fixture = typeof changedFrame;

function Origin({ location, title, compact = false }: Fixture & { compact?: boolean }) {
  const [layer, asset] = location;
  return <div class={`flex min-w-0 ${compact ? 'flex-1 items-baseline gap-2' : 'flex-col gap-[3px]'}`}>
    <strong class={`text-[15px] leading-[1.25] font-[640] ${compact ? 'max-w-3/4 shrink-0 truncate' : 'flex items-center gap-[5px]'}`}>
      {title}<span class={`text-accent ${compact ? 'ml-[5px] inline-block align-[-2px]' : ''}`}><Icon name="arrow-up-right" size={13} /></span>
    </strong>
    <span class={`text-[11px] font-medium leading-[1.3] text-text-secondary ${compact ? 'truncate' : 'flex flex-wrap gap-[7px]'}`}>
      <span>{layer}</span><span class={compact ? 'mx-[6px]' : ''} aria-hidden="true">/</span><span>{asset}</span>
    </span>
  </div>;
}

function Control({ children, selected = false, compact = false }: { children?: unknown; selected?: boolean; compact?: boolean }) {
  return <span class={`inline-flex ${compact ? 'h-7' : 'h-[30px]'} items-center gap-[6px] rounded-[6px] border border-border px-[9px] text-meta
    ${selected ? 'bg-surface-sunken text-accent' : 'bg-surface'}`}>{children}</span>;
}

export function ReviewHeader() {
  const { name, base, head } = reviewProject;
  return <header class="flex h-14 items-center justify-between gap-[14px] border-b border-border bg-surface-section px-[38px]">
    <h1 class="flex items-baseline gap-[7px] text-[17px] font-semibold">{name}<span class="text-body font-medium text-text-secondary">Review</span></h1>
    <div class="flex items-center gap-[14px] text-caption text-text-secondary">
      <div class="flex items-center gap-[9px] text-meta"><code class="font-mono">{base}</code>
        <span aria-hidden="true" class="text-accent">→</span><code class="font-mono">{head}</code>
      </div>
      <span class="border-l border-border pl-[14px]">Dark theme</span>
    </div>
  </header>;
}

function Sample({ before = false, added = false }) {
  if (added) return <div class="rounded-panel border border-border bg-surface px-4 py-3 text-[16px] leading-6">Ready</div>;
  return <button class={`rounded-field px-3 py-2 text-[16px] leading-6 ${before ? 'border border-border bg-surface text-text' : 'bg-accent text-on-accent'}`}>Save changes</button>;
}

function Pane({ label, added = false }: { label: 'Before' | 'After' | 'Difference'; added?: boolean }) {
  return <figure class="min-w-0">
    {!added && <figcaption class="flex items-baseline justify-between gap-2 px-px pb-[6px] text-[11px] font-[630] text-text-secondary">
      <span>{label}</span>{label === 'Difference' && <small class="text-[10px] font-normal tabular-nums">20,810 px changed</small>}
    </figcaption>}
    <div class="grid min-h-10 place-items-center rounded-[7px] bg-surface-sunken py-[8px]">
      {label === 'Difference' ? <span class="h-10 w-[125px] rounded-field bg-danger/25" />
        : <Sample before={label === 'Before'} added={added} />}
    </div>
  </figure>;
}

export function ReviewFrameCard(fixture: Fixture) {
  return <article class="min-w-0 overflow-hidden rounded-[11px] border border-border bg-surface">
    <header class="flex items-center gap-[10px] border-b border-border px-3 py-1.5">
      <Origin {...fixture} compact />
      <button type="button" aria-label={`Enlarge ${fixture.title}`} class="grid size-7 shrink-0 place-items-center rounded-[6px] border border-border bg-surface">
        <Icon name="maximize" size={15} />
      </button>
    </header>
    <div class={`grid gap-[10px] p-3 pt-[11px] ${fixture.added ? 'grid-cols-1' : 'grid-cols-3'}`}>
      {!fixture.added && <Pane label="Before" />}
      <Pane label="After" added={fixture.added} />
      {!fixture.added && <Pane label="Difference" />}
    </div>
  </article>;
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return <header class="mb-[13px] flex items-baseline justify-between border-b border-border pb-[10px]">
    <h2 class="text-[22px] font-[650] leading-[1.5] tracking-tight">{title}</h2>
    <span class="text-meta text-text-secondary">{count} {count === 1 ? 'frame' : 'frames'}</span>
  </header>;
}

export function ReviewLayout() {
  return <div class="h-full w-full overflow-hidden bg-canvas text-body leading-[1.5] text-text">
    <ReviewHeader />
    <main class="flex flex-col gap-[42px] px-[38px] pt-[21px]">
      <section><SectionTitle title="Added" count={1} /><div class="grid grid-cols-2 gap-[14px]"><ReviewFrameCard {...addedFrame} /></div></section>
      <section><SectionTitle title="Direct changes" count={1} /><ReviewFrameCard {...changedFrame} /></section>
    </main>
  </div>;
}

export function ReviewZoom() {
  return <div class="flex h-full flex-col overflow-hidden rounded-panel border border-border bg-surface-section">
    <header class="flex items-center justify-between gap-[10px] border-b border-border px-[15px] py-3">
      <Origin {...changedFrame} />
      <div class="flex items-center gap-[6px]">
        <Control>−</Control><span class="w-[38px] text-center font-mono text-meta text-text-secondary">100%</span>
        <Control>+</Control><Control>Fit</Control><Control>100%</Control><span class="ml-1"><Control><Icon name="x" size={18} /></Control></span>
      </div>
    </header>
    <div class="flex gap-[5px] px-[15px] pt-[9px]"><Control compact>Compare</Control><Control compact>Before</Control>
      <Control compact selected>After</Control><Control compact>Difference</Control></div>
    <div class="flex min-h-0 grow flex-col p-[15px] pt-3">
      <p class="px-px pb-[6px] text-[11px] font-[630] text-text-secondary">After</p>
      <div class="grid grow place-items-center rounded-[7px] bg-surface-sunken">
        <Sample />
      </div>
    </div>
  </div>;
}

export default () => [
  <Frame name="review-header" width={1100}><div class="w-[1100px]"><ReviewHeader /></div></Frame>,
  <Frame name="review-frame-card-added" width={540}><div class="w-[540px]"><ReviewFrameCard {...addedFrame} /></div></Frame>,
  <Frame name="review-frame-card-changed" width={900}><div class="w-[900px]"><ReviewFrameCard {...changedFrame} /></div></Frame>,
  <Frame name="review-layout" width={1440} height={900}><div class="h-[900px] w-[1440px]"><ReviewLayout /></div></Frame>,
  <Frame name="review-zoom" width={1440} height={900}><div class="h-[900px] w-[1440px] p-[17px]"><ReviewZoom /></div></Frame>,
];
