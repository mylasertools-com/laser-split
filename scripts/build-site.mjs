import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
await mkdir('site', { recursive: true });
for (const name of await readdir('site'))
  if (name !== '.git') await rm(`site/${name}`, { recursive: true, force: true });
await mkdir('site/dist', { recursive: true });
await mkdir('site/examples', { recursive: true });
await cp('demo', 'site/demo', { recursive: true });
await cp('dist/element.js', 'site/dist/element.js');
for (const name of await readdir('examples'))
  if (name.endsWith('.svg')) await cp(`examples/${name}`, `site/examples/${name}`);
await writeFile(
  'site/index.html',
  '<!doctype html><meta http-equiv="refresh" content="0;url=./demo/"><a href="./demo/">Laser Split demo</a>',
);
await writeFile('site/.nojekyll', '');
console.log('Demo site written to site/');
