# Contributing

Bug reports with a small SVG, the options you used and a screenshot of what went wrong are the most useful thing you can send.

1. Use Node.js 20 or newer and run `npm ci`.
2. Add a small regression test in `test/` for geometry changes.
3. Run `npm run check` and `npm run format:check`.
4. For component changes, run `npm run demo` and check desktop and mobile widths in light and dark mode.
5. If the demo or the splits change visibly, run `npm run capture`.

## Project layout

- `src/xml.ts`, `svg.ts`, `path.ts`, `matrix.ts`: constrained SVG reading, units, transforms, class styles and curve flattening.
- `src/geometry.ts`: Clipper2 helpers, line crossings and label placement.
- `src/joints.ts`: joint shapes and metadata.
- `src/split.ts`: grid choice, seam placement, joints, kerf, pieces, keys and backers.
- `src/pack.ts`: packing parts onto sheets.
- `src/render.ts`, `font.ts`, `zip.ts`: sheet and assembly SVGs, label lettering and downloads.
- `src/index.ts`: the public API. `src/cli.ts`: the command line tool. `src/element.ts`: the web component.
- `demo/`: the demo page, a plain consumer of `dist/element.js`.
- `scripts/`: build, demo server, example signs and image capture.

## Publishing the demo

`npm run build:site` assembles the demo into `site/`. It is published from the `gh-pages` branch.
