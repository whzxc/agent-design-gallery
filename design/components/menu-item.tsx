import { Frame, Icon } from 'adg';
import { menuItemForms } from '../fixtures/rows';

export type MenuItemForm = 'item' | 'item-active' | 'check' | 'option' | 'disabled' | 'danger' | 'label';

export function MenuItem({
  form = 'item',
  label,
  meta,
  disabled = false,
  danger = false,
}: {
  form?: MenuItemForm | string;
  label: string;
  meta?: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  const isLabel = form === 'label';
  const isDisabled = disabled || form === 'disabled';
  const isDanger = danger || form === 'danger';
  const background = form === 'item-active' ? 'bg-surface-sunken' : '';
  const content = isLabel
    ? 'h-(--menu-label-height) text-caption font-[550] text-text-tertiary'
    : `h-(--menu-item-height) text-body ${isDanger ? 'text-danger' : 'text-text'}`;
  const state = isDisabled ? 'opacity-[0.45]' : '';

  return (
    <div
      aria-disabled={isDisabled || undefined}
      class={`flex shrink-0 items-center rounded-row px-[10px] leading-4 ${background} ${content} ${state}`}
    >
      {(form === 'check' || form === 'option') && (
        <span class="w-[22px] shrink-0">{form === 'check' && <Icon name="check" size={14} />}</span>
      )}
      <span class="min-w-0 truncate">{label}</span>
      {meta && <span class="ml-auto shrink-0 font-mono text-meta text-text-tertiary">{meta}</span>}
    </div>
  );
}

export default () =>
  menuItemForms.map(props => (
    <Frame name={props.form} width={180}>
      <div class="w-full">
        <MenuItem {...props} />
      </div>
    </Frame>
  ));
