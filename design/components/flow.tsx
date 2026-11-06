import { Frame } from 'sdg';
import { Geometry, type Shape } from './canvas';
export function Flow({nodes,width,height,top=41.5}: {nodes:Shape[];width:number;height:number;top?:number}) {
  return <svg width={width} height={height+top} class="overflow-visible"><g transform={`translate(0 ${top})`}><Geometry nodes={nodes}/></g></svg>;
}
export default () => [
<Frame name="default" width={440.0} height={191.5}><Flow nodes={[["g",{},[["rect",{"width":"440","height":"150","class":"fill-none"},[]],["text",{"x":"0","y":"-34","class":"fill-text-secondary text-meta font-[600]","dominant-baseline":"central"},["mcp-hub"]],["text",{"x":"59.1","y":"-34","class":"fill-text-tertiary text-meta font-[400]","dominant-baseline":"central"},["3 frames"]],["g",{"transform":"translate(0 0)"},[["rect",{"width":"200","height":"150","rx":"6","class":"fill-none stroke-border"},[]],["text",{"x":"0","y":"-12","class":"fill-text-tertiary text-caption font-[400]","dominant-baseline":"central"},["ready"]]]],["g",{"transform":"translate(240 0)"},[["rect",{"width":"200","height":"150","rx":"6","class":"fill-none stroke-accent stroke-[2]"},[]],["text",{"x":"0","y":"-12","class":"fill-text text-caption font-[550]","dominant-baseline":"central"},["failed"]]]]]]]} width={440.0} height={150.0} /></Frame>
];
