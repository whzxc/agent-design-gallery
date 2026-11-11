# Agent CLI interface

This reference describes schema version 1 of the `adg --json` interface. See the
[design toolkit](design-toolkit.md) for command arguments, source authoring and compare
adapters.

## Output discipline

Every CLI command accepts `--json`. Put it before the command or among that command's
arguments, before the `--` operand separator. Implicit directory invocations use the
`open` contract. Argument parsing failures also use JSON when a standalone `--json`
appears before the separator; `--frame=--json` and operands after `--` do not enable it.

Stdout contains only compact JSON, without color or terminal control sequences. Each
document ends with a newline; newlines inside strings are escaped. Human logs, progress,
configuration-hook output and build-worker output go to stderr. Stderr text and timing
are not machine interfaces.

| Invocation | Stdout framing |
| --- | --- |
| `link`, `init`, `migrate`, `check`, `render`, `compare`, every `root` and `service` action | One envelope, then exit |
| `serve --print-key`, `serve --rotate-key` | One envelope, then exit |
| `--help`, `--version`, including command-specific forms | One envelope, then exit |
| Foreground `open`, ordinary `serve` | NDJSON: one envelope per line until termination |

Read foreground stdout incrementally. Do not wait for EOF to discover readiness, or
parse the entire stream as one JSON document. A process/bootstrap failure before the
CLI can initialize may provide only stderr and a failed process exit.

## Envelope and exits

All six fields are present on every envelope:

```ts
type NextAction = { argv: string[]; reason: string };
type Diagnostic = { code: string; message: string; next: NextAction[] };
type Envelope<T> = {
  schemaVersion: 1;
  command: string;
  ok: boolean;
  data: T | null;
  warnings: Diagnostic[];
  error: Diagnostic | null;
};
```

`ok:true` has `error:null`; `ok:false` has an error diagnostic. `warnings` is always an
array, including when empty. Failure data is either the command's observed partial
result or `null` when no result has been assembled. A failure need not undo completed
file changes. Consumers must examine `ok` and process termination, even when data exists.

Canonical command identities are `open`, `link`, `serve`, `init`, `migrate`, `check`,
`render`, `compare`, `root add`, `root remove`, `root list`, `root scan`, `service install`,
`service uninstall`, `service status`, `service logs` and `service migrate`. Help and
version use `help` and `version`. Parse failures use the recognized command/action when
available, or the group identity `root`/`service` or global identity `adg`. An implicit
directory invocation uses `open`.

| Exit | Result |
| --- | --- |
| 0 | Successful finite result, or clean foreground shutdown |
| 1 | Completed failing gate: `ok:false`, `CHECK_FAILED` or `COMPARE_FAILED`, `data.complete:true` |
| 2 | Command could not complete: `ok:false`; data with a `complete` field has `complete:false` |

These exits apply in human mode too. Rule findings mean a check ran and found problems;
configuration, build, frame execution and environment failures mean it could not finish.
Partial findings do not turn an execution failure into exit 1. Static architecture
validation, including syntax rejection, is a completed rule evaluation; that rejected
source does not need browser evaluation. Compare differences use exit 1 only after
capture and measurement finish. Missing targets, failed callbacks and unsettled
measurements use exit 2.

An empty unqualified selection succeeds with `EMPTY_SELECTION` and zero counts where
the command supplies counts. Explicit unknown sources/frames normally produce an error;
render's deleted-only case is described below. Absent or
unloaded service status is a successful observation, not a service failure. Recoverable
foreground diagnostics have `ok:true`; their error code is carried in `warnings` and
the process stays live.

## Error catalog and next actions

Branch on stable UPPER_SNAKE codes, not English messages. Typed boundary errors retain
their codes. Otherwise, native `EADDRINUSE` maps to `PORT_IN_USE`; recognized filesystem
and network error codes map to `IO_FAILED` and `NETWORK_FAILED`. Other exceptions map to
`INTERNAL_ERROR`. When cleanup also fails, the original operation remains the primary
error and cleanup diagnostics appear in warnings.

