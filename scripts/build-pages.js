#!/usr/bin/env node
/* Prerenders every page of Sarpa into a plain HTML file, and writes sitemap.xml and robots.txt.
 *
 * The app draws its pages in the browser. Search engines, link previews (WhatsApp, X, Facebook ...) and people without
 * JavaScript would otherwise get an empty page, so this script opens every page in a headless browser, as a first-time
 * visitor who is not signed in, and saves what the app drew: the head tags from js/seo.js (title, description,
 * canonical address, link preview, structured data) and the header, page and footer, written into index.html's
 * markers. Each page goes where Vercel serves its address ("cleanUrls"): /guide/naja-naja -> guide/naja-naja.html.
 * When the app loads, it draws the page again in place.
 *
 *   node scripts/build-pages.js                       everything (a few minutes)
 *   node scripts/build-pages.js --only /about,/guide  just these pages (the sitemap is left alone)
 *
 * Run it, and commit what it writes, after changing the data (scripts/dataset steps 9 and 10), the text of a page,
 * index.html, or siteUrl in js/config.js. It also makes, when missing or out of date, the picture shown when a species
 * page is shared (images/share/<id>.jpg, cut from the species' cover photo), favicon.ico and apple-touch-icon.png.
 * Needs Playwright, like the checks in scripts/qa.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only') ? opt('--only').split(',').map((s) => s.trim()).filter(Boolean) : null;
const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const PARALLEL = 4;

/** Runs one of the site's data or settings files and returns what it put on `window`. */
function load(file) {
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), { window: win });
  return win;
}
const CFG = load('js/config.js').SQ_CONFIG;
const SITE = String(CFG.siteUrl || '').replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(SITE)) { console.error('Set siteUrl in js/config.js to the site\'s full https:// address.'); process.exit(1); }
const DATA = load('data/species.js').SQ_SPECIES;

const TEMPLATE = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const BOOT = '<div class="boot" aria-hidden="true"><div class="lcd">SARPA</div></div>';
// pages that only make sense for one player (or in the middle of a game): an empty page that the app fills, kept out
// of search results
const SHELLS = { '/me': 'My progress', '/quiz': 'Quiz', '/results': 'Results' };
// addresses that show another page's content: prerendered so that they work, but not listed in the sitemap
const ALIASES = { '/legal': '/legal/terms' };

/** The file a page is saved in: "/" -> index.html, "/guide/naja-naja" -> guide/naja-naja.html. */
const fileFor = (route) => (route === '/' ? 'index.html' : route.slice(1) + '.html');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** index.html with a page's parts put between its markers. */
function fill(parts) {
  const put = (s, name, content) => {
    const re = new RegExp(`(<!--${name}-->)[\\s\\S]*?(<!--/${name}-->)`);
    if (!re.test(s)) throw new Error(`index.html has lost its <!--${name}--> ... <!--/${name}--> markers`);
    return s.replace(re, (m, open, close) => open + content + close);
  };
  let s = TEMPLATE.replace(/<html[^>]*>/, '<html lang="en" data-prerendered>');
  s = put(s, 'seo', '\n  ' + parts.head.join('\n  ') + '\n  ');
  s = put(s, 'shell:header', parts.header);
  s = put(s, 'page', parts.main);
  s = put(s, 'shell:footer', parts.footer);
  s = put(s, 'shell:tabbar', parts.tabbar);
  return s;
}

/** What the app drew, cleaned up for a static copy (runs in the page). */
function snapshot() {
  const tidy = (root) => {
    // live data and today's date stay out; photos show without waiting for the app; form fields keep their state
    root.querySelectorAll('[data-noprerender]').forEach((e) => e.remove());
    root.querySelectorAll('.is-loading').forEach((e) => e.classList.remove('is-loading'));
    root.querySelectorAll('input').forEach((i) => {
      if (i.type === 'checkbox' || i.type === 'radio') i.toggleAttribute('checked', i.checked);
      else if (i.value) i.setAttribute('value', i.value);
    });
    root.querySelectorAll('select').forEach((sel) => {
      Array.from(sel.options).forEach((o) => o.toggleAttribute('selected', o.selected));
      // a long list (the compare page lists every snake twice) keeps only its choice: the app puts the rest back
      if (sel.options.length > 40) {
        Array.from(sel.options).forEach((o) => { if (!o.selected) o.remove(); });
        sel.querySelectorAll('optgroup').forEach((g) => { if (!g.children.length) g.remove(); });
      }
    });
    return root.innerHTML;
  };
  const part = (id) => tidy(document.getElementById(id));
  return {
    head: [document.querySelector('head > title').outerHTML].concat(Array.from(document.head.querySelectorAll('[data-seo]'), (e) => e.outerHTML)),
    header: part('site-header'), main: part('main'), footer: part('site-footer'), tabbar: part('tabbar'),
    path: location.pathname, title: document.title,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || '',
    robots: (document.querySelector('meta[name="robots"]') || {}).content || '',
    h1: (document.querySelector('main h1') || {}).textContent || '',
  };
}

