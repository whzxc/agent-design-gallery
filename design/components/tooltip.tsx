import { Frame } from 'adg';

export function Tooltip({ label = 'Inspector' }: { label?: string }) {
  return (
    <div
      role="tooltip"
      class="inline-flex h-[26px] items-center rounded-row bg-tooltip px-2
        text-meta leading-[14px] whitespace-nowrap text-on-tooltip"
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
