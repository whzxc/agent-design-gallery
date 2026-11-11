import { Frame, Icon } from 'adg';
import { treeRowForms } from '../fixtures/rows';

export function TreeRow({ form = 'item', label = 'button', meta, icon, indent = 0, width = 236, height, multiline = false }: {
  form?: string;
  label?: string;
  meta?: string;
  icon?: string;
  indent?: number;
  width?: number;
  height?: number;
  multiline?: boolean;
}) {
  const two = form.startsWith('two-line');
  const group = form.startsWith('group');
  const selected = form.endsWith('selected');
  const rowHeight = height ?? (two ? 'var(--row-height-two-line)' : 'var(--row-height)');
  const size = multiline ? 'min-h-[var(--row-height)] py-[6px]' : '';
  const padding = indent === 20 ? 'pl-7' : indent === -2 ? 'pl-[6px]' : 'pl-2';
  const background = selected ? 'bg-surface-sunken' : '';
  const color = form === 'item' ? 'text-text-secondary' : 'text-text';
  const rowIcon = icon ?? (group ? 'chevron-down' : two ? 'folder-open' : form.startsWith('root') ? 'layout-grid' : 'component');
  const spacing = two ? 'ml-3 flex flex-col gap-[3px]' : group ? 'ml-[6px]' : 'ml-2';
  const content = multiline ? 'min-w-0 flex-1 mr-[6px]' : '';
  const wrapping = multiline ? 'break-words whitespace-normal' : '';
  const weight = two || group || form.startsWith('root') ? 'font-[550]' : '';

  return <div
    class={`flex items-center shrink-0 pr-2 rounded-row leading-[1.2] ${size} ${padding} ${background} ${color}`}
    style={{ width, ...(multiline ? {} : { height: rowHeight }) }}
  >
    <Icon name={rowIcon} size={two ? 16 : 14} class={selected ? 'text-text' : 'text-text-tertiary'} />
    <div class={`${spacing} ${content}`}>
      <span class={`text-body ${wrapping} ${weight}`}>{label}</span>
      {two && <span class="text-caption font-mono text-text-tertiary">{meta}</span>}
    </div>
    {!two && meta && <span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}

export default () => treeRowForms.map(props => <Frame name={props.form}><TreeRow {...props} /></Frame>);
