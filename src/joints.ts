import type { JointInfo, JointType, Point } from './types.js';

export const JOINTS: readonly JointInfo[] = [
  {
    id: 'puzzle',
    name: 'Puzzle',
    kind: 'tab',
    locks: true,
    aspect: 0.62,
    description: 'Classic jigsaw knob. Locks in every direction and hides well in busy artwork.',
  },
  {
    id: 'dovetail',
    name: 'Dovetail',
    kind: 'tab',
    locks: true,
    aspect: 0.5,
    description: 'Woodworking dovetail. Clean straight lines that look deliberate on wood.',
  },
  {
    id: 'heart',
    name: 'Heart',
    kind: 'tab',
    locks: true,
    aspect: 0.78,
    description: 'A little heart on a neck. Made for wedding, baby and family signs.',
  },
  {
    id: 'arrow',
    name: 'Arrow',
    kind: 'tab',
    locks: true,
    aspect: 0.72,
    description: 'Arrowhead with barbs. Strong pull-out resistance with a graphic look.',
  },
  {
    id: 'star',
    name: 'Star',
    kind: 'tab',
    locks: true,
    aspect: 0.8,
    description: 'Five-point star head. Fun for kids rooms, holidays and party signs.',
  },
  {
    id: 'bowtie',
    name: 'Butterfly key',
    kind: 'key',
    locks: true,
    aspect: 0.72,
    description:
      'Straight seam held by separate bow-tie keys cut from the same sheet. Try a contrasting wood.',
  },
  {
    id: 'wave',
    name: 'Wave',
    kind: 'edge',
    locks: false,
    aspect: 0.32,
    description: 'Soft sine edge that aligns the pieces. Pair with backer strips or glue.',
  },
  {
    id: 'zigzag',
    name: 'Zigzag',
    kind: 'edge',
    locks: false,
    aspect: 0.36,
    description: 'Sawtooth edge with lots of glue surface. Pair with backer strips.',
  },
  {
    id: 'finger',
    name: 'Finger',
    kind: 'edge',
    locks: false,
    aspect: 0.3,
    description: 'Square castellated edge. Self-aligning and easy to glue.',
  },
  {
    id: 'scallop',
    name: 'Scallop',
    kind: 'edge',
    locks: false,
    aspect: 0.44,
    description: 'Rolling half-circles, like a cloud edge. Decorative, glue or back it.',
  },
  {
    id: 'straight',
    name: 'Straight',
    kind: 'none',
    locks: false,
    aspect: 0,
    description: 'Plain butt seam. The least visible line; use backer strips to hold it.',
  },
];

export function jointInfo(id: JointType): JointInfo | undefined {
  return JOINTS.find((j) => j.id === id);
}

