import { Frame, Icon } from 'sdg';
const forms = [
  { form: 'primary', label: 'Open' },
  { form: 'secondary', label: 'Copy path', icon: 'copy' },
  { form: 'zoom', label: '48%' },
  { form: 'zoom-open', label: '48%' },
];
export function Button({ form = 'primary', label = 'Open', icon }: { form?: string; label?: string; icon?: string }) {
  const zoom = form.startsWith('zoom');
  return <div class={`inline-flex items-center shrink-0 h-8 whitespace-nowrap text-body leading-[16px] font-[550] ${zoom ? 'rounded-row gap-1 px-[10px]' : 'rounded-field gap-[10px] ' + (icon ? 'px-3' : 'px-[14px]')} ${form === 'primary' ? 'bg-accent text-on-accent' : form === 'secondary' || form === 'zoom-open' ? 'bg-surface-sunken text-text' : 'text-text'}`}>
    {icon && !zoom && <Icon name={icon} size={14} class="text-text-secondary" />}<span>{label}</span>{zoom && <Icon name="chevron-down" size={12} class="text-text-tertiary" />}
  </div>;
}
export default () => forms.map(props => <Frame name={props.form}><Button {...props} /></Frame>);
