import { Frame } from 'sdg';
export function Kbd({ label = '⌘F' }: { label?: string }) {
  return <span class="inline-flex items-center justify-center shrink-0 h-[22px] min-w-[22px] px-[7px] bg-surface-sunken rounded-artboard text-text-secondary text-meta font-mono leading-none">{label}</span>;
}
export default () => <Frame name="default"><Kbd /></Frame>;
