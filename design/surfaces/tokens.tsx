import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { Sidebar } from '../modules/navigation';
import { TokenCatalog } from '../modules/tokens';
import { tokenGroups, tokenNavigation, tokenSource } from '../fixtures/tokens';
import { ViewerHeader } from './canvas';

export default () => [
  <Frame name="desktop" width={1440} height={900} note="Historical token layout from before the top bars.">
    <Canvas width={1440} height={900}>
      <div class="relative flex items-start gap-3 p-3">
        <Sidebar {...tokenNavigation} />
        <TokenCatalog groups={tokenGroups} source={tokenSource} height={876} />
      </div>
    </Canvas>
  </Frame>,
  <Frame name="top-bars" width={1440} height={900} fixture="viewer-top-bars-tokens" capture={{ page: true, viewport: '1440x900' }}>
    <Canvas width={1440} height={900}>
      <div class="absolute inset-x-3 top-3 z-10"><ViewerHeader scope="Tokens" inspectorDisabled /></div>
      <div class="absolute inset-x-3 top-16">
        <TokenCatalog groups={tokenGroups} source={tokenSource} width={1416} height={824} />
      </div>
    </Canvas>
  </Frame>,
];
