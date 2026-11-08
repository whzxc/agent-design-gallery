# Local milestone updates

Update the maintainer's global SDG installation after each completed milestone that changes packaged runtime code, shared viewer tokens or runtime dependencies. Run the relevant checks and obtain required design approvals before committing and updating. Documentation-only, test-only and fixture-only commits skip installation. This workflow runs as part of milestone delivery without another update request; it does not install a Git hook or a scheduled job.

Resolve the serving host, global installation and public endpoint through MAP before operating on a deployment. Keep environment-specific paths and routing knowledge there. A local update installs the committed package directly; public npm publication remains a separate release action. The package version may stay unchanged, so verify runtime contents rather than relying on `sdg --version` alone.

## Pack and install

From the repository root, inspect `git status --short` and the milestone commit. Ensure packaged files match that commit. If unrelated working-tree changes affect the package, pack a temporary export of the commit under `output/` using `git archive`; leave the working tree intact.

```sh
update_dir="$PWD/output/local-update/$(git rev-parse --short HEAD)"
mkdir -p "$update_dir"
npm pack --pack-destination "$update_dir"
npm install --global "$update_dir"/whzxc-svg-design-gallery-*.tgz --prefer-offline --no-audit --no-fund
```

Use the same tarball on the serving host when it differs from the development host. `npm pack` refreshes the packaged token stylesheet. Its file list must contain only `src/`, `public/`, package metadata, README and license. Keep local tarballs and any check output under ignored `output/`.

## Refresh the running service

| Change | Required action after installation |
| --- | --- |
| A consumer's design sources, imported artwork or tokens | Its running viewer watches these files and refreshes affected previews. No SDG installation is needed. |
| Static browser files, including packaged viewer tokens | Reload the browser. |
| `public/assets.js`, `public/layout.js` or `public/selection.js` | Restart the hub to refresh the viewer cache context, then reload the browser. |
| Server, toolkit, package version or runtime dependencies | Restart the hub, then reload the browser. |

On macOS, inspect `sdg service status` and the installed LaunchAgent arguments. When the Node and CLI paths are unchanged, restart the existing job:

```sh
launchctl kickstart -k "gui/$(id -u)/org.svg-design-gallery.hub"
sdg service status
```

If the recorded Node or CLI path changed, reinstall the service with its existing port and state directory. Preserve the registry, access key, preferences and caches. Restarting the hub briefly disconnects its viewer streams; a changed cache context makes the first visit rebuild measured geometry and previews. Independent `sdg open` processes remain running; reopen those sessions separately when they need the updated runtime.

## Verify delivery

1. Confirm the installed runtime files match the milestone package. If the hub restarted, verify a new health ID at its direct-local `/api/health` endpoint and a running service state.
2. Read the existing project list through the direct-local `/api/projects` endpoint. Fetch changed public shell resources through the deployed `/p/<slug>/` routes and compare their bytes with the package. For a shared layout update, check each registered project route. Public data endpoints must still return 401 without a key.
3. Reload a deployed viewer in IAB and confirm its designs finish loading and the changed behavior works. Use an existing authenticated session or the direct-local viewer served by the same hub; keep the public resource comparison in either case.
4. Report the installed commit, endpoint result and checks actually run. Keep verification captures local. A documentation-only follow-up needs no reinstall or service restart.
