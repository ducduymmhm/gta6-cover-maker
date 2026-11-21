// Panel grid layouts. Each layout is built from slanted dividing lines in normalized panel-area space (0..1 on
// both axes), so one definition adapts to square, portrait and landscape covers. A vertical divider is given by
// where it meets the top and bottom edges, a horizontal one by where it meets the left and right edges; every panel
// is the quadrilateral bounded by four such lines. Gutters are cut by insetting each quad in pixel space.

const V = (xTop, xBottom) => ({ kind: 'v', a: xTop, b: xBottom - xTop });
const H = (yLeft, yRight) => ({ kind: 'h', c: yLeft, d: yRight - yLeft });
const LEFT = V(0, 0);
const RIGHT = V(1, 1);
const TOP = H(0, 0);
const BOTTOM = H(1, 1);

/** A horizontal divider through two points (x0, y0) and (x1, y1), for short tilted cuts inside one column. */
function horizontalThrough(x0, y0, x1, y1) {
  const d = (y1 - y0) / (x1 - x0);
  return { kind: 'h', c: y0 - d * x0, d };
}

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Cast 9, landscape: the hero in the centre (37-41% of the width, full height, widening slightly toward the
 * foot), a tall co-star either side, and three close-ups stacked in each outer column with alternately tilted
 * cuts. The title zone is bottom-anchored over the lower third of the hero, so the faces at the top stay clear.
 * Order: hero, the two co-stars, then the close-ups (left and right alternately, top to bottom).
 */
function buildCastNineWide() {
  const v1 = V(0.149, 0.139);
  const v2 = V(0.313, 0.296);
  const v3 = V(0.687, 0.704);
  const v4 = V(0.851, 0.861);
  const leftCuts = [horizontalThrough(0, 0.345, 0.15, 0.318), horizontalThrough(0, 0.655, 0.15, 0.68)];
  const rightCuts = [horizontalThrough(0.85, 0.318, 1, 0.345), horizontalThrough(0.85, 0.68, 1, 0.655)];
  const leftRows = [TOP, ...leftCuts, BOTTOM];
  const rightRows = [TOP, ...rightCuts, BOTTOM];
  const cells = [[v2, v3, TOP, BOTTOM], [v1, v2, TOP, BOTTOM], [v3, v4, TOP, BOTTOM]];
  for (let r = 0; r < 3; r++) {
    cells.push([LEFT, v1, leftRows[r], leftRows[r + 1]]);
    cells.push([v4, RIGHT, rightRows[r], rightRows[r + 1]]);
  }
  return {
    hero: 0,
    cells,
    kinds: ['hero', 'costar', 'costar', 'small', 'small', 'small', 'small', 'small', 'small'],
    titleZone: { cx: 0.5, w: 0.5, h: 0.44, lines: 'stack' },
  };
}

/**
 * Cast 9, square and portrait: a row of four close-ups across the top, then the hero in the centre running from
 * under that row down to the billing block, a co-star and a close-up stacked on each side. The sides stop at the
 * title zone, so the title spreads over the hero's lower third and the dark ground beside it, never a face.
 * `aspect` (panel area width / height) tunes the row heights between portrait (~0.93) and square (~1.2).
 */
function buildCastNineStacked(aspect) {
  const t = clamp01((aspect - 0.93) / (1.21 - 0.93));
  const rowCut = lerp(0.205, 0.245, t);
  const sideCut = lerp(0.47, 0.5, t);
  const sideFloor = lerp(0.705, 0.715, t);
  const top = horizontalThrough(0, rowCut + 0.008, 1, rowCut - 0.008);
  const v2 = V(0.272, 0.258);
  const v3 = V(0.728, 0.742);
  const row = [V(0.256, 0.244), V(0.505, 0.495), V(0.744, 0.756)];
  const leftCut = horizontalThrough(0, sideCut + 0.012, 0.27, sideCut - 0.012);
  const rightCut = horizontalThrough(0.73, sideCut - 0.012, 1, sideCut + 0.012);
  const floor = horizontalThrough(0, sideFloor, 1, sideFloor - 0.006);
  return {
    hero: 0,
    cells: [
      [v2, v3, top, BOTTOM],
      [LEFT, v2, top, leftCut],
      [v3, RIGHT, top, rightCut],
      [LEFT, row[0], TOP, top],
      [row[2], RIGHT, TOP, top],
      [row[0], row[1], TOP, top],
      [row[1], row[2], TOP, top],
      [LEFT, v2, leftCut, floor],
      [v3, RIGHT, rightCut, floor],
    ],
    kinds: ['hero', 'costar', 'costar', 'small', 'small', 'small', 'small', 'small', 'small'],
    titleZone: { cx: 0.5, w: lerp(0.8, 0.74, t), h: 1 - sideFloor - 0.01 },
  };
}

