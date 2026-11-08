import { Frame } from 'sdg';
import { Sidebar } from './panel';
import { TreeRow } from './tree-row';

const examples = [
  { source: 'surfaces/home.tsx', uses: [
    { directory: 'modules', names: ['composer', 'home', 'scenarios'] },
    { directory: 'components', names: ['alert'] },
  ], usedBy: [] },
  { source: 'modules/composer.tsx', uses: [
    { directory: 'components', names: ['button'] },
  ], usedBy: [{ directory: 'surfaces', names: ['home'] }] },
];
const rows = [
  { form: 'root', label: 'All designs', meta: '34', icon: 'layout-grid' },
  { form: 'group', label: 'components', meta: '20' },
  { form: 'group', label: 'modules', meta: '8' },
  { form: 'group', label: 'surfaces', meta: '6' },
];
export function SourceRelationships({ source, uses, usedBy }: any) {
  return <section class="border-t border-border p-3 text-body">
    <h2 class="font-mono text-meta leading-4 font-[550] mb-3">{source}</h2>
    <div class="flex flex-col gap-3">{[{ title: 'Uses', groups: uses }, { title: 'Used by', groups: usedBy }].map(({ title, groups }) =>
      <section>
        <h3 class="text-meta leading-4 font-[550] text-text-tertiary mb-1">{title}</h3>
        {groups.length ? groups.map(({ directory, names }: any) => <div>
          <h4 class="text-meta leading-4 font-normal text-text-tertiary mx-2 mt-1">{directory}</h4>
          {names.map((label: string) => <TreeRow label={label} icon={directory === 'surfaces' ? 'app-window' : 'component'} />)}
        </div>) : <p class="text-meta leading-4 text-text-secondary mx-2">None</p>}
      </section>
    )}</div>
  </section>;
}
export default () => examples.map(example => <Frame name={example.source.split('/')[0]}>
  <Sidebar rows={rows} height={640} footer={<SourceRelationships {...example} />} />
</Frame>);
