import { Frame } from 'sdg';
import shortcutFixtures from '../fixtures/shortcuts.json';
export function Kbd({ label = '⌘F' }: { label?: string }) {
  return (
    <span class="inline-flex items-center justify-center shrink-0 h-[var(--keycap-size)] min-w-[var(--keycap-size)] px-[7px] bg-surface-sunken rounded-[var(--radius-keycap)] text-text-secondary text-meta font-mono leading-none">
      {label}
    </span>
  );
}
export default () => (
  <Frame name="default">
    <Kbd {...shortcutFixtures.keycap} />
  </Frame>
);
