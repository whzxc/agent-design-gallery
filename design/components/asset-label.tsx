import { Frame, Icon } from 'sdg';

const specimen = { name: 'button', count: '5 forms', modified: 'Nov 7, 13:24', timestamp: '2026-11-07 13:24:08' };

export function AssetLabel({ name, count, modified, timestamp, copied = false }: { name: string; count: string; modified: string; timestamp: string; copied?: boolean }) {
  return <div class="flex items-center gap-[6px] text-meta leading-[1.2]">
    <button type="button" aria-label={copied ? `Copied ${name}` : `Copy ${name} name`} class="flex items-center gap-1 text-left font-[550] text-text-secondary">
      <span>{name}</span><Icon name={copied ? 'check' : 'copy'} size={12} class="text-text-tertiary"/>
    </button>
    <span class="text-text-tertiary">{count}</span>
    <time class="ml-1 text-text-tertiary" title={timestamp}>{modified}</time>
  </div>;
}

export default () => ['modified', 'copied'].map(name => <Frame name={name} note="Click the asset heading or its icon to copy the displayed name. The check resets after 1.2 seconds.">
  <div class="flex flex-col gap-3 bg-canvas p-6">
    <AssetLabel {...specimen} copied={name === 'copied'}/>
    <div class="h-20 w-[360px] rounded-artboard border border-border bg-surface-section"/>
  </div>
</Frame>);
