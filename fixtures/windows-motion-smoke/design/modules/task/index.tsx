import { Frame } from 'adg';

export default () => ['pending', 'complete'].map(state => (
  <Frame name={state} width={240} height={80}>
    <div class="flex items-center gap-4 p-4">
      <button data-adg-id="complete-task">Complete task</button>
      {state === 'complete' && <span data-adg-id="status">Complete</span>}
    </div>
  </Frame>
));
