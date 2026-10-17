import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BEDS,
  JOINTS,
  jointIcon,
  resolveBed,
  splitPolygons,
  splitSvg,
  SplitError,
  zip,
} from '../dist/index.js';

const example = (name) => readFileSync(new URL(`../examples/${name}.svg`, import.meta.url), 'utf8');
const rectSvg = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="none" stroke="red"/></svg>`;
const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
const totalArea = (ps) => ps.reduce((n, p) => n + area(p), 0);
const place = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

test('every part lands inside the bed margins of its sheet', () => {
  for (const name of ['welcome', 'mountains', 'cloud'])
    for (const joint of ['puzzle', 'dovetail', 'wave', 'bowtie']) {
      const r = splitSvg(example(name), { width: 1000, joint, backers: 30 });
      assert.equal(
        r.issues.filter((i) => i.code === 'PART_TOO_LARGE').length,
        0,
        `${name} ${joint}`,
      );
      for (const part of r.parts) {
        assert.ok(part.sheet >= 0);
        for (const poly of part.polygons)
          for (const q of poly) {
            const [x, y] = place(part.placement, q);
            assert.ok(
              x >= 5 - 1e-6 && x <= r.bed.width - 5 + 1e-6,
              `${name} ${joint} ${part.id} x ${x}`,
            );
            assert.ok(
              y >= 5 - 1e-6 && y <= r.bed.height - 5 + 1e-6,
              `${name} ${joint} ${part.id} y ${y}`,
            );
          }
      }
    }
});

test('a 1 m sign on a 12 x 20 in bed splits into the fewest columns that fit', () => {
  const r = splitSvg(rectSvg(1000, 250), { joint: 'puzzle' });
  assert.equal(r.rows, 1);
  assert.equal(r.columns, 3);
  assert.equal(r.parts.length, 3);
  assert.deepEqual(
    r.parts.map((p) => p.id),
    ['A1', 'A2', 'A3'],
  );
  assert.ok(r.joints.length >= 2);
  assert.ok(r.joints.every((j) => j.type === 'puzzle' && j.seam === 'x'));
});

test('with no kerf the pieces exactly tile the design', () => {
  for (const joint of JOINTS.map((j) => j.id).filter((j) => j !== 'bowtie')) {
    const r = splitSvg(rectSvg(900, 500), { joint, kerf: 0, clearance: 0 });
    const sum = r.parts.reduce((n, p) => n + p.area, 0);
    assert.ok(Math.abs(sum - 900 * 500) < 1, `${joint}: ${sum}`);
  }
});

test('kerf compensation grows each piece by half the kerf along its seams', () => {
  const plain = splitSvg(rectSvg(800, 200), { joint: 'straight', kerf: 0, clearance: 0 });
  const comp = splitSvg(rectSvg(800, 200), { joint: 'straight', kerf: 0.4, clearance: 0 });
  assert.deepEqual(plain.seams, comp.seams);
  const seams = plain.seams.x.length;
  const grown = comp.parts.reduce((n, p) => n + p.area, 0) - 800 * 200;
  assert.ok(Math.abs(grown - seams * 2 * 200 * 0.2) < 2, `grown ${grown}`);
});

test('clearance larger than kerf leaves a gap', () => {
  const r = splitSvg(rectSvg(800, 200), { joint: 'straight', kerf: 0, clearance: 0.4 });
  const sum = r.parts.reduce((n, p) => n + p.area, 0);
  assert.ok(sum < 800 * 200 - 50);
});

test('explicit seams are used as given', () => {
  const r = splitSvg(rectSvg(1000, 250), { seams: { x: [300, 650] }, joint: 'dovetail' });
  assert.deepEqual(r.seams.x, [300, 650]);
  assert.equal(r.columns, 3);
});

test('a seam that leaves a part too big for the bed is reported', () => {
  const r = splitSvg(rectSvg(1000, 250), { seams: { x: [700] }, joint: 'straight' });
  assert.ok(r.issues.some((i) => i.code === 'PART_TOO_LARGE'));
});

test('butterfly keys come with matching pockets', () => {
  const r = splitSvg(rectSvg(900, 260), { joint: 'bowtie', kerf: 0, clearance: 0 });
  const keys = r.parts.filter((p) => p.kind === 'key');
  assert.ok(keys.length >= 2);
  assert.equal(keys.length, r.joints.length);
  const pieces = r.parts.filter((p) => p.kind === 'piece').reduce((n, p) => n + p.area, 0);
  const keyArea = keys.reduce((n, p) => n + p.area, 0);
  assert.ok(Math.abs(pieces + keyArea - 900 * 260) < 1);
});

test('backer strips straddle each seam inside the material', () => {
  const r = splitSvg(rectSvg(1000, 250), { joint: 'straight', backers: 40 });
  const strips = r.parts.filter((p) => p.kind === 'backer');
  assert.equal(strips.length, r.seams.x.length);
  for (const s of strips) assert.ok(s.bounds.width <= 40 + 1e-6);
});

test('seams and joints keep clear of engraved text where they can', () => {
  const r = splitSvg(example('welcome'), { width: 1000, joint: 'puzzle' });
  assert.equal(r.seams.y.length, 1);
  const textTop = 270;
  assert.ok(r.seams.y[0] < textTop, `seam at ${r.seams.y[0]}`);
  const overText = r.joints.filter((j) => j.seam === 'y' && Math.abs(j.center[0] - 500) < 300);
  assert.ok(overText.length >= 2);
  for (const j of overText) assert.equal(j.side, -1, `joint at ${j.center[0].toFixed(0)}`);
});

test('edge patterns run along every seam, even ones that touch artwork', () => {
  for (const joint of ['wave', 'zigzag', 'finger', 'scallop']) {
    const r = splitSvg(example('mountains'), { width: 1000, joint });
    for (const at of r.seams.x)
      assert.ok(
        r.joints.some((j) => j.seam === 'x' && Math.abs(j.center[0] - at) < 1),
        `${joint} seam at ${at.toFixed(0)}`,
      );
  }
});

test('joint depth is set apart from joint width', () => {
  for (const joint of ['star', 'arrow']) {
    const base = splitSvg(rectSvg(1000, 250), {
      width: 1000,
      joint,
      jointSize: 30,
      jointDepth: 20,
    });
    const wide = splitSvg(rectSvg(1000, 250), {
      width: 1000,
      joint,
      jointSize: 50,
      jointDepth: 20,
    });
    assert.ok(base.joints.length > 0 && wide.joints.length > 0);
    for (const j of wide.joints) assert.equal(j.depth, 20);
    assert.ok(wide.joints[0].width > base.joints[0].width);
  }
  const auto = splitSvg(rectSvg(1000, 250), { width: 1000, joint: 'star', jointSize: 30 });
  assert.equal(auto.joints[0].depth, 30 * JOINTS.find((j) => j.id === 'star').aspect);
  assert.throws(() => splitSvg(rectSvg(1000, 250), { width: 1000, jointDepth: 1 }), SplitError);
});

test('artwork is clipped onto the pieces it falls on', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000mm" height="200mm" viewBox="0 0 1000 200">
    <rect width="1000" height="200" fill="none" stroke="#ff0000"/>
    <path d="M50 100H950" stroke="#000000" fill="none"/>
    <rect x="40" y="40" width="920" height="20" fill="#0000ff"/>
  </svg>`;
  const r = splitSvg(svg, { joint: 'straight' });
  const pieces = r.parts.filter((p) => p.kind === 'piece');
  assert.ok(pieces.length >= 2);
  for (const p of pieces) {
    assert.ok(p.details.some((d) => !d.filled && d.color === '#000000'));
    assert.ok(p.details.some((d) => d.filled && d.color === '#0000ff'));
  }
  const lineLength = pieces
    .flatMap((p) => p.details.filter((d) => !d.filled))
    .reduce((n, d) => n + Math.abs(d.points.at(-1)[0] - d.points[0][0]), 0);
  assert.ok(Math.abs(lineLength - 900) < 1);
  assert.ok(r.sheets.every((s) => s.svg.includes('id="engrave"')));
});