function bezier(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point, n = 14) {
  for (let i = 1; i <= n; i++) {
    const t = i / n,
      s = 1 - t;
    out.push([
      s * s * s * p0[0] + 3 * s * s * t * p1[0] + 3 * s * t * t * p2[0] + t * t * t * p3[0],
      s * s * s * p0[1] + 3 * s * s * t * p1[1] + 3 * s * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
}

type Step = ['L', number, number] | ['C', number, number, number, number, number, number];

/** Build a symmetric profile from its left half, which runs from (-0.5, 0) to the top centre. */
function mirrored(steps: Step[]): Point[] {
  const left: Point[] = [[-0.5, 0]];
  for (const s of steps) {
    const last = left[left.length - 1];
    if (s[0] === 'L') left.push([s[1], s[2]]);
    else bezier(left, last, [s[1], s[2]], [s[3], s[4]], [s[5], s[6]]);
  }
  const right = left
    .slice(0, -1)
    .reverse()
    .map(([u, v]) => [-u, v] as Point);
  return [...left, ...right];
}

function star(): Point[] {
  const c = 0.62,
    R = 0.38,
    r = 0.16,
    neck = 0.085;
  const at = (k: number): Point => {
    const t = ((90 + k * 36) * Math.PI) / 180,
      rad = k % 2 ? r : R;
    return [rad * Math.cos(t), c + rad * Math.sin(t)];
  };
  const k5 = at(5),
    k4 = at(4),
    t = (neck - Math.abs(k5[0])) / Math.abs(k4[0] - k5[0]),
    join = k5[1] + t * (k4[1] - k5[1]);
  const ring = [4, 3, 2, 1, 0, 9, 8, 7, 6].map(at);
  return [[-0.5, 0], [-neck, 0], [-neck, join], ...ring, [neck, join], [neck, 0], [0.5, 0]];
}

const PROFILES: Partial<Record<JointType, () => Point[]>> = {
  puzzle: () =>
    mirrored([
      ['L', -0.17, 0],
      ['C', -0.08, 0, -0.06, 0.1, -0.1, 0.22],
      ['C', -0.14, 0.36, -0.31, 0.48, -0.27, 0.76],
      ['C', -0.23, 0.98, -0.09, 1, 0, 1],
    ]),
  dovetail: () =>
    mirrored([
      ['L', -0.17, 0],
      ['L', -0.3, 1],
      ['L', 0, 1],
    ]),
  heart: () =>
    mirrored([
      ['L', -0.075, 0],
      ['L', -0.075, 0.24],
      ['C', -0.22, 0.32, -0.43, 0.5, -0.37, 0.78],
      ['C', -0.32, 1.0, -0.07, 1.04, 0, 0.84],
    ]),
  arrow: () =>
    mirrored([
      ['L', -0.085, 0],
      ['L', -0.085, 0.42],
      ['L', -0.29, 0.42],
      ['L', 0, 1],
    ]),
  star,
};

/**
 * Outline of a tab joint in unit space: u from -0.5 to 0.5 along the seam, v from 0 at the
 * seam to 1 at the tip.
 */
export function tabProfile(type: JointType): Point[] {
  const make = PROFILES[type];
  return make ? make() : [];
}

/** Butterfly key outline in unit space, centred on the seam: u along, v across. */
export function keyShape(): Point[] {
  return [
    [-0.5, -1],
    [0.5, -1],
    [0.22, 0],
    [0.5, 1],
    [-0.5, 1],
    [-0.22, 0],
  ];
}

/** A repeating edge from u = 0 to u = length that starts and ends on the seam line. */
export function edgeProfile(
  type: JointType,
  length: number,
  period: number,
  depth: number,
): Point[] {
  const n = Math.max(1, Math.round(length / period)),
    p = length / n,
    h = depth / 2,
    out: Point[] = [[0, 0]];
  for (let k = 0; k < n; k++) {
    const o = k * p;
    if (type === 'wave')
      for (let i = 1; i <= 24; i++)
        out.push([o + (p * i) / 24, h * Math.sin((2 * Math.PI * i) / 24)]);
    else if (type === 'zigzag') out.push([o + p / 4, h], [o + (3 * p) / 4, -h], [o + p, 0]);
    else if (type === 'finger')
      out.push([o, h], [o + p / 2, h], [o + p / 2, -h], [o + p, -h], [o + p, 0]);
    else if (type === 'scallop')
      for (const side of [1, -1])
        for (let i = 1; i <= 12; i++) {
          const t = (Math.PI * i) / 12,
            start = o + (side === 1 ? 0 : p / 2);
          out.push([start + (p / 4) * (1 - Math.cos(t)), side * h * Math.sin(t)]);
        }
    else out.push([o + p, 0]);
  }
  return out;
}

/** A small preview of a joint as SVG path data in a 120 x 60 box, for pickers and docs. */
export function jointIcon(type: JointType): string {
  const info = jointInfo(type);
  const f = (n: number) => +n.toFixed(2);
  let line: Point[];
  let extra = '';
  if (!info || info.kind === 'none')
    line = [
      [0, 30],
      [120, 30],
    ];
  else if (info.kind === 'tab') {
    const w = 64,
      d = Math.min(26, w * info.aspect),
      prof = tabProfile(type).map(([u, v]) => [60 + u * w, 30 + d / 2 - v * d] as Point);
    line = [[0, 30 + d / 2], ...prof, [120, 30 + d / 2]];
  } else if (info.kind === 'key') {
    line = [
      [0, 30],
      [120, 30],
    ];
    const k = keyShape().map(([u, v]) => [60 + u * 34, 30 + v * 22] as Point);
    extra = 'M' + k.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
  } else {
    line = edgeProfile(type, 120, 30, 30 * info.aspect * 1.4).map(([u, v]) => [u, 30 - v] as Point);
  }
  return 'M' + line.map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + extra;
}
