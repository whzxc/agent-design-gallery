import { Frame, Icon } from 'sdg';
const forms = [
  { form: 'item', label: 'Fit all', meta: '0' },
  { form: 'item-active', label: 'Fit group' },
  { form: 'check', label: 'System' },
  { form: 'option', label: 'Light' },
  { form: 'label', label: 'Theme' },
];
export function MenuItem({ form = 'item', label, meta }: { form?: string; label: string; meta?: string }) {
  return <div class={`flex items-center px-[10px] shrink-0 rounded-row leading-[16px] ${form === 'item-active' ? 'bg-surface-sunken' : ''} ${form === 'label' ? 'h-6 text-caption text-text-tertiary font-[550]' : 'h-[30px] text-body text-text'}`}>
    {(form === 'check' || form === 'option') && <span class="w-[22px] shrink-0">{form === 'check' && <Icon name="check" size={14} />}</span>}
    <span>{label}</span>{meta && <span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}
export default () => forms.map(props => <Frame name={props.form} width={180}><div class="w-full"><MenuItem {...props} /></div></Frame>);
