import { resolveBed } from './beds.js';
import { textWidth } from './font.js';
import {
  area,
  boundsOf,
  clip,
  clipLines,
  components,
  labelPoint,
  offset,
  overlap,
  LineIndex,
  rect,
  spans,
  strokeOutline,
  subtract,
  totalArea,
  unite,
} from './geometry.js';
import { edgeProfile, jointInfo, keyShape, tabProfile } from './joints.js';
import { pack } from './pack.js';
import { assemblySvg, sheetSvg } from './render.js';
import {
  SplitError,
  type Bed,
  type Detail,
  type Issue,
  type Joint,
  type JointInfo,
  type JointType,
  type Matrix,
  type Part,
  type Point,
  type Seams,
  type SplitOptions,
  type SplitResult,
} from './types.js';

/** Artwork in finished millimetres with its top-left corner at the origin. */
export interface Artwork {
  material: Point[][];
  details: Detail[];
  width: number;
  height: number;
  scale: number;
}

interface Settings {
  bed: Bed;
  margin: number;
  spacing: number;
  rotate: boolean;
  joint: JointInfo;
  size: number;
  depth: number;
  jointSpacing: number;
  kerf: number;
  clearance: number;
  delta: number;
  backers: number;
  labels: boolean;
  precision: number;
  /** How far a seam's shapes reach past the seam line, plus fit allowance. */
  reach: number;
}

const PAD = 1;
const WALL_MIN = 3;

function num(value: unknown, name: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new SplitError('INVALID_OPTIONS', `${name} must be a number from ${min} to ${max}.`);
  return value;
}

export function settings(options: SplitOptions): Settings {
  const bed = resolveBed(options.bed);
  const margin = num(options.margin, 'margin', 0, 100, 5);
  const usable = Math.min(bed.width, bed.height) - 2 * margin;
  if (usable < 20)
    throw new SplitError('INVALID_OPTIONS', 'The margin leaves less than 20 mm of usable bed.');
  const joint = jointInfo(options.joint ?? 'puzzle');
  if (!joint) throw new SplitError('INVALID_OPTIONS', `Unknown joint ${options.joint}.`);
  const size = num(
    options.jointSize,
    'jointSize',
    4,
    usable / 2,
    Math.round(Math.min(70, Math.max(12, usable * 0.14))),
  );
  const kerf = num(options.kerf, 'kerf', 0, 2, 0.15),
    clearance = num(options.clearance, 'clearance', 0, 2, 0.1),
    delta = (kerf - clearance) / 2;
  const depth = size * joint.aspect;
  const reach =
    (joint.kind === 'tab' ? depth : joint.kind === 'edge' ? depth / 2 : 0) +
    Math.max(0, delta) +
    0.5;
  const precision = num(options.precision, 'precision', 1, 8, 3);
  if (!Number.isInteger(precision))
    throw new SplitError('INVALID_OPTIONS', 'precision must be an integer from 1 to 8.');
  return {
    bed,
    margin,
    spacing: num(options.spacing, 'spacing', 0, 100, 3),
    rotate: options.rotate ?? true,
    joint,
    size,
    depth,
    jointSpacing: num(options.jointSpacing, 'jointSpacing', size, 10000, size * 4),
    kerf,
    clearance,
    delta,
    backers: num(options.backers, 'backers', 0, usable / 2, 0),
    labels: options.labels ?? true,
    precision,
    reach,
  };
}

const rowName = (j: number): string =>
  (j >= 26 ? rowName(Math.floor(j / 26) - 1) : '') + String.fromCharCode(65 + (j % 26));

/** Largest cell sizes along one axis: the first, the inner ones and the last. */
interface Limits {
  bed: number;
  first: number;
  inner: number;
  last: number;
}

/**
 * Tabs on a seam all point the same way, so a cell carries tabs on one side only. Repeating
 * edges reach into both neighbours.
 */
function limitsFor(bed: number, reach: number, oneSided: boolean): Limits {
  return oneSided
    ? { bed, first: bed - reach, inner: bed - reach, last: bed }
    : { bed, first: bed - reach, inner: bed - 2 * reach, last: bed - reach };
}

