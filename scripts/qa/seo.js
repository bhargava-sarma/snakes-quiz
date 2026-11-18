#!/usr/bin/env node
/* Search-engine checks on the prerendered pages, read as plain files, the way a search engine or a link preview reads
 * them (no JavaScript). Run after scripts/build-pages.js; needs nothing else:  node scripts/qa/seo.js
 *
 *   - robots.txt allows the site and names the sitemap; sitemap.xml lists only real, indexable pages
 *   - every page: one <title> naming the site, a description of a sensible length, the canonical address it is
 *     listed under, link-preview tags with full addresses, one <h1>, valid structured data, the page's text in the HTML
 *   - no two indexable pages share a title or a description
 *   - every link to another page of the site, and every picture, leads somewhere that exists
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const win = {};
vm.runInNewContext(read('js/config.js'), { window: win });
const SITE = win.SQ_CONFIG.siteUrl.replace(/\/+$/, '');

let failures = 0, checks = 0;
const problems = [];
function ok(cond, msg) { checks++; if (!cond) { failures++; problems.push(msg); } }

/** The file a path of the site is served from, as Vercel finds it ("cleanUrls"), or null. */
function fileOf(urlPath) {
  const p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const tries = p === '/' ? ['index.html'] : [p.slice(1), p.slice(1) + '.html', p.slice(1) + '/index.html'];
  return tries.find((t) => { try { return fs.statSync(path.join(ROOT, t)).isFile(); } catch (e) { return false; } }) || null;
}

const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function meta(html, key, value) {
  const re = new RegExp(`<meta[^>]*\\s${key}="${value.replace(/[:.]/g, '\\$&')}"[^>]*>`);
  const m = re.exec(html);
  return m ? unesc(attr(m[0], 'content') || '') : null;
}

/* ---------- the site's address ---------- */

ok(/^https:\/\/[a-z0-9.-]+$/.test(SITE), `siteUrl in js/config.js is a plain https:// address (${SITE})`);
const movedFrom = (/var MOVED_FROM = (\[[^\]]*\])/.exec(read('js/boot.js')) || [, '[]'])[1];
ok(!movedFrom.includes(`'${SITE.replace(/^https:\/\//, '')}'`), 'js/boot.js does not send visitors away from the current address');

/* ---------- robots.txt and sitemap.xml ---------- */

const robots = read('robots.txt');
ok(/^User-agent: \*$/m.test(robots) && /^Allow: \/$/m.test(robots), 'robots.txt: allows every page');
ok(!/^Disallow: \/$/m.test(robots), 'robots.txt: does not block the whole site');
ok(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots.txt: names the sitemap with its full address');

const sitemap = read('sitemap.xml');
const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => unesc(m[1]));
ok(sitemap.startsWith('<?xml') && /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(sitemap), 'sitemap.xml: a valid urlset');
ok(locs.length > 100, `sitemap.xml: lists the site's pages (${locs.length})`);
ok(new Set(locs).size === locs.length, 'sitemap.xml: no address twice');
ok(Array.from(sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)).every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[1])), 'sitemap.xml: every lastmod is a date');

/* ---------- every page ---------- */

const titles = new Map(), descs = new Map();
const pages = locs.map((loc) => {
  ok(loc.startsWith(SITE + '/'), `sitemap: ${loc} is not on ${SITE}`);
  const p = loc.slice(SITE.length) || '/';
  return { loc, path: p, file: fileOf(p) };
});
// pages that are not in the sitemap but must still be right
const extra = ['/404', '/me', '/quiz', '/results', '/legal'].map((p) => ({ loc: SITE + p, path: p, file: fileOf(p), unlisted: true }));

