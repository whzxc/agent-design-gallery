import { Frame, Icon } from 'adg';
import { fieldForms } from '../fixtures/fields';

export type FieldForm = 'search' | 'search-active' | 'picker' | 'input' | 'input-error' | 'input-empty';

export function Field({
  form = 'search',
  label = 'Find assets…',
  icon = 'folder',
  meta = '⌘F',
  width = 236,
  height,
  chevron = true,
  placeholder, clearAnchor, searchInput,
}: {
  form?: FieldForm | string;
  label?: string;
  icon?: string;
  meta?: string;
  width?: number;
  height?: number;
  chevron?: boolean;
  placeholder?: boolean; clearAnchor?: string; searchInput?: boolean;
}) {
  const search = form.startsWith('search');
  const input = form.startsWith('input');
  const active = form === 'search-active';
  const isPlaceholder = placeholder ?? (form === 'input-empty' || form === 'search');
  const background = active ? 'bg-surface outline outline-accent -outline-offset-1' : 'bg-surface-sunken';
  const border = input ? `border ${form === 'input-error' ? 'border-danger' : 'border-border'}` : '';
  const content = input ? 'px-[10px] font-mono text-meta' : 'px-[10px] text-body';
  const color = isPlaceholder ? 'text-text-tertiary' : 'text-text';
  const spacing = input ? '' : search ? 'ml-2' : 'ml-[10px] font-[550]';

  return (
    <div
      class={`flex shrink-0 items-center rounded-field leading-[1.2] ${background} ${border} ${content} ${color}`}
      style={{ width, height: height ?? 'var(--field-height)' }}
    >
      {!input && (
        <Icon
          name={search ? 'search' : icon}
          size={14}
          class={search ? 'text-text-tertiary' : 'text-text-secondary'}
        />
      )}
      {searchInput ? <input type="search" aria-label="Find project or instance" data-adg-id="search"
        class="ml-2 min-w-0 flex-1 bg-transparent text-text" value={active ? label : ''} placeholder={active ? undefined : label} /> :
        <span class={`min-w-0 flex-1 truncate ${spacing}`}>{label}</span>}
      {active && clearAnchor ? (
        <button data-adg-id={clearAnchor} aria-label="Clear project search"><Icon name="x" size={14} class="text-text-tertiary" /></button>
      ) : active ? (
        <Icon name="x" size={14} class="text-text-tertiary" />
      ) : search ? (
        meta ? <span class="text-caption text-text-tertiary">{meta}</span> : null
      ) : !input && chevron ? (
        <Icon name="chevron-down" size={12} class="text-text-tertiary" />
      ) : null}
    </div>
  );
}

export default () =>
  fieldForms.map(props => (
    <Frame name={props.form}>
      <Field {...props} />
    </Frame>
  ));
