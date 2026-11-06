import { Frame } from 'sdg';
import { Geometry, type Shape } from './canvas';
export function Minimap({nodes,width,height}: {nodes:Shape[];width:number;height:number}) {
  return <svg width={width} height={height+0} class="overflow-visible"><g transform={`translate(0 0)`}><Geometry nodes={nodes}/></g></svg>;
}
export default () => [
<Frame name="default" width={200.0} height={132.0}><Minimap nodes={[["g",{},[["rect",{"width":"200","height":"132","rx":"12","class":"fill-surface"},[]],["rect",{"x":"16","y":"16","width":"70","height":"44","rx":"4","class":"fill-surface-section stroke-border"},[]],["rect",{"x":"94","y":"16","width":"90","height":"60","rx":"4","class":"fill-surface-section stroke-border"},[]],["rect",{"x":"16","y":"68","width":"70","height":"48","rx":"4","class":"fill-surface-section stroke-border"},[]],["rect",{"x":"90","y":"12","width":"98","height":"68","rx":"4","class":"fill-none stroke-accent stroke-[1.5]"},[]]]]]} width={200.0} height={132.0} /></Frame>
];
