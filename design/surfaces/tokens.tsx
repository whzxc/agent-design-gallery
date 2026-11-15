import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { TokenCatalog } from '../modules/tokens';
import { tokenGroups, tokenSource } from '../fixtures/tokens';
import { Field } from '../components/field';
import { ProjectPicker } from '../modules/project-switcher';
import { ScopeTabs } from '../modules/navigation';
import { ViewerBars } from '../components/toolbar';
import { viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';

function ViewerHeader({ scope, contentsOpen = false, detailsOpen = false, inspectorDisabled = false }: any) {
  return <ViewerBars project={<ProjectPicker current={viewerBarProject} kind="project" />} scopes={<ScopeTabs options={viewerBarScopes} selected={scope} />} search={<Field form="search" label={scope === 'Tokens' ? 'Find tokens…' : 'Find assets…'} width={216} />} contentsOpen={contentsOpen} detailsOpen={detailsOpen} inspectorDisabled={inspectorDisabled} />;
}

export default () => [
  <Frame name="top-bars" width={1440} height={900} fixture="viewer-top-bars-tokens" capture={{ page: true, viewport: '1440x900' }}>
    <Canvas width={1440} height={900}>
      <div class="absolute inset-x-3 top-3 z-10"><ViewerHeader scope="Tokens" inspectorDisabled /></div>
      <div class="absolute inset-x-3 top-16">
        <TokenCatalog groups={tokenGroups} source={tokenSource} width={1416} height={824} />
      </div>
    </Canvas>
  </Frame>,
];
