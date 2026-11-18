import { Frame, Icon } from 'adg';
import { Panel } from '../components/panel';
import { tokenGroups, tokenSource, type TokenGroup } from '../fixtures/tokens';

const boardSurfaces = [
  ['--canvas', '#ecece9', '#121212'],
  ['--dot', '#d2d2ce', '#262626'],
  ['--surface', '#ffffff', '#1f1f1f'],
  ['--surface-section', '#f5f5f3', '#191919'],
  ['--surface-sunken', '#f1f1ee', '#2a2a2a'],
  ['--border', '#e2e2de', '#2d2d2d'],
] as const;

const boardAccents = [
  ['--text', '#1c1c1a', '#efefed'],
  ['--text-secondary', '#5b5b57', '#a8a8a4'],
  ['--text-tertiary', '#7c7c77', '#85857f'],
  ['--accent', '#1c1c1a', '#efefed'],
  ['--on-accent', '#ffffff', '#1c1c1a'],
  ['--danger', '#c2453b', '#f08b80'],
] as const;

const boardTypeScale = [
  ['--text-title', '15px', 'text-title'],
  ['--text-section', '14px', 'text-section'],
  ['--text-body', '13px', 'text-body'],
  ['--text-meta', '12px', 'text-meta'],
  ['--text-caption', '11px', 'text-caption'],
] as const;

const boardShapes = [
  ['--radius-dialog', '16px', 'rounded-dialog'],
  ['--radius-panel', '14px', 'rounded-panel'],
  ['--radius-menu', '12px', 'rounded-menu'],
  ['--radius-field', '9px', 'rounded-field'],
  ['--radius-row', '8px', 'rounded-row'],
  ['--radius-pill', '999px', 'rounded-pill'],
] as const;

const boardSizes = [
  ['--toolbar-height', '44px', 44],
  ['--field-height', '32px', 32],
  ['--control-size', '32px', 32],
  ['--menu-item-height', '30px', 30],
  ['--row-height', '28px', 28],
  ['--keycap-size', '22px', 22],
] as const;

const catalogSpecimenGroups: TokenGroup[] = tokenGroups.flatMap(group => {
  if (group.label === 'Colors') return [{ ...group, rows: group.rows.slice(0, 6) }];
  if (group.label === 'Typography') return [{ ...group, rows: group.rows.slice(0, 6) }];
  if (group.label === 'Spacing & size' || group.label === 'Radii') return [group];
  return [];
});

function TokenPreview({ value, group }: { value: string; group: string }) {
  if (group === 'Colors') {
    return (
      <span
        data-brand
        aria-hidden="true"
        class="size-5 shrink-0 rounded-artboard border border-border bg-[var(--swatch)]"
        style={{ '--swatch': value }}
      />
    );
  }
  if (!/^\d+px$/.test(value)) return null;
  if (group === 'Spacing & size') {
    return (
      <span aria-hidden="true" class="flex w-14 shrink-0 items-center">
        <span class="flex h-2 max-w-full items-center border-x border-text-tertiary" style={{ width: value }}>
          <span class="h-px w-full bg-text-tertiary" />
        </span>
      </span>
    );
  }
  if (group === 'Radii') {
    return (
      <span
        aria-hidden="true"
        class="h-12 w-14 shrink-0 rounded-[var(--sample-radius)] border border-border bg-surface-sunken"
        style={{ '--sample-radius': value }}
      />
    );
  }
  return null;
}

function TokenValue({ value, group, inherited }: { value: string; group: string; inherited?: boolean }) {
  return (
    <td class="border-b border-border py-2 pr-5 align-middle">
      <div class="flex items-center gap-2">
        <TokenPreview value={value} group={group} />
        <code
          class={`font-mono text-meta [overflow-wrap:anywhere] ${inherited ? 'text-text-secondary' : 'text-text'}`}
          title={inherited ? 'Inherits light declaration' : undefined}
        >
          {value}
        </code>
      </div>
    </td>
  );
}

