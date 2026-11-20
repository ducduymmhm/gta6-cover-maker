// Poster lettering, all original (no game logotype): the stacked key-art title in Anton (OFL), each line sized to
// the same width, with a neon glow, a hard offset drop shadow, a solid extrusion, a light rim and a chrome-over-
// sunset face cut by horizontal stripes; and the neon script tagline in Pacifico (OFL) slapped across its foot.
import { hexWithAlpha, mixHexColors } from './grades.js';

export const TITLE_FONT = 'Anton';
export const SCRIPT_FONT = 'Pacifico';
const TITLE_TILT = -0.045;
const TITLE_SKEW = -0.12;
/** The largest line may be at most this many times the smallest, so one short word never towers over the rest. */
const MAX_LINE_SIZE_RATIO = 1.5;
/** Space between stacked lines, as a fraction of the upper line's cap height. */
const LINE_GAP = 0.2;

/** Waits for the bundled display fonts so the first drawn cover never falls back to a system font. */
export async function loadLetteringFonts() {
  await Promise.all([
    document.fonts.load(`100px "${TITLE_FONT}"`, 'ABC'),
    document.fonts.load(`40px "${SCRIPT_FONT}"`, 'Abc'),
  ]);
}

/** Splits a caption into stacked lines: an explicit line break wins, else the word split nearest the middle. */
export function splitTitleLines(text) {
  const clean = text.toUpperCase().trim();
  if (!clean) return [];
  if (clean.includes('\n')) return clean.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const words = clean.split(/\s+/);
  if (words.length < 2 || clean.length < 8) return [clean];
  let best = [clean];
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

/**
 * Sizes each stacked line so all lines share one width (the classic key-art stack), then shrinks the whole block
 * until it fits the title box's height. Returns the lines, their font sizes and the cap-height ratio of the font.
 */
export function fitStackedTitle(ctx, text, box) {
  const lines = splitTitleLines(text);
  if (!lines.length) return null;
  ctx.font = `100px "${TITLE_FONT}"`;
  const capRatio = ctx.measureText('H').actualBoundingBoxAscent / 100;
  const unitWidths = lines.map((line) => ctx.measureText(line).width / 100);
  let sizes = unitWidths.map((uw) => box.w / uw);
  const smallest = Math.min(...sizes);
  sizes = sizes.map((s) => Math.min(s, smallest * MAX_LINE_SIZE_RATIO));
  const blockHeight = (list) => list.reduce((sum, s, i) => sum + s * capRatio * (i < list.length - 1 ? 1 + LINE_GAP : 1), 0);
  const fit = Math.min(1, box.h / blockHeight(sizes));
  sizes = sizes.map((s) => s * fit);
  return { lines, sizes, capRatio, unitWidths, height: blockHeight(sizes) };
}

/**
 * The face of a title line: chrome in the upper half (white to steel), a hard horizon, then a sunset running down
 * the lower half, cut by dark horizontal stripes that thicken toward the baseline like a retro sun.
 */
function buildStripedFace(ctx, top, bottom, grade) {
  const [c0, c1, c2] = grade.titleChrome;
  const [s0, s1, s2] = grade.titleSun;
  const horizon = 0.5;
  const sunAt = (t) => {
    const k = (t - horizon) / (1 - horizon);
    return k < 0.5 ? mixHexColors(s0, s1, k * 2) : mixHexColors(s1, s2, (k - 0.5) * 2);
  };
  const face = ctx.createLinearGradient(0, top, 0, bottom);
  face.addColorStop(0, c0);
  face.addColorStop(0.2, c1);
  face.addColorStop(horizon - 0.005, c2);
  face.addColorStop(horizon, s0);
  const stripes = [[0.62, 0.028], [0.73, 0.036], [0.83, 0.045], [0.92, 0.055]];
  for (const [at, thick] of stripes) {
    face.addColorStop(at, sunAt(at));
    face.addColorStop(at, grade.titleStripe);
    face.addColorStop(at + thick, grade.titleStripe);
    face.addColorStop(at + thick, sunAt(at + thick));
  }
  face.addColorStop(1, s2);
  return face;
}

/** Strokes then fills one line of text with the current styles. */
function strokeAndFill(ctx, line, x, y) {
  ctx.strokeText(line, x, y);
  ctx.fillText(line, x, y);
}

/** A small four-point glint, for the chrome highlights on the title. */
function drawGlint(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = r * 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r * 0.9, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r * 0.9, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws the caption as stacked key-art lettering centred in `box` (cx, cy, w, h in pixels). Each line is drawn
 * whole (glow, drop shadow, extrusion, rim, outline, striped face) before the next, so lower lines stack over the
 * shadows of the ones above. Returns where the block landed, for the tagline.
 */
export function drawStripedTitle(ctx, text, box, grade, unit) {
  const fit = fitStackedTitle(ctx, text, box);
  if (!fit) return null;
  const { lines, sizes, capRatio, unitWidths, height } = fit;
  let y = -height / 2;
  const baselines = sizes.map((size, i) => {
    y += size * capRatio;
    const base = y;
    if (i < sizes.length - 1) y += size * capRatio * LINE_GAP;
    return base;
  });

  ctx.save();
  ctx.translate(box.cx, box.cy);
  ctx.rotate(TITLE_TILT);
  ctx.transform(1, 0, TITLE_SKEW, 1, 0, 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  lines.forEach((line, i) => {
    const size = sizes[i];
    const base = baselines[i];
    const cap = size * capRatio;
    const outline = size * 0.07;
    const depth = size * 0.075;
    ctx.font = `${size}px "${TITLE_FONT}"`;

    // Neon halo.
    ctx.save();
    ctx.shadowColor = grade.titleGlow;
    ctx.shadowBlur = size * 0.4;
    ctx.strokeStyle = hexWithAlpha(grade.titleGlow, 0.8);
    ctx.lineWidth = outline * 2.4;
    ctx.strokeText(line, depth, base + depth);
    ctx.restore();

    // Hard drop shadow: a flat, unblurred copy pushed well down and right.
    ctx.fillStyle = '#05020a';
    ctx.strokeStyle = '#05020a';
    ctx.lineWidth = outline * 2.2;
    strokeAndFill(ctx, line, depth * 2.1, base + depth * 2.3);

    // Solid extrusion in the grade's shadow colour, outlined in black.
    const steps = Math.max(3, Math.ceil(depth / Math.max(1, unit)));
    ctx.strokeStyle = '#05020a';
    ctx.lineWidth = outline * 1.7;
    for (let s = steps; s >= 0; s--) ctx.strokeText(line, (depth * s) / steps * 0.8, base + (depth * s) / steps);
    ctx.fillStyle = grade.titleShadow;
    ctx.strokeStyle = grade.titleShadow;
    ctx.lineWidth = outline * 0.5;
    for (let s = steps; s >= 1; s--) strokeAndFill(ctx, line, (depth * s) / steps * 0.8, base + (depth * s) / steps);

    // Light rim outside the black outline, then the outline and the striped chrome face.
    ctx.strokeStyle = grade.titleChrome[0];
    ctx.lineWidth = outline * 1.55;
    ctx.strokeText(line, 0, base);
    ctx.strokeStyle = '#05020a';
    ctx.lineWidth = outline;
    ctx.strokeText(line, 0, base);
    ctx.fillStyle = buildStripedFace(ctx, base - cap, base, grade);
    ctx.fillText(line, 0, base);

    // Thin inline highlight on the chrome.
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, size * 0.01);
    ctx.strokeText(line, 0, base);
    ctx.restore();

    if (i === 0) {
      const half = (unitWidths[i] * size) / 2;
      drawGlint(ctx, -half + size * 0.12, base - cap * 0.86, size * 0.12);
      drawGlint(ctx, half - size * 0.2, base - cap * 0.55, size * 0.08);
    }
  });
  ctx.restore();

  const widest = Math.max(...sizes.map((s, i) => s * unitWidths[i]));
  const last = sizes.length - 1;
  return {
    size: sizes[last],
    width: widest,
    top: box.cy - height / 2,
    bottom: box.cy + height / 2 + sizes[last] * 0.1,
    cx: box.cx,
  };
}

/**
 * The script tagline, tilted and glowing, slapped across the lower right of the title. `maxY` keeps its lower
 * edge clear of the billing block.
 */
export function drawTaglineScript(ctx, text, title, w, h, grade, unit, maxY = h) {
  const words = text.trim();
  if (!words) return;
  const box = title ?? { size: h * 0.2, width: w * 0.6, bottom: h * 0.85, cx: w / 2 };
  let size = Math.max(16 * unit, Math.min(box.size * 0.4, 96 * unit));
  ctx.save();
  ctx.font = `${size}px "${SCRIPT_FONT}"`;
  const maxW = Math.min(w * 0.8, box.width * 1.05);
  const measured = ctx.measureText(words).width;
  if (measured > maxW) size *= maxW / measured;
  ctx.font = `${size}px "${SCRIPT_FONT}"`;
  const textW = ctx.measureText(words).width;
  let x = box.cx + box.width * 0.5 - textW / 2 + size * 0.4;
  x = Math.min(Math.max(x, textW / 2 + w * 0.04), w - textW / 2 - w * 0.04);
  const y = Math.min(box.bottom - size * 0.05, maxY - size * 0.75);
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = grade.taglineGlow;
  ctx.shadowBlur = size * 0.5;
  ctx.strokeStyle = '#07030a';
  ctx.lineWidth = size * 0.22;
  ctx.strokeText(words, size * 0.05, size * 0.08);
  ctx.shadowBlur = 0;
  ctx.fillStyle = grade.tagline;
  ctx.shadowColor = grade.taglineGlow;
  ctx.shadowBlur = size * 0.35;
  ctx.fillText(words, 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeText(words, 0, 0);
  ctx.restore();
}
