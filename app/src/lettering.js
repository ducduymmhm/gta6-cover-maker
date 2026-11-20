// Poster lettering: the big condensed title (Anton, OFL) with glow, a solid extruded drop shadow, a heavy outline
// and a gradient face; the script tagline (Pacifico, OFL) slapped across it in neon; and the app's own small badge,
// a striped retro sun with the user's monogram. All original, no game logotype.

export const TITLE_FONT = 'Anton';
export const SCRIPT_FONT = 'Pacifico';
const TITLE_TILT = -0.05;
const TITLE_SKEW = -0.13;

/** Waits for the bundled display fonts so the first drawn cover never falls back to a system font. */
export async function loadLetteringFonts() {
  await Promise.all([
    document.fonts.load(`100px "${TITLE_FONT}"`, 'ABC'),
    document.fonts.load(`40px "${SCRIPT_FONT}"`, 'Abc'),
  ]);
}

/** Splits a caption into one or two lines; an explicit line break wins, else the split nearest the middle. */
export function splitTitleLines(text) {
  const clean = text.toUpperCase().trim();
  if (!clean) return [];
  if (clean.includes('\n')) return clean.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const words = clean.split(/\s+/);
  if (words.length < 2 || clean.length < 11) return [clean];
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

/** Picks the font size at which the lines fill the title box, trying both one and two lines for a long caption. */
export function fitTitleLines(ctx, text, box) {
  ctx.font = `100px "${TITLE_FONT}"`;
  const capRatio = ctx.measureText('H').actualBoundingBoxAscent / 100;
  const options = [splitTitleLines(text)];
  const single = text.toUpperCase().replace(/\s*\n\s*/g, ' ').trim();
  if (options[0].length > 1 && !text.includes('\n')) options.push([single]);
  let best = { lines: [], size: 0, capRatio };
  for (const lines of options) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width / 100));
    const lineAdvance = capRatio * 1.16;
    const byHeight = box.h / (capRatio + lineAdvance * (lines.length - 1));
    const size = Math.min(box.w / (widest * 1.08), byHeight);
    if (size > best.size) best = { lines, size, capRatio };
  }
  return best;
}

function setTitleTransform(ctx, box) {
  ctx.translate(box.cx, box.cy);
  ctx.rotate(TITLE_TILT);
  ctx.transform(1, 0, TITLE_SKEW, 1, 0, 0);
}

/**
 * Draws the caption as poster lettering centred in `box` (cx, cy, w, h in pixels). Returns where it landed, so
 * the tagline can overlap its lower edge.
 */
