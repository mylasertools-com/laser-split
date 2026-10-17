import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { BEDS, JOINTS, splitSvg, SplitError, type JointType, type SplitOptions } from './index.js';

const help = `Usage: laser-split <input.svg|-> [options]

Splits a design that is bigger than the laser bed into pieces that join together,
and writes one SVG per sheet plus an assembly map.

Options:
  -o, --out <dir>          Folder for the sheet files (default: ./<name>-split)
  -w, --width <mm>         Finished width in mm (default: the drawing's own size)
      --height <mm>        Finished height in mm, used when width is not set
  -b, --bed <size>         Bed preset or WxH in mm or in, e.g. 12x20in, 400x400 (default 12x20in)
  -j, --joint <type>       ${JOINTS.map((j) => j.id).join(', ')} (default puzzle)
  -s, --joint-size <mm>    Joint width along the seam
      --spacing <mm>       Target distance between joints on one crossing
      --kerf <mm>          Full beam width (default 0.15)
      --clearance <mm>     Total gap between mating edges (default 0.1)
      --margin <mm>        Clear border on every sheet (default 5)
      --backers <mm>       Add glue strips of this width behind the seams
      --seams-x <list>     Vertical seam positions in mm, comma separated
      --seams-y <list>     Horizontal seam positions in mm, comma separated
      --engrave <colours>  Keep shapes in these colours as engraving, e.g. #0000ff
      --no-labels          Leave out the piece label layer
      --no-rotate          Keep every piece upright on its sheet
      --json               Print the report as JSON instead of writing files
      --beds               List bed presets
  -h, --help               Show this help
`;

function main(argv: string[]): number {
  const args = [...argv];
  const options: SplitOptions = {};
  let input: string | undefined,
    out: string | undefined,
    json = false;
  const value = (flag: string) => {
    const v = args.shift();
    if (v === undefined) throw new SplitError('INVALID_ARGUMENT', `${flag} needs a value.`);
    return v;
  };
  const num = (flag: string) => {
    const v = Number(value(flag));
    if (!Number.isFinite(v)) throw new SplitError('INVALID_ARGUMENT', `${flag} needs a number.`);
    return v;
  };
  const list = (flag: string) => value(flag).split(',').map(Number);
  while (args.length) {
    const a = args.shift()!;
    if (a === '-h' || a === '--help') {
      process.stdout.write(help);
      return 0;
    } else if (a === '--beds') {
      for (const b of BEDS)
        process.stdout.write(
          `${b.id.padEnd(10)} ${b.name.padEnd(14)} ${b.width.toFixed(1)} x ${b.height.toFixed(1)} mm\n`,
        );
      return 0;
    } else if (a === '-o' || a === '--out') out = value(a);
    else if (a === '-w' || a === '--width') options.width = num(a);
    else if (a === '--height') options.height = num(a);
    else if (a === '-b' || a === '--bed') options.bed = value(a);
    else if (a === '-j' || a === '--joint') options.joint = value(a) as JointType;
    else if (a === '-s' || a === '--joint-size') options.jointSize = num(a);
    else if (a === '--spacing') options.jointSpacing = num(a);
    else if (a === '--kerf') options.kerf = num(a);
    else if (a === '--clearance') options.clearance = num(a);
    else if (a === '--margin') options.margin = num(a);
    else if (a === '--backers') options.backers = num(a);
    else if (a === '--seams-x') options.seams = { ...options.seams, x: list(a) };
    else if (a === '--seams-y') options.seams = { ...options.seams, y: list(a) };
    else if (a === '--engrave') options.engrave = value(a).split(',');
    else if (a === '--no-labels') options.labels = false;
    else if (a === '--no-rotate') options.rotate = false;
    else if (a === '--json') json = true;
    else if (a.startsWith('-') && a !== '-')
      throw new SplitError('INVALID_ARGUMENT', `Unknown option ${a}.`);
    else if (input === undefined) input = a;
    else throw new SplitError('INVALID_ARGUMENT', 'Only one input file is supported.');
  }
  if (input === undefined) {
    process.stderr.write(help);
    return 2;
  }
  const source = readFileSync(input === '-' ? 0 : input, 'utf8');
  const result = splitSvg(source, options);
  const name = input === '-' ? 'design' : basename(input).replace(/\.svg$/i, '');
  if (json) {
    const report = {
      width: +result.width.toFixed(2),
      height: +result.height.toFixed(2),
      grid: `${result.columns} x ${result.rows}`,
      seams: result.seams,
      sheets: result.sheets.map((s) => ({
        sheet: s.index + 1,
        parts: s.parts,
        usage: +s.usage.toFixed(3),
      })),
      joints: result.joints.length,
      issues: result.issues,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const dir = out ?? `${name}-split`;
    mkdirSync(dir, { recursive: true });
    for (const s of result.sheets)
      writeFileSync(join(dir, `${name}-sheet-${String(s.index + 1).padStart(2, '0')}.svg`), s.svg);
    writeFileSync(join(dir, `${name}-assembly.svg`), result.assembly);
    const pieces = result.parts.filter((p) => p.kind === 'piece').length;
    process.stderr.write(
      `${result.width.toFixed(0)} x ${result.height.toFixed(0)} mm: ${pieces} pieces, ${result.joints.length} joints, ${result.sheets.length} sheets in ${dir}\n`,
    );
  }
  for (const issue of result.issues) process.stderr.write(`${issue.code}: ${issue.message}\n`);
  return result.issues.some((i) => i.code === 'PART_TOO_LARGE') ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`laser-split: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
