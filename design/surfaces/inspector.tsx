import { Frame } from 'adg';
import { frames } from '../fixtures/inspector-surfaces';
import { Drawing, Screen, Scrim } from '../components/canvas';
import { Sidebar } from '../modules/navigation';
import { Inspector } from '../modules/inspector';
import { OpenDialog } from '../modules/open-directory';
import { Tools, AppBar, ZoomBar } from '../components/toolbar';
import { Minimap } from '../modules/canvas';
import navigationFixtures from '../fixtures/navigation.json';
import inspectorFixtures from '../fixtures/inspector.json';
import directoryFixtures from '../fixtures/open-directory.json';
import { scenes } from '../scenes/inspector';

function ViewerChrome({ chrome }: any) { return chrome.map(({ kind, left, top, navigation, inspector, directory, ...props }: any) => { if (kind === 'scrim') return <Scrim />; const Component: any = { sidebar: Sidebar, inspector: Inspector, dialog: OpenDialog, tools: Tools, app: AppBar, zoom: ZoomBar, minimap: Minimap }[kind]; const content = kind === 'sidebar' ? (typeof navigation === 'string' ? navigationFixtures[navigation] : navigation) : kind === 'inspector' ? inspectorFixtures[inspector] : kind === 'dialog' ? { ...directoryFixtures.states[directory], recent: directoryFixtures.recent } : props; return <div class="absolute" style={{ left, top }}><Component {...content} /></div>; }); }

export default () =>
  frames.map(({ chrome, ...frame }) => (
    <Frame {...frame} fixture={`sample-inspect-${frame.name}`} capture={{ page: true, viewport: '1440x900' }}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        <ViewerChrome chrome={chrome} />
      </Screen>
    </Frame>
  ));
