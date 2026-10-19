#!/usr/bin/env node
/* Layout and design checks, run on every page at phone, tablet, laptop and wide-screen sizes, in light and dark mode.
 *
 *   node scripts/qa/layout.js [baseUrl] [--quick] [--shots <dir>] [--only <route-substring>]
 *
 * Checks (each failure is printed with the page, the screen size and the element):
 *   - horizontal overflow: nothing sticks out of the screen sideways
 *   - spilling text: a word or label wider than the box it sits in
 *   - clipped text: text cut off by overflow:hidden (ellipsis is reported separately as a note)
 *   - tap targets: buttons and links on touch screens are at least 40 px in both directions
 *   - contrast: text against its background meets WCAG AA (4.5:1, or 3:1 for large text)
 *   - broken images, JavaScript errors
 *   - content hidden behind the bottom tab bar when scrolled to the end
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:8765/index.html').replace(/#.*$/, '');
const quick = flag('--quick');
const shotsDir = opt('--shots');
const only = opt('--only');
const vpFilter = opt('--vp');          // comma-separated viewport names, e.g. phone,tablet (lets you run shards in parallel)
const themeFilter = opt('--theme');    // light | dark

const VIEWPORTS = [
  { name: 'phone-xs', w: 320, h: 568, touch: true },
  { name: 'phone-small', w: 360, h: 640, touch: true },
  { name: 'phone-se', w: 375, h: 667, touch: true },
  { name: 'phone', w: 390, h: 844, touch: true },
  { name: 'phone-large', w: 430, h: 932, touch: true },
  { name: 'phone-landscape-small', w: 667, h: 375, touch: true },
  { name: 'phone-landscape', w: 844, h: 390, touch: true },
  { name: 'tablet', w: 768, h: 1024, touch: true },
  { name: 'tablet-air', w: 820, h: 1180, touch: true },
  { name: 'tablet-landscape', w: 1024, h: 768, touch: true },
  { name: 'laptop-small', w: 1280, h: 720 },
  { name: 'laptop', w: 1366, h: 768 },
  { name: 'desktop', w: 1440, h: 900 },
  { name: 'wide', w: 1920, h: 1080 },
  { name: 'ultrawide', w: 2560, h: 1300 },
];
const QUICK = new Set(['phone-xs', 'phone-small', 'phone', 'phone-landscape', 'tablet', 'laptop', 'wide']);
const DARK_ON = new Set(['phone-xs', 'phone', 'phone-landscape', 'tablet', 'desktop', 'ultrawide']);

const ROUTES = [
  { r: '/', name: 'home' },
  { r: '/play', name: 'setup' },
  { r: '/daily', name: 'daily' },
  { r: '/guide', name: 'guide' },
  { r: '/guide/naja-naja', name: 'species' },
  { r: '/guide/lycodon-fasciolatus', name: 'species-hard' },
  { r: '/compare?a=naja-naja&b=ptyas-mucosa', name: 'compare' },
  { r: '/learn', name: 'flashcards' },
  { r: '/safety', name: 'safety' },
  { r: '/about', name: 'about' },
  { r: '/credits', name: 'credits' },
  { r: '/stats', name: 'progress', after: 'play-one' },
  { r: 'quiz', name: 'quiz' },
  { r: 'quiz-answered', name: 'quiz-answered' },
  { r: '/results', name: 'results', after: 'play-one' },
];

/* ------------------------------------------------------------------ */
/*  The checks, executed inside the page                                */
/* ------------------------------------------------------------------ */