Every error diagnostic supplies a next action. `argv` is an executable argument vector
including the executable, never a shell command string. Run it in the original working
directory. Actions are suggestions; they are not run by ADG. Reasons describe the
prerequisite for retrying and do not create an automatic repair operation.

The following arrays are concrete examples. `/work/project`, `/tmp/adg-state` and
`surfaces/demo` are illustrative operands, not defaults. ADG uses known request paths,
selection and its packaged Playwright version. The construction rules below describe
which arguments are retained.

### Usage

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `USAGE_INVALID` | 2 | Invalid arguments, flag values, combinations or subcommands. | `["adg","--help","--json"]` | Read command arguments. |

### Configuration

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `CONFIG_INVALID` | 2 | Configuration load/shape, gallery groups, viewport or adapter metadata invalid. | `["adg","check","--read-only","--json"]` | Recheck after fixing configuration. |
| `TOKENS_INVALID` | 2 | Known token-file load or validation failure. | `["adg","check","--read-only","--json"]` | Recheck after repairing tokens.css. |
| `MIGRATION_REQUIRED` | 2 | Legacy project configuration requires migration. | `["adg","migrate","/work/project","--json"]` | Migrate the legacy project. |
| `MIGRATION_CONFLICT` | 2 | Project config, destination state or LaunchAgent conflicts with migration. | `["adg","migrate","--help","--json"]` | Inspect migration inputs before resolving the conflict. |

### Version requirement

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `VERSION_UNSATISFIED` | 2 | Installed ADG does not satisfy the project requires range. | `["npm","install","-g","@whzxc/agent-design-gallery"]` | Install a version satisfying project requires. |

### Project discovery

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `DIRECTORY_NOT_FOUND` | 2 | Requested project/root/viewer directory is missing or not a directory. | `["adg","--help","--json"]` | Choose an existing directory. |
| `PROJECT_NOT_FOUND` | 2 | Required project root or hub project cannot be identified. | `["adg","migrate","--help","--json"]` | Select the project root. |
| `SOURCE_NOT_FOUND` | 2 | Explicit source is outside the project or not discovered. | `["adg","check","--help","--json"]` | Choose a discovered source inside the project. |
| `FRAME_NOT_FOUND` | 2 | Explicit frame does not match the selected sources. | `["adg","render","--help","--json"]` | Choose a declared frame in the selected sources. |
| `ROOT_NOT_REGISTERED` | 2 | Requested scan/remove root is not registered. | `["adg","root","list","--state-dir","/tmp/adg-state","--json"]` | Read registered roots. |
| `LEGACY_SOURCE` | 2 | Toolkit source/import uses a legacy SVG instead of TSX or artwork. | `["adg","check","--read-only","--json"]` | Recheck after converting the SVG source to TSX. |

### Source build and Git

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `SOURCE_BUILD_FAILED` | 2 | Source parse, import, runtime, Frame contract or architecture build failure. | `["adg","check","--read-only","--json"]` | Read source diagnostics after repairing the source. |
| `GIT_UNAVAILABLE` | 2 | Git executable is unavailable. | `["git","--version"]` | Verify Git after installing it. |
| `GIT_BASE_INVALID` | 2 | Repository discovery, base revision resolution or base tree/blob read failed. | `["git","-C","/work/project","rev-parse","--show-toplevel"]` | Inspect the project repository and base revision. |

### Render and gates

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `CHECK_FAILED` | 1 | Completed check has rule findings. | `["adg","check","--read-only","--json"]` | Recheck after fixing findings. |
| `COMPARE_FAILED` | 1 | Completed comparison has position/text differences. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Compare again after reviewing the reports. |
| `PLAYWRIGHT_UNAVAILABLE` | 2 | Packaged Playwright module cannot be loaded. | `["npm","install","-g","@whzxc/agent-design-gallery"]` | Restore the packaged browser dependency. |
| `CHROMIUM_UNAVAILABLE` | 2 | Required Chromium executable is missing. | `["npx","playwright@1.64.1","install","chromium"]` | Install Chromium matching ADG's Playwright. |
| `BROWSER_FAILED` | 2 | Browser launch or execution fails with the browser disconnected. | `["npx","playwright@1.64.1","install","chromium"]` | Repair Chromium before retrying. |
| `RENDER_FAILED` | 2 | Frame load, measurement, evaluation or capture execution failed. | `["adg","check","--read-only","--json"]` | Inspect frame execution diagnostics. |
| `COMPARE_TARGET_NOT_FOUND` | 2 | Requested click or capture target does not exist. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Retry after repairing the fixture target. |
| `COMPARE_ADAPTER_FAILED` | 2 | Adapter fixture/start/ready/texts callback failed without a known native cause. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Retry after repairing the adapter callback. |
| `COMPARE_UNSETTLED` | 2 | Comparison text measurements did not settle within 5 seconds. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Retry after stabilizing fixture readiness. |

