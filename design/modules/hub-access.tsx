import { Frame, Icon } from 'adg';
import { Button } from '../components/button';
import { Field } from '../components/field';
import { Panel } from '../components/panel';
import { accessStates, hubNotes } from '../fixtures/hub';

export function AccessState({
  code,
  title,
  detail,
  rejected = false,
}: {
  code: string;
  title: string;
  detail: string;
  rejected?: boolean;
}) {
  return (
    <Panel width={360}>
      <div class="flex flex-col gap-5 p-6">
        <div class="flex items-center justify-between text-text-tertiary">
          <Icon name="key-round" size={20} />
          <span class="font-mono text-meta leading-[1.5]">{code}</span>
        </div>
        <div class="flex flex-col gap-2">
          <h1 class="text-title leading-[1.5] font-[650]">{title}</h1>
          <p class="text-body leading-[1.5] text-text-secondary">{detail}</p>
        </div>
        <div class="flex flex-col gap-[10px]">
          <div class="flex items-center justify-between gap-2">
            <Field
              form={rejected ? 'input-error' : 'input'}
              label={rejected ? '••••••••••••' : 'adg_… or ?key= URL'}
              placeholder={!rejected}
              width={232}
            />
            <Button form="primary" label="Unlock" />
          </div>
          {rejected && <p class="text-meta leading-[1.5] text-danger">Access key rejected.</p>}
          <code
            class="self-start rounded-keycap bg-surface-sunken px-2 py-[3px] font-mono text-caption
              leading-[1.4] text-text-secondary"
          >
            adg serve --print-key
          </code>
        </div>
      </div>
    </Panel>
  );
}

export default () =>
  accessStates.map(({ name, ...state }) => (
    <Frame name={name} note={hubNotes.access}>
      <div class="bg-canvas p-6">
        <AccessState {...state} />
      </div>
    </Frame>
  ));
