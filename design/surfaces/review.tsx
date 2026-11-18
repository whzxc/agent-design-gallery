import { Frame } from 'adg';
import { ReviewLayout, ReviewZoom } from '../modules/review';

export default () => [
  <Frame name="report" width={1440} height={900} locale="en" fixture="standalone-review" capture={{ page: true, viewport: '1440x900' }}>
    <div class="h-[900px] w-[1440px]"><ReviewLayout /></div>
  </Frame>,
  <Frame name="enlarged" width={1440} height={900} locale="en" fixture="standalone-review-zoom" capture={{ page: true, viewport: '1440x900' }}>
    <div class="relative h-[900px] w-[1440px] overflow-hidden"><ReviewLayout /><div class="absolute inset-0 bg-canvas/80 p-[17px]"><ReviewZoom /></div></div>
  </Frame>,
];