### Hub and service

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `STATE_INVALID` | 2 | Registry/preferences JSON or legacy migration input is invalid. | `["adg","--help","--json"]` | Inspect the reported state file before retrying. |
| `HUB_KEY_INVALID` | 2 | Selected active hub key has an invalid format. | `["adg","serve","--rotate-key","--state-dir","/tmp/adg-state","--json"]` | Replace the invalid key; existing access will expire. |
| `SERVICE_UNSUPPORTED` | 2 | Service action is unsupported on this platform. | `["adg","serve","--help","--json"]` | Use a foreground hub on this platform. |
| `SERVICE_ALREADY_INSTALLED` | 2 | Install requested with an existing LaunchAgent. | `["adg","service","status","--state-dir","/tmp/adg-state","--json"]` | Inspect the existing installation. |
| `SERVICE_FAILED` | 2 | launchctl inspect/bootstrap/bootout failed. | `["adg","service","logs","--state-dir","/tmp/adg-state","--json"]` | Inspect service diagnostics before retrying. |
| `WATCH_FAILED` | 2 | Watcher stopped or background refresh could not complete. | `["adg","check","--read-only","--json"]` | Inspect project inputs before reopening the viewer. |
| `SHUTDOWN_FAILED` | 2 | Owned-resource or adapter cleanup failed. | `["adg","--help","--json"]` | Inspect the reported resource before retrying. |

### Network and authentication

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `PORT_IN_USE` | 2 | Bind failed because the address/port is in use. | `["adg","--help","--json"]` | Choose an unused port. |
| `NETWORK_FAILED` | 2 | Requested comparison navigation, native network or hub proxy transport failed. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Retry after restoring fixture connectivity. |
| `AUTH_REQUIRED` | 2 | Comparison fixture navigation returned HTTP 401/403. | `["adg","compare","--frame=default","--json","--","surfaces/demo"]` | Retry after providing fixture access. |

### Internal

| Code | Exit | Meaning | Example next argv | Reason |
| --- | --- | --- | --- | --- |
| `IO_FAILED` | 2 | Otherwise unclassified filesystem/access failure. | `["adg","--help","--json"]` | Repair access to the reported path before retrying. |
| `INTERNAL_ERROR` | 2 | Unexpected exception, worker crash or invariant failure. | `["adg","--version","--json"]` | Record the runtime version with the diagnostic. |

Next-action construction:

- Generic help is `["adg", "--help", "--json"]`. When a canonical command/action is
  known, insert its words before `--help`, for example
  `["adg", "service", "install", "--help", "--json"]`. Help/version/global failures
  use global help.
- Check recovery starts with `["adg", "check", "--read-only", "--json"]`. Only a
  `check` invocation with positional sources appends `"--"` and those exact sources.
  Recovery from render/open/build errors performs a general check; it does not preserve
  render frame, theme, scale, output or base flags.
- `MIGRATION_REQUIRED` uses the known project directory, otherwise
  `["adg", "migrate", "--help", "--json"]`. `MIGRATION_CONFLICT` uses project migration
  help except for `service migrate`, which suggests service status with the selected
  state directory.
- Root list, service status/logs and key rotation append `"--state-dir"` and the known
  state directory before `--json`. Omit that pair if no state directory is known.
