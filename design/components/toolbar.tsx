import { Frame } from 'adg';
import { IconButton } from './icon-button';
import { toolbarSpecimens, toolbarSpecimenIcons } from '../fixtures/containers';

export function Separator() {
  return <div class="w-px h-5 bg-border shrink-0" />;
}

export function Toolbar({ children, wide = false }: { children?: unknown; wide?: boolean }) {
  return (
    <div
      class={`inline-flex items-center p-[6px] h-11 bg-surface rounded-panel shadow-float ${wide ? 'gap-2' : 'gap-1'}`}
    >
      {children}
    </div>
  );
}

export default () => [
  ...toolbarSpecimens.map(({ name, wide }) => (
    <Frame name={name}>
      <div class="bg-canvas p-6">
        <Toolbar wide={wide}>
          {toolbarSpecimenIcons.map((icon) => (
            <IconButton icon={icon} />
          ))}
        </Toolbar>
      </div>
    </Frame>
  )),
  <Frame name="separator">
    <div class="bg-canvas p-6">
      <Separator />
    </div>
  </Frame>,
];
