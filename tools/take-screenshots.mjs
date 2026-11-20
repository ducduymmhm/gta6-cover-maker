// Takes the entry's screenshots by driving the real editor in Chromium (Playwright, not a dependency of the app):
// serves app/ with serve.ts, loads four photos of four different people through the app's file input (the app
// deals them across the cast grid itself), picks layout, grade and size, types the caption, clicks Export and
// keeps the PNG the app downloaded, then scales that PNG to a JPEG under 256 KiB.
// Usage: node tools/take-screenshots.mjs <photoDir> [outDir] [pngDir]
//   photoDir holds driver.jpg, mech.jpg, boulevard.jpg and pier.jpg (free-to-use, AI-generated people; they are
//   read from there and never copied into the repository). Defaults: screenshots/ and out/exports/.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const photoDir = process.argv[2];
if (!photoDir) throw new Error('usage: node tools/take-screenshots.mjs <photoDir> [outDir] [pngDir]');
const outDir = process.argv[3] ?? join(root, 'screenshots');
const pngDir = process.argv[4] ?? join(root, 'out', 'exports');
mkdirSync(pngDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const PORT = 8123;
const MAX_BYTES = 256 * 1024;
const PHOTOS = ['driver.jpg', 'mech.jpg', 'boulevard.jpg', 'pier.jpg'].map((f) => join(photoDir, f));

const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));

const COVERS = [
  {
    file: '3-cover-portrait.jpg', size: 'portrait', layout: 'eight', grade: 'neon', caption: 'Neon Tide',
    tagline: 'Nobody sleeps in Palm Coast', badge: 'NT', release: 'Coming soon', fit: [1024, 1280],
    quote: 'The crime saga of the summer', source: 'Night Owl Weekly',
  },
  {
    file: '4-cover-square.jpg', size: 'square', layout: 'seven', grade: 'golden', caption: 'Pier Pressure',
    tagline: 'One last score', badge: 'PP', release: 'Summer 2027', fit: [1080, 1080],
    quote: 'Pure golden-hour mayhem', source: 'Coastline Review',
  },
  {
    file: '1-cover.jpg', size: 'landscape', layout: 'eight', grade: 'sunset', caption: 'Sunset Heist',
    tagline: 'Only in Palm Coast', badge: 'HW', release: 'Coming soon', fit: [1280, 720],
    quote: 'A sun-soaked, neon-drenched thrill ride', source: 'Palm Coast Herald',
  },
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
    for (let q = 0.92; q > 0.3; q -= 0.03) {
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
  await page.fill('#quoteInput', cover.quote);
  await page.fill('#quoteSourceInput', cover.source);
  await page.fill('#releaseInput', cover.release);
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
  await page.setInputFiles('#photoInput', PHOTOS);
  await page.waitForTimeout(800);

  for (const cover of COVERS) {
    await setUpCover(page, cover);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportButton')]);
    const pngPath = join(pngDir, download.suggestedFilename());
    await download.saveAs(pngPath);
    const jpeg = await pngToJpeg(page, pngPath, cover.fit);
    writeFileSync(join(outDir, cover.file), jpeg);
    console.log(`${cover.file}: from ${download.suggestedFilename()}, ${jpeg.length} bytes`);
  }

  // The editor at work on the landscape cover just exported: a side panel selected and reframed by dragging.
  const box = await page.locator('#coverPreview').boundingBox();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.255, box.y + box.height * 0.32, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  for (let q = 88; q > 30; q -= 4) {
    const shot = await page.screenshot({ type: 'jpeg', quality: q });
    if (shot.length <= MAX_BYTES) { writeFileSync(join(outDir, '2-editor.jpg'), shot); console.log(`2-editor.jpg: ${shot.length} bytes`); break; }
  }
  await browser.close();
} finally {
  server.kill();
}
