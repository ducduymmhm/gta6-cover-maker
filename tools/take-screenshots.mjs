// Takes the entry's screenshots by driving the real editor in Chromium (Playwright, not a dependency of the app):
// serves app/ with serve.ts, loads the sample photos through the file input, picks layout, grade and size, types
// the caption, clicks Export and keeps the PNG the app downloaded, then scales that PNG to a JPEG under 256 KiB.
// Usage: node tools/take-screenshots.mjs [outDir] [pngDir]   (defaults: screenshots/ and a temp folder)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = process.argv[2] ?? join(root, 'screenshots');
const pngDir = process.argv[3] ?? join(tmpdir(), 'heatwave-exports');
mkdirSync(pngDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const PORT = 8123;
const MAX_BYTES = 256 * 1024;

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const COVERS = [
  { file: '3-cover-portrait.jpg', size: 'portrait', layout: 'six', grade: 'neon', caption: 'Boulevard\nQueen', tagline: 'Nights belong to her', badge: 'BQ', fit: [1024, 1280] },
  { file: '4-cover-square.jpg', size: 'square', layout: 'trio', grade: 'dawn', caption: 'Pier Pressure', tagline: 'The last cast', badge: 'PP', fit: [1080, 1080] },
  { file: '1-cover.jpg', size: 'landscape', layout: 'five', grade: 'sunset', caption: 'Sunset Heist', tagline: 'Only in Palm Coast', badge: 'HW', fit: [1280, 720] },
];

/** Scales an exported PNG to a JPEG inside `fit`, lowering quality until it is under the size cap. */
async function pngToJpeg(page, pngPath, [fw, fh]) {
  const dataUrl = `data:image/png;base64,${readFileSync(pngPath).toString('base64')}`;
  const base64 = await page.evaluate(async ({ dataUrl, fw, fh, maxBytes }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, fw / img.width, fh / img.height);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (let q = 0.9; q > 0.3; q -= 0.04) {
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
      if (blob.size <= maxBytes) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      }
    }
    throw new Error('could not fit under the cap');
  }, { dataUrl, fw, fh, maxBytes: MAX_BYTES });
  return Buffer.from(base64, 'base64');
}

async function setUpCover(page, cover) {
  await page.click(`[data-size="${cover.size}"]`);
  await page.click(`[data-layout="${cover.layout}"]`);
  await page.click(`[data-grade="${cover.grade}"]`);
  await page.fill('#captionInput', cover.caption);
  await page.fill('#taglineInput', cover.tagline);
  await page.fill('#badgeInput', cover.badge);
  await page.waitForTimeout(400);
}

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  page.on('console', (m) => { if (m.type() === 'error') console.log('page error:', m.text()); });
  page.on('pageerror', (e) => console.log('page exception:', e.message));
  page.on('request', (r) => { if (!r.url().startsWith(`http://localhost:${PORT}`) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) console.log('EXTERNAL REQUEST', r.url()); });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('body[data-ready="true"]');
  await page.setInputFiles('#photoInput', [join(root, 'app/samples/boulevard.jpg'), join(root, 'app/samples/pier.jpg')]);
  await page.waitForTimeout(500);

  for (const cover of COVERS) {
    await setUpCover(page, cover);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportButton')]);
    const pngPath = join(pngDir, download.suggestedFilename());
    await download.saveAs(pngPath);
    const jpeg = await pngToJpeg(page, pngPath, cover.fit);
    writeFileSync(join(outDir, cover.file), jpeg);
    console.log(`${cover.file}: from ${download.suggestedFilename()}, ${jpeg.length} bytes`);
  }

  // The editor at work: the landscape sunset cover just exported, a side panel selected and reframed by dragging.
  const box = await page.locator('#coverPreview').boundingBox();
  await page.mouse.move(box.x + box.width * 0.88, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.86, box.y + box.height * 0.28, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  for (let q = 85; q > 30; q -= 5) {
    const shot = await page.screenshot({ type: 'jpeg', quality: q });
    if (shot.length <= MAX_BYTES) { writeFileSync(join(outDir, '2-editor.jpg'), shot); console.log(`2-editor.jpg: ${shot.length} bytes`); break; }
  }
  await browser.close();
} finally {
  server.kill();
}
