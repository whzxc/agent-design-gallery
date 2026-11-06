import { Frame, Icon } from 'sdg';
export function Button({form='primary',label='Open',icon, width, height=32}: {form?:string;label?:string;icon?:string;width?:number;height?:number}) {
  const zoom=form.startsWith('zoom');
  return <div class={`flex items-center shrink-0 text-body leading-[1.2] font-[550] ${zoom?'rounded-row gap-1 px-[10px]':'rounded-field gap-[10px] '+(icon?'px-3':'px-[14px]')} ${form==='primary'?'bg-accent text-on-accent':form==='secondary'||form==='zoom-open'?'bg-surface-sunken text-text':'text-text'}`} style={{width,height}}>
    {icon && !zoom && <Icon name={icon} size={14} class="text-text-secondary"/>}<span>{label}</span>{zoom && <Icon name="chevron-down" size={12} class="text-text-tertiary"/>}
  </div>;
}
export default () => [
<Frame name="primary" width={61.5} height={32.0}><Button {...{"form":"primary","width":61.5,"height":32.0,"label":"Open"}} /></Frame>,
<Frame name="secondary" width={113.9} height={32.0}><Button {...{"form":"secondary","width":113.9,"height":32.0,"label":"Copy path","icon":"copy"}} /></Frame>,
<Frame name="zoom" width={63.6} height={32.0}><Button {...{"form":"zoom","width":63.6,"height":32.0,"label":"48%","icon":"chevron-down"}} /></Frame>,
<Frame name="zoom-open" width={63.6} height={32.0}><Button {...{"form":"zoom-open","width":63.6,"height":32.0,"label":"48%","icon":"chevron-down"}} /></Frame>
];
