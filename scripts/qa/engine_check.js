#!/usr/bin/env node
/* Property checks for the quiz engine, run in a real browser.
 *   npm i -D playwright  (or use a global install)   then   node scripts/qa/engine_check.js [baseUrl]
 * Starts nothing itself: serve the repo first, e.g.  python3 -m http.server 8765
 */
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:8765/index.html';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.SQ && SQ.data && SQ.data.ready);

  const report = await page.evaluate(() => {
    const D = SQ.data, E = SQ.engine;
    const problems = [];
    const stats = { quizzes: 0, questions: 0, minPool: 1e9 };
    const configs = [];
    for (const difficulty of ['beginner', 'intermediate', 'expert', 'mixed'])
      for (const count of [20, 50, 100]) configs.push({ difficulty, count, region: 'all' });
    for (const r of D.regions(12).slice(0, 4)) configs.push({ difficulty: 'mixed', count: 20, region: r.state });

    for (const cfg of configs) {
      for (let rep = 0; rep < 6; rep++) {
        const built = E.build(Object.assign({ mode: 'quiz', preferUnseen: false, personalise: false }, cfg));
        stats.quizzes++;
        const qs = built.questions;
        if (qs.length !== cfg.count) problems.push(`${JSON.stringify(cfg)}: got ${qs.length} questions`);
        const photos = new Set();
        const perSpecies = {};
        for (const q of qs) {
          stats.questions++;
          const where = `${cfg.difficulty}/${cfg.count}/${cfg.region} Q${q.n}`;
          if (q.options.length !== 4) problems.push(`${where}: ${q.options.length} options`);
          if (new Set(q.options).size !== q.options.length) problems.push(`${where}: duplicate options`);
          if (q.options[q.answer] !== q.species) problems.push(`${where}: answer index does not point at the species`);
          const names = q.options.map((id) => D.byId[id].name);
          if (new Set(names).size !== names.length) problems.push(`${where}: two options share a name`);
          const ph = D.photoById[q.photo];
          if (!ph || ph.sp !== q.species) problems.push(`${where}: photo does not belong to the species`);
          if (photos.has(q.photo)) problems.push(`${where}: photo repeated in one quiz`);
          photos.add(q.photo);
          for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
            if (D.isCryptic(q.options[i], q.options[j])) problems.push(`${where}: indistinguishable pair ${q.options[i]} / ${q.options[j]}`);
          perSpecies[q.species] = (perSpecies[q.species] || 0) + 1;
          const sp = D.byId[q.species];
          if (cfg.difficulty === 'beginner' && sp.tier > 3) problems.push(`${where}: tier ${sp.tier} species in a beginner quiz`);
          if (cfg.difficulty === 'beginner' && q.options.some((id) => D.byId[id].tier > 3)) problems.push(`${where}: obscure option in a beginner quiz`);
          if (cfg.region !== 'all' && !D.speciesInState(cfg.region).has(q.species)) problems.push(`${where}: species not recorded in ${cfg.region}`);
        }
        const poolSize = E.poolSize(cfg.difficulty, cfg.region);
        stats.minPool = Math.min(stats.minPool, poolSize);
        const limit = Math.ceil(cfg.count / Math.max(poolSize, 1)) + 1;
        const worst = Math.max(...Object.values(perSpecies));
        if (cfg.count <= poolSize && worst > 2) problems.push(`${JSON.stringify(cfg)}: a species appears ${worst} times`);
        if (worst > limit) problems.push(`${JSON.stringify(cfg)}: a species appears ${worst} times (limit ${limit})`);
      }
    }

    // determinism of the daily challenge
    const key = 'sarpa-daily-test';
    const mk = () => E.build({ mode: 'daily', count: 10, difficulty: 'intermediate', region: 'all', preferUnseen: false, personalise: false, seed: SQ.hashSeed(key) });
    if (JSON.stringify(mk()) !== JSON.stringify(mk())) problems.push('daily challenge is not deterministic');

    // variety between games
    const a = new Set(E.build({ mode: 'quiz', count: 50, difficulty: 'mixed', region: 'all', preferUnseen: false }).questions.map((q) => q.photo));
    const b = new Set(E.build({ mode: 'quiz', count: 50, difficulty: 'mixed', region: 'all', preferUnseen: false }).questions.map((q) => q.photo));
    const overlap = [...a].filter((x) => b.has(x)).length;

    // every species has the data the explanations need
    for (const sp of D.species) {
      if (!sp.ids || sp.ids.length < 2) problems.push(`${sp.id}: fewer than 2 identification points`);
      if (D.photosOf(sp.id).length < 6) problems.push(`${sp.id}: fewer than 6 photos`);
      for (const o of D.lookalikes(sp.id, 3)) {
        const w = SQ.explain.whyNot(sp, o);
        if (!w.lead || /undefined|NaN/.test(w.lead + JSON.stringify(w.diffs))) problems.push(`${sp.id} vs ${o.id}: bad explanation text`);
      }
    }
    return { problems, stats, overlap50: overlap, species: D.species.length, photos: D.photos.length };
  });

  console.log(JSON.stringify({ species: report.species, photos: report.photos, stats: report.stats, overlapBetweenTwo50QuestionGames: report.overlap50 }));
  if (errors.length) console.log('page errors:', errors);
  if (report.problems.length) {
    console.log(`\n${report.problems.length} problem(s):`);
    [...new Set(report.problems)].slice(0, 60).forEach((p) => console.log(' -', p));
    process.exitCode = 1;
  } else {
    console.log('engine checks passed');
  }
  await browser.close();
})();
