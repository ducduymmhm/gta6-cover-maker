// renderCover: the whole key-art cover, in order: photos in their tilted cast-grid panels, gradient-map grade, sky
// wash, light leaks, halftone, bloom, the dark poster ground, the fade into the title zone, role tags, the review
// banner, the stacked title and script tagline, the billing block (seal, credits, release line, barcode) and film
// grain. The same function draws the live preview (at a reduced size) and the full-resolution export.
import { computePanelGeometry, findLayout, tracePolygon } from './layouts.js';
import { findGrade } from './grades.js';
import { addBloomGlow, addFilmGrain, applyColorGrade, applyHalftone, applySkyWash, drawPanelLightLeaks } from './effects.js';
import { drawStripedTitle, drawTaglineScript } from './lettering.js';
import {
  computeKeyArtFrame, drawBillingBlock, drawKeyArtBackdrop, drawReviewBanner, drawRoleTags, drawSealBadge,
  drawTitleHaze, fadePanelBottoms,
} from './keyart.js';

/** Cover size presets: the three common post sizes. */
export const COVER_SIZES = [
  { id: 'landscape', name: 'Landscape', w: 1920, h: 1080 },
  { id: 'portrait', name: 'Portrait', w: 1080, h: 1350 },
  { id: 'square', name: 'Square', w: 1080, h: 1080 },
];

export function findSize(id) {
  return COVER_SIZES.find((size) => size.id === id) ?? COVER_SIZES[0];
}

/** The cover plan and the cast-grid geometry for a scene at w x h (shared by the renderer and the editor). */
export function computeCoverGeometry(scene, w, h) {
  const plan = computeKeyArtFrame(scene, w, h);
  const geometry = computePanelGeometry(findLayout(scene.layoutId), plan.area, plan.gutter);
  return { plan, geometry };
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
  g.addColorStop(0, `hsl(0 0% ${78 - (index % 6) * 6}%)`);
  g.addColorStop(1, `hsl(0 0% ${18 + (index % 6) * 4}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `${Math.round(Math.min(30 * unit, box.w * 0.16))}px "Anton"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PHOTO ${index + 1}`, box.x + box.w / 2, box.y + box.h * 0.45);
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

/** The role tag each panel shows: its own edited tag, else its photo's role on the photo's first panel. */
export function resolveRoleTags(scene) {
  if (!scene.showTags) return [];
  return scene.panels.map((crop) => {
    if (crop.tag != null) return crop.tag;
    const photo = crop.photo == null ? null : scene.photos[crop.photo];
    return photo && crop.look === 0 ? photo.role ?? '' : '';
  });
}

/**
 * Renders the cover described by `scene` onto `ctx` at w x h. Returns the panel geometry (for hit-testing and
 * the selection outline in the editor).
 */
export function renderCover(ctx, scene, w, h) {
  const grade = findGrade(scene.gradeId);
  const { plan, geometry } = computeCoverGeometry(scene, w, h);
  const { unit } = plan;

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
  fadePanelBottoms(ctx, w, plan);
  drawKeyArtBackdrop(ctx, w, h, plan, grade);
  drawTitleHaze(ctx, w, plan, grade);
  drawRoleTags(ctx, geometry, resolveRoleTags(scene), grade, unit);
  if (plan.banner) drawReviewBanner(ctx, plan.banner, scene, grade, unit);

  const title = drawStripedTitle(ctx, scene.caption, plan.title, grade, unit);
  const taglineFloor = plan.billing ? plan.billing.y + 4 * unit : h - plan.frame;
  drawTaglineScript(ctx, scene.tagline, title, w, h, grade, unit, taglineFloor);
  if (plan.billing) {
    drawBillingBlock(ctx, plan.billing, scene, grade, unit);
  } else if (scene.showSeal && scene.badge.trim()) {
    const r = 58 * unit;
    drawSealBadge(ctx, plan.area.x + r * 1.25, plan.area.y + r * 1.25, r, scene.badge, grade, unit);
  }
  addFilmGrain(ctx, w, h, unit, scene.grain);
  ctx.restore();
  return geometry;
}
