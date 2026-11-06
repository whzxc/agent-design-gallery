import { Frame, Icon } from 'sdg';
export function IconButton({form='default',icon='panel-right',width=32,height=32}: {form?:string;icon?:string;width?:number;height?:number}) {
  return <div class={`grid place-items-center rounded-row shrink-0 ${form==='active'?'bg-surface-sunken text-text':'text-text-secondary'}`} style={{width,height}}><Icon name={icon}/></div>;
}
export default () => [
<Frame name="default" width={32.0} height={32.0}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"panel-right"}} /></Frame>,
<Frame name="active" width={32.0} height={32.0}><IconButton {...{"form":"active","width":32.0,"height":32.0,"icon":"panel-right"}} /></Frame>
];
