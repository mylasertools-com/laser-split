import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../dist/cli.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const input = new URL('../examples/welcome.svg', import.meta.url).pathname.replace(
  /^\/(\w:)/,
  '$1',
);

test('cli prints a JSON report', () => {
  const out = execFileSync(process.execPath, [cli, input, '--width', '1000', '--json'], {
    encoding: 'utf8',
  });
  const report = JSON.parse(out);
  assert.equal(report.width, 1000);
  assert.ok(report.sheets.length >= 2);
});

test('cli writes sheet files and an assembly map', () => {
  const dir = mkdtempSync(join(tmpdir(), 'laser-split-'));
  const run = spawnSync(
    process.execPath,
    [cli, input, '-w', '1000', '-j', 'dovetail', '-b', '600x400', '-o', dir],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  const files = readdirSync(dir);
  assert.ok(files.includes('welcome-assembly.svg'));
  const sheets = files.filter((f) => /^welcome-sheet-\d\d\.svg$/.test(f));
  assert.ok(sheets.length >= 2);
  assert.match(readFileSync(join(dir, sheets[0]), 'utf8'), /width="600mm" height="400mm"/);
});

test('cli rejects unknown options', () => {
  const run = spawnSync(process.execPath, [cli, input, '--bogus'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Unknown option --bogus/);
});
