import { Frame, Icon } from 'adg';
import { buttonForms } from '../fixtures/buttons';

export function Button({ form = 'primary', label = 'Open', icon }: {
  form?: string;
  label?: string;
  icon?: string;
}) {
  const zoom = form.startsWith('zoom');
  const shape = zoom
    ? 'rounded-row gap-1 px-[10px]'
    : `rounded-field gap-[10px] ${icon ? 'px-3' : 'px-[14px]'}`;
  const color = form === 'primary'
    ? 'bg-accent text-on-accent'
    : form === 'secondary' || form === 'zoom-open' ? 'bg-surface-sunken text-text' : 'text-text';

  return <div class={`inline-flex items-center shrink-0 h-[var(--control-size)] whitespace-nowrap
    text-body leading-[16px] font-[550] ${shape} ${color}`}>
    {icon && !zoom && <Icon name={icon} size={14} class="text-text-secondary" />}
    <span>{label}</span>
    {zoom && <Icon name="chevron-down" size={12} class="text-text-tertiary" />}
  </div>;
}

export default () => buttonForms.map(props => <Frame name={props.form}><Button {...props} /></Frame>);