const cellMax = (lim: Limits, k: number, count: number) =>
  count === 1 ? lim.bed : k === 0 ? lim.first : k === count - 1 ? lim.last : lim.inner;

/** Fewest cells that cover a length within the limits. */
function cellsFor(length: number, lim: Limits): number {
  if (length <= lim.bed) return 1;
  if (lim.inner <= 1) return Infinity;
  if (length <= lim.first + lim.last) return 2;
  return 2 + Math.ceil((length - lim.first - lim.last) / lim.inner);
}

/** Solid material, and the artwork a seam should stay out of. */
export interface Field {
  material: Point[][];
  ink: Point[][];
  lines: Record<'x' | 'y', { material: LineIndex; ink: LineIndex }>;
}

function makeField(material: Point[][], ink: Point[][]): Field {
  const index = (axis: 'x' | 'y') => ({
    material: new LineIndex(material, axis),
    ink: new LineIndex(ink, axis),
  });
  return { material, ink, lines: { x: index('x'), y: index('y') } };
}

const crossings = (list: Array<[number, number]>) => list.length;

/** How unsuitable a seam position is: thin crossings, nearby edges, and artwork it cuts through. */
function seamCost(field: Field, axis: 'x' | 'y', at: number, minSpan: number): number {
  const { material, ink } = field.lines[axis];
  const here = material.spans(at);
  let cost = 0;
  for (const [a, b] of here) {
    const len = b - a;
    if (len < minSpan) cost += len < 3 ? 12 : 6 + 6 * (1 - len / minSpan);
  }
  const n = crossings(here);
  cost += 8 * Math.max(0, n - 1);
  for (const d of [0.75, 1.5, 3, 5, 8])
    if (crossings(material.spans(at - d)) !== n || crossings(material.spans(at + d)) !== n)
      cost += 6 / (1 + d);
  if (field.ink.length) for (const [a, b] of ink.spans(at)) cost += 2 + (b - a) * 0.15;
  return cost;
}

/** Choose seam positions that keep every cell within the limit and cross material cleanly. */
function placeSeams(
  field: Field,
  axis: 'x' | 'y',
  length: number,
  count: number,
  lim: Limits,
  minSpan: number,
): number[] {
  if (count <= 1) return [];
  const n = count - 1,
    { inner, first, last } = lim,
    step = Math.max(0.5, length / 500),
    candidates: number[] = [];
  for (let s = step; s < length - step / 2; s += step) candidates.push(s);
  const even = (k: number) => (length * (k + 1)) / count;
  const base = candidates.map((s) => seamCost(field, axis, s, minSpan));
  const m = candidates.length,
    INF = Infinity;
  let prev = new Float64Array(m).fill(INF);
  const back: Int32Array[] = [];
  const avg = length / count;
  const uneven = (w: number) => 30 * ((w - avg) / avg) ** 2 + (w < avg * 0.35 ? 20 : 0);
  for (let p = 0; p < m; p++) if (candidates[p] <= first) prev[p] = base[p] + uneven(candidates[p]);
  back.push(new Int32Array(m).fill(-1));
  for (let k = 1; k < n; k++) {
    const next = new Float64Array(m).fill(INF),
      from = new Int32Array(m).fill(-1);
    let lo = 0;
    for (let p = 0; p < m; p++) {
      while (lo < p && candidates[p] - candidates[lo] > inner) lo++;
      let best = INF,
        arg = -1;
      for (let q = lo; q < p; q++) {
        if (candidates[p] - candidates[q] < Math.min(inner, 10)) break;
        const v = prev[q] + uneven(candidates[p] - candidates[q]);
        if (v < best) {
          best = v;
          arg = q;
        }
      }
      if (arg >= 0) {
        next[p] = best + base[p];
        from[p] = arg;
      }
    }
    prev = next;
    back.push(from);
  }
  let end = -1,
    best = INF;
  for (let p = 0; p < m; p++)
    if (length - candidates[p] <= last && prev[p] + uneven(length - candidates[p]) < best) {
      best = prev[p] + uneven(length - candidates[p]);
      end = p;
    }
  if (end < 0) return Array.from({ length: n }, (_, k) => even(k));
  const out: number[] = new Array(n);
  for (let k = n - 1; k >= 0; k--) {
    out[k] = candidates[end];
    end = back[k][end];
  }
  return out;
}

