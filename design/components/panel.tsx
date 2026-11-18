import { Frame } from 'adg';
import { panelSpecimens } from '../fixtures/containers';

export type PanelForm = 'floating' | 'menu' | 'dialog' | 'popover';

export function Panel({
  form = 'floating',
  width = 260,
  height,
  bordered = false,
  children,
}: {
  form?: PanelForm | string;
  width?: number;
  height?: number;
  bordered?: boolean;
  children?: unknown;
}) {
  const shape =
    form === 'menu'
      ? 'rounded-menu shadow-menu'
      : form === 'dialog'
        ? 'rounded-dialog shadow-menu'
        : form === 'popover'
          ? 'rounded-panel shadow-menu'
          : 'rounded-panel shadow-float';
  const border = bordered ? 'border border-border' : '';

  return (
    <section class={`flex flex-col bg-surface ${shape} ${border}`} style={{ width, height }}>
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
