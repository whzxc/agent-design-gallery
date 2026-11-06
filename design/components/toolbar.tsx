import { Frame, Icon } from 'sdg';
import { Field } from './field';
import { IconButton } from './icon-button';
export function Toolbar({width=152,height=44,children}: {form?:string;width?:number;height?:number;children?:unknown}) {
  return <div class="flex flex-col bg-surface rounded-panel shadow-float" style={{width,height}}>{children}</div>;
}
export default () => [
<Frame name="floating" width={152.0} height={44.0}><Toolbar form="floating" width={152.0} height={44.0}>
<div class="grid items-center shrink-0" style={{height:32.0,marginTop:6.0,gridTemplateColumns:"6.0px 36.0px 36.0px 36.0px 38.0px"}}><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:2}}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"sun-moon"}} /></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:3}}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"panel-right"}} /></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:4}}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"maximize"}} /></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:5}}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"ellipsis"}} /></div></div>
</Toolbar></Frame>,
<Frame name="app-bar" width={280.0} height={44.0}><Toolbar form="app-bar" width={280.0} height={44.0}>
<div class="grid items-center shrink-0" style={{height:32.0,marginTop:6.0,gridTemplateColumns:"6.0px 40.0px 39.8px 8.0px 186.2px"}}><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:2}}><IconButton {...{"form":"default","width":32.0,"height":32.0,"icon":"panel-left"}} /></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:3}}><span class="text-text text-section font-[650] whitespace-nowrap leading-[1.2]">{"SDG"}</span></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:4}}><div class="shrink-0 bg-border" style={{width:1,height:20}} /></div><div class="justify-self-start flex items-center" style={{gridRow:1,gridColumn:5}}><Field {...{"form":"picker","width":180.2,"height":32.0,"label":"arc","icon":"folder"}} /></div></div>
</Toolbar></Frame>
];
