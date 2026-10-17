import {
  Clipper64,
  ClipType,
  difference,
  EndType,
  FillRule,
  inflatePaths,
  intersect,
  JoinType,
  union,
  type Path64,
  type Paths64,
} from 'clipper2-ts';
import type { Bounds, Matrix, Point } from './types.js';

/** 0.1 µm integer grid for Clipper. */
export const SCALE = 10_000;

export const toPath = (p: readonly Point[]): Path64 =>
  p.map(([x, y]) => ({ x: Math.round(x * SCALE), y: Math.round(y * SCALE) }));
export const toPaths = (ps: readonly (readonly Point[])[]): Paths64 => ps.map(toPath);
export const fromPath = (p: Path64): Point[] => p.map((q) => [q.x / SCALE, q.y / SCALE] as const);
export const fromPaths = (ps: Paths64): Point[][] => ps.map(fromPath);

export function unite(ps: readonly (readonly Point[])[], evenOdd = false): Point[][] {
  return fromPaths(union(toPaths(ps), evenOdd ? FillRule.EvenOdd : FillRule.NonZero));
}
const boxes = new WeakMap<readonly Point[], Bounds>();
const boxOf = (p: readonly Point[]) => {
  let b = boxes.get(p);
  if (!b) boxes.set(p, (b = boundsOf(p)));
  return b;
};
/** Contours whose bounding boxes touch the bounding box of `region`. */
export function near(polys: readonly (readonly Point[])[], region: readonly (readonly Point[])[]) {
  const r = boundsOf(region.flat());
  return polys.filter((p) => {
    const b = boxOf(p);
    return (
      b.x <= r.x + r.width && b.x + b.width >= r.x && b.y <= r.y + r.height && b.y + b.height >= r.y
    );
  });
}
export function clip(a: readonly (readonly Point[])[], b: readonly (readonly Point[])[]) {
  const subject = near(a, b);
  if (!subject.length) return [];
  return fromPaths(intersect(toPaths(subject), toPaths(b), FillRule.NonZero));
}
export function subtract(a: readonly (readonly Point[])[], b: readonly (readonly Point[])[]) {
  const cutter = near(b, a);
  if (!cutter.length) return unite(a);
  return fromPaths(difference(toPaths(a), toPaths(cutter), FillRule.NonZero));
}
export function offset(ps: readonly (readonly Point[])[], delta: number, round = false) {
  if (!delta) return unite(ps);
  return fromPaths(
    inflatePaths(
      toPaths(ps),
      delta * SCALE,
      round ? JoinType.Round : JoinType.Miter,
      EndType.Polygon,
      4,
      0.01 * SCALE,
    ),
  );
}
/** Outline of open polylines drawn with a round pen of the given half-width. */
export function strokeOutline(lines: readonly (readonly Point[])[], half: number) {
  return fromPaths(
    inflatePaths(toPaths(lines), half * SCALE, JoinType.Round, EndType.Round, 2, 0.05 * SCALE),
  );
}
/** Clip open polylines to a region. */
export function clipLines(
  lines: readonly (readonly Point[])[],
  region: readonly (readonly Point[])[],
) {
  const c = new Clipper64(),
    closed: Paths64 = [],
    open: Paths64 = [];
  c.addOpenSubject(toPaths(lines));
  c.addClip(toPaths(region));
  c.execute(ClipType.Intersection, FillRule.NonZero, closed, open);
  return fromPaths(open);
}

export function area(p: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
export const totalArea = (ps: readonly (readonly Point[])[]) => ps.reduce((n, p) => n + area(p), 0);

export function boundsOf(points: readonly Point[]): Bounds {
  let x = Infinity,
    y = Infinity,
    r = -Infinity,
    b = -Infinity;
  for (const p of points) {
    if (p[0] < x) x = p[0];
    if (p[1] < y) y = p[1];
    if (p[0] > r) r = p[0];
    if (p[1] > b) b = p[1];
  }
  return points.length
    ? { x, y, width: r - x, height: b - y }
    : { x: 0, y: 0, width: 0, height: 0 };
}

export const apply = (m: Matrix, [x, y]: Point): Point => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Group contours into outer outlines, each with the holes inside it. */
export function components(polygons: readonly Point[][]): Point[][][] {
  const outers = polygons.filter((p) => area(p) > 0).map((p) => [p]);
  const holes = polygons.filter((p) => area(p) < 0);
  if (!outers.length) return holes.length ? [holes] : [];
  for (const hole of holes) {
    const probe = hole[0];
    let best = outers[0],
      bestArea = Infinity;
    for (const group of outers) {
      const a = area(group[0]);
      if (a < bestArea && inside(probe, group[0])) {
        best = group;
        bestArea = a;
      }
    }
    best.push(hole);
  }
  return outers;
}

export function inside([x, y]: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i],
      [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Distance from a point to the nearest contour edge. */
export function edgeDistance([x, y]: Point, polygons: readonly (readonly Point[])[]): number {
  let best = Infinity;
  for (const poly of polygons)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j],
        [bx, by] = poly[i],
        dx = bx - ax,
        dy = by - ay,
        l = dx * dx + dy * dy,
        t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0,
        d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
      if (d < best) best = d;
    }
  return best;
}