function seamLimits(seams: number[], length: number, lim: Limits): Array<[number, number]> {
  const cell = (k: number) => cellMax(lim, k, seams.length + 1);
  return seams.map((s, k) => {
    const left = k === 0 ? 0 : seams[k - 1],
      right = k === seams.length - 1 ? length : seams[k + 1];
    const lo = Math.max(left + 5, right - cell(k + 1)),
      hi = Math.min(right - 5, left + cell(k));
    return [Math.min(lo, s), Math.max(hi, s)];
  });
}

interface Feature {
  u: number;
  points: Array<[number, number]>;
}

interface SeamLine {
  axis: 'x' | 'y';
  at: number;
  /** Polyline per segment between crossings, in world coordinates. */
  segments: Point[][];
}

/** Build one seam: segments between the crossing seams, with joints placed along them. */
function buildSeam(
  field: Field,
  axis: 'x' | 'y',
  at: number,
  cuts: number[],
  s: Settings,
  canFlip: boolean,
  joints: Joint[],
  keys: Point[][],
  issues: Issue[],
): SeamLine {
  const { joint, reach } = s;
  const world = (u: number, v: number): Point => (axis === 'x' ? [at + v, u] : [u, at + v]);
  const segments: Point[][] = [];
  let side: 1 | -1 = 1;
  const band = (lo: number, hi: number, v0: number, v1: number) =>
    axis === 'x' ? rect(at + v0, lo, v1 - v0, hi - lo) : rect(lo, at + v0, hi - lo, v1 - v0);
  const R = s.depth + Math.max(WALL_MIN, s.size * 0.15) + 10;
  const strip = [band(cuts[0] - 1, cuts[cuts.length - 1] + 1, -R, R)];
  const material = clip(field.material, strip),
    ink = field.ink.length ? clip(field.ink, strip) : [];
  const fits = (lo: number, hi: number, v0: number, v1: number) => {
    const box = band(lo, hi, v0, v1);
    return totalArea(subtract([box], material)) < 0.02 * (hi - lo) * (v1 - v0) + 0.05;
  };
  const clean = (lo: number, hi: number, v0: number, v1: number) =>
    !ink.length || totalArea(clip([band(lo, hi, v0, v1)], ink)) < 0.5;
  const base = spans(material, axis, at);
  for (let j = 0; j + 1 < cuts.length; j++) {
    const start = cuts[j],
      end = cuts[j + 1],
      lo = start + (j === 0 ? 0 : reach + 1),
      hi = end - (j + 1 === cuts.length - 1 ? 0 : reach + 1);
    const features: Feature[] = [];
    const runs = overlap(base, [[lo, hi]]);
    if (joint.kind === 'tab' || joint.kind === 'key') {
      for (const [a, b] of runs) {
        let placed = 0;
        const crossing = b - a;
        for (const shrink of [1, 0.75, 0.55]) {
          const w = s.size * shrink,
            d = s.depth * shrink,
            wall = Math.max(WALL_MIN, w * 0.15),
            avail = crossing - 2 * wall;
          if (avail < w || w < 6) continue;
          let n = Math.max(1, Math.round(avail / s.jointSpacing));
          while (n > 1 && n * w * 1.8 > avail) n--;
          for (let i = 0; i < n; i++) {
            const ideal = a + (crossing * (i + 0.5)) / n,
              reachOut = crossing / n / 2 - w / 2;
            const shifts = [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5, 0.75, -0.75, 1, -1, 1.5, -1.5]
              .map((t) => t * w)
              .filter((t) => Math.abs(t) <= Math.max(reachOut, 0.5 * w));
            const reachV = (dir: 1 | -1): [number, number] =>
              joint.kind === 'key'
                ? [-d - wall, d + wall]
                : [Math.min(0, dir * d) - wall, Math.max(0, dir * d) + wall];
            const at = (t: number) =>
              Math.min(b - wall - w / 2, Math.max(a + wall + w / 2, ideal + t));
            const options: Array<{ t: number; dir: 1 | -1 }> = [];
            for (const dir of (joint.kind === 'tab' && canFlip ? [1, -1] : [1]) as Array<1 | -1>)
              for (const t of shifts) options.push({ t, dir });
            const box = (o: { t: number; dir: 1 | -1 }) =>
              [at(o.t) - w / 2 - wall, at(o.t) + w / 2 + wall, ...reachV(o.dir)] as const;
            const shape = (o: { t: number; dir: 1 | -1 }) =>
              joint.kind === 'key'
                ? ([at(o.t) - w / 2 - 1, at(o.t) + w / 2 + 1, -d - 1, d + 1] as const)
                : ([
                    at(o.t) - w / 2 - 1,
                    at(o.t) + w / 2 + 1,
                    Math.min(0, o.dir * d) - 1,
                    Math.max(0, o.dir * d) + 1,
                  ] as const);
            const ok = options.filter((o) => fits(...box(o)));
            const pick = ok.find((o) => clean(...shape(o))) ?? ok.find((o) => o.dir === 1);
            for (const o of pick ? [pick] : []) {
              const c = at(o.t);
              side = o.dir;
              if (joint.kind === 'tab') {
                features.push({
                  u: c,
                  points: tabProfile(joint.id).map(([pu, pv]) => [c + pu * w, side * pv * d]),
                });
              } else {
                keys.push(keyShape().map(([pu, pv]) => world(c + pu * w, pv * d)));
              }
              joints.push({
                type: joint.id,
                seam: axis,
                center: world(c, 0),
                width: w,
                depth: d,
                side,
              });
              placed++;
            }
          }
          if (placed) {
            if (shrink < 1)
              issues.push({
                code: 'SMALL_JOINT',
                message: `A crossing ${crossing.toFixed(0)} mm long only fits a smaller joint (${w.toFixed(0)} mm).`,
                at: world((a + b) / 2, 0),
              });
            break;
          }
        }
        if (!placed && crossing >= 2)
          issues.push({
            code: 'NO_JOINT',
            message: `A ${crossing.toFixed(0)} mm crossing has no room for a joint. Glue it or add backer strips.`,
            at: world((a + b) / 2, 0),
          });
      }
    } else if (joint.kind === 'edge') {
      const h = s.depth / 2,
        e = 1.5;
      let ok = runs;
      for (const v of [-h - e, -h / 2, h / 2, h + e])
        ok = overlap(ok, spans(material, axis, at + v));
      for (const [a0, b0] of ok) {
        const m = Math.max(WALL_MIN, s.size * 0.25),
          a = a0 + m,
          b = b0 - m;
        if (b - a < s.size * 0.75) continue;
        if (!fits(a, b, -h - e, h + e)) continue;
        if (!clean(a, b, -h - e, h + e)) continue;
        features.push({
          u: a,
          points: edgeProfile(joint.id, b - a, s.size, s.depth).map(([pu, pv]) => [
            a + pu,
            side * pv,
          ]),
        });
        joints.push({
          type: joint.id,
          seam: axis,
          center: world((a + b) / 2, 0),
          width: s.size,
          depth: s.depth,
          side,
          length: b - a,
        });
        side = side === 1 ? -1 : 1;
      }
      for (const [a, b] of runs)
        if (b - a >= 2 && !ok.some(([p, q]) => q > a && p < b && q - p >= s.size * 0.75 + 6))
          issues.push({
            code: 'NO_JOINT',
            message: `A ${(b - a).toFixed(0)} mm crossing is too narrow for the edge pattern and stays straight.`,
            at: world((a + b) / 2, 0),
          });
    }
    features.sort((p, q) => p.u - q.u);
    const line: Point[] = [world(start, 0)];
    for (const f of features) for (const [u, v] of f.points) line.push(world(u, v));
    line.push(world(end, 0));
    segments.push(line);
  }
  return { axis, at, segments };
}

