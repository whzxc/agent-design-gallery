import { Frame } from 'sdg';
const sample = [[16,16,70,44],[94,16,90,60],[16,68,70,48]];
const world = [[14,18.4,41.8,32],[65.7,18.4,44.8,31.5],[14,60.3,79.4,38.2],[103.3,60.3,82.7,53.3]];
export function Minimap({ specimen=false }: { specimen?:boolean }) {
  const boxes=specimen?sample:world;
  return <svg data-free width={200} height={132} class="overflow-visible"><rect width="200" height="132" rx="12" class="fill-surface"/>{boxes.map(([x,y,width,height])=><rect x={x} y={y} width={width} height={height} rx={specimen?4:3} class="fill-surface-section stroke-border"/>)}<rect x={specimen?90:14} y={specimen?12:18.4} width={specimen?98:23.7} height={specimen?68:16.3} rx={specimen?4:3} class="fill-none stroke-accent" stroke-width="1.5"/></svg>;
}
export default () => <Frame name="default"><Minimap specimen/></Frame>;
