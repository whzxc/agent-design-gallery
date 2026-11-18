import { Frame } from 'adg';
import { Canvas } from '../components/canvas';
import { viewerBarProject, viewerReviewScopes } from '../fixtures/viewer-bars';
import { ScopeTabs } from '../modules/navigation';
import { ProjectPicker } from '../modules/project-switcher';
import { ReviewView } from '../modules/review';
import { ViewerBars, ZoomBar } from '../modules/view-controls';

export default () => (
  <Frame
    name="default"
    width={1440}
    height={900}
    fixture="hub-review-live"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerBars
          project={<ProjectPicker current={viewerBarProject} kind="project" />}
          scopes={<ScopeTabs options={viewerReviewScopes} selected="Review" />}
          hideContents
          hideInspector
          commentCount={2}
        />
      </div>
      <div class="absolute inset-x-3 top-16 bottom-3">
        <ReviewView width={1416} height={824} />
      </div>
      <div class="absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <ZoomBar commentsOnly />
      </div>
    </Canvas>
  </Frame>
);