test('engrave colours turn closed outlines into artwork', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600mm" height="200mm" viewBox="0 0 600 200">
    <rect width="600" height="200" fill="none" stroke="red"/>
    <circle cx="300" cy="100" r="50" fill="none" stroke="blue"/>
  </svg>`;
  const cut = splitSvg(svg, { joint: 'straight' });
  const engraved = splitSvg(svg, { joint: 'straight', engrave: ['#00f'] });
  const total = (r) => r.parts.reduce((n, p) => n + p.area, 0);
  assert.ok(total(cut) < total(engraved) - 7000);
});

test('filled silhouettes work without any outlines', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="100mm" viewBox="0 0 200 100"><path d="M0 0H200V100H0Z M80 30H120V70H80Z" fill-rule="evenodd"/></svg>`;
  const r = splitSvg(svg, { width: 1000, joint: 'arrow' });
  assert.equal(r.width, 1000);
  assert.ok(r.parts.reduce((n, p) => n + p.area, 0) < 1000 * 500);
  assert.ok(r.columns >= 2);
});

test('splitPolygons accepts contours in millimetres', () => {
  const r = splitPolygons(
    [
      [
        [0, 0],
        [700, 0],
        [700, 200],
        [0, 200],
      ],
    ],
    { joint: 'heart', bed: '400x400' },
  );
  assert.equal(r.columns, 2);
  assert.ok(r.joints.length >= 1);
});

