// The editor: loads the user's own photos (file picker or drag and drop, read locally, never uploaded), assigns
// them to panels, lets each panel be panned and zoomed on the live preview, edits caption, tagline and badge, picks
// layout, grade and size, and exports the cover as a full-resolution PNG.
import { PANEL_LAYOUTS, computePanelGeometry, findLayout, pointInPolygon, tracePolygon } from './layouts.js';
import { GRADE_PRESETS } from './grades.js';
import { COVER_SIZES, computeCoverGeometry, computePhotoPlacement, findSize, renderCover, resolveRoleTags } from './render.js';
import { loadLetteringFonts } from './lettering.js';
import { DEFAULT_ROLE_TAGS } from './keyart.js';

const PREVIEW_LONG_SIDE = 1200;
const SAMPLE_PHOTOS = ['samples/boulevard.jpg', 'samples/pier.jpg'];
// Automatic crops: a zoom and the point of the photo (fx, fy as fractions) to centre in the panel. People photos
// keep the face in the upper-middle third, so the hero and first looks aim there. When there are more panels
// than photos, each repeat of a photo takes a "second look" from a different part of the frame (a prop or car in
// the lower corner, a sign or palms in the upper corner, a tight close-up of the face), so no two panels show the
// same shot.
// `ax`, `ay` say where in the panel the focus lands (default the centre): the hero keeps the face in its upper
// third, so the title can cover its lower third; co-stars and close-ups put the face a little above the middle,
// leaving the shoulders for the role tag.
const HERO_CROP = { zoom: 1, fx: 0.5, fy: 0.3, ay: 0.3 };
const CO_STAR_CROP = { zoom: 1.04, fx: 0.5, fy: 0.3, ay: 0.34 };
const CLOSE_UP_CROP = { zoom: 1.15, fx: 0.5, fy: 0.26, ay: 0.46 };
const FIRST_LOOK_CROP = { zoom: 1.1, fx: 0.5, fy: 0.36 };
const CROP_FOR_PANEL_KIND = { hero: HERO_CROP, costar: CO_STAR_CROP, small: CLOSE_UP_CROP, panel: FIRST_LOOK_CROP };
const SECOND_LOOK_CROPS = [
  { zoom: 2.0, fx: 0.8, fy: 0.78 },
  { zoom: 1.7, fx: 0.24, fy: 0.16 },
  { zoom: 1.9, fx: 0.5, fy: 0.3 },
  { zoom: 1.8, fx: 0.44, fy: 0.27 },
];

/**
 * Converts a focus crop into the panel's pan values, so the chosen point of the photo sits at the panel centre.
 * The focus is kept on the crop, so a size or layout change can re-aim it while the user has not reframed it.
 */
function applyFocusCrop(panelIndex, photoIndex, focus, flip) {
  const crop = scene.panels[panelIndex];
  Object.assign(crop, { photo: photoIndex, zoom: focus.zoom, panX: 0, panY: 0, flip, focus });
  aimCropAtFocus(panelIndex);
}

/** Sets a panel's pan so its stored focus point lands at the panel centre, at the current size and layout. */
function aimCropAtFocus(panelIndex) {
  const crop = scene.panels[panelIndex];
  const photo = scene.photos[crop.photo];
  if (!photo || !crop.focus) return;
  const { w, h } = previewSize();
  const box = computeCoverGeometry(scene, w, h).geometry.panels[panelIndex].box;
  crop.panX = 0;
  crop.panY = 0;
  const place = computePhotoPlacement(photo.img, box, crop);
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  const focusX = crop.flip ? 1 - crop.focus.fx : crop.focus.fx;
  const anchorX = box.w * (crop.focus.ax ?? 0.5);
  const anchorY = box.h * (crop.focus.ay ?? 0.5);
  if (place.slackX > 0.5) crop.panX = clamp((anchorX - focusX * place.w + place.slackX / 2) / (place.slackX / 2));
  if (place.slackY > 0.5) crop.panY = clamp((anchorY - crop.focus.fy * place.h + place.slackY / 2) / (place.slackY / 2));
}

