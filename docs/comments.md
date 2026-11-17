# Comments

Comments are conversation threads pinned to the design library. They are modelled on [Doop](https://github.com/kgoedecke/doop)'s
comments: a comment tool, pins that keep their size at every zoom, threads that open in place, one panel that lists
them, and a small command-line interface through which agents read, answer and resolve them.

Comments replace ADG annotations. The `annotations` command, the `api/annotations` routes, the annotation interface,
its styles and tests, and the annotation sections of other documents are removed. Stored annotations are neither
read nor migrated.

## Anchors

A thread is pinned to the deepest target under the point where it was placed:

| Target | Identity | Where it appears |
| --- | --- | --- |
| Element | source, frame and element ID | inside a frame on a board, and on that frame's after image on the review page |
| Frame | source and frame | the frame's background |
| Source | source | the source's section on its board, outside its frames |
| Chapter | layer and chapter | the chapter board, outside its sections |

The element ID is the `e1_` identity that `adg inspect` reports, so comments need no attribute written into a
project's sources. The pin keeps the placed point relative to its target's top-left corner. It follows the target when
the board re-lays out, and it is clamped into the target when the target shrinks.

Each thread records, at placement, the frame-relative point, the Git revision (null outside Git) and a snapshot of the
target: its label as in `modules/files#source-local`, plus the element's tag, a text excerpt and its owning part
(`<source>#<Export>`) for an element target. When the target can no longer be found, the pin falls back one level,
from element to frame at the recorded point, then from frame to its source, and is marked **changed**. A thread whose
source is gone appears only in the panel. The snapshot still tells what it pointed at.

The Tokens board and architecture diagrams take no comments.

## Placing a comment

- The **Comment** tool is a toggle in the bottom toolbar, also switched by `C`. While it is on, the cursor shows a
  comment cursor, and hovering outlines the target a click would pin to and names it in a small tag.
- A click places a pin and opens an inline composer beside it, focused, with a placeholder naming the target, as in
  "Comment on Button “Open”…". There is no modal dialog. `⌘↩` or `Ctrl+↩` posts and `Esc` discards the draft.
- The tool stays on after a post, so a review pass can place several comments. `Esc` with no composer open, or `C`,
  turns it off. A press that moves past the drag threshold pans the board instead of placing a pin, and clicks place
  pins instead of selecting while the tool is on.
- The context menu of an element, frame or source has **Comment**, which opens the composer at that point without
  turning the tool on.
- On touch screens a tap places the pin.

## Pins

- A pin is a speech bubble whose pointed corner marks the placed point. It shows the thread number `#n` and keeps its
  screen size at every zoom. Pins never hide because of zoom.
- Open threads use the accent colour. A changed pin has a dashed edge. Resolved pins are hidden unless the panel shows
  resolved threads, and then appear muted.
- Pins that would overlap fan out so that each stays clickable.
- Hovering a pin previews its thread: the author, time, the first lines of the first message and the reply count.
- Clicking a pin opens or closes its thread.
- Dragging a pin past the drag threshold re-pins the thread to the target under the pointer on release, by the same
  rules as the tool. `Esc` during the drag puts it back.
- `⇧C` hides or shows every pin and is remembered per viewer.
- The keyboard shortcuts dialog lists `C` and `⇧C`.

## Threads

A thread opens as a popover attached to its pin:

- **Header**: the target label and, for a changed thread, the changed mark.
- **Messages**: oldest to newest, each with its author, a relative time and plain text with line breaks kept. A long
  thread opens scrolled to its newest message.
- **Reply field**: `⌘↩` or `Ctrl+↩` sends. A reply that fails keeps its draft and says so.
- **Resolve**: closes the thread. A resolved thread shows who resolved it and offers **Reopen**. A reply from the viewer
  in a resolved thread reopens it.
- **Menu**: **Copy link**, **Edit** and **Delete** for the viewer's own messages, and **Delete thread**, which asks for
  confirmation.

Threads have two statuses, open and resolved. An agent that carries out a request replies with what it changed and
resolves the thread. The user reopens it when the result is not right.

## Panel

The **Comments** button in the top-right toolbar opens the panel and shows the number of open threads.

- A two-way filter, **Open** and **Resolved**. Open threads are listed in board order, grouped by layer and chapter.
  Resolved threads are listed most recently resolved first.
- Each row shows the number, the target label, the first two lines of the first message, the last author and time,
  the reply count and the changed mark.
- Clicking a row switches scope when needed, moves the camera to the pin and opens the thread.
- With no threads, the panel says how to start: press `C` and click a frame.

## Review page

On the `?base=<rev>` review page, the Comment tool and pins work on the after image of every added or changed frame,
with the same anchors as the boards, so a thread placed there also appears on the board and the other way round.
Before images and removed frames take no comments.

## Links and live updates

Every thread has a link: the viewer URL with `?comment=<n>`. Opening it selects the right scope, moves the camera to
the pin and opens the thread. `adg link <viewer-url> --comment=<n>` prints it, and **Copy link** copies it.

A change made anywhere, in another viewer or through the command line, reaches every open viewer of the project within
two seconds without a reload. It does not disturb an open composer or reply draft.

## Agent interface

Agents work from the project directory:

```
adg comments [--status=open|resolved|all] [--source=<path>] [--frame=<name>] [--json]
adg comments read <n> [--json]
adg comments reply <n> --author=<name> --message=<text> [--json]
adg comments resolve <n> --author=<name> [--message=<text>] [--json]
```

- `<n>` is the thread number, with or without `#`, or the thread ID. The list defaults to open threads.
- `--author` names the agent, such as `codex`. Messages are 1 to 10,000 characters.
- `list` returns each thread's number, ID, status, anchor, target snapshot, revision, messages and link.
- `read` adds the anchor's current state, `attached`, `changed` or `gone`, the element's current box within its frame,
  and an executable `adg inspect <source> --frame=<frame> --element=<id> --json` command, without `--element` when the
  element is no longer found.
- `reply` appends a message and keeps the status. `resolve` appends the optional message, then resolves the thread and
  records the agent and time.
- Placing, editing, deleting and reopening are the user's actions and have no command.

An agent handling comments lists the open threads, reads each one, makes the change, and resolves the thread with one
line saying what changed. When a request is unclear, it replies with its question and leaves the thread open.

The [agent CLI interface](agent-interface.md#comments) owns the JSON envelope, the record schema and the viewer
server's `api/comments` routes, which the hub proxies with its existing authentication.

## Storage

Threads live outside every repository, in `<state-dir>/comments/`, one JSON file per project keyed by the absolute
project root, and are shared by the hub and the standalone viewers that use the same state directory. Writes are
atomic and serialized per project. Thread numbers increase per project and are never reused. The user's messages are
authored as `user` and appear as **You**; an agent's carry its name.

## Not included

@mentions and automatic agent pickup, claims, presence and cursors, sharing roles, notifications, attachments and rich
text. Work is dispatched explicitly: the user asks an agent to handle the comments or shares a thread link.
