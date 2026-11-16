import { Icon } from "adg";

// Board primitives: chapter pages that reference declared frames instead of redrawing them.
export type FrameLike = { name: string; width?: number; height?: number; html: string; note?: string; source?: string };
type Source = () => FrameLike | FrameLike[];

/** Index a source's declared frames by name, tagged with the source path so specimens carry their identity. */
export const framesOf = (source: Source, path: string): Record<string, FrameLike> =>
  Object.fromEntries(([] as FrameLike[]).concat(source()).map((frame) => [frame.name, { ...frame, source: path }]));

export function Board({ eyebrow, title, intro, chapter, children }: { eyebrow: string; title: string; intro: string; chapter: string; children?: unknown }) {
  return (
    <article class="w-[1680px] bg-surface font-ui text-text px-20 pt-16 pb-20">
      <header class="grid grid-cols-[1fr_440px] items-end gap-16 pb-14">
        <div class="flex flex-col gap-4">
          <p class="flex items-center gap-3 text-caption font-semibold tracking-[.16em] uppercase text-text-tertiary">
            <span class="grid size-7 place-items-center rounded-pill bg-action text-on-action font-mono tracking-normal">{chapter}</span>
            {eyebrow}
          </p>
          <h1 class="text-[48px] leading-[56px] font-semibold tracking-[-0.02em]">{title}</h1>
        </div>
        <p class="text-small leading-description text-text-secondary">{intro}</p>
      </header>
      <div class="flex flex-col">{children}</div>
    </article>
  );
}

export function Section({ title, description, sources = [], children }: { title: string; description: string; sources?: string[]; children?: unknown }) {
  return (
    <section class="grid grid-cols-[280px_1fr] gap-14 border-t border-border py-12">
      <div class="flex flex-col gap-3">
        <h2 class="text-[22px] leading-[28px] font-semibold tracking-[-0.01em]">{title}</h2>
        <p class="text-small leading-description text-text-secondary">{description}</p>
        {sources.length > 0 && (
          <ul class="mt-2 flex flex-col gap-1">
            {sources.map((source) => (
              <li class="flex items-center gap-[6px] font-mono text-caption text-text-tertiary">
                <Icon name="file-code-2" size={12} />
                {source}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="flex min-w-0 flex-col gap-10">{children}</div>
    </section>
  );
}

export function Group({ title, note, children }: { title: string; note?: string; children?: unknown }) {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-baseline gap-3">
        <h3 class="text-small font-semibold">{title}</h3>
        {note && <p class="text-meta text-text-tertiary">{note}</p>}
      </div>
      {children}
    </div>
  );
}

const columns = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 5: "grid-cols-5", 6: "grid-cols-6", 7: "grid-cols-7", 8: "grid-cols-8" } as const;
export function Grid({ cols = 3, children }: { cols?: keyof typeof columns; children?: unknown }) {
  return <div class={`grid items-start gap-x-6 gap-y-8 ${columns[cols]}`}>{children}</div>;
}

/** One declared frame on the canvas backdrop, captioned with its frame name.
 *  stage="desktop" gives a frame without a declared width the full well, the way a layer host does on desktop. */
export function Specimen({ frame, label, note, wide = false, stage }: { frame: FrameLike; label?: string; note?: string; wide?: boolean; stage?: "desktop" }) {
  return (
    <figure data-specimen={`${frame.source ?? ""}#${frame.name}`} class={`flex min-w-0 flex-col gap-3 ${wide ? "col-span-full" : ""}`}>
      <div class="flex min-h-[96px] items-center justify-center overflow-hidden rounded-card bg-canvas px-6 py-8">
        <div style={`width:${frame.width ? `${frame.width}px` : stage === "desktop" ? "100%" : "max-content"};${frame.height ? `height:${frame.height}px;` : ""}`}>{frame}</div>
      </div>
      <figcaption class="flex flex-col gap-[2px]">
        <span class="font-mono text-meta text-text">{label ?? frame.name}</span>
        {(note ?? frame.note) && <span class="text-meta leading-[17px] text-text-tertiary">{note ?? frame.note}</span>}
      </figcaption>
    </figure>
  );
}

/** Labelled state matrix: rows are variants, columns are states. Cells call components directly, so they are derived views, not declared frames. */
export function Matrix({ columns: heads, rows }: { columns: string[]; rows: { label: string; note?: string; cells: unknown[] }[] }) {
  return (
    <div data-derived="matrix" class="overflow-hidden rounded-card bg-canvas">
      <div class="grid grid-cols-[180px_repeat(var(--cols),minmax(0,1fr))] items-center gap-x-6 px-6" style={`--cols:${heads.length}`}>
        <span />
        {heads.map((head) => (
          <span class="py-4 text-caption font-semibold tracking-[.08em] uppercase text-text-tertiary">{head}</span>
        ))}
        {rows.map((row) => [
          <div class="flex flex-col gap-[2px] border-t border-border py-5">
            <span class="text-small font-medium">{row.label}</span>
            {row.note && <span class="text-meta text-text-tertiary">{row.note}</span>}
          </div>,
          ...row.cells.map((cell) => <div class="flex items-center border-t border-border py-5">{cell ?? <span class="text-meta text-text-tertiary">—</span>}</div>),
        ])}
      </div>
    </div>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "gap"; children?: unknown }) {
  return (
    <p class={`flex items-start gap-2 rounded-field px-4 py-3 text-meta leading-[18px] ${tone === "gap" ? "bg-warning/10 text-warning" : "bg-surface-subtle text-text-secondary"}`}>
      <Icon name={tone === "gap" ? "triangle-alert" : "info"} size={14} class="mt-[2px] shrink-0" />
      <span>{children}</span>
    </p>
  );
}
