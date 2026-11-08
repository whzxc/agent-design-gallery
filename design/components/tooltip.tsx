import { Frame } from 'sdg';
export function Tooltip({ label = 'Inspector' }: { label?: string }) {
  return (
    <div
      class={`inline-flex items-center h-[26px] px-2 rounded-row bg-tooltip
      text-on-tooltip text-meta leading-[14px] whitespace-nowrap`}
    >
      {label}
    </div>
  );
}
export default () => (
  <Frame name="default">
    <Tooltip />
  </Frame>
);