/** Artwork as solid regions: filled shapes, plus a thin band around engraved lines. */
function inkOf(details: readonly Detail[]): Point[][] {
  const fills = details.filter((d) => d.filled && d.closed).map((d) => d.points);
  const lines = details
    .filter((d) => !d.filled)
    .map((d) => (d.closed ? [...d.points, d.points[0]] : d.points));
  const parts = [
    ...(fills.length ? unite(fills) : []),
    ...(lines.length ? strokeOutline(lines, 1) : []),
  ];
  return parts.length ? unite(parts) : [];
}

const reversed = (p: Point[]) => [...p].reverse();

function cellPolygon(
  i: number,
  j: number,
  X: number[],
  Y: number[],
  vertical: SeamLine[],
  horizontal: SeamLine[],
): Point[] {
  const cols = X.length - 1,
    rows = Y.length - 1;
  const top =
    j === 0 ? [[X[i], Y[0]] as Point, [X[i + 1], Y[0]] as Point] : horizontal[j - 1].segments[i];
  const right =
    i === cols - 1
      ? [[X[cols], Y[j]] as Point, [X[cols], Y[j + 1]] as Point]
      : vertical[i].segments[j];
  const bottom =
    j === rows - 1
      ? [[X[i], Y[rows]] as Point, [X[i + 1], Y[rows]] as Point]
      : horizontal[j].segments[i];
  const left =
    i === 0 ? [[X[0], Y[j]] as Point, [X[0], Y[j + 1]] as Point] : vertical[i - 1].segments[j];
  const out: Point[] = [];
  for (const part of [top, right, reversed(bottom), reversed(left)])
    for (const p of part) {
      const last = out[out.length - 1];
      if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
    }
  return out;
}

