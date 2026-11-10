import { Frame } from 'sdg';
import { Canvas } from '../components/canvas';
import { Sidebar } from '../modules/navigation';
import { TokenCatalog } from '../modules/tokens';
import { tokenGroups, tokenNavigation, tokenSource } from '../fixtures/tokens';

export default () => [
  <Frame name="desktop" width={1440} height={900} fixture="tokens-light" capture={{ page: true, viewport: '1440x900' }}>
    <Canvas width={1440} height={900}>
      <div class="relative flex items-start gap-3 p-3">
        <Sidebar {...tokenNavigation} />
        <TokenCatalog groups={tokenGroups} source={tokenSource} height={876} />
      </div>
    </Canvas>
  </Frame>,
];
