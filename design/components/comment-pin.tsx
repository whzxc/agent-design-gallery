import { Frame } from 'adg';
import examples from '../fixtures/comments.json';

type State = 'open' | 'changed' | 'resolved';

export function CommentPin({ number, state = 'open', expanded = false }: {
  number?: number; state?: State; expanded?: boolean;
}) {
  const resolved = state === 'resolved';
  const shadow = resolved
    ? 'shadow-[0_0_0_1px_var(--text-tertiary),var(--shadow-comment-pin)]'
    : 'shadow-[0_0_0_1px_var(--on-accent),var(--shadow-comment-pin)]';
  return <button type="button" aria-label={number === undefined ? 'New comment' : `Comment #${number}`} aria-expanded={expanded}
    class={`grid h-[26px] place-items-center rounded-t-field rounded-br-field border px-[5px] text-meta leading-none font-[650] tabular-nums
      ${resolved ? 'border-text-tertiary bg-surface-sunken text-text-secondary' : 'bg-accent text-on-accent'}
      ${state === 'changed' ? 'border-dashed border-on-accent' : resolved ? '' : 'border-accent'}
      ${expanded ? 'outline-2 outline-offset-1 outline-surface' : ''} ${shadow}`}
    style={{ width: Math.max(34, 15 + String(number ?? '').length * 7) }}>
    {number === undefined ? '+' : `#${number}`}
  </button>;
}

export default () => examples.pinStates.map(state => <Frame name={state}>
  <div class="bg-canvas p-3"><CommentPin number={1} state={state as State} /></div>
</Frame>);