export function drawTitleLettering(ctx, text, box, grade, unit) {
  const { lines, size, capRatio } = fitTitleLines(ctx, text, box);
  if (!lines.length) return null;
  const cap = capRatio * size;
  const advance = cap * 1.16;
  const blockH = cap + advance * (lines.length - 1);
  const baselines = lines.map((_, i) => -blockH / 2 + cap + i * advance);
  const outline = size * 0.085;
  const depth = size * 0.085;

  ctx.save();
  setTitleTransform(ctx, box);
  ctx.font = `${size}px "${TITLE_FONT}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  // Neon halo behind everything.
  ctx.save();
  ctx.shadowColor = grade.titleGlow;
  ctx.shadowBlur = size * 0.45;
  ctx.strokeStyle = grade.titleGlow;
  ctx.lineWidth = outline * 2;
  ctx.globalAlpha = 0.75;
  lines.forEach((line, i) => ctx.strokeText(line, depth, baselines[i] + depth));
  ctx.restore();

  // Solid extrusion: outlined in black, filled with the grade's shadow colour.
  const steps = Math.max(2, Math.ceil(depth / Math.max(1, unit)));
  ctx.strokeStyle = '#07030a';
  ctx.lineWidth = outline * 1.6;
  for (let s = steps; s >= 0; s--) {
    const d = (depth * s) / steps;
    lines.forEach((line, i) => ctx.strokeText(line, d * 0.7, baselines[i] + d));
  }
  ctx.fillStyle = grade.titleShadow;
  ctx.strokeStyle = grade.titleShadow;
  ctx.lineWidth = outline * 0.5;
  for (let s = steps; s >= 1; s--) {
    const d = (depth * s) / steps;
    lines.forEach((line, i) => {
      ctx.strokeText(line, d * 0.7, baselines[i] + d);
      ctx.fillText(line, d * 0.7, baselines[i] + d);
    });
  }

  // Front face: heavy outline, gradient fill, thin bright inline.
  ctx.strokeStyle = '#07030a';
  ctx.lineWidth = outline;
  lines.forEach((line, i) => ctx.strokeText(line, 0, baselines[i]));
  lines.forEach((line, i) => {
    const face = ctx.createLinearGradient(0, baselines[i] - cap, 0, baselines[i]);
    face.addColorStop(0, grade.titleFill[0]);
    face.addColorStop(0.5, grade.titleFill[1]);
    face.addColorStop(1, grade.titleFill[2]);
    ctx.fillStyle = face;
    ctx.fillText(line, 0, baselines[i]);
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, size * 0.012);
  lines.forEach((line, i) => ctx.strokeText(line, 0, baselines[i]));
  ctx.restore();

  const widest = Math.max(...lines.map((l) => {
    ctx.font = `${size}px "${TITLE_FONT}"`;
    return ctx.measureText(l).width;
  }));
  return { size, width: widest, top: box.cy - blockH / 2, bottom: box.cy + blockH / 2 + depth, cx: box.cx };
}

/** The script tagline, tilted and glowing, overlapping the bottom right of the title. */
export function drawTaglineScript(ctx, text, title, w, h, grade, unit) {
  const words = text.trim();
  if (!words) return;
  const box = title ?? { size: h * 0.2, width: w * 0.6, bottom: h * 0.85, cx: w / 2 };
  let size = Math.max(14 * unit, box.size * 0.36);
  ctx.save();
  ctx.font = `${size}px "${SCRIPT_FONT}"`;
  const maxW = w * 0.82;
  const measured = ctx.measureText(words).width;
  if (measured > maxW) size *= maxW / measured;
  ctx.font = `${size}px "${SCRIPT_FONT}"`;
  const textW = ctx.measureText(words).width;
  let x = box.cx + box.width * 0.42 - textW / 2;
  x = Math.min(Math.max(x, textW / 2 + w * 0.05), w - textW / 2 - w * 0.05);
  const y = Math.min(box.bottom + size * 0.12, h - size * 0.55);
  ctx.translate(x, y);
  ctx.rotate(-0.09);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.shadowColor = grade.taglineGlow;
  ctx.shadowBlur = size * 0.5;
  ctx.strokeStyle = '#07030a';
  ctx.lineWidth = size * 0.2;
  ctx.strokeText(words, size * 0.05, size * 0.08);
  ctx.shadowBlur = 0;
  ctx.fillStyle = grade.tagline;
  ctx.shadowColor = grade.taglineGlow;
  ctx.shadowBlur = size * 0.35;
  ctx.fillText(words, 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.strokeText(words, 0, 0);
  ctx.restore();
}

/** The app's own badge: a round retro sun cut by stripes, ringed, with a short monogram across its foot. */
export function drawOriginalBadge(ctx, x, y, r, monogram, grade) {
  const label = monogram.trim().toUpperCase().slice(0, 4);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = r * 0.35;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0610';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, y - r, 0, y + r);
  sky.addColorStop(0, grade.sky[0]);
  sky.addColorStop(1, '#1a0526');
  ctx.fillStyle = sky;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const sunY = y - r * 0.08;
  const sun = ctx.createLinearGradient(0, sunY - r * 0.55, 0, sunY + r * 0.3);
  sun.addColorStop(0, '#fff2a0');
  sun.addColorStop(1, grade.accents[0]);
  ctx.beginPath();
  ctx.arc(x, sunY, r * 0.55, Math.PI, 0);
  ctx.fillStyle = sun;
  ctx.fill();
  ctx.fillStyle = '#1a0526';
  for (let i = 0; i < 4; i++) {
    const stripeY = sunY - r * 0.06 - i * r * 0.11;
    ctx.fillRect(x - r, stripeY, r * 2, r * (0.03 + 0.012 * (3 - i)));
  }
  ctx.fillStyle = '#07030a';
  ctx.fillRect(x - r, sunY, r * 2, r);
  ctx.restore();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = grade.titleFill[1];
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  if (label) {
    let size = r * 0.62;
    ctx.font = `${size}px "${TITLE_FONT}"`;
    const tw = ctx.measureText(label).width;
    if (tw > r * 1.3) size *= (r * 1.3) / tw;
    ctx.font = `${size}px "${TITLE_FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#07030a';
    ctx.strokeText(label, x, y + r * 0.62);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, y + r * 0.62);
  }
  ctx.restore();
}