- `GIT_BASE_INVALID` uses the known repository/project after `"git", "-C"`. Repository
  discovery suggests `"rev-parse", "--show-toplevel"`; unknown revision suggests
  `"log", "-5", "--oneline"`; tree/blob read failure suggests `"status", "--short"`.
  With no known project, use command help. These variants share the catalog reason.
- Compare recovery requires a compare invocation. All mode uses
  `["adg", "compare", "--all", "--json"]`. Single mode retains the explicit string
  options in this order: frame, fixture, region, selector, origin, viewport, using
  attached `--name=value` arguments; then `--page` if set; then each `--click=value` in
  order; then `"--json", "--", source`. It does not reconstruct settings from Frame
  metadata. Missing source/frame context or recovery from another command uses command
  help, retaining the catalog reason.
- For catalog recovery actions, if sanitizing any proposed argument would change it,
  replace the action with safe
  command help and reason `Read command arguments without exposing credentials.`.
  ADG never emits a secret-bearing recovery argument.

Warnings have the same Diagnostic shape and may have `next:[]`. Their codes include:

| Warning | Meaning |
| --- | --- |
| `EMPTY_SELECTION` | No sources or fixture comparisons selected |
| `BROWSER_OPEN_FAILED` | OS browser spawn failed; serving continues |
| `PROJECT_CONFIG_INVALID` | Root scan retained a project whose config could not load/validate |
| `SCAN_DIRECTORY_SKIPPED` | Root scan skipped an unreadable descendant directory |
| `COMPARE_FRAMES_SKIPPED` | All-mode comparison skipped frames without a fixture |
| `MIGRATION_REFERENCES_REMAIN` | Other LaunchAgents still reference the old state directory |
| `USAGE_INVALID` | Render ignored `--base` for an explicit TSX-only selection |

Scan warnings suggest a concrete root rescan with the selected state directory.
Recoverable background failures and additional operation failures may also use catalog
error codes in `warnings`; a warning does not itself change the exit code.

## Command data schemas

All fields shown are present unless marked `?`. `null` means absence or a value not yet
observed. `[]` means an empty list. Filesystem paths are absolute unless identified as
project paths. Project paths use `/`, relative to the project root, including `design/`
or a configured design directory. Geometry is in CSS pixels except explicit PNG pixel
dimensions. Fields ending in `Path` are paths, not URLs.

```ts
type Theme = "light" | "dark";
type ProjectPath = string;
type Base = { rev: string; sha: string }; // requested revision and full commit SHA
type Location = {
  source: ProjectPath | null;
  frame: string | null;
  theme: Theme | null;
  line: number | null;
  column: number | null;                 // line/column are 1-based when known
};
```

### Render

```ts
type RenderData = {
  project: string;
  outputDirectory: string;
  complete: boolean;
  base: Base | null;
  captures: Capture[];
  deleted: ProjectPath[];
};
type Capture = {
  source: ProjectPath;
  frame: string;
  theme: Theme;
  path: string;                          // completed PNG
  scale: number;
  width: number; height: number;         // measured CSS size
  pixelWidth: number; pixelHeight: number; // actual integer PNG dimensions
};
```

Render always uses this object shape, including `base:null` and `deleted:[]` when no
architecture base applies. Captures preserve source selection and declared frame order,
then light before dark when both themes are requested. Parallel capture does not reorder
the list. Only PNGs whose capture/write completed are advertised. A later execution or
cleanup failure can return them with `complete:false`; other partial files can remain on
disk without being advertised. Deleted-only architecture rendering succeeds with empty
captures, even if a frame filter produces no capture. Ignored TSX-only `--base` adds a
usage warning without changing the exit.

### Check

```ts
type CheckData = {
  project: string;
  readOnly: boolean;
  complete: boolean;
  sources: ProjectPath[];
  summary: { sources: number; frames: number; evaluations: number; problems: number };
  findings: Finding[];
};
type Finding = Location & { code: string; message: string };
```