/** Where a vertical divider (x = a + b*y) crosses a horizontal one (y = c + d*x). */
function intersectDividers(v, h) {
  const y = (h.c + h.d * v.a) / (1 - h.d * v.b);
  return [v.a + v.b * y, y];
}

/** A layout whose cells never change with the cover's shape. */
const fixedLayout = (hero, cells) => () => ({ hero, cells });

/**
 * Landscape cast row: a tall hero in the middle, a tall co-star either side of it, a column of two close-ups on
 * the left and a column of `rightRows` on the right. Order: hero, the two tall panels, then the small ones.
 */
function buildWideCastCells(rightRows) {
  const v1 = V(0.19, 0.17);
  const v2 = V(0.355, 0.33);
  const v3 = V(0.645, 0.67);
  const v4 = V(0.83, 0.81);
  const leftCut = H(0.53, 0.47);
  const rightCuts = rightRows === 3 ? [H(0.35, 0.31), H(0.69, 0.65)] : [H(0.47, 0.53)];
  const rightLines = [TOP, ...rightCuts, BOTTOM];
  const cells = [
    [v2, v3, TOP, BOTTOM],
    [v1, v2, TOP, BOTTOM],
    [v3, v4, TOP, BOTTOM],
    [LEFT, v1, TOP, leftCut],
    [v4, RIGHT, rightLines[0], rightLines[1]],
    [LEFT, v1, leftCut, BOTTOM],
  ];
  for (let r = 1; r < rightLines.length - 1; r++) cells.push([v4, RIGHT, rightLines[r], rightLines[r + 1]]);
  return { hero: 0, cells };
}

/**
 * Square and portrait cast grid: the hero in the upper middle between two columns of two close-ups, and a row of
 * `lowCount` panels underneath (the row the title fades over).
 */
function buildStackedCastCells(lowCount) {
  const mid = H(0.6, 0.56);
  const v1 = V(0.27, 0.25);
  const v2 = V(0.73, 0.75);
  const leftCut = H(0.3, 0.28);
  const rightCut = H(0.27, 0.29);
  const lows = lowCount === 3 ? [V(0.345, 0.32), V(0.665, 0.69)] : [V(0.52, 0.48)];
  const lowLines = [LEFT, ...lows, RIGHT];
  const cells = [
    [v1, v2, TOP, mid],
    [LEFT, v1, TOP, leftCut],
    [v2, RIGHT, TOP, rightCut],
    [LEFT, v1, leftCut, mid],
    [v2, RIGHT, rightCut, mid],
  ];
  for (let i = 0; i < lowLines.length - 1; i++) cells.push([lowLines[i], lowLines[i + 1], mid, BOTTOM]);
  return { hero: 0, cells };
}

/**
 * Every layout: id, label, panel count and `build(aspect)`, which returns the hero panel index and the cells as
 * [left, right, top, bottom] dividers for a panel area of that width/height ratio. The ensemble layouts (7 and 8
 * panels) switch between a wide cast row for landscape covers and a hero-over-row grid for square and portrait
 * ones; their hero is always panel 0, so a size change never moves the lead photo.
 */
