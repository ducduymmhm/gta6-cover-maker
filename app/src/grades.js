// Colour grade presets. `stops` is a gradient map from shadows to highlights (luminance in, colour out); `sky` is a
// soft-light wash from top to bottom; `accents` tint each panel differently so the grid reads as separate shots; the
// title colours keep the lettering matched to the grade.

export const GRADE_PRESETS = [
  {
    id: 'sunset',
    name: 'Sunset',
    stops: [[0, '#12051f'], [0.24, '#3d0f5c'], [0.46, '#b4246e'], [0.68, '#ff6a4a'], [0.86, '#ffb85c'], [1, '#fff0c4']],
    mix: 0.84,
    contrast: 1.3,
    sky: ['#ff9a3d', '#b0187a'],
    accents: ['#ff2f7d', '#ff9a2e', '#18c9e0'],
    gutter: '#0d0612',
    titleFill: ['#fffbe8', '#ffd25e', '#ff5a8a'],
    titleShadow: '#6d0f4e',
    titleGlow: '#ff4f9a',
    tagline: '#7ff3ff',
    taglineGlow: '#00c8ff',
    halftoneInk: '#3a0838',
  },
  {
    id: 'neon',
    name: 'Neon Night',
    stops: [[0, '#04021a'], [0.3, '#2b0b62'], [0.55, '#b3149e'], [0.78, '#27c8e6'], [1, '#effdff']],
    mix: 0.82,
    contrast: 1.35,
    sky: ['#3a0ca3', '#ff2fb4'],
    accents: ['#ff2fb4', '#19e3ff', '#7a2cff'],
    gutter: '#06030f',
    titleFill: ['#ffffff', '#7ff6ff', '#ff3fc8'],
    titleShadow: '#3a0a7a',
    titleGlow: '#19e3ff',
    tagline: '#ff5fd2',
    taglineGlow: '#ff2fb4',
    halftoneInk: '#120430',
  },
  {
    id: 'dawn',
    name: 'Miami Dawn',
    stops: [[0, '#0e2236'], [0.3, '#1f6c86'], [0.55, '#4fc4bf'], [0.78, '#ffb0a0'], [1, '#fff6e6']],
    mix: 0.74,
    contrast: 1.22,
    sky: ['#ff9fb2', '#5fe0d4'],
    accents: ['#ff8fa8', '#36d6c8', '#ffd28a'],
    gutter: '#0b1620',
    titleFill: ['#ffffff', '#ffe0d2', '#ff7f9e'],
    titleShadow: '#1a5a72',
    titleGlow: '#ff9fb2',
    tagline: '#fff2a8',
    taglineGlow: '#ff6f91',
    halftoneInk: '#0c2a3d',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    stops: [[0, '#1a0800'], [0.3, '#6a240a'], [0.55, '#d4621c'], [0.78, '#ffbe55'], [1, '#fff8de']],
    mix: 0.78,
    contrast: 1.3,
    sky: ['#ff7a2f', '#ffd36e'],
    accents: ['#ff8a2a', '#ffcf5a', '#ff4d3d'],
    gutter: '#120703',
    titleFill: ['#fffaf0', '#ffd36e', '#ff7a2f'],
    titleShadow: '#5a1d05',
    titleGlow: '#ff9a3d',
    tagline: '#ffffff',
    taglineGlow: '#ff7a2f',
    halftoneInk: '#3a1204',
  },
  {
    id: 'noir',
    name: 'Mono Noir',
    stops: [[0, '#000000'], [0.35, '#262426'], [0.62, '#8f8b8f'], [0.85, '#dcd8d8'], [1, '#ffffff']],
    mix: 0.95,
    contrast: 1.35,
    sky: ['#000000', '#444444'],
    accents: ['#ffffff', '#b0b0b0', '#ffffff'],
    gutter: '#000000',
    titleFill: ['#ffffff', '#f2f2f2', '#d6d6d6'],
    titleShadow: '#b3122e',
    titleGlow: '#ff2246',
    tagline: '#ff2a4d',
    taglineGlow: '#ff0033',
    halftoneInk: '#000000',
  },
];

export function findGrade(id) {
  return GRADE_PRESETS.find((grade) => grade.id === id) ?? GRADE_PRESETS[0];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A 256-entry RGB lookup table interpolating the preset's gradient-map stops. */
export function buildGradientMapLut(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  const rgbStops = stops.map(([pos, hex]) => [pos, hexToRgb(hex)]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < rgbStops.length - 2 && t > rgbStops[k + 1][0]) k++;
    const [p0, c0] = rgbStops[k];
    const [p1, c1] = rgbStops[k + 1];
    const f = Math.min(1, Math.max(0, (t - p0) / (p1 - p0 || 1)));
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
  }
  return lut;
}
