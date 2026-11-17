import { Frame, Icon } from 'adg';
import { Panel } from '../components/panel';
import shortcutFixtures from '../fixtures/shortcuts.json';

export function Kbd({ label = '⌘F' }: { label?: string }) {
  return <span class="inline-flex items-center justify-center shrink-0 h-[var(--keycap-size)] px-[7px] bg-surface-sunken rounded-[7px] text-text-secondary text-meta font-mono leading-none">{label}</span>;
}
export function Shortcuts({ shortcuts = [] }: { shortcuts?: string[][][] | any[] }) {
  return (
    <Panel form="dialog" width={380} height={382}>
      <div class="relative px-5 pt-5 pb-3">
        <div class="flex items-center justify-between h-5">
          <h2 class="text-title font-[650] leading-5">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close keyboard shortcuts" class="absolute top-[18px] right-4 grid size-(--control-size) place-items-center text-text-secondary"><Icon name="x" size={14} /></button>
        </div>
        <div class="mt-6">
          {shortcuts.map(([label, keys]) => (
            <div class="flex items-start justify-between h-[34px] leading-[22px] text-body text-text-secondary">
              <span>{label}</span>
              <div class="flex gap-[6px]">
                {keys.map((label) => (
                  <Kbd label={label} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export default () => <Frame name="default">
  <div class="bg-canvas p-6"><Shortcuts shortcuts={shortcutFixtures.items} /></div>
</Frame>;
