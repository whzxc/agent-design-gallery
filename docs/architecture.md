# Architecture

`src/cli.mjs` starts an HTTP server on loopback, prints the URL, and opens the default browser. `src/server.mjs` reads an explicitly opened directory, serves SVGs, watches file changes, and persists local preferences. `public/` contains the standalone viewer. Installation supplies one shared CLI version across projects.

The viewer retains ARC's grouped spatial layout, pointer-anchored camera, focus/overview navigation, and theme presentation. Camera updates are coalesced into one animation frame. A Canvas 2D surface draws only visible groups and assets. During gestures it draws cached preview rasters; when settled it upgrades previews or draws the original SVG for detail. This avoids rebuilding a React tree or mounting large inline SVG trees on each input event. Accessible controls expose module and asset selection alongside the visual canvas.

SVGs load as images, preserving document-local CSS, identifiers, and filters. They are not injected into the viewer DOM. Local SVG references are embedded recursively; their dependencies participate in cache invalidation. File versions are per asset. An update invalidates the changed file and known dependents, then sends an SSE notification. The camera belongs to the directory and survives asset changes.

The local service reads assets and writes only its preferences. Asset paths come from the scanned directory; symlinks are not scanned. Open-directory, preferences, and reveal operations reject requests from another web origin. The service binds only to `127.0.0.1`.

This application is a viewer. Editing, Git history, design conventions, tokens, and asset approval remain with the owning project and workflow. It has no ARC runtime dependency, account system, collaborative state, or asset import database.
