#!/usr/bin/env node
/* Draws the link-preview card that WhatsApp, X, Facebook, LinkedIn, Slack and others show when the site is shared:
 * assets/social-preview.jpg, 1200 x 630 (the size they all expect; WhatsApp skips images over about 300 KB).
 * The logo, the wordmark and the headline sit in the middle, so the square thumbnail some apps cut from it still works.
 *   NODE_PATH=$(npm root -g) node scripts/assets/make-social-preview.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const OUT = path.join(ASSETS, 'social-preview.jpg');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(ASSETS, 'fonts', f + '.woff2')).toString('base64');
const icon = fs.readFileSync(path.join(ASSETS, 'icon.svg'), 'utf8').replace(/ width="\d+" height="\d+"/, '');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Geist; font-weight: 100 900; src: url(${font('geist-latin-wght-normal')}) format('woff2'); }
  @font-face { font-family: GeistMono; font-weight: 100 900; src: url(${font('geist-mono-latin-wght-normal')}) format('woff2'); }
  @font-face { font-family: Doto; font-weight: 100 900; src: url(${font('doto-latin-full-normal')}) format('woff2'); }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative; display: flex; flex-direction: column; align-items: center;
    font-family: Geist, sans-serif; color: #131312; -webkit-font-smoothing: antialiased;
    background-color: #e8e7e2;
    background-image: radial-gradient(circle at center, rgba(19, 19, 18, .09) 1.3px, transparent 2px);
    background-size: 24px 24px; background-position: 12px 12px;
  }
  .label { margin-top: 50px; font: 500 19px/1 GeistMono, monospace; letter-spacing: .16em; text-transform: uppercase; color: #4d4c47; }
  .label b { font-weight: 600; color: #a83200; }
  .brand { display: flex; align-items: center; gap: 30px; margin-top: 40px; }
  .brand svg { width: 132px; height: 132px; display: block; border-radius: 31px; box-shadow: 0 4px 0 rgba(19, 19, 18, .18), 0 16px 30px rgba(255, 90, 18, .28); }
  .word { display: flex; flex-direction: column; gap: 14px; }
  .word strong { font: 900 128px/.8 Doto, monospace; font-variation-settings: "ROND" 100; letter-spacing: .06em; margin-right: -.06em; }
  .word small { font: 500 21px/1 GeistMono, monospace; letter-spacing: .32em; text-transform: uppercase; color: #4d4c47; padding-left: 6px; }
  h1 { margin: 46px 0 0; font-weight: 720; font-size: 54px; line-height: 1.04; letter-spacing: -.035em; text-align: center; }
  p { margin: 16px 0 0; font-weight: 500; font-size: 26px; line-height: 1.3; letter-spacing: -.01em; color: #4d4c47; text-align: center; }
  .lcd {
    position: absolute; left: 44px; right: 44px; bottom: 40px; height: 92px; border-radius: 16px;
    display: flex; align-items: center; justify-content: center; gap: 26px;
    background: linear-gradient(#cdd7bd, #c2ccb1); color: #1b2417;
    box-shadow: 0 0 0 1.5px #98a38a, 0 0 0 6px #e3e1da, 0 0 0 7.5px #b8b6ad, inset 0 3px 10px rgba(0, 0, 0, .28);
    font: 900 34px/1 Doto, monospace; font-variation-settings: "ROND" 100; letter-spacing: .06em; text-transform: uppercase;
  }
  .lcd::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit;
    background-image: linear-gradient(to right, rgba(0, 0, 0, .09) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, .09) 1px, transparent 1px);
    background-size: 4px 4px; mix-blend-mode: multiply; opacity: .7;
  }
  .lcd i { width: 9px; height: 9px; border-radius: 2px; background: #1b2417; opacity: .55; }
</style></head><body>
  <div class="label"><b>SQ-1</b> &nbsp;Snakes of the Indian subcontinent</div>
  <div class="brand">${icon}<div class="word"><strong>SARPA</strong><small>Indian snake quiz</small></div></div>
  <h1>How well do you know India’s snakes?</h1>
  <p>Spot the snake in real photos, and learn why each answer is right or wrong.</p>
  <div class="lcd"><span>Photo quiz</span><i></i><span>Herpdle</span><i></i><span>Daily</span><i></i><span>Leaderboards</span></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => ['Geist', 'GeistMono', 'Doto'].filter((f) => !document.fonts.check(`700 20px ${f}`)));
  if (missing.length) throw new Error('fonts did not load: ' + missing.join(', '));
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 90 });
  await browser.close();
  console.log(`${OUT} written (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
})().catch((e) => { console.error(e); process.exit(1); });
