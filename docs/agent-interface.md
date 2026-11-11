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
| `link`, `init`, `migrate`, `check`, `render`, `compare`, `diff`, `owner`, `impact`, every `root` and `service` action | One envelope, then exit |
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
`render`, `compare`, `diff`, `owner`, `impact`, `root add`, `root remove`, `root list`, `root scan`, `service install`,
`service uninstall`, `service status`, `service logs` and `service migrate`. Help and
version use `help` and `version`. Parse failures use the recognized command/action when
available, or the group identity `root`/`service` or global identity `adg`. An implicit
directory invocation uses `open`.

| Exit | Result |
| --- | --- |
| 0 | Successful finite result, or clean foreground shutdown |
| 1 | Completed failing gate: `ok:false`, `CHECK_FAILED`, `COMPARE_FAILED` or `DIFF_FAILED`, `data.complete:true` |
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

### Revision diff

These codes use the diff retry construction below. The example selection is
`--base=HEAD`; all five codes have executable recovery argv
`["adg","diff","--base=HEAD","--json"]` for that request.

| Code | Exit | Meaning / retry prerequisite | Example next argv |
| --- | --- | --- | --- |
| `DIFF_BASE_DEPENDENCIES_UNAVAILABLE` | 2 | A historical import actually failed; restore that import or its installed dependency. Changed manifests alone produce a warning. | `["adg","diff","--base=HEAD","--json"]` |
| `DIFF_FAILED` | 1 | Completed gate is changed; review artifacts and resolve differences. | `["adg","diff","--base=HEAD","--json"]` |
| `DIFF_REFERENCE_INVALID` | 2 | Repair a missing parent/source/frame, invalid/nonunique selector or invisible target. | `["adg","diff","--base=HEAD","--json"]` |
| `DIFF_UNSETTLED` | 2 | Stabilize the part/parent snapshots or isolation target. | `["adg","diff","--base=HEAD","--json"]` |
| `DIFF_SNAPSHOT_UNSUPPORTED` | 2 | Supply static paint whose geometry, resources and external contribution can be attributed. | `["adg","diff","--base=HEAD","--json"]` |

Invalid parent declaration shape uses `SOURCE_BUILD_FAILED`; invalid thresholds use
`CONFIG_INVALID`. Git, source selection, resource load, browser and artifact I/O errors
retain their existing catalog codes and recovery rules. Historical diagnostics and
recovery argv refer to original project/repository paths, never a disposable base tree.

