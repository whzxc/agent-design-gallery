import { Frame, Icon } from 'sdg';
import { iconButtonForms, disabledIconButton } from '../fixtures/buttons';

export function IconButton({
  form = 'default',
  icon = 'panel-right',
  disabled = false,
}: {
  form?: string;
  icon?: string;
  disabled?: boolean;
}) {
  const color = form === 'active' ? 'bg-surface-sunken text-text' : 'text-text-secondary';

  return (
    <div
      aria-disabled={disabled || undefined}
      class={`grid place-items-center rounded-row shrink-0
    w-[var(--control-size)] h-[var(--control-size)] ${color} ${disabled ? 'opacity-[0.45]' : ''}`}
    >
      <Icon name={icon} />
    </div>
  );
}

export default () => [
  ...iconButtonForms.map((form) => (
    <Frame name={form}>
      <IconButton form={form} />
    </Frame>
  )),
  <Frame name="disabled">
    <IconButton {...disabledIconButton} />
  </Frame>,
];
