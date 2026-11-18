import { Frame } from 'adg';
import { Button } from '../components/button';
import { Canvas } from '../components/canvas';
import { Field } from '../components/field';
import {
  viewerBarProject,
  viewerBarScopes,
  viewerElementInspector,
  viewerMinimap,
} from '../fixtures/viewer-bars';
import { BoardChapter, BoardSection, Minimap, SpecimenWell } from '../modules/canvas';
import { Inspector } from '../modules/inspector';
import { ScopeTabs } from '../modules/navigation';
import { ProjectPicker } from '../modules/project-switcher';
import { ViewerBars, ZoomBar } from '../modules/view-controls';

function SurfaceSpecimen() {
  return (
    <div class="flex w-[940px] flex-col gap-6 bg-surface p-8">
      <div class="flex items-center justify-between">
        <span class="text-title font-[650]">Workspace</span>
        <Field form="search" label="Filter tasks…" width={220} />
      </div>
      <div
        class="flex flex-col gap-4 rounded-panel border border-border bg-surface-section p-5
          outline-2 outline-offset-2 outline-accent"
      >
        <Field form="input-empty" label="Describe the next task…" width={728} />
        <div class="flex items-center justify-between">
          <Button form="secondary" label="Attach" icon="paperclip" />
          <Button form="primary" label="Run task" />
        </div>
      </div>
    </div>
  );
}

export default () => (
  <Frame
    name="element"
    width={1440}
    height={900}
    fixture="sample-inspect-component"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 148, top: 84, transform: 'scale(0.48)' }}
        >
          <BoardChapter
            number={1}
            project={viewerBarProject.name}
            layer="Surfaces"
            title="Workspace"
            sourceCount={2}
            frameCount={4}
            width={1680}
          >
            <BoardSection title="home" path="surfaces/home.tsx" modified="Nov 7, 13:24" selected>
              <SpecimenWell name="default" span={12} surface>
                <SurfaceSpecimen />
              </SpecimenWell>
            </BoardSection>
          </BoardChapter>
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerBars
          project={<ProjectPicker current={viewerBarProject} kind="project" />}
          scopes={<ScopeTabs options={viewerBarScopes} selected="Surfaces" />}
          search={<Field form="search" label="Find assets…" width={216} />}
          detailsOpen
        />
      </div>
      <div class="absolute top-16 right-3">
        <Inspector {...viewerElementInspector} />
      </div>
      <div class="absolute right-3 bottom-4">
        <Minimap {...viewerMinimap} />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" minimapPressed />
      </div>
    </Canvas>
  </Frame>
);
