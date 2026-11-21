// Heatwave Cover Studio, a gta6-cover-art-01 entry (Node 22, standard library only). The app is app/: plain static
// files a desktop browser loads offline (index.html, ES modules under app/src/, two OFL fonts under app/fonts/,
// no library and no network request). It turns the user's own photos and a caption into movie key-art covers: the
// default Cast 9 poster puts the first photo big in the centre as the hero (any panel can be promoted with "Make
// hero"), two co-stars beside it and six close-ups around them, one photo per person, with role tags, a review
// banner with stars, a chrome-and-sunset-striped title over the hero's lower third with a neon script tagline, a
// billing block with release line, seal and barcode; every photo is auto-levelled then gradient-mapped to one
// sunset/neon grade, with light leaks, halftone, glow, vignette and grain; and it exports 1080x1080, 1080x1350 or
// 1920x1080 PNGs. This program hands it in: it copies app/ and screenshots/
// from beside this file to /output and writes /output/dossier.json with the vendored make.fun library. It reads no
// clock, no randomness and no network, so two runs write the same bytes.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Retake the screenshots with `node tools/take-screenshots.mjs` (drives the real editor in Playwright Chromium).
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of app
// files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
console.log(`Heatwave Cover Studio handed in: app/, screenshots/ and dossier.json written to ${out}`);