/** Point well inside a region, far from its edges: a coarse grid refined around the best cell. */
export function labelPoint(polygons: readonly Point[][]): { at: Point; clearance: number } {
  const b = boundsOf(polygons.flat());
  const solid = (p: Point) =>
    polygons.reduce((n, poly) => n + (inside(p, poly) ? 1 : 0), 0) % 2 === 1;
  let at: Point = [b.x + b.width / 2, b.y + b.height / 2],
    clearance = -1,
    cx = at[0],
    cy = at[1],
    hx = b.width / 2,
    hy = b.height / 2,
    n = 12;
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i <= n; i++)
      for (let k = 0; k <= n; k++) {
        const p: Point = [cx - hx + (2 * hx * i) / n, cy - hy + (2 * hy * k) / n];
        if (!solid(p)) continue;
        const d = edgeDistance(p, polygons);
        if (d > clearance) {
          clearance = d;
          at = p;
        }
      }
    cx = at[0];
    cy = at[1];
    hx = ((hx * 2) / n) * 1.5;
    hy = ((hy * 2) / n) * 1.5;
    n = 6;
  }
  return { at, clearance: Math.max(0, clearance) };
}

/**
 * Where a straight line crosses solid material. The line runs along u at a fixed
 * coordinate: x = at for axis 'x' (u is y), y = at for axis 'y' (u is x).
 */
export function spans(
  polygons: readonly (readonly Point[])[],
  axis: 'x' | 'y',
  at: number,
): Array<[number, number]> {
  const a = axis === 'x' ? 0 : 1,
    u = 1 - a,
    hits: number[] = [];
  for (const poly of polygons)
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = poly[j],
        q = poly[i];
      if (p[a] <= at === q[a] <= at) continue;
      hits.push(p[u] + ((at - p[a]) * (q[u] - p[u])) / (q[a] - p[a]));
    }
  hits.sort((m, n) => m - n);
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

/** Answers many spans() queries along one axis quickly by bucketing edges. */
export class LineIndex {
  private readonly lo: number;
  private readonly step: number;
  private readonly buckets: Float64Array[];
  constructor(
    polygons: readonly (readonly Point[])[],
    readonly axis: 'x' | 'y',
    private readonly count = 1024,
  ) {
    const a = axis === 'x' ? 0 : 1;
    let lo = Infinity,
      hi = -Infinity;
    for (const poly of polygons)
      for (const p of poly) {
        if (p[a] < lo) lo = p[a];
        if (p[a] > hi) hi = p[a];
      }
    this.lo = lo;
    this.step = Math.max((hi - lo) / count, 1e-9);
    const lists: number[][] = Array.from({ length: count }, () => []);
    for (const poly of polygons)
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const p = poly[j],
          q = poly[i],
          b0 = this.bucket(Math.min(p[a], q[a])),
          b1 = this.bucket(Math.max(p[a], q[a]));
        for (let b = b0; b <= b1; b++) lists[b].push(p[0], p[1], q[0], q[1]);
      }
    this.buckets = lists.map((l) => Float64Array.from(l));
  }
  private bucket(v: number) {
    return Math.max(0, Math.min(this.count - 1, Math.floor((v - this.lo) / this.step)));
  }
  spans(at: number): Array<[number, number]> {
    const a = this.axis === 'x' ? 0 : 1,
      u = 1 - a,
      hits: number[] = [];
    if (at < this.lo || at > this.lo + this.step * this.count) return [];
    const e = this.buckets[this.bucket(at)];
    for (let k = 0; k < e.length; k += 4) {
      const pa = e[k + a],
        qa = e[k + 2 + a];
      if (pa <= at === qa <= at) continue;
      const pu = e[k + u],
        qu = e[k + 2 + u];
      hits.push(pu + ((at - pa) * (qu - pu)) / (qa - pa));
    }
    hits.sort((m, n) => m - n);
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
    return out;
  }
}

export function overlap(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0,
    j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]),
      hi = Math.min(a[i][1], b[j][1]);
    if (hi > lo) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}
