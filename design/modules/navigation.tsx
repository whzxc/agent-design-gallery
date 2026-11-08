import { Frame } from 'sdg';
import { Screen } from '../components/canvas';
import navigationFixtures from '../fixtures/navigation.json';
import { scenes } from '../scenes/navigation';
import { Panel } from '../components/panel';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { TreeRow } from '../components/tree-row';
export function Sidebar({
  rows = [],
  search = false,
  height,
  specimen = false,
  directory = 'agent-remote-control',
  query = '',
  resultCount = rows.length,
}: any) {
  return (
    <Panel height={search ? undefined : height}>
      <div class="flex items-center gap-[10px] p-[6px]">
        <IconButton icon="panel-left" />
        <span class="text-section font-[650]">SDG</span>
      </div>
      <div class="flex flex-col gap-3 px-3 mt-1">
        <Field form="picker" label={directory} />
        <Field form={search ? 'search-active' : 'search'} label={search ? query : 'Find assets…'} />
      </div>
      <div class={`px-3 mt-3 ${search ? (specimen ? 'pb-2' : 'pb-[22px]') : ''}`}>
        {search && (
          <div class="text-meta text-text-tertiary font-[550] leading-4 mt-[6px] mb-[6px] ml-[2px]">
            {resultCount} results
          </div>
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
const frames = [
  {
    "name": "search-results",
    "width": 284,
    "height": 272,
    "fixture": "sidebar-search",
    "capture": {
      "page": true,
      "viewport": "1440x900",
      "origin": "0 0"
    },
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
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} scene={scenes[frame.name]}>
        {chrome.map(({ left, top, navigation }) => (
          <div class="absolute" style={{ left, top }}>
            <Sidebar {...navigationFixtures[navigation]} />
          </div>
        ))}
      </Screen>
    </Frame>
  )),
];
