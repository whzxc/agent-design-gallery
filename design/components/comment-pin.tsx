import { Frame } from 'adg';
import examples from '../fixtures/comments.json';

export type CommentPinState = 'open' | 'changed' | 'resolved';

export function CommentPin({
  number,
  state = 'open',
  changed = false,
  resolved = false,
  expanded = false,
  target,
}: {
  number?: number;
  state?: CommentPinState;
  changed?: boolean;
  resolved?: boolean;
  expanded?: boolean;
  target?: string;
}) {
  const isResolved = resolved || state === 'resolved';
  const isChanged = changed || state === 'changed';
  const shadow = isResolved
    ? 'shadow-[0_0_0_1px_var(--text-tertiary),var(--shadow-comment-pin)]'
    : 'shadow-[0_0_0_1px_var(--on-accent),var(--shadow-comment-pin)]';
  const surface = isResolved ? 'bg-surface-sunken text-text-secondary' : 'bg-accent text-on-accent';
  const border = `${isChanged ? 'border-dashed' : ''} ${
    isResolved ? 'border-text-tertiary' : isChanged ? 'border-on-accent' : 'border-accent'
  }`;
  const ring = expanded ? 'outline-2 outline-offset-1 outline-surface' : '';
  const classes = `grid h-[26px] place-items-center rounded-t-field rounded-br-field border px-[5px] text-meta
    leading-none font-[650] tabular-nums ${surface} ${border} ${ring} ${shadow}`;
  const width = Math.max(34, 15 + String(number ?? '').length * 7);

  if (number === undefined) {
    return (
      <span aria-hidden="true" class={classes} style={{ width: 34 }}>
        +
      </span>
    );
  }

  const label = `Comment #${number}${target ? `, ${target}` : ''}${isChanged ? ', changed' : ''}`;
  return (
    <button type="button" aria-label={label} aria-expanded={expanded} class={classes} style={{ width }}>
      #{number}
    </button>
  );
}

export default () => [
  ...examples.pinStates.map(state => (
    <Frame name={state}>
      <div class="bg-canvas p-3">
        <CommentPin number={1} state={state as CommentPinState} />
      </div>
    </Frame>
  )),
  <Frame name="expanded">
    <div class="bg-canvas p-3">
      <CommentPin number={1} expanded />
    </div>
  </Frame>,
  <Frame name="draft">
    <div class="bg-canvas p-3">
      <CommentPin />
    </div>
  </Frame>,
];
