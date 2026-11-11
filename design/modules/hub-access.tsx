import { Frame, Icon } from 'adg';
import { Panel } from '../components/panel';
import { HubBar } from './hub-home';
import { accessStates, hubNotes } from '../fixtures/hub';

export function AccessState({ code, title, detail }: { code: string; title: string; detail: string }) {
  return <Panel width={360}>
    <div class="flex flex-col gap-5 p-6">
      <div class="flex items-center justify-between text-text-tertiary">
        <Icon name="key-round" size={20} /><span class="font-mono text-meta">{code}</span>
      </div>
      <div class="flex flex-col gap-2">
        <h1 class="text-title font-[650]">{title}</h1>
        <p class="text-body text-text-secondary">{detail}</p>
      </div>
    </div>
  </Panel>;
}

export function AccessShell({ state, width, height }: any) {
  return <div class="flex flex-col bg-canvas p-3" style={{ width, height }}>
    <div class="self-start"><HubBar /></div>
    <div class="flex flex-1 items-center justify-center"><AccessState {...state} /></div>
  </div>;
}

export default () => accessStates.slice(1).map(({ name, ...state }) => <Frame name={name} note={hubNotes.access}>
  <div class="bg-canvas p-6"><AccessState {...state} /></div>
</Frame>);
