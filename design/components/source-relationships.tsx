import { Frame, Icon } from 'sdg';
import { Inspector } from './panel';

const uses = [
  {directory:'modules',entries:[{name:'home'},{name:'scenarios'},{name:'composer',via:'home'}]},
  {directory:'components',entries:[{name:'alert',via:'home'}]},
];
const examples = [
  {name:'frame',source:'surfaces/home.tsx',title:'home',frame:'default',size:'940 × 768',uses,usedBy:[]},
  {name:'element',source:'modules/composer.tsx',title:'HomeComposer',frame:'default · 940 × 768',size:'768 × 152',exportName:'HomeComposer',matches:['composer-home-enhancement-ready','composer-home-enhancement-enhancing','composer-home'],uses:[{directory:'components',entries:[{name:'alert'},{name:'button'}]}],usedBy:[{directory:'modules',entries:[{name:'home'}]},{directory:'surfaces',entries:[{name:'home',via:'modules/home'}]}]},
];
export function DetailInspector({source,title,frame,size,exportName,matches,uses,usedBy}:any) {
  const rows=(matches??['default','cloud-banner','project']).map((label:string,i:number)=>({label,form:!exportName&&i===0?'item-selected':'item',icon:'app-window',meta:size}));
  return <Inspector title={title} path={source} frameName={frame} frameSize={size} rows={rows} heading={matches?'Frames using this export':'Frames'}>
    <section class="p-4 pt-3">
      <h3 class="mb-3 text-body leading-4 font-[550]">Relationships</h3>
      <div class="flex flex-col gap-3">{[{title:'Uses',groups:uses},{title:'Used by',groups:usedBy}].map(({title,groups})=><section>
        <h4 class="mb-1 text-meta leading-4 font-[550] text-text-tertiary">{title}</h4>
        {groups.length?groups.map(({directory,entries}:any)=><div>
          <h5 class="mx-2 mt-1 text-meta leading-4 font-normal text-text-tertiary">{directory}</h5>
          {entries.map(({name,via}:any)=><button class={`flex min-h-7 py-[6px] w-full items-center gap-2 rounded-row px-2 text-body ${via?'text-text-tertiary':'text-text-secondary'}`}><Icon name={directory==='surfaces'?'app-window':'component'} size={14}/><span class="min-w-0 whitespace-normal break-words">{name}{via&&` · via ${via}`}</span></button>)}
        </div>):<p class="mx-2 text-meta leading-4 text-text-secondary">None</p>}
      </section>)}</div>
    </section>
  </Inspector>;
}
export default () => examples.map(example=><Frame name={example.name}><DetailInspector {...example}/></Frame>);
