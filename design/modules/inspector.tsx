import { Frame, Icon } from 'sdg';
import { Panel } from '../components/panel';
import { IconButton } from '../components/icon-button';
import { TreeRow } from '../components/tree-row';
import inspectorFixtures from '../fixtures/inspector.json';

export function Inspector({
  title = 'mcp-hub',
  path = 'surfaces/mcp-hub.tsx',
  heading = 'Frames',
  rows = [],
  frameName,
  frameSize,
  uses = [],
  usedBy = [],
  children,
}: any) {
  const chosen = rows.find((row: any) => row.form?.endsWith('selected'));
  const label = frameName ?? chosen?.label,
    size = frameSize ?? chosen?.meta;
  return (
    <Panel width={300}>
      <div class="p-4 pb-3">
        <div class="flex items-center justify-between">
          <h2 class="text-title leading-5 font-[650]">{title}</h2>
          <IconButton icon="panel-right" />
        </div>
        <button class="mt-1 flex items-center gap-2 font-mono text-meta leading-4 text-text-secondary">
          <span>{path}</span>
          <Icon name="copy" size={12} />
        </button>
        {label && (
          <div class="mt-3 flex items-center justify-between text-body leading-4">
            <button class="flex items-center gap-2">
              <span>{label}</span>
              <Icon name="copy" size={12} />
            </button>
            <span class="text-meta text-text-tertiary">{size}</span>
          </div>
        )}
      </div>
      <div class="h-px bg-border mx-4" />
      <section class="py-3">
        <h3 class="text-meta text-text-tertiary font-[550] leading-4 mb-[6px] mx-4">{heading}</h3>
        <div class="px-2">
          {!rows.length && <p class="mx-2 text-meta leading-4 text-text-secondary">No matching frames</p>}
          {rows.map((row: any) => (
            <div>
              <TreeRow {...row} width={300 - 16} indent={-2} multiline />
              {row.note && <p class="mx-2 mt-1 mb-2 text-body leading-[1.2] text-text-secondary">{row.note}</p>}
            </div>
          ))}
        </div>
      </section>
      <div class="h-px bg-border mx-4" />
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
                  {entries.map(({ name, via }: any) => (
                    <button
                      class={`flex min-h-[var(--row-height)] py-[6px] w-full items-center gap-2 rounded-row px-2 text-body
                ${via ? 'text-text-tertiary' : 'text-text-secondary'}`}
                    >
                      <Icon name={directory === 'surfaces' ? 'app-window' : 'component'} size={14} />
                      <span class="min-w-0 whitespace-normal break-words">
                        {name}
                        {via && ` · via ${via}`}
                      </span>
                    </button>
                  ))}
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

export default () =>
  ['frames', 'frame', 'element', 'source', 'export-element', 'export-element-nested', 'export-element-empty'].map(
    (name) => (
      <Frame name={name}>
        <Inspector {...inspectorFixtures[name]} />
      </Frame>
    ),
  );
