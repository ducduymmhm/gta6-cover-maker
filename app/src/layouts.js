// Panel grid layouts. Each layout is built from slanted dividing lines in normalized cover space (0..1 on both
// axes), so a single definition adapts to square, portrait and landscape covers. A vertical divider is given by
// where it meets the top and bottom edges, a horizontal one by where it meets the left and right edges; every panel
// is the quadrilateral bounded by four such lines. Gutters are cut by insetting each quad in pixel space.

const V = (xTop, xBottom) => ({ kind: 'v', a: xTop, b: xBottom - xTop });
const H = (yLeft, yRight) => ({ kind: 'h', c: yLeft, d: yRight - yLeft });
const LEFT = V(0, 0);
const RIGHT = V(1, 1);
const TOP = H(0, 0);
const BOTTOM = H(1, 1);

/** Where a vertical divider (x = a + b*y) crosses a horizontal one (y = c + d*x). */
function intersectDividers(v, h) {
  const y = (h.c + h.d * v.a) / (1 - h.d * v.b);
  return [v.a + v.b * y, y];
}

/** Every layout: id, label, hero panel index, cells as [left, right, top, bottom] lines, and the title box. */
export const PANEL_LAYOUTS = [
  {
    id: 'trio',
    name: 'Trio',
    hero: 0,
    cells: (() => {
      const split = V(0.6, 0.53);
      const right = H(0.47, 0.54);
      return [[LEFT, split, TOP, BOTTOM], [split, RIGHT, TOP, right], [split, RIGHT, right, BOTTOM]];
    })(),
    title: { x: 0.5, y: 0.8, w: 0.9, h: 0.3 },
  },
  {
    id: 'quad',
    name: 'Quad',
    hero: 0,
    cells: (() => {
      const mid = H(0.6, 0.67);
      const topSplit = V(0.66, 0.61);
      const lowSplit = V(0.41, 0.35);
      return [
        [LEFT, topSplit, TOP, mid], [topSplit, RIGHT, TOP, mid],
        [LEFT, lowSplit, mid, BOTTOM], [lowSplit, RIGHT, mid, BOTTOM],
      ];
    })(),
    title: { x: 0.5, y: 0.62, w: 0.9, h: 0.3 },
  },
  {
    id: 'marquee',
    name: 'Marquee',
    hero: 0,
    cells: (() => {
      const mid = H(0.66, 0.6);
      const a = V(0.34, 0.37);
      const b = V(0.68, 0.65);
      return [[LEFT, RIGHT, TOP, mid], [LEFT, a, mid, BOTTOM], [a, b, mid, BOTTOM], [b, RIGHT, mid, BOTTOM]];
    })(),
    title: { x: 0.5, y: 0.5, w: 0.9, h: 0.3 },
  },
  {
    id: 'five',
    name: 'Five Star',
    hero: 2,
    cells: (() => {
      const left = V(0.28, 0.24);
      const right = V(0.72, 0.76);
      const leftCut = H(0.52, 0.45);
      const rightCut = H(0.43, 0.5);
      return [
        [LEFT, left, TOP, leftCut], [LEFT, left, leftCut, BOTTOM],
        [left, right, TOP, BOTTOM],
        [right, RIGHT, TOP, rightCut], [right, RIGHT, rightCut, BOTTOM],
      ];
    })(),
    title: { x: 0.5, y: 0.79, w: 0.92, h: 0.3 },
  },
  {
    id: 'six',
    name: 'Six Pack',
    hero: 3,
    cells: (() => {
      const band = H(0.4, 0.35);
      const a = V(0.35, 0.31);
      const b = V(0.68, 0.72);
      const low = V(0.61, 0.66);
      const lowCut = H(0.67, 0.71);
      return [
        [LEFT, a, TOP, band], [a, b, TOP, band], [b, RIGHT, TOP, band],
        [LEFT, low, band, BOTTOM], [low, RIGHT, band, lowCut], [low, RIGHT, lowCut, BOTTOM],
      ];
    })(),
    title: { x: 0.5, y: 0.73, w: 0.9, h: 0.3 },
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
 * Lays a layout out on a w x h cover: each panel's polygon (gutters cut), bounding box and centre, plus the
 * title box in pixels. `frame` is the outer dark border and `gutter` the gap between panels.
 */
export function computePanelGeometry(layout, w, h, frame, gutter) {
  const innerW = w - frame * 2;
  const innerH = h - frame * 2;
  const panels = layout.cells.map(([l, r, t, b]) => {
    const corners = [intersectDividers(l, t), intersectDividers(r, t), intersectDividers(r, b), intersectDividers(l, b)]
      .map(([x, y]) => [frame + x * innerW, frame + y * innerH]);
    const polygon = insetPolygon(corners, gutter / 2);
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    const box = { x: Math.min(...xs), y: Math.min(...ys) };
    box.w = Math.max(...xs) - box.x;
    box.h = Math.max(...ys) - box.y;
    return { polygon, box };
  });
  const t = layout.title;
  const title = { cx: t.x * w, cy: t.y * h, w: t.w * w, h: t.h * h };
  return { panels, title };
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
