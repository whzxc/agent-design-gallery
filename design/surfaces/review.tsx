import { Frame } from 'adg';
import { ReviewHeader, ReviewLayout, ReviewMotionCard, ReviewZoom } from '../modules/review';

export default () => [
  <Frame name="report" width={1440} height={900} locale="en" fixture="standalone-review" capture={{ page: true, viewport: '1440x900' }}>
    <div class="h-[900px] w-[1440px]"><ReviewLayout /></div>
  </Frame>,
  <Frame name="motion" width={1440} height={900} locale="en" fixture="standalone-motion-review" capture={{ page: true, viewport: '1440x900' }}>
    <div class="h-[900px] w-[1440px] bg-canvas text-text"><ReviewHeader />
      <main class="px-[38px] pt-[21px]"><header class="mb-3 flex items-center justify-between border-b border-border pb-2">
        <h2 class="text-[22px] font-semibold">Transition changes</h2><span>1 edge</span></header><ReviewMotionCard /></main>
    </div>
  </Frame>,
  <Frame name="enlarged" width={1440} height={900} locale="en" fixture="standalone-review-zoom" capture={{ page: true, viewport: '1440x900' }}>
    <div class="relative h-[900px] w-[1440px] overflow-hidden"><ReviewLayout /><div class="absolute inset-0 bg-canvas/80 p-[17px]"><ReviewZoom /></div></div>
  </Frame>,
];