export function TokenCatalog({
  groups,
  source,
  width = 1144,
  height,
  boardButton = true,
  status = 'No matching tokens.',
}: {
  groups: TokenGroup[];
  source: string;
  width?: number;
  height?: number;
  boardButton?: boolean;
  status?: string;
}) {
  return (
    <Panel width={width} height={height}>
      <header class="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div class="flex min-w-0 flex-1 items-baseline gap-3">
          <h2 class="text-title leading-[1.5] font-[650]">Tokens</h2>
          <code class="min-w-0 truncate font-mono text-meta leading-[1.5] text-text-secondary">{source}</code>
        </div>
        {boardButton && (
          <button
            type="button"
            class="inline-flex h-(--control-size) shrink-0 items-center gap-[6px] rounded-row bg-surface-sunken
              px-[10px] text-body font-[550] text-text"
          >
            <Icon name="layout-grid" size={14} class="text-text-secondary" />
            <span>Board view</span>
          </button>
        )}
      </header>
      <div class="min-h-0 overflow-auto px-5 pb-3">
        {groups.length ? (
          <table class="w-full table-fixed border-collapse text-left">
            <thead class="sticky top-0 bg-surface text-meta text-text-secondary">
              <tr>
                <th scope="col" class="w-[28%] border-b border-border py-3 pr-5 font-[550]">
                  Token
                </th>
                <th scope="col" class="w-[36%] border-b border-border py-3 pr-5 font-[550]">
                  Light
                </th>
                <th scope="col" class="w-[36%] border-b border-border py-3 pr-5 font-[550]">
                  Dark
                </th>
              </tr>
            </thead>
            {groups.map(({ label, rows }) => (
              <tbody>
                <tr>
                  <th scope="rowgroup" colSpan={3} class="border-b border-border pt-4 pb-2 text-body font-[650]">
                    {label}
                  </th>
                </tr>
                {rows.map(([name, light, dark]) => (
                  <tr>
                    <th scope="row" class="border-b border-border py-1 pr-5 font-normal">
                      <button
                        type="button"
                        aria-label={`Copy ${name}`}
                        class="group flex min-h-7 max-w-full items-center gap-1 rounded-row text-left"
                      >
                        <code class="font-mono text-meta [overflow-wrap:anywhere]">{name}</code>
                        <span class="shrink-0 text-text-secondary opacity-0 group-hover:opacity-100">
                          <Icon name="copy" size={12} />
                        </span>
                      </button>
                    </th>
                    <TokenValue value={light} group={label} />
                    <TokenValue value={dark ?? light} group={label} inherited={dark === undefined} />
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        ) : (
          <p id="token-status" role="status" class="my-4 text-body text-text-secondary">
            {status}
          </p>
        )}
      </div>
    </Panel>
  );
}

function TokenBoardSection({ title, source, children }: { title: string; source: string; children?: unknown }) {
  return (
    <section class="grid grid-cols-[180px_minmax(0,1fr)] gap-8 border-t border-border py-5">
      <div>
        <h2 class="text-title leading-5 font-[650]">{title}</h2>
        <p class="mt-2 flex items-center gap-[6px] font-mono text-caption text-text-tertiary">
          <Icon name="file-code" size={12} class="shrink-0" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{source}</span>
        </p>
      </div>
      <div class="min-w-0">{children}</div>
    </section>
  );
}

function SwatchGroup({
  title,
  swatches,
}: {
  title: string;
  swatches: readonly (readonly [string, string, string])[];
}) {
  return (
    <div>
      <h3 class="mb-2 text-body font-semibold">{title}</h3>
      <div class="grid grid-cols-6 gap-x-4 gap-y-3">
        {swatches.map(([name, light, dark]) => (
          <article class="min-w-0">
            <div data-brand class="mb-[6px] flex h-9 overflow-hidden rounded-row border border-border">
              <span class="flex-1 bg-[var(--swatch-light)]" style={{ '--swatch-light': light }} />
              <span class="flex-1 bg-[var(--swatch-dark)]" style={{ '--swatch-dark': dark }} />
            </div>
            <code class="block truncate font-mono text-meta">{name}</code>
            <small class="block font-mono text-caption text-text-tertiary">
              {light} · {dark}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

export function TokenBoardPreview({
  project = 'agent-design-gallery',
  source = tokenSource,
  tokenCount = 34,
  width = 1120,
}: {
  project?: string;
  source?: string;
  tokenCount?: number;
  width?: number;
}) {
  return (
    <article class="bg-surface px-10 pt-7 pb-6 text-text" style={{ width }}>
      <header class="flex items-end justify-between gap-10 pb-5">
        <div>
          <p class="flex items-center gap-3 text-caption font-semibold tracking-[2px] text-text-tertiary uppercase">
            <span
              class="grid h-6 min-w-6 place-items-center rounded-pill bg-text px-[6px] font-mono text-caption
                tracking-normal text-surface"
            >
              01
            </span>
            <span>{project} · Tokens</span>
          </p>
          <h1 class="mt-2 text-[28px] leading-[34px] font-semibold">Tokens</h1>
        </div>
        <p class="shrink-0 text-body text-text-secondary">1 source · {tokenCount} tokens</p>
      </header>
      <TokenBoardSection title="Colour" source={source}>
        <div class="flex flex-col gap-4">
          <SwatchGroup title="Surfaces and borders" swatches={boardSurfaces} />
          <SwatchGroup title="Text and accents" swatches={boardAccents} />
        </div>
      </TokenBoardSection>
      <TokenBoardSection title="Type" source={source}>
        <div class="flex flex-col">
          {boardTypeScale.map(([name, size, sizeClass]) => (
            <div class="grid grid-cols-[140px_minmax(0,1fr)_64px] items-baseline gap-4 border-b border-border py-[6px]">
              <code class="font-mono text-meta">{name}</code>
              <span class={sizeClass}>The quick brown fox</span>
              <small class="text-right font-mono text-caption text-text-tertiary">{size}</small>
            </div>
          ))}
        </div>
      </TokenBoardSection>
      <TokenBoardSection title="Shape" source={source}>
        <div class="grid grid-cols-6 gap-4">
          {boardShapes.map(([name, value, radiusClass]) => (
            <article class="min-w-0 text-center">
              <div class={`mx-auto mb-[6px] size-10 border border-border bg-surface-section ${radiusClass}`} />
              <code class="block truncate font-mono text-meta">{name}</code>
              <small class="block font-mono text-caption text-text-tertiary">{value}</small>
            </article>
          ))}
        </div>
      </TokenBoardSection>
      <TokenBoardSection title="Sizing" source={source}>
        <div>
          <h3 class="mb-2 text-body font-semibold">Control sizing</h3>
          <div class="grid grid-cols-3 gap-x-6 gap-y-3">
            {boardSizes.map(([name, value, length]) => (
              <article class="min-w-0">
                <div class="mb-[6px] h-2 bg-canvas">
                  <div class="h-full bg-accent" style={{ width: length * 4 }} />
                </div>
                <code class="block truncate font-mono text-meta">{name}</code>
                <small class="block font-mono text-caption text-text-tertiary">{value}</small>
              </article>
            ))}
          </div>
        </div>
      </TokenBoardSection>
    </article>
  );
}

export default () => [
  <Frame name="token-board">
    <div class="bg-canvas p-6">
      <TokenBoardPreview />
    </div>
  </Frame>,
  <Frame name="token-catalog">
    <div class="bg-canvas p-6">
      <TokenCatalog groups={catalogSpecimenGroups} source={tokenSource} width={920} />
    </div>
  </Frame>,
  <Frame name="token-catalog-empty">
    <div class="bg-canvas p-6">
      <TokenCatalog groups={[]} source={tokenSource} width={720} />
    </div>
  </Frame>,
];