export const PANEL_LAYOUTS = [
  {
    id: 'nine',
    name: 'Cast 9',
    count: 9,
    heroTitle: true,
    build: (aspect) => (aspect >= 1.6 ? buildCastNineWide() : buildCastNineStacked(aspect)),
  },
  {
    id: 'eight',
    name: 'Ensemble',
    count: 8,
    build: (aspect) => (aspect >= 1.05 ? buildWideCastCells(3) : buildStackedCastCells(3)),
  },
  {
    id: 'seven',
    name: 'Crew',
    count: 7,
    build: (aspect) => (aspect >= 1.05 ? buildWideCastCells(2) : buildStackedCastCells(2)),
  },
  {
    id: 'six',
    name: 'Six Pack',
    count: 6,
    build: fixedLayout(3, (() => {
      const band = H(0.4, 0.35);
      const a = V(0.35, 0.31);
      const b = V(0.68, 0.72);
      const low = V(0.61, 0.66);
      const lowCut = H(0.67, 0.71);
      return [
        [LEFT, a, TOP, band], [a, b, TOP, band], [b, RIGHT, TOP, band],
        [LEFT, low, band, BOTTOM], [low, RIGHT, band, lowCut], [low, RIGHT, lowCut, BOTTOM],
      ];
    })()),
  },
  {
    id: 'five',
    name: 'Five Star',
    count: 5,
    build: fixedLayout(2, (() => {
      const left = V(0.28, 0.24);
      const right = V(0.72, 0.76);
      const leftCut = H(0.52, 0.45);
      const rightCut = H(0.43, 0.5);
      return [
        [LEFT, left, TOP, leftCut], [LEFT, left, leftCut, BOTTOM],
        [left, right, TOP, BOTTOM],
        [right, RIGHT, TOP, rightCut], [right, RIGHT, rightCut, BOTTOM],
      ];
    })()),
  },
  {
    id: 'marquee',
    name: 'Marquee',
    count: 4,
    build: fixedLayout(0, (() => {
      const mid = H(0.62, 0.56);
      const a = V(0.34, 0.37);
      const b = V(0.68, 0.65);
      return [[LEFT, RIGHT, TOP, mid], [LEFT, a, mid, BOTTOM], [a, b, mid, BOTTOM], [b, RIGHT, mid, BOTTOM]];
    })()),
  },
  {
    id: 'quad',
    name: 'Quad',
    count: 4,
    build: fixedLayout(0, (() => {
      const mid = H(0.6, 0.67);
      const topSplit = V(0.66, 0.61);
      const lowSplit = V(0.41, 0.35);
      return [
        [LEFT, topSplit, TOP, mid], [topSplit, RIGHT, TOP, mid],
        [LEFT, lowSplit, mid, BOTTOM], [lowSplit, RIGHT, mid, BOTTOM],
      ];
    })()),
  },
  {
    id: 'trio',
    name: 'Trio',
    count: 3,
    build: fixedLayout(0, (() => {
      const split = V(0.6, 0.53);
      const right = H(0.47, 0.54);
      return [[LEFT, split, TOP, BOTTOM], [split, RIGHT, TOP, right], [split, RIGHT, right, BOTTOM]];
    })()),
  },
];

export function findLayout(id) {
  return PANEL_LAYOUTS.find((layout) => layout.id === id) ?? PANEL_LAYOUTS[0];
}

/** Shrinks a convex polygon by `distance` pixels on every edge (gutters between panels). */
export function insetPolygon(points, distance) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const lines = points.map((p, i) => {
    const q = points[(i + 1) % points.length];
    let nx = -(q[1] - p[1]);
    let ny = q[0] - p[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if ((cx - p[0]) * nx + (cy - p[1]) * ny < 0) { nx = -nx; ny = -ny; }
    return { px: p[0] + nx * distance, py: p[1] + ny * distance, dx: q[0] - p[0], dy: q[1] - p[1] };
  });
  return lines.map((line, i) => {
    const prev = lines[(i + lines.length - 1) % lines.length];
    const det = prev.dx * line.dy - prev.dy * line.dx;
    if (Math.abs(det) < 1e-9) return [line.px, line.py];
    const t = ((line.px - prev.px) * line.dy - (line.py - prev.py) * line.dx) / det;
    return [prev.px + prev.dx * t, prev.py + prev.dy * t];
  });
}

/**
 * Lays a layout out inside `area` ({x, y, w, h} in pixels, the part of the cover the cast grid fills): each
 * panel's polygon (gutters cut) and bounding box, and which panel is the hero. `gutter` is the gap between panels.
 */
export function computePanelGeometry(layout, area, gutter) {
  const { hero, cells, kinds, titleZone } = layout.build(area.w / area.h);
  const panels = cells.map(([l, r, t, b], i) => {
    const corners = [intersectDividers(l, t), intersectDividers(r, t), intersectDividers(r, b), intersectDividers(l, b)]
      .map(([x, y]) => [area.x + x * area.w, area.y + y * area.h]);
    const polygon = insetPolygon(corners, gutter / 2);
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys) };
    box.w = Math.max(...xs) - box.x;
    box.h = Math.max(...ys) - box.y;
    const kind = kinds?.[i] ?? (i === hero ? 'hero' : 'panel');
    return { polygon, box, kind };
  });
  return { panels, hero, titleZone: titleZone ?? null };
}

/** Ray-casting point-in-polygon test, used to pick the panel under the pointer. */
export function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function tracePolygon(ctx, polygon) {
  ctx.beginPath();
  polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
