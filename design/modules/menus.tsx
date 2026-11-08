import { Frame } from 'sdg';
import { Panel } from '../components/panel';
import { MenuItem } from '../components/menu-item';
const menuRows = [
  { form: 'label', label: 'Theme' },
  { form: 'check', label: 'System' },
  { form: 'option', label: 'Light' },
];
export function Menu({ rows, width = 220 }: any) {
  return (
    <Panel form="menu" width={width}>
      <div class="p-[6px]">
        {rows.map((row: any, i: number) => (
          <>
            {i > 0 && (row.form === 'label' || row.divider) && <div class="h-px bg-border my-1 mx-[2px]" />}
            <MenuItem {...row} />
          </>
        ))}
      </div>
    </Panel>
  );
}
export default () => (
  <Frame name="default">
    <Menu rows={menuRows} />
  </Frame>
);
