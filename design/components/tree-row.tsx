import { Frame, Icon } from 'adg';
import { treeRowForms } from '../fixtures/rows';

export type TreeRowForm =
  | 'root'
  | 'root-selected'
  | 'group'
  | 'group-collapsed'
  | 'group-active'
  | 'item'
  | 'item-selected';

export function TreeRow({
  form = 'item',
  label = 'button',
  meta,
  icon,
  indent = 0,
  width = 236,
  height,
  multiline = false,
}: {
  form?: TreeRowForm | string;
  label?: string;
  meta?: string;
  icon?: string;
  indent?: number;
  width?: number;
  height?: number;
  multiline?: boolean;
}) {
  const group = form.startsWith('group');
  const selected = form.endsWith('selected');
  const active = selected || form === 'group-active';
  const rowHeight = height ?? 'var(--row-height)';
  const size = multiline ? 'min-h-(--row-height) py-[6px]' : '';
  const padding = indent === 20 ? 'pl-7' : indent === -2 ? 'pl-[6px]' : 'pl-2';
  const background = active ? 'bg-surface-sunken' : '';
  const color = form === 'item' ? 'text-text-secondary' : 'text-text';
  const rowIcon =
    icon ??
    (form === 'group-collapsed'
      ? 'chevron-right'
      : group
        ? 'chevron-down'
        : form.startsWith('root')
          ? 'layout-grid'
          : 'component');
  const spacing = group ? 'ml-[6px]' : 'ml-2';
  const content = multiline ? 'mr-[6px] min-w-0 flex-1' : 'min-w-0 truncate';
  const wrapping = multiline ? 'break-words whitespace-normal' : '';
  const weight = group || form.startsWith('root') ? 'font-[550]' : '';

  return (
    <div
      class={`flex shrink-0 items-center rounded-row pr-2 leading-[1.2] ${size} ${padding} ${background} ${color}`}
      style={{ width, ...(multiline ? {} : { height: rowHeight }) }}
    >
      <Icon
        name={rowIcon}
        size={group ? 12 : 14}
        class={selected ? 'text-text' : 'text-text-tertiary'}
      />
      <div class={`${spacing} ${content}`}>
        <span class={`text-body ${wrapping} ${weight}`}>{label}</span>
      </div>
      {meta && <span class="ml-auto shrink-0 text-meta text-text-tertiary">{meta}</span>}
    </div>
  );
}

export default () =>
  treeRowForms.map(props => (
    <Frame name={props.form}>
      <TreeRow {...props} />
    </Frame>
  ));
