import { textStrokes } from './font.js';
import { apply } from './geometry.js';
import type { Bed, Detail, Matrix, Part, Point, SplitResult } from './types.js';

const fmt = (n: number, precision: number) => {
  const s = n.toFixed(precision);
  return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s;
};

export function pathData(
  polygons: readonly (readonly Point[])[],
  precision = 3,
  closed = true,
): string {
  const f = (n: number) => fmt(n, precision);
  return polygons
    .filter((p) => p.length >= (closed ? 3 : 2))
    .map((p) => 'M' + p.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + (closed ? 'Z' : ''))
    .join('');
}

const moved = (m: Matrix, ps: readonly (readonly Point[])[]) =>
  ps.map((p) => p.map((q) => apply(m, q)));

function detailMarkup(details: readonly Detail[], m: Matrix, precision: number, width: number) {
  const byStyle = new Map<string, Point[][]>();
  for (const d of details) {
    const key = `${d.filled ? 'f' : 's'}${d.color}`;
    if (!byStyle.has(key)) byStyle.set(key, []);
    byStyle.get(key)!.push(d.points.map((q) => apply(m, q)));
  }
  return [...byStyle.entries()].map(([key, ps]) => {
    const filled = key[0] === 'f',
      color = key.slice(1);
    return filled
      ? `<path d="${pathData(ps, precision)}" fill="${color}" stroke="none"/>`
      : `<path d="${pathData(ps, precision, false)}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
  });
}

function labelPaths(part: Part, m: Matrix, precision: number) {
  if (!part.labelSize) return '';
  return pathData(textStrokes(part.id, apply(m, part.labelAt), part.labelSize), precision, false);
}

/** One laser-ready sheet: red hairline cuts, original engraving colours, blue labels. */
export function sheetSvg(
  parts: readonly Part[],
  bed: Bed,
  index: number,
  labels: boolean,
  precision: number,
): string {
  const f = (n: number) => fmt(n, precision);
  const cut = parts.map(
    (p) =>
      `    <path id="cut-${p.id}" d="${pathData(moved(p.placement, p.polygons), precision)}"/>`,
  );
  const engrave = parts.flatMap((p) =>
    detailMarkup(p.details, p.placement, precision, 0.1).map((s) => '    ' + s),
  );
  const text = labels
    ? parts
        .map((p) => labelPaths(p, p.placement, precision))
        .filter(Boolean)
        .map((d) => `    <path d="${d}"/>`)
    : [];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(bed.width)}mm" height="${f(bed.height)}mm" viewBox="0 0 ${f(bed.width)} ${f(bed.height)}">`,
    `  <title>Sheet ${index + 1}: ${parts.map((p) => p.id).join(', ')}</title>`,
    engrave.length ? `  <g id="engrave">\n${engrave.join('\n')}\n  </g>` : '',
    text.length
      ? `  <g id="labels" fill="none" stroke="#0000ff" stroke-width="0.1" stroke-linecap="round" stroke-linejoin="round">\n${text.join('\n')}\n  </g>`
      : '',
    `  <g id="cut" fill="none" stroke="#ff0000" stroke-width="0.1" fill-rule="evenodd">\n${cut.join('\n')}\n  </g>`,
    '</svg>',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

const WOOD = ['#f2d7ae', '#e6c08c', '#f6e2c3', '#ddb57d'];

export interface AssemblyOptions {
  precision?: number;
  /** Gap added between neighbouring pieces in mm. Default scales with the design. */
  gap?: number;
  /** Draw part names. Default true. */
  labels?: boolean;
  /** Draw backer strips as dashed outlines. Default true. */
  backers?: boolean;
}

/** Translation that spreads the assembly apart so every piece reads on its own. */
export function explodeOffset(result: SplitResult, at: Point, gap: number): Point {
  const shift = (seams: number[], v: number) => {
    let n = 0,
      on = false;
    for (const s of seams) {
      if (s < v - 0.5) n++;
      else if (Math.abs(s - v) <= 0.5) on = true;
    }
    return (n + (on ? 0.5 : 0)) * gap;
  };
  return [shift(result.seams.x, at[0]), shift(result.seams.y, at[1])];
}

export function assemblyGap(result: Pick<SplitResult, 'width' | 'height'>) {
  return Math.min(14, Math.max(3, Math.max(result.width, result.height) / 110));
}

/** The finished design with every part in place and spread slightly apart. */
export function assemblySvg(result: SplitResult, options: AssemblyOptions = {}): string {
  const precision = options.precision ?? 2,
    gap = options.gap ?? assemblyGap(result),
    f = (n: number) => fmt(n, precision);
  const W = result.width + result.seams.x.length * gap,
    H = result.height + result.seams.y.length * gap,
    m = Math.max(W, H) * 0.02,
    stroke = Math.max(0.3, Math.max(W, H) / 900);
  const body: string[] = [];
  const ordered = [...result.parts].sort(
    (a, b) => (a.kind === 'backer' ? 0 : 1) - (b.kind === 'backer' ? 0 : 1),
  );
  for (const part of ordered) {
    if (part.kind === 'backer' && options.backers === false) continue;
    const anchor: Point =
      part.kind === 'piece'
        ? [part.labelAt[0], part.labelAt[1]]
        : [part.bounds.x + part.bounds.width / 2, part.bounds.y + part.bounds.height / 2];
    const [tx, ty] =
      part.kind === 'piece' && part.column !== undefined && part.row !== undefined
        ? [part.column * gap, part.row * gap]
        : explodeOffset(result, anchor, gap);
    const t: Matrix = [1, 0, 0, 1, tx, ty];
    const d = pathData(moved(t, part.polygons), precision);
    const fill =
      part.kind === 'key'
        ? '#8a5a36'
        : part.kind === 'backer'
          ? 'none'
          : WOOD[((part.column ?? 0) + 2 * (part.row ?? 0)) % WOOD.length];
    const dash =
      part.kind === 'backer' ? ` stroke-dasharray="${f(stroke * 4)} ${f(stroke * 3)}"` : '';
    const lines = [
      `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${part.kind === 'backer' ? '#5e7894' : '#5b3a1e'}" stroke-width="${f(stroke)}"${dash}/>`,
      ...detailMarkup(part.details, t, precision, +f(stroke)),
    ];
    if (options.labels !== false && part.labelSize && part.kind !== 'backer')
      lines.push(
        `<path d="${labelPaths(part, t, precision)}" fill="none" stroke="${part.kind === 'key' ? '#fff4e6' : '#2148c0'}" stroke-width="${f(Math.max(stroke, part.labelSize / 9))}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    body.push(`  <g data-part="${part.id}" data-kind="${part.kind}">${lines.join('')}</g>`);
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W + 2 * m)}mm" height="${f(H + 2 * m)}mm" viewBox="${f(-m)} ${f(-m)} ${f(W + 2 * m)} ${f(H + 2 * m)}">`,
    `  <title>Assembly: ${result.parts.filter((p) => p.kind === 'piece').length} pieces on ${result.sheets.length} sheets</title>`,
    ...body,
    '</svg>',
    '',
  ].join('\n');
}
