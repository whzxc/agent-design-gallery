import { Frame, Icon } from 'sdg';
export function Field({form='search',label='Find assets…',icon='folder',meta='⌘F',width=236,height=32}: {form?:string;label?:string;icon?:string;meta?:string;width?:number;height?:number}) {
  const search=form.startsWith('search'), input=form.startsWith('input'), active=form==='search-active';
  return <div class={`flex items-center shrink-0 rounded-field leading-[1.2] ${active?'bg-surface outline outline-accent -outline-offset-1':'bg-surface-sunken'} ${form==='input-error'?'outline outline-danger -outline-offset-1':''} ${input?'px-3 font-mono text-meta':'px-[10px] text-body'} ${form==='input-empty'||form==='search'?'text-text-tertiary':'text-text'}`} style={{width,height}}>
    {!input && <Icon name={search?'search':icon} size={14} class={search?'text-text-tertiary':'text-text-secondary'}/>}
    <span class={`min-w-0 flex-1 ${input?'':search?'ml-2':'ml-[10px] font-[550]'}`}>{label}</span>
    {active?<Icon name="x" size={14} class="text-text-tertiary"/>:search?<span class="text-meta text-text-tertiary">{meta}</span>:!input?<Icon name="chevron-down" size={12} class="text-text-tertiary"/>:null}
  </div>;
}
export default () => [
<Frame name="search" width={236.0} height={32.0}><Field {...{"form":"search","width":236.0,"height":32.0,"label":"Find assets…","icon":"search","meta":"⌘F"}} /></Frame>,
<Frame name="search-active" width={236.0} height={32.0}><Field {...{"form":"search-active","width":236.0,"height":32.0,"label":"pill","icon":"search"}} /></Frame>,
<Frame name="picker" width={236.0} height={32.0}><Field {...{"form":"picker","width":236.0,"height":32.0,"label":"agent-remote-control","icon":"folder"}} /></Frame>,
<Frame name="input" width={360.0} height={32.0}><Field {...{"form":"input","width":360.0,"height":32.0,"label":"~/projects/arc/design"}} /></Frame>,
<Frame name="input-error" width={360.0} height={32.0}><Field {...{"form":"input-error","width":360.0,"height":32.0,"label":"~/projects/empty"}} /></Frame>,
<Frame name="input-empty" width={360.0} height={32.0}><Field {...{"form":"input-empty","width":360.0,"height":32.0,"label":"/path/to/design"}} /></Frame>
];
