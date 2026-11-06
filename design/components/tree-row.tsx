import { Frame, Icon } from 'sdg';
export function TreeRow({form='item',label='button',meta,icon,indent=0,width=236,height=28}: {form?:string;label?:string;meta?:string;icon?:string;indent?:number;width?:number;height?:number}) {
  const two=form.startsWith('two-line'),group=form.startsWith('group');
  return <div class={`flex items-center shrink-0 px-2 rounded-row leading-[1.2] ${form.endsWith('selected')?'bg-surface-sunken':''} ${form==='item'?'text-text-secondary':'text-text'}`} style={{width,height,paddingLeft:8+indent}}>
    <Icon name={icon??(group?'chevron-down':two?'folder-open':form.startsWith('root')?'layout-grid':'component')} size={two?16:14} class={form.endsWith('selected')?'text-text':'text-text-tertiary'}/>
    <div class={two?'ml-3 flex flex-col gap-[2.8px]':group?'ml-[6px]':'ml-2'}><span class={`text-body ${two||group||form.startsWith('root')?'font-[550]':''}`}>{label}</span>{two&&<span class="text-caption font-mono text-text-tertiary">{meta}</span>}</div>
    {!two&&meta&&<span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}
export default () => [
<Frame name="root" width={236.0} height={28.0}><TreeRow {...{"form":"root","width":236.0,"height":28.0,"label":"All designs","icon":"layout-grid","meta":"25"}} /></Frame>,
<Frame name="root-selected" width={236.0} height={28.0}><TreeRow {...{"form":"root-selected","width":236.0,"height":28.0,"label":"All designs","icon":"layout-grid","meta":"25"}} /></Frame>,
<Frame name="group" width={236.0} height={28.0}><TreeRow {...{"form":"group","width":236.0,"height":28.0,"label":"Essentials","icon":"chevron-right","meta":"8"}} /></Frame>,
<Frame name="group-selected" width={236.0} height={28.0}><TreeRow {...{"form":"group-selected","width":236.0,"height":28.0,"label":"Essentials","icon":"chevron-down","meta":"8"}} /></Frame>,
<Frame name="item" width={236.0} height={28.0}><TreeRow {...{"form":"item","width":236.0,"height":28.0,"label":"button","icon":"component","meta":"5 forms"}} /></Frame>,
<Frame name="item-selected" width={236.0} height={28.0}><TreeRow {...{"form":"item-selected","width":236.0,"height":28.0,"label":"field","icon":"component","meta":"2 forms"}} /></Frame>,
<Frame name="two-line" width={300.0} height={44.0}><TreeRow {...{"form":"two-line","width":300.0,"height":44.0,"label":"arc","icon":"folder","meta":"~/projects/arc/design"}} /></Frame>,
<Frame name="two-line-selected" width={300.0} height={44.0}><TreeRow {...{"form":"two-line-selected","width":300.0,"height":44.0,"label":"hub","icon":"folder","meta":"~/projects/hub/design"}} /></Frame>
];