Ownership-specific errors and recovery actions are listed under [Owner diagnostics and exits](#owner-diagnostics-and-exits).

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
- Diff retry requires canonical command `diff` and a nonempty string base. Start with
  `["adg","diff"]`, append explicitly supplied string options as attached values in order
  `base`, `frame`, `theme`, `scale`, `out-dir`, then `"--json"` and, when present,
  `"--"` followed by the exact source operands. Defaults are not invented. Without a
  usable base/context, use `["adg","diff","--help","--json"]`. Coverage warnings remove
  frame/source restrictions and force `--theme=both`, retaining base/scale/output.
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
| `DIFF_BASE_ENVIRONMENT_REUSED` | Base config uses current dependencies and applicable manifests/lockfiles differ; recorded in `environment.configDependencies`. `next:[]`. |
| `DIFF_BASE_MIGRATED` | Legacy base was migrated in the disposable tree; recorded in `environment.baseMigration`. `next:[]`. |
| `DIFF_RENAMED_OR_UNKNOWN` | Added/removed rows have rename candidates for review. `next:[]`. |
| `DIFF_COVERAGE_INCOMPLETE` | A part needs full both-theme coverage; for base HEAD, `next` is `[{"argv":["adg","diff","--base=HEAD","--theme=both","--json"],"reason":"Compare all existing frames in both themes before a structural batch verdict."}]`. |

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

### Diff

```sh
adg diff [source...] --base=<rev> [--frame=<name>] [--theme=both|light|dark] [--scale=2] [--out-dir=<path>] [--json]
adg diff --base=HEAD --json
adg diff modules/toolbar --base=HEAD~1 --frame=compact --theme=both --out-dir=output/review --json
```

The canonical identity is `diff`. The required nonempty `--base` resolves to a Git commit;
the after side is the current working tree, including uncommitted and untracked sources.
Omitting sources selects the union of both revisions' configured TSX and architecture
sources. Explicit operands accept project-root-relative, design-relative or in-project
absolute source paths; design sources may omit `.tsx`. Duplicate operands are deduplicated.
An exact `--frame` name filters the union, retaining base-only and current-only frames.
Unknown explicit sources/frames fail. Defaults are both themes, device scale 2 and
`<configured output>/diff` (`output/design/diff` with default config). Scale must be a
finite positive number. A relative output directory resolves from the project root.

Identity is `(project-relative source, frame name)`, with a comparison row per theme.
Exact matches retain native CSS/device sizes. Added and removed frames retain nulls for
the absent side. Rename candidates remain separate added/removed rows with
`matchKind:renamed_or_unknown` and candidate references; diff never silently pairs them.
A size change is a failed gate even when common pixels are equal. Architecture pairs
use plain revision-local renders, independently of the viewer/render proposal overlays.

`existingCoverage` is `full` only for an unqualified source selection, no frame filter
and both themes. Explicit source operands, a frame filter or one theme give `partial`,
even if those operands happen to cover every frame. A source-empty union is `empty`.
An empty unqualified comparison succeeds with `EMPTY_SELECTION`, zero counts and
`identical`. It supplies no structural coverage evidence.

| Verdict | Meaning | Exit / envelope |
| --- | --- | --- |
| `identical` | All selected ordinary pairs have exact decoded pixels and CSS/device sizes. | 0, `ok:true`, `complete:true` |
| `structural` | At least one newly declared part passes its parent, snapshot, size and pixel-class gates; every selected/support row passes and existing-frame coverage is full in both themes. | 0, `ok:true`, `complete:true` |
| `changed` | Any selected/support row or required coverage fails. | 1, `ok:false`, `DIFF_FAILED`, `complete:true` |
| `null` | An execution or owned-resource cleanup failure prevented completion. | 2, `ok:false`, `complete:false`; completed rows remain available |

Ordinary matched frames collect no part snapshots and allow no pixel tolerance.
Only a current-only TSX Frame's `parent` declaration activates part evidence. Diff
compares the current part against the base parent target and compares the base/current
parent targets. Both full parent renders must remain identical in both themes.
Unselected required parent frames are deduplicated into `support`; a selected parent
keeps its selected row and ID. Part/classifier rules and consumer thresholds are defined
in the [toolkit contract](design-toolkit.md#git-frame-diff) and the
[crop/part workflow](asset-rules.md#crop-and-part-frames).

A single-theme part gets `theme_coverage_incomplete` and a local `changed` verdict.
A both-theme restricted run can retain locally `structural` rows, but its batch is
`changed` with `existing_coverage_incomplete` and `DIFF_COVERAGE_INCOMPLETE`. Support
captures do not promote a restricted run to full coverage.

```ts
type Verdict = 'identical' | 'structural' | 'changed'
type RepositoryPath = string // relative to the Git repository root
type FrameRef = { source: ProjectPath, frame: string }
type Box = { x: number, y: number, width: number, height: number }
type Size = { width: number, height: number, pixelWidth: number, pixelHeight: number }
type Thresholds = {
  imperceptible: { maxChannelDelta: number },
  antialiasing: { maxChannelDelta: number, maxRatioExclusive: number },
  boundaryBleed: { edgeDevicePixels: number },
  bitmapResampling: { maxRatioExclusive: number }
}
type ClassStat = {
  pixels: number, ratio: number, maxChannelDelta: number,
  withinThreshold: boolean
}
type PixelStats = {
  areaPixels: number, equalPixels: number, differentPixels: number,
  classes: {
    imperceptible: ClassStat, antialiasing: ClassStat,
    boundary_bleed: ClassStat, bitmap_resampling: ClassStat, other: ClassStat
  }
}
type SnapshotFinding = {
  code: string,
  kind: 'element' | 'layout' | 'color' | 'resource',
  path: string, property: string,
  before: unknown | null, after: unknown | null
}
type ComparisonReason =
  | 'pixels_changed' | 'added' | 'removed' | 'renamed_or_unknown'
  | 'size_changed' | 'snapshot_mismatch' | 'threshold_exceeded' | 'other_pixels'
  | 'parent_changed' | 'theme_coverage_incomplete' | 'existing_coverage_incomplete'
type DiffComparison = {
  id: string,
  source: ProjectPath, frame: string, theme: Theme,
  status: 'matched' | 'added' | 'removed',
  matchKind: 'exact' | 'unmatched' | 'renamed_or_unknown',
  matchCandidates: FrameRef[],
  relation: 'revision' | 'parent_crop',
  before: FrameRef | null, after: FrameRef | null,
  beforeSize: Size | null, afterSize: Size | null,
  parent: null | {
    ref: FrameRef, selector: string,
    cssCrop: Box, deviceCrop: Box, fractionalOrigin: { x: number, y: number },
    clipping: { before: Box[], current: Box[], after: Box[] },
    supportIds: string[]
  },
  snapshots: null | {
    elementEqual: boolean, layoutEqual: boolean,
    colorEqual: boolean, findings: SnapshotFinding[]
  },
  pixels: PixelStats,
  verdict: Verdict, reasons: ComparisonReason[],
  note: { before: string | null, after: string | null },
  paths: {
    before: string | null, after: string | null, difference: string,
    beforeSnapshot: string | null, afterSnapshot: string | null,
    parentCurrentSnapshot: string | null,
    report: string, parentIsolated: string | null, bleedMask: string | null
  }
}
type DiffData = {
  project: string, outputDirectory: string,
  complete: boolean, base: { rev: string, sha: string },
  current: { kind: 'working_tree', head: string | null },
  selection: {
    sources: ProjectPath[], frame: string | null, themes: Theme[], scale: number,
    existingCoverage: 'full' | 'partial' | 'empty'
  },
  environment: {
    adg: string, node: string, platform: string, arch: string, chromium: string | null,
    esbuild: string, tailwindcss: string, pele: string, lucide: string, playwright: string,
    locale: string, timezone: string,
    baseThresholds: Thresholds,
    configDependencies: { reused: boolean, changedFiles: RepositoryPath[] },
    baseMigration: {
      applied: boolean,
      changes: { action: string, path: ProjectPath, from: ProjectPath | null }[]
    }
  },
  classifierVersion: 1, thresholds: Thresholds,
  comparisons: DiffComparison[], support: DiffComparison[],
  verdict: Verdict | null, reasons: ComparisonReason[],
  summary: {
    sources: number, frames: number, comparisons: number, supportComparisons: number, isolationCaptures: number,
    added: number, removed: number, matched: number,
    identical: number, structural: number, changed: number,
    classPixels: {
      imperceptible: number, antialiasing: number, boundary_bleed: number,
      bitmap_resampling: number, other: number
    }
  },
  differencePalette: Record<string, string>, reportPath: string | null,
  timings: {
    prepareMs: number, buildMs: number, captureMs: number,
    compareMs: number, writeMs: number, totalMs: number
  }
}
```

`id` is an opaque deterministic encoding of source/frame/theme and selected/support role.
`before` points to the parent for `parent_crop`; its `beforeSize` describes the crop.
Ordinary rows have null `parent`, `snapshots` and snapshot paths. The absent image, ref
and size in an ordinary added/removed row are null. `reasons` explain the gate; snapshot
findings carry a code, equality domain, context (`part` or `parent`), property path and
actual JSON before/after values. Finding codes are `TOKEN_CHANGED`, `RESOURCE_CHANGED`,
`CLIPPING_CHANGED`, `COLOR_CHANGED`, `ELEMENT_ADDED`, `ELEMENT_REMOVED`, `ELEMENT_CHANGED`,
`LAYOUT_CHANGED`, `TEXT_CHANGED` and `PART_FRAME_GEOMETRY_CHANGED`.

Pixels decode as sRGB RGBA; fully transparent RGB is canonicalized to zero. Every
nonidentical pixel belongs to exactly one class. Class counts sum to `differentPixels`,
and `equalPixels + differentPixels = areaPixels`. Unequal/absent sides use the union
canvas: pixels present on one side are `other` with delta 255; space outside both is
equal transparent. Ordinary differences are all `other`. Ratios use `areaPixels`; zero
class counts have delta 0 and pass their limit. Part findings can fail a zero-pixel-diff row.

Summary source/frame/lifecycle counts describe the selected union, once across themes.
`comparisons`, verdict counts and `classPixels` count completed selected theme rows;
`supportComparisons` counts additional completed support rows separately.
`isolationCaptures` counts deduplicated isolation requests, including an attempted request
in an incomplete run. Support or coverage can fail a batch whose selected rows all pass.

`environment` records installed tooling and Chromium, fixed locale/timezone, base config
dependency reuse, revision-relative migration changes and the resolved historical policy.
Current `thresholds` govern classification and appear in every comparison report.
`chromium:null` means it was not observed. A base/config failure before result assembly
has `data:null`; later failures keep observed partial data. Unstarted phase timings are
zero. Timings are milliseconds of sequential waves with up to four concurrent pairs,
not summed worker CPU time. `compareMs` includes any isolation work. `totalMs` also
includes startup/cleanup and orchestration; it excludes CLI bootstrap and the final
manifest write. Timing values are diagnostic, without a fixed latency promise.

Artifacts under `outputDirectory`:

```text
report.json
frames/<encoded source components>/<encoded frame>/<theme>/
  before.png                    # null/absent for an ordinary addition
  after.png                     # null/absent for an ordinary removal
  difference.png
  comparison.json
  before.snapshot.json          # part only: base parent target
  parent-current.snapshot.json  # part only: current parent target
  after.snapshot.json           # part only: current part
  parent-isolated.png           # optional isolated base-parent crop
  bleed-mask.png                # optional attribution mask
support/<encoded source components>/<encoded frame>/<theme>/...
```

Each source/frame path component is URI encoded, including dots. `report.json` is the
plain `DiffData`, while CLI stdout uses `Envelope<DiffData>`. `comparison.json` contains
`{ classifierVersion:1, thresholds, comparison }`. Equal difference pixels are transparent;
`differencePalette` records the class colors. Native images are never resized to compare.
Part crops copy original device pixels using floor(left/top) and ceil(right/bottom),
with CSS crop, device crop, fractional origin and clipping retained in the row.
`parent.supportIds` link to full parent PNGs in either selected or support rows.

A snapshot file has `snapshotVersion:1`, `ref`, `theme`, `size`, `origin`, `elements`,
`texts`, `tokens`, `resources`, `contextEffects`, `cssCrop`, `deviceCrop`, `fractionalOrigin`,
`clipped`, `frameClipped`, `edgeBoxes`, `rasterMask`, `unsupported` and `frameAligned`.
Origins/boxes are CSS pixels; descendant boxes are relative to the target root.
`deviceCrop`, `rasterMask` (linear pixel indices) and fractional origin use device pixels.
The other records are:

| Record | Fields |
| --- | --- |
| Element | Stable traversal `path`, `parentPath`, `tag`, `namespace`, semantic `attributes`, `childOrder`, `box`, `clientRects`, grouped `layout`/`paint`, full `computedStyle`, `pseudo.before`/`after` (null or content/style), `tokenExpressions` (property/expression/resolved), auxiliary `owners` |
| Text | `path`, `parentPath`, direct `text`, `lines` containing text and root-relative box |
| Token | `name`, original `declaration`, `resolved` active value; the complete active map is compared |
| Resource | `id`, logical `source`, `kind` (`raster`, `vector`, `font`), SHA-256 `contentIdentity` of captured bytes, nullable intrinsic width/height |
| Context | `clipping` rectangles, `clipShapes` with root-relative box/radii, `compositing` opacity/background-image/shadow records, RGBA `backdrop` |
| Unsupported paint | `path`, `property`, `value`; nonempty records stop the operation with a typed error |

Snapshot equality normalizes same-subtree fragment IDs and resource references, excludes
class/style/ID/data-attribute spelling and ownership metadata, and preserves exact local
geometry, semantic content, resolved styles and token declarations. Token expressions
remain evidence alongside resolved styles; full property-to-token provenance is not
provided. Two equal consecutive observations and an unchanged post-capture observation
must fit one five-second monotonic deadline. Ordinary frames bypass this work.

All referenced artifacts are written before their completed row is advertised. Failed
runs keep completed rows and, when writable, a partial manifest. `reportPath:null` means
the manifest write failed. Stale unreferenced artifacts from previous runs are not deleted.
The ordered rows, revision labels, sizes, PNGs, notes, palette, crop/support references and
findings are sufficient for a later review-sheet composer without re-rendering.

### Owner

`owner` is a finite, read-only lookup over the current project. It returns one
`Envelope<OwnerData>` and exits. It writes derived caches to external state, without
registering a hub project or generating files in the design checkout.

```sh
adg owner --file=ui/controls.tsx --symbol=Button --json
adg owner --file=ui/controls.tsx --line=42 --json
adg owner --file=ui/ --json
adg owner --file='ui/**/*.tsx' --json
adg owner --text='Save changes' --contains --locale=en --json
adg owner --color='#336699' --theme=light --json
adg owner --token=--accent --json
```

Exactly one nonempty `--file`, `--text`, `--color` or `--token` is required. There are
no positional source operands. All modes accept `--theme=both|light|dark` (default
`both`), `--state-dir=<path>` and `--json`. `--state-dir` resolves from invocation cwd;
it defaults to `$XDG_STATE_HOME/agent-design-gallery`, or
`~/.local/state/agent-design-gallery`. Repeated mode/modifier flags, unknown flags, extra
operands and invalid combinations return `USAGE_INVALID`.

| Mode | Inputs and matching |
| --- | --- |
| File | Exact file, directory or quoted POSIX glob, resolved from the discovered project root. In-project absolute paths are accepted; escaping paths/symlinks are rejected. Directory/glob queries expand current regular files and can succeed empty. Exact missing inputs use `OWNER_INPUT_NOT_FOUND`. Only a single existing file accepts `--line=<positive 1-based integer>` and/or `--symbol=<exact label>`; a line beyond EOF is invalid. Bindings come from [implementation.json](design-toolkit.md#implementation-mappings). |
| Text | Unicode NFC and Unicode whitespace collapse/trim, preserving case, punctuation, accents and script. Default is exact equality; `--contains` adds literal substring matches. Whitespace-only input is invalid. `--locale=<BCP 47 tag>` canonicalizes and filters exact Frame annotations, excluding unspecified locales; there is no language fallback or translation. |
| Color | Absolute CSS colors supported by packaged Chromium, including hex, RGB/HSL, named and modern color functions. Normalize to unpremultiplied 8-bit sRGB RGBA, clamp and round channels, canonical lowercase `#rrggbbaa`; alpha zero also zeros RGB. No compositing or tolerance. CSS-wide/system colors, `currentColor`, `var()` and context-dependent relative colors are `OWNER_COLOR_INVALID`; use `--token` for custom properties. |
| Token | Exact case-sensitive custom-property name such as `--accent`. Invalid syntax is `USAGE_INVALID`; an undeclared valid name succeeds empty without building or launching a browser. Resolve declarations and aliases separately in light and merged light+dark maps, including noncolor tokens. |

Text observations include painted HTML/SVG text, visible field values/placeholders and
literal pseudo content. Inline fragments in the same block/control form a run; wrapping
does not split it. Separate blocks and controls remain separate. Hidden, zero-opacity,
fully clipped and password-value text is excluded; visible `aria-hidden` text is included.
Accessible names alone, bitmap/canvas text and arbitrary occlusion analysis are outside
the search. Paint observations include text, backgrounds, borders/outlines, SVG paint,
shadows, gradients and visible pseudo-elements; absent and fully transparent paint is
excluded. Image-internal colors and backdrop-composited colors are not inspected.

A line belongs to the region starting at the nearest lexical export or declared anchor
boundary at or above it. Every recognized JS/TS export starts a region, including
unmapped exports. In other file types only declared anchors do. Non-exported helpers
belong to the preceding export's region. A mapped boundary yields
`mapping_symbol_region`; an unmapped boundary or a line before the first boundary
falls back to file-level bindings with `OWNER_LOCATOR_UNMAPPED`. `data.region` reports
`boundaryLine`, `symbol`, `mapped` and exclusive `nextBoundaryLine` (EOF + 1 for the last
region), even when unmapped; it is null before the first boundary and for other query
kinds. Adding `--symbol` also restricts symbol bindings to that exact label.

#### Owner data

`Theme`, `ProjectPath`, `FrameRef` and `Box` follow the definitions above. Boxes are
frame-relative CSS pixels. Element paths are observation-local preorder identities,
not stable cross-revision identifiers.

```ts
type ImplementationSelector =
  | { file: ProjectPath; symbol?: string; anchor?: string }
  | { directory: ProjectPath }
  | { glob: ProjectPath };
type DesignBinding = { source: ProjectPath; part?: string; frames?: string[] };
type OwnerQuery = {
  kind: 'file' | 'text' | 'color' | 'token';
  input: string;                       // original query, envelope-sanitized
  normalized: string;                  // root-relative path/glob, text, RGBA hex or token
  pathKind: 'file' | 'directory' | 'glob' | null;
  line: number | null; symbol: string | null;
  contains: boolean; locale: string | null;
  themes: Theme[];
  rgba: [number, number, number, number] | null;
};
type MatchKind =
  | 'mapping_symbol' | 'mapping_symbol_region'
  | 'mapping_file' | 'mapping_directory' | 'mapping_glob'
  | 'text_exact' | 'text_contains' | 'color_value'
  | 'token_name' | 'token_value' | 'token_reference'
  | 'token_alias_reference' | 'token_fallback_reference';
type Evidence = {
  matchKind: MatchKind;
  frame: FrameRef | null; theme: Theme | null;
  elementPath: string | null; boxes: Box[];
  owners: { source: ProjectPath; part: string }[];
  authoredIn?: { source: ProjectPath; line: number }[]; // present on text evidence
  references?: { token: string; kind: 'token_reference' | 'token_alias_reference' | 'token_fallback_reference'; via: string[] }[]; // color only
  detail:
    | { kind: 'mapping'; file: ProjectPath; pointer: string;
        implementation: ProjectPath; selector: ImplementationSelector;
        locatorMatched: boolean | null; anchorLine: number | null; nextBoundaryLine: number | null }
    | { kind: 'text'; raw: string; normalized: string;
        fragments: { elementPath: string; text: string; boxes: Box[] }[] }
    | { kind: 'paint'; property: string; computed: string;
        rgba: [number, number, number, number]; usage: 'computed_value' }
    | { kind: 'reference'; token: string; property: string;
        declaration: string; via: string[]; usage: 'authored_reference' }
    | { kind: 'token'; token: string; declaration: string;
        resolved: string | null; via: string[]; source: ProjectPath;
        line: number; inherited: boolean };
};
type TokenResult = {
  name: string; source: ProjectPath;
  matchKind: 'token_name' | 'token_value';
  values: {
    theme: Theme; declaration: string; line: number; inherited: boolean;
    resolved: string | null; rgba: [number, number, number, number] | null;
    via: string[];
  }[];
  evidence: Evidence[];
};
type OwnerMatch = {
  source: ProjectPath; part: string | null;
  matchKind: MatchKind; rank: number[];
  frames: (FrameRef & { theme: Theme; locale: string | null })[];
  tokens: string[];                     // referenced token names in matched scope
  authoredIn?: { source: ProjectPath; line: number }[]; // present on text owners
  evidence: Evidence[];
};
type MappingFinding = {
  code: string; source: ProjectPath; pointer: string;
  implementation: string | null; target: DesignBinding | null;
  line: number | null; column: number | null; message: string;
  frame: string | null; theme: null;
  observedAnchorLines: number[];
};
type OwnerData = {
  project: string; complete: boolean; query: OwnerQuery;
  region: { boundaryLine: number; symbol: string; mapped: boolean; nextBoundaryLine: number } | null;
  owners: OwnerMatch[]; tokens: TokenResult[];
  ambiguous: boolean; tokenAmbiguous: boolean;
  matchedImplementationFiles: ProjectPath[];
  mappingFindings: MappingFinding[];
  coverage: {
    discoveredSources: number; builtSources: number;
    requestedObservations: number; completedObservations: number;
    mappingState: 'absent' | 'valid' | 'stale';
    activeBindings: number; excludedBindings: number;
    domain: 'tsx';
  };
};
```

`owners` group occurrences by defining source/export, using the nearest stamped part
root; unmarked content belongs to its frame source with `part:null`. `frames` retain
host source/frame, theme and authored locale (`null` when unspecified). An inline
composition can therefore have a different host source from its leaf owner.

| Query | Owner evidence scope |
| --- | --- |
| File | Mapping items only, including the mapping file and JSON pointer. Related tokens remain names in `owner.tokens` and declaration summaries in `data.tokens`; no token-reference owner evidence. |
| Text | `text_exact` and `text_contains` items only, with raw/normalized runs, fragment paths/boxes and `authoredIn`. Related token names/summaries are separate. |
| Color | `color_value` items only. Their compact `references` lists contain `{token, kind, via}` only for the same element path and property as the matching paint. No subtree-wide reference evidence. |
| Token | Direct, alias and fallback reference items for the queried token. Equal colors alone do not establish token use. |

Token reference evidence means an authored declaration applies to the observed element:
it does not prove that declaration won the cascade or that a fallback was taken.
`usage:"authored_reference"` and `usage:"computed_value"` remain separate. Color
queries return matching named palette tokens in `data.tokens`; token queries return
the named declaration even without references. File/text queries expand related token
names there. Same-valued aliases stay separate token identities. Unresolved/cyclic
values retain declarations and references with `resolved:null` and a warning; resolved
noncolors have `rgba:null` without that warning.

Each text evidence `authoredIn` searches the frame source's build dependency closure:
design TSX and imported code/data modules, including fixture modules and JSON. It finds
the exact raw literal of each non-whitespace direct text-node fragment, returning all
matching source/1-based line pairs. It ignores pseudo/field-value fragments. Order is
innermost part source, frame source, other nearest owner sources, then remaining paths
and lines. The owner row deduplicates these candidates, prioritizing its own source,
then contributing frame sources, then other paths/lines. Empty lists are valid for
computed text. This is literal search, not AST attribution: comments or unrelated equal
literals can match; escaped, entity-encoded, transformed or concatenated strings can be
missed. `authoredIn` points to copy candidates, not a replacement design owner.

#### Ranking, ordering and completion

Rank tuples compare lexicographically, smaller first. An owner's rank/match kind is its
best occurrence. Return all owners, without truncation; ties sort by source then part
using Unicode code-point order. Frames sort by host source, declared frame order and
light before dark. Tokens sort by name; evidence preserves deterministic frame/path/kind
order and is deduplicated. Do not choose an owner from an arbitrary tie.

| Query | Rank tuple and match kinds |
| --- | --- |
| File | `[selectorRank, -prefixOrDepth, wildcardCount, -literalCharacters, locatorRank]`. Exact file = 0, directory = 1, glob = 2. Exact files have zero specificity fields. Directories use segment depth and zero wildcard/literal fields. Globs use literal-prefix character length, number of segments containing wildcards and total non-wildcard characters. Locator rank: `mapping_symbol` = 0 for a symbol query, `mapping_symbol_region` = 1 for a line region, other bindings = 2. Unrefined bindings use `mapping_file`, `mapping_directory` or `mapping_glob`. |
| Text | `[kindRank, unmatchedLength, ownerDistance]`: `text_exact` = 0, `text_contains` = 1; unmatched length is normalized run length minus query length in Unicode code points. |
| Color | `[0, ownerDistance]`, `color_value`; matching palette records use `token_value` in the separate token list. |
| Token | `[referenceKindRank, aliasHopCount, ownerDistance]`: `token_reference` = 0, `token_alias_reference` = 1, `token_fallback_reference` = 2. Declaration records use `token_name`. |

`ownerDistance` counts parent steps to the nearest ownership root (0 at its marker),
or the traversal depth through the frame root for unmarked content. `ambiguous:true` means two or more
owners tie at the best rank. In color mode, multiple matching token identities also set
`tokenAmbiguous:true`. Both conditions emit `OWNER_AMBIGUOUS`; neither is a failed gate.

`complete:true` means all observations required by the query finished. Coverage source
counts distinguish discovered sources from sources requested through the build store
(`builtSources` includes cache hits); observation counts count frame/theme pairs.
`mappingFindings` contain excluded stale bindings, pointers, candidate anchor lines and
1-based JSON value locations. File lookup validates relevant bindings; use a full
`check --read-only --json` to audit the entire map. `mappingState` is the state inspected
by that lookup; text/color/token modes only load the mapping schema.

Empty results succeed with `OWNER_NO_MATCH`, unless a token declaration or matching
palette token is itself an answer. An empty file-source domain or a text/color domain with no selected TSX observations
also gets `EMPTY_SELECTION`; token declaration answers need not warn. Stale bindings are excluded explicitly and can coexist
with valid answers. Failures before result assembly have `data:null`; later failures
retain partial rows/counts with `complete:false`. Read `ok`, `complete` and termination
before treating an empty list or ambiguity flag as final.

Broad color and token queries can return around 100 KB or more because every matching
occurrence remains evidence. Read `owners` first and narrow with `--theme=light` or
`--theme=dark`; text queries can also use exact text and `--locale`. There is no hidden
result cap or automatic first-match choice.

#### Owner diagnostics and exits

| Code | Kind / exit | Recovery argv and prerequisite |
| --- | --- | --- |
| `OWNER_MAP_INVALID` | Error / 2 | `["adg","check","--read-only","--json"]` after fixing JSON/version/schema/path grammar. |
| `OWNER_INPUT_NOT_FOUND` | Error / 2 | `["adg","owner","--help","--json"]`; choose an existing in-project input. |
| `OWNER_COLOR_INVALID` | Error / 2 | Owner help argv; supply an absolute supported CSS color or use `--token`. |
| `OWNER_UNSETTLED` | Error / 2 | Retry the original owner query after stabilizing its frame/resources; two equal observations across animation frames must occur within five seconds. |
| `OWNER_INDEX_CHANGED` | Error / 2 | Retry the original query after concurrent input edits finish. |
| `OWNER_MAPPING_MISSING` | Warning / 0 | Read-only check argv; add implementation.json for file lookup. |
| `OWNER_MAPPING_STALE` | Warning / 0 | Read-only check argv; repair `mappingFindings`. |
| `OWNER_PART_UNOBSERVED` | Warning / 0 | Read-only check argv; add a current specimen for the declared part. |
| `OWNER_LOCATOR_UNMAPPED` | Warning / 0 | Original owner query argv after adding/refining its symbol or anchor binding. |
| `OWNER_AMBIGUOUS` | Warning / 0 | Original owner query argv; inspect evidence and narrow the query before retrying. |
| `OWNER_NO_MATCH` | Warning / 0 | Read-only check argv; inspect mappings, authored copy or token declarations. |
| `OWNER_TOKEN_UNRESOLVED` | Warning / 0 | Read-only check argv after fixing the token's theme-local alias/declaration. |
| `EMPTY_SELECTION` | Warning / 0 | `next:[]`; inspect the TSX/locale domain. |

“Read-only check argv” means `["adg","check","--read-only","--json"]`.
Owner retry starts `["adg","owner"]`, retaining explicit attached options in order
`file`, `line`, `symbol`, `text`, `color`, `token`, `locale`, then `--contains` if set,
then explicit `theme`, `state-dir`, then `--json`. Defaults and disambiguating operands
are not invented. For example:
`["adg","owner","--text=Save changes","--locale=en","--theme=light","--json"]`.
Missing retry context falls back to owner help. Existing sanitation rules replace a
secret-bearing recovery action with safe owner help.

`USAGE_INVALID` uses owner help. Config, build, token-file, filesystem, browser/render
and cleanup errors retain the general catalog codes/actions. Semantic `OWNER_*` check
findings are listed under [Check](#check), not registered as execution-error codes.
Owner exits 0 for completed observations, including empty, stale and ambiguous answers;
it never exits 1. Invalid/incomplete execution exits 2. A completed `check` with mapping
findings still exits 1 under `CHECK_FAILED`.

### Impact

`impact` returns frame candidates and, for Git queries, operation-local materialized-input proofs.
It takes no screenshots and changes no render/check/diff scheduling.

```sh
adg impact --source=design/components/button.tsx --part=Button --explain --json
adg impact --source=design/fixtures/states.ts --json
adg impact --token=--accent --theme=dark --json
adg impact --file=ui/controls.tsx --symbol=Button --json
adg impact --base=HEAD --json
adg impact --base=main --head=HEAD --json
```

Exactly one selector family is required: repeatable `--source` with optional `--part` for one
registered TSX export, repeatable `--token`, one `--file` with owner's line/symbol locators,
or `--base` with optional `--head`. Source paths use existing source resolution; existing
non-entry files inside design are also accepted. File paths/directories/globs use owner's
project-root grammar. Hypothetical token candidates assume unchanged Tailwind classification.
`--base` compares its exact commit with staged, unstaged and untracked working files;
`--head` selects a second exact commit instead. No merge-base or triple-dot inference.

Options are `--theme=both|light|dark` (default both), `--state-dir`, `--explain` and `--json`.
There are no positional operands, `--scale`, `--observe` or consuming-command `--impacted`
flags in this segment. Empty values, mixed families and repeated single-valued flags fail
`USAGE_INVALID`. Help/version and sanitation follow the common contract.

```ts
type ImpactQuery =
  | {kind:'source', sources:ProjectPath[], part:string|null}
  | {kind:'token', tokens:string[]}
  | {kind:'file', input:string, normalized:string,
     pathKind:'file'|'directory'|'glob', line:number|null, symbol:string|null}
  | {kind:'git', base:Base, head:Base|null};
type ImpactFact = {
  id:string, kind:'source'|'part'|'token'|'implementation'|'mapping'|'architecture'
    |'config'|'global_css'|'environment'|'unknown',
  source:ProjectPath|null, part:string|null, token:string|null,
  themes:Theme[], sides:('before'|'after')[], pathIndexes:number[]
};
type ImpactReason = {
  fact:string, class:'part_occurrence'|'dependency'|'token_dependency'|'mapping'
    |'global'|'lifecycle'|'unknown',
  scope:'direct'|'transitive'|'declared'|'global'|'support',
  sides:('before'|'after')[], count:number,
  witness?:{origin:'emitted'|'build'|'lexical'|'declaration', source?:ProjectPath,
    part?:string, token?:string, via?:string[], mappingPointer?:string}
};
type ImpactFrameGroup = {
  source:ProjectPath, frames:string[], status:'matched'|'added'|'removed'|'current',
  matchKind?:'exact'|'unmatched'|'renamed_or_unknown', matchCandidates?:FrameRef[],
  rows:{themes:Theme[], candidate:boolean, disposition:'render'|'proven_unaffected'|'unassessed',
    reasons?:ImpactReason[],
    proof?:{kind:'materialized_inputs_equal'|'architecture_inputs_equal',version:1,
      tokenMode:'reachable_declarations'|'full_sheet',projection?:string},
    unassessedReasons?:('external_resource'|'dynamic_document'|'unsupported_css'
      |'missing_side'|'incomplete_identity')[]}[]
};
type ImpactData = {
  project:string, complete:boolean, query:ImpactQuery,
  before:{kind:'revision',sha:string}|null,
  after:{kind:'revision'|'working_tree',sha:string|null},
  selection:{themes:Theme[],explain:boolean},
  changes:{before:RepositoryPath|null,after:RepositoryPath|null,
    status:'modified'|'added'|'deleted'|'renamed'|'type_changed',
    role:'design'|'token'|'implementation'|'mapping'|'architecture'|'config'
      |'global_css'|'environment'|'outside_design_inputs'|'unknown'}[],
  facts:ImpactFact[], frames:ImpactFrameGroup[], mappingFindings:(MappingFinding & {sides:('before'|'after')[]})[],
  unresolvedInputs:{path:string|null,reason:string,fallback:'none'}[],
  coverage:{inventory:'complete'|'incomplete',mapping:'not_requested'|'valid'|'absent'|'stale',
    expectedRows:number,candidateRows:number,directRows:number,transitiveRows:number,
    renderRows:number,provenRows:number,unassessedRows:number,proofComplete:boolean,
    tokenScan:{reachableRows:number,fullSheetRows:number,
      fallbackReasons:('tokens_parse_failed'|'unbalanced_var')[]}},
  timings:{prepareMs:number,indexMs:number,materializeMs:number,proofMs:number,
    queryMs:number,totalMs:number}
};
```

`frames` contains source groups for candidates or rows that require rendering. Equal theme records merge into
`rows[].themes`; equal records within a source merge into `frames` in declared order.
Groups follow their first frame's order. Empty matchCandidates and null matchKind are omitted.
Empty reasons/unassessedReasons and null proof fields are omitted. Noncandidate proven rows
are counted without listing. `renderRows` counts proposed frame/theme work, not captures;
renderRows + provenRows + unassessedRows equals expectedRows. Direct/transitive counts can overlap.
A working-tree sha is observed HEAD, not uncommitted input identity.

Git queries freshly build and execute every TSX entry at both endpoints through the shared build
pool, once per operation. Transform caches can be reused; executed source payloads cannot.
Compare canonical document/metadata/policy bytes directly. The document is exactly the builder's
per-theme document with its own token block replaced by reachable theme-local declarations or
absence; full_sheet mode retains the complete raw sheet. Parent/dimensions and resolved capture
policy also participate. The policy fixes initial viewport, reduced motion, locale/timezone,
animation/caret behavior and per-side diff policy; no machine/environment fingerprint is used.
Architecture compares raw .mmd bytes, sidecar presence/bytes, full token bytes and resolved architecture config.

Eligibility parses HTML and tokenizes CSS without launching Chromium. Script elements, on* attributes,
javascript: URLs, iframe/object/embed require rendering (`dynamic_document`). Resource references
must be data: or fragment-only, including srcset, CSS url/image-set/import/font sources and SVG
href/xlink:href, nested data SVG/CSS and animated resource URLs (`external_resource`). Uninspectable
CSS resource expressions use `unsupported_css`; parser/resource decoding failure uses
`incomplete_identity`. Plain hyperlinks, animations, media and canvas are otherwise permitted.

Successful Git rows are either render or proven_unaffected; proofComplete:true means the entire
requested union was classified. Added/removed/rename candidates never prove (`missing_side`).
Required new-part parents remain render with support evidence. Unchanged source bytes can still
render after fresh Date/random output differs. A render row without a dependency reason can result
from this fresh output comparison. Hypothetical queries stay proof-free, with noncandidates unassessed.

Proofs exist only in the operation, with default fields kind/version/tokenMode. --explain adds the
first represented frame/theme's projection digest; digests never decide equality or split groups.
Final validation checks dependency bytes, discovery/resolution inventories, tracked/config/token
inputs and freshly resolved config after worker shutdown. Concurrent changes fail
IMPACT_INPUT_CHANGED, exit 2. Incomplete results discard every proof and set proofComplete:false.

Dependencies are conservative, including helpers and unrendered exports. Emitted provenance
does not claim painted visibility. Lexical token reachability scans the union of raw, CSS-escape-
decoded and HTML-character-reference-decoded text outside the builder's token block, then closes
over var targets/fallbacks. Hex escapes (including optional whitespace) and single-character
escapes add names. Cycles stop at visited names; missing declarations record absence. Only
parseTokens failure or an unbalanced var() in a reached token declaration requires full-sheet
fallback. `coverage.tokenScan` counts classified TSX input rows in each mode, including cached
facts and both Git sides; architecture's intentional full-sheet dependency is excluded.
Any fallback emits one `IMPACT_TOKEN_FALLBACK` warning with its reason names. No token-value
equality or absence of occurrences proves a frame unaffected.

Mapping selectors and locators reuse owner. Stale locators retain resolvable design targets;
missing mappings do not broaden to all frames. Mapping frame subsets scope declaration evidence,
while source dependencies remain conservative. Renames stay added/removed with candidate hints.

Default reasons coalesce by fact/class/scope and side set. Counts sum witnesses across the
represented frame/theme rows. `--explain` keeps one witness from each group's first frame
and first represented theme; differing witnesses do not split groups. Optional null/empty
witness fields are omitted. No text/paint/boxes/observations are attached; use `adg owner`.
All candidate identities remain represented without truncation. Consumers count frames by
summing group.frames.length, not the number of groups.

| Code | Exit | Recovery |
| --- | --- | --- |
| `IMPACT_INPUT_NOT_FOUND` | 2 | `["adg","impact","--help","--json"]`; select a registered part, declared token or design helper. |
| `IMPACT_INPUT_CHANGED` | 2 | Original impact invocation after concurrent edits finish. |
| `IMPACT_MAPPING_INCOMPLETE` | Warning / 0 | `["adg","check","--read-only","--json"]`; repair the named mapping findings. |
| `IMPACT_TOKEN_FALLBACK` | Warning / 0 | `["adg","check","--read-only","--json"]`; repair token syntax or an unbalanced var() declaration. |
| `IMPACT_NO_MATCH` | Warning / 0 | Owner query for the supplied file/token, otherwise read-only check. |
| `IMPACT_NO_CHANGES` | Warning / 0 | No changed design candidates; `next:[]`. |

Reuse existing source/file/config/token/map/Git/build/I/O/cleanup diagnostics. Every error
has recovery argv. Retry flags use attached values in source/part/token/file/line/symbol/base/head/
theme/state-dir order, then explain/json; sanitization falls back to impact JSON help. Exit 0
means a completed candidate query, including empty/stale mappings. Impact never emits exit 1.
Exit 2 retains partial data with complete:false, or null before normalization. All workers and
disposable revision trees close before completion.

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
| `OWNER_IMPLEMENTATION_MISSING` | Selector matches no current implementation file |
| `OWNER_LOCATOR_STALE` | Symbol/anchor resolves zero or multiple times; add or repair an explicit anchor |
| `OWNER_MAPPING_DUPLICATE` | Duplicate implementation/design binding |
| `OWNER_SOURCE_MISSING` | Bound TSX source is not discovered |
| `OWNER_PART_MISSING` | Named part is not exported by its defining source |
| `OWNER_FRAME_MISSING` | Explicit frame name is absent |
| `OWNER_PART_FRAME_MISMATCH` | Explicit frame does not contain the named part |

Mapping findings identify implementation.json and its 1-based JSON value location;
messages include a JSON pointer. With named sources, mapping target validation is
restricted to those design sources; a full check audits the map. A missing optional
map adds no finding. Invalid map shape is `OWNER_MAP_INVALID` (exit 2).

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
