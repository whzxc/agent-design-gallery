import { Frame } from 'adg';
import { AccessShell } from '../modules/hub-access';
import { accessStates, hubNotes } from '../fixtures/hub';

export default () => <Frame name="key-required" width={1440} height={900} note={hubNotes.access}
  fixture="hub-key-required" capture={{ page: true, viewport: '1440x900' }}>
  <AccessShell state={accessStates[0]} width={1440} height={900} />
</Frame>;
