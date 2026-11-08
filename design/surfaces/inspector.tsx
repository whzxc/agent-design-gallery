import { Frame } from 'sdg';
import { frames } from '../fixtures/inspector-surfaces';
import { Drawing } from '../modules/canvas';
import { Screen } from '../components/canvas';
import { ViewerChrome } from './canvas';
import { scenes } from '../scenes/inspector';

export default () =>
  frames.map(({ chrome, ...frame }) => (
    <Frame {...frame}>
      <Screen width={frame.width} height={frame.height} drawing={<Drawing nodes={scenes[frame.name]} />}>
        <ViewerChrome chrome={chrome} />
      </Screen>
    </Frame>
  ));