/** A seeded Math.random, a clean storage and a flag, before any of the page's own scripts run. */
function prepare(seed) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) { /* none */ }
  window.SQ_PRERENDER = true;
}

/** Starts the local server (in-memory accounts, the app's own page for every address) and waits until it answers. */
async function startServer() {
  const env = Object.assign({}, process.env, { SARPA_STORE: 'memory' });
  Object.keys(env).filter((k) => /^(UPSTASH|KV)_/.test(k)).forEach((k) => delete env[k]);
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts/dev-server.js'), String(PORT), '--shell'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + '/api/sarpa?action=health'); if (r.ok) return child; } catch (e) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error('the local server did not start');
}

/** A PNG of an SVG file at a given size. */
async function svgPng(page, file, size, transparent) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;${transparent ? 'background:transparent' : ''}"><img src="${BASE}/${file}" style="display:block;width:${size}px;height:${size}px"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  return page.screenshot({ type: 'png', omitBackground: !!transparent });
}

/** An .ico file holding PNG images (every browser since 2007 reads these). */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size, o); head.writeUInt8(size, o + 1); head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(png.length, o + 8); head.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([head].concat(images.map((x) => x.png)));
}

/** favicon.ico, apple-touch-icon.png and the share picture of every species, when missing or out of date. */
async function pictures(context) {
  const page = await context.newPage();
  const fav = path.join(ROOT, 'favicon.ico');
  if (!fs.existsSync(fav)) {
    const sizes = [16, 32, 48];
    const images = [];
    for (const size of sizes) images.push({ size, png: await svgPng(page, 'assets/icon.svg', size, true) });
    fs.writeFileSync(fav, ico(images));
    console.log('wrote favicon.ico');
  }
  const touch = path.join(ROOT, 'apple-touch-icon.png');
  if (!fs.existsSync(touch)) {
    fs.writeFileSync(touch, await svgPng(page, 'assets/icon-maskable.svg', 180, false));
    console.log('wrote apple-touch-icon.png');
  }
  // share pictures: 800 x 420 JPEG (the shape link previews use) of the cover photo, whole (never cropped: a rearing
  // cobra keeps its head) on a blurred copy of itself; covers.json remembers which photo each one was made from, so
  // that a new cover makes a new picture
  const dir = path.join(ROOT, 'images/share');
  fs.mkdirSync(dir, { recursive: true });
  const listFile = path.join(dir, 'covers.json');
  const made = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : {};
  const todo = DATA.species.filter((sp) => made[sp.id] !== sp.cover || !fs.existsSync(path.join(dir, sp.id + '.jpg')));
  await page.setViewportSize({ width: 800, height: 420 });
  for (const sp of todo) {
    const src = `${BASE}/images/${sp.id}/${sp.cover}.avif`;
    await page.setContent(`<html><body style="margin:0;width:800px;height:420px;overflow:hidden;position:relative;background:#1b1b1a">
      <img src="${src}" style="position:absolute;left:-40px;top:-40px;width:880px;height:500px;object-fit:cover;filter:blur(22px) brightness(.55)">
      <img src="${src}" style="position:absolute;left:0;top:0;width:800px;height:420px;object-fit:contain"></body></html>`);
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
    await page.screenshot({ path: path.join(dir, sp.id + '.jpg'), type: 'jpeg', quality: 72 });
    made[sp.id] = sp.cover;
  }
  Object.keys(made).forEach((id) => { if (!DATA.species.some((sp) => sp.id === id)) { delete made[id]; fs.rmSync(path.join(dir, id + '.jpg'), { force: true }); } });
  fs.writeFileSync(listFile, JSON.stringify(made, null, 1) + '\n');
  if (todo.length) console.log(`wrote ${todo.length} share pictures in images/share`);
  await page.close();
}

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  // a first-time visitor in India's time zone (the daily puzzles change at midnight there), on a laptop-sized screen,
  // on the day the data was built, with a fixed "random" sequence: the same input always gives the same pages
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Kolkata', serviceWorkers: 'block' });
  const day = (DATA.meta && DATA.meta.generated) || '2026-01-01';
  await context.clock.setFixedTime(new Date(day + 'T12:00:00+05:30'));
  await context.addInitScript(prepare, 20261117);
  const problems = [];
  let exit = 0;
  try {
    await pictures(context);

    // every address the site has (asked of the app itself, so that it can never miss one)
    const probe = await context.newPage();
    await probe.goto(BASE + '/404', { waitUntil: 'load' });
    await probe.waitForFunction(() => window.SQ && SQ.data && SQ.data.ready && document.body.dataset.view);
    const listed = await probe.evaluate(() => [].concat(
      ['/', '/play', '/daily', '/herpdle', '/ranks', '/guide'],
      SQ.data.AREA_ORDER.map((a) => '/guide/' + SQ.data.area(a).slug),
      ['/compare', '/learn', '/safety', '/safety/north-america', '/about', '/credits', '/legal'],
      SQ.legalPages.map((p) => '/legal/' + p.key),
      SQ.data.species.slice().sort((a, b) => a.name.localeCompare(b.name)).map((sp) => '/guide/' + sp.id),
      Array.from(new Set(Object.values(SQ.data.pairMap))).map((p) => `/compare/${p.a}-vs-${p.b}`),
      ['/404']));
    const shell = await probe.evaluate(snapshot);           // the header and footer with no menu entry lit
    await probe.close();
    const routes = ONLY || listed.concat(Object.keys(SHELLS));

    // the pages, a few at a time
    const results = {};
    const queue = routes.filter((r) => !SHELLS[r]);
    let done = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      const page = await context.newPage();
      page.on('pageerror', (e) => problems.push(`${page.url()}: ${e.message}`));
      while (queue.length) {
        const route = queue.shift();
        await page.goto(BASE + route, { waitUntil: 'load' });
        await page.waitForFunction(() => document.body.dataset.view && !document.querySelector('#main .boot'), null, { timeout: 20000 });
        await page.waitForTimeout(350);           // replies from the local server (accounts) settle
        results[route] = await page.evaluate(snapshot);
        if (++done % 50 === 0) console.log(`  ${done}/${routes.length} pages`);
      }
      await page.close();
    }));

    // check what search engines will read, then write the files
    const today = new Date().toISOString().slice(0, 10);
    const old = {};
    const oldMap = path.join(ROOT, 'sitemap.xml');
    if (fs.existsSync(oldMap)) {
      for (const m of fs.readFileSync(oldMap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) old[m[1]] = m[2];
    }
    const sitemap = [];
    let written = 0;
    for (const route of routes) {
      let html;
      const r = results[route];
      if (SHELLS[route]) {
        const head = [`<title>${esc(SHELLS[route])} · Sarpa</title>`,
          '<meta name="description" content="Sarpa, a free snake identification quiz for India and North America." data-seo>',
          '<meta name="robots" content="noindex, follow" data-seo>', `<link rel="canonical" href="${SITE}${route}" data-seo>`];
        html = fill({ head, header: shell.header, main: BOOT, footer: shell.footer, tabbar: shell.tabbar });
      } else {
        const want = SITE + (ALIASES[route] || route);
        if (r.path !== route) problems.push(`${route}: the app moved to ${r.path}`);
        if (!/Sarpa/.test(r.title)) problems.push(`${route}: the title does not name the site: "${r.title}"`);
        if (!r.h1) problems.push(`${route}: no h1`);
        const noindex = /noindex/.test(r.robots);
        if (route !== '/404') {
          if (noindex) problems.push(`${route}: marked noindex`);
          if (r.canonical !== want) problems.push(`${route}: canonical is ${r.canonical}, not ${want}`);
        }
        html = fill(r);
        if (!noindex && !ALIASES[route]) sitemap.push(route);
      }
      const file = path.join(ROOT, fileFor(route));
      const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (before !== html) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, html); written++; }
      results[route] = { changed: before !== html };
    }

    if (!ONLY) {
      // remove pages the site no longer has (a species or a pair that was dropped)
      const keep = new Set(routes.map(fileFor));
      for (const dir of ['guide', 'compare', 'legal', 'safety']) {
        const d = path.join(ROOT, dir);
        if (!fs.existsSync(d)) continue;
        for (const f of fs.readdirSync(d)) {
          if (f.endsWith('.html') && !keep.has(dir + '/' + f)) { fs.rmSync(path.join(d, f)); console.log('removed', dir + '/' + f); }
        }
      }
      const urls = sitemap.map((route) => {
        const loc = SITE + (route === '/' ? '/' : route);
        const lastmod = !results[route].changed && old[loc] ? old[loc] : today;
        return `  <url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod></url>`;
      });
      fs.writeFileSync(oldMap, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
      fs.writeFileSync(path.join(ROOT, 'robots.txt'), [
        '# Sarpa: every page is open to search engines; the API and the project\'s own files are not pages.',
        'User-agent: *',
        'Allow: /',
        'Disallow: /api/',
        'Disallow: /server/',
        'Disallow: /scripts/',
        'Disallow: /docs/',
        'Disallow: /data/kb/',
        'Disallow: /README.md',
        'Disallow: /CREDITS.md',
        '',
        `Sitemap: ${SITE}/sitemap.xml`,
        '',
      ].join('\n'));
      console.log(`sitemap.xml: ${sitemap.length} pages`);
    }
    console.log(`${routes.length} pages prerendered, ${written} changed`);
  } catch (e) {
    console.error(e);
    exit = 1;
  } finally {
    await browser.close();
    server.kill();
  }
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    problems.slice(0, 40).forEach((p) => console.log(' -', p));
    exit = 1;
  }
  process.exit(exit);
})();
