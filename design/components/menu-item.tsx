import { Frame, Icon } from 'adg';
import { menuItemForms } from '../fixtures/rows';

export function MenuItem({ form = 'item', label, meta }: { form?: string; label: string; meta?: string }) {
  const background = form === 'item-active' ? 'bg-surface-sunken' : '';
  const content = form === 'label'
    ? 'h-[var(--menu-label-height)] text-caption text-text-tertiary font-[550]'
    : 'h-[var(--menu-item-height)] text-body text-text';

  return <div class={`flex items-center px-[10px] shrink-0 rounded-row leading-[16px] ${background} ${content}`}>
    {(form === 'check' || form === 'option') && <span class="w-[22px] shrink-0">
      {form === 'check' && <Icon name="check" size={14} />}
    </span>}
    <span>{label}</span>
    {meta && <span class="ml-auto text-meta text-text-tertiary">{meta}</span>}
  </div>;
}
import { Panel } from './panel';
export function Menu({ rows, width = 220 }: any) {
  return <Panel form="menu" width={width}><div class="p-[6px]">{rows.map((row: any, i: number) => <>{i > 0 && (row.form === 'label' || row.divider) && <div class="h-px bg-border my-1 mx-[2px]" />}<MenuItem {...row} /></>)}</div></Panel>;
}

export default () => menuItemForms.map(props => <Frame name={props.form} width={180}>
  <div class="w-full"><MenuItem {...props} /></div>
</Frame>);
