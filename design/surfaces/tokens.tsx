import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { Field } from '../components/field';
import { tokenGroups, tokenSource } from '../fixtures/tokens';
import { viewerBarProject, viewerBarScopes, viewerTokenContents } from '../fixtures/viewer-bars';
import { Contents, ScopeTabs } from '../modules/navigation';
import { ProjectPicker } from '../modules/project-switcher';
import { TokenBoardPreview, TokenCatalog } from '../modules/tokens';
import { ViewerBars, ZoomBar } from '../modules/view-controls';

function TokensHeader({ tokenView, contentsOpen = false }: { tokenView: string; contentsOpen?: boolean }) {
  return (
    <ViewerBars
      project={<ProjectPicker current={viewerBarProject} kind="project" />}
      scopes={<ScopeTabs options={viewerBarScopes} selected="Tokens" />}
      tokenView={tokenView}
      search={<Field form="search" label="Find tokens…" width={216} />}
      contentsOpen={contentsOpen}
      inspectorDisabled
    />
  );
}

export default () => [
  <Frame
    name="board"
    width={1440}
    height={900}
    fixture="viewer-top-bars-tokens"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div class="absolute" style={{ left: 160, top: 72 }}>
          <TokenBoardPreview project={viewerBarProject.name} />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <TokensHeader tokenView="List view" />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="68%" backDisabled commentDisabled />
      </div>
    </Canvas>
  </Frame>,
  <Frame
    name="list"
    width={1440}
    height={900}
    fixture="viewer-tokens-list"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div class="absolute inset-x-3 top-3 z-10">
        <TokensHeader tokenView="Board view" contentsOpen />
      </div>
      <div class="absolute top-16 left-3">
        <Contents {...viewerTokenContents} />
      </div>
      <div class="absolute top-16 right-3">
        <TokenCatalog groups={tokenGroups} source={tokenSource} width={1144} height={824} />
      </div>
    </Canvas>
  </Frame>,
];