const linkTargets = new Map();
for (const pg of pages.concat(extra)) {
  const where = pg.path;
  if (!pg.file) { ok(false, `${where}: no file for this address`); continue; }
  const html = read(pg.file);
  const head = html.slice(0, html.indexOf('</head>'));
  const titleM = /<title>([^<]*)<\/title>/.exec(head);
  const title = titleM ? unesc(titleM[1]) : '';
  const desc = meta(head, 'name', 'description') || '';
  const robotsMeta = meta(head, 'name', 'robots') || '';
  const canonM = /<link[^>]*rel="canonical"[^>]*>/.exec(head);
  const canonical = canonM ? attr(canonM[0], 'href') : null;
  const noindex = /noindex/.test(robotsMeta);

  ok((head.match(/<title>/g) || []).length === 1, `${where}: exactly one <title>`);
  ok(/Sarpa/.test(title) && title.length >= 10 && title.length <= 80, `${where}: title "${title}" (${title.length} characters, should name Sarpa and be 10-80 long)`);
  ok(desc.length >= 50 && desc.length <= 170, `${where}: description of ${desc.length} characters (50-170): "${desc.slice(0, 60)}..."`);
  ok(!!robotsMeta, `${where}: a robots tag`);
  ok(!!canonical && canonical.startsWith(SITE + '/'), `${where}: a full canonical address`);
  ok((head.match(/rel="canonical"/g) || []).length === 1, `${where}: one canonical link`);
  ok(/<html lang="en"/.test(html), `${where}: the page's language`);
  ok(/<meta name="viewport"/.test(head), `${where}: a viewport tag (mobile friendly)`);
  if (!pg.unlisted) {
    ok(!noindex, `${where}: listed in the sitemap but marked noindex`);
    ok(canonical === pg.loc, `${where}: canonical is ${canonical}, not ${pg.loc}`);
    for (const [k, v] of [['og:title', null], ['og:description', null], ['og:url', pg.loc], ['og:image', null], ['og:type', null]]) {
      const val = meta(head, 'property', k);
      ok(!!val && (v === null || val === v), `${where}: ${k} ${v ? 'is ' + v : 'is set'} (got ${val})`);
    }
    const img = meta(head, 'property', 'og:image') || '';
    ok(img.startsWith(SITE + '/'), `${where}: og:image is a full address on this site`);
    if (img.startsWith(SITE + '/')) ok(!!fileOf(img.slice(SITE.length)), `${where}: og:image ${img} exists`);
    // structured data
    const ld = Array.from(head.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g));
    ok(ld.length === 1, `${where}: one block of structured data`);
    ld.forEach((m) => {
      let d = null;
      try { d = JSON.parse(m[1]); } catch (e) { ok(false, `${where}: structured data is not valid JSON (${e.message})`); return; }
      ok(d['@context'] === 'https://schema.org' && Array.isArray(d['@graph']) && d['@graph'].every((x) => x['@type']), `${where}: schema.org graph with typed items`);
      if (where !== '/') ok(d['@graph'].some((x) => x['@type'] === 'BreadcrumbList'), `${where}: breadcrumbs in the structured data`);
    });
    if (titles.has(title)) ok(false, `${where}: same title as ${titles.get(title)}: "${title}"`); else titles.set(title, where);
    if (descs.has(desc)) ok(false, `${where}: same description as ${descs.get(desc)}`); else descs.set(desc, where);
  } else if (where !== '/legal') {
    ok(noindex, `${where}: kept out of search results (noindex)`);
  }
  // the page itself is in the HTML: one heading and real text (not just the loading screen)
  const main = (/<main[^>]*>([\s\S]*?)<\/main>/.exec(html) || [, ''])[1];
  const text = main.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!['/me', '/quiz', '/results'].includes(where)) {
    ok((main.match(/<h1[\s>]/g) || []).length === 1, `${where}: exactly one <h1> in the page`);
    ok(text.length > 200, `${where}: the page's text is in the HTML (${text.length} characters)`);
  }
  ok(/<header id="site-header"[^>]*>[\s\S]*?<a [^>]*href="\/play"/.test(html), `${where}: the site's menu is in the HTML`);
  // every link to a page or file of the site, and every picture
  for (const m of html.matchAll(/<(a|img|link)\s[^>]*?(href|src)="(\/[^"]*)"/g)) {
    const target = unesc(m[3]);
    if (/^\/(api|_vercel)\//.test(target) || target.startsWith('//')) continue;
    if (!linkTargets.has(target)) linkTargets.set(target, where);
  }
  for (const m of html.matchAll(/<img\s[^>]*>/g)) ok(attr(m[0], 'alt') !== null, `${where}: a picture without alt text: ${m[0].slice(0, 80)}`);
}
for (const [target, from] of linkTargets) ok(!!fileOf(target), `${from}: link to ${target}, which does not exist`);

// the species pages are all there
const win2 = {};
vm.runInNewContext(read('data/species.js'), { window: win2 });
const ids = win2.SQ_SPECIES.species.map((s) => s.id);
ok(ids.every((id) => locs.includes(`${SITE}/guide/${id}`)), 'sitemap: every species page');
ok(ids.every((id) => fs.existsSync(path.join(ROOT, 'images/share', id + '.jpg'))), 'every species has a share picture');
ok(fs.existsSync(path.join(ROOT, 'favicon.ico')) && fs.existsSync(path.join(ROOT, 'apple-touch-icon.png')), 'favicon.ico and apple-touch-icon.png');

console.log(`${pages.length} pages in the sitemap, ${linkTargets.size} distinct internal links and pictures, ${checks} checks`);
if (failures) {
  console.log(`\n${failures} problem(s):`);
  Array.from(new Set(problems)).slice(0, 50).forEach((p) => console.log(' -', p));
  process.exitCode = 1;
} else console.log('SEO checks passed');
