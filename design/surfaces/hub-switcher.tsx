import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { Switcher } from '../modules/project-switcher';
import { projects, hubNotes } from '../fixtures/hub';

export default () => <Frame name="phone" width={390} height={844} note={hubNotes.switcher}
  fixture="hub-switcher" capture={{ page: true, viewport: '390x844' }}>
  <Canvas width={390} height={844}>
    <div class="relative p-3"><Switcher current={projects[0]} kind="project" open narrow /></div>
  </Canvas>
</Frame>;
