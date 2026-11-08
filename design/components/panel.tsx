import { Frame } from 'sdg';
import { panelSpecimens } from '../fixtures/containers';

export function Panel({
  form = 'sidebar',
  width = 260,
  height,
  children,
}: {
  form?: string;
  width?: number;
  height?: number;
  children?: unknown;
}) {
  const shape =
    form === 'menu'
      ? 'rounded-menu shadow-menu'
      : form === 'dialog'
        ? 'rounded-dialog shadow-menu'
        : 'rounded-panel shadow-float';
  return (
    <section class={`flex flex-col bg-surface ${shape}`} style={{ width, height }}>
      {children}
    </section>
  );
}

export default () =>
  panelSpecimens.map(({ name, ...props }) => (
    <Frame name={name}>
      <div class="bg-canvas p-6">
        <Panel {...props} />
      </div>
    </Frame>
  ));
