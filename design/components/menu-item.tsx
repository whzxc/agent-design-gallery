import { Frame, Icon } from 'sdg';
export function MenuItem({form='item',label='Fit all',meta, width=180,height=30}: {form?:string;label?:string;meta?:string;width?:number;height?:number;icon?:string}) {
  return <div class={`flex items-center px-[10px] shrink-0 rounded-row leading-[1.2] ${form==='item-active'?'bg-surface-sunken':''} ${form==='label'?'text-caption text-text-tertiary font-[550]':'text-body text-text'}`} style={{width,height}}>
    {(form==='check'||form==='option') && <span class="w-[22px] shrink-0">{form==='check'&&<Icon name="check" size={14}/>}</span>}
    <span>{label}</span>{meta&&<span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}
export default () => [
<Frame name="item" width={180.0} height={30.0}><MenuItem {...{"form":"item","width":180.0,"height":30.0,"label":"Fit all","meta":"0"}} /></Frame>,
<Frame name="item-active" width={180.0} height={30.0}><MenuItem {...{"form":"item-active","width":180.0,"height":30.0,"label":"Fit group"}} /></Frame>,
<Frame name="check" width={180.0} height={30.0}><MenuItem {...{"form":"check","width":180.0,"height":30.0,"label":"System","icon":"check"}} /></Frame>,
<Frame name="option" width={180.0} height={30.0}><MenuItem {...{"form":"option","width":180.0,"height":30.0,"label":"Light"}} /></Frame>,
<Frame name="label" width={180.0} height={24.0}><MenuItem {...{"form":"label","width":180.0,"height":24.0,"label":"Theme"}} /></Frame>
];
