import { Frame } from 'sdg';
const frames = [{label:'ready',selected:false},{label:'failed',selected:true}];
export function Flow({title='mcp-hub',count='3 frames'}:any) {
  return <svg data-free width={440} height={192}><text y="8" dominant-baseline="central" class="fill-text-secondary text-meta font-semibold">{title}<tspan dx="6" class="fill-text-tertiary font-normal">{count}</tspan></text>{frames.map(({label,selected},i)=><g transform={`translate(${i*240} 42)`}><rect width="200" height="150" rx="6" class={selected?'fill-none stroke-accent':'fill-none stroke-border'} stroke-width={selected?2:1}/><text y="-12" dominant-baseline="central" class={`text-caption ${selected?'fill-text font-[550]':'fill-text-tertiary'}`}>{label}</text></g>)}</svg>;
}
export default () => <Frame name="default"><Flow/></Frame>;
