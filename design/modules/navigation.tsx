import { Frame } from 'sdg';
import { Drawing } from './canvas';
import { Screen } from '../components/canvas';
import navigationFixtures from '../fixtures/navigation.json';
import { scenes } from '../scenes/navigation';
import { Panel } from '../components/panel';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { TreeRow } from '../components/tree-row';
import { Tooltip } from '../components/tooltip';
import { Menu } from './menus';
import { scopeSpecimens } from '../fixtures/render-scope';

export function ScopePicker({ scope, open }: any) {
  return (
    <div class={`relative ${open ? 'z-10' : ''}`}>
      <div role="button" aria-haspopup="menu" aria-label={`Render scope: ${scope.label}`} aria-expanded={open ? 'true' : 'false'}
        class={open ? 'rounded-field outline outline-accent -outline-offset-1' : ''}>
        <Field form="picker" label={scope.label} icon="layers" />
      </div>
      {open && <div class="absolute left-0 top-full mt-1">
        <Menu width={236} rows={scope.options.map((option: any) => ({
          ...option, form: option.label === scope.label ? 'check' : 'option',
        }))} />
      </div>}
    </div>
  );
}

export function ScopeRow({ row, indent, showAction }: any) {
  if (!showAction) return <TreeRow {...row} indent={indent} />;
  const action = row.form.startsWith('group') ? 'Render only this group' : 'Render only this asset';
  return (
    <div class="flex items-center">
      <TreeRow {...row} indent={indent} width={204} />
      <div class="relative flex h-7 items-center" role="button" aria-label={`${action}: ${row.label}`}>
        <IconButton icon="square-dashed" form="active" />
        <div class="absolute left-full top-0 ml-4 flex h-full items-center"><Tooltip label={action} /></div>
      </div>
    </div>
  );
}

export function ScopeTabs({ options, selected }: { options: { label: string }[]; selected: string }) {
  return <div role="tablist" aria-label="Design scope" class="flex items-center gap-[2px]">
    {options.map(({ label }) => {
      const active = selected === label;
      return <button type="button" role="tab" aria-selected={active ? 'true' : 'false'}
        class={`h-(--control-size) rounded-row px-3 text-body leading-4 font-[550] whitespace-nowrap
          ${active ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}>
        {label}
      </button>;
    })}
  </div>;
}

function NavigationRows({ rows, scoped, scopedIndent = 0, scopeAction, search = false }: any) {
  return rows.map((row: any, i: number) => (
    <>
      <div class={row.form.startsWith('group') ? 'h-[30px]' : ''}>
        {scoped ? <ScopeRow row={row} showAction={row.label === scopeAction}
          indent={row.form.startsWith('item') ? scopedIndent : 0} />
          : <TreeRow {...row} indent={!search && row.form.startsWith('item') ? 20 : 0} />}
      </div>
      {row.form.startsWith('root') && <div class="h-px bg-border mt-1 mb-[7px]" />}
      {!search && row.form.startsWith('item') && !rows[i + 1]?.form.startsWith('item') && <div class="h-[6px]" />}
    </>
  ));
}

export function Contents({ rows, scopedIndent }: any) {
  return <nav aria-label="Contents">
    <Panel>
      <div class="max-h-[760px] overflow-auto p-3">
        <NavigationRows rows={rows} scoped scopedIndent={scopedIndent} />
      </div>
    </Panel>
  </nav>;
}

export function Sidebar({
  rows = [],
  search = false,
  height,
  specimen = false,
  directory = 'agent-remote-control',
  query = '',
  searchPlaceholder = 'Find assets…',
  resultCount = rows.length,
  scope,
  scopeOpen = false,
  scopeAction,
  scopedIndent = 0,
}: any) {
  return (
    <Panel height={search ? undefined : height}>
      <div class="flex items-center gap-[10px] p-[6px]">
        <IconButton icon="panel-left" />
        <span class="text-section font-[650]">SDG</span>
      </div>
      <div class="flex flex-col gap-3 px-3 mt-1">
        <Field form="picker" label={directory} />
        {scope && <ScopePicker scope={scope} open={scopeOpen} />}
        <Field form={search ? 'search-active' : 'search'} label={search ? query : searchPlaceholder} />
      </div>
      <div class={`px-3 mt-3 ${search ? (specimen ? 'pb-2' : 'pb-[22px]') : scope ? 'pb-3' : ''}`}>
        {search && (
          <div class="text-meta text-text-tertiary font-[550] leading-4 mt-[6px] mb-[6px] ml-[2px]">
            {resultCount} results
          </div>
        )}
        <NavigationRows rows={rows} scoped={!!scope} scopeAction={scopeAction} scopedIndent={scopedIndent} search={search} />
      </div>
    </Panel>
  );
}
const frames = [
  {
    "name": "search-results",
    "width": 284,
    "height": 272,
    "note": "Historical viewer layout from before the top bars.",
    "chrome": [
      {
        "left": 12,
        "top": 12,
        "kind": "sidebar",
        "navigation": "search-results"
      }
    ]
  }
] as const;

export default () => [
  <Frame name="search">
    <Sidebar {...navigationFixtures.search} />
  </Frame>,
  ...scopeSpecimens.map(({ name, navigation }) => (
    <Frame name={name} note="Historical viewer navigation before the top bars.">
      <div class={`bg-canvas p-3 ${navigation.scopeAction ? 'pr-[168px]' : ''}`}>
        <Sidebar {...navigation} height={undefined} />
      </div>
    </Frame>
  )),
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        {chrome.map(({ left, top, navigation }) => (
          <div class="absolute" style={{ left, top }}>
            <Sidebar {...navigationFixtures[navigation]} />
          </div>
        ))}
      </Screen>
    </Frame>
  )),
];
