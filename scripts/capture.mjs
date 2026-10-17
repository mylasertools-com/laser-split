import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';

const port = 4191,
  base = `http://127.0.0.1:${port}`,
  frames = 'test-results/frames';
await rm(frames, { recursive: true, force: true });
await mkdir(frames, { recursive: true });
await mkdir('docs/assets', { recursive: true });
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
const pad = (n) => String(n).padStart(4, '0');
function gif(name, fps, width) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-framerate',
      String(fps),
      '-i',
      `${frames}/${name}-%04d.png`,
      '-vf',
      `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
      `docs/assets/${name}.gif`,
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw Error(`ffmpeg failed for ${name}`);
}
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/demo/')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const el = page.locator('laser-split');
  const stage = el.locator('.stage');
  const settle = () =>
    page.waitForFunction(() => {
      const s = document.querySelector('laser-split')?.shadowRoot?.querySelector('.stage');
      return s && !s.classList.contains('busy') && s.querySelector('svg');
    });

  // 1. One sign, many joints.
  await page.goto(base + '/demo/?sample=0');
  await settle();
  await el.scrollIntoViewIfNeeded();
  let n = 0;
  for (const joint of ['puzzle', 'heart', 'dovetail', 'bowtie', 'star', 'wave', 'arrow']) {
    await el.locator(`[data-joint=${joint}]`).click();
    await page.waitForTimeout(400);
    await settle();
    for (let i = 0; i < 5; i++) await stage.screenshot({ path: `${frames}/hero-${pad(n++)}.png` });
  }
  gif('hero', 4, 900);

  // 2. Drag a seam through the lettering and watch the joints step out of the way.
  await page.goto(base + '/demo/?sample=0');
  await settle();
  await el.scrollIntoViewIfNeeded();
  const hit = el.locator('.seam.y line.hit').first();
  const box = await hit.boundingBox();
  const x0 = box.x + box.width * 0.3,
    y0 = box.y + box.height / 2;
  n = 0;
  const shot = () => stage.screenshot({ path: `${frames}/drag-${pad(n++)}.png` });
  for (let i = 0; i < 4; i++) await shot();
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  const path = [
    ...Array.from({ length: 16 }, (_, i) => -5 * (i + 1)),
    ...Array.from({ length: 40 }, (_, i) => -80 + 5 * (i + 1)),
    ...Array.from({ length: 24 }, (_, i) => 120 - 5 * (i + 1)),
  ];
  for (const dy of path) {
    await page.mouse.move(x0, y0 + dy);
    await page.waitForTimeout(60);
    await shot();
  }
  await page.mouse.up();
  await settle();
  for (let i = 0; i < 6; i++) await shot();
  gif('drag', 12, 900);

  // 3. Sheets ready for the laser.
  await page.goto(base + '/demo/?sample=2');
  await settle();
  await el.locator('[data-view=sheets]').click();
  await page.waitForTimeout(300);
  await stage.screenshot({ path: 'docs/assets/sheets.png' });
  await el.locator('[data-view=assembly]').click();
  await settle();
  await el.screenshot({ path: 'docs/assets/workbench.png' });

  if (errors.length) throw Error(errors.join('\n'));
  console.log('docs/assets: hero.gif, drag.gif, sheets.png, workbench.png');
} finally {
  await browser?.close();
  server.kill();
}
