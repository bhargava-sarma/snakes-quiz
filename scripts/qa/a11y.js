#!/usr/bin/env node
/* Accessibility scan with axe-core (WCAG 2.0/2.1/2.2 A + AA and best practices) over every page, on a phone and a laptop,
 * in light and dark mode. Install the engine once with `npm install --no-save axe-core`, serve the site, then:
 *   node scripts/qa/a11y.js [baseUrl]
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

let axePath;
try { axePath = require.resolve('axe-core/axe.min.js'); } catch (e) {
  try { axePath = require.resolve('axe-core/axe.min.js', { paths: [process.cwd(), path.join(__dirname, '..', '..')] }); } catch (e2) { /* handled below */ }
}
if (!axePath) { console.error('axe-core is not installed. Run:  npm install --no-save axe-core'); process.exit(2); }
const axeSrc = fs.readFileSync(axePath, 'utf8');
const base = (process.argv[2] || 'http://localhost:8765/index.html').replace(/#.*$/, '');

const ROUTES = ['/', '/play', '/daily', '/herpdle', '/herpdle?mode=practice', 'herpdle-board', '/ranks', 'account', '/guide', '/guide/naja-naja',
  '/compare?a=naja-naja&b=ptyas-mucosa', '/learn', '/safety', '/me', '/about', '/credits', '/legal', '/legal/privacy', 'quiz', 'quiz-answered', '/results'];

/** Herpdle practice with one wrong guess on the board. */
async function herpdleBoard(page) {
  await page.goto(`${base}#/herpdle?mode=practice`, { waitUntil: 'load' });
  await page.evaluate(() => { const st = SQ.herpdleState.load(); st.seenHelp = true; st.practice = null; SQ.herpdleState.save(st); });
  await page.goto(`${base}#/play`, { waitUntil: 'load' });
  await page.goto(`${base}#/herpdle?mode=practice`, { waitUntil: 'load' });
  await page.click('button:has-text("Start a practice game")');
  await page.waitForSelector('#hd-input');
  const wrong = await page.evaluate(() => { const g = SQ.herpdleState.load().practice; return SQ.data.species.find((x) => x.id !== g.sp && x.tier <= 2).name; });
  await page.fill('#hd-input', wrong);
  await page.click('.hd-go');
  await page.waitForSelector('.hd-row');
  await page.waitForTimeout(900);
}
const CONTEXTS = [['phone', 390, 844, 'light'], ['laptop', 1440, 900, 'light'], ['laptop', 1440, 900, 'dark']];

(async () => {
  const browser = await chromium.launch();
  const found = new Map();
  for (const [vp, w, h, theme] of CONTEXTS) {
    // bypassCSP: the page forbids inline scripts, and axe-core is injected as one
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, hasTouch: w < 700, isMobile: w < 700, bypassCSP: true });
    const page = await ctx.newPage();
    await page.goto(`${base}#/play`, { waitUntil: 'load' });
    await page.evaluate(() => SQ.quiz.start({ mode: 'quiz', count: 10, difficulty: 'intermediate', region: 'all', timer: 0, hints: true, preferUnseen: false }));
    for (let i = 0; i < 10; i++) {            // finish a quiz so that the results and progress pages have content
      await page.waitForSelector('.option');
      const a = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('sarpa.v1.session')); const q = s.questions[s.index]; return { ans: q.answer, i: s.index }; });
      await page.click(`.option[data-i="${a.i % 3 === 2 ? (a.ans + 1) % 4 : a.ans}"]`);
      await page.waitForSelector('.explain .verdict');
      await page.click('.next-btn');
    }
    await page.waitForSelector('.result-hero');
    for (const r of ROUTES) {
      if (r === 'herpdle-board') {
        await herpdleBoard(page);
      } else if (r === 'account') {
        await page.goto(`${base}#/`, { waitUntil: 'load' });
        await page.waitForSelector('.hero');
        await page.evaluate(() => { SQ.account.open({ mode: 'signup' }); });
        await page.waitForSelector('.modal.acct');
      } else if (r === 'quiz' || r === 'quiz-answered') {
        await page.evaluate(() => { SQ.quiz.discard(); SQ.quiz.start({ mode: 'quiz', count: 20, difficulty: 'intermediate', region: 'all', timer: 30, hints: true, preferUnseen: false }); });
        await page.waitForSelector('.option');
        if (r === 'quiz-answered') { await page.click('.hint-btn'); await page.click('.option >> nth=1'); await page.waitForSelector('.explain .verdict'); }
      } else {
        await page.goto(`${base}#${r}`, { waitUntil: 'load' });
        await page.waitForSelector('#main > :not(.boot)');
      }
      await page.waitForTimeout(600);
      await page.addScriptTag({ content: axeSrc });
      const violations = await page.evaluate(async () => {
        const res = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, sample: v.nodes[0].target.join(' ') }));
      });
      if (r === 'account') await page.keyboard.press('Escape');
      for (const v of violations) {
        const e = found.get(v.id) || { ...v, count: 0, where: new Set() };
        e.count += v.count; e.where.add(`${r} @ ${vp}/${theme}`);
        found.set(v.id, e);
      }
    }
    await ctx.close();
  }
  await browser.close();
  for (const v of found.values()) console.log(`FAIL [${v.impact}] ${v.id}: ${v.help} (${v.count} elements, e.g. ${v.sample})\n     at: ${[...v.where].slice(0, 5).join(' | ')}`);
  console.log(found.size ? `\n${found.size} kind(s) of accessibility problem` : 'axe: no accessibility violations on any page');
  process.exitCode = found.size ? 1 : 0;
})();
