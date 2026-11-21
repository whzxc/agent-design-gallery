import { Frame } from 'adg';
import example from '../fixtures/review-motion.json';
import { ReviewHeader, ReviewLayout, ReviewMotionCard, ReviewZoom } from '../modules/review';

export default () => [
  <Frame name="report" width={1440} height={900} locale="en" fixture="standalone-review" capture={{ page: true, viewport: '1440x900' }}>
    <div class="h-[900px] w-[1440px]"><ReviewLayout /></div>
  </Frame>,
  <Frame name="motion" width={1440} height={900} locale="en" fixture="standalone-motion-review" capture={{ page: true, viewport: '1440x900' }}>
    <div class="h-[900px] w-[1440px] bg-canvas text-section leading-[1.5] text-text"><ReviewHeader project={example.project} />
      <main class="px-[clamp(16px,2.6vw,42px)] pt-[21px]"><header class="mb-[13px] flex items-baseline justify-between border-b border-border pb-[10px]">
        <h2 class="text-[22px] font-[650] tracking-tight">Transition changes</h2><span class="text-meta text-text-secondary">1 edge</span></header><ReviewMotionCard /></main>
    </div>
  </Frame>,
  <Frame name="enlarged" width={1440} height={900} locale="en" fixture="standalone-review-zoom" capture={{ page: true, viewport: '1440x900' }}>
    <div class="relative h-[900px] w-[1440px] overflow-hidden"><ReviewLayout /><div class="absolute inset-0 bg-canvas/80 p-[17px]"><ReviewZoom /></div></div>
  </Frame>,
];
