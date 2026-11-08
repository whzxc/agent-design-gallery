import { Frame, Icon } from 'sdg';
import { minimapSpecimen, assetLabelSpecimen, assetLabelNote, drawingSpecimen } from '../fixtures/canvas';

const labelClasses: Record<string, string> = {
  section: 'fill-text text-section font-[650]',
  set: 'fill-text-secondary text-meta font-[550]',
  'selected-set': 'fill-text text-meta font-[550]',
  flow: 'fill-text-secondary text-meta font-semibold',
  count: 'fill-text-tertiary text-meta',
  form: 'fill-text-tertiary text-caption',
  'selected-frame': 'fill-text text-caption font-[550]',
};
export function Drawing({ nodes }: { nodes: any[] }): unknown {
  return nodes.map(
    ({ at: [x, y], size: [width, height], kind, selected, outline = true, preview, labels = [], children = [] }) => (
      <g transform={`translate(${x} ${y})`}>
        {kind === 'section' && (
          <rect width={width} height={height} rx={16} class="fill-surface-section stroke-border" />
        )}
        {preview && (
          <svg width={width} height={height} viewBox={preview.crop} class="overflow-hidden rounded-[6px]">
            <image width={preview.size[0]} height={preview.size[1]} href={preview.light} class="dark:hidden" />
            <image width={preview.size[0]} height={preview.size[1]} href={preview.dark} class="hidden dark:inline" />
          </svg>
        )}
        {kind !== 'section' && outline && (
          <rect
            width={width}
            height={height}
            rx={Math.min(6, width / 2, height / 2)}
            class={selected ? 'fill-none stroke-accent stroke-[2]' : 'fill-none stroke-border'}
          />
        )}
        {labels.map(([x, y, role, text]: any) =>
          role === 'copy' ? (
            <g class="opacity-0" transform={`translate(${x} ${y - 6})`}>
              <Icon name="copy" size={12} class="text-text-tertiary" />
            </g>
          ) : (
            <text x={x} y={y} dominant-baseline="central" class={labelClasses[role]}>
              {text}
            </text>
          ),
        )}
        <Drawing nodes={children} />
      </g>
    ),
  );
}
export function Minimap({
  specimen = false,
  boxes = [],
  viewport = [90, 12, 98, 68],
}: {
  specimen?: boolean;
  boxes?: number[][];
  viewport?: number[];
}) {
  const [x, y, width, height] = viewport;
  return (
    <svg data-free width={200} height={132} class="overflow-visible">
      <rect width="200" height="132" rx="12" class="fill-surface" />
      {boxes.map(([x, y, width, height]) => (
        <rect x={x} y={y} width={width} height={height} rx={4} class="fill-surface-section stroke-border" />
      ))}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={specimen ? 4 : 0}
        stroke-width={specimen ? 1.5 : 1}
        class="fill-none stroke-accent"
      />
    </svg>
  );
}
export function AssetLabel({
  name,
  count,
  modified,
  timestamp,
  copied = false,
  hovered = false,
}: {
  name: string;
  count: string;
  modified: string;
  timestamp: string;
  copied?: boolean;
  hovered?: boolean;
}) {
  return (
    <div class="flex items-center gap-[6px] text-meta leading-[1.2]">
      <button
        type="button"
        aria-label={copied ? `Copied ${name}` : `Copy ${name} name`}
        class="group flex items-center gap-1 text-left font-[550] text-text-secondary"
      >
        <span>{name}</span>
        <Icon
          name={copied ? 'check' : 'copy'}
          size={12}
          class={`text-text-tertiary ${copied || hovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}
        />
      </button>
      <span class="text-text-tertiary">{count}</span>
      <time class="ml-1 text-text-tertiary" title={timestamp}>
        {modified}
      </time>
    </div>
  );
}

export default () => [
  <Frame name="drawing">
    <svg data-free width={280} height={150}>
      <Drawing nodes={drawingSpecimen} />
    </svg>
  </Frame>,
  <Frame name="minimap">
    <Minimap {...minimapSpecimen} />
  </Frame>,
  ...['modified', 'hover', 'copied'].map((name) => (
    <Frame name={`asset-label-${name}`} note={assetLabelNote}>
      <div class="flex flex-col gap-3 bg-canvas p-6">
        <AssetLabel {...assetLabelSpecimen} copied={name === 'copied'} hovered={name === 'hover'} />
        <div class="h-20 w-[360px] rounded-artboard border border-border bg-surface-section" />
      </div>
    </Frame>
  )),
];
