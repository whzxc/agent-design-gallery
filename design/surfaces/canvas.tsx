import { Frame } from 'sdg';
import { frames } from '../fixtures/canvas-surfaces';
import { Screen, Scrim } from '../components/canvas';
import { Sidebar } from '../modules/navigation';
import { Inspector } from '../modules/inspector';
import { OpenDialog } from '../modules/open-directory';
import { Tools, AppBar, ZoomBar } from '../modules/view-controls';
import { Drawing, Minimap } from '../modules/canvas';
import { scenes } from '../scenes/canvas';
import { renderScopeScenes } from '../scenes/render-scope';
import { scopeFrames } from '../fixtures/render-scope';
import navigationFixtures from '../fixtures/navigation.json';
import inspectorFixtures from '../fixtures/inspector.json';
import directoryFixtures from '../fixtures/open-directory.json';

const chromeComponents: Record<string, (props: any) => unknown> = {
  sidebar: Sidebar,
  inspector: Inspector,
  dialog: OpenDialog,
  tools: Tools,
  app: AppBar,
  zoom: ZoomBar,
  minimap: Minimap,
};
export function ViewerChrome({ chrome }: any) {
  return chrome.map(({ kind, left, top, navigation, inspector, directory, ...props }: any) => {
    if (kind === 'scrim') return <Scrim />;
    const Component = chromeComponents[kind];
    const content =
      kind === 'sidebar'
        ? (typeof navigation === 'string' ? navigationFixtures[navigation] : navigation)
        : kind === 'inspector'
          ? inspectorFixtures[inspector]
          : kind === 'dialog'
            ? { ...directoryFixtures.states[directory], recent: directoryFixtures.recent }
            : props;
    return (
      <div class="absolute" style={{ left, top }}>
        <Component {...content} />
      </div>
    );
  });
}

export default () => [
  ...frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        <ViewerChrome chrome={chrome} />
      </Screen>
    </Frame>
  )),
  ...scopeFrames.map(({ name, key, navigation }) => {
    const scene = renderScopeScenes[key];
    return (
      <Frame name={name} width={1440} height={900} fixture={name} capture={{ page:true, viewport:'1440x900' }}>
        <Screen width={1440} height={900} drawing={<Drawing nodes={scene.nodes} />}>
          <ViewerChrome chrome={[
            { kind: 'sidebar', left: 12, top: 12, navigation },
            { kind: 'tools', left: 1276, top: 12 },
            { kind: 'zoom', left: scene.zoomLeft, top: 840, label: scene.zoom, backDisabled: true },
          ]} />
        </Screen>
      </Frame>
    );
  }),
];
