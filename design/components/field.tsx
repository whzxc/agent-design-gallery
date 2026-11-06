import { Frame, Icon } from 'sdg';
const forms = [
  {
    "form": "search",
    "width": 236,
    "label": "Find assets…",
    "icon": "search",
    "meta": "⌘F"
  },
  {
    "form": "search-active",
    "width": 236,
    "label": "pill",
    "icon": "search"
  },
  {
    "form": "picker",
    "width": 236,
    "label": "agent-remote-control",
    "icon": "folder"
  },
  {
    "form": "input",
    "width": 360,
    "label": "~/projects/arc/design"
  },
  {
    "form": "input-error",
    "width": 360,
    "label": "~/projects/empty"
  },
  {
    "form": "input-empty",
    "width": 360,
    "label": "/path/to/design"
  }
];

export function Field({form='search',label='Find assets…',icon='folder',meta='⌘F',width=236,height=32}: {form?:string;label?:string;icon?:string;meta?:string;width?:number;height?:number}) {
  const search=form.startsWith('search'), input=form.startsWith('input'), active=form==='search-active';
  return <div class={`flex items-center shrink-0 rounded-field leading-[1.2] ${active?'bg-surface outline outline-accent -outline-offset-1':'bg-surface-sunken'} ${form==='input-error'?'outline outline-danger -outline-offset-1':''} ${input?'px-3 font-mono text-meta':'px-[10px] text-body'} ${form==='input-empty'||form==='search'?'text-text-tertiary':'text-text'}`} style={{width,height}}>
    {!input && <Icon name={search?'search':icon} size={14} class={search?'text-text-tertiary':'text-text-secondary'}/>}
    <span class={`min-w-0 flex-1 ${input?'':search?'ml-2':'ml-[10px] font-[550]'}`}>{label}</span>
    {active?<Icon name="x" size={14} class="text-text-tertiary"/>:search?<span class="text-meta text-text-tertiary">{meta}</span>:!input?<Icon name="chevron-down" size={12} class="text-text-tertiary"/>:null}
  </div>;
}
export default () => forms.map(props => <Frame name={props.form}><Field {...props} /></Frame>);