function clipDetails(details: readonly Detail[], region: Point[][]): Detail[] {
  const out: Detail[] = [];
  for (const d of details) {
    if (d.filled && d.closed) {
      for (const p of clip([d.points], region))
        out.push({ points: p, closed: true, color: d.color, filled: true });
    } else {
      const line = d.closed ? [...d.points, d.points[0]] : d.points;
      for (const p of clipLines([line], region))
        if (p.length > 1) out.push({ points: p, closed: false, color: d.color, filled: false });
    }
  }
  return out;
}

function label(polygons: Point[][], id: string): { at: Point; size: number } {
  const { at, clearance } = labelPoint(polygons);
  const perUnit = textWidth(id, 1);
  const size = Math.min(14, clearance * 0.9, (clearance * 1.6) / perUnit);
  return { at, size: size >= 2 ? size : 0 };
}

function placement(part: Part, x: number, y: number, rotated: boolean): Matrix {
  const b = part.bounds;
  return rotated ? [0, 1, -1, 0, x + b.y + b.height, y - b.x] : [1, 0, 0, 1, x - b.x, y - b.y];
}

export function splitArtwork(art: Artwork, options: SplitOptions, issues: Issue[]): SplitResult {
  const s = settings(options);
  const { material } = art,
    W = art.width,
    H = art.height;
  if (!material.length || W <= 0 || H <= 0)
    throw new SplitError('EMPTY_SVG', 'The design has no closed shapes to cut.');
  const bedW = s.bed.width - 2 * s.margin,
    bedH = s.bed.height - 2 * s.margin;
  const minSpan = s.size * 1.4;
  const field = makeField(material, inkOf(art.details));

  const oneSided = s.joint.kind === 'tab';
  let limX: Limits, limY: Limits, seamsX: number[], seamsY: number[];
  const explicit = options.seams;
  const cleanSeams = (list: number[] | undefined, length: number) =>
    [...new Set((list ?? []).filter((v) => Number.isFinite(v)))]
      .sort((a, b) => a - b)
      .filter((v) => {
        const inside = v > 1 && v < length - 1;
        if (!inside)
          issues.push({
            code: 'SEAM_OUTSIDE',
            message: `A seam at ${v.toFixed(1)} mm lies outside the design and was ignored.`,
          });
        return inside;
      });
  for (const n of [options.columns, options.rows])
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 40))
      throw new SplitError('INVALID_OPTIONS', 'columns and rows must be integers from 1 to 40.');
  const orientations = [
    [bedW, bedH],
    [bedH, bedW],
  ];
  let best: { lx: Limits; ly: Limits; c: number; r: number } | undefined;
  for (const [bx, by] of s.rotate ? orientations : orientations.slice(0, 1)) {
    const lx = limitsFor(bx, s.reach, oneSided),
      ly = limitsFor(by, s.reach, oneSided);
    const c = explicit?.x ? explicit.x.length + 1 : (options.columns ?? cellsFor(W, lx)),
      r = explicit?.y ? explicit.y.length + 1 : (options.rows ?? cellsFor(H, ly));
    if (!best || c * r < best.c * best.r) best = { lx, ly, c, r };
  }
  const g = best!;
  if (!Number.isFinite(g.c * g.r) || g.c * g.r > 400)
    throw new SplitError(
      'TOO_MANY_PIECES',
      'The design needs more than 400 pieces on this bed. Use a larger bed or a smaller joint.',
    );
  limX = g.lx;
  limY = g.ly;
  seamsX = explicit?.x ? cleanSeams(explicit.x, W) : placeSeams(field, 'x', W, g.c, limX, minSpan);
  seamsY = explicit?.y ? cleanSeams(explicit.y, H) : placeSeams(field, 'y', H, g.r, limY, minSpan);

  const X = [-PAD, ...seamsX, W + PAD],
    Y = [-PAD, ...seamsY, H + PAD];
  /** A tab may point back into the earlier cell when the later cell still fits the bed. */
  const flipOk = (edges: number[], lim: Limits) =>
    edges.slice(1, -1).map((_, k) => {
      const next = edges[k + 2] - edges[k + 1],
        hasOwn = k + 2 < edges.length - 1;
      return next + s.reach * (hasOwn ? 2 : 1) <= lim.bed;
    });
  const flipX = flipOk(X, limX),
    flipY = flipOk(Y, limY);
  const joints: Joint[] = [],
    keyShapes: Point[][] = [];
  const vertical = seamsX.map((x, k) =>
    buildSeam(field, 'x', x, Y, s, flipX[k], joints, keyShapes, issues),
  );
  const horizontal = seamsY.map((y, k) =>
    buildSeam(field, 'y', y, X, s, flipY[k], joints, keyShapes, issues),
  );

  const pockets = keyShapes.length ? offset(keyShapes, -s.delta) : [];
  const parts: Part[] = [];
  const addPart = (
    id: string,
    kind: Part['kind'],
    polygons: Point[][],
    extra: Partial<Part> = {},
  ) => {
    const bounds = boundsOf(polygons.flat());
    parts.push({
      id,
      kind,
      polygons,
      details: [],
      bounds,
      area: totalArea(polygons),
      labelAt: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2],
      labelSize: 0,
      sheet: -1,
      placement: [1, 0, 0, 1, 0, 0],
      rotated: false,
      ...extra,
    });
  };

  for (let j = 0; j < Y.length - 1; j++)
    for (let i = 0; i < X.length - 1; i++) {
      const cell = offset([cellPolygon(i, j, X, Y, vertical, horizontal)], s.delta);
      let piece = clip(material, cell);
      if (pockets.length) piece = subtract(piece, pockets);
      const groups = components(piece).sort((a, b) => area(b[0]) - area(a[0]));
      const name = rowName(j) + (i + 1);
      groups.forEach((group, g) => {
        const id = g ? `${name}.${g + 1}` : name;
        addPart(id, 'piece', group, { column: i, row: j });
        const a = totalArea(group);
        if (a < Math.max(25, s.size * s.size * 0.05))
          issues.push({
            code: 'SMALL_FRAGMENT',
            message: `Piece ${id} is a small fragment (${a.toFixed(0)} mm²). Move a seam to avoid it.`,
            part: id,
            at: [boundsOf(group[0]).x, boundsOf(group[0]).y],
          });
      });
    }
  offset(keyShapes, s.delta).forEach((key, k) => addPart(`K${k + 1}`, 'key', [key]));

  if (s.backers > 0) {
    const inset = offset(material, -WALL_MIN, true);
    const strips: Point[][] = [];
    const half = s.backers / 2;
    const seamStrips = (axis: 'x' | 'y', at: number, cuts: number[]) => {
      for (let j = 0; j + 1 < cuts.length; j++) {
        const lo = cuts[j] + (j === 0 ? 0 : half + 1),
          hi = cuts[j + 1] - (j + 1 === cuts.length - 1 ? 0 : half + 1);
        if (hi - lo < 10) continue;
        strips.push(
          axis === 'x'
            ? rect(at - half, lo, 2 * half, hi - lo)
            : rect(lo, at - half, hi - lo, 2 * half),
        );
      }
    };
    seamsX.forEach((x) => seamStrips('x', x, Y));
    seamsY.forEach((y) => seamStrips('y', y, X));
    let n = 0;
    for (const strip of strips)
      for (const group of components(clip(inset, [strip])))
        if (totalArea(group) > s.backers * 8) addPart(`S${++n}`, 'backer', group);
  }

  for (const part of parts) {
    if (part.kind === 'piece') part.details = clipDetails(art.details, part.polygons);
    if (part.area < 150) continue;
    const near =
      field.ink.length && part.kind === 'piece'
        ? clip(field.ink, [
            rect(part.bounds.x, part.bounds.y, part.bounds.width, part.bounds.height),
          ])
        : [];
    const clear = near.length ? subtract(part.polygons, near) : [];
    const l = label(totalArea(clear) > part.area * 0.2 ? clear : part.polygons, part.id);
    part.labelAt = l.at;
    part.labelSize = l.size;
  }

  const packed = pack(
    parts.map((p) => ({ width: p.bounds.width, height: p.bounds.height })),
    bedW,
    bedH,
    s.spacing,
    s.rotate,
  );
  parts.forEach((part, k) => {
    const pl = packed.placements[k];
    part.sheet = pl.sheet;
    part.rotated = pl.rotated;
    part.placement = placement(part, s.margin + pl.x, s.margin + pl.y, pl.rotated);
    if (pl.sheet < 0)
      issues.push({
        code: 'PART_TOO_LARGE',
        message: `Part ${part.id} (${part.bounds.width.toFixed(0)} × ${part.bounds.height.toFixed(0)} mm) does not fit the bed. Move or add a seam.`,
        part: part.id,
      });
  });

  const sheets = Array.from({ length: packed.sheets }, (_, index) => {
    const on = parts.filter((p) => p.sheet === index);
    return {
      index,
      width: s.bed.width,
      height: s.bed.height,
      parts: on.map((p) => p.id),
      usage: on.reduce((n, p) => n + p.area, 0) / (s.bed.width * s.bed.height),
      svg: sheetSvg(on, s.bed, index, s.labels, s.precision),
    };
  });

  const seamPaths = [...vertical, ...horizontal].map((seam) => {
    const out: Point[] = [];
    for (const seg of seam.segments) for (const p of seg) out.push(p);
    return out;
  });
  const result: SplitResult = {
    width: W,
    height: H,
    scale: art.scale,
    bed: s.bed,
    columns: X.length - 1,
    rows: Y.length - 1,
    seams: { x: seamsX, y: seamsY } satisfies Seams,
    seamLimits: {
      x: seamLimits(seamsX, W, limX),
      y: seamLimits(seamsY, H, limY),
    },
    seamPaths,
    joints,
    parts,
    sheets,
    assembly: '',
    issues,
    unit: 'mm',
  };
  result.assembly = assemblySvg(result, { precision: s.precision });
  return result;
}

export type { JointType };
