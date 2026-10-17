import { mul } from './matrix.js';
import { flatten, isClosed, transformPath } from './path.js';
import { boundsOf, unite } from './geometry.js';
import { splitArtwork, type Artwork } from './split.js';
import { readSvg } from './svg.js';
import {
  SplitError,
  type Detail,
  type Issue,
  type Point,
  type SplitOptions,
  type SplitResult,
} from './types.js';

export * from './types.js';
export { BEDS, resolveBed } from './beds.js';
export { JOINTS, jointIcon, jointInfo } from './joints.js';
export {
  assemblyGap,
  assemblySvg,
  explodeOffset,
  pathData,
  type AssemblyOptions,
} from './render.js';
export { zip } from './zip.js';

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  lime: '#00ff00',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  orange: '#ffa500',
  gray: '#808080',
  grey: '#808080',
};

/** Normalise a CSS colour to #rrggbb where possible, for engraving colour matching. */
export function normalizeColor(value: string): string {
  const v = value.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v);
  if (m)
    return (
      '#' +
      m
        .slice(1, 4)
        .map((n) => Math.min(255, +n).toString(16).padStart(2, '0'))
        .join('')
    );
  return v;
}

interface Raw {
  points: Point[];
  closed: boolean;
  color: string;
  role: 'cut' | 'fill' | 'detail';
  shape: number;
  fillRule: 'nonzero' | 'evenodd';
  filled: boolean;
}

function readArtwork(svg: string, options: SplitOptions, issues: Issue[]): Artwork {
  const doc = readSvg(svg);
  if (doc.skipped.length)
    issues.push({
      code: 'UNSUPPORTED_SKIPPED',
      message: `Skipped ${doc.skipped.map((t) => `<${t}>`).join(', ')}. Convert text and images to paths to keep them.`,
    });
  const engrave = new Set((options.engrave ?? []).map(normalizeColor));
  const tolerance = options.tolerance ?? 0.05;
  if (!(tolerance > 0 && tolerance <= 5))
    throw new SplitError('INVALID_OPTIONS', 'tolerance must be between 0 and 5 mm.');
  const read = (tol: number): Raw[] => {
    const out: Raw[] = [];
    for (const shape of doc.shapes) {
      const fill = shape.fill !== 'none' && shape.fill !== 'transparent',
        stroke = shape.stroke !== 'none' && shape.stroke !== 'transparent';
      if (!fill && !stroke) continue;
      const color = normalizeColor(fill ? shape.fill : shape.stroke),
        strokeColor = normalizeColor(shape.stroke);
      const engraved = engrave.has(color) || (stroke && engrave.has(strokeColor));
      const matrix = mul(doc.viewport, shape.matrix);
      for (const path of shape.paths) {
        const closed = isClosed(path);
        const points = flatten(transformPath(path, matrix), tol);
        if (points.length < 2) continue;
        const role: Raw['role'] = engraved || !closed ? 'detail' : fill ? 'fill' : 'cut';
        out.push({
          points,
          closed,
          color: engraved || fill ? color : strokeColor,
          role,
          shape: shape.index,
          fillRule: shape.fillRule,
          filled: fill && closed,
        });
      }
    }
    return out;
  };
  const coarse = read(Math.max(tolerance, 0.5));
  const outlinesFirst = coarse.some((r) => r.role === 'cut');
  const solidRole = outlinesFirst ? 'cut' : 'fill';
  const solids = coarse.filter((r) => r.role === solidRole && r.points.length >= 3);
  if (!solids.length) throw new SplitError('EMPTY_SVG', 'The design has no closed shapes to cut.');
  const b0 = boundsOf(solids.flatMap((r) => r.points));
  const target =
    options.width !== undefined
      ? options.width / b0.width
      : options.height !== undefined
        ? options.height / b0.height
        : 1;
  if (
    !(
      target > 0 &&
      Number.isFinite(target) &&
      b0.width * target <= 20000 &&
      b0.height * target <= 20000
    )
  )
    throw new SplitError('INVALID_OPTIONS', 'The finished size must be positive and at most 20 m.');
  const raw = read(tolerance / Math.max(1, target));
  const material = (() => {
    const chosen = raw.filter((r) => r.role === solidRole && r.points.length >= 3);
    if (outlinesFirst)
      return unite(
        chosen.map((r) => r.points),
        true,
      );
    const byShape = new Map<number, Raw[]>();
    for (const r of chosen) byShape.set(r.shape, [...(byShape.get(r.shape) ?? []), r]);
    const each = [...byShape.values()].flatMap((rs) =>
      unite(
        rs.map((r) => r.points),
        rs[0].fillRule === 'evenodd',
      ),
    );
    return unite(each);
  })();
  const b = boundsOf(material.flat());
  const move = (p: Point): Point => [(p[0] - b.x) * target, (p[1] - b.y) * target];
  const details: Detail[] = raw
    .filter((r) => r.role === 'detail' || (outlinesFirst && r.role === 'fill'))
    .map((r) => ({
      points: r.points.map(move),
      closed: r.closed,
      color: r.color,
      filled: r.filled,
    }));
  const open = raw.filter((r) => !r.closed).length;
  if (open)
    issues.push({
      code: 'OPEN_PATH_KEPT',
      message: `${open} open path${open === 1 ? ' is' : 's are'} kept as lines on each piece, not as cut outlines.`,
    });
  return {
    material: material.map((p) => p.map(move)),
    details,
    width: b.width * target,
    height: b.height * target,
    scale: target,
  };
}

/**
 * Split an SVG that is larger than the laser bed into pieces that join together, and pack the
 * pieces onto bed-sized sheets.
 */
export function splitSvg(svg: string, options: SplitOptions = {}): SplitResult {
  const issues: Issue[] = [];
  return splitArtwork(readArtwork(svg, options, issues), options, issues);
}

/**
 * Split closed contours given in millimetres. Nested contours alternate solid and hole.
 * `width` or `height` scales them first; otherwise they are used at their own size.
 */
export function splitPolygons(
  contours: readonly (readonly Point[])[],
  options: SplitOptions = {},
): SplitResult {
  const solid = unite(
    contours.filter((c) => c.length >= 3).map((c) => [...c]),
    true,
  );
  if (!solid.length) throw new SplitError('EMPTY_SVG', 'No closed contours to split.');
  const b = boundsOf(solid.flat());
  const k =
    options.width !== undefined
      ? options.width / b.width
      : options.height !== undefined
        ? options.height / b.height
        : 1;
  return splitArtwork(
    {
      material: solid.map((p) => p.map(([x, y]) => [(x - b.x) * k, (y - b.y) * k] as Point)),
      details: [],
      width: b.width * k,
      height: b.height * k,
      scale: k,
    },
    options,
    [],
  );
}