test('results are deterministic', () => {
  const a = splitSvg(example('cloud'), { width: 1000, joint: 'star' });
  const b = splitSvg(example('cloud'), { width: 1000, joint: 'star' });
  assert.equal(a.assembly, b.assembly);
  assert.deepEqual(
    a.sheets.map((s) => s.svg),
    b.sheets.map((s) => s.svg),
  );
});

test('sheet files are well-formed SVG sized to the bed', () => {
  const r = splitSvg(example('mountains'), { width: 1000 });
  for (const s of r.sheets) {
    assert.match(
      s.svg,
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="508mm" height="304.8mm" viewBox="0 0 508 304.8">/,
    );
    assert.match(s.svg, /<g id="cut" fill="none" stroke="#ff0000"/);
    assert.match(s.svg, /<g id="labels"/);
    assert.ok(s.svg.trim().endsWith('</svg>'));
  }
  const off = splitSvg(example('mountains'), { width: 1000, labels: false });
  assert.ok(off.sheets.every((s) => !s.svg.includes('id="labels"')));
});

test('a design that already fits is returned whole', () => {
  const r = splitSvg(rectSvg(200, 100));
  assert.equal(r.parts.length, 1);
  assert.equal(r.seams.x.length + r.seams.y.length, 0);
  assert.equal(r.sheets.length, 1);
});

test('beds resolve from presets, strings and objects', () => {
  const preset = resolveBed('12x20in');
  assert.ok(Math.abs(preset.width - 508) < 1e-9 && Math.abs(preset.height - 304.8) < 1e-9);
  assert.deepEqual(resolveBed('400x300'), { width: 400, height: 300 });
  assert.deepEqual(resolveBed('30x20cm'), { width: 300, height: 200 });
  assert.deepEqual(resolveBed({ width: 600, height: 400 }), { width: 600, height: 400 });
  assert.ok(BEDS.length >= 8);
  assert.throws(() => resolveBed('huge'), SplitError);
  assert.throws(() => resolveBed({ width: 5, height: 5 }), SplitError);
});

test('every joint has an icon and metadata', () => {
  for (const j of JOINTS) {
    assert.ok(j.name && j.description);
    assert.match(jointIcon(j.id), /^M/);
  }
});

test('bad input fails with clear errors', () => {
  assert.throws(() => splitSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'), SplitError);
  assert.throws(() => splitSvg(rectSvg(100, 100), { joint: 'nope' }), /Unknown joint/);
  assert.throws(() => splitSvg(rectSvg(100, 100), { kerf: -1 }), /kerf/);
  assert.throws(
    () =>
      splitSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm"><script>alert(1)</script><rect width="5" height="5"/></svg>',
      ),
    /Active SVG content/,
  );
});

test('unsupported elements are skipped with a note', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600mm" height="200mm" viewBox="0 0 600 200"><rect width="600" height="200" fill="none" stroke="red"/><text x="10" y="50">Hi</text></svg>`;
  const r = splitSvg(svg, { bed: '400x400' });
  assert.ok(r.issues.some((i) => i.code === 'UNSUPPORTED_SKIPPED'));
});

test('zip writes a readable archive', () => {
  const data = zip([
    { name: 'a.svg', data: '<svg/>' },
    { name: 'b.txt', data: 'hello' },
  ]);
  const view = new DataView(data.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = data.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  assert.ok(new TextDecoder().decode(data).includes('hello'));
});
