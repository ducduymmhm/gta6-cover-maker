// Image effects for the poster look: gradient-map colour grade, sky wash, per-panel light leaks, halftone print
// dots, bloom glow, vignette and film grain. Every effect is deterministic, so the preview matches the export.
import { buildGradientMapLut, hexWithAlpha } from './grades.js';
import { tracePolygon } from './layouts.js';

const lutCache = new Map();

/** The S-curve on luminance a grade's contrast asks for, as a 256-entry table. */
function buildContrastCurve(contrast) {
  const curve = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const stretched = Math.max(0, Math.min(1, (t - 0.5) * contrast + 0.5));
    const c = stretched * stretched * (3 - 2 * stretched) * 0.7 + stretched * 0.3;
    curve[i] = Math.max(0, Math.min(255, Math.round(c * 255)));
  }
  return curve;
}

/**
 * Auto-levels for one photo: stretches its 1st-99th luminance percentiles to the full range and bends the
 * mid-tones so its mean lands near 0.46. A dark club shot and a bright beach shot then enter the gradient map
 * with the same tonal spread, which is what makes very different photos read as one graded poster.
 */
function buildPanelLevels(px) {
  const hist = new Uint32Array(256);
  let count = 0;
  for (let p = 0; p < px.length; p += 16) {
    if (px[p + 3] < 200) continue;
    hist[(px[p] * 77 + px[p + 1] * 150 + px[p + 2] * 29) >> 8]++;
    count++;
  }
  const levels = new Uint8Array(256);
  if (count < 32) { for (let i = 0; i < 256; i++) levels[i] = i; return levels; }
  let lo = 0;
  let hi = 255;
  let seen = 0;
  for (let i = 0; i < 256; i++) { seen += hist[i]; if (seen >= count * 0.01) { lo = i; break; } }
  seen = 0;
  for (let i = 255; i >= 0; i--) { seen += hist[i]; if (seen >= count * 0.01) { hi = i; break; } }
  if (hi - lo < 40) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - 20); hi = Math.min(255, mid + 20); }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += hist[i] * Math.max(0, Math.min(1, (i - lo) / (hi - lo)));
  const mean = Math.max(0.05, Math.min(0.95, sum / count));
  const gamma = Math.max(0.55, Math.min(1.6, Math.log(0.46) / Math.log(mean)));
  for (let i = 0; i < 256; i++) {
    const t = Math.max(0, Math.min(1, (i - lo) / (hi - lo)));
    levels[i] = Math.round(Math.pow(t, gamma) * 255);
  }
  return levels;
}

/**
 * Grades one panel's pixels (an RGBA tile cut to the panel): its own auto-levels, then the grade's contrast
 * curve and gradient map, blended with the levelled colour by `strength`. Writes each pixel's graded luminance
 * into `luma` (cover-sized, for the halftone pass) at the tile's offset (ox, oy).
 */
export function gradePanelTile(image, grade, strength, luma, coverWidth, ox, oy) {
  if (!lutCache.has(grade.id)) lutCache.set(grade.id, buildGradientMapLut(grade.stops));
  const lut = lutCache.get(grade.id);
  const px = image.data;
  const levels = buildPanelLevels(px);
  const curve = buildContrastCurve(grade.contrast);
  const mix = Math.min(1, grade.mix * strength);
  const keep = 1 - mix;
  const tw = image.width;
  for (let p = 0, i = 0; p < px.length; p += 4, i++) {
    if (px[p + 3] === 0) continue;
    const r = levels[px[p]];
    const g = levels[px[p + 1]];
    const b = levels[px[p + 2]];
    const l = curve[(r * 77 + g * 150 + b * 29) >> 8];
    const o = l * 3;
    px[p] = r * keep + lut[o] * mix;
    px[p + 1] = g * keep + lut[o + 1] * mix;
    px[p + 2] = b * keep + lut[o + 2] * mix;
    const x = ox + (i % tw);
    const y = oy + ((i / tw) | 0);
    if (x >= 0 && x < coverWidth) luma[y * coverWidth + x] = l;
  }
}

/**
 * Sunlight leaking into the camera across the whole poster: a warm flare from the upper left, a magenta bleed
 * from the right edge and a faint diagonal streak, screened on so they only ever brighten.
 */
