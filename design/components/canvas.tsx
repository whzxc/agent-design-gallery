import { Frame, Icon } from 'sdg';
import { Sidebar, Inspector, Menu, OpenDialog, Shortcuts } from './panel';
import { Tools, AppBar, ZoomBar } from './toolbar';
import { Tooltip } from './tooltip';
import { Minimap } from './minimap';
const labelClasses: Record<string,string> = {
  section:'fill-text text-section font-[650]', set:'fill-text-secondary text-meta font-[550]',
  'selected-set':'fill-text text-meta font-[550]', flow:'fill-text-secondary text-meta font-semibold',
  count:'fill-text-tertiary text-meta', form:'fill-text-tertiary text-caption',
  'selected-frame':'fill-text text-caption font-[550]',
};
export function Drawing({ nodes }: { nodes: any[] }): unknown {
  return nodes.map(({ at:[x,y], size:[width,height], kind, selected, outline=true, preview, labels=[], children=[] }) =>
    <g transform={`translate(${x} ${y})`}>
      {kind==='section' && <rect width={width} height={height} rx={16} class="fill-surface-section stroke-border"/>}
      {preview && <svg width={width} height={height} viewBox={preview.crop} class="overflow-hidden rounded-[6px]">
        <image width={preview.size[0]} height={preview.size[1]} href={preview.light} class="dark:hidden"/>
        <image width={preview.size[0]} height={preview.size[1]} href={preview.dark} class="hidden dark:inline"/>
      </svg>}
      {kind!=='section' && outline && <rect width={width} height={height} rx={Math.min(6,width/2,height/2)} class={selected?'fill-none stroke-accent stroke-[2]':'fill-none stroke-border'}/>}
      {labels.map(([x,y,role,text]:any)=>role==='copy' ? <g transform={`translate(${x} ${y-6})`}><Icon name="copy" size={12} class="text-text-tertiary"/></g> : <text x={x} y={y} dominant-baseline="central" class={labelClasses[role]}>{text}</text>)}
      <Drawing nodes={children}/>
    </g>);
}
export function Canvas({ width = 280, height = 150, children }: { width?: number; height?: number; children?: unknown }) {
  return <div class="relative overflow-hidden bg-canvas" style={{ width, height }}>
    <svg data-free class="absolute inset-0" width={width} height={height} aria-hidden="true"><defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" class="fill-dot" /></pattern></defs><rect width={width} height={height} fill="url(#dots)" /></svg>{children}
  </div>;
}
const chromeComponents: Record<string,(props:any)=>unknown> = { sidebar: Sidebar, inspector: Inspector, menu: Menu, dialog: OpenDialog, shortcuts: Shortcuts, tools: Tools, app: AppBar, zoom: ZoomBar, tooltip: Tooltip, minimap: Minimap };
export function Screen({ width, height, scene=[], chrome }: any) {
  return <Canvas width={width} height={height}>
    <div data-free class="absolute inset-0">
    <svg class="absolute inset-0 overflow-visible" width={width} height={height}><Drawing nodes={scene}/></svg>
    {chrome.map(({ kind, left, top, ...props }: any) => {
      if (kind === 'scrim') return <div class="absolute inset-0 bg-canvas opacity-60"/>;
      const Component = chromeComponents[kind];
      return <div class="absolute" style={{left,top}}><Component {...props}/></div>;
    })}
    </div>
  </Canvas>;
}
export default () => <Frame name="dots"><Canvas/></Frame>;