`sources` lists selected sources. `summary.frames` counts frames from successful builds;
`evaluations` counts successful per-frame, per-theme inspections. Static architecture
rejection can contribute findings with zero frame evaluations. `summary.problems` equals
the structured findings count, which can differ from the deduplicated human line count.
Sidecar findings identify the `.md` source. Unknown locations use null, rather than
coordinates parsed from message text. Findings observed before an execution failure are
retained with `complete:false`. `--read-only` skips generated declarations and build files.

| Finding code | Meaning |
| --- | --- |
| `IMPORT_DIRECTION` | Source imports a higher production layer |
| `FRAME_ROOT_INVALID` | Frame does not have exactly one root element |
| `MARKUP_FORBIDDEN` | Forbidden style/script element or event/className attribute |
| `STYLE_FORBIDDEN` | Unsupported inline style outside `data-free` |
| `FRACTIONAL_LENGTH` | Fractional authored pixel length outside `data-free` |
| `TOKEN_COLOR_MISMATCH` | Visible paint outside `data-brand` matches no token |
| `FRAME_OVERFLOW` | Visible content leaves the frame |
| `TEXT_OUTSIDE_FRAME` | Visible text leaves the frame |
| `TEXT_OVERFLOW` | Visible text overflows its owning box |
| `TEXT_OVERLAP` | Visible text lines from different owners overlap |
| `ARCH_SYNTAX` | Pele syntax validation rejected the diagram |
| `ARCH_PAINT_FORBIDDEN` | Diagram paints directly instead of using tokens |
| `ARCH_EDGE_LIMIT` | Diagram exceeds configured edge/message count |
| `ARCH_CLASS_INVALID` | Unknown or reserved diagram class |
| `ARCH_SIDECAR_INVALID` | Invalid sidecar frontmatter |
| `ARCH_OWNER_INVALID` | Invalid owner path/glob or no matching file |
| `ARCH_LABEL_OVERFLOW` | Rendered label overflows its node |

Build exceptions, duplicate frame names and invalid Frame/capture declarations are
execution failures, not finding codes.

### Compare

```ts
type CompareData = {
  project: string;
  complete: boolean;
  all: boolean;
  comparisons: Comparison[];
  skipped: { source: ProjectPath; frame: string; reason: "no_fixture" }[];
  summary: { frames: number; matched: number; offsets: number; missing: number; extra: number };
  indexPath: string | null;
  summaryPath: string | null;
};
type Comparison = {
  source: ProjectPath;
  frame: string;
  fixture: string;
  theme: Theme;
  settled: boolean;
  size: { design: [number, number]; implementation: [number, number] };
  matched: number;
  offBy2px: { text: string; dx: number; dy: number; dw: number; off: number }[];
  missing: string[];
  extra: string[];
  paths: { design: string; implementation: string; overlay: string; report: string; html: string };
};
```

Single and all mode use the same list shape, in source/frame order. Each comparison uses
its fixture theme. Size tuples are rounded CSS `[width, height]`; deltas are CSS pixels,
and `off` is the largest absolute x/y/width delta. Differences strictly above 2 pixels
are in `offBy2px`, sorted by decreasing `off`. Missing and extra entries are text strings.
Summary fields sum comparison counts, not skipped frames.

Rows are added after all five artifacts finish writing. `indexPath` is the single
comparison's HTML or the completed all-mode index. `summaryPath` is the completed
all-mode summary JSON, otherwise null. All mode records fixtureless frames in `skipped`
and emits one summary warning. It writes the all-mode index/summary even when no fixture
frames were selected, then reports `EMPTY_SELECTION`.

All-mode execution stops at the first execution failure and retains previous rows.
Unsettled measurements can retain a row and artifacts with `settled:false`; top-level
`complete:false`, `COMPARE_UNSETTLED` and exit 2 prevent treating that row as a completed
gate verdict. Capture box and text measurements must remain unchanged for 300 ms within
the 5-second settlement budget. On-disk `report.json` and `summary.json` retain their report formats;
the CLI envelope does not wrap those files.

### Root actions

```ts
type RootRecord = {
  path: string;
  depth: number;                         // 0 through 3
  scannedAt?: string;                    // UTC timestamp written by a successful scan
  projectCount: number;
};
type RootData = {
  stateDirectory: string;
  roots: RootRecord[];
  affected: string[];
};
```

