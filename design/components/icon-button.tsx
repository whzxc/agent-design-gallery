import { Frame, Icon } from 'sdg';
const forms = ['default', 'active'];
export function IconButton({ form = 'default', icon = 'panel-right' }: { form?: string; icon?: string }) {
  return <div class={`grid place-items-center rounded-row shrink-0 w-8 h-8 ${form === 'active' ? 'bg-surface-sunken text-text' : 'text-text-secondary'}`}><Icon name={icon} /></div>;
}
export default () => forms.map(form => <Frame name={form}><IconButton form={form} /></Frame>);
