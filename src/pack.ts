/** Rectangle packing onto fixed-size sheets: MaxRects, best short side fit. */
export interface PackItem {
  width: number;
  height: number;
}
export interface Placement {
  sheet: number;
  x: number;
  y: number;
  rotated: boolean;
}
interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

class Bin {
  free: Free[];
  used = 0;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.free = [{ x: 0, y: 0, w, h }];
  }
  find(w: number, h: number, rotate: boolean) {
    let best: { x: number; y: number; rotated: boolean; score: number } | undefined;
    for (const f of this.free)
      for (const rotated of rotate ? [false, true] : [false]) {
        const iw = rotated ? h : w,
          ih = rotated ? w : h;
        if (iw > f.w + 1e-9 || ih > f.h + 1e-9) continue;
        const score = Math.min(f.w - iw, f.h - ih) + (f.y + f.x) * 1e-6;
        if (!best || score < best.score) best = { x: f.x, y: f.y, rotated, score };
      }
    return best;
  }
  place(x: number, y: number, w: number, h: number) {
    const next: Free[] = [];
    for (const f of this.free) {
      if (x >= f.x + f.w || x + w <= f.x || y >= f.y + f.h || y + h <= f.y) {
        next.push(f);
        continue;
      }
      if (x > f.x) next.push({ x: f.x, y: f.y, w: x - f.x, h: f.h });
      if (x + w < f.x + f.w) next.push({ x: x + w, y: f.y, w: f.x + f.w - x - w, h: f.h });
      if (y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: y - f.y });
      if (y + h < f.y + f.h) next.push({ x: f.x, y: y + h, w: f.w, h: f.y + f.h - y - h });
    }
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            j !== i &&
            a.x >= b.x &&
            a.y >= b.y &&
            a.x + a.w <= b.x + b.w &&
            a.y + a.h <= b.y + b.h &&
            (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h),
        ),
    );
    this.used += w * h;
  }
}

/**
 * Pack items onto as few sheets as possible. `gap` is added to every item so neighbours keep
 * that distance; items larger than the sheet in both orientations get sheet -1.
 */
export function pack(
  items: readonly PackItem[],
  sheetW: number,
  sheetH: number,
  gap: number,
  rotate: boolean,
): { placements: Placement[]; sheets: number } {
  const order = items
    .map((item, i) => ({ i, w: item.width + gap, h: item.height + gap }))
    .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const bins: Bin[] = [],
    placements: Placement[] = new Array(items.length);
  const W = sheetW + gap,
    H = sheetH + gap;
  for (const o of order) {
    let done = false;
    for (let s = Math.max(0, bins.length - 8); s < bins.length && !done; s++) {
      const spot = bins[s].find(o.w, o.h, rotate);
      if (!spot) continue;
      bins[s].place(spot.x, spot.y, spot.rotated ? o.h : o.w, spot.rotated ? o.w : o.h);
      placements[o.i] = { sheet: s, x: spot.x, y: spot.y, rotated: spot.rotated };
      done = true;
    }
    if (done) continue;
    const bin = new Bin(W, H),
      spot = bin.find(o.w, o.h, rotate);
    if (!spot) {
      placements[o.i] = { sheet: -1, x: 0, y: 0, rotated: false };
      continue;
    }
    bin.place(spot.x, spot.y, spot.rotated ? o.h : o.w, spot.rotated ? o.w : o.h);
    bins.push(bin);
    placements[o.i] = { sheet: bins.length - 1, x: spot.x, y: spot.y, rotated: spot.rotated };
  }
  return { placements, sheets: bins.length };
}
