import { SplitError, type Bed, type BedPreset } from './types.js';

const inch = 25.4;

/** Common sheet and bed sizes. Embedders can pass any { width, height } instead. */
export const BEDS: readonly BedPreset[] = [
  { id: '12x20in', name: '12 × 20 in', width: 20 * inch, height: 12 * inch },
  { id: '12x12in', name: '12 × 12 in', width: 12 * inch, height: 12 * inch },
  { id: '12x24in', name: '12 × 24 in', width: 24 * inch, height: 12 * inch },
  { id: '16x16in', name: '16 × 16 in', width: 16 * inch, height: 16 * inch },
  { id: '20x28in', name: '20 × 28 in', width: 28 * inch, height: 20 * inch },
  { id: '300x200mm', name: '300 × 200 mm', width: 300, height: 200 },
  { id: '300x300mm', name: '300 × 300 mm', width: 300, height: 300 },
  { id: '400x400mm', name: '400 × 400 mm', width: 400, height: 400 },
  { id: '600x400mm', name: '600 × 400 mm', width: 600, height: 400 },
  { id: 'a4', name: 'A4', width: 297, height: 210 },
  { id: 'a3', name: 'A3', width: 420, height: 297 },
];

/** Resolve a preset id, a 'WxH' string in mm or inches ('500x300', '20x12in'), or a size object. */
export function resolveBed(bed: string | Bed | undefined): Bed {
  if (bed === undefined) return { width: BEDS[0].width, height: BEDS[0].height };
  if (typeof bed === 'string') {
    const preset = BEDS.find((b) => b.id === bed.toLowerCase());
    if (preset) return { width: preset.width, height: preset.height };
    const m = /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|in)?\s*$/i.exec(bed);
    if (!m) throw new SplitError('INVALID_OPTIONS', `Unknown bed ${bed}. Use a preset id or WxH.`);
    const unit = { mm: 1, cm: 10, in: inch }[(m[3] ?? 'mm').toLowerCase() as 'mm'];
    return checkBed({ width: +m[1] * unit, height: +m[2] * unit });
  }
  return checkBed({ width: bed.width, height: bed.height });
}

function checkBed(bed: Bed): Bed {
  if (!(bed.width >= 20 && bed.height >= 20 && bed.width <= 5000 && bed.height <= 5000))
    throw new SplitError('INVALID_OPTIONS', 'The bed must be between 20 and 5000 mm on each side.');
  return bed;
}
