import { Frame } from 'adg';
import { CommentPin } from '../components/comment-pin';
import { MenuItem } from '../components/menu-item';
import { Panel } from '../components/panel';
import examples from '../fixtures/comments.json';

const { commentExample, changedExample, resolvedExample, previewExample } = examples;

type Message = { author: string; time: string; text: string };
export type Thread = {
  number: number;
  target: string;
  displayName?: string;
  changed?: boolean;
  resolvedBy?: string;
  messages: Message[];
};

const heading = 'flex min-w-0 items-center gap-[7px]';
const close = 'h-[26px] w-[26px] shrink-0 rounded-row text-[18px] leading-none text-text-secondary';
const title = 'min-w-0 flex-1 break-words text-title leading-5 font-[650]';
const action = 'rounded-row border border-border px-[10px] py-[5px] font-[550]';

function ChangedBadge() {
  return (
    <span class="shrink-0 rounded-artboard border border-dashed border-text-tertiary px-[5px] text-caption text-text-secondary">
      Changed
    </span>
  );
}

function ActionsMenu({ label, items }: { label: string; items?: { label: string; danger?: boolean }[] }) {
  return (
    <div class="relative shrink-0">
      <button type="button" aria-label={label} class={close}>
        ⋯
      </button>
      {items && (
        <div class="absolute top-full right-0 z-10 mt-1">
          <Panel form="menu" width={148} bordered>
            <div class="p-1">
              {items.map(item => (
                <MenuItem label={item.label} danger={item.danger} />
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Editor({
  placeholder,
  submit,
  resolveLabel,
  focused = false,
}: {
  placeholder: string;
  submit: string;
  resolveLabel?: string;
  focused?: boolean;
}) {
  return (
    <div class="grid shrink-0 gap-[7px]">
      <textarea
        rows={3}
        aria-label={placeholder}
        placeholder={placeholder}
        class={`block min-h-[54px] w-full resize-y rounded-field border border-border bg-surface-sunken p-2 text-text
          placeholder:text-text-tertiary ${focused ? 'outline outline-accent -outline-offset-1' : ''}`}
      />
      <div class="flex justify-between gap-2">
        {resolveLabel && (
          <button type="button" class={action}>
            {resolveLabel}
          </button>
        )}
        <button
          type="button"
          disabled
          class={`${action} ml-auto border-accent bg-accent text-on-accent opacity-[0.45]`}
        >
          {submit}
        </button>
      </div>
    </div>
  );
}

export function CommentComposer({ displayName }: { displayName: string }) {
  return (
    <Panel form="popover" width={332} bordered>
      <div class="flex flex-col gap-[10px] p-3 text-body leading-[1.4]">
        <header class={heading}>
          <h2 class={title}>New comment</h2>
          <button type="button" aria-label="Discard draft" class={close}>
            ×
          </button>
        </header>
        <Editor placeholder={`Comment on ${displayName}…`} submit="Post" focused />
      </div>
    </Panel>
  );
}

export function CommentThread({ thread, confirmDelete = false }: { thread: Thread; confirmDelete?: boolean }) {
  const detail = thread.displayName && thread.displayName !== thread.target ? thread.displayName : '';
  return (
    <Panel form="popover" width={332} bordered>
      <div class="flex flex-col gap-[10px] p-3 text-body leading-[1.4]">
        <header class={heading}>
          <h2 class={title}>
            #{thread.number} {thread.target}
          </h2>
          {thread.changed && <ChangedBadge />}
          <ActionsMenu label="Thread actions" />
          <button type="button" aria-label="Close thread" class={close}>
            ×
          </button>
        </header>
        {detail && <p class="-mt-[6px] truncate text-meta text-text-tertiary">{detail}</p>}
        {confirmDelete && (
          <div class="flex items-center justify-between gap-2 rounded-row border border-border bg-surface-sunken px-2 py-[6px] text-meta">
            <span class="font-[550] text-text">Delete thread?</span>
            <div class="flex shrink-0 items-center gap-[6px]">
              <button type="button" class="rounded-row border border-border bg-surface px-[10px] py-[5px] font-[550]">
                Cancel
              </button>
              <button
                type="button"
                class="rounded-row border border-danger bg-danger px-[10px] py-[5px] font-[550] text-on-accent"
              >
                Delete
              </button>
            </div>
          </div>
        )}
        <div class="max-h-[310px] min-h-[42px] overflow-auto">
          {thread.messages.map(message => (
            <article class="border-t border-border px-[2px] py-2">
              <div class={heading}>
                <strong class="break-words">{message.author}</strong>
                <span class="text-meta text-text-secondary">{message.time}</span>
                {message.author === 'You' && (
                  <span class="ml-auto">
                    <ActionsMenu label="Message actions" />
                  </span>
                )}
              </div>
              <p class="mt-1 break-words whitespace-pre-wrap">{message.text}</p>
            </article>
          ))}
        </div>
        {thread.resolvedBy && (
          <p class="rounded-row bg-surface-sunken px-2 py-[7px] text-meta text-text-secondary">
            Resolved by {thread.resolvedBy}
          </p>
        )}
        <Editor placeholder="Reply…" submit="Reply" resolveLabel={thread.resolvedBy ? 'Reopen' : 'Resolve'} />
      </div>
    </Panel>
  );
}

export function CommentPreview({
  number,
  target = commentExample.target,
  displayName,
  changed = false,
  author,
  time,
  text,
  replies,
}: {
  number: number;
  target?: string;
  displayName?: string;
  changed?: boolean;
  author: string;
  time: string;
  text: string;
  replies: string;
}) {
  const detail = displayName && displayName !== target ? displayName : '';
  return (
    <Panel form="popover" width={236} bordered>
      <div role="tooltip" class="flex flex-col gap-[5px] p-3 text-body leading-[1.4]">
        <div class="flex min-w-0 items-baseline gap-[7px]">
          <span class="shrink-0 text-accent tabular-nums">#{number}</span>
          <strong class="min-w-0 truncate">{target}</strong>
          {changed && <ChangedBadge />}
        </div>
        {detail && <p class="truncate text-meta text-text-tertiary">{detail}</p>}
        <p class="line-clamp-2 break-words whitespace-pre-wrap">{text}</p>
        <p class="text-meta text-text-secondary">
          {author} · {time} · {replies}
        </p>
      </div>
    </Panel>
  );
}

export function CommentsPanel({
  filter = 'Open',
  threads,
  group,
  pinsHidden = false,
}: {
  filter?: 'Open' | 'Resolved';
  threads: Thread[];
  group?: string;
  pinsHidden?: boolean;
}) {
  return (
    <aside aria-label="Comments">
      <Panel width={320} bordered>
        <div class="flex flex-col gap-2 overflow-hidden p-[10px] text-body leading-[1.4]">
          <header class={heading}>
            <h2 class={title}>Comments</h2>
            <button type="button" aria-label="Close comments" class={close}>
              ×
            </button>
          </header>
          <div class="flex gap-1 rounded-field bg-surface-sunken p-[3px]" role="group" aria-label="Comment status">
            {(['Open', 'Resolved'] as const).map(tab => (
              <button
                type="button"
                aria-pressed={tab === filter}
                class={`flex-1 rounded-row px-2 py-1
                  ${tab === filter ? 'bg-surface font-[650] text-text' : 'text-text-secondary'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          {pinsHidden && (
            <div
              class="flex items-center justify-between gap-2 rounded-row border border-dashed border-border
                bg-surface-sunken px-2 py-[5px] text-meta text-text-secondary"
            >
              <span>{examples.pinsHidden}</span>
              <button
                type="button"
                class="rounded-row border border-border bg-surface px-2 py-[3px] text-caption font-[550] text-text"
              >
                Show (⇧C)
              </button>
            </div>
          )}
          <div class="min-h-0 overflow-auto">
            {!threads.length ? (
              <p class="m-[6px] text-body text-text-secondary">
                {filter === 'Open' ? examples.emptyOpen : examples.emptyResolved}
              </p>
            ) : (
              <>
                {filter === 'Open' && group && (
                  <h3 class="mx-[6px] mt-[10px] mb-1 break-words text-meta leading-4 font-[550] text-text-tertiary">
                    {group}
                  </h3>
                )}
                {threads.map(thread => {
                  const last = thread.messages.at(-1);
                  const replies = thread.messages.length - 1;
                  const detail = thread.displayName && thread.displayName !== thread.target ? thread.displayName : '';
                  return (
                    <button type="button" class="grid w-full gap-[3px] px-[6px] py-[7px] text-left whitespace-normal">
                      <span class="flex min-w-0 items-baseline gap-[7px]">
                        <span class="shrink-0 text-accent tabular-nums">#{thread.number}</span>
                        <strong class="min-w-0 truncate">{thread.target}</strong>
                        {thread.changed && <ChangedBadge />}
                      </span>
                      {detail && <span class="truncate text-meta text-text-tertiary">{detail}</span>}
                      <span class="line-clamp-2 break-words whitespace-pre-wrap">{thread.messages[0]?.text}</span>
                      <span class="flex min-w-0 items-baseline gap-[7px] text-meta text-text-secondary">
                        {last && <span class="flex min-w-0 items-baseline gap-[7px]">
                          <span class="truncate">{last.author}</span><span>{last.time}</span>
                        </span>}
                        <span class="ml-auto shrink-0 whitespace-nowrap">
                          {replies} {replies === 1 ? 'reply' : 'replies'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </Panel>
    </aside>
  );
}

export default () => [
  <Frame name="composer">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin />
      <CommentComposer displayName={commentExample.displayName} />
    </div>
  </Frame>,
  <Frame name="thread-open">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin number={1} expanded />
      <CommentThread thread={commentExample} />
    </div>
  </Frame>,
  <Frame name="thread-resolved">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin number={resolvedExample.number} resolved changed expanded />
      <CommentThread thread={{ ...resolvedExample, resolvedBy: 'codex', changed: true }} />
    </div>
  </Frame>,
  <Frame name="thread-confirm-delete">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin number={1} expanded />
      <CommentThread thread={commentExample} confirmDelete />
    </div>
  </Frame>,
  <Frame name="preview">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin number={1} />
      <CommentPreview {...previewExample} target={commentExample.target} displayName={commentExample.displayName} />
    </div>
  </Frame>,
  <Frame name="panel-open">
    <div class="bg-canvas p-6">
      <CommentsPanel threads={[commentExample, changedExample]} group="components / Essentials" />
    </div>
  </Frame>,
  <Frame name="panel-pins-hidden">
    <div class="bg-canvas p-6">
      <CommentsPanel threads={[commentExample]} group="components / Essentials" pinsHidden />
    </div>
  </Frame>,
  <Frame name="panel-resolved">
    <div class="bg-canvas p-6">
      <CommentsPanel filter="Resolved" threads={[resolvedExample]} />
    </div>
  </Frame>,
  <Frame name="panel-empty">
    <div class="bg-canvas p-6">
      <CommentsPanel threads={[]} />
    </div>
  </Frame>,
];
