import { Frame, Icon } from 'adg';
import { IconButton } from '../components/icon-button';
import { addedFrame, changedFrame, reviewProject } from '../fixtures/review';

type ReviewCardFixture = typeof changedFrame;
type EmbedTarget = 'codex' | 'antigravity';

function ReviewOptions({ zoom = false }: { zoom?: boolean }) {
  return (
    <div class="flex flex-wrap items-center gap-[6px] [--control-size:26px]">
      <div role="group" aria-label="Preview theme" class="flex gap-px rounded-row bg-surface-sunken p-[2px]">
        <IconButton icon="sun" iconSize={15} label="Light" pressed={false} />
        <IconButton icon="moon" iconSize={15} label="Dark" form="active" pressed />
      </div>
      <div role="group" aria-label="Comparison mode" class="flex gap-px rounded-row bg-surface-sunken p-[2px]">
        <IconButton icon="columns-2" iconSize={15} label="Split view" pressed={false} />
        <IconButton icon="arrow-left-right" iconSize={15} label="Slider view" form="active" pressed />
      </div>
      {zoom ? (
        <div role="group" aria-label="Zoom" class="ml-auto flex items-center gap-px rounded-row bg-surface-sunken p-[2px]">
          <IconButton icon="minus" iconSize={15} label="Zoom out" />
          <span class="w-8 text-center text-caption">Fit</span>
          <IconButton icon="plus" iconSize={15} label="Zoom in" />
          <IconButton icon="scan" iconSize={15} label="Fit to width" />
        </div>
      ) : (
        <>
          <span class="text-caption text-text-secondary">1 added · 1 changed</span>
          <code class="ml-auto font-mono text-caption text-text-secondary">
            {reviewProject.base.slice(0, 8)} → {reviewProject.head.slice(0, 8)}
          </code>
        </>
      )}
    </div>
  );
}

function ReviewComparison({ added = false, enlarged = false }: { added?: boolean; enlarged?: boolean }) {
  const height = enlarged ? 'h-[172px]' : added ? 'h-[54px]' : 'h-[46px]';
  const scale = enlarged ? 'scale-[4]' : '';
  return (
    <div>
      <div class="flex justify-between px-[3px] pb-[2px] text-caption text-text-secondary">
        {!added && <span>Before</span>}
        <span>After</span>
      </div>
      <div class={`relative grid place-items-center overflow-hidden rounded-artboard bg-review-well ${height}`}>
        {added ? (
          <div class="rounded-panel border border-border bg-surface px-4 py-3 text-[16px] leading-6">Ready</div>
        ) : (
          <>
            <div class="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
              <div class="absolute inset-y-0 left-0 grid w-[200%] place-items-center">
                <div class={`rounded-field border border-border bg-surface px-3 py-2 text-[16px] leading-6 ${scale}`}>Save changes</div>
              </div>
            </div>
            <div class="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
              <div class="absolute inset-y-0 right-0 grid w-[200%] place-items-center">
                <div class={`rounded-field bg-accent px-3 py-2 text-[16px] leading-6 text-on-accent ${scale}`}>Save changes</div>
              </div>
            </div>
            <div aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 grid w-px place-items-center bg-text">
              <span class="grid size-4 -translate-x-1/2 place-items-center rounded-pill border border-border bg-surface"><Icon name="arrow-left-right" size={10} /></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function EmbedFrameCard({ frame, target }: { frame: ReviewCardFixture; target: EmbedTarget }) {
  return (
    <article class="min-w-0 rounded-row border border-border bg-surface px-[6px] pt-[3px] pb-[6px]">
      <header class="flex min-h-[27px] flex-wrap items-center gap-[5px] pl-[2px] [--control-size:27px]">
        <h2 class="text-body font-semibold underline underline-offset-2">{frame.title}</h2>
        {frame.added && <span class="rounded-keycap bg-surface-sunken px-1 text-caption text-text-secondary">Added</span>}
        <div class="ml-auto flex gap-[2px]">
          <IconButton icon="maximize-2" iconSize={15} label={`Enlarge ${frame.title}`} />
          {target === 'codex' && <IconButton icon="message-square-plus" iconSize={15} label="Use this frame in Codex" />}
        </div>
      </header>
      <ReviewComparison added={frame.added} />
    </article>
  );
}

export function EmbedReview({ target }: { target: EmbedTarget }) {
  return (
    <div class="w-full bg-canvas font-ui text-body text-text">
      <div class="mb-[6px]"><ReviewOptions /></div>
      <div class="grid gap-[6px]">
        <EmbedFrameCard frame={addedFrame} target={target} />
        <EmbedFrameCard frame={changedFrame} target={target} />
      </div>
    </div>
  );
}

export function EmbedReviewDetail() {
  return (
    <div class="w-full rounded-[11px] border border-border bg-surface font-ui text-body text-text">
      <header class="flex items-center justify-between border-b border-border px-[10px] py-2 [--control-size:27px]">
        <div><strong>Primary</strong><small class="block text-caption text-text-secondary">Components · Button · {changedFrame.size}</small></div>
        <IconButton icon="x" iconSize={15} label="Close enlarged view" />
      </header>
      <div class="px-[10px] pt-[7px]"><ReviewOptions zoom /></div>
      <div class="px-[10px] pt-2 pb-[10px]"><ReviewComparison enlarged /></div>
    </div>
  );
}

export default () => [
  <Frame name="embed-frame-added" width={520}><div class="w-[520px]"><EmbedFrameCard frame={addedFrame} target="antigravity" /></div></Frame>,
  <Frame name="embed-frame-changed" width={520}><div class="w-[520px]"><EmbedFrameCard frame={changedFrame} target="codex" /></div></Frame>,
];
