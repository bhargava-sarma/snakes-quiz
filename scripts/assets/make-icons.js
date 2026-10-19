#!/usr/bin/env node
/* Draws the Sarpa app icon (a pixel snake on an orange key) and renders the PNG sizes the manifest needs.
 *   NODE_PATH=$(npm root -g) node scripts/assets/make-icons.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', '..', 'assets');
const ORANGE = '#ff5a12';
const INK = '#131312';

// An "S" made of 19 LED-matrix cells: head top right, tail bottom left.
const CELLS = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [0, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2],
  [5, 3],
  [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4],
];

function snake(ox, oy, p) {
  const r = (v) => +v.toFixed(2);
  const cell = p - 1;
  let g = `<g fill="${INK}">`;
  CELLS.forEach(([c, row]) => {
    const tail = c === 0 && row === 4;
    const inset = tail ? 1.0 : 0;
    g += `<rect x="${r(ox + c * p + 0.5 + inset)}" y="${r(oy + row * p + 0.5 + inset)}" width="${r(cell - 2 * inset)}" height="${r(cell - 2 * inset)}" rx="1.3"/>`;
  });
  g += '</g>';
  // the eye and the forked tongue
  const hx = ox + 4 * p + 0.5, hy = oy + 0.5;
  g += `<rect x="${r(hx + 3.9)}" y="${r(hy + 1.2)}" width="2.3" height="2.3" fill="#fff"/>`;
  const tx = ox + 5 * p + 0.5, ty = hy;
  g += `<path d="M${r(tx)} ${r(ty + 3.5)}H${r(tx + 2.6)}M${r(tx + 2.6)} ${r(ty + 3.5)}L${r(tx + 6.6)} ${r(ty + 0.9)}M${r(tx + 2.6)} ${r(ty + 3.5)}L${r(tx + 6.6)} ${r(ty + 6.1)}" stroke="#fff" stroke-width="1.5" fill="none"/>`;
  return g;
}

const defs = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff5a12"/></linearGradient></defs>';

const svgRound = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">${defs}<rect width="64" height="64" rx="15" fill="url(#g)"/><rect x="1" y="1" width="62" height="62" rx="14" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>${snake(8, 12, 8)}</svg>\n`;
// maskable: full-bleed background, snake kept inside the central 70 %
const svgMask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512">${defs}<rect width="64" height="64" fill="url(#g)"/>${snake(13.6, 17, 6.4)}</svg>\n`;

fs.writeFileSync(path.join(OUT, 'icon.svg'), svgRound);
fs.writeFileSync(path.join(OUT, 'icon-maskable.svg'), svgMask);

(async () => {
  const browser = await chromium.launch();
  for (const [svg, size, out] of [[svgRound, 192, 'icon-192.png'], [svgRound, 512, 'icon-512.png'], [svgMask, 512, 'icon-maskable-512.png']]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, out), omitBackground: true });
    await page.close();
  }
  await browser.close();
  console.log('icons written to', OUT);
})();
