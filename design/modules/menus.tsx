import { Frame } from 'adg';
import { frames } from '../fixtures/menu-captures';
import { Drawing } from '../components/canvas';
import { Screen } from '../components/canvas';
import { Tools, ViewerTools, ZoomBar } from '../components/toolbar';
import menuFixtures from '../fixtures/menus.json';
import { viewerBarMore } from '../fixtures/viewer-bars';
import { scenes } from '../scenes/menus';
import { Panel } from '../components/panel';
import { MenuItem, Menu as SharedMenu } from '../components/menu-item';
export function Menu({ rows, width = 220 }: any) {
  return <SharedMenu rows={rows} width={width} />;
}

export default () => [
  <Frame name="default">
    <Menu {...menuFixtures.default} />
  </Frame>,
  <Frame name="viewer-more" fixture="viewer-top-bars-more"
    capture={{ page: true, origin: '1132 0', viewport: '1440x900' }}>
    <div class="flex min-h-[464px] w-[308px] items-start justify-end bg-canvas p-3">
      <ViewerTools inspectorDisabled menu={<Menu {...viewerBarMore} />} />
    </div>
  </Frame>,
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        {chrome.map(({ kind, left, top, menu, ...props }: any) => {
          const Component = kind === 'menu' ? Menu : kind === 'tools' ? Tools : ZoomBar;
          return (
            <div class="absolute" style={{ left, top }}>
              <Component {...(kind === 'menu' ? menuFixtures[menu] : props)} />
            </div>
          );
        })}
      </Screen>
    </Frame>
  )),
];
