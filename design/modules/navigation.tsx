import { Frame, Icon } from 'sdg';
import { Panel } from '../components/panel';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { TreeRow } from '../components/tree-row';
const sampleRows = [{ form: 'item-selected', label: 'state-pill', meta: '5 forms', icon: 'component' }];
export function Sidebar({ rows = sampleRows, search = false, height, specimen = false }: any) {
  return (
    <Panel height={search ? undefined : height}>
      <div class="flex items-center gap-[10px] p-[6px]">
        <IconButton icon="panel-left" />
        <span class="text-section font-[650]">SDG</span>
      </div>
      <div class="flex flex-col gap-3 px-3 mt-1">
        <Field form="picker" label={specimen ? 'arc' : 'agent-remote-control'} />
        <Field form={search ? 'search-active' : 'search'} label={search ? 'pill' : 'Find assets…'} />
      </div>
      <div class={`px-3 mt-3 ${search ? (specimen ? 'pb-2' : 'pb-[22px]') : ''}`}>
        {search && (
          <div class="text-meta text-text-tertiary font-[550] leading-4 mt-[6px] mb-[6px] ml-[2px]">2 results</div>
        )}
        {rows.map((row: any, i: number) => (
          <>
            <div class={row.form.startsWith('group') ? 'h-[30px]' : ''}>
              <TreeRow {...row} indent={!search && row.form.startsWith('item') ? 20 : 0} />
            </div>
            {row.form.startsWith('root') && <div class="h-px bg-border mt-1 mb-[7px]" />}
            {!search && row.form.startsWith('item') && !rows[i + 1]?.form.startsWith('item') && <div class="h-[6px]" />}
          </>
        ))}
      </div>
    </Panel>
  );
}
export default () => (
  <Frame name="search">
    <Sidebar search specimen />
  </Frame>
);
