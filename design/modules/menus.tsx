import { Frame } from 'adg';
import { Button } from '../components/button';
import { IconButton } from '../components/icon-button';
import { MenuItem } from '../components/menu-item';
import { Panel } from '../components/panel';
import { Toolbar } from '../components/toolbar';
import menuFixtures from '../fixtures/menus.json';

export function Menu({ rows, width = 220 }: any) {
  return (
    <Panel form="menu" width={width}>
      <div class="p-[6px]">
        {rows.map((row: any, i: number) => (
          <>
            {i > 0 && (row.form === 'label' || row.divider) && <div class="mx-[2px] my-1 h-px bg-border" />}
            <MenuItem {...row} />
          </>
        ))}
      </div>
    </Panel>
  );
}

function MoreTrigger() {
  return (
    <Toolbar>
      <IconButton icon="messages-square" label="Comments" />
      <IconButton icon="ellipsis" form="active" label="More" expanded />
      <IconButton icon="panel-right" label="Inspector" disabled />
    </Toolbar>
  );
}

export default () => [
  <Frame name="more">
    <div class="flex flex-col items-end gap-2 bg-canvas p-4">
      <MoreTrigger />
      <Menu {...menuFixtures.more} />
    </div>
  </Frame>,
  <Frame name="more-tokens">
    <div class="flex flex-col items-end gap-2 bg-canvas p-4">
      <MoreTrigger />
      <Menu {...menuFixtures.moreTokens} />
    </div>
  </Frame>,
  <Frame name="zoom">
    <div class="flex flex-col items-center gap-2 bg-canvas p-4">
      <Menu {...menuFixtures.zoom} />
      <Toolbar>
        <IconButton icon="minus" label="Zoom out" />
        <Button form="zoom-open" label="48%" />
        <IconButton icon="plus" label="Zoom in" />
      </Toolbar>
    </div>
  </Frame>,
  <Frame name="context-element">
    <div class="flex flex-col items-start gap-2 bg-canvas p-4">
      <div class="rounded-field outline-2 outline-offset-2 outline-accent">
        <Button label="Unlock" />
      </div>
      <Menu {...menuFixtures.contextElement} />
    </div>
  </Frame>,
  <Frame name="context-frame">
    <div class="flex flex-col items-start gap-2 bg-canvas p-4">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-center rounded-card bg-surface px-6 py-4 outline-2 -outline-offset-2 outline-accent">
          <Button form="secondary" label="Cancel" />
        </div>
        <span class="font-mono text-meta text-text">secondary</span>
      </div>
      <Menu {...menuFixtures.contextFrame} />
    </div>
  </Frame>,
];
