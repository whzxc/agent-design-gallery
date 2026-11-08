import { Frame } from 'sdg';
import { Toolbar, Separator } from '../components/toolbar';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { Button } from '../components/button';
const tools = ['sun-moon', 'panel-right', 'maximize', 'ellipsis'];
export function Tools({ active }: { active?: string }) {
  return (
    <Toolbar>
      {tools.map((icon) => (
        <IconButton icon={icon} form={active === icon ? 'active' : 'default'} />
      ))}
    </Toolbar>
  );
}
export function AppBar({ empty = false, specimen = false }: { empty?: boolean; specimen?: boolean }) {
  return (
    <Toolbar wide>
      <IconButton icon="panel-left" />
      <span class="text-section font-[650]">SDG</span>
      {!empty && (
        <>
          <Separator />
          <Field form="picker" label={specimen ? 'arc' : 'agent-remote-control'} width={specimen ? 180 : 220} />
        </>
      )}
    </Toolbar>
  );
}
export function ZoomBar({ label = '48%', active = false }: { label?: string; active?: boolean }) {
  return (
    <Toolbar>
      <IconButton icon="arrow-left" />
      <div class="ml-1">
        <Separator />
      </div>
      <IconButton icon="minus" />
      <Button form={active ? 'zoom-open' : 'zoom'} label={label} />
      <IconButton icon="plus" />
      <Separator />
      <IconButton icon="maximize" />
      <IconButton icon="map" />
    </Toolbar>
  );
}
export default () => [
  <Frame name="tools">
    <Tools />
  </Frame>,
  <Frame name="app-bar">
    <AppBar specimen />
  </Frame>,
];