export function drawPosterLightLeaks(ctx, w, h, grade, amount) {
  if (amount <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const flare = ctx.createRadialGradient(w * 0.04, h * 0.02, 0, w * 0.04, h * 0.02, Math.max(w, h) * 0.42);
  flare.addColorStop(0, hexWithAlpha(grade.titleSun[1], 0.42 * amount));
  flare.addColorStop(0.45, hexWithAlpha(grade.titleSun[2], 0.14 * amount));
  flare.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, w, h);
  const bleed = ctx.createRadialGradient(w * 1.02, h * 0.55, 0, w * 1.02, h * 0.55, Math.max(w, h) * 0.38);
  bleed.addColorStop(0, hexWithAlpha(grade.accents[0], 0.34 * amount));
  bleed.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bleed;
  ctx.fillRect(0, 0, w, h);
  const streak = ctx.createLinearGradient(w * 0.18, 0, w * 0.42, h);
  streak.addColorStop(0, 'rgba(0,0,0,0)');
  streak.addColorStop(0.47, 'rgba(0,0,0,0)');
  streak.addColorStop(0.5, hexWithAlpha(grade.titleSun[0], 0.1 * amount));
  streak.addColorStop(0.53, 'rgba(0,0,0,0)');
  streak.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A soft oval vignette over the whole cover, pulling the eye to the centre. */
export function applyPosterVignette(ctx, w, h, strength) {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(w / Math.min(w, h), h / Math.min(w, h));
  const r = Math.min(w, h) * 0.72;
  const v = ctx.createRadialGradient(0, 0, r * 0.45, 0, 0, r);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = v;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
  ctx.restore();
}

/** A top-to-bottom wash in the grade's sky colours, soft-lit over the panels only. */
export function applySkyWash(ctx, w, h, grade, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = Math.min(1, strength);
  const wash = ctx.createLinearGradient(0, 0, w * 0.25, h);
  wash.addColorStop(0, grade.sky[0]);
  wash.addColorStop(1, grade.sky[1]);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Each panel gets a light leak from one corner in a rotating accent colour, and its own edge vignette. */
export function drawPanelLightLeaks(ctx, panels, grade, strength) {
  panels.forEach(({ polygon, box }, i) => {
    ctx.save();
    tracePolygon(ctx, polygon);
    ctx.clip();
    const fromRight = i % 2 === 0;
    const sx = fromRight ? box.x + box.w : box.x;
    const accent = grade.accents[i % grade.accents.length];
    // A soft-light tint keeps each panel's blacks deep while shifting its colour from its neighbours.
    const tint = ctx.createLinearGradient(box.x, box.y + box.h, box.x + box.w, box.y);
    tint.addColorStop(0, accent);
    tint.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.6 * strength;
    ctx.fillStyle = tint;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const leak = ctx.createRadialGradient(sx, box.y, 0, sx, box.y, Math.max(box.w, box.h) * 0.6);
    leak.addColorStop(0, accent);
    leak.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3 * strength;
    ctx.fillStyle = leak;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(box.w, box.h) * 0.3, cx, cy, Math.hypot(box.w, box.h) * 0.62);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.restore();
  });
}

/**
 * Print-style halftone: a 45-degree dot screen whose dots grow in the shadows, inked in the grade's dark colour
 * and stronger toward the bottom of the cover. `luma` comes from gradePanelTile.
 */
export function applyHalftone(ctx, w, h, luma, unit, grade, amount, panels) {
  if (amount <= 0) return;
  const cell = Math.max(3, 7 * unit);
  const cos = Math.SQRT1_2;
  const reach = Math.hypot(w, h);
  ctx.save();
  ctx.beginPath();
  panels.forEach(({ polygon }) => polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
  ctx.clip();
  ctx.beginPath();
  for (let u = 0; u < reach * 1.5; u += cell) {
    for (let v = -reach; v < reach; v += cell) {
      const x = (u - v) * cos;
      const y = (u + v) * cos;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const dark = 1 - luma[(y | 0) * w + (x | 0)] / 255;
      const fade = 0.35 + 0.65 * (y / h);
      const r = cell * 0.62 * Math.pow(dark, 1.4) * fade;
      if (r < 0.5) continue;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = amount;
  ctx.fillStyle = grade.halftoneInk;
  ctx.fill();
  ctx.restore();
}

/** Bloom: blurs the brightest parts of the canvas and screens them back on top, for a hazy neon glow. */
export function addBloomGlow(ctx, w, h, unit, amount) {
  if (amount <= 0) return;
  const glow = document.createElement('canvas');
  glow.width = Math.max(1, Math.round(w / 4));
  glow.height = Math.max(1, Math.round(h / 4));
  const g = glow.getContext('2d');
  g.filter = `brightness(0.9) contrast(2.2) blur(${Math.max(2, 6 * unit)}px)`;
  g.drawImage(ctx.canvas, 0, 0, glow.width, glow.height);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = amount * 0.5;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(glow, 0, 0, w, h);
  ctx.restore();
}

/** A seeded PRNG, so the grain is the same in the preview and in every export. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let grainTile = null;
function makeGrainTile() {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const g = tile.getContext('2d');
  const image = g.createImageData(256, 256);
  const random = mulberry32(1986);
  for (let p = 0; p < image.data.length; p += 4) {
    const v = 128 + (random() + random() + random() - 1.5) * 120;
    image.data[p] = image.data[p + 1] = image.data[p + 2] = v;
    image.data[p + 3] = 255;
  }
  g.putImageData(image, 0, 0);
  return tile;
}

/** Film grain over the whole cover, scaled with the cover so it reads the same at every export size. */
export function addFilmGrain(ctx, w, h, unit, amount) {
  if (amount <= 0) return;
  grainTile ??= makeGrainTile();
  const pattern = ctx.createPattern(grainTile, 'repeat');
  const scale = Math.max(1, unit * 1.2);
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = amount * 0.5;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
