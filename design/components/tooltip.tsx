import { Frame } from 'sdg';
export function Tooltip({label='Inspector',width=69.4,height=26}: {form?:string;label?:string;width?:number;height?:number}) {
  return <div class="flex items-center px-2 rounded-row bg-tooltip text-on-tooltip text-meta leading-[1.2]" style={{width,height}}>{label}</div>;
}
export default () => [
<Frame name="default" width={69.4} height={26.0}><Tooltip {...{"form":"default","width":69.4,"height":26.0,"label":"Inspector"}} /></Frame>
];