/** Re-aims every panel still on its automatic crop (after a size change moves the panel shapes). */
function reaimAutomaticCrops() {
  scene.panels.forEach((crop, i) => { if (crop.focus) aimCropAtFocus(i); });
}

const scene = {
  photos: [],
  panels: [],
  layoutId: 'nine',
  gradeId: 'sunset',
  sizeId: 'landscape',
  caption: 'Sunset Heist',
  tagline: 'Only in Palm Coast',
  badge: 'HW',
  titlePos: 'auto',
  showBanner: true,
  quote: 'A sun-soaked, neon-drenched thrill ride',
  quoteSource: 'Palm Coast Herald',
  stars: 5,
  showTags: true,
  showBilling: true,
  credits: 'Heatwave Pictures presents in association with Neon Tide a Palm Coast production\n'
    + 'starring The Driver The Pilot The Boss The Captain The Night Owl The Mechanic The Fixer The Lookout The Rider\n'
    + 'music by Night Signal edited by J. Park written and directed by M. Vale',
  release: 'Coming soon',
  showSeal: true,
  showBarcode: true,
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
  const count = findLayout(scene.layoutId).count;
  while (scene.panels.length < count) scene.panels.push({ photo: null, zoom: 1, panX: 0, panY: -0.2, flip: false, look: 0 });
  scene.panels.length = count;
  scene.selected = Math.min(scene.selected, count - 1);
}

/** The cast-grid geometry at the preview size (hero index, each panel's kind and box). */
function previewGeometry() {
  const { w, h } = previewSize();
  return computeCoverGeometry(scene, w, h).geometry;
}

/** Panel indices with the hero first, so the first photo always lands in the biggest panel. */
function panelsHeroFirst() {
  const { hero } = previewGeometry();
  const order = scene.panels.map((_, i) => i).filter((i) => i !== hero);
  return [hero, ...order];
}

/** The automatic framing for a panel: hero, co-star, close-up or (other layouts) a first look. */
function cropForPanel(panelIndex) {
  const geometry = previewGeometry();
  const kind = panelIndex === geometry.hero ? 'hero' : geometry.panels[panelIndex]?.kind ?? 'panel';
  return CROP_FOR_PANEL_KIND[kind] ?? FIRST_LOOK_CROP;
}

/**
 * Promotes the photo in `panelIndex` to the hero panel: the two panels trade photos, role tags and flips, and
 * both are reframed for their new slot (unless that photo has none, in which case it stays empty).
 */
export function promotePanelToHero(panelIndex) {
  const { hero } = previewGeometry();
  if (panelIndex === hero || !scene.panels[panelIndex] || !scene.panels[hero]) return;
  const chosen = scene.panels[panelIndex];
  const lead = scene.panels[hero];
  const swap = [
    [hero, chosen.photo, chosen.tag, chosen.flip],
    [panelIndex, lead.photo, lead.tag, lead.flip],
  ];
  for (const [index, photo, tag, flip] of swap) {
    if (photo == null) Object.assign(scene.panels[index], { photo: null, zoom: 1, panX: 0, panY: 0, focus: null });
    else applyFocusCrop(index, photo, cropForPanel(index), Boolean(flip));
    scene.panels[index].tag = tag;
  }
  scene.selected = hero;
  const name = scene.photos[chosen.photo]?.name;
  setStatus(name ? `${name} is now the hero.` : 'Hero swapped.');
  refreshEditor();
}

/** Fills every panel with one photo: the hero framed whole, the rest as distinct close-ups and details. */
export function fillAllPanelsWithPhoto(photoIndex) {
  panelsHeroFirst().forEach((panelIndex, k) => {
    const crop = k === 0 ? HERO_CROP : SECOND_LOOK_CROPS[(k - 1) % SECOND_LOOK_CROPS.length];
    applyFocusCrop(panelIndex, photoIndex, crop, false);
    Object.assign(scene.panels[panelIndex], { look: k, tag: undefined });
  });
}

/**
 * Deals the loaded photos across the panels, hero first: one photo per panel, so every person gets their own
 * panel, and only when there are more panels than photos does a photo come round again, as a different shot.
 * Resets the role tags to each photo's role on its first panel.
 */
