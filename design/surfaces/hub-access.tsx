import { Frame } from 'adg';
import { Toolbar } from '../components/toolbar';
import { accessStates, hubCopy, hubNotes } from '../fixtures/hub';
import { AccessState } from '../modules/hub-access';

export default () => (
  <Frame
    name="key-required"
    width={1440}
    height={900}
    note={hubNotes.access}
    fixture="hub-key-required"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <div class="flex flex-col bg-canvas p-3" style={{ width: 1440, height: 900 }}>
      <div class="self-start">
        <Toolbar>
          <span class="px-2 text-section font-[650]">{hubCopy.brand}</span>
        </Toolbar>
      </div>
      <div class="flex flex-1 items-center justify-center">
        <AccessState {...accessStates[0]} />
      </div>
    </div>
  </Frame>
);
