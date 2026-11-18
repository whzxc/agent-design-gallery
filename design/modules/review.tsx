import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { CommentPin } from '../components/comment-pin';
import { Panel } from '../components/panel';
import {
  reviewAddedCard,
  reviewCounts,
  reviewDirectCard,
  reviewEmptyCounts,
  reviewFailures,
  reviewHeader,
  reviewInheritedGroup,
  type ReviewCounts,
  type ReviewFailure,
} from '../fixtures/review';

function CountPill({ value, label, live }: { value: number; label: string; live: boolean }) {
  const classes = `inline-flex items-center gap-[5px] rounded-pill bg-surface-sunken px-[10px] py-1
    text-meta leading-[1.2] text-text-secondary ${value === 0 ? 'opacity-60' : ''}`;
  const content = (
    <>
      <strong class="font-mono font-[650] text-text">{value}</strong>
      <span>{label}</span>
    </>
  );
  return live && value > 0 ? (
    <button type="button" class={classes}>
      {content}
    </button>
  ) : (
    <span class={classes}>{content}</span>
  );
}

export function ReviewHeader({
  label = reviewHeader.label,
  base = reviewHeader.base,
  head = reviewHeader.head,
  counts = reviewCounts,
  live = true,
  activeTheme,
  theme,
}: {
  label?: string;
  base?: string;
  head?: string;
  counts?: ReviewCounts;
  live?: boolean;
  activeTheme?: 'light' | 'dark';
  theme?: 'light' | 'dark';
}) {
  const selectedTheme = activeTheme ?? theme ?? 'light';
  const changedLabel = `changed (direct ${counts.direct}, inherited ${counts.inherited})`;

  return (
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border bg-surface px-5 py-4">
      <div class="mr-auto flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2">
        <h1 class="text-title leading-5 font-[650] text-text">{label}</h1>
        <code class="font-mono text-meta text-text-secondary">
          base {base} → {head}
        </code>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <CountPill value={counts.added} label="added" live={live} />
        <CountPill value={counts.removed} label="removed" live={live} />
        <CountPill value={counts.moved} label="moved" live={live} />
        <CountPill value={counts.changed} label={changedLabel} live={live} />
      </div>
      {live && (
        <div class="flex items-center gap-2">
          <div role="group" aria-label="Review theme" class="inline-flex items-center gap-[2px] rounded-field bg-surface-sunken p-[3px]">
            {(['light', 'dark'] as const).map(choice => (
              <button
                type="button"
                aria-pressed={selectedTheme === choice}
                class={`h-6 rounded-keycap px-2 text-meta leading-none font-[550] capitalize
                  ${selectedTheme === choice ? 'bg-surface text-text' : 'text-text-secondary'}`}
              >
                {choice}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="inline-flex h-[30px] items-center gap-[6px] rounded-field border border-border bg-surface
              px-[10px] text-meta leading-none font-[550] text-text-secondary"
          >
            <span>Exit review</span>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
    </header>
  );
}

export function ReviewFailures({ failures = reviewFailures }: { failures?: ReviewFailure[] }) {
  return (
    <section role="alert" class="rounded-row border border-border bg-surface-sunken p-4">
      <h2 class="mb-2 text-section font-[650] text-danger">Some sources could not be built</h2>
      <ul class="flex list-disc flex-col gap-2 pl-5 text-body text-text-secondary">
        {failures.map(failure => (
          <li class="[overflow-wrap:anywhere]">
            <code class="font-mono text-meta text-text">{failure.source}</code> ({failure.side}) — {failure.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReviewFrameCard({
  source = reviewDirectCard.source,
  frame = reviewDirectCard.frame,
  status = reviewDirectCard.status,
  statusLabel,
  theme = reviewDirectCard.theme,
  meta = reviewDirectCard.meta,
  live = true,
  showPin = false,
  pinNumber,
  beforeLabel = reviewDirectCard.beforeLabel,
  afterLabel = reviewDirectCard.afterLabel,
}: any) {
  const isAdded = status === 'added';
  const pin = pinNumber ?? (showPin ? 2 : undefined);
  const stageClass = 'flex min-h-24 items-center justify-center rounded-row border border-border bg-canvas p-[10px]';

  return (
    <article class="overflow-hidden rounded-menu border border-border bg-surface-section">
      <header class="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <h3 class="min-w-0 text-body font-semibold text-text">
          <code class="font-mono text-meta text-text-secondary [overflow-wrap:anywhere]">
            {source}#{frame}
          </code>
        </h3>
        <div class="flex shrink-0 items-center gap-2">
          <span class="rounded-pill bg-surface-sunken px-2 py-[2px] text-caption font-semibold text-text-secondary capitalize">
            {statusLabel ?? status}
          </span>
          {live && status !== 'removed' && (
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded-row border border-border bg-surface
                px-2 text-caption leading-none font-[550] text-text-secondary"
            >
              <span>Open on board</span>
              <Icon name="arrow-up-right" size={12} />
            </button>
          )}
        </div>
      </header>
      <div class="flex flex-col gap-[10px] bg-surface px-4 pt-[14px] pb-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-meta font-[650] text-text capitalize">{theme}</span>
          <span class="font-mono text-caption text-text-tertiary">{meta}</span>
        </div>
        <div class={`grid items-start gap-3 ${isAdded ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {!isAdded && (
            <figure class="flex min-w-0 flex-col gap-[6px]">
              <figcaption class="text-caption font-[550] text-text-secondary">Before</figcaption>
              <div class={stageClass}>
                <Button form="secondary" label={beforeLabel} />
              </div>
            </figure>
          )}
          <figure class="flex min-w-0 flex-col gap-[6px]">
            <figcaption class="text-caption font-[550] text-text-secondary">After</figcaption>
            <div class={stageClass}>
              <div class="relative">
                <Button form={isAdded ? 'secondary' : 'primary'} label={afterLabel} />
                {pin !== undefined && (
                  <div class="absolute -top-[22px] -right-7">
                    <CommentPin number={pin} target={`${source}#${frame}`} />
                  </div>
                )}
              </div>
            </div>
          </figure>
          {!isAdded && (
            <figure class="flex min-w-0 flex-col gap-[6px]">
              <figcaption class="text-caption font-[550] text-text-secondary">Difference</figcaption>
              <div class={stageClass}>
                <div
                  class="flex h-(--control-size) w-[116px] items-center justify-center
                    rounded-field border border-danger bg-danger/15 px-3"
                >
                  <span class="h-2 w-full rounded-pill bg-danger/35" />
                </div>
              </div>
            </figure>
          )}
        </div>
      </div>
    </article>
  );
}

export function ReviewInheritedGroup({
  causes = reviewInheritedGroup.causes,
  count = reviewInheritedGroup.count,
  representative = reviewInheritedGroup.representative,
  remainingCount = reviewInheritedGroup.remainingCount,
  live = true,
}: any) {
  return (
    <article class="flex flex-col gap-[14px] rounded-menu border border-border bg-surface p-4">
      <header class="flex items-baseline justify-between gap-3">
        <h3 class="font-mono text-meta text-text [overflow-wrap:anywhere]">
          {causes.map((cause: string, i: number) => (
            <>
              {i > 0 && ', '}
              <code>{cause}</code>
            </>
          ))}
        </h3>
        <span class="shrink-0 text-body text-text-secondary">
          {count} {count === 1 ? 'frame' : 'frames'}
        </span>
      </header>
      <ReviewFrameCard {...representative} statusLabel="Representative" live={live} />
      {remainingCount > 0 && (
        <details>
          <summary class="text-meta font-[550] text-text-secondary">
            Show {remainingCount} more inherited {remainingCount === 1 ? 'frame' : 'frames'}
          </summary>
        </details>
      )}
    </article>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <h2 class="flex items-center gap-2 text-section font-[650] text-text">
      <span>{title}</span>
      <span
        class="inline-flex h-5 min-w-[22px] items-center justify-center rounded-pill bg-surface-sunken
          px-[6px] font-mono text-caption leading-none font-semibold text-text-secondary"
      >
        {count}
      </span>
    </h2>
  );
}

export function ReviewView({
  width = 1416,
  height,
  label = reviewHeader.label,
  base = reviewHeader.base,
  head = reviewHeader.head,
  counts,
  live = true,
  activeTheme,
  theme,
  empty = false,
  failures = [],
  added = [reviewAddedCard],
  direct = [reviewDirectCard],
  inherited = [reviewInheritedGroup],
  showPin = true,
}: any) {
  const effectiveCounts = counts ?? (empty ? reviewEmptyCounts : reviewCounts);

  return (
    <Panel width={width} height={height}>
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel">
        <ReviewHeader
          label={label}
          base={base}
          head={head}
          counts={effectiveCounts}
          live={live}
          activeTheme={activeTheme}
          theme={theme}
        />
        <div class="flex min-h-0 flex-1 flex-col gap-7 overflow-auto p-5">
          {failures.length > 0 && <ReviewFailures failures={failures} />}
          {empty ? (
            <p role="status" class="my-3 text-body text-text-secondary">
              No added, removed, moved, or changed frames against <code class="font-mono text-meta">{base}</code>.
            </p>
          ) : (
            <>
              {added.length > 0 && (
                <section class="flex flex-col gap-[14px]">
                  <SectionHeading title="Added" count={added.length} />
                  <div class="flex flex-col gap-4">
                    {added.map((card: any) => (
                      <ReviewFrameCard {...card} live={live} />
                    ))}
                  </div>
                </section>
              )}
              {direct.length > 0 && (
                <section class="flex flex-col gap-[14px]">
                  <SectionHeading title="Direct changes" count={direct.length} />
                  <div class="flex flex-col gap-4">
                    {direct.map((card: any, index: number) => (
                      <ReviewFrameCard {...card} live={live} showPin={showPin && index === 0} />
                    ))}
                  </div>
                </section>
              )}
              {inherited.length > 0 && (
                <section class="flex flex-col gap-[14px]">
                  <SectionHeading title="Inherited changes" count={effectiveCounts.inherited} />
                  <div class="flex flex-col gap-4">
                    {inherited.map((group: any) => (
                      <ReviewInheritedGroup {...group} live={live} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default () => [
  <Frame name="review-header">
    <div class="w-[1080px] overflow-hidden rounded-panel border border-border bg-surface">
      <ReviewHeader />
    </div>
  </Frame>,
  <Frame name="review-failures">
    <div class="w-[760px]">
      <ReviewFailures />
    </div>
  </Frame>,
  <Frame name="review-frame-card">
    <div class="w-[880px]">
      <ReviewFrameCard showPin />
    </div>
  </Frame>,
  <Frame name="review-inherited-group">
    <div class="w-[912px]">
      <ReviewInheritedGroup />
    </div>
  </Frame>,
  <Frame name="review-empty">
    <ReviewView width={960} empty />
  </Frame>,
];
