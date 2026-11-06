import { Frame, Icon } from 'sdg';
const forms = [
  {
    "form": "root",
    "width": 236,
    "label": "All designs",
    "icon": "layout-grid",
    "meta": "25"
  },
  {
    "form": "root-selected",
    "width": 236,
    "label": "All designs",
    "icon": "layout-grid",
    "meta": "25"
  },
  {
    "form": "group",
    "width": 236,
    "label": "Essentials",
    "icon": "chevron-right",
    "meta": "8"
  },
  {
    "form": "group-selected",
    "width": 236,
    "label": "Essentials",
    "icon": "chevron-down",
    "meta": "8"
  },
  {
    "form": "item",
    "width": 236,
    "label": "button",
    "icon": "component",
    "meta": "5 forms"
  },
  {
    "form": "item-selected",
    "width": 236,
    "label": "field",
    "icon": "component",
    "meta": "2 forms"
  },
  {
    "form": "two-line",
    "width": 300,
    "label": "arc",
    "icon": "folder",
    "meta": "~/projects/arc/design"
  },
  {
    "form": "two-line-selected",
    "width": 300,
    "label": "hub",
    "icon": "folder",
    "meta": "~/projects/hub/design"
  }
];

export function TreeRow({form='item',label='button',meta,icon,indent=0,width=236,height=form.startsWith('two-line')?44:28}: {form?:string;label?:string;meta?:string;icon?:string;indent?:number;width?:number;height?:number}) {
  const two=form.startsWith('two-line'),group=form.startsWith('group');
  return <div class={`flex items-center shrink-0 pr-2 rounded-row leading-[1.2] ${indent===20?'pl-7':indent===-2?'pl-[6px]':'pl-2'} ${form.endsWith('selected')?'bg-surface-sunken':''} ${form==='item'?'text-text-secondary':'text-text'}`} style={{width,height}}>
    <Icon name={icon??(group?'chevron-down':two?'folder-open':form.startsWith('root')?'layout-grid':'component')} size={two?16:14} class={form.endsWith('selected')?'text-text':'text-text-tertiary'}/>
    <div class={two?'ml-3 flex flex-col gap-[3px]':group?'ml-[6px]':'ml-2'}><span class={`text-body ${two||group||form.startsWith('root')?'font-[550]':''}`}>{label}</span>{two&&<span class="text-caption font-mono text-text-tertiary">{meta}</span>}</div>
    {!two&&meta&&<span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}
export default () => forms.map(props => <Frame name={props.form}><TreeRow {...props} /></Frame>);
