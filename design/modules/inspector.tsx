import { Frame, Icon } from 'adg';
import { Panel } from '../components/panel';
import { TreeRow } from '../components/tree-row';
import inspectorFixtures from '../fixtures/inspector.json';

export function Inspector({
  title = 'mcp-hub',
  path = 'surfaces/mcp-hub.tsx',
  heading = 'Frames',
  rows = [],
  frameName,
  frameSize,
  copiedPath = false,
  copiedFrame = false,
  uses = [],
  usedBy = [],
  children,
}: any) {
  const chosen = rows.find((row: any) => row.form?.endsWith('selected'));
  const label = frameName ?? chosen?.label;
  const size = frameSize ?? chosen?.meta;

  return (
    <Panel width={300}>
      <div class="p-4 pb-3">
        <h2 class="truncate text-title leading-5 font-[650]">{title}</h2>
        <button
          type="button"
          aria-label={copiedPath ? 'Copied source path' : 'Copy source path'}
          class="mt-1 flex items-center gap-2 text-left font-mono text-meta leading-4 text-text-secondary"
        >
          <span class="min-w-0 [overflow-wrap:anywhere]">{path}</span>
          <Icon name={copiedPath ? 'check' : 'copy'} size={12} class="shrink-0 text-text-tertiary" />
        </button>
        {label && (
          <div class="mt-3 flex items-center justify-between gap-2 text-body leading-4">
            <button
              type="button"
              aria-label={copiedFrame ? 'Copied frame name' : 'Copy frame name'}
              class="flex min-w-0 items-center gap-2 text-left"
            >
              <span class="min-w-0 [overflow-wrap:anywhere]">{label}</span>
              <Icon name={copiedFrame ? 'check' : 'copy'} size={12} class="shrink-0 text-text-tertiary" />
            </button>
            <span class="shrink-0 text-meta text-text-tertiary">{size}</span>
          </div>
        )}
      </div>
      <div class="mx-4 h-px bg-border" />
      <section class="pt-3">
        <h3 class="mx-4 mb-[6px] text-meta leading-4 font-[550] text-text-tertiary">{heading}</h3>
        <div class="max-h-[220px] overflow-auto px-2 pb-3">
          {!rows.length && <p class="mx-2 text-meta leading-4 text-text-secondary">No matching frames</p>}
          {rows.map((row: any) => {
            const selected = row.form?.endsWith('selected');
            return (
              <div>
                <button
                  type="button"
                  aria-current={selected ? 'true' : 'false'}
                  class={`flex min-h-(--row-height) w-full items-center gap-[6px] rounded-row px-2 py-[6px]
                    text-left leading-[1.2] ${selected ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}
                >
                  <Icon
                    name={row.icon ?? 'app-window'}
                    size={14}
                    class={`shrink-0 ${selected ? 'text-text' : 'text-text-tertiary'}`}
                  />
                  <span class="min-w-0 flex-1 break-words whitespace-normal text-body">{row.label}</span>
                  {row.meta && <span class="ml-auto shrink-0 text-meta text-text-tertiary">{row.meta}</span>}
                </button>
                {row.note && <p class="mx-2 mt-1 mb-2 text-body leading-[1.2] text-text-secondary">{row.note}</p>}
              </div>
            );
          })}
        </div>
      </section>
      <div class="mx-4 h-px bg-border" />
      {children ?? <InspectorRelationships uses={uses} usedBy={usedBy} />}
    </Panel>
  );
}

function InspectorRelationships({ uses, usedBy }: any) {
  return (
    <section class="p-4 pt-3">
      <h3 class="mb-3 text-body leading-4 font-[550]">Relationships</h3>
      <div class="flex flex-col gap-3">
        {[
          { title: 'Uses', groups: uses },
          { title: 'Used by', groups: usedBy },
        ].map(({ title, groups }) => (
          <section>
            <h4 class="mb-1 text-meta leading-4 font-[550] text-text-tertiary">{title}</h4>
            {groups.length ? (
              groups.map(({ directory, entries }: any) => (
                <div>
                  <h5 class="mx-2 mt-1 text-meta leading-4 font-normal text-text-tertiary">{directory}</h5>
                  {entries.map(({ name, via }: any) => {
                    const icon = directory === 'surfaces' ? 'app-window' : 'component';
                    if (!via) return <TreeRow form="item" label={name} icon={icon} width={268} multiline />;
                    return (
                      <button
                        type="button"
                        class="flex min-h-(--row-height) w-full items-center gap-2 rounded-row px-2 py-[6px]
                          text-left text-body text-text-tertiary"
                      >
                        <Icon name={icon} size={14} class="shrink-0 text-text-tertiary" />
                        <span class="min-w-0 break-words whitespace-normal">
                          {name} · via {via}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <p class="mx-2 text-meta leading-4 text-text-secondary">None</p>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

const inspectorFrames = ['source', 'frame', 'element', 'element-empty'] as const;

export default () =>
  inspectorFrames.map(name => (
    <Frame name={name}>
      <Inspector {...inspectorFixtures[name]} />
    </Frame>
  ));
