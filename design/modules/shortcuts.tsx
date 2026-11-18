import { Frame } from 'adg';
import { IconButton } from '../components/icon-button';
import { Panel } from '../components/panel';
import shortcutFixtures from '../fixtures/shortcuts.json';

function Kbd({ label = '⌘F' }: { label?: string }) {
  return (
    <kbd
      class="inline-flex h-(--keycap-size) shrink-0 items-center justify-center rounded-keycap bg-surface-sunken
        px-[7px] font-mono text-meta leading-none text-text-secondary"
    >
      {label}
    </kbd>
  );
}

export function Shortcuts({ shortcuts = [] }: { shortcuts?: [string, string[]][] }) {
  return (
    <Panel form="dialog" width={380}>
      <div class="p-5">
        <header class="flex items-center justify-between">
          <h2 class="text-title leading-5 font-[650]">Keyboard shortcuts</h2>
          <IconButton icon="x" iconSize={14} label="Close keyboard shortcuts" />
        </header>
        <dl class="mt-4 flex flex-col gap-3">
          {shortcuts.map(([label, keys]) => (
            <div class="flex items-center justify-between text-body leading-[22px] text-text-secondary">
              <dt>{label}</dt>
              <dd class="flex gap-[6px]">
                {keys.map(key => (
                  <Kbd label={key} />
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

export default () => (
  <Frame name="default">
    <div class="bg-canvas p-6">
      <Shortcuts shortcuts={shortcutFixtures.items as [string, string[]][]} />
    </div>
  </Frame>
);
