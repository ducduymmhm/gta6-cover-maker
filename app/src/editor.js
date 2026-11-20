// The editor: loads the user's own photos (file picker or drag and drop, read locally, never uploaded), assigns
// them to panels, lets each panel be panned and zoomed on the live preview, edits caption, tagline and badge, picks
// layout, grade and size, and exports the cover as a full-resolution PNG.
import { PANEL_LAYOUTS, computePanelGeometry, findLayout, pointInPolygon, tracePolygon } from './layouts.js';
import { GRADE_PRESETS } from './grades.js';
import { COVER_SIZES, computePhotoPlacement, findSize, renderCover } from './render.js';
import { loadLetteringFonts } from './lettering.js';

const PREVIEW_LONG_SIDE = 1200;
const SAMPLE_PHOTOS = ['samples/boulevard.jpg', 'samples/pier.jpg'];
// Crops given to the panels when one photo fills several, so the grid reads as different shots: a zoom and the
// point of the photo (fx, fy as fractions) to centre. People photos keep the face in the upper-middle third, so
// the close-ups aim there.
const HERO_CROP = { zoom: 1, fx: 0.5, fy: 0.42 };
const FIRST_LOOK_CROP = { zoom: 1.1, fx: 0.5, fy: 0.38 };
const CROP_VARIETY = [
  { zoom: 2.1, fx: 0.5, fy: 0.25 },
  { zoom: 1.35, fx: 0.45, fy: 0.42 },
  { zoom: 1.8, fx: 0.55, fy: 0.3 },
  { zoom: 1.6, fx: 0.42, fy: 0.22 },
  { zoom: 1.2, fx: 0.6, fy: 0.36 },
];

/** Converts a focus crop into the panel's pan values, so the chosen point of the photo sits at the panel centre. */
function applyFocusCrop(panelIndex, photoIndex, { zoom, fx, fy }, flip) {
  const crop = scene.panels[panelIndex];
  Object.assign(crop, { photo: photoIndex, zoom, panX: 0, panY: 0, flip });
  const photo = scene.photos[photoIndex];
  const { w, h } = previewSize();
  const box = computePanelGeometry(findLayout(scene.layoutId), w, h, 0, 0).panels[panelIndex].box;
  const place = computePhotoPlacement(photo.img, box, crop);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const focusX = flip ? 1 - fx : fx;
  if (place.slackX > 0.5) crop.panX = clamp((box.w / 2 - focusX * place.w + place.slackX / 2) / (place.slackX / 2));
  if (place.slackY > 0.5) crop.panY = clamp((box.h / 2 - fy * place.h + place.slackY / 2) / (place.slackY / 2));
}

const scene = {
  photos: [],
  panels: [],
  layoutId: 'five',
  gradeId: 'sunset',
  sizeId: 'landscape',
  caption: 'Sunset Heist',
  tagline: 'Only in Palm Coast',
  badge: 'HW',
  titlePos: 'auto',
  gradeStrength: 1,
  glow: 0.6,
  halftone: 0.5,
  grain: 0.45,
  selected: 0,
};

const $ = (id) => document.getElementById(id);
const preview = $('coverPreview');
const overlay = $('selectionOverlay');
const previewCtx = preview.getContext('2d', { willReadFrequently: true });
let geometry = null;
let renderQueued = false;

function setStatus(text) {
  $('status').textContent = text;
}

/** Keeps one crop record per panel of the current layout, defaulting new ones to the hero-first photo order. */
function ensurePanelCrops() {
  const count = findLayout(scene.layoutId).cells.length;
  while (scene.panels.length < count) scene.panels.push({ photo: null, zoom: 1, panX: 0, panY: -0.2, flip: false });
  scene.panels.length = count;
  scene.selected = Math.min(scene.selected, count - 1);
}

/** Panel indices with the hero first, so the first photo always lands in the biggest panel. */
function panelsHeroFirst() {
  const layout = findLayout(scene.layoutId);
  const order = scene.panels.map((_, i) => i).filter((i) => i !== layout.hero);
  return [layout.hero, ...order];
}

