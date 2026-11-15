import { Frame, Icon } from 'adg';
import { Drawing } from '../components/canvas';
import { minimapSpecimen, assetLabelSpecimen, assetLabelNote, drawingSpecimen } from '../fixtures/canvas';

export { Drawing } from '../components/canvas';
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
  const visibility =
    copied || hovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100';
  return (
    <div class="flex items-center gap-[6px] text-meta leading-[1.2]">
      <button
        type="button"
        aria-label={copied ? `Copied ${name}` : `Copy ${name} name`}
        class="group flex items-center gap-1 text-left font-[550] text-text-secondary"
      >
        <span>{name}</span>
        <Icon name={copied ? 'check' : 'copy'} size={12} class={`text-text-tertiary ${visibility}`} />
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
