import { Frame } from 'sdg';
export function Section({title='Essentials',count='8 assets',width=440,height=170}:any) {
  return <svg data-free width={width} height={height+25}><rect y="25" width={width} height={height} rx="16" class="fill-surface-section stroke-border"/><text x="2" y="9" dominant-baseline="central" class="fill-text text-section font-[650]">{title}<tspan dx="8" class="fill-text-tertiary text-meta font-normal">{count}</tspan></text></svg>;
}
export default () => <Frame name="default"><Section/></Frame>;