/** Fills every panel with one photo, giving the smaller panels varied close-up crops. */
export function fillAllPanelsWithPhoto(photoIndex) {
  panelsHeroFirst().forEach((panelIndex, k) => {
    const crop = k === 0 ? HERO_CROP : CROP_VARIETY[(k - 1) % CROP_VARIETY.length];
    applyFocusCrop(panelIndex, photoIndex, crop, k % 3 === 2);
  });
}

/** Deals all loaded photos across the panels, hero first; with one photo it falls back to varied crops. */
export function spreadPhotosAcrossPanels() {
  if (scene.photos.length === 0) return;
  if (scene.photos.length === 1) { fillAllPanelsWithPhoto(0); return; }
  panelsHeroFirst().forEach((panelIndex, k) => {
    const photo = k % scene.photos.length;
    const round = Math.floor(k / scene.photos.length);
    let crop = CROP_VARIETY[(k + round) % CROP_VARIETY.length];
    if (k === 0) crop = HERO_CROP;
    else if (round === 0) crop = FIRST_LOOK_CROP;
    applyFocusCrop(panelIndex, photo, crop, round % 2 === 1);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not read ${url}`));
    img.src = url;
  });
}

/** Reads image files on this machine (object URLs, no upload) and adds them to the photo tray. */
export async function addPhotoFiles(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) { setStatus('Those files are not images.'); return; }
  for (const file of images) {
    try {
      const img = await loadImage(URL.createObjectURL(file));
      scene.photos.push({ name: file.name, img });
    } catch {
      setStatus(`Skipped ${file.name}: not a readable image.`);
    }
  }
  spreadPhotosAcrossPanels();
  setStatus(`${scene.photos.length} photo${scene.photos.length === 1 ? '' : 's'} loaded. Drag a panel to reframe it.`);
  refreshEditor();
}

async function addSamplePhotos() {
  for (const url of SAMPLE_PHOTOS) scene.photos.push({ name: url.split('/').pop(), img: await loadImage(url) });
  spreadPhotosAcrossPanels();
  refreshEditor();
}

/* ---------- rendering ---------- */

function previewSize() {
  const size = findSize(scene.sizeId);
  const scale = Math.min(1, PREVIEW_LONG_SIDE / Math.max(size.w, size.h));
  return { w: Math.round(size.w * scale), h: Math.round(size.h * scale), scale };
}

/** Sizes the preview canvas to the chosen aspect and fits it inside the stage. */
function fitPreviewToStage() {
  const { w, h } = previewSize();
  for (const c of [preview, overlay]) {
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  const stage = $('stage');
  const availW = stage.clientWidth - 32;
  const availH = stage.clientHeight - 60;
  const fit = Math.min(availW / w, availH / h);
  preview.style.width = `${Math.floor(w * fit)}px`;
  preview.style.height = `${Math.floor(h * fit)}px`;
}

export function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    geometry = renderCover(previewCtx, scene, preview.width, preview.height);
    drawSelectionOverlay();
  });
}

/** Outlines the selected panel on a separate overlay canvas, so it never shows in an export. */
function drawSelectionOverlay() {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const panel = geometry?.panels[scene.selected];
  if (!panel) return;
  const unit = Math.min(overlay.width, overlay.height) / 1080;
  ctx.save();
  tracePolygon(ctx, panel.polygon);
  ctx.lineWidth = 5 * unit;
  ctx.strokeStyle = '#000000aa';
  ctx.stroke();
  ctx.setLineDash([14 * unit, 9 * unit]);
  ctx.lineWidth = 3 * unit;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.restore();
}

/* ---------- export ---------- */

/** Renders the cover at its full post size off-screen and downloads it as a PNG. */
export function exportPng() {
  const size = findSize(scene.sizeId);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  renderCover(canvas.getContext('2d', { willReadFrequently: true }), scene, size.w, size.h);
  const slug = scene.caption.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover';
  const name = `${slug}-${size.w}x${size.h}.png`;
  canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    setStatus(`Saved ${name} (${size.w} × ${size.h}).`);
  }, 'image/png');
}

/* ---------- pickers ---------- */

function drawLayoutThumbnail(canvas, layout) {
  const ctx = canvas.getContext('2d');
  const { panels } = computePanelGeometry(layout, canvas.width, canvas.height, 3, 3);
  ctx.fillStyle = '#07040a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  panels.forEach(({ polygon }, i) => {
    tracePolygon(ctx, polygon);
    ctx.fillStyle = i === layout.hero ? '#ff4f9a' : ['#ffb347', '#7b3cff', '#3fe0e8'][i % 3];
    ctx.fill();
  });
}

function buildPickers() {
  const sizePicker = $('sizePicker');
  COVER_SIZES.forEach((size) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.size = size.id;
    b.innerHTML = `${size.name}<small>${size.w}×${size.h}</small>`;
    b.addEventListener('click', () => { scene.sizeId = size.id; refreshEditor(); });
    sizePicker.append(b);
  });
  const layoutPicker = $('layoutPicker');
  PANEL_LAYOUTS.forEach((layout) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = layout.id;
    b.title = `${layout.name}: ${layout.cells.length} panels`;
    const thumb = document.createElement('canvas');
    thumb.width = 96;
    thumb.height = 64;
    drawLayoutThumbnail(thumb, layout);
    b.append(thumb, `${layout.cells.length} · ${layout.name}`);
    b.addEventListener('click', () => {
      scene.layoutId = layout.id;
      ensurePanelCrops();
      spreadPhotosAcrossPanels();
      refreshEditor();
    });
    layoutPicker.append(b);
  });
  const gradePicker = $('gradePicker');
  GRADE_PRESETS.forEach((grade) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.grade = grade.id;
    const swatch = document.createElement('i');
    swatch.style.background = `linear-gradient(90deg, ${grade.stops.map(([p, c]) => `${c} ${p * 100}%`).join(', ')})`;
    b.append(swatch, grade.name);
    b.addEventListener('click', () => { scene.gradeId = grade.id; refreshEditor(); });
    gradePicker.append(b);
  });
}

function photoButton(photo, index, active, onPick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.title = photo.name;
  b.className = active ? 'active' : '';
  const img = document.createElement('img');
  img.src = photo.img.src;
  img.alt = photo.name;
  const tag = document.createElement('span');
  tag.textContent = String(index + 1);
  b.append(img, tag);
  b.addEventListener('click', onPick);
  return b;
}

/** Syncs every control with the scene and redraws. */
function refreshEditor() {
  ensurePanelCrops();
  const crop = scene.panels[scene.selected];
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === scene.sizeId));
  document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === scene.layoutId));
  document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('active', b.dataset.grade === scene.gradeId));
  const size = findSize(scene.sizeId);
  $('exportButton').textContent = `Export PNG ${size.w}×${size.h}`;
  $('photoTray').replaceChildren(...scene.photos.map((p, i) => photoButton(p, i, false, () => {
    crop.photo = i;
    refreshEditor();
  })));
  $('panelPhotoTray').replaceChildren(...scene.photos.map((p, i) => photoButton(p, i, crop.photo === i, () => {
    crop.photo = i;
    refreshEditor();
  })));
  const hero = findLayout(scene.layoutId).hero === scene.selected ? ' (hero)' : '';
  $('panelHeading').textContent = `Panel ${scene.selected + 1} of ${scene.panels.length}${hero}`;
  $('zoomSlider').value = String(crop.zoom);
  $('useSamples').hidden = scene.photos.length > 0;
  fitPreviewToStage();
  scheduleRender();
}

/* ---------- direct manipulation on the preview ---------- */

function canvasPoint(event) {
  const rect = preview.getBoundingClientRect();
  return [(event.clientX - rect.left) * (preview.width / rect.width), (event.clientY - rect.top) * (preview.height / rect.height)];
}

function panelAt(x, y) {
  return geometry?.panels.findIndex((p) => pointInPolygon(x, y, p.polygon)) ?? -1;
}

/** Drag pans the photo inside the panel under the pointer; the wheel zooms it. */
function bindPanelPanZoom() {
  let drag = null;
  preview.addEventListener('pointerdown', (event) => {
    const [x, y] = canvasPoint(event);
    const index = panelAt(x, y);
    if (index < 0) return;
    if (index !== scene.selected) { scene.selected = index; refreshEditor(); }
    const crop = scene.panels[index];
    drag = { x, y, panX: crop.panX, panY: crop.panY, index };
    preview.setPointerCapture(event.pointerId);
    preview.classList.add('dragging');
  });
  preview.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const crop = scene.panels[drag.index];
    const photo = scene.photos[crop.photo];
    if (!photo) return;
    const [x, y] = canvasPoint(event);
    const place = computePhotoPlacement(photo.img, geometry.panels[drag.index].box, crop);
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    if (place.slackX > 0.5) crop.panX = clamp(drag.panX + (x - drag.x) / (place.slackX / 2));
    if (place.slackY > 0.5) crop.panY = clamp(drag.panY + (y - drag.y) / (place.slackY / 2));
    scheduleRender();
  });
  const endDrag = () => { drag = null; preview.classList.remove('dragging'); };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('wheel', (event) => {
    event.preventDefault();
    const [x, y] = canvasPoint(event);
    const index = panelAt(x, y);
    if (index < 0) return;
    scene.selected = index;
    const crop = scene.panels[index];
    crop.zoom = Math.max(1, Math.min(4, crop.zoom * Math.exp(-event.deltaY * 0.0015)));
    $('zoomSlider').value = String(crop.zoom);
    refreshEditor();
  }, { passive: false });
}

function bindPhotoDrop() {
  let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    if (e.dataTransfer?.files?.length) addPhotoFiles(e.dataTransfer.files);
  });
}

function bindControls() {
  $('photoInput').addEventListener('change', (e) => { addPhotoFiles(e.target.files); e.target.value = ''; });
  $('useSamples').addEventListener('click', addSamplePhotos);
  const text = { captionInput: 'caption', taglineInput: 'tagline', badgeInput: 'badge' };
  Object.entries(text).forEach(([id, key]) => $(id).addEventListener('input', (e) => { scene[key] = e.target.value; scheduleRender(); }));
  $('titlePosition').addEventListener('change', (e) => { scene.titlePos = e.target.value; scheduleRender(); });
  const sliders = { gradeStrength: 'gradeStrength', glowAmount: 'glow', halftoneAmount: 'halftone', grainAmount: 'grain' };
  Object.entries(sliders).forEach(([id, key]) => $(id).addEventListener('input', (e) => { scene[key] = Number(e.target.value); scheduleRender(); }));
  $('zoomSlider').addEventListener('input', (e) => { scene.panels[scene.selected].zoom = Number(e.target.value); scheduleRender(); });
  $('resetCrop').addEventListener('click', () => {
    Object.assign(scene.panels[scene.selected], { zoom: 1, panX: 0, panY: 0, flip: false });
    refreshEditor();
  });
  $('flipPanel').addEventListener('click', () => { const c = scene.panels[scene.selected]; c.flip = !c.flip; refreshEditor(); });
  $('fillAllPanels').addEventListener('click', () => {
    const photo = scene.panels[scene.selected].photo;
    if (photo != null) { fillAllPanelsWithPhoto(photo); refreshEditor(); }
  });
  $('spreadPhotos').addEventListener('click', () => { spreadPhotosAcrossPanels(); refreshEditor(); });
  $('exportButton').addEventListener('click', exportPng);
  window.addEventListener('resize', () => { fitPreviewToStage(); });
}

async function startEditor() {
  buildPickers();
  bindControls();
  bindPanelPanZoom();
  bindPhotoDrop();
  await loadLetteringFonts();
  refreshEditor();
  setStatus('Add your photos to start. Everything stays on this computer.');
  document.body.dataset.ready = 'true';
}

startEditor();
