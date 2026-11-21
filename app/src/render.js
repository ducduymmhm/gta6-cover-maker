// renderCover: the whole key-art cover, in order: the dark poster ground, photos in their tilted cast-grid panels
// (each auto-levelled, then gradient-mapped to the grade), sky wash, light leaks, halftone, drop shadows, the hero's
// neon rim, the title scrim, poster light leaks, bloom, vignette, role tags, the review banner, the stacked title
// and script tagline, the billing block (seal, credits, release line, barcode) and film grain. The same function draws the live preview
// (at a reduced size) and the full-resolution export.
import { computePanelGeometry, findLayout, tracePolygon } from './layouts.js';
import { findGrade } from './grades.js';
import {
  addBloomGlow, addFilmGrain, applyHalftone, applyPosterVignette, applySkyWash, drawPanelLightLeaks, drawPosterLightLeaks,
  gradePanelTile,
} from './effects.js';
import { drawStripedTitle, drawTaglineScript } from './lettering.js';
import {
  computeKeyArtFrame, drawBillingBlock, drawHeroSpotlight, drawKeyArtBackdrop, drawReviewBanner, drawRoleTags,
  drawSealBadge, drawTitleHaze, drawTitleScrim, fadePanelBottoms,
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
  if (geometry.titleZone && (scene.titlePos ?? 'auto') === 'auto') placeTitleOverHero(plan, geometry);
  return { plan, geometry };
}

/**
 * Bottom-anchors the title box in the layout's title zone: centred on the hero, its foot just above the billing
 * block, so the lettering covers the hero's lower third and never the faces above it.
 */
function placeTitleOverHero(plan, geometry) {
  const { area, unit } = plan;
  const zone = geometry.titleZone;
  const tw = area.w * zone.w;
  // Leave room under the title's foot for the script tagline that crosses it; the zone's top edge stays put, so
  // the title never climbs into the panels above the zone.
  const reserve = (plan.billing ? 34 : 64) * unit;
  const th = area.h * zone.h - reserve;
  const bottom = area.y + area.h - reserve;
  plan.title = { cx: area.x + area.w * zone.cx, cy: bottom - th / 2, w: tw, h: th, anchor: 'bottom', lines: zone.lines };
  plan.titleOverHero = true;
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

/** Draws one panel's photo (or placeholder) clipped to its tilted polygon, in cover coordinates. */
function drawPanelPhoto(ctx, panel, crop, photo, index, unit) {
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
    drawEmptyPanel(ctx, panel.box, index, unit);
  }
  ctx.restore();
}

/**
 * Draws and grades every panel on its own tile (so each photo gets its own auto-levels before the shared
 * gradient map), then lays the tiles onto `layer`. Returns the cover-sized luminance map for the halftone.
 */
export function drawGradedPanels(layer, geometry, scene, grade, unit, w, h) {
  const luma = new Uint8Array(w * h);
  geometry.panels.forEach((panel, i) => {
    const crop = scene.panels[i] ?? { photo: null, zoom: 1, panX: 0, panY: 0 };
    const photo = crop.photo == null ? null : scene.photos[crop.photo];
    const x0 = Math.max(0, Math.floor(panel.box.x));
    const y0 = Math.max(0, Math.floor(panel.box.y));
    const tw = Math.min(w, Math.ceil(panel.box.x + panel.box.w)) - x0;
    const th = Math.min(h, Math.ceil(panel.box.y + panel.box.h)) - y0;
    if (tw <= 0 || th <= 0) return;
    const tile = document.createElement('canvas');
    tile.width = tw;
    tile.height = th;
    const tctx = tile.getContext('2d', { willReadFrequently: true });
    tctx.translate(-x0, -y0);
    drawPanelPhoto(tctx, panel, crop, photo, i, unit);
    const image = tctx.getImageData(0, 0, tw, th);
    gradePanelTile(image, grade, scene.gradeStrength, luma, w, x0, y0);
    tctx.putImageData(image, 0, 0);
    layer.drawImage(tile, x0, y0);
  });
  return luma;
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
 * Renders the cover described by `scene` onto `ctx` at w x h: the dark poster ground; the graded cast grid on its
 * own layer (sky wash, panel light leaks, halftone), dropped onto the ground with a soft shadow; the hero's neon
 * rim; the scrim under the title, poster-wide light leaks, bloom and vignette; then, crisp on top, the role tags,
 * the review banner, the title and tagline, the billing block and the film grain. Returns the panel geometry
 * (for hit-testing and the selection outline in the editor).
 */
export function renderCover(ctx, scene, w, h) {
  const grade = findGrade(scene.gradeId);
  const { plan, geometry } = computeCoverGeometry(scene, w, h);
  const { unit } = plan;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  drawKeyArtBackdrop(ctx, w, h, plan, grade);

  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = w;
  layerCanvas.height = h;
  const layer = layerCanvas.getContext('2d', { willReadFrequently: true });
  const luma = drawGradedPanels(layer, geometry, scene, grade, unit, w, h);
  layer.save();
  layer.beginPath();
  geometry.panels.forEach(({ polygon }) => polygon.forEach(([x, y], i) => (i ? layer.lineTo(x, y) : layer.moveTo(x, y))));
  layer.clip();
  applySkyWash(layer, w, h, grade, scene.gradeStrength);
  layer.restore();
  drawPanelLightLeaks(layer, geometry.panels, grade, scene.glow);
  applyHalftone(layer, w, h, luma, unit, grade, scene.halftone * 0.55, geometry.panels);
  fadePanelBottoms(layer, w, plan);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 26 * unit;
  ctx.shadowOffsetY = 9 * unit;
  ctx.drawImage(layerCanvas, 0, 0);
  ctx.restore();
  drawHeroSpotlight(ctx, geometry, grade, unit);
  if (plan.titleOverHero) drawTitleScrim(ctx, plan, geometry);
  drawPosterLightLeaks(ctx, w, h, grade, scene.glow);
  addBloomGlow(ctx, w, h, unit, scene.glow);
  applyPosterVignette(ctx, w, h, 0.5);
  drawTitleHaze(ctx, w, plan, grade);
  drawRoleTags(ctx, geometry, resolveRoleTags(scene), grade, unit, w, plan.title);
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
