import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { IconButton } from '../components/icon-button';
import { boardChapterSpecimen, minimapSpecimen } from '../fixtures/canvas';

export function BoardChapter({
  number = 1,
  project = 'agent-design-gallery',
  layer = 'Components',
  title,
  sourceCount,
  frameCount,
  countLabel = 'frames',
  width = 1680,
  titleTracking,
  eyebrowTracking,
  children,
}: any) {
  const sourcesText = `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`;
  return (
    <article class="bg-surface px-20 pt-16 pb-20 text-text" style={{ width }}>
      <header class="flex items-end justify-between gap-16 pb-14">
        <div>
          <p style={{ letterSpacing: eyebrowTracking }} class="flex items-center gap-3 text-caption font-semibold tracking-[2px] text-text-tertiary uppercase">
            <span
              class="grid h-7 min-w-7 place-items-center rounded-pill bg-text px-[6px]
                font-mono text-caption tracking-normal text-surface"
            >
              {String(number).padStart(2, '0')}
            </span>
            <span>
              {project} · {layer}
            </span>
          </p>
          <h1 style={{ letterSpacing: titleTracking }} class="mt-4 text-[48px] leading-[56px] font-semibold">{title}</h1>
        </div>
        <p class="shrink-0 text-right text-body text-text-secondary">
          {sourcesText} · {frameCount} {countLabel}
        </p>
      </header>
      {children}
    </article>
  );
}

export function BoardSection({ title, path, modified, selected = false, copied = false, wide = false, children }: any) {
  return (
    <section class="grid grid-cols-[280px_minmax(0,1fr)] gap-14 border-t border-border py-12">
      <div class="w-[280px]">
        <button type="button" class="flex items-center gap-[6px] text-left text-[22px] leading-[28px] font-semibold">
          <span>{title}</span>
          {(copied || selected) && (
            <Icon name={copied ? 'check' : 'copy'} size={14} class="shrink-0 text-text-tertiary" />
          )}
        </button>
        <p class="mt-5 flex items-center gap-[6px] font-mono text-caption text-text-tertiary">
          <Icon name="file-code" size={12} class="shrink-0" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{path}</span>
        </p>
        {modified && <p class="mt-2 text-caption text-text-tertiary">{modified}</p>}
      </div>
      <div class={`grid min-w-0 items-start gap-x-6 gap-y-8 ${wide ? 'grid-cols-24' : 'grid-cols-12'}`}>{children}</div>
    </section>
  );
}

export function SpecimenWell({ name, note, proposed, span = 6, surface = false, selected = false, captionAction, overlayAction = false, dimmed = false, children }: any) {
  const colSpan =
    span === 12
      ? 'col-span-12'
      : span === 8
        ? 'col-span-8'
        : span === 6
          ? 'col-span-6'
          : span === 4
            ? 'col-span-4'
            : 'col-span-3';
  const ring = selected ? 'outline-2 -outline-offset-2 outline-accent' : '';
  const detail = proposed ? (note ? `${note} · Proposed: ${proposed}` : `Proposed: ${proposed}`) : note;

  return (
    <figure class={`flex min-w-0 flex-col gap-3 ${colSpan}${dimmed ? ' opacity-40' : ''}`} style={{ '--span': span }}>
      <div class={`flex min-h-24 items-center justify-center rounded-card bg-canvas px-6 py-8 ${ring}`}>
        {surface ? <div class="border border-border">{children}</div> : children}
      </div>
      <figcaption class={`flex flex-col font-mono text-meta leading-[17px] ${overlayAction ? 'relative' : 'gap-[2px]'}`}>
        {captionAction ? <div class="flex items-center justify-between gap-2"><span>{name}</span>{captionAction}</div> : <span>{name}</span>}
        {detail && <small class="font-ui text-meta leading-[17px] text-text-tertiary">{detail}</small>}
      </figcaption>
    </figure>
  );
}

export function Minimap({
  boxes = [],
  viewport = [90, 12, 98, 68],
}: {
  boxes?: number[][];
  viewport?: number[];
}) {
  const [vx, vy, vw, vh] = viewport;
  return (
    <div class="h-[132px] w-[200px] overflow-hidden rounded-card bg-surface shadow-float">
      <svg data-free width={200} height={132}>
        {boxes.map(([x, y, width, height]) => (
          <rect x={x} y={y} width={width} height={height} rx={4} class="fill-surface-section stroke-border" />
        ))}
        <rect x={vx} y={vy} width={vw} height={vh} rx={0} stroke-width={1} class="fill-none stroke-accent" />
      </svg>
    </div>
  );
}

const { sections, ...chapterMeta } = boardChapterSpecimen;

export default () => [
  <Frame name="board-chapter">
    <BoardChapter {...chapterMeta}>
      {sections.map(({ specimens, ...section }) => (
        <BoardSection {...section}>
          {specimens.map(({ kind, props, ...well }) => (
            <SpecimenWell {...well}>
              {kind === 'button' ? <Button {...props} /> : <IconButton {...props} />}
            </SpecimenWell>
          ))}
        </BoardSection>
      ))}
    </BoardChapter>
  </Frame>,
  <Frame name="minimap">
    <Minimap {...minimapSpecimen} />
  </Frame>,
];
