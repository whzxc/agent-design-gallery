import { Frame, Icon } from 'adg';
import { buttonForms } from '../fixtures/buttons';

export type ButtonForm = 'primary' | 'secondary' | 'ghost' | 'zoom' | 'zoom-open';

export function Button({
  form = 'primary',
  label = 'Unlock',
  icon,
  trailingIcon,
  disabled = false,
}: {
  form?: ButtonForm | string;
  label?: string;
  icon?: string;
  trailingIcon?: string;
  disabled?: boolean;
}) {
  const zoom = form.startsWith('zoom');
  const isPrimary = form === 'primary' || form === 'disabled';
  const isDisabled = disabled || form === 'disabled';
  const trailing = trailingIcon ?? (zoom ? 'chevron-down' : undefined);
  const shape = zoom
    ? 'rounded-row gap-1 px-[10px]'
    : form === 'ghost'
      ? 'rounded-row gap-2 px-3'
      : `rounded-field gap-[10px] ${icon ? 'px-3' : 'px-[14px]'}`;
  const color = isPrimary
    ? 'bg-accent text-on-accent'
    : form === 'secondary' || form === 'zoom-open'
      ? 'bg-surface-sunken text-text'
      : form === 'ghost'
        ? 'text-text-secondary'
        : 'text-text';

  return (
    <button
      type="button"
      disabled={isDisabled}
      class={`inline-flex h-(--control-size) shrink-0 items-center text-body leading-4 font-[550] whitespace-nowrap
        ${shape} ${color} ${isDisabled ? 'opacity-[0.45]' : ''}`}
    >
      {icon && !zoom && <Icon name={icon} size={14} class={isPrimary ? '' : 'text-text-secondary'} />}
      <span>{label}</span>
      {trailing && <Icon name={trailing} size={12} class="text-text-tertiary" />}
    </button>
  );
}

export default () =>
  buttonForms.map(({ name, ...props }) => (
    <Frame name={name ?? props.form}>
      <Button {...props} />
    </Frame>
  ));
