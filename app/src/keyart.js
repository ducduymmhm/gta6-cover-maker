// Movie key-art furniture around the cast grid, all drawn by the app: the cover's frame plan (review banner on
// top, cast grid, title zone, billing block at the foot), the fade that lets the grid sink into the title zone,
// role tags on the panels, the review banner with its quote and stars, the condensed billing block with its
// release line, the rosette seal and the barcode strip.
import { TITLE_FONT } from './lettering.js';
import { hexWithAlpha, mixHexColors } from './grades.js';
import { mulberry32 } from './effects.js';
import { findLayout, tracePolygon } from './layouts.js';

/** Default role tags, dealt to each loaded photo in order (one person, one role). Every tag stays editable. */
export const DEFAULT_ROLE_TAGS = [
  'THE DRIVER', 'THE PILOT', 'THE BOSS', 'THE CAPTAIN', 'THE NIGHT OWL', 'THE MECHANIC', 'THE FIXER', 'THE LOOKOUT',
  'THE RIDER',
];

/** Words a billing block sets small and high, between the larger names. */
const SMALL_CREDIT_WORDS = new Set([
  'A', 'AN', 'THE', 'BY', 'OF', 'AND', 'IN', 'WITH', 'FILM', 'PRESENTS', 'STARRING', 'ASSOCIATION', 'PRODUCTION',
  'MUSIC', 'EDITED', 'PRODUCED', 'DIRECTED', 'WRITTEN', 'CASTING', 'DESIGN', 'PHOTOGRAPHY', 'DIRECTOR', 'EXECUTIVE',
  'COSTUMES', 'SCREENPLAY', '&', 'AT', 'ON',
]);

/**
 * Plans the cover: where the review banner, the cast grid's panel area, the title and the billing block go for a
 * w x h cover. With the title at the bottom (auto), the panel area stops partway down the title so the grid fades
 * under the lettering and the faces in the grid stay clear of it.
 */
export function computeKeyArtFrame(scene, w, h) {
  const unit = Math.min(w, h) / 1080;
  const aspect = w / h;
  const frame = Math.round(14 * unit);
  const gutter = Math.max(3, Math.round(9 * unit));
  const bannerH = scene.showBanner ? Math.round(58 * unit) : 0;
  const billingH = scene.showBilling ? Math.round((aspect > 1.4 ? 112 : 128) * unit) : 0;
  const wide = aspect > 1.4;
  // Square and landscape covers run the cast grid all the way down to the billing block; a portrait cover stops
  // it partway down the title. Either way only a soft window around the title is dissolved, so the side columns
  // keep framing the lettering and no face sits under it.
  // A hero-title layout (Cast 9) always runs to the billing block: its title is placed over the hero later, from
  // the layout's own title zone, and nothing is dissolved.
  const heroTitle = Boolean(findLayout(scene.layoutId).heroTitle);
  const gridToFloor = aspect >= 0.95 || heroTitle;
  const titleW = w * (wide ? 0.6 : gridToFloor ? 0.74 : 0.78);
  const titleH = h * (wide ? 0.39 : gridToFloor ? 0.3 : 0.25);
  const floor = h - frame - billingH;
  const titleBottom = floor - (billingH ? 30 : 56) * unit;
  const top = frame + bannerH;
  let titleCy = titleBottom - titleH / 2;
  let panelBottom = gridToFloor ? floor - (billingH ? gutter * 0.5 : 0) : titleBottom - titleH * 0.42;
  let fade = { top: titleBottom - titleH * (gridToFloor ? 0.86 : 0.95), bottom: panelBottom, span: titleW * 1.04, soft: w * 0.1 };
  if (heroTitle) fade = null;
  if (scene.titlePos === 'top' || scene.titlePos === 'center') {
    panelBottom = floor - (billingH ? gutter * 0.5 : 0);
    titleCy = scene.titlePos === 'top' ? top + titleH * 0.62 : (top + panelBottom) / 2;
    fade = null;
  }
  return {
    unit,
    frame,
    gutter,
    aspect,
    banner: bannerH ? { x: frame, y: frame, w: w - frame * 2, h: bannerH - Math.round(gutter * 0.6) } : null,
    area: { x: frame, y: top, w: w - frame * 2, h: panelBottom - top },
    title: { cx: w / 2, cy: titleCy, w: titleW, h: titleH },
    billing: billingH ? { x: frame, y: floor, w: w - frame * 2, h: billingH } : null,
    fade,
  };
}

