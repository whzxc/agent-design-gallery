import { Frame } from 'adg';
import { Button } from '../components/button';
import { Canvas } from '../components/canvas';
import { CommentPin } from '../components/comment-pin';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import commentFixtures from '../fixtures/comments.json';
import { viewerBarContents, viewerBarDetails, viewerBarProject, viewerBarScopes } from '../fixtures/viewer-bars';
import { BoardChapter, BoardSection, SpecimenWell } from '../modules/canvas';
import { CommentsPanel, CommentThread } from '../modules/comments';
import { Inspector } from '../modules/inspector';
import { Contents, ScopeTabs } from '../modules/navigation';
import { ProjectPicker } from '../modules/project-switcher';
import { ViewerBars, ZoomBar } from '../modules/view-controls';

const { commentCanvas, commentExample, changedExample } = commentFixtures;
const { clip, pin } = commentCanvas;

function ViewerHeader({
  scope,
  contentsOpen = false,
  detailsOpen = false,
  inspectorDisabled = false,
  commentsOpen = false,
  commentCount = 0,
}: {
  scope: string;
  contentsOpen?: boolean;
  detailsOpen?: boolean;
  inspectorDisabled?: boolean;
  commentsOpen?: boolean;
  commentCount?: number;
}) {
  return (
    <ViewerBars
      project={<ProjectPicker current={viewerBarProject} kind="project" />}
      scopes={<ScopeTabs options={viewerBarScopes} selected={scope} />}
      search={<Field form="search" label="Find assets…" width={216} />}
      contentsOpen={contentsOpen}
      detailsOpen={detailsOpen}
      inspectorDisabled={inspectorDisabled}
      commentsOpen={commentsOpen}
      commentCount={commentCount}
    />
  );
}

function EssentialsBoard({ selectedSource = false }: { selectedSource?: boolean }) {
  return (
    <BoardChapter
      number={1}
      project={viewerBarProject.name}
      layer="Components"
      title="Essentials"
      sourceCount={8}
      frameCount={32}
      width={1680}
    >
      <BoardSection title="button" path="components/button.tsx" modified="Nov 7, 13:24" selected={selectedSource}>
        <SpecimenWell name="primary" span={4} selected={selectedSource}>
          <Button form="primary" label="Open" />
        </SpecimenWell>
        <SpecimenWell name="secondary" span={4}>
          <Button form="secondary" label="Cancel" />
        </SpecimenWell>
        <SpecimenWell name="ghost" span={4}>
          <Button form="ghost" label="Reset" />
        </SpecimenWell>
      </BoardSection>
      <BoardSection title="icon-button" path="components/icon-button.tsx" modified="Nov 7, 13:24">
        <SpecimenWell name="default" span={4}>
          <IconButton icon="panel-right" label="Inspector" />
        </SpecimenWell>
        <SpecimenWell name="active" span={4}>
          <IconButton form="active" icon="panel-right" label="Inspector" />
        </SpecimenWell>
        <SpecimenWell name="pressed" span={4}>
          <IconButton form="pressed" icon="map" label="Minimap" />
        </SpecimenWell>
      </BoardSection>
      <BoardSection title="field" path="components/field.tsx" modified="Nov 7, 13:24">
        <SpecimenWell name="search" span={6}>
          <Field form="search" label="Find assets…" />
        </SpecimenWell>
        <SpecimenWell name="picker" span={6}>
          <Field form="picker" label="agent-remote-control" />
        </SpecimenWell>
      </BoardSection>
    </BoardChapter>
  );
}

export default () => [
  <Frame
    name="comment-thread"
    width={clip.width}
    height={clip.height}
    fixture={commentCanvas.fixture}
    capture={{ page: true, viewport: '1440x900', origin: `${clip.x} ${clip.y}` }}
  >
    <div data-free class="relative bg-surface" style={{ width: clip.width, height: clip.height }}>
      <div class="absolute" style={{ left: pin.x, top: pin.y - 26 }}>
        <CommentPin number={commentExample.number} expanded />
      </div>
      <div class="absolute" style={{ left: pin.x - 332 - 12, top: pin.y - 26 }}>
        <CommentThread thread={{ ...commentExample, displayName: undefined }} />
      </div>
    </div>
  </Frame>,
  <Frame name="board" width={1440} height={900} fixture="viewer-top-bars" capture={{ page: true, viewport: '1440x900' }}>
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 317, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" inspectorDisabled />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled />
      </div>
    </Canvas>
  </Frame>,
  <Frame
    name="board-panels"
    width={1440}
    height={900}
    fixture="viewer-top-bars-panels"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 297, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard selectedSource />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" contentsOpen detailsOpen />
      </div>
      <div class="absolute inset-x-3 top-16 flex items-start justify-between">
        <Contents {...viewerBarContents} />
        <Inspector {...viewerBarDetails} />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled />
      </div>
    </Canvas>
  </Frame>,
  <Frame
    name="board-comments"
    width={1440}
    height={900}
    fixture="viewer-board-comments"
    capture={{ page: true, viewport: '1440x900' }}
  >
    <Canvas width={1440} height={900}>
      <div data-free class="absolute inset-0">
        <div
          class="absolute origin-top-left"
          style={{ left: 236, top: 84, transform: 'scale(0.48)' }}
        >
          <EssentialsBoard />
        </div>
        <div class="absolute" style={{ left: 536, top: 244 }}>
          <CommentPin number={commentExample.number} target={commentExample.target} />
        </div>
        <div class="absolute" style={{ left: 486, top: 280 }}>
          <CommentPin number={changedExample.number} changed target={changedExample.target} />
        </div>
      </div>
      <div class="absolute inset-x-3 top-3 z-10">
        <ViewerHeader scope="Components" inspectorDisabled commentsOpen commentCount={2} />
      </div>
      <div class="absolute top-16 right-3">
        <CommentsPanel threads={[commentExample, changedExample]} group="components / Essentials" />
      </div>
      <div class="absolute inset-x-0 bottom-4 flex justify-center">
        <ZoomBar label="48%" backDisabled commentPressed />
      </div>
    </Canvas>
  </Frame>,
];
