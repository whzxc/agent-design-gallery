import { Frame } from 'sdg';
const forms = [
  {name:'set',title:'button',count:'5 forms',labels:['primary','secondary']},
  {name:'set-selected',title:'field',count:'2 forms',labels:['default','error'],selected:true},
  {name:'frame',title:'ready'}, {name:'frame-selected',title:'failed',selected:true},
];
export function Artboard({title,count,labels=[],selected=false,width=220,height=130}:any) {
  return <svg data-free width={width} height={height+20}>
    <rect y="20" width={width} height={height} rx="6" class={selected?'fill-none stroke-accent':'fill-none stroke-border'} stroke-width={selected?2:1}/>
    <text y="8" dominant-baseline="central" class={`${selected?'fill-text':'fill-text-secondary'} ${count?'text-meta font-[550]':'text-caption'}`}>{title}{count&&<tspan dx="6" class="fill-text-tertiary font-normal">{count}</tspan>}</text>
    {labels.map((label:string,i:number)=><text x={16+i*100} y="40" dominant-baseline="central" class="text-caption fill-text-tertiary">{label}</text>)}
  </svg>;
}
export default () => forms.map(({name,...props})=><Frame name={name}><Artboard {...props}/></Frame>);
