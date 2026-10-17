# Changelog

## 0.1.0

First release.

- `splitSvg` and `splitPolygons`: fewest pieces that fit the bed, seam placement that avoids slivers and artwork, kerf and clearance compensation, sheet packing with rotation, and an assembly map.
- Eleven joints: puzzle, dovetail, heart, arrow, star, butterfly key, wave, zigzag, finger, scallop and straight, plus optional backer strips.
- Joints checked across their full footprint, moved or flipped away from engraved artwork.
- Piece labels in a built-in single-line font on their own layer.
- `<laser-split>` web component with drag-to-move seams, sheet previews, zip download, theming and host events.
- `laser-split` CLI with JSON reports.
