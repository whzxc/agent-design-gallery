# ARC sample

The 51 TSX sources and their tokens, scene modules, artwork and TypeScript configuration are copied unchanged from [agent-remote-control](https://github.com/whzxc/agent-remote-control) at commit `b9e18beb`, under its MIT license. The copy lives in `design/`; generated `.adg/` and `output/` content is excluded.

`design/gallery.json` retains the four curated groups and their source order, with TSX paths. The remaining 14 components and 12 surfaces appear in directory groups. The viewer lays out 94 artboards across six sections. `../arc-sample.layout.json` records the measured forms and reference world layout.

After replacing the snapshot, run `node fixtures/refresh-arc-scenes.mjs` from the ADG root. It reads only this fixture, regenerates the layout reference, updates ADG's surface data and writes light/dark PNG previews at twice their largest displayed scale (capped at 4096 pixels). It captures only canvas content and chrome placement; controls remain authored components. Review both themes and run the fixture comparisons after regeneration.

The dedicated legacy SVG viewer sample is `../legacy-svg/`. Neither fixture nor preview artwork is included in the npm package.
