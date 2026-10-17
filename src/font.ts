import type { Point } from './types.js';

/** Single-line glyphs on a 4 x 6 grid, y down, drawn for this package: "x y,x y|x y,x y". */
const SOURCE: Record<string, string> = {
  '0': '1 0,3 0,4 1,4 5,3 6,1 6,0 5,0 1,1 0|4 1,0 5',
  '1': '1 1,2 0,2 6|1 6,3 6',
  '2': '0 1,1 0,3 0,4 1,4 2,0 6,4 6',
  '3': '0 1,1 0,3 0,4 1,4 2,3 3,4 4,4 5,3 6,1 6,0 5|1.5 3,3 3',
  '4': '3 6,3 0,0 4,4 4',
  '5': '4 0,0 0,0 3,3 3,4 4,4 5,3 6,0 6',
  '6': '4 1,3 0,1 0,0 1,0 5,1 6,3 6,4 5,4 4,3 3,0 3',
  '7': '0 0,4 0,1.5 6',
  '8': '3 3,1 3,0 2,0 1,1 0,3 0,4 1,4 2,3 3,4 4,4 5,3 6,1 6,0 5,0 4,1 3',
  '9': '4 3,1 3,0 2,0 1,1 0,3 0,4 1,4 5,3 6,1 6,0 5',
  A: '0 6,0 2,2 0,4 2,4 6|0 3.5,4 3.5',
  B: '0 3,0 0,3 0,4 1,4 2,3 3,0 3,0 6,3 6,4 5,4 4,3 3',
  C: '4 1,3 0,1 0,0 1,0 5,1 6,3 6,4 5',
  D: '0 0,0 6,2.5 6,4 4.5,4 1.5,2.5 0,0 0',
  E: '4 0,0 0,0 6,4 6|0 3,3 3',
  F: '4 0,0 0,0 6|0 3,3 3',
  G: '4 1,3 0,1 0,0 1,0 5,1 6,3 6,4 5,4 3.5,2.5 3.5',
  H: '0 0,0 6|4 0,4 6|0 3,4 3',
  I: '1 0,3 0|2 0,2 6|1 6,3 6',
  J: '4 0,4 5,3 6,1 6,0 5',
  K: '0 0,0 6|4 0,0 4|1.4 2.6,4 6',
  L: '0 0,0 6,4 6',
  M: '0 6,0 0,2 3,4 0,4 6',
  N: '0 6,0 0,4 6,4 0',
  O: '1 0,3 0,4 1,4 5,3 6,1 6,0 5,0 1,1 0',
  P: '0 6,0 0,3 0,4 1,4 2,3 3,0 3',
  Q: '1 0,3 0,4 1,4 5,3 6,1 6,0 5,0 1,1 0|2.5 4.5,4 6',
  R: '0 6,0 0,3 0,4 1,4 2,3 3,0 3|2 3,4 6',
  S: '4 1,3 0,1 0,0 1,0 2,1 3,3 3,4 4,4 5,3 6,1 6,0 5',
  T: '0 0,4 0|2 0,2 6',
  U: '0 0,0 5,1 6,3 6,4 5,4 0',
  V: '0 0,2 6,4 0',
  W: '0 0,1 6,2 3,3 6,4 0',
  X: '0 0,4 6|4 0,0 6',
  Y: '0 0,2 3,4 0|2 3,2 6',
  Z: '0 0,4 0,0 6,4 6',
  '-': '1 3,3 3',
  '.': '1.7 5.4,2.3 5.4,2.3 6,1.7 6,1.7 5.4',
};
const GLYPHS: Record<string, number[][][]> = Object.fromEntries(
  Object.entries(SOURCE).map(([ch, d]) => [
    ch,
    d.split('|').map((s) => s.split(',').map((p) => p.split(' ').map(Number))),
  ]),
);

/** Text as single-line strokes, centred on a point, with capital height `size` in mm. */
export function textStrokes(text: string, center: Point, size: number): Point[][] {
  const k = size / 6,
    advance = 6,
    chars = [...text.toUpperCase()],
    width = (chars.length * advance - 2) * k,
    x0 = center[0] - width / 2,
    y0 = center[1] - size / 2,
    out: Point[][] = [];
  chars.forEach((ch, i) => {
    for (const stroke of GLYPHS[ch] ?? [])
      out.push(stroke.map(([x, y]) => [x0 + (i * advance + x) * k, y0 + y * k] as Point));
  });
  return out;
}

/** Width in mm of text drawn at capital height `size`. */
export const textWidth = (text: string, size: number) => ((text.length * 6 - 2) * size) / 6;