export function spreadPhotosAcrossPanels() {
  if (scene.photos.length === 0) return;
  if (scene.photos.length === 1) { fillAllPanelsWithPhoto(0); return; }
  panelsHeroFirst().forEach((panelIndex, k) => {
    const photo = k % scene.photos.length;
    const round = Math.floor(k / scene.photos.length);
    let crop = SECOND_LOOK_CROPS[(photo + round - 1) % SECOND_LOOK_CROPS.length];
    if (round === 0) crop = cropForPanel(panelIndex);
    applyFocusCrop(panelIndex, photo, crop, false);
    Object.assign(scene.panels[panelIndex], { look: round, tag: undefined });
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
      scene.photos.push({ name: file.name, img, role: DEFAULT_ROLE_TAGS[scene.photos.length % DEFAULT_ROLE_TAGS.length] });
    } catch {
      setStatus(`Skipped ${file.name}: not a readable image.`);
    }
  }
  spreadPhotosAcrossPanels();
  setStatus(`${scene.photos.length} photo${scene.photos.length === 1 ? '' : 's'} loaded. Drag a panel to reframe it.`);
  refreshEditor();
}

async function addSamplePhotos() {
  for (const url of SAMPLE_PHOTOS) {
    const role = DEFAULT_ROLE_TAGS[scene.photos.length % DEFAULT_ROLE_TAGS.length];
    scene.photos.push({ name: url.split('/').pop(), img: await loadImage(url), role });
  }
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
    placeHeroChip();
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

/**
 * Floats the "Make hero" chip over the selected panel's lower middle on the preview (hidden on the hero itself
 * and on empty panels). It is a page element, never drawn into the cover.
 */
function placeHeroChip() {
  const chip = $('heroChip');
  const panel = geometry?.panels[scene.selected];
  const crop = scene.panels[scene.selected];
  if (!panel || scene.selected === geometry.hero || crop?.photo == null) { chip.hidden = true; return; }
  const scale = preview.clientWidth / preview.width;
  chip.hidden = false;
  chip.style.left = `${(panel.box.x + panel.box.w / 2) * scale}px`;
  chip.style.top = `${(panel.box.y + panel.box.h * 0.5) * scale}px`;
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
  const area = { x: 3, y: 3, w: canvas.width - 6, h: canvas.height - 6 };
  const { panels, hero } = computePanelGeometry(layout, area, 3);
  ctx.fillStyle = '#07040a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  panels.forEach(({ polygon }, i) => {
    tracePolygon(ctx, polygon);
    ctx.fillStyle = i === hero ? '#ff4f9a' : ['#ffb347', '#7b3cff', '#3fe0e8'][i % 3];
    ctx.fill();
  });
}

/** Marks each panel's look: 0 on the first panel (hero first) showing a photo, 1, 2, ... on its repeats. */
function recountPhotoLooks() {
  const seen = new Map();
  panelsHeroFirst().forEach((i) => {
    const crop = scene.panels[i];
    if (crop.photo == null) return;
    const n = seen.get(crop.photo) ?? 0;
    crop.look = n;
    seen.set(crop.photo, n + 1);
  });
}

/** Puts photo `photoIndex` in the selected panel, framed like a first look (or the hero framing in the hero). */
function swapPanelPhoto(photoIndex) {
  applyFocusCrop(scene.selected, photoIndex, cropForPanel(scene.selected), false);
  refreshEditor();
}

