import { Frame, Icon } from 'sdg';
import { Panel } from '../components/panel';
import { Button } from '../components/button';
import { Field } from '../components/field';
import { IconButton } from '../components/icon-button';
import { TreeRow } from '../components/tree-row';
import directoryFixtures from '../fixtures/open-directory.json';
export function OpenDialog({
  error = false,
  close = true,
  specimen = false,
  recent = [],
  path = '/path/to/design',
}: any) {
  return (
    <Panel form="dialog" width={specimen ? 360 : 440}>
      <div class={specimen ? 'px-5 pt-5 pb-4' : 'px-6 pt-6 pb-[22px]'}>
        <div class="flex items-center justify-between h-5">
          <h2 class="text-title leading-5 font-[650]">Open a design directory</h2>
          {close && (
            <div class="-mr-2">
              <IconButton icon="x" />
            </div>
          )}
        </div>
        <p class="text-body text-text-secondary leading-4 mt-2">Choose a folder that contains SVG designs.</p>
        <div class={specimen ? 'mt-[14px]' : 'mt-4'}>
          <Field form={error ? 'input-error' : 'input-empty'} label={path} width={specimen ? 320 : 392} />
        </div>
        {error && (
          <div class="flex items-center gap-[6px] text-meta text-danger leading-[14px] mt-[10px]">
            <Icon name="circle-alert" size={14} />
            No SVG files in this directory.
          </div>
        )}
        {specimen ? (
          <footer class="flex items-start justify-between mt-[14px]">
            <h3 class="text-meta text-text-tertiary font-[550] leading-4">Recent</h3>
            <div class="mt-1">
              <Button label="Open" />
            </div>
          </footer>
        ) : (
          <>
            <h3 class="text-meta text-text-tertiary font-[550] leading-4 mt-4 mb-[6px]">Recent</h3>
            <div class="flex flex-col gap-[2px] -mx-2">
              {recent.map(({ label, path }: any, i: number) => (
                <TreeRow
                  form={i === 0 && !error ? 'two-line-selected' : 'two-line'}
                  label={label}
                  meta={path}
                  icon="folder"
                  width={408}
                />
              ))}
            </div>
            <footer class="flex justify-end mt-4">
              <Button label="Open" />
            </footer>
          </>
        )}
      </div>
    </Panel>
  );
}
export default () => (
  <Frame name="error">
    <OpenDialog {...directoryFixtures.states['error-specimen']} recent={directoryFixtures.recent} />
  </Frame>
);
