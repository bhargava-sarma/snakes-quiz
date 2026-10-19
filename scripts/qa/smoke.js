#!/usr/bin/env node
/* UI smoke test: opens every page (and every species page) in a real browser and fails on
 * stray "null"/"undefined"/"NaN"/"[object Object]" text, console errors or broken photos.
 *   node scripts/qa/smoke.js [baseUrl]      (serve the repo first: python3 -m http.server 8765)
 */
const { chromium } = require('playwright');
const base = (process.argv[2] || 'http://localhost:8765/index.html').replace(/#.*$/, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  let route = '';
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${route}: console error: ${m.text().slice(0, 160)}`); });
  page.on('pageerror', (e) => problems.push(`${route}: page error: ${e.message}`));
  page.on('requestfailed', (r) => { if (!/inaturalist-open-data/.test(r.url())) problems.push(`${route}: request failed ${r.url().slice(0, 100)}`); });

  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SQ && SQ.data && SQ.data.ready);
  const ids = await page.evaluate(() => SQ.data.species.map((s) => s.id));

  const routes = ['/', '/play', '/daily', '/guide', '/learn', '/compare', '/stats', '/safety', '/about', '/credits']
    .concat(ids.map((id) => '/guide/' + id))
    .concat([`/compare?a=${ids[0]}&b=${ids[1]}`]);

  const BAD = /(^|\s)(null|undefined|NaN)(\s|$)|\[object Object\]/;
  for (const r of routes) {
    route = r;
    await page.goto(`${base}#${r}`, { waitUntil: 'load' });
    await page.waitForTimeout(r.startsWith('/guide/') ? 120 : 400);
    const found = await page.evaluate((src) => {
      const re = new RegExp(src);
      const text = document.getElementById('main').innerText;
      const hit = text.split('\n').find((l) => re.test(l));
      const broken = [...document.querySelectorAll('#main img')].filter((i) => i.complete && i.naturalWidth === 0 && !i.dataset.fallback).length;
      return { hit, broken, empty: text.trim().length < 20 };
    }, BAD.source);
    if (found.hit) problems.push(`${r}: stray text "${found.hit.slice(0, 80)}"`);
    if (found.broken) problems.push(`${r}: ${found.broken} broken image(s)`);
    if (found.empty) problems.push(`${r}: page is empty`);
  }
  console.log(`${routes.length} pages checked`);
  if (problems.length) {
    [...new Set(problems)].slice(0, 40).forEach((p) => console.log(' -', p));
    process.exitCode = 1;
  } else console.log('smoke test passed');
  await browser.close();
})();
