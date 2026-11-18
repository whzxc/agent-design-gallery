import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Panel } from '../components/panel';
import { hubNotes, projects } from '../fixtures/hub';
import { ScopeTabs } from '../modules/navigation';
import { ProjectPicker, SwitcherMenu } from '../modules/project-switcher';

const narrowScopes = [{ label: 'Components' }, { label: 'All designs' }];

export default () => (
  <Frame
    name="phone"
    width={390}
    height={844}
    note={hubNotes.switcher}
    fixture="hub-switcher"
    capture={{ page: true, viewport: '390x844' }}
  >
    <Canvas width={390} height={844}>
      <div class="relative flex flex-col items-start gap-[6px] p-3">
        <Panel width={366}>
          <div class="flex flex-col gap-2 p-[6px]">
            <div class="flex items-center gap-2">
              <IconButton icon="panel-left" label="Contents" />
              <ProjectPicker current={projects[0]} kind="project" open width={208} />
              <Field form="search" label="Find assets…" meta="" width={98} />
            </div>
            <ScopeTabs options={narrowScopes} selected="Components" />
          </div>
        </Panel>
        <SwitcherMenu current={projects[0]} width={366} />
      </div>
    </Canvas>
  </Frame>
);
