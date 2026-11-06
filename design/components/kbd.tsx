import { Frame } from 'sdg';
export function Kbd({label='⌘F',width=28.4,height=22}: {form?:string;label?:string;width?:number;height?:number}) {
  return <span class="inline-flex items-center justify-center shrink-0 bg-surface-sunken rounded-artboard text-text-secondary text-meta font-mono leading-[1.2]" style={{width,height}}>{label}</span>;
}
export default () => [
<Frame name="default" width={28.4} height={22.0}><Kbd {...{"form":"default","width":28.4,"height":22.0,"label":"⌘F"}} /></Frame>
];
