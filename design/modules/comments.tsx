import { Frame } from 'adg';
import { CommentPin } from '../components/comment-pin';
import examples from '../fixtures/comments.json';

const { commentExample, resolvedExample } = examples;

type Message = { author: string; time: string; text: string };
type Thread = { number: number; target: string; messages: Message[] };

const card = 'flex w-[332px] flex-col gap-[10px] rounded-panel border border-border bg-surface p-3 text-body leading-[1.4] shadow-menu';
const heading = 'flex min-w-0 items-center gap-[7px]';
const close = 'h-[26px] w-[26px] shrink-0 rounded-row text-[18px] leading-none text-text-secondary';
const title = 'min-w-0 flex-1 break-words text-title leading-5 font-[650]';
const action = 'rounded-row border border-border px-[10px] py-[5px] font-[550]';

function ActionsMenu({ label }: { label: string }) {
  return <button type="button" aria-label={label} class={close}>⋯</button>;
}

function Editor({ placeholder, submit, resolve = false, focused = false }: {
  placeholder: string; submit: string; resolve?: boolean; focused?: boolean;
}) {
  return <div class="grid shrink-0 gap-[7px]">
    <textarea rows={3} aria-label={placeholder} placeholder={placeholder}
      class={`block min-h-[54px] w-full resize-y rounded-field border border-border bg-surface-sunken p-2 text-text
        placeholder:text-text-tertiary ${focused ? 'outline outline-accent -outline-offset-1' : ''}`} />
    <div class="flex justify-between gap-2">
      {resolve && <button type="button" class={action}>Resolve</button>}
      <button type="button" disabled class={`${action} ml-auto border-accent bg-accent text-on-accent opacity-[.45]`}>{submit}</button>
    </div>
  </div>;
}

export function CommentComposer({ displayName }: { displayName: string }) {
  return <section class={card} aria-label="New comment">
    <header class={heading}><h2 class={title}>New comment</h2><button type="button" aria-label="Discard draft" class={close}>×</button></header>
    <Editor placeholder={`Comment on ${displayName}…`} submit="Post" focused />
  </section>;
}

export function CommentThread({ thread }: { thread: Thread }) {
  return <section class={card} aria-label={`#${thread.number} ${thread.target}`}>
    <header class={heading}>
      <h2 class={title}>#{thread.number} {thread.target}</h2>
      <ActionsMenu label="Thread actions" />
      <button type="button" aria-label="Close thread" class={close}>×</button>
    </header>
    <div class="min-h-[42px] max-h-[310px] overflow-auto">
      {thread.messages.map(message => <article class="border-t border-border px-[2px] py-2">
        <div class={heading}>
          <strong class="break-words">{message.author}</strong>
          <span class="text-meta text-text-secondary">{message.time}</span>
          {message.author === 'You' && <span class="ml-auto"><ActionsMenu label="Message actions" /></span>}
        </div>
        <p class="mt-1 whitespace-pre-wrap break-words">{message.text}</p>
      </article>)}
    </div>
    <Editor placeholder="Reply…" submit="Reply" resolve />
  </section>;
}

export function CommentsPanel({ filter = 'Open', threads, group }: {
  filter?: 'Open' | 'Resolved'; threads: Thread[]; group?: string;
}) {
  return <aside aria-label="Comments"
    class="flex w-[320px] flex-col gap-2 overflow-hidden rounded-panel border border-border bg-surface p-[10px] text-body leading-[1.4] shadow-float">
    <header class={heading}><h2 class={title}>Comments</h2><button type="button" aria-label="Close comments" class={close}>×</button></header>
    <div class="flex gap-1 rounded-field bg-surface-sunken p-[3px]" role="group" aria-label="Comment status">
      {(['Open', 'Resolved'] as const).map(tab => <button type="button" aria-pressed={tab === filter}
        class={`flex-1 rounded-row px-2 py-1 ${tab === filter ? 'bg-surface font-[650] text-text' : 'text-text-secondary'}`}>{tab}</button>)}
    </div>
    <div class="min-h-0 overflow-auto">
      {filter === 'Open' && group && <h3 class="mx-[6px] mt-[10px] mb-1 break-words text-meta leading-4 font-[550] text-text-tertiary">{group}</h3>}
      {threads.map(thread => {
        const last = thread.messages.at(-1);
        const replies = thread.messages.length - 1;
        return <button type="button" class="grid w-full gap-[3px] px-[6px] py-[7px] text-left whitespace-normal">
          <span class="flex min-w-0 items-baseline gap-[7px]">
            <span class="shrink-0 text-accent tabular-nums">#{thread.number}</span><strong class="truncate">{thread.target}</strong>
          </span>
          <span class="line-clamp-2 whitespace-pre-wrap break-words">{thread.messages[0].text}</span>
          <span class="flex min-w-0 items-baseline gap-[7px] text-meta text-text-secondary">
            <span>{last?.author}</span><span>{last?.time}</span>
            <span class="ml-auto whitespace-nowrap">{replies} {replies === 1 ? 'reply' : 'replies'}</span>
          </span>
        </button>;
      })}
    </div>
  </aside>;
}

export default () => [
  <Frame name="inline-composer">
    <div class="flex items-start gap-3 bg-canvas p-6">
      <CommentPin />
      <CommentComposer displayName={commentExample.displayName} />
    </div>
  </Frame>,
  <Frame name="thread"><div class="bg-canvas p-6"><CommentThread thread={commentExample} /></div></Frame>,
  <Frame name="panel-open"><div class="bg-canvas p-6"><CommentsPanel threads={[commentExample]} group="components / Essentials" /></div></Frame>,
  <Frame name="panel-resolved"><div class="bg-canvas p-6"><CommentsPanel filter="Resolved" threads={[resolvedExample]} /></div></Frame>,
];