function inPage(opts) {
  const issues = [];
  const add = (type, el, detail) => issues.push({ type, el: describe(el), detail });
  const vw = window.innerWidth, vh = window.innerHeight;

  function describe(el) {
    if (!el || !el.tagName) return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return txt ? `${s} "${txt}"` : s;
  }

  const style = (el) => getComputedStyle(el);
  const visible = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = style(e);
      if (s.display === 'none' || s.visibility === 'hidden' || e.hasAttribute('hidden')) return false;
      // "visually hidden" text for screen readers (1 px box, clipped)
      if (s.position === 'absolute' && (parseFloat(s.width) <= 1 || parseFloat(s.height) <= 1) && s.overflow !== 'visible') return false;
      if (e.getAttribute && e.getAttribute('aria-hidden') === 'true' && e !== el && !opts.includeHidden) { /* decorative content is still laid out */ }
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const scrollParent = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const s = style(e);
      if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1) return e;
    }
    return null;
  };
  const clipRect = (el) => {
    let r = el.getBoundingClientRect();
    let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
    for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
      const s = style(e);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const p = e.getBoundingClientRect();
        if (s.overflowX !== 'visible') { left = Math.max(left, p.left); right = Math.min(right, p.right); }
        if (s.overflowY !== 'visible') { top = Math.max(top, p.top); bottom = Math.min(bottom, p.bottom); }
      }
    }
    return { left, right, top, bottom };
  };
  const SKIP = '.sr-only, .skip, [data-qa-skip]';
  const all = Array.from(document.body.querySelectorAll('*')).filter((el) => !el.matches(SKIP) && !el.closest(SKIP) && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'NOSCRIPT');

  /* 1. horizontal overflow */
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) add('overflow-x', de, `page is ${de.scrollWidth}px wide on a ${vw}px screen`);
  for (const el of all) {
    if (!visible(el)) continue;
    const s = style(el);
    if (s.position === 'fixed' && el.closest('#modal-root, #toast-root')) continue;
    const c = clipRect(el);
    if (c.right > vw + 1.5 || c.left < -1.5) {
      if (el.closest('.confetti')) continue;
      add('overflow-x', el, `spans ${Math.round(c.left)}..${Math.round(c.right)} on a ${vw}px screen`);
    }
  }

  /* 2. text that spills out of its own box, or is cut off */
  for (const el of all) {
    if (!visible(el) || el.closest('svg, canvas, .photo, .confetti')) continue;
    const s = style(el);
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const clipped = s.overflowX !== 'visible';
    if (!clipped && er.width > 0 && tr.right > er.right + 1.5 && s.display !== 'inline') add('text-spill', el, `text reaches ${Math.round(tr.right)} but the box ends at ${Math.round(er.right)}`);
    if (clipped && el.scrollWidth > el.clientWidth + 1 && !/(auto|scroll)/.test(s.overflowX)) {
      add(s.textOverflow === 'ellipsis' ? 'note-ellipsis' : 'text-clipped', el, `content ${el.scrollWidth}px in a ${el.clientWidth}px box`);
    }
    if (s.overflowY !== 'visible' && !/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 2 && s.display !== 'inline') add('text-clipped', el, `content ${el.scrollHeight}px tall in a ${el.clientHeight}px box`);
  }

  /* 3. tap targets */
  if (opts.touch) {
    const sel = 'a[href], button, select, input:not([type=hidden]), summary, [role=button], [role=radio], [role=switch], label.switch';
    for (const el of document.body.querySelectorAll(sel)) {
      if (!visible(el) || el.matches(SKIP) || el.closest(SKIP)) continue;
      const s = style(el);
      if (s.display === 'inline') continue;                                    // links inside a sentence
      if (el.tagName === 'INPUT' && (s.opacity === '0' || s.pointerEvents === 'none')) continue;
      if (el.closest('.credit, .gallery-strip, .foot-links')) { /* credits are small print by nature; strip is checked below */ }
      const r = el.getBoundingClientRect();
      if (el.closest('.credit')) continue;
      if (r.width < 40 || r.height < 40) add('tap-target', el, `${Math.round(r.width)}x${Math.round(r.height)}px`);
    }
  }

  /* 4. contrast */
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pageBg = parse(style(document.body).backgroundColor);
  function backdrop(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = style(e);
      const bg = parse(s.backgroundColor);
      if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 0.99) break;
      if (s.backgroundImage !== 'none' && /url\(/.test(s.backgroundImage) && !/gradient/.test(s.backgroundImage)) return null;   // photo behind the text
    }
    let out = pageBg && pageBg.a ? pageBg : { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) out = blend(layers[i], out);
    return out;
  }
  const seen = new Set();
  for (const el of all) {
    if (!visible(el) || el.closest('svg, canvas, .photo, .confetti, [aria-hidden="true"], .demo, .pixsnake')) continue;
    if (el.matches(':disabled') || el.closest(':disabled')) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const s = style(el);
    let fg = parse(s.color);
    if (!fg) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= parseFloat(style(e).opacity);
    fg = { ...fg, a: fg.a * opacity };
    const bg = backdrop(el);
    if (!bg) continue;
    const eff = blend(fg, bg);
    const cr = ratio(eff, bg);
    const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (cr < need - 0.05) {
      const key = describe(el) + cr.toFixed(1);
      if (!seen.has(key)) { seen.add(key); add('contrast', el, `${cr.toFixed(2)}:1 (needs ${need}), ${Math.round(size)}px, ${s.color} on rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`); }
    }
  }

  /* 5. images */
  for (const img of document.querySelectorAll('img')) {
    if (!visible(img) || img.closest('.photo-blur')) continue;
    if (img.classList.contains('photo-blur')) continue;
    if (img.complete && img.naturalWidth === 0) add('broken-image', img, img.getAttribute('src'));
  }

  /* 6. the bottom tab bar must not hide the end of the page */
  const tab = document.getElementById('tabbar');
  if (tab && visible(tab)) {
    const tr = tab.getBoundingClientRect();
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    const hidden = [];
    for (const el of document.body.querySelectorAll('a[href], button, p, h1, h2, h3, h4, li, dt, dd, small, label, span.legend, summary')) {
      if (el.closest('#tabbar, #modal-root, #toast-root') || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      const fixed = (() => { for (let e = el; e; e = e.parentElement) { const p = style(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; })();
      if (fixed) continue;
      if (r.bottom > tr.top + 2 && r.top < tr.bottom && r.width > 0) hidden.push(el);
    }
    hidden.slice(0, 3).forEach((el) => add('hidden-by-tabbar', el, 'sits under the tab bar when scrolled to the end'));
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  Driver                                                              */
/* ------------------------------------------------------------------ */

async function playOne(page) {
  await page.goto(`${base}#/play`, { waitUntil: 'load' });
  await page.evaluate(() => SQ.quiz.start({ mode: 'quiz', count: 10, difficulty: 'intermediate', region: 'all', timer: 0, hints: true, preferUnseen: false }));
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('.option');
    const a = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sarpa.v1.session')); const q = s.questions[s.index]; return { ans: q.answer, i: s.index }; });
    await page.click(`.option[data-i="${a.i % 3 === 2 ? (a.ans + 1) % 4 : a.ans}"]`);
    await page.waitForSelector('.explain .verdict');
    await page.click('.next-btn');
  }
  await page.waitForSelector('.result-hero');
}

async function openRoute(page, route) {
  if (route.r === 'quiz' || route.r === 'quiz-answered') {
    await page.goto(`${base}#/play`, { waitUntil: 'load' });
    await page.evaluate(() => { SQ.quiz.discard(); SQ.quiz.start({ mode: 'quiz', count: 20, difficulty: 'intermediate', region: 'all', timer: 30, hints: true, preferUnseen: false }); });
    await page.waitForSelector('.option');
    if (route.r === 'quiz-answered') {
      await page.click('.hint-btn');
      await page.click('.option >> nth=1');
      await page.waitForSelector('.explain .verdict');
    }
    return;
  }
  await page.goto(`${base}#${route.r}`, { waitUntil: 'load' });
  await page.waitForSelector('#main > :not(.boot)', { timeout: 10000 });
}

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  const notes = new Map();
  let checked = 0;
  const themes = quick ? ['light'] : ['light', 'dark'];
  for (const vp of VIEWPORTS) {
    if (quick && !QUICK.has(vp.name)) continue;
    if (vpFilter && !vpFilter.split(',').includes(vp.name)) continue;
    for (const theme of themes) {
      if (themeFilter && theme !== themeFilter) continue;
      if (theme === 'dark' && !DARK_ON.has(vp.name)) continue;
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.touch ? 2 : 1, hasTouch: !!vp.touch, isMobile: !!vp.touch && vp.w < 700, colorScheme: theme,
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(m.text()); });
      await playOne(page);
      for (const route of ROUTES) {
        if (only && !route.name.includes(only) && !route.r.includes(only)) continue;
        await openRoute(page, route);
        // let lazy images load before looking at them
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight * 0.8) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 40)); }
          window.scrollTo({ top: 0, behavior: 'instant' });
        });
        await page.waitForTimeout(450);
        const found = await page.evaluate(inPage, { touch: !!vp.touch });
        checked++;
        const label = `${route.name} @ ${vp.name} ${vp.w}x${vp.h} ${theme}`;
        for (const f of found) {
          if (f.type === 'note-ellipsis') { notes.set(`${route.name}: ${f.el}`, (notes.get(`${route.name}: ${f.el}`) || 0) + 1); continue; }
          problems.push({ label, ...f });
        }
        if (shotsDir) {
          fs.mkdirSync(shotsDir, { recursive: true });
          await page.screenshot({ path: path.join(shotsDir, `${route.name}-${vp.name}-${theme}.png`), fullPage: false });
        }
      }
      errors.forEach((e) => problems.push({ label: `javascript @ ${vp.name} ${theme}`, type: 'js-error', el: '', detail: e }));
      await ctx.close();
    }
  }
  await browser.close();

  // group identical findings so that one design bug is one line
  const grouped = new Map();
  for (const p of problems) {
    const key = `${p.type} | ${p.el} | ${p.detail.replace(/\d+(\.\d+)?/g, '#')}`;
    const g = grouped.get(key) || { ...p, where: [] };
    g.where.push(p.label);
    grouped.set(key, g);
  }
  const list = Array.from(grouped.values());
  list.forEach((g) => console.log(`FAIL ${g.type.padEnd(15)} ${g.el}\n     ${g.detail}\n     at: ${g.where.slice(0, 4).join(' | ')}${g.where.length > 4 ? ` (+${g.where.length - 4} more)` : ''}`));
  if (notes.size) console.log(`\n${notes.size} element(s) use an ellipsis on some screens (check they only cut off minor text):\n` + Array.from(notes.keys()).slice(0, 12).map((k) => '  ' + k).join('\n'));
  console.log(`\n${checked} page views checked, ${list.length} distinct problem(s)`);
  process.exitCode = list.length ? 1 : 0;
})();
