import { Frame } from 'adg';
import { frames } from '../fixtures/canvas-surfaces';
import { Screen, Scrim } from '../components/canvas';
import { Contents, ScopeTabs, Sidebar } from '../modules/navigation';
import { Inspector } from '../modules/inspector';
import { OpenDialog } from '../modules/open-directory';
import { Tools, AppBar, ViewerBars, ZoomBar } from '../modules/view-controls';
import { ProjectPicker } from '../modules/project-switcher';
import { Field } from '../components/field';
import { Drawing, Minimap } from '../modules/canvas';
import { scenes } from '../scenes/canvas';
import { renderScopeScenes } from '../scenes/render-scope';
import { scopeFrames } from '../fixtures/render-scope';
import { viewerBarContents, viewerBarDetails, viewerBarFrames, viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';
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

export function ViewerHeader({ scope, contentsOpen = false, detailsOpen = false, inspectorDisabled = false }: {
  scope: string;
  contentsOpen?: boolean;
  detailsOpen?: boolean;
  inspectorDisabled?: boolean;
}) {
  return <ViewerBars
    project={<ProjectPicker current={viewerBarProject} kind="project" />}
    scopes={<ScopeTabs options={viewerBarScopes} selected={scope} />}
    search={<Field form="search" label={scope === 'Tokens' ? 'Find tokens…' : 'Find assets…'} width={216} />}
    contentsOpen={contentsOpen} detailsOpen={detailsOpen} inspectorDisabled={inspectorDisabled}
  />;
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
      <Frame name={name} width={1440} height={900} note="Historical viewer layout from before the top bars.">
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
  ...viewerBarFrames.map(({ name, fixture, scope, panels }) => {
    const scene = renderScopeScenes.layer;
    const nodes = panels ? scene.nodes.map(node => {
      if ('name' in node && node.name === viewerBarDetails.title) return { ...node, selected: true };
      // The task-message timestamp meets the Inspector's label clearance.
      if ('labels' in node) return { ...node, labels: node.labels?.filter(([x, y]) => x !== 1154.71 || y !== 303.78) };
      return node;
    }) : scene.nodes;
    return <Frame name={name} width={1440} height={900} fixture={fixture} capture={{ page: true, viewport: '1440x900' }}>
      <Screen width={1440} height={900} drawing={<g transform="translate(-104 8)"><Drawing nodes={nodes} /></g>}>
        <div class="absolute inset-x-3 top-3 z-10">
          <ViewerHeader scope={scope} contentsOpen={panels} detailsOpen={panels} inspectorDisabled={!panels} />
        </div>
        {panels && <div class="absolute inset-x-3 top-16 flex items-start justify-between">
          <Contents {...viewerBarContents} />
          <Inspector {...viewerBarDetails} closeControl={false} />
        </div>}
        <div class="absolute inset-x-0 bottom-4 flex justify-center">
          <ZoomBar label={scene.zoom} backDisabled />
        </div>
      </Screen>
    </Frame>;
  }),
];
