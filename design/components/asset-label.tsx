import { Frame } from 'sdg';

const specimen = { name: 'button', count: '5 forms', modified: 'Nov 7, 13:24', timestamp: '2026-11-07 13:24:08' };

export function AssetLabel({ name, count, modified, timestamp }: { name: string; count: string; modified: string; timestamp: string }) {
  return <div class="flex items-center gap-[6px] text-meta leading-[1.2]">
    <span class="font-[550] text-text-secondary">{name}</span>
    <span class="text-text-tertiary">{count}</span>
    <time class="ml-1 text-text-tertiary" title={timestamp}>{modified}</time>
  </div>;
}

export default () => <Frame name="modified" note="Canvas asset heading; the timestamp follows local file modification time.">
  <div class="flex flex-col gap-3 bg-canvas p-6">
    <AssetLabel {...specimen}/>
    <div class="h-20 w-[360px] rounded-artboard border border-border bg-surface-section"/>
  </div>
</Frame>;