/** The dark poster ground behind the grid (drawn under it), warming toward a sunset glow behind the title. */
export function drawKeyArtBackdrop(ctx, w, h, plan, grade) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  const glow = ctx.createRadialGradient(plan.title.cx, plan.title.cy, 0, plan.title.cx, plan.title.cy, plan.title.w * 0.75);
  glow.addColorStop(0, hexWithAlpha(grade.titleShadow, 0.9));
  glow.addColorStop(1, hexWithAlpha(grade.titleShadow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const ground = ctx.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, grade.gutter);
  ground.addColorStop(1, mixHexColors(grade.gutter, '#000000', 0.5));
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Dissolves the bottom of the cast grid (erasing it to transparent, before the backdrop goes underneath), so the
 * panels sink into the title zone with no hard edge.
 */
export function fadePanelBottoms(ctx, w, plan) {
  const { fade } = plan;
  if (!fade) return;
  const height = Math.ceil(fade.bottom - fade.top) + 1;
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = height;
  const m = mask.getContext('2d');
  const down = m.createLinearGradient(0, 0, 0, height);
  down.addColorStop(0, 'rgba(0,0,0,0)');
  down.addColorStop(0.45, 'rgba(0,0,0,0.5)');
  down.addColorStop(0.85, 'rgba(0,0,0,0.97)');
  down.addColorStop(1, 'rgba(0,0,0,1)');
  m.fillStyle = down;
  m.fillRect(0, 0, w, height);
  if (fade.span > 0) {
    // Limit the dissolve to a window around the title, feathered at its sides.
    const cx = plan.title.cx;
    const half = fade.span / 2;
    const across = m.createLinearGradient(cx - half - fade.soft, 0, cx + half + fade.soft, 0);
    const edge = fade.soft / (fade.span + fade.soft * 2);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(edge, 'rgba(0,0,0,1)');
    across.addColorStop(1 - edge, 'rgba(0,0,0,1)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    m.globalCompositeOperation = 'destination-in';
    m.fillStyle = across;
    m.fillRect(0, 0, w, height);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(mask, 0, Math.floor(fade.top));
  ctx.restore();
}

/**
 * Depth for the cast grid: a hairline light rim on every panel, then the hero lifted above the others with a
 * neon glow spilling into the gutters and a brighter sunset rim, so the eye lands on the centre first.
 */
export function drawHeroSpotlight(ctx, geometry, grade, unit) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,2,16,0.16)';
  geometry.panels.forEach((panel, i) => {
    if (i === geometry.hero) return;
    tracePolygon(ctx, panel.polygon);
    ctx.fill();
  });
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, 1.4 * unit);
  ctx.strokeStyle = 'rgba(255,240,230,0.28)';
  geometry.panels.forEach((panel, i) => {
    if (i === geometry.hero) return;
    tracePolygon(ctx, panel.polygon);
    ctx.stroke();
  });
  const hero = geometry.panels[geometry.hero];
  if (hero) {
    tracePolygon(ctx, hero.polygon);
    ctx.shadowColor = grade.titleGlow;
    ctx.shadowBlur = 34 * unit;
    ctx.lineWidth = 3.5 * unit;
    ctx.strokeStyle = hexWithAlpha(grade.titleGlow, 0.9);
    ctx.stroke();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const rim = ctx.createLinearGradient(hero.box.x, hero.box.y, hero.box.x + hero.box.w * 0.4, hero.box.y + hero.box.h);
    rim.addColorStop(0, grade.titleSun[0]);
    rim.addColorStop(0.5, grade.titleSun[1]);
    rim.addColorStop(1, grade.titleSun[2]);
    ctx.lineWidth = 2.5 * unit;
    ctx.strokeStyle = rim;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Darkens the cast grid under the title (an oval centred on the title box, deepest at its foot), so the lettering
 * reads against the hero's lower third without a hard band.
 */
export function drawTitleScrim(ctx, plan, geometry) {
  const t = plan.title;
  ctx.save();
  ctx.beginPath();
  geometry.panels.forEach(({ polygon }) => polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
  ctx.clip();
  ctx.translate(t.cx, t.cy + t.h * 0.2);
  ctx.scale(1, (t.h * 1.25) / (t.w * 0.62));
  const r = t.w * 0.62;
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  shade.addColorStop(0, 'rgba(6,2,12,0.72)');
  shade.addColorStop(0.55, 'rgba(6,2,12,0.5)');
  shade.addColorStop(1, 'rgba(6,2,12,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

/** A soft neon haze screened over the title zone, so the lettering sits in light rather than a black hole. */
export function drawTitleHaze(ctx, w, plan, grade) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const t = plan.title;
  const haze = ctx.createRadialGradient(t.cx, t.cy + t.h * 0.1, 0, t.cx, t.cy + t.h * 0.1, t.w * 0.62);
  haze.addColorStop(0, hexWithAlpha(grade.titleGlow, 0.32));
  haze.addColorStop(1, hexWithAlpha(grade.titleGlow, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, t.cy - t.h, w, t.h * 2);
  ctx.restore();
}

/** A five-point star centred on (cx, cy). */
function traceStar(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Draws a row of `count` gold stars starting at x, centred on y; returns the row's width. */
function drawStarRow(ctx, x, y, r, count, grade) {
  const step = r * 2.25;
  for (let i = 0; i < count; i++) {
    const cx = x + r + i * step;
    const gold = ctx.createLinearGradient(0, y - r, 0, y + r);
    gold.addColorStop(0, '#fff7c2');
    gold.addColorStop(1, grade.titleSun[1]);
    traceStar(ctx, cx, y, r);
    ctx.fillStyle = gold;
    ctx.fill();
  }
  return count ? step * (count - 1) + r * 2 : 0;
}

/** The review line across the top: stars, the quote in condensed caps, its source, stars again. */
export function drawReviewBanner(ctx, rect, scene, grade, unit) {
  ctx.save();
  const band = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
  band.addColorStop(0, '#06030a');
  band.addColorStop(0.5, mixHexColors(grade.gutter, grade.titleShadow, 0.45));
  band.addColorStop(1, '#06030a');
  ctx.fillStyle = band;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const line = ctx.createLinearGradient(rect.x, 0, rect.x + rect.w, 0);
  line.addColorStop(0, grade.titleSun[2]);
  line.addColorStop(0.5, grade.titleSun[0]);
  line.addColorStop(1, grade.tagline);
  ctx.fillStyle = line;
  ctx.fillRect(rect.x, rect.y + rect.h - 2.5 * unit, rect.w, 2.5 * unit);

  const quoteText = scene.quote.trim().toUpperCase();
  const sourceText = scene.quoteSource.trim().toUpperCase();
  const stars = Math.max(0, Math.min(5, Math.round(scene.stars)));
  if (!quoteText && !stars) { ctx.restore(); return; }
  const size = rect.h * 0.5;
  const starR = rect.h * 0.17;
  const gap = rect.h * 0.45;
  ctx.font = `${size}px "${TITLE_FONT}"`;
  ctx.letterSpacing = `${(size * 0.07).toFixed(1)}px`;
  const quote = quoteText ? `“${quoteText}”` : '';
  const quoteW = quote ? ctx.measureText(quote).width : 0;
  ctx.font = `${size * 0.62}px "${TITLE_FONT}"`;
  const source = sourceText ? `— ${sourceText}` : '';
  const sourceW = source ? ctx.measureText(source).width : 0;
  const starsW = stars ? starR * 2.25 * (stars - 1) + starR * 2 : 0;
  const parts = [starsW, quoteW, sourceW, starsW].filter((p) => p > 0);
  const total = parts.reduce((s, p) => s + p, 0) + gap * (parts.length - 1);
  const squeeze = Math.min(1, (rect.w * 0.94) / total);
  const cy = rect.y + rect.h * 0.48;
  ctx.translate(rect.x + rect.w / 2, 0);
  ctx.scale(squeeze, 1);
  let x = -total / 2;
  ctx.textBaseline = 'middle';
  if (starsW) { drawStarRow(ctx, x, cy, starR, stars, grade); x += starsW + gap; }
  if (quote) {
    ctx.font = `${size}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(size * 0.07).toFixed(1)}px`;
    ctx.fillStyle = '#fff8ee';
    ctx.shadowColor = hexWithAlpha(grade.titleGlow, 0.7);
    ctx.shadowBlur = size * 0.4;
    ctx.fillText(quote, x, cy + size * 0.04);
    ctx.shadowBlur = 0;
    x += quoteW + gap;
  }
  if (source) {
    ctx.font = `${size * 0.62}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(size * 0.05).toFixed(1)}px`;
    ctx.fillStyle = grade.titleSun[0];
    ctx.fillText(source, x, cy + size * 0.04);
    x += sourceW + gap;
  }
  if (starsW) drawStarRow(ctx, x, cy, starR, stars, grade);
  ctx.restore();
}

/** The y of a polygon edge from p to q at x (clamped to the edge's ends). */
function edgeYAt(p, q, x) {
  const t = Math.max(0, Math.min(1, (x - p[0]) / Math.max(1e-6, q[0] - p[0])));
  return p[1] + (q[1] - p[1]) * t;
}

/**
 * Role tags, one style everywhere: a dark plate with a numbered accent chip, the role in spaced condensed caps
 * and an accent underline. Each tag sits in its panel's lower outer corner (left half of the cover: bottom-left;
 * right half: bottom-right), over the shoulders and away from the faces and the title; the hero's tag, a size
 * larger, sits at the top centre of the hero. A tag whose lower corner would fall under the title box (`titleBox`,
 * the plan's {cx, cy, w, h}) moves to the panel's upper outer corner instead. Every tag follows its panel's tilted
 * edge and is clipped to it.
 */
export function drawRoleTags(ctx, geometry, tags, grade, unit, coverWidth, titleBox) {
  geometry.panels.forEach((panel, i) => {
    const label = (tags[i] ?? '').trim().toUpperCase();
    if (!label) return;
    const hero = i === geometry.hero;
    let size = (hero ? 24 : 19) * unit;
    const number = String(i + 1).padStart(2, '0');
    ctx.save();
    const measure = (s) => {
      ctx.font = `${s}px "${TITLE_FONT}"`;
      ctx.letterSpacing = `${(s * 0.12).toFixed(1)}px`;
      const nameW = ctx.measureText(label).width;
      const numW = ctx.measureText(number).width;
      return { nameW, numW, total: numW + s * 0.9 + nameW + s * 0.9 };
    };
    let m = measure(size);
    const inset = 12 * unit;
    const room = panel.box.w - inset * 3;
    if (m.total > room) { size *= room / m.total; m = measure(size); }
    const tagH = size * 1.62;
    const [tl, tr, br, bl] = panel.polygon;
    let x;
    let y;
    if (hero) {
      x = panel.box.x + (panel.box.w - m.total) / 2;
      y = Math.max(edgeYAt(tl, tr, x), edgeYAt(tl, tr, x + m.total)) + inset * 1.2;
    } else {
      const onLeft = panel.box.x + panel.box.w / 2 < coverWidth / 2;
      // Keep clear of the slanted side edge as well as the bottom one.
      const sideIn = onLeft
        ? Math.max(tl[0], bl[0]) + inset
        : Math.min(tr[0], br[0]) - inset - m.total;
      x = sideIn;
      y = Math.min(edgeYAt(bl, br, x), edgeYAt(bl, br, x + m.total)) - inset - tagH;
      const underTitle = titleBox
        && x < titleBox.cx + titleBox.w / 2 && x + m.total > titleBox.cx - titleBox.w / 2
        && y + tagH > titleBox.cy - titleBox.h / 2 && y < titleBox.cy + titleBox.h / 2;
      if (underTitle) y = Math.max(edgeYAt(tl, tr, x), edgeYAt(tl, tr, x + m.total)) + inset;
    }
    tracePolygon(ctx, panel.polygon);
    ctx.clip();
    const accent = hero ? grade.titleSun[0] : grade.accents[i % grade.accents.length];
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10 * unit;
    ctx.shadowOffsetY = 2 * unit;
    ctx.fillStyle = 'rgba(8,4,12,0.88)';
    ctx.fillRect(x, y, m.total, tagH);
    ctx.shadowColor = 'transparent';
    const chipW = m.numW + size * 0.9;
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, chipW, tagH);
    ctx.fillRect(x + chipW, y + tagH - 2 * unit, m.total - chipW, 2 * unit);
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(size * 0.12).toFixed(1)}px`;
    ctx.fillStyle = '#0a0410';
    ctx.fillText(number, x + size * 0.45, y + tagH * 0.52);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x + chipW + size * 0.45, y + tagH * 0.52);
    ctx.restore();
  });
}

/**
 * One line of billing: large names and small, raised connecting words, condensed horizontally to fit `maxW`.
 * Returns nothing; draws centred on cx at the given baseline.
 */
function drawBillingLine(ctx, text, cx, baseline, size, maxW, color) {
  const tokens = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return;
  ctx.font = `100px "${TITLE_FONT}"`;
  const capRatio = ctx.measureText('H').actualBoundingBoxAscent / 100;
  const pieces = tokens.map((token) => {
    const small = SMALL_CREDIT_WORDS.has(token.replace(/[^A-Z&]/g, ''));
    const s = small ? size * 0.58 : size;
    ctx.font = `${s}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(s * 0.05).toFixed(1)}px`;
    return { token, s, small, w: ctx.measureText(token).width };
  });
  const space = size * 0.32;
  const natural = pieces.reduce((sum, p) => sum + p.w, 0) + space * (pieces.length - 1);
  const squeeze = Math.min(0.8, maxW / natural);
  ctx.save();
  ctx.translate(cx, baseline);
  ctx.scale(squeeze, 1);
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  let x = -natural / 2;
  for (const p of pieces) {
    ctx.font = `${p.s}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(p.s * 0.05).toFixed(1)}px`;
    const y = p.small ? -(size - p.s) * capRatio : 0;
    ctx.fillText(p.token, x, y);
    x += p.w + space;
  }
  ctx.restore();
}

/**
 * The billing block at the foot: the seal on the left, the barcode on the right, and between them the credits
 * in condensed billing type over the release line in wide-spaced sunset caps.
 */
export function drawBillingBlock(ctx, rect, scene, grade, unit) {
  ctx.save();
  const shade = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  const side = rect.h * 1.35;
  const centerX = rect.x + rect.w / 2;
  const maxW = rect.w - side * 2 - 20 * unit;
  if (scene.showSeal) drawSealBadge(ctx, rect.x + rect.h * 0.62, rect.y + rect.h * 0.5, rect.h * 0.43, scene.badge, grade, unit);
  if (scene.showBarcode) {
    const bw = rect.h * 1.12;
    const bh = rect.h * 0.62;
    drawBarcodeStrip(ctx, rect.x + rect.w - bw - rect.h * 0.12, rect.y + (rect.h - bh) / 2, bw, bh, scene.caption, unit);
  }

  const lines = scene.credits.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3);
  const release = scene.release.trim().toUpperCase();
  const creditsBand = rect.h * (release ? 0.5 : 0.8);
  const lineH = lines.length ? Math.min(rect.h * 0.21, creditsBand / lines.length) : 0;
  ctx.font = `100px "${TITLE_FONT}"`;
  const capRatio = ctx.measureText('H').actualBoundingBoxAscent / 100;
  const size = (lineH * 0.74) / capRatio;
  let baseline = rect.y + rect.h * 0.1 + lineH * 0.82;
  lines.forEach((line) => {
    drawBillingLine(ctx, line, centerX, baseline, size, maxW, 'rgba(240,230,245,0.86)');
    baseline += lineH;
  });

  if (release) {
    ctx.save();
    let rs = rect.h * 0.27;
    ctx.font = `${rs}px "${TITLE_FONT}"`;
    ctx.letterSpacing = `${(rs * 0.3).toFixed(1)}px`;
    const rw = ctx.measureText(release).width;
    if (rw > maxW) {
      rs *= maxW / rw;
      ctx.font = `${rs}px "${TITLE_FONT}"`;
      ctx.letterSpacing = `${(rs * 0.3).toFixed(1)}px`;
    }
    const rBase = rect.y + rect.h * 0.9;
    const fill = ctx.createLinearGradient(0, rBase - rs * capRatio, 0, rBase);
    fill.addColorStop(0, grade.titleSun[0]);
    fill.addColorStop(0.6, grade.titleSun[1]);
    fill.addColorStop(1, grade.titleSun[2]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = hexWithAlpha(grade.titleGlow, 0.8);
    ctx.shadowBlur = rs * 0.5;
    ctx.fillStyle = fill;
    // letterSpacing adds trailing space after the last letter; shift by half of it to stay centred.
    ctx.fillText(release, centerX + rs * 0.15, rBase);
    ctx.restore();
  }
}

/** Places `text` around a circle of radius r, spaced to fill the whole ring, reading clockwise from the top. */
function drawRingText(ctx, text, cx, cy, r, size) {
  ctx.font = `${size}px "${TITLE_FONT}"`;
  ctx.letterSpacing = '0px';
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const used = widths.reduce((s, w) => s + w, 0);
  const pad = Math.max(0, (Math.PI * 2 * r - used) / chars.length);
  let angle = -Math.PI / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((c, i) => {
    const step = (widths[i] + pad) / r;
    angle += step / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(c, 0, 0);
    ctx.restore();
    angle += step / 2;
  });
}

/** The app's own seal: a scalloped gold rosette, a dark ring of small caps, the monogram and three stars. */
export function drawSealBadge(ctx, cx, cy, r, monogram, grade, unit) {
  const label = monogram.trim().toUpperCase().slice(0, 4);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = r * 0.3;
  ctx.beginPath();
  const points = 36;
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points;
    const rr = i % 2 ? r * 0.92 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  const gold = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  gold.addColorStop(0, '#fff3b0');
  gold.addColorStop(0.45, grade.titleSun[1]);
  gold.addColorStop(1, grade.titleSun[2]);
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = '#0b0610';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.strokeStyle = grade.titleSun[0];
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = grade.titleSun[0];
  drawRingText(ctx, '★ HEATWAVE STUDIO ★ ORIGINAL CUT ', cx, cy, r * 0.64, r * 0.17);
  if (label) {
    let size = r * 0.46;
    ctx.font = `${size}px "${TITLE_FONT}"`;
    const tw = ctx.measureText(label).width;
    if (tw > r * 0.78) size *= (r * 0.78) / tw;
    ctx.font = `${size}px "${TITLE_FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy - r * 0.04);
  }
  for (let i = -1; i <= 1; i++) {
    traceStar(ctx, cx + i * r * 0.15, cy + r * 0.3, r * 0.06);
    ctx.fillStyle = grade.titleSun[0];
    ctx.fill();
  }
  ctx.restore();
}

/** A small deterministic hash of a string, to seed the barcode from the caption. */
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A barcode-like strip of the app's own drawing: bars seeded from the caption and a row of digits below. */
export function drawBarcodeStrip(ctx, x, y, w, h, seedText, unit) {
  const random = mulberry32(hashText(seedText || 'heatwave'));
  // Digits first, so they never depend on how many bars fit at this size (preview and export agree).
  const digits = Array.from({ length: 12 }, () => Math.floor(random() * 10)).join('');
  ctx.save();
  ctx.fillStyle = '#f6f1e7';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 3 * unit);
  ctx.fill();
  const pad = w * 0.08;
  const barsTop = y + h * 0.1;
  const barsH = h * 0.62;
  const module = Math.max(1, (w - pad * 2) / 95);
  ctx.fillStyle = '#0a0a0a';
  let bx = x + pad;
  let bar = true;
  let n = 0;
  while (bx < x + w - pad - module) {
    const guard = n < 3 || Math.abs(bx - (x + w / 2)) < module * 2 || bx > x + w - pad - module * 4;
    const width = guard ? module : module * (1 + Math.floor(random() * 3));
    if (bar) ctx.fillRect(bx, barsTop, width, barsH + (guard ? h * 0.08 : 0));
    bx += width;
    bar = !bar;
    n++;
  }
  const ds = h * 0.17;
  ctx.font = `${ds}px "${TITLE_FONT}"`;
  ctx.letterSpacing = `${(ds * 0.25).toFixed(1)}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${digits.slice(0, 1)} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits.slice(11)}`, x + w / 2, y + h * 0.95);
  ctx.restore();
}
