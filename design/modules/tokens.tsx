import { Frame, Icon } from 'sdg';
import { Panel } from '../components/panel';
import { geometryGroups, tokenGroups, tokenSource, type TokenGroup } from '../fixtures/tokens';

function TokenPreview({ value, group }: { value: string; group: string }) {
  if (group === 'Colors') return <span data-brand aria-hidden="true"
    class="size-5 shrink-0 rounded-artboard border border-border bg-[var(--swatch)]"
    style={{ '--swatch': value }} />;

  if (!/^\d+px$/.test(value)) return null;
  if (group === 'Spacing & size') return <span aria-hidden="true" class="flex w-14 shrink-0 items-center">
    <span class="flex h-2 max-w-full items-center border-x border-text-tertiary" style={{ width: value }}>
      <span class="h-px w-full bg-text-tertiary" />
    </span>
  </span>;
  if (group === 'Radii') return <span aria-hidden="true"
    class="h-12 w-14 shrink-0 rounded-[var(--sample-radius)] border border-border bg-surface-sunken"
    style={{ '--sample-radius': value }} />;
  return null;
}

function TokenValue({ value, group, inherited }: { value: string; group: string; inherited?: boolean }) {
  return <td class="border-b border-border py-2 pr-5 align-middle">
    <div class="flex items-center gap-2">
      <TokenPreview value={value} group={group} />
      <code class={`font-mono text-meta [overflow-wrap:anywhere] ${inherited ? 'text-text-secondary' : 'text-text'}`}
        title={inherited ? 'Inherits light declaration' : undefined}>{value}</code>
    </div>
  </td>;
}

export function TokenCatalog({ groups, source, width = 1144, height }: {
  groups: TokenGroup[];
  source: string;
  width?: number;
  height?: number;
}) {
  return <Panel width={width} height={height}>
    <header class="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4">
      <h2 class="text-title font-[650]">Tokens</h2>
      <code class="font-mono text-meta text-text-secondary">{source}</code>
    </header>
    <div class="min-h-0 overflow-auto px-5 pb-3">
      <table class="w-full table-fixed border-collapse text-left">
        <thead class="sticky top-0 bg-surface text-meta text-text-secondary">
          <tr>
            <th scope="col" class="w-[28%] border-b border-border py-3 pr-5 font-[550]">Token</th>
            <th scope="col" class="w-[36%] border-b border-border py-3 pr-5 font-[550]">Light</th>
            <th scope="col" class="w-[36%] border-b border-border py-3 pr-5 font-[550]">Dark</th>
          </tr>
        </thead>
        {groups.map(({ label, rows }) => <tbody>
          <tr><th scope="rowgroup" colSpan={3}
            class="border-b border-border pb-2 pt-4 text-body font-[650]">{label}</th></tr>
          {rows.map(([name, light, dark]) => <tr>
            <th scope="row" class="border-b border-border py-1 pr-5 font-normal">
              <button type="button" aria-label={`Copy ${name}`}
                class="group flex min-h-7 max-w-full items-center gap-1 rounded-row text-left focus-visible:outline">
                <code class="font-mono text-meta [overflow-wrap:anywhere]">{name}</code>
                <span class="shrink-0 text-text-secondary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Icon name="copy" size={12} />
                </span>
              </button>
            </th>
            <TokenValue value={light} group={label} />
            <TokenValue value={dark ?? light} group={label} inherited={dark === undefined} />
          </tr>)}
        </tbody>)}
      </table>
    </div>
  </Panel>;
}

export default () => [
  <Frame name="typography">
    <div class="bg-canvas p-3">
      <TokenCatalog groups={tokenGroups.filter(({ label }) => label === 'Typography')} source={tokenSource} />
    </div>
  </Frame>,
  <Frame name="spacing-and-radii">
    <div class="bg-canvas p-3">
      <TokenCatalog groups={geometryGroups} source={tokenSource} width={840} />
    </div>
  </Frame>,
];
