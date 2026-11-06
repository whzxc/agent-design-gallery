import { Frame, Icon } from 'sdg';
import { Field } from './field';
import { Button } from './button';
import { IconButton } from './icon-button';
import { TreeRow } from './tree-row';
import { MenuItem } from './menu-item';
import { Kbd } from './kbd';
const menuRows = [{form:'label',label:'Theme'},{form:'check',label:'System'},{form:'option',label:'Light'}];
const recent = ['arc', 'hub', 'gateway'];
const shortcuts = [
  ['Search', ['⌘F']], ['Fit all', ['0']], ['Zoom to 100%', ['1']],
  ['Zoom in or out', ['+', '−']], ['Pan', ['←', '↑', '→', '↓']],
  ['Focus selection', ['Enter']], ['Back or close', ['Esc']],
] as const;
const sampleRows = [{form:'item-selected',label:'state-pill',meta:'5 forms',icon:'component'}];
const frameRows = ['ready','failed','empty'].map((label,i)=>({label,form:i===1?'item-selected':'item',icon:'app-window',meta:`960 × ${[662,912,432][i]}`}));
export function Panel({ form = 'sidebar', width = 260, height, children }: { form?: string; width?: number; height?: number; children?: unknown }) {
  return <section class={`flex flex-col bg-surface ${form === 'menu' ? 'rounded-menu shadow-menu' : form === 'dialog' ? 'rounded-dialog shadow-menu' : 'rounded-panel shadow-float'}`} style={{ width, height }}>{children}</section>;
}
export function Sidebar({ rows = sampleRows, search = false, height, specimen = false }: any) {
  return <Panel height={search ? undefined : height}>
    <div class="flex items-center gap-[10px] p-[6px]"><IconButton icon="panel-left" /><span class="text-section font-[650]">SDG</span></div>
    <div class="flex flex-col gap-3 px-3 mt-1"><Field form="picker" label={specimen?'arc':'agent-remote-control'} /><Field form={search?'search-active':'search'} label={search?'pill':'Find assets…'} /></div>
    <div class={`px-3 mt-3 ${search?(specimen?'pb-2':'pb-[22px]'):''}`}>
      {search && <div class="text-meta text-text-tertiary font-[550] leading-4 mt-[6px] mb-[6px] ml-[2px]">2 results</div>}
      {rows.map((row:any,i:number)=><>
        <div class={row.form.startsWith('group')?'h-[30px]':''}><TreeRow {...row} indent={!search && row.form.startsWith('item')?20:0}/></div>
        {row.form.startsWith('root') && <div class="h-px bg-border mt-1 mb-[7px]"/>}
        {!search && row.form.startsWith('item') && !rows[i+1]?.form.startsWith('item') && <div class="h-[6px]"/>}
      </>)}
    </div>
  </Panel>;
}
export function Inspector({ title='mcp-hub', path='surfaces/mcp-hub.svg', heading='Frames', rows=frameRows, actions=true }:any) {
  return <Panel width={300}>
    <div class={`px-4 pt-[10px] ${actions?'pb-4':'pb-3'}`}>
      <div class="flex items-center justify-between -mr-[6px]"><h2 class="text-title leading-5 font-[650]">{title}</h2><IconButton icon="x"/></div>
      <div class={`font-mono text-meta text-text-tertiary leading-[14px] ${actions?'mt-[1px]':''}`}>{path}</div>
      {actions && <div class="flex gap-2 mt-[11px]"><Button form="secondary" label="Copy path" icon="copy"/><Button form="secondary" label="Reveal file" icon="folder-open"/></div>}
    </div>
    <div class="h-px bg-border mx-4"/><h3 class="text-meta text-text-tertiary font-[550] leading-4 mt-[13px] mb-[6px] mx-4">{heading}</h3>
    <div class={`px-2 ${actions?'pb-[10px]':'pb-3'}`}>{rows.map((row:any)=><TreeRow {...row} width={284} indent={-2}/>)}</div>
  </Panel>;
}
export function Menu({ rows, width=220 }:any) {
  return <Panel form="menu" width={width}><div class="p-[6px]">{rows.map((row:any,i:number)=><>{i>0 && (row.form==='label' || row.divider) && <div class="h-px bg-border my-1 mx-[2px]"/>}<MenuItem {...row}/></>)}</div></Panel>;
}
export function OpenDialog({ error=false, close=true, specimen=false }:any) {
  return <Panel form="dialog" width={specimen?360:440}>
    <div class={specimen?"px-5 pt-5 pb-4":"px-6 pt-6 pb-[22px]"}>
      <div class="flex items-center justify-between h-5"><h2 class="text-title leading-5 font-[650]">Open a design directory</h2>{close&&<div class="-mr-2"><IconButton icon="x"/></div>}</div>
      <p class="text-body text-text-secondary leading-4 mt-2">Choose a folder that contains SVG designs.</p>
      <div class={specimen?"mt-[14px]":"mt-4"}><Field form={error?'input-error':'input-empty'} label={error?'~/projects/empty':'/path/to/design'} width={specimen?320:392}/></div>
      {error&&<div class="flex items-center gap-[6px] text-meta text-danger leading-[14px] mt-[10px]"><Icon name="circle-alert" size={14}/>No SVG files in this directory.</div>}
      {specimen ? <footer class="flex items-start justify-between mt-[14px]"><h3 class="text-meta text-text-tertiary font-[550] leading-4">Recent</h3><div class="mt-1"><Button label="Open"/></div></footer> : <>
        <h3 class="text-meta text-text-tertiary font-[550] leading-4 mt-4 mb-[6px]">Recent</h3>
        <div class="flex flex-col gap-[2px] -mx-2">{recent.map((label,i)=><TreeRow form={i===0&&!error?'two-line-selected':'two-line'} label={label} meta={`~/projects/${label}/design`} icon="folder" width={408} height={44}/>)}</div>
        <footer class="flex justify-end mt-4"><Button label="Open"/></footer>
      </>}
    </div>
  </Panel>;
}
export function Shortcuts() {
  return <Panel form="dialog" width={380}><div class="px-5 pt-5 pb-3"><div class="flex items-center justify-between h-5"><h2 class="text-title font-[650] leading-5">Keyboard shortcuts</h2><div class="-mr-2"><IconButton icon="x"/></div></div><div class="mt-6">{shortcuts.map(([label,keys])=><div class="flex items-start justify-between h-[34px] leading-[22px] text-body text-text-secondary"><span>{label}</span><div class="flex gap-[6px]">{keys.map(label=><Kbd label={label}/>)}</div></div>)}</div></div></Panel>;
}
export default () => [
  <Frame name="sidebar"><Sidebar search specimen /></Frame>,
  <Frame name="inspector"><Inspector actions={false}/></Frame>,
  <Frame name="menu"><Menu rows={menuRows}/></Frame>,
  <Frame name="dialog"><OpenDialog error specimen /></Frame>,
];
