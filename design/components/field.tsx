import { Frame, Icon } from 'adg';
import { fieldForms } from '../fixtures/fields';

export function Field({ form = 'search', label = 'Find assets…', icon = 'folder', meta = '⌘F', width = 236, height }: {
  form?: string;
  label?: string;
  icon?: string;
  meta?: string;
  width?: number;
  height?: number;
}) {
  const search = form.startsWith('search');
  const input = form.startsWith('input');
  const active = form === 'search-active';
  const background = active ? 'bg-surface outline outline-accent -outline-offset-1' : 'bg-surface-sunken';
  const error = form === 'input-error' ? 'outline outline-danger -outline-offset-1' : '';
  const content = input ? 'px-3 font-mono text-meta' : 'px-[10px] text-body';
  const color = form === 'input-empty' || form === 'search' ? 'text-text-tertiary' : 'text-text';
  const spacing = input ? '' : search ? 'ml-2' : 'ml-[10px] font-[550]';

  return <div
    class={`flex items-center shrink-0 rounded-field leading-[1.2] ${background} ${error} ${content} ${color}`}
    style={{ width, height: height ?? 'var(--field-height)' }}
  >
    {!input && <Icon name={search ? 'search' : icon} size={14}
      class={search ? 'text-text-tertiary' : 'text-text-secondary'} />}
    <span class={`min-w-0 flex-1 ${spacing}`}>{label}</span>
    {active ? <Icon name="x" size={14} class="text-text-tertiary" />
      : search ? <span class="text-meta text-text-tertiary">{meta}</span>
        : !input ? <Icon name="chevron-down" size={12} class="text-text-tertiary" /> : null}
  </div>;
}

export default () => fieldForms.map(props => <Frame name={props.form}><Field {...props} /></Frame>);
