import { Frame, jsx } from 'sdg';
import { previews } from '../art/arc-previews';
export type Shape = [string, Record<string, unknown>, (Shape|string)[]];
// The viewer's free-form canvas uses the fixture's retained drawing geometry.
export function Geometry({nodes}: {nodes:(Shape|string)[]}): unknown {
  return nodes.map(node => {
    if (typeof node==='string') return node;
    const [tag,attributes,children]=node;
    const {image,...props}=attributes;
    return jsx(tag,{...props,...(image?{href:previews[String(image)]}:{}),children:<Geometry nodes={children}/>});
  });
}
export function Canvas({width=280,height=150,children}: {width?:number;height?:number;children?:unknown}) {
  return <div class="relative overflow-hidden bg-canvas" style={{width,height}}>
    <svg class="absolute inset-0" width={width} height={height} aria-hidden="true"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="fill-dot"/></pattern></defs><rect width={width} height={height} fill="url(#dots)"/></svg>{children}
  </div>;
}
export default () => [
<Frame name="dots" width={280.0} height={150.0}><Canvas width={280} height={150} /></Frame>
];
