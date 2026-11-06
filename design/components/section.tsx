import { Frame } from 'sdg';
import { Geometry, type Shape } from './canvas';
export function Section({nodes,width,height,top=24.5}: {nodes:Shape[];width:number;height:number;top?:number}) {
  return <svg width={width} height={height+top} class="overflow-visible"><g transform={`translate(0 ${top})`}><Geometry nodes={nodes}/></g></svg>;
}
export default () => [
<Frame name="default" width={440.0} height={194.5}><Section nodes={[["g",{},[["rect",{"width":"440","height":"170","rx":"16","class":"fill-surface-section stroke-border"},[]],["text",{"x":"2","y":"-16","class":"fill-text text-section font-[650]","dominant-baseline":"central"},["Essentials"]],["text",{"x":"79.9","y":"-16","class":"fill-text-tertiary text-meta font-[400]","dominant-baseline":"central"},["8 assets"]]]]]} width={440.0} height={170.0} /></Frame>
];
