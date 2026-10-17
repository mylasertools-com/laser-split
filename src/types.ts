export type Point = readonly [number, number];
export type Matrix = readonly [number, number, number, number, number, number];
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type JointType =
  | 'puzzle'
  | 'dovetail'
  | 'heart'
  | 'arrow'
  | 'star'
  | 'bowtie'
  | 'wave'
  | 'zigzag'
  | 'finger'
  | 'scallop'
  | 'straight';

export interface JointInfo {
  id: JointType;
  name: string;
  /** Single shapes along the seam, a repeating edge, a separate key, or nothing. */
  kind: 'tab' | 'edge' | 'key' | 'none';
  /** True when the joint holds the pieces together without glue or a backer. */
  locks: boolean;
  /** Depth of the shape as a fraction of its width. */
  aspect: number;
  description: string;
}

export interface Bed {
  /** Usable width of the laser bed or sheet in mm. */
  width: number;
  /** Usable height of the laser bed or sheet in mm. */
  height: number;
}

export interface BedPreset extends Bed {
  id: string;
  name: string;
}

export interface Seams {
  /** Vertical seam positions in mm from the left edge of the finished design. */
  x: number[];
  /** Horizontal seam positions in mm from the top edge of the finished design. */
  y: number[];
}

export interface SplitOptions {
  /** Finished width in mm. Height follows the design's proportions. */
  width?: number;
  /** Finished height in mm, used when width is not set. */
  height?: number;
  /** Laser bed or sheet size: a preset id such as '12x20in', or { width, height } in mm. Default '12x20in'. */
  bed?: string | Bed;
  /** Space kept clear around the edge of every sheet, in mm. Default 5. */
  margin?: number;
  /** Space between parts that share a sheet, in mm. Default 3. */
  spacing?: number;
  /** Allow parts to turn 90 degrees on the sheet. Default true. */
  rotate?: boolean;
  /** Joint shape. Default 'puzzle'. */
  joint?: JointType;
  /** Joint width along the seam in mm. Default 14% of the shorter usable bed side, 12 to 70 mm. */
  jointSize?: number;
  /**
   * How far a joint reaches into the neighbouring piece, in mm. Default jointSize times the
   * joint's natural proportion, so a wider joint gets deeper unless this is set.
   */
  jointDepth?: number;
  /** Target distance between joints on one crossing, in mm. Default 4 x jointSize. */
  jointSpacing?: number;
  /** Full beam width in mm. Default 0.15. */
  kerf?: number;
  /** Total gap between mating edges after cutting, in mm. Default 0.1. */
  clearance?: number;
  /** Seam positions in finished mm. Omit to place seams automatically. */
  seams?: Partial<Seams>;
  /** Force the number of columns or rows instead of the smallest grid that fits. */
  columns?: number;
  rows?: number;
  /** Glue strips that sit behind each seam, as a width in mm. 0 or omitted for none. */
  backers?: number;
  /** Write piece names on a separate label layer. Default true. */
  labels?: boolean;
  /** Stroke or fill colours to keep as engraving instead of cutting, e.g. ['#0000ff']. */
  engrave?: string[];
  /** Curve flattening tolerance in mm of the original drawing. Default 0.05. */
  tolerance?: number;
  /** Decimal places for output coordinates. Default 3. */
  precision?: number;
}

export interface Detail {
  /** Polyline or polygon points in finished mm. */
  points: Point[];
  closed: boolean;
  color: string;
  filled: boolean;
}

export interface Part {
  /** Name engraved on the label layer and shown in the assembly map, e.g. 'B2', 'K3', 'S1'. */
  id: string;
  kind: 'piece' | 'key' | 'backer';
  /** Grid cell for pieces. */
  column?: number;
  row?: number;
  /** Cut contours in finished design coordinates (mm). Outer and hole orientation alternate. */
  polygons: Point[][];
  /** Engraving and other non-cut artwork kept on this part, in finished design coordinates. */
  details: Detail[];
  bounds: Bounds;
  area: number;
  /** Where the label sits, in finished design coordinates. */
  labelAt: Point;
  labelSize: number;
  /** Sheet this part was packed onto, or -1 when it does not fit. */
  sheet: number;
  /** Maps finished design coordinates to sheet coordinates. */
  placement: Matrix;
  rotated: boolean;
}

export interface Sheet {
  index: number;
  width: number;
  height: number;
  parts: string[];
  /** Share of the sheet covered by parts, 0 to 1. */
  usage: number;
  svg: string;
}

export interface Joint {
  type: JointType;
  seam: 'x' | 'y';
  /** Centre of the joint on the seam, in finished mm. */
  center: Point;
  width: number;
  depth: number;
  /** Which side the shape points to: 1 is right or down, -1 is left or up. */
  side: 1 | -1;
  /** For repeating edges, the length of seam the edge covers. */
  length?: number;
}

export interface Issue {
  code:
    | 'NO_JOINT'
    | 'SMALL_JOINT'
    | 'SMALL_FRAGMENT'
    | 'PART_TOO_LARGE'
    | 'OPEN_PATH_KEPT'
    | 'UNSUPPORTED_SKIPPED'
    | 'SEAM_OUTSIDE';
  message: string;
  at?: Point;
  part?: string;
}

export interface SplitResult {
  /** Finished design size in mm. */
  width: number;
  height: number;
  /** Finished size divided by the drawing's original size. */
  scale: number;
  bed: Bed;
  columns: number;
  rows: number;
  seams: Seams;
  /** Range each seam may move to keep every piece on the bed, in finished mm. */
  seamLimits: { x: Array<[number, number]>; y: Array<[number, number]> };
  /** Seam outlines including joint shapes, in finished mm. */
  seamPaths: Point[][];
  joints: Joint[];
  parts: Part[];
  sheets: Sheet[];
  /** The whole design with every part in place, spread slightly apart. */
  assembly: string;
  issues: Issue[];
  unit: 'mm';
}

export class SplitError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SplitError';
  }
}