function buildPickers() {
  const sizePicker = $('sizePicker');
  COVER_SIZES.forEach((size) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.size = size.id;
    b.innerHTML = `${size.name}<small>${size.w}×${size.h}</small>`;
    b.addEventListener('click', () => {
      scene.sizeId = size.id;
      fitPreviewToStage();
      reaimAutomaticCrops();
      refreshEditor();
    });
    sizePicker.append(b);
  });
  const layoutPicker = $('layoutPicker');
  PANEL_LAYOUTS.forEach((layout) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = layout.id;
    b.title = `${layout.name}: ${layout.count} panels`;
    const thumb = document.createElement('canvas');
    thumb.width = 96;
    thumb.height = 56;
    drawLayoutThumbnail(thumb, layout);
    b.append(thumb, `${layout.count} · ${layout.name}`);
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
  recountPhotoLooks();
  const crop = scene.panels[scene.selected];
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === scene.sizeId));
  document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === scene.layoutId));
  document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('active', b.dataset.grade === scene.gradeId));
  const size = findSize(scene.sizeId);
  $('exportButton').textContent = `Export PNG ${size.w}×${size.h}`;
  $('photoTray').replaceChildren(...scene.photos.map((p, i) => photoButton(p, i, false, () => swapPanelPhoto(i))));
  $('panelPhotoTray').replaceChildren(...scene.photos.map((p, i) => photoButton(p, i, crop.photo === i, () => swapPanelPhoto(i))));
  const isHero = previewGeometry().hero === scene.selected;
  $('panelHeading').textContent = `Panel ${scene.selected + 1} of ${scene.panels.length}${isHero ? ' · hero' : ''}`;
  $('makeHero').disabled = isHero || crop.photo == null;
  const tagInput = $('roleTagInput');
  if (document.activeElement !== tagInput) tagInput.value = resolveRoleTags({ ...scene, showTags: true })[scene.selected] ?? '';
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
    crop.focus = null;
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
    crop.focus = null;
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
  const text = {
    captionInput: 'caption', taglineInput: 'tagline', badgeInput: 'badge', quoteInput: 'quote',
    quoteSourceInput: 'quoteSource', creditsInput: 'credits', releaseInput: 'release',
  };
  Object.entries(text).forEach(([id, key]) => {
    $(id).value = scene[key];
    $(id).addEventListener('input', (e) => { scene[key] = e.target.value; scheduleRender(); });
  });
  const toggles = {
    showBanner: 'showBanner', showTags: 'showTags', showBilling: 'showBilling', showSeal: 'showSeal', showBarcode: 'showBarcode',
  };
  Object.entries(toggles).forEach(([id, key]) => {
    $(id).checked = scene[key];
    $(id).addEventListener('change', (e) => {
      scene[key] = e.target.checked;
      reaimAutomaticCrops();
      refreshEditor();
    });
  });
  $('starsInput').value = String(scene.stars);
  $('starsInput').addEventListener('change', (e) => { scene.stars = Number(e.target.value); scheduleRender(); });
  $('roleTagInput').addEventListener('input', (e) => { scene.panels[scene.selected].tag = e.target.value; scheduleRender(); });
  $('titlePosition').addEventListener('change', (e) => {
    scene.titlePos = e.target.value;
    reaimAutomaticCrops();
    scheduleRender();
  });
  const sliders = { gradeStrength: 'gradeStrength', glowAmount: 'glow', halftoneAmount: 'halftone', grainAmount: 'grain' };
  Object.entries(sliders).forEach(([id, key]) => $(id).addEventListener('input', (e) => { scene[key] = Number(e.target.value); scheduleRender(); }));
  $('zoomSlider').addEventListener('input', (e) => {
    Object.assign(scene.panels[scene.selected], { zoom: Number(e.target.value), focus: null });
    scheduleRender();
  });
  $('resetCrop').addEventListener('click', () => {
    Object.assign(scene.panels[scene.selected], { zoom: 1, panX: 0, panY: 0, flip: false, focus: null });
    refreshEditor();
  });
  $('flipPanel').addEventListener('click', () => { const c = scene.panels[scene.selected]; c.flip = !c.flip; refreshEditor(); });
  $('fillAllPanels').addEventListener('click', () => {
    const photo = scene.panels[scene.selected].photo;
    if (photo != null) { fillAllPanelsWithPhoto(photo); refreshEditor(); }
  });
  $('spreadPhotos').addEventListener('click', () => { spreadPhotosAcrossPanels(); refreshEditor(); });
  $('exportButton').addEventListener('click', exportPng);
  $('makeHero').addEventListener('click', () => promotePanelToHero(scene.selected));
  $('heroChip').addEventListener('click', () => promotePanelToHero(scene.selected));
  window.addEventListener('resize', () => { fitPreviewToStage(); placeHeroChip(); });
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
