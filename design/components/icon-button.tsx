import { Frame, Icon } from 'adg';
import { iconButtonForms, disabledIconButton } from '../fixtures/buttons';

export type IconButtonForm = 'default' | 'active' | 'pressed' | 'accent';

export function IconButton({
  form = 'default',
  icon = 'panel-right',
  iconSize,
  label,
  expanded,
  pressed,
  disabled = false,
}: {
  form?: IconButtonForm | string;
  icon?: string;
  iconSize?: number;
  label?: string;
  expanded?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  const color =
    form === 'accent'
      ? 'bg-accent text-on-accent'
      : form === 'active'
        ? 'bg-surface-sunken text-text'
        : form === 'pressed'
          ? 'bg-surface-sunken text-text-secondary'
          : 'text-text-secondary';

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={pressed}
      class={`grid size-(--control-size) shrink-0 place-items-center rounded-row
        ${color} ${disabled ? 'opacity-[0.45]' : ''}`}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}

export default () => [
  ...iconButtonForms.map(form => (
    <Frame name={form}>
      <IconButton form={form} />
    </Frame>
  )),
  <Frame name="disabled">
    <IconButton {...disabledIconButton} />
  </Frame>,
];
