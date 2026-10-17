import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import opentype from 'opentype.js';
import { union, FillRule } from 'clipper2-ts';

const font = opentype.parse(
  readFileSync(new URL('./fonts/AlfaSlabOne-Regular.ttf', import.meta.url)).buffer,
);
const f = (n) => +n.toFixed(2);
const poly = (pts) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
const text = (s, cx, baseline, size) => {
  const w = font.getAdvanceWidth(s, size);
  return font.getPath(s, cx - w / 2, baseline, size).toPathData(2);
};
const circle = (cx, cy, r, n = 72) =>
  Array.from({ length: n }, (_, i) => [
    cx + r * Math.cos((2 * Math.PI * i) / n),
    cy + r * Math.sin((2 * Math.PI * i) / n),
  ]);
const star = (cx, cy, R, r = R * 0.45, turn = -90) =>
  Array.from({ length: 10 }, (_, i) => {
    const t = ((turn + i * 36) * Math.PI) / 180,
      k = i % 2 ? r : R;
    return [cx + k * Math.cos(t), cy + k * Math.sin(t)];
  });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n${body.join('\n')}\n</svg>\n`;
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function mountains() {
  const W = 1000,
    H = 420;
  const peaks = [
    [0, 300],
    [80, 215],
    [150, 262],
    [285, 82],
    [372, 190],
    [440, 146],
    [560, 26],
    [672, 168],
    [752, 112],
    [842, 226],
    [925, 150],
    [1000, 248],
  ];
  let ridge = [];
  for (let i = 0; i + 1 < peaks.length; i++) {
    const [x0, y0] = peaks[i],
      [x1, y1] = peaks[i + 1];
    for (let k = 0; k < 6; k++) {
      const t = k / 6,
        j = k ? (rand() - 0.5) * 18 : 0;
      ridge.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + j]);
    }
  }
  ridge.push(peaks[peaks.length - 1]);
  const outline = [[0, H], ...ridge, [W, H]];
  const pine = (x, base, h) => {
    const w = h * 0.42,
      pts = [
        [x - 3, base],
        [x - 3, base - h * 0.12],
      ];
    for (let k = 0; k < 3; k++) {
      const y = base - h * 0.12 - (k * h * 0.88) / 3,
        ww = w * (1 - k * 0.24);
      pts.push([x - ww, y], [x - ww * 0.35, y - h * 0.2]);
    }
    pts.push([x, base - h]);
    const right = pts
      .slice(0, -1)
      .reverse()
      .map(([px, py]) => [2 * x - px, py]);
    return [...pts, ...right];
  };
  const S = 1000;
  const pines = union(
    [
      [120, 395, 70],
      [175, 395, 95],
      [232, 395, 62],
      [790, 395, 84],
      [850, 395, 112],
      [905, 395, 74],
    ].map(([x, b, h]) =>
      pine(x, b, h).map(([px, py]) => ({ x: Math.round(px * S), y: Math.round(py * S) })),
    ),
    FillRule.NonZero,
  ).map((p) => p.map((q) => [q.x / S, q.y / S]));
  const holes = [circle(560, 150, 46), ...pines];
  const snow = [
    [285, 82, 50],
    [560, 26, 60],
    [752, 112, 38],
    [925, 150, 30],
  ].map(
    ([x, y, s]) =>
      `M${x - s} ${y + s * 0.9}L${x - s * 0.45} ${y + s * 0.65}L${x - s * 0.1} ${y + s}L${x + s * 0.3} ${y + s * 0.7}L${x + s * 0.8} ${y + s * 0.95}`,
  );
  return svg(W, H, [
    `<path d="${poly(outline)}${holes.map(poly).join('')}" fill="none" stroke="#ff0000" stroke-width="0.2"/>`,
    `<path d="${snow.join('')}" fill="none" stroke="#000000" stroke-width="0.6"/>`,
  ]);
}

function welcome() {
  const W = 900,
    H = 520;
  const board = `M0 ${H}L0 210A450 210 0 0 1 ${W} 210L${W} ${H}Z`;
  const hang = [circle(170, 150, 6, 32), circle(730, 150, 6, 32)].map(poly).join('');
  const hearts = [[450, 112]]
    .map(
      ([x, y]) =>
        `M${x} ${y + 26}C${x - 44} ${y - 4} ${x - 22} ${y - 34} ${x} ${y - 12}C${x + 22} ${y - 34} ${x + 44} ${y - 4} ${x} ${y + 26}Z`,
    )
    .join('');
  return svg(W, H, [
    `<path d="${board}${hang}${hearts}" fill="none" stroke="#ff0000" stroke-width="0.2"/>`,
    `<path d="${text('WELCOME', W / 2, 330, 118)}" fill="#000000"/>`,
    `<path d="${text('to our home', W / 2, 440, 72)}" fill="#000000"/>`,
  ]);
}

function cloud() {
  const W = 1000,
    S = 1000;
  const bumps = [
    [150, 330, 150],
    [330, 230, 180],
    [540, 190, 200],
    [740, 250, 170],
    [870, 350, 130],
    [500, 360, 220],
  ];
  const shapes = [
    ...bumps.map(([x, y, r]) => circle(x, y, r, 120)),
    [
      [150, 330],
      [870, 330],
      [870, 480],
      [150, 480],
    ],
  ];
  const outline = union(
    shapes.map((p) => p.map(([x, y]) => ({ x: Math.round(x * S), y: Math.round(y * S) }))),
    FillRule.NonZero,
  ).map((p) => p.map((q) => [q.x / S, q.y / S]));
  const ys = outline.flat().map((p) => p[1]);
  const minY = Math.min(...ys) - 10,
    height = Math.ceil(Math.max(...ys) - minY + 10);
  const shift = (pts) => pts.map(([x, y]) => [x, y - minY]);
  const stars = [
    [300, 170, 26],
    [690, 150, 32],
    [820, 260, 20],
    [190, 300, 18],
  ].map(([x, y, r]) => shift(star(x, y, r)));
  return svg(W, height, [
    `<path d="${outline.map((p) => poly(shift(p))).join('')}${stars.map(poly).join('')}" fill="none" stroke="#ff0000" stroke-width="0.2"/>`,
    `<path d="${text('DREAM BIG', 520, 390 - minY, 130)}" fill="#000000"/>`,
    `<path d="${text('little one', 520, 470 - minY, 64)}" fill="#000000"/>`,
  ]);
}

mkdirSync('examples', { recursive: true });
for (const [name, make] of Object.entries({ mountains, welcome, cloud })) {
  writeFileSync(`examples/${name}.svg`, make());
  console.log(`examples/${name}.svg`);
}
