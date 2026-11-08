import { Frame } from 'sdg';
import { HubBar, HubHeading, ProjectList, LiveInstances } from '../modules/hub-home';
import { homeFrames, hubNotes } from '../fixtures/hub';

export default () => homeFrames.map(({ name, narrow, width, height }) => <Frame
  name={name} width={width} height={height} note={hubNotes.proposed}
>
  <div class="flex flex-col gap-8 bg-canvas p-3" style={{ width, height }}>
    <div class="self-start"><HubBar /></div>
    <main class={`mx-auto flex w-full flex-col gap-8 ${narrow ? '' : 'max-w-[1080px] pt-6'}`}>
      <section class="flex flex-col gap-4">
        <HubHeading /><ProjectList narrow={narrow} />
      </section>
      <LiveInstances narrow={narrow} />
    </main>
  </div>
</Frame>);
