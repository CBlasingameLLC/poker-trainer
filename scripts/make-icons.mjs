// Generate the two PWA icons (192 & 512) by rendering an SVG "poker chip with a
// spade" in the Modern Noir palette via the pre-installed Chromium. Run with:
//   node scripts/make-icons.mjs
// Requires Playwright's chromium (global in this environment). This is a build
// convenience only — the committed PNGs in public/icons/ are what ship.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Playwright lives in the global module dir in this environment; fall back to a
// local install if present.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright')); }
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'icons');

function svg(size) {
    const c = size / 512;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;padding:0}
    </style></head><body>
    <svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="felt" cx="50%" cy="38%" r="75%">
          <stop offset="0%" stop-color="#1a4a34"/>
          <stop offset="55%" stop-color="#0c1a14"/>
          <stop offset="100%" stop-color="#0a0a0c"/>
        </radialGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f4d98a"/>
          <stop offset="55%" stop-color="#e3c16f"/>
          <stop offset="100%" stop-color="#a07d2c"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#felt)"/>
      <circle cx="256" cy="256" r="188" fill="none" stroke="url(#gold)" stroke-width="10" stroke-dasharray="26 20" opacity="0.85"/>
      <circle cx="256" cy="256" r="150" fill="none" stroke="url(#gold)" stroke-width="4" opacity="0.5"/>
      <!-- spade -->
      <path fill="url(#gold)" d="M256 132
        C 256 132, 150 214, 150 288
        C 150 330, 182 356, 220 356
        C 238 356, 250 348, 256 340
        C 262 348, 274 356, 292 356
        C 330 356, 362 330, 362 288
        C 362 214, 256 132, 256 132 Z"/>
      <path fill="url(#gold)" d="M238 340 C 244 372, 236 392, 214 404 L 298 404 C 276 392, 268 372, 274 340 Z"/>
    </svg></body></html>`;
}

async function shoot(browser, size) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(svg(size), { waitUntil: 'networkidle' });
    const elt = await page.$('svg');
    await elt.screenshot({ path: path.join(OUT, `poker-icon-${size}.png`), omitBackground: true });
    await page.close();
    console.log('wrote', `poker-icon-${size}.png`);
}

const browser = await chromium.launch();
await shoot(browser, 192);
await shoot(browser, 512);
await browser.close();
