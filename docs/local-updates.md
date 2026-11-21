# Local milestone updates

Update the maintainer's global ADG installation after each completed milestone that changes packaged runtime code, shared viewer tokens or runtime dependencies. Run the relevant checks and obtain required design approvals before committing and updating. Documentation-only, test-only and fixture-only commits skip installation. This workflow runs as part of milestone delivery without another update request; it does not install a Git hook or a scheduled job.

Resolve the serving host, global installation and public endpoint through MAP before operating on a deployment. Keep environment-specific paths and routing knowledge there. A local update installs the committed package directly; public npm publication remains a separate release action. The package version may stay unchanged, so verify runtime contents rather than relying on `adg --version` alone.

## Pack and install

From the repository root, inspect `git status --short` and the milestone commit. Record the installed artifact set before replacing it. Set `update_root` to the absolute path of `output/local-update/` in the maintainer's primary ADG checkout so delivery from different checkouts uses one store. Ensure packaged files match the milestone commit. If unrelated working-tree changes affect the package, set `update_dir` before using `git archive` to pack from a temporary export of the commit, then remove the export.

```sh
update_dir="${update_root%/}/$(git rev-parse --short HEAD)"
mkdir -p "$update_dir"
npm pack --pack-destination "$update_dir"
npm install --global "$update_dir"/whzxc-agent-design-gallery-*.tgz --prefer-offline --no-audit --no-fund
```

Use the same tarball on the serving host when it differs from the development host. `npm pack` refreshes the packaged token stylesheet. Its file list must contain only `src/`, `public/`, package metadata, README and license.

## One-time service migration

After installing the renamed package, migrate each consumer explicitly, then migrate the resident hub:

```sh
adg migrate /path/to/project
adg service migrate
```

Project migration renames `sdg.config.*` (all supported extensions), rewrites design-source `sdg` imports,
updates editor paths and `.sdg/` ignore entries, removes the old generated directory and regenerates `.adg/`.
It prints changes, is idempotent and refuses mixed config names before editing. Only operate on consumers
included in the requested delivery scope.

Service migration resolves old state from `org.svg-design-gallery.hub`'s `--state-dir` argument, falling back to
`$XDG_STATE_HOME/svg-design-gallery` or `~/.local/state/svg-design-gallery`. It stops that job, moves the whole
directory to `~/.agent-design-gallery` (default `~/.agent-design-gallery`), removes the
old plist and starts `org.agent-design-gallery.hub` with the current Node/CLI paths, new state path and previous
port. `adg service migrate --state-dir=/new/path` overrides the destination. An existing destination or new plist
is refused before stopping the job. Registry, preferences, caches and logs are retained. The stored hub key prefix
changes to `adg_`; the command never prints keys. Retrieve the new key separately with `adg serve --print-key`
when updating browser access.

Afterwards the command lists, read-only, other `~/Library/LaunchAgents/*.plist` files still referencing the old
state path. Update those external jobs separately within the operator's authorized scope.

## Refresh the running service

| Change | Required action after installation |
| --- | --- |
| A consumer's design sources, imported artwork or tokens | Its running viewer watches these files and refreshes affected previews. No ADG installation is needed. |
| Static browser files, including packaged viewer tokens | Reload the browser. |
| `public/assets.js`, `public/layout.js` or `public/selection.js` | Restart the hub to refresh the viewer cache context, then reload the browser. |
| Server, toolkit, package version or runtime dependencies | Restart the hub, then reload the browser. |

On macOS, inspect `adg service status` and the installed LaunchAgent arguments. When the Node and CLI paths are unchanged, restart the existing job:

```sh
launchctl kickstart -k "gui/$(id -u)/org.agent-design-gallery.hub"
adg service status
```

If the recorded Node or CLI path changed, reinstall the service with its existing port and state directory. Preserve the registry, access key, preferences and caches. Restarting the hub briefly disconnects its viewer streams; a changed cache context makes the first visit rebuild measured geometry and previews. Independent `adg open` processes remain running; reopen those sessions separately when they need the updated runtime.

Configure the public origin for comment links with `adg service install --public-origin=https://design.example.com`.
Use the origin alone, without a project path. The command saves `ADG_PUBLIC_ORIGIN` in the LaunchAgent's
`EnvironmentVariables` and reloads the job when its configuration changes. Later installs keep the existing public
origin, port and state directory when those options are omitted. `adg service status` reports the configured
`publicOrigin`. For a hub started directly with `adg serve`, set `ADG_PUBLIC_ORIGIN` in its environment.

## Verify delivery

1. Confirm the installed runtime files match the milestone package. If the hub restarted, verify a new health ID at its direct-local `/api/health` endpoint and a running service state.
2. Read the existing project list through the direct-local `/api/projects` endpoint. Fetch changed public shell resources through the deployed `/p/<slug>/` routes and compare their bytes with the package. The viewer HTML sets its base to `/p/<slug>/`. For a shared layout update, check each registered project route. Public data endpoints must still return 401 without a key.
3. Reload a deployed viewer in IAB and confirm its designs finish loading and the changed behavior works. Use an existing authenticated session or the direct-local viewer served by the same hub; keep the public resource comparison in either case.
4. Report the installed commit, endpoint result and checks actually run. Include the current and previous successful artifact set paths in the delivery record under the task's run directory. If reinstalling the same set, carry forward the previous successful set from the last delivery record.
5. After successful delivery verification, preview `update_root` and remove the superseded package sets from completed attempts, keeping the verified current and previous successful sets. Preserve active or pending-recovery sets. Move any verification evidence out of a superseded set before removing it.
