#!/usr/bin/env node
/* End-to-end tests of the real user flows, in a real browser.
 *   node scripts/qa/e2e.js [baseUrl]
 * Serve the repo first. With accounts (games ask for an account first):  node scripts/dev-server.js 8765
 * Without accounts, like a plain static host:  node scripts/dev-server.js 8765 --no-api  (or python3 -m http.server 8765)
 */
const { chromium, devices } = require('playwright');
const base = (process.argv[2] || 'http://localhost:8765/index.html').replace(/#.*$/, '');

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ok ' : ' FAIL'} ${msg}`); if (!ok) failures++; };

const session = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sarpa.v1.session') || 'null'));

let accounts = 0;
/** After a game is started: in accounts mode the site asks for an account first, so make one; then wait for the game. */
async function startGame(page, ready = '.option') {
  await page.locator(`${ready}, .modal.acct`).first().waitFor({ timeout: 15000 });
  if (await page.locator('.modal.acct').count()) {
    accounts++;
    await page.click('.acct-tabs .seg-btn >> text=Create account');
    await page.fill('#acct-name', `e2e_${Date.now() % 100000}_${accounts}`);
    await page.fill('#acct-pin', '305817');
    await page.fill('#acct-pin2', '305817');
    await page.check('#acct-agree');
    await page.click('.acct-fields button[type=submit]');
  }
  await page.waitForSelector(ready);
}

async function answer(page, which) {
  // which: 'right' | 'wrong' | number
  const s = await session(page);
  const q = s.questions[s.index];
  const idx = which === 'right' ? q.answer : which === 'wrong' ? [0, 1, 2, 3].find((i) => i !== q.answer) : which;
  await page.click(`.option[data-i="${idx}"]`);
  await page.waitForSelector('.explain .verdict');
  return { q, idx };
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. a timed quiz with hints and wrong/right answers ---------- */
  console.log('\n[1] Timed quiz, hints and explanations');
  let ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}#/play`, { waitUntil: 'load' });
  await page.waitForSelector('.level');
  await page.click('.seg-btn:has-text("15s")');
  await page.click('.seg-btn:has-text("20")');
  await page.click('.level:has-text("Beginner")');
  await page.click('button:has-text("Start quiz")');
  await startGame(page);
  console.log(`  (${accounts ? 'accounts on: signed up first' : 'accounts off: guest play'})`);
  check(await page.isVisible('.timer'), 'timer is shown when a timer is chosen');
  check((await page.locator('.option').count()) === 4, 'four answer options');
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  check((await page.locator('.hint-chip').count()) === 2, 'two hints can be revealed');
  const wrong = await answer(page, 'wrong');
  const D = await page.evaluate((q) => {
    const spName = SQ.data.byId[q.species].name;
    return { spName, others: q.options.filter((id) => id !== q.species).map((id) => SQ.data.byId[id].name) };
  }, wrong.q);
  check(await page.isVisible('.verdict.bad'), 'wrong answer shows a "not quite" verdict');
  check((await page.locator('.explain .why-card').count()) === 1, 'the correct species is explained');
  check((await page.locator('.explain .whynot').count()) === 3, 'every other option has a "why not" card');
  check((await page.locator('.explain .whynot.chosen').count()) === 1, 'the option the player picked is highlighted');
  const firstCard = await page.locator('.explain .whynot').first().innerText();
  check(/your answer/i.test(firstCard), 'the picked option is listed first');
  check(await page.locator('.option.correct').count() === 1 && await page.locator('.option.wrong').count() === 1, 'correct and wrong buttons are coloured');
  check(await page.locator('.photo-foot .credit').count() === 1, 'the photo credit is shown');
  await page.click('.next-btn');
  await page.waitForFunction(() => /Question 2 of 20/.test(document.querySelector('.q-count').textContent));
  const right = await answer(page, 'right');
  check(await page.isVisible('.verdict.ok'), 'right answer shows a "correct" verdict');
  check((await page.locator('.explain .whynot').count()) === 3, 'wrong options are explained even when the answer was right');
  check((await page.locator('.explain .whynot.chosen').count()) === 0, 'no option is marked as "your answer" after a right answer');

  /* ---------- 2. reload mid-quiz and resume ---------- */
  console.log('\n[2] Reload and resume');
  const before = await session(page);
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.option');
  const afterReload = await session(page);
  check(afterReload.index === before.index && afterReload.answers.length === before.answers.length, 'quiz state survives a reload');
  check(await page.isVisible('.explain .verdict'), 'an answered question shows its explanation again after reload');
  check((await session(page)).answers.length === 2, 'the answered question is not answered twice');

  /* ---------- 3. finish the quiz, review ---------- */
  console.log('\n[3] Finishing and results');
  await page.click('.next-btn');
  for (let i = 3; i <= 20; i++) {
    await page.waitForFunction((n) => new RegExp(`Question ${n} of 20`).test(document.querySelector('.q-count').textContent), i);
    await answer(page, i % 4 === 0 ? 'wrong' : 'right');
    await page.click('.next-btn');
  }
  await page.waitForSelector('.result-hero');
  check(/#\/results/.test(page.url()), 'finishing shows the results page');
  const pctText = await page.locator('.ring-label strong').innerText();
  check(/^\d+%$/.test(pctText), `results show a score (${pctText})`);
  check((await page.locator('.tile').count()) === 20, 'all 20 answers are listed');
  await page.click('.tile >> nth=3');
  await page.waitForSelector('.modal .explain');
  check((await page.locator('.modal .whynot').count()) === 3, 'tapping an answer reopens the full explanation');
  await page.keyboard.press('Escape');
  check((await page.locator('.modal').count()) === 0, 'Escape closes the dialog');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sarpa.v1.progress')));
  check(stored.totals.games === 1 && stored.totals.answered === 20, 'the game was saved to the player’s stats');
  await page.click('button:has-text("Practise the")');
  await page.waitForSelector('.option');
  check(/practice/i.test(await page.locator('.q-title-mini').innerText()), 'practising the missed snakes starts a focused quiz');
  await page.click('#quit-btn');
  await page.click('.modal button:has-text("Discard quiz")');
  await page.waitForSelector('.hero');

  /* ---------- 4. variety between games ---------- */
  console.log('\n[4] Variety');
  const sets = [];
  for (let g = 0; g < 3; g++) {
    await page.goto(`${base}#/play`);
    await page.waitForSelector('.level');
    await page.click('.level:has-text("All species")');
    await page.click('button:has-text("Start quiz")');
    await page.waitForSelector('.option');
    sets.push(new Set((await session(page)).questions.map((q) => q.photo)));
    await page.click('#quit-btn');
    await page.click('.modal button:has-text("Discard quiz")');
  }
  const overlap = [...sets[0]].filter((x) => sets[1].has(x)).length;
  check(overlap <= 4, `two 20-question games share ${overlap} photos`);
  const stSeen = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('sarpa.v1.progress')).seen).length);
  check(stSeen >= 20, 'photos you have seen are remembered, so they are avoided next time');

  /* ---------- 5. region filter ---------- */
  console.log('\n[5] Region filter');
  await page.goto(`${base}#/play`);
  await page.waitForSelector('#region');
  const state = await page.evaluate(() => SQ.data.regions(12)[0].state);
  await page.selectOption('#region', state);
  await page.click('.level:has-text("All species")');
  await page.click('button:has-text("Start quiz")');
  await page.waitForSelector('.option');
  const regionOk = await page.evaluate((st) => {
    const s = JSON.parse(localStorage.getItem('sarpa.v1.session'));
    const set = SQ.data.speciesInState(st);
    return s.questions.every((q) => set.has(q.species));
  }, state);
  check(regionOk, `every question is about a snake recorded in ${state}`);
  await page.click('#quit-btn');
  await page.click('.modal button:has-text("Discard quiz")');

  /* ---------- 6. reporting a photo ---------- */
  console.log('\n[6] Reporting a photo');
  await page.goto(`${base}#/play`);
  await page.waitForSelector('.level');
  await page.click('button:has-text("Start quiz")');
  await page.waitForSelector('.option');
  const reported = (await session(page)).questions[0].photo;
  await answer(page, 'right');
  await page.click('button:has-text("Report photo")');
  await page.click('.modal button:has-text("Report photo")');
  const flagged = await page.evaluate(() => JSON.parse(localStorage.getItem('sarpa.v1.progress')).flagged);
  check(flagged.includes(reported), 'the reported photo is remembered');
  const never = await page.evaluate((id) => {
    for (let i = 0; i < 40; i++) {
      const b = SQ.engine.build({ mode: 'quiz', count: 50, difficulty: 'mixed', region: 'all', preferUnseen: false });
      if (b.questions.some((q) => q.photo === id)) return false;
    }
    return true;
  }, reported);
  check(never, 'a reported photo is never shown again');
  await ctx.close();

  /* ---------- 7. daily challenge is the same for everyone ---------- */
  console.log('\n[7] Daily challenge');
  const firstPhotos = [];
  for (let i = 0; i < 2; i++) {
    const c = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    const p = await c.newPage();
    await p.goto(`${base}#/daily`, { waitUntil: 'load' });
    await p.click('button:has-text("Start the challenge")');
    await startGame(p);
    const s = await session(p);
    firstPhotos.push(s.questions.map((q) => q.photo + ':' + q.options.join(',')).join('|'));
    check(s.questions.length === 10, 'the daily challenge has 10 questions');
    for (let n = 1; n <= 10; n++) {
      await p.waitForFunction((k) => new RegExp(`Question ${k} of 10`).test(document.querySelector('.q-count').textContent), n);
      await answer(p, n <= 7 ? 'right' : 'wrong');
      await p.click('.next-btn');
    }
    await p.waitForSelector('.result-hero');
    await p.goto(`${base}#/daily`);
    await p.waitForSelector('.daily-card.is-done');
    check(await p.isVisible('.daily-card.is-done'), 'after playing, the daily page shows the finished state');
    const grid = await p.locator('.emoji-grid .cell').count();
    check(grid === 10, 'the result grid has 10 cells');
    await c.close();
  }
  check(firstPhotos[0] === firstPhotos[1], 'two different players get exactly the same daily questions');

  /* ---------- 8. phone layout ---------- */
  console.log('\n[8] Phone');
  ctx = await browser.newContext({ ...devices['iPhone 13'] });
  page = await ctx.newPage();
  await page.goto(`${base}#/play`, { waitUntil: 'load' });
  await page.waitForSelector('.level');
  await page.click('button:has-text("Start quiz")');
  await startGame(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal scrolling on a phone');
  const btnH = await page.locator('.option').first().evaluate((el) => el.getBoundingClientRect().height);
  check(btnH >= 44, `answer buttons are tap-friendly (${Math.round(btnH)}px tall)`);
  await answer(page, 'wrong');
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow2, 'no horizontal scrolling while reading an explanation');
  await page.evaluate(() => SQ.quiz.discard());
  await page.goto(`${base}#/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero');
  check(await page.isVisible('.tabbar') && !(await page.isVisible('.nav')), 'phones get the bottom key bar instead of the header row');
  await ctx.close();

  /* ---------- 9. shell, theme and progress bar ---------- */
  console.log('\n[9] Shell, theme and progress bar');
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  page = await ctx.newPage();
  await page.goto(`${base}#/`, { waitUntil: 'load' });
  await page.waitForSelector('.hero');
  check(await page.isVisible('.nav') && !(await page.isVisible('.tabbar')), 'wide screens show the key row in the header and no bottom bar');
  check((await page.locator('.nav a').count()) === 6, 'six main sections in the navigation');
  const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.click('#theme-btn');
  const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check(themeBefore !== themeAfter && themeAfter === 'dark', 'the theme switch turns on night mode');
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.hero');
  check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'the chosen theme is remembered after a reload');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg !== 'rgb(232, 231, 226)', `night mode really changes the page colour (${bg})`);
  await page.click('#theme-btn');
  await page.goto(`${base}#/play`, { waitUntil: 'load' });
  await page.waitForSelector('.level');
  await page.click('.seg-btn:has-text("20")');
  await page.click('button:has-text("Start quiz")');
  await startGame(page);
  check((await page.locator('.steps i').count()) === 20, 'the progress bar has one segment per question');
  check(await page.locator('.steps i.now').count() === 1, 'the current question is marked on the progress bar');
  // the height is measured by a ResizeObserver, which reports a frame or two after the quiz appears
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.quiz')).getPropertyValue('--bar-h')) === document.querySelector('.quiz-bar').offsetHeight, null, { timeout: 2000 }).catch(() => {});
  const barH = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.quiz')).getPropertyValue('--bar-h')));
  const realH = await page.evaluate(() => document.querySelector('.quiz-bar').offsetHeight);
  check(Math.abs(barH - realH) <= 1, `the sticky bar height is measured (${barH}px vs ${realH}px)`);
  await page.waitForTimeout(400);
  const realH2 = await page.evaluate(() => document.querySelector('.quiz-bar').offsetHeight);
  check(realH2 === realH, `the sticky bar keeps a steady height (${realH}px, then ${realH2}px)`);
  await answer(page, 'right');
  check(await page.locator('.steps i.ok').count() === 1, 'a right answer turns its segment green');
  await page.click('.next-btn');
  await page.waitForFunction(() => /Question 2 of 20/.test(document.querySelector('.q-count').textContent));
  await answer(page, 'wrong');
  check(await page.locator('.steps i.bad').count() === 1, 'a wrong answer turns its segment red');
  const photoBox = await page.locator('.viewport').boundingBox();
  check(photoBox.y + photoBox.height <= 900 + 1, `on a laptop screen the whole photo fits without scrolling (${Math.round(photoBox.height)}px tall)`);
  await ctx.close();

  /* ---------- 10. Herpdle practice ---------- */
  console.log('\n[10] Herpdle');
  ctx = await browser.newContext({ ...devices['Pixel 7'] });
  page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}#/herpdle?mode=practice`, { waitUntil: 'load' });
  await page.waitForSelector('.hd-intro');
  await page.waitForTimeout(700);
  if (await page.locator('.modal').count()) await page.keyboard.press('Escape');      // how to play, on the first visit
  await page.waitForSelector('.modal', { state: 'detached' }).catch(() => {});
  await page.click('button:has-text("Start a practice game")');
  await startGame(page, '#hd-input');
  const hd = await page.evaluate(() => {
    const st = SQ.herpdleState.load();
    const g = st.practice;
    return { sp: g.sp, wrong: SQ.data.species.find((s) => s.id !== g.sp && s.tier <= 2).name, right: SQ.data.byId[g.sp].name };
  });
  check(!!hd.sp, 'a practice game picks a mystery snake');
  check((await page.locator('.hd-clue:not(.locked)').count()) === 1, 'only the first clue is shown at the start');
  await page.fill('#hd-input', hd.wrong.slice(0, 5));
  await page.waitForSelector('.hd-list:not([hidden]) .hd-opt');
  check((await page.locator('.hd-list .hd-opt').count()) >= 1, 'typing suggests matching species');
  await page.fill('#hd-input', hd.wrong);
  await page.click('.hd-go');
  await page.waitForSelector('.hd-row .hd-tile');
  check((await page.locator('.hd-row').first().locator('.hd-tile').count()) === 6, 'a guess shows six comparison tiles');
  check((await page.locator('.hd-clue:not(.locked)').count()) === 2, 'a wrong guess reveals the next clue');
  await page.fill('#hd-input', hd.right);
  await page.click('.hd-go');
  await page.waitForSelector('.hd-result');
  check(/Solved in 2/i.test(await page.locator('.hd-result').innerText()), 'the right guess ends the game: solved in 2');
  const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!hOverflow, 'no horizontal scrolling in Herpdle on a phone');
  await ctx.close();

  check(errors.length === 0, `no uncaught JavaScript errors${errors.length ? ': ' + errors[0] : ''}`);
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
})();
