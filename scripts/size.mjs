import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const budgets = { 'index.js': 45000, 'element.js': 60000 };
for (const [file, budget] of Object.entries(budgets)) {
  const source = readFileSync(new URL(`../dist/${file}`, import.meta.url));
  const bytes = gzipSync(source, { level: 9 }).length;
  console.log(
    `${file}: ${source.length.toLocaleString()} bytes minified / ${bytes.toLocaleString()} bytes gzip, Clipper2 included.`,
  );
  if (bytes > budget)
    throw new Error(`${file} exceeds the ${budget.toLocaleString()} byte gzip budget: ${bytes}`);
}
