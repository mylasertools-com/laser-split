import { SplitError, type Matrix } from './types.js';
import { IDENTITY, mul, numbers, scale, transform, translate } from './matrix.js';
import { parsePath, type Contour } from './path.js';
import { parseXml, type Element } from './xml.js';
export type FillRuleName = 'nonzero' | 'evenodd';
export interface Shape {
  node: Element;
  matrix: Matrix;
  paths: Contour[];
  index: number;
  fill: string;
  fillRule: FillRuleName;
  stroke: string;
}
export interface Document {
  root: Element;
  width: number;
  height: number;
  viewport: Matrix;
  shapes: Shape[];
  skipped: string[];
}
const mm: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  px: 25.4 / 96,
  pt: 25.4 / 72,
  pc: 25.4 / 6,
  q: 0.25,
};
export function length(value: string | undefined, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in|px|pt|pc|q)?\s*$/i.exec(
    value ?? '',
  );
  if (!m || !Number.isFinite(+m[1]))
    throw new SplitError(
      'INVALID_LENGTH',
      `Expected an absolute SVG length, got ${value}. Percentages and font-relative units are unsupported.`,
    );
  return +m[1] * mm[m[2]?.toLowerCase() ?? 'px'];
}
function attr(node: Element, key: string, fallback = 0): number {
  const v = node.attrs[key];
  return v === undefined ? fallback : length(v) / (25.4 / 96);
}
function shapePaths(node: Element): Contour[] {
  if (node.tag === 'path') return parsePath(node.attrs.d ?? '');
  if (node.tag === 'line')
    return parsePath(
      `M${attr(node, 'x1')} ${attr(node, 'y1')}L${attr(node, 'x2')} ${attr(node, 'y2')}`,
    );
  if (node.tag === 'polygon' || node.tag === 'polyline') {
    const p = numbers(node.attrs.points ?? '');
    if (p.length % 2)
      throw new SplitError('INVALID_POINTS', 'A points attribute needs coordinate pairs.');
    return p.length ? parsePath(`M${p.join(' ')}${node.tag === 'polygon' ? 'Z' : ''}`) : [];
  }
  if (node.tag === 'rect') {
    const x = attr(node, 'x'),
      y = attr(node, 'y'),
      w = attr(node, 'width'),
      h = attr(node, 'height');
    if (w < 0 || h < 0)
      throw new SplitError('INVALID_SHAPE', 'Rectangle dimensions must be non-negative.');
    if (!w || !h) return [];
    const rx = Math.min(w / 2, attr(node, 'rx', attr(node, 'ry'))),
      ry = Math.min(h / 2, attr(node, 'ry', attr(node, 'rx')));
    if (rx < 0 || ry < 0)
      throw new SplitError('INVALID_SHAPE', 'Corner radii must be non-negative.');
    return parsePath(
      rx && ry
        ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        : `M${x} ${y}H${x + w}V${y + h}H${x}Z`,
    );
  }
  const x = attr(node, 'cx'),
    y = attr(node, 'cy'),
    rx = attr(node, node.tag === 'circle' ? 'r' : 'rx'),
    ry = node.tag === 'circle' ? rx : attr(node, 'ry');
  if (rx < 0 || ry < 0) throw new SplitError('INVALID_SHAPE', 'Radii must be non-negative.');
  return rx && ry
    ? parsePath(
        `M${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}Z`,
      )
    : [];
}
export function readSvg(source: string): Document {
  const root = parseXml(source),
    a = root.attrs;
  if (root.selfClosing) throw new SplitError('EMPTY_SVG', 'SVG contains no geometry.');
  const vb = a.viewBox ? numbers(a.viewBox) : undefined;
  if (vb && (vb.length !== 4 || vb[2] <= 0 || vb[3] <= 0))
    throw new SplitError(
      'INVALID_VIEWBOX',
      'viewBox must have four numbers and positive dimensions.',
    );
  const width = length(a.width, vb ? (vb[2] * 25.4) / 96 : undefined),
    height = length(a.height, vb ? (vb[3] * 25.4) / 96 : undefined);
  if (!(width > 0 && height > 0 && width <= 1e7 && height <= 1e7))
    throw new SplitError('INVALID_SIZE', 'SVG needs positive finite width and height.');
  let viewport: Matrix = scale(25.4 / 96);
  if (vb) {
    let sx = width / vb[2],
      sy = height / vb[3],
      tx = -vb[0] * sx,
      ty = -vb[1] * sy;
    const par = (a.preserveAspectRatio ?? 'xMidYMid meet').trim();
    if (par !== 'none') {
      const p = /^(xMin|xMid|xMax)(YMin|YMid|YMax)(?:\s+(meet|slice))?$/.exec(par);
      if (!p) throw new SplitError('INVALID_VIEWBOX', 'Unsupported preserveAspectRatio.');
      sx = sy = p[3] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
      tx = -vb[0] * sx + (width - vb[2] * sx) * (p[1] === 'xMin' ? 0 : p[1] === 'xMid' ? 0.5 : 1);
      ty = -vb[1] * sy + (height - vb[3] * sy) * (p[2] === 'YMin' ? 0 : p[2] === 'YMid' ? 0.5 : 1);
    }
    viewport = [sx, 0, 0, sy, tx, ty];
  }
  const shapes: Shape[] = [],
    skipped = new Set<string>();
  const classes = new Map<string, Array<[string, string]>>();
  const collect = (node: Element) => {
    if (node.tag === 'style' && node.text)
      for (const m of node.text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const decls = m[2]
          .split(';')
          .map((d) => d.split(':'))
          .filter((d) => d.length >= 2)
          .map(([k, ...v]) => [k.trim().toLowerCase(), v.join(':').trim()] as [string, string]);
        for (const sel of m[1].split(','))
          if (/^\s*\.[\w-]+\s*$/.test(sel)) {
            const name = sel.trim().slice(1);
            classes.set(name, [...(classes.get(name) ?? []), ...decls]);
          }
      }
    for (const child of node.children) collect(child);
  };
  collect(root);
  interface Context {
    fill: string;
    stroke: string;
    fillRule: FillRuleName;
  }
  const paint = (value: string | undefined, inherited: string, initial: string) => {
    const normalized = value
      ?.replace(/\s*!important\s*$/i, '')
      .trim()
      .toLowerCase();
    if (!normalized || normalized === 'inherit' || normalized === 'unset') return inherited;
    if (normalized === 'currentcolor') return inherited === 'none' ? 'black' : inherited;
    if (/^url\s*\(/.test(normalized)) return 'black';
    return normalized === 'initial' ? initial : normalized;
  };
  const rule = (value: string | undefined, inherited: FillRuleName): FillRuleName => {
    const normalized = value?.trim().toLowerCase();
    return normalized === 'evenodd' || normalized === 'nonzero' ? normalized : inherited;
  };
  const visit = (
    node: Element,
    parent: Matrix,
    hidden = false,
    inherited: Context = { fill: 'black', stroke: 'none', fillRule: 'nonzero' },
  ) => {
    if (['script', 'foreignObject', 'iframe'].includes(node.tag))
      throw new SplitError('UNSUPPORTED_SVG', 'Active SVG content is unsupported.');
    const a = node.attrs;
    for (const key of Object.keys(a))
      if (/^on/i.test(key))
        throw new SplitError('UNSUPPORTED_SVG', 'Event handler attributes are unsupported.');
    const context: Context = {
      fill: paint(a.fill, inherited.fill, 'black'),
      stroke: paint(a.stroke, inherited.stroke, 'none'),
      fillRule: rule(a['fill-rule'], inherited.fillRule),
    };
    const declared: Array<[string, string]> = [];
    for (const name of (a.class ?? '').split(/\s+/)) declared.push(...(classes.get(name) ?? []));
    for (const part of (a.style ?? '').split(';').filter((s) => s.trim())) {
      const pair = part.split(':');
      declared.push([pair[0].trim().toLowerCase(), pair.slice(1).join(':').trim()]);
    }
    for (const [key, value] of declared) {
      if (key === 'fill-rule') context.fillRule = rule(value, inherited.fillRule);
      if (key === 'fill' || key === 'stroke')
        context[key] = paint(value, inherited[key], key === 'fill' ? 'black' : 'none');
      if ((key === 'display' && value === 'none') || (key === 'visibility' && value === 'hidden'))
        hidden = true;
    }
    hidden = hidden || a.display === 'none' || a.visibility === 'hidden';
    if (hidden) return;
    const matrix = mul(parent, transform(a.transform));
    if (
      [
        'title',
        'desc',
        'metadata',
        'defs',
        'style',
        'clipPath',
        'mask',
        'pattern',
        'marker',
        'symbol',
        'linearGradient',
        'radialGradient',
        'filter',
        'animate',
        'animateTransform',
        'set',
      ].includes(node.tag) ||
      node.tag.includes(':')
    )
      return;
    if (node.tag === 'g' || node.tag === 'a' || node.tag === 'svg' || node === root) {
      for (const child of node.children) visit(child, matrix, hidden, context);
      return;
    }
    if (!['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line'].includes(node.tag)) {
      skipped.add(node.tag);
      return;
    }
    shapes.push({ node, matrix, paths: shapePaths(node), index: shapes.length, ...context });
    if (shapes.length > 20000)
      throw new SplitError('COMPLEXITY_LIMIT', 'At most 20,000 visible shapes are supported.');
  };
  visit(root, IDENTITY);
  if (!shapes.length)
    throw new SplitError('EMPTY_SVG', 'SVG contains no supported visible shapes.');
  return { root, width, height, viewport, shapes, skipped: [...skipped] };
}
