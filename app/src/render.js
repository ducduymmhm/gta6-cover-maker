// renderCover: the whole cover, in order: photos in their tilted panels, gradient-map grade, sky wash, light leaks,
// halftone, bloom, dark gutters and frame, title shade, title lettering, tagline, badge and film grain. The same
// function draws the live preview (at a reduced size) and the full-resolution export.
import { computePanelGeometry, findLayout, tracePolygon } from './layouts.js';
import { findGrade } from './grades.js';
import {
  addBloomGlow, addFilmGrain, applyColorGrade, applyHalftone, applySkyWash, drawPanelLightLeaks, drawTitleShade,
} from './effects.js';
import { drawOriginalBadge, drawTaglineScript, drawTitleLettering } from './lettering.js';

const TITLE_POSITIONS = { top: 0.22, center: 0.5, bottom: 0.79 };

/** Cover size presets: the three common post sizes. */
export const COVER_SIZES = [
  { id: 'square', name: 'Square', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait', w: 1080, h: 1350 },
  { id: 'landscape', name: 'Landscape', w: 1920, h: 1080 },
];

export function findSize(id) {
  return COVER_SIZES.find((size) => size.id === id) ?? COVER_SIZES[0];
}

/** Where a photo lands in a panel: cover-fit to the panel's bounding box, then the panel's zoom and pan. */
export function computePhotoPlacement(img, box, crop) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(box.w / iw, box.h / ih) * crop.zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const slackX = dw - box.w;
  const slackY = dh - box.h;
  return {
    x: box.x - slackX / 2 + crop.panX * (slackX / 2),
    y: box.y - slackY / 2 + crop.panY * (slackY / 2),
    w: dw,
    h: dh,
    slackX,
    slackY,
  };
}

/** A stand-in for an empty panel: a soft diagonal gradient the grade turns into a sunset sky. */
function drawEmptyPanel(ctx, box, index, unit) {
  const g = ctx.createLinearGradient(box.x, box.y, box.x + box.w * 0.4, box.y + box.h);
  g.addColorStop(0, `hsl(0 0% ${78 - index * 6}%)`);
  g.addColorStop(1, `hsl(0 0% ${18 + index * 4}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `${Math.round(30 * unit)}px "Anton"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PHOTO ${index + 1}`, box.x + box.w / 2, box.y + box.h / 2);
}

/** Draws every panel's photo (or placeholder) clipped to its tilted polygon. */
export function drawPanelGrid(ctx, geometry, scene, unit) {
  geometry.panels.forEach((panel, i) => {
    const crop = scene.panels[i] ?? { photo: null, zoom: 1, panX: 0, panY: 0 };
    const photo = crop.photo == null ? null : scene.photos[crop.photo];
    ctx.save();
    tracePolygon(ctx, panel.polygon);
    ctx.clip();
    if (photo) {
      const place = computePhotoPlacement(photo.img, panel.box, crop);
      ctx.imageSmoothingQuality = 'high';
      if (crop.flip) {
        ctx.translate(place.x * 2 + place.w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(photo.img, place.x, place.y, place.w, place.h);
    } else {
      drawEmptyPanel(ctx, panel.box, i, unit);
    }
    ctx.restore();
  });
}

/**
 * Renders the cover described by `scene` onto `ctx` at w x h. Returns the panel geometry (for hit-testing and
 * the selection outline in the editor).
 */
export function renderCover(ctx, scene, w, h) {
  const unit = Math.min(w, h) / 1080;
  const layout = findLayout(scene.layoutId);
  const grade = findGrade(scene.gradeId);
  const frame = Math.round(14 * unit);
  const gutter = Math.round(12 * unit);
  const geometry = computePanelGeometry(layout, w, h, frame, gutter);
  if (scene.titlePos !== 'auto') geometry.title.cy = TITLE_POSITIONS[scene.titlePos] * h;
  // Keep the title poster-sized but never so big it buries the hero panel.
  if (w / h > 1.4) { geometry.title.w = w * 0.68; geometry.title.h = h * 0.36; }
  if (h > w) { geometry.title.w = w * 0.84; geometry.title.h = h * 0.25; }

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawPanelGrid(ctx, geometry, scene, unit);
  const luma = applyColorGrade(ctx, w, h, grade, scene.gradeStrength);
  ctx.save();
  ctx.beginPath();
  geometry.panels.forEach(({ polygon }) => polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))));
  ctx.clip();
  applySkyWash(ctx, w, h, grade, scene.gradeStrength);
  ctx.restore();
  drawPanelLightLeaks(ctx, geometry.panels, grade, scene.glow);
  applyHalftone(ctx, w, h, luma, unit, grade, scene.halftone * 0.55, geometry.panels);
  addBloomGlow(ctx, w, h, unit, scene.glow);

  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = grade.gutter;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  if (scene.caption.trim()) drawTitleShade(ctx, w, h, geometry.title);
  const title = drawTitleLettering(ctx, scene.caption, geometry.title, grade, unit);
  drawTaglineScript(ctx, scene.tagline, title, w, h, grade, unit);
  if (scene.badge.trim()) {
    const r = 62 * unit;
    drawOriginalBadge(ctx, frame + gutter + r * 1.15, frame + gutter + r * 1.15, r, scene.badge, grade);
  }
  addFilmGrain(ctx, w, h, unit, scene.grain);
  ctx.restore();
  return geometry;
}