All four actions return the full registry projection without private project records.
Add scans immediately and sorts roots by path; remove/list/scan retain stored registry
order. `affected` contains the added/removed root, sorted rescanned roots, or `[]` for
list. Existing registry records can lack `scannedAt` until scanned. Missing registry in
list/scan yields empty roots. A failed registry mutation returns `data:null`; its
uncommitted in-memory scan is not a successful result. Project config warnings retain
the project path in their sanitized message and keep that project counted.

### Init and project migration

```ts
type Change = {
  action: "created" | "updated" | "renamed" | "deleted" | "regenerated" | "skipped";
  path: string;
  from: string | null;                   // previous absolute path for rename only
};
type ProjectChangesData = { project: string; complete: boolean; changes: Change[] };
```

Both commands return `ProjectChangesData`. Changes follow execution order, including
generated declarations and ignore-file edits. Init records preserved files as `skipped`.
Re-running migration may regenerate declarations. After recorded changes, a later
failure returns `complete:false` with those changes. Preflight failure may return null.
These commands do not provide a transaction or rollback guarantee.

### Service actions

```ts
type ServiceStatus = {
  label: string;
  installed: boolean;
  loaded: boolean;
  state: string | null;
  pid: number | null;
  plist: string;
  stateDirectory: string;
  logs: { stdout: string; stderr: string };
};
type ServiceInstallData = { service: ServiceStatus; port: number };
type ServiceUninstallData = { label: string; plist: string; stateDirectory: string; retained: true };
type ServiceLogsData = {
  label: string;
  stateDirectory: string;
  logs: { stream: "stdout" | "stderr"; path: string; exists: boolean; lines: string[] }[];
};
type ServiceMigrateData = {
  complete: boolean;
  from: { label: string; stateDirectory: string; plist: string };
  to: { label: string; stateDirectory: string; plist: string };
  changes: Change[];
  keyPrefixUpdated: boolean;
  references: string[];
  service: ServiceStatus | null;
};
```

`service status` data is exactly `ServiceStatus`; OS `state` text is nullable and its
vocabulary is not frozen. Install reads job status after bootstrap; it makes no HTTP
readiness claim. Uninstall waits for bootout/removal and retains state/logs. Logs is a
finite snapshot: exactly two rows in stdout/stderr order, at most 200 trailing lines per
file. Missing files have `exists:false, lines:[]`; an existing empty file has
`exists:true, lines:[]`. Trailing whitespace is trimmed before splitting log lines.

Service migration records completed filesystem changes, key-prefix update and remaining
LaunchAgent references. Later failure retains that data with `complete:false`;
`service` remains null until status is observed. Remaining references produce one
`MIGRATION_REFERENCES_REMAIN` warning. Migration never returns key contents. Service
actions are supported only on macOS and are finite even when they start a resident hub.

### Link, help and version

```ts
type LinkData = { url: string };
type HelpData = { subject: string | null; usage: string; text: string };
type VersionData = { version: string };
```

Link formats a URL without contacting the viewer or claiming readiness. Help `subject`
is null for global help, otherwise the requested canonical command/action. Action help
uses the group's help text; `usage` is its first line. Help and version bypass project
configuration and do not start a viewer or service.

## Open/serve lifecycle and key results

```ts
type ReadyData = {
  event: "ready";
  url: string;
  port: number;
  pid: number;
  directory: string | null;
  stateDirectory: string;
  instanceId: string;
};
type DiagnosticEventData = { event: "diagnostic"; location: Location | null };
type StoppedData = { event: "stopped"; signal: "SIGINT" | "SIGTERM" | null };
type ServeKeyData =
  | { action: "print-key"; stateDirectory: string; key: string }
  | { action: "rotate-key"; stateDirectory: string; rotated: true };
```

1. Startup failure emits one `ok:false` envelope, `data:null`, then exits 2, with no
   ready event. Startup diagnostics can be collected as warnings on the eventual ready
   or failure envelope.
