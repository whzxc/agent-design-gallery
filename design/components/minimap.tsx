import { Frame } from 'sdg';
const sample = [[16,16,70,44],[94,16,90,60],[16,68,70,48]];
export function Minimap({ specimen=false, boxes=sample, viewport=[90,12,98,68] }: { specimen?:boolean; boxes?:number[][]; viewport?:number[] }) {
  const [x,y,width,height]=viewport;
  return <svg data-free width={200} height={132} class="overflow-visible"><rect width="200" height="132" rx="12" class="fill-surface"/>{boxes.map(([x,y,width,height])=><rect x={x} y={y} width={width} height={height} rx={4} class="fill-surface-section stroke-border"/>)}<rect x={x} y={y} width={width} height={height} rx={specimen?4:0} stroke-width={specimen?1.5:1} class="fill-none stroke-accent"/></svg>;
}
export default () => <Frame name="default"><Minimap specimen/></Frame>;
