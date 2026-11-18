import { Frame } from 'adg';
import { IconButton } from '../components/icon-button';
import { Panel } from '../components/panel';
import { Tooltip } from '../components/tooltip';
import { TreeRow } from '../components/tree-row';
import navigationFixtures from '../fixtures/navigation.json';
import { scopeTabOptions } from '../fixtures/render-scope';

export function ScopeTabs({
  options,
  selected,
}: {
  options: { label: string }[];
  selected?: string | null;
}) {
  return (
    <div role="tablist" aria-label="Design scope" class="flex items-center gap-[2px]">
      {options.map(({ label }) => {
        const active = selected === label;
        return (
          <button
            type="button"
            role="tab"
            aria-selected={active ? 'true' : 'false'}
            class={`h-(--control-size) rounded-row px-3 text-body leading-4 font-[550] whitespace-nowrap
              ${active ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ScopeRow({ row, indent = 0, showAction = false }: any) {
  if (!showAction) return <TreeRow {...row} indent={indent} />;
  const action = row.form?.startsWith('group') ? 'Render only this group' : 'Render only this asset';
  return (
    <div class="flex items-center">
      <TreeRow {...row} indent={indent} width={204} />
      <div class="relative flex h-7 items-center" role="button" aria-label={`${action}: ${row.label}`}>
        <IconButton icon="square-dashed" form="active" />
        <div class="absolute top-0 left-full ml-4 flex h-full items-center">
          <Tooltip label={action} />
        </div>
      </div>
    </div>
  );
}

export function Contents({
  rows = [],
  scopedIndent = 0,
  searchCount,
  searchAllAction = false,
  scopeAction,
}: any) {
  return (
    <nav aria-label="Contents">
      <Panel width={260}>
        <div class={`max-h-[760px] p-3 ${scopeAction ? '' : 'overflow-auto'}`}>
          {searchCount && (
            <h3 class="mt-[6px] mb-[6px] ml-[2px] text-meta leading-4 font-[550] text-text-tertiary">
              {searchCount}
            </h3>
          )}
          {searchAllAction && <TreeRow icon="layout-grid" label="Search All designs" />}
          {rows.map((row: any, i: number) => {
            const isItem = row.form.startsWith('item');
            const isLastGroupItem = !searchCount && scopedIndent > 0 && isItem && !rows[i + 1]?.form.startsWith('item');
            return (
              <>
                <div class={row.form.startsWith('group') ? 'h-[30px]' : ''}>
                  <ScopeRow
                    row={row}
                    indent={!searchCount && isItem ? scopedIndent : 0}
                    showAction={row.label === scopeAction}
                  />
                </div>
                {row.form.startsWith('root') && <div class="mt-1 mb-[7px] h-px bg-border" />}
                {isLastGroupItem && <div class="h-[6px]" />}
              </>
            );
          })}
        </div>
      </Panel>
    </nav>
  );
}

export default () => [
  <Frame name="scope-tabs">
    <div class="inline-flex rounded-panel bg-surface p-[6px] shadow-float">
      <ScopeTabs options={scopeTabOptions} selected="Components" />
    </div>
  </Frame>,
  <Frame name="contents-layer">
    <div class="bg-canvas p-3 pr-[172px]">
      <Contents {...navigationFixtures.layer} />
    </div>
  </Frame>,
  <Frame name="contents-search">
    <Contents {...navigationFixtures.search} />
  </Frame>,
  <Frame name="contents-search-empty">
    <Contents {...navigationFixtures.searchEmpty} />
  </Frame>,
  <Frame name="contents-tokens">
    <Contents {...navigationFixtures.tokens} />
  </Frame>,
];