2. Exactly one ready event is emitted after listener bind and startup work. Open also
   finishes discovery/watcher setup and instance registration. Serve initializes the
   hub key and listener. Readiness means serving readiness; lazy project/frame builds
   and browser drawing happen later. `url` is the actual loopback URL including an open
   preview locator, `port` is the bound port (including resolution of 0), `pid` is the
   foreground process and `instanceId` matches its health ID. `directory` is the served
   directory for open and null for serve. `stateDirectory` is absolute.
3. Recoverable source/overlay build, token, refresh and hub project/proxy failures emit
   `ok:true`, `DiagnosticEventData`, a diagnostic in `warnings` and `error:null`.
   Build-worker crashes are reported as `INTERNAL_ERROR` diagnostics while the pool
   replaces the worker. Only known locations are populated. Ordinary HTTP misses/auth
   denials, superseded builds, normal revisions and idle eviction produce no event;
   an idle viewer cleanup failure can produce a diagnostic. No heartbeat is emitted.
4. Lost watchers, listener errors and hub fatal registry-state errors close owned
   resources and emit one terminal `ok:false` envelope with `DiagnosticEventData`, then
   exit 2. A cleanup error preserves the original cause and adds a warning.
5. SIGINT/SIGTERM closes owned resources, including open's instance record, emits one
   `ok:true` stopped event and exits 0. A signal received during startup can produce
   just the stopped event after startup resources are closed. Duplicate signals/errors
   do not duplicate terminal events. Cleanup failure produces a terminal failure and
   exit 2 instead of stopped.

Command identity is constant throughout the stream. EPIPE closes owned resources and
exits 2 without further stdout. A crash, SIGKILL or bootstrap failure may have no terminal
event; EOF alone is not evidence of clean shutdown. Human mode retains `ADG: <url>` on
stdout at readiness and does not emit JSON events.

Print/rotate results are finite `ServeKeyData` documents and do not bind a listener.
`--print-key` reads or creates the selected state key. Rotation replaces it and returns
`rotated:true`. Combining print and rotate, or supplying `--port` with either, is
`USAGE_INVALID` in both modes.

## Secrets

Only an explicit `serve --print-key --json` request may expose a key, and only in its
successful `data.key` field. Sibling fields, warnings and errors remain sanitized even
on that invocation. Rotation, readiness, status and migrations never return key values.
The human print-key invocation retains its explicit plaintext key result.

The serializer sanitizes string values throughout data, warnings, errors and recovery
arguments. ADG/legacy hub key strings, bearer credentials, recognized authorization/key
header values, HTTP(S) URL userinfo and query values named `key`, `token`, `access_token`,
`api_key` or `authorization` are replaced with `[REDACTED]`. URL parameters can remain
present with redacted values. Captured config/hook and worker logs are redirected to
stderr under JSON mode with the same string sanitizer; service log snapshots are
sanitized before serialization. Arbitrary application secrets outside recognized
patterns are not discoverable by this sanitizer.

Link rejects URL userinfo and removes input query/hash fields except supported preview
state and base revision before formatting the result. Key file paths and non-secret
project paths remain visible. No raw Error/config/environment/request-header objects
are included in the envelope. Catalog next actions containing recognizable credentials are
replaced with safe help.

## Stability

Schema version 1 freezes envelope fields/types/nullability, canonical command identities,
finite versus NDJSON framing, `ok`/`complete` semantics, exit assignments, documented
command data fields/types/units and existing diagnostic-code meanings. Nullable fields
stay present; a flag does not change an array to an object. The readiness boundary and
explicit-key disclosure rule are part of the contract.

Optional data fields, new commands and new diagnostic codes/entries can grow additively.
Ignore unknown object fields and display unknown diagnostics with their supplied actions;
unknown error codes still mean failure. Changing an existing required field, event/data
union or code meaning is breaking. Messages, warning text, next-action reasons, request
operands, OS state text, stderr, object-key order and exact timings are not frozen text.
Next actions remain structured argv arrays governed by the construction rules above.

While ADG is 0.x, a breaking schema change increments both `schemaVersion` and the
package minor version. Consumers must reject unsupported schema versions. Schema version
and package version are separate: compatible package releases retain `schemaVersion:1`.
