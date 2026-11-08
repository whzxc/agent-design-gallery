import { Frame, Icon } from 'sdg';
import { iconButtonForms } from '../fixtures/buttons';

export function IconButton({ form = 'default', icon = 'panel-right' }: { form?: string; icon?: string }) {
  const color = form === 'active' ? 'bg-surface-sunken text-text' : 'text-text-secondary';

  return <div class={`grid place-items-center rounded-row shrink-0
    w-[var(--control-size)] h-[var(--control-size)] ${color}`}>
    <Icon name={icon} />
  </div>;
}

export default () => iconButtonForms.map(form => <Frame name={form}><IconButton form={form} /></Frame>);
