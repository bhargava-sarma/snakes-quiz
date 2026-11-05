/* Home, quiz set-up and daily-challenge screens. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const MINUTES = { 10: 3, 20: 6, 50: 15, 100: 30 };
  const LETTERS = ['A', 'B', 'C', 'D'];

  function resumeBanner() {
    const sess = SQ.quiz.current();
    if (!sess) return null;
    return h('div.banner.resume',
      h('div', h('p.legend', 'Quiz in progress'), h('strong', `${sess.answers.length} of ${sess.questions.length} answered`)),
      h('div.banner-actions',
        h('button.btn.btn-sm', { type: 'button', onclick: async () => {
          if (await SQ.ui.confirm({ title: 'Discard this quiz?', text: 'Your progress in it will be lost.', confirmLabel: 'Discard', danger: true })) { SQ.quiz.discard(); SQ.go(location.hash.replace(/^#/, '') || '/'); }
        } }, 'Discard'),
        h('a.btn.btn-sm.btn-primary', { href: '#/quiz' }, 'Continue', icon('arrow', { size: 16 }))));
  }

  /* ------------------------------------------------------------------ */
  /*  Home                                                                */
  /* ------------------------------------------------------------------ */

  /** The area the daily games and streaks on a page refer to: the last one chosen on the daily page, else the
   * player's quiz area (India for mixed games). */
  const homeArea = () => {
    const st = SQ.store.settings();
    if (st.dailyArea === 'in' || st.dailyArea === 'na') return st.dailyArea;
    return st.area === 'na' ? 'na' : 'in';
  };
  SQ.homeArea = homeArea;

  /** A non-interactive preview of the quiz screen: a real photo and four keys. */
  function demoScreen() {
    const D = SQ.data;
    const showy = D.photos.filter((p) => D.byId[p.sp].tier <= 3 && p.w / p.h > 1.2 && p.w / p.h < 1.7 && !p.hard);
    const photo = SQ.pick(showy.length ? showy : D.photos);
    const sp = D.byId[photo.sp];
    const others = D.lookalikes(sp.id, 10, photo.region).filter((s) => s.tier <= 3).slice(0, 3);
    const options = SQ.shuffle([sp, ...others]);
    return h('a.demo', { href: '#/play', 'aria-hidden': 'true', tabindex: '-1' },
      h('div.demo-top', h('span.legend', 'Sarpa SQ-1 · photo quiz'), h('span.demo-leds', SQ.ui.led('on'), SQ.ui.led(), SQ.ui.led())),
      h('div.viewport', SQ.ui.photo(photo, { eager: true, vf: true, alt: '', tag: 'Q07' })),
      h('div.demo-keys', { 'aria-hidden': 'true' }, options.map((o, i) => h('span.demo-key', h('span.opt-key', LETTERS[i]), h('span.demo-name', o.name)))));
  }

  /** Today's top three in both daily games of the player's area (only when this site has leaderboards). */
  function leadersCard() {
    const box = h('section.wrap.home-section.home-leaders', { hidden: true });
    const area = homeArea();
    const suffix = area === 'na' ? '-na' : '';
    SQ.api.status().then(async (state) => {
      if (state !== 'ok') return;
      try {
        const [a, b] = await Promise.all([SQ.api.leaderboard('sarpa-daily' + suffix, 'day'), SQ.api.leaderboard('herpdle' + suffix, 'day')]);
        const col = (title, lb, board) => h('a.leader-col', { href: '#/ranks?board=' + board },
          h('p.legend', title),
          lb.entries.length
            ? h('ol', lb.entries.slice(0, 3).map((e) => h('li', h('b.lcd-num', String(e.rank)), h('span.leader-name', e.name), h('small', `${e.points} pts`))))
            : h('p.muted', 'Nobody yet today. Be the first!'));
        box.append(
          h('div.section-head', h('h2', `Today’s leaders · ${SQ.data.area(area).label}`), h('a.legend', { href: '#/ranks' }, 'All leaderboards')),
          h('div.leaders', col('Sarpa daily', a, 'sarpa-daily' + suffix), col(`Herpdle #${SQ.herpdle.dayNumber(SQ.todayKey(), area)}`, b, 'herpdle' + suffix)));
        box.hidden = false;
      } catch (e) { /* the home page works without it */ }
    });
    return box;
  }

  SQ.views.home = function () {
    const D = SQ.data, S = SQ.store;
    const settings = S.settings();
    const prog = S.progress();
    const lvl = SQ.engine.DIFFICULTY[settings.difficulty] || SQ.engine.DIFFICULTY.beginner;
    const area = homeArea();
    const streak = S.dailyStreak(area);
    const stateCount = new Set(D.photos.map((p) => p.state).filter(Boolean)).size;
    const people = new Set(D.photos.map((p) => p.credit)).size;
    const playArea = SQ.engine.areaOf(settings);

    const snake = SQ.ui.pixelSnake({ cell: 6, gap: 2, rows: 8, length: 12 });

    const pads = [20, 50, 100].map((n) => h('button.pad', {
      type: 'button',
      onclick: () => SQ.quiz.start({ mode: 'quiz', count: n, difficulty: settings.difficulty, area: playArea, region: settings.region, timer: settings.timer, hints: settings.hints, preferUnseen: settings.preferUnseen }),
    }, SQ.ui.led(), h('span.pad-num', String(n)), h('span.pad-label', 'questions'), h('span.legend', `≈ ${MINUTES[n]} min`)));
    const hStats = SQ.herpdleState.dailyStats(SQ.herpdleState.load(area));
    pads.push(
      h('button.pad.pad-survival', { type: 'button', onclick: () => SQ.quiz.start({ mode: 'sudden', title: 'Survival', area: playArea }) },
        SQ.ui.led(), h('span.pad-num', icon('heart', { size: 34, stroke: 1.6 })), h('span.pad-label', 'Survival'), h('span.legend', 'one mistake ends it')),
      h('a.pad.pad-herpdle', { href: '#/herpdle' }, SQ.ui.led(hStats.streak ? 'on' : ''), h('span.pad-num', icon('grid', { size: 34, stroke: 1.6 })), h('span.pad-label', 'Herpdle'), h('span.legend', hStats.streak ? `${hStats.streak} day streak` : 'six clues, six goes')),
      h('a.pad.pad-daily', { href: '#/daily' }, SQ.ui.led(streak ? 'on' : ''), h('span.pad-num', icon('calendar', { size: 34, stroke: 1.6 })), h('span.pad-label', 'Daily'), h('span.legend', streak ? `${streak} day streak` : 'new every day')));

    const progress = prog.totals.games
      ? h('div.lcd.stats-strip',
        SQ.ui.readout('Quizzes played', prog.totals.games),
        SQ.ui.readout('Accuracy', SQ.pct(prog.totals.correct, prog.totals.answered) + '%'),
        SQ.ui.readout('Species spotted', `${Object.values(prog.species).filter((s) => s.c > 0).length}/${D.species.length}`),
        SQ.ui.readout('Best streak', prog.totals.bestStreak))
      : null;

    const mosaic = SQ.shuffle(D.species.filter((s) => s.tier <= 3)).slice(0, 8);
    const guideCard = h('a.guide-card', { href: '#/guide' },
      h('div.guide-mosaic', { 'aria-hidden': 'true' }, mosaic.map((s) => SQ.ui.thumb(s))),
      h('div.guide-copy', h('p.legend', h('b', '05'), 'Field guide'), h('h3', `Browse all ${D.species.length} species`), h('p', 'Identification tips, look-alikes, ranges and photo galleries for every snake in the quiz.'),
        h('span.more-link', 'Open the field guide', icon('arrow', { size: 16 }))));

    const features = [
      ['globe', 'India, North America or both', 'Play the snakes of one region, or mix both continents for 20% more points and look-alikes from across the world.'],
      ['compare', 'The reason behind every answer', 'See why the right snake is right, and why each of the other options is wrong, with side-by-side comparisons.'],
      ['layers', `${D.photos.length.toLocaleString()} real photos`, 'Community photographs from India, the USA and Canada. Every game is a fresh set, and photos you have seen are avoided.'],
      ['target', 'Four difficulty levels', 'Start with the famous snakes, then graduate to genuine look-alikes where even experts hesitate. Harder snakes are worth more points.'],
      ['grid', 'Herpdle', 'A daily clue game: name the mystery snake in six goes, with a new clue and a sharper photo after every miss.'],
      ['calendar', 'Daily puzzles in each region', 'A ten-photo challenge and a Herpdle every day for India and for North America, the same for everyone. Build streaks and share your score.'],
      ['trophy', 'Leaderboards', 'Daily, weekly and all-time rankings. All it takes is a username and a 6-digit PIN, and your progress follows you to any device.'],
      ['heart', 'Survival mode', 'How many snakes can you name in a row? It starts easy and ends in the look-alikes.'],
      ['book', 'Illustrated field guide', `${D.species.length} species with identification tips, ranges, look-alikes and photo galleries.`],
      ['compare', 'Compare any two snakes', 'Pick two species and see how they differ, side by side. Great for the look-alikes that fool everyone.'],
      ['eye', 'Flashcards', 'Study at your own pace: look at a photo, think, then reveal the answer and what to look for.'],
      ['shield', 'Snakebite first aid', 'Know what to do (and what not to do) in an emergency, in India and in North America, and which snakes cause most bites.'],
      ['pin', 'Learn your own state', 'Filter the quiz to the snakes recorded in your state or province.'],
      ['award', 'Progress and badges', 'Track what you have mastered, practise your weak spots and unlock achievements.'],
    ];

    const node = h('div.home',
      h('section.hero.wrap',
        h('div.hero-copy',
          h('p.legend', h('b', 'SQ-1'), 'Snakes of India and North America'),
          h('h1', 'How well do you know your snakes?'),
          h('p.hero-lead', `Spot the snake in ${D.photos.length.toLocaleString()} real photographs of ${D.species.length} species from India, the USA and Canada, then learn exactly why it is, and is not, each option.`),
          h('div.hero-cta',
            h('a.btn.btn-primary.btn-lg', { href: '#/play' }, icon('play', { size: 20 }), 'Start a quiz'),
            h('a.btn.btn-lg', { href: '#/herpdle' }, icon('grid', { size: 20 }), 'Play Herpdle', hStats.streak ? h('span.streak-chip', icon('flame', { size: 14 }), String(hStats.streak)) : null)),
          h('p.hero-note', icon('shield', { size: 15 }), ' Free to play. For learning only. Never handle wild snakes.')),
        demoScreen()),

      h('section.wrap.home-section',
        h('div.lcd.marquee',
          h('div.marquee-stats',
            SQ.ui.readout('Photos', D.photos.length.toLocaleString()),
            SQ.ui.readout('Species', D.species.length),
            SQ.ui.readout('States & provinces', stateCount),
            SQ.ui.readout('Photographers', people.toLocaleString())),
          snake.el)),

      h('section.wrap.home-section', resumeBanner(),
        h('div.section-head', h('h2', 'Quick start'), h('p.legend', `${D.area(playArea).label} · ${lvl.label} · ${settings.timer ? settings.timer + 's per question' : 'no timer'} · `, h('a', { href: '#/play' }, 'change settings'))),
        h('div.pads', pads)),

      leadersCard(),

      progress ? h('section.wrap.home-section', h('div.section-head', h('h2', 'Your progress'), h('a.legend', { href: '#/me' }, 'See details')), progress) : null,

      h('section.wrap.home-section.home-duo', SQ.snakeOfTheDay(homeArea()), guideCard),

      h('section.wrap.home-section',
        h('div.section-head', h('h2', 'What’s inside'), h('p.legend', 'Specifications')),
        h('div.spec-grid', features.map(([ico, title, text], i) => h('div.spec',
          h('div.spec-top', h('span.legend', String(i + 1).padStart(2, '0')), h('span.spec-ico', icon(ico, { size: 20 }))),
          h('h3', title), h('p', text))))),

      h('section.wrap.home-section',
        h('div.notice.danger', icon('warn', { size: 22 }),
          h('div', h('strong', 'Identifying a snake from a photo is not a safety tool. '),
            'Many harmless snakes look like dangerous ones and the reverse. If you find a snake at home, keep your distance and call a trained local snake rescuer or the wildlife authorities. If someone is bitten, call for an ambulance and go to a hospital immediately. ',
            h('a', { href: '#/safety' }, 'Read the first-aid guide')))));
    return { node, title: '', view: 'home', after: () => snake.start(), cleanup: () => snake.stop() };
  };

  /* ------------------------------------------------------------------ */
  /*  Set-up                                                              */
  /* ------------------------------------------------------------------ */

  SQ.views.setup = function ({ query }) {
    const D = SQ.data, S = SQ.store;
    const st = S.settings();
    const n = parseInt(query.get('n'), 10);
    const qa = query.get('area');
    const cfg = {
      count: [20, 50, 100].includes(n) ? n : st.count,
      difficulty: st.difficulty in SQ.engine.DIFFICULTY ? st.difficulty : 'beginner',
      area: ['in', 'na', 'mix'].includes(qa) ? qa : SQ.engine.areaOf(st),
      timer: st.timer, region: st.region, hints: st.hints, preferUnseen: st.preferUnseen, showSci: st.showSci,
    };

    const readout = h('div.setup-readout');
    const summary = h('p.setup-summary');
    const levelsBox = h('div.level-grid', { role: 'radiogroup', 'aria-label': 'Difficulty' });
    const stateBox = h('div.opt.state-opt');
    const regionsOf = (area) => (area === 'mix' ? [] : D.regions(12, area));
    const stateWord = (area) => (area === 'na' ? 'state or province' : 'state');

    function drawStates() {
      const regions = regionsOf(cfg.area);
      if (cfg.region !== 'all' && !regions.some((r) => r.state === cfg.region)) cfg.region = 'all';
      SQ.clear(stateBox);
      stateBox.hidden = !regions.length;
      if (!regions.length) return;
      const select = h('select#region', { onchange: (e) => { cfg.region = e.target.value; refresh(); } },
        h('option', { value: 'all' }, `All of ${D.area(cfg.area).label}`),
        regions.map((r) => h('option', { value: r.state, selected: r.state === cfg.region }, `${r.state} (${r.species} species)`)));
      stateBox.append(h('label', { for: 'region' }, h('strong', SQ.cap(stateWord(cfg.area))), h('small', `Only snakes recorded in one ${stateWord(cfg.area)}`)), select);
    }

    function refresh() {
      S.saveSettings(cfg);
      SQ.clear(levelsBox);
      Object.entries(SQ.engine.DIFFICULTY).forEach(([key, lv]) => {
        const size = SQ.engine.poolSize(key, cfg.region, cfg.area);
        const on = cfg.difficulty === key;
        levelsBox.appendChild(h('button.level' + (on ? '.on' : ''), {
          type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          onclick: () => { cfg.difficulty = key; refresh(); },
        }, h('span.level-top', h('span.level-name', lv.label), SQ.ui.led(on ? 'on' : '')), h('span.level-blurb', lv.blurb), h('span.level-size', `${size} species in play`)));
      });
      const lv = SQ.engine.DIFFICULTY[cfg.difficulty];
      const pool = SQ.engine.poolSize(cfg.difficulty, cfg.region, cfg.area);
      const where = cfg.region !== 'all' ? cfg.region : D.area(cfg.area).label;
      summary.textContent = `${cfg.count} questions · ${where} · ${lv.label} · ${cfg.timer ? cfg.timer + ' s per question' : 'no timer'}${cfg.area === 'mix' ? ' · ×1.2 points' : ''}`;
      SQ.clear(readout);
      readout.append(
        h('div.readout', h('span.legend', 'Questions'), h('b.lcd-num.big', String(cfg.count))),
        h('dl.readout-lines',
          h('div', h('dt', 'Region'), h('dd', where)),
          h('div', h('dt', 'Level'), h('dd', lv.label)),
          h('div', h('dt', 'Timer'), h('dd', cfg.timer ? cfg.timer + ' s' : 'Off')),
          h('div', h('dt', 'Species'), h('dd', String(pool))),
          h('div', h('dt', 'Time'), h('dd', `≈ ${MINUTES[cfg.count]} min`)),
          cfg.area === 'mix' ? h('div', h('dt', 'Bonus'), h('dd', '×1.2 points')) : null));
    }

    function start() {
      refresh();
      SQ.quiz.start({
        mode: 'quiz', count: cfg.count, difficulty: cfg.difficulty, area: cfg.area, region: cfg.region,
        timer: cfg.timer, hints: cfg.hints, preferUnseen: cfg.preferUnseen,
      });
    }

    const block = (num, title, ...body) => h('section.panel.setup-block', h('header', h('p.legend', h('b', num), title)), ...body);
    const count = (a) => D.byArea[a].length;

    const node = h('div.page.wrap.setup',
      SQ.ui.pageHead('Set up your quiz', 'Choose where, how long and how tough. Every quiz is built fresh from thousands of photos.', null, [h('b', '01'), 'Play']),
      resumeBanner(),
      h('div.setup-grid',
        h('div.setup-main',
          block('A', 'Where?',
            SQ.ui.segmented({
              name: 'Region', value: cfg.area, className: 'seg-big seg-area',
              options: [
                { value: 'in', label: 'India', sub: `${count('in')} species` },
                { value: 'na', label: 'North America', sub: `${count('na')} species` },
                { value: 'mix', label: 'Mixed', sub: '+20% points' },
              ],
              onChange: (v) => { cfg.area = v; drawStates(); refresh(); },
            }),
            h('p.muted.area-note', 'North America covers the USA and Canada. Mixed puts both together: half the snakes from each, with look-alikes from either continent, for 20% more points.')),
          block('B', 'How many questions?',
            SQ.ui.segmented({
              name: 'Number of questions', value: cfg.count, className: 'seg-big',
              options: [{ value: 20, label: '20', sub: '6 min' }, { value: 50, label: '50', sub: '15 min' }, { value: 100, label: '100', sub: '30 min' }],
              onChange: (v) => { cfg.count = v; refresh(); },
            })),
          block('C', 'How tough?', levelsBox, h('p.muted.area-note', 'Rarer, trickier snakes and harder photos are worth more points at every level.')),
          block('D', 'Options',
            h('div.opt-grid',
              h('div.opt', h('label', h('strong', 'Timer'), h('small', 'Faster answers earn bonus points')),
                SQ.ui.segmented({ name: 'Timer', value: cfg.timer, options: [{ value: 0, label: 'Off' }, { value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 45, label: '45s' }], onChange: (v) => { cfg.timer = v; refresh(); } })),
              stateBox,
              SQ.ui.toggle({ label: 'Hints', sub: 'Location, family and a 50/50 (cost points)', checked: cfg.hints, onChange: (v) => { cfg.hints = v; refresh(); } }),
              SQ.ui.toggle({ label: 'Show scientific names', sub: 'On the answer buttons', checked: cfg.showSci, onChange: (v) => { cfg.showSci = v; refresh(); } }),
              SQ.ui.toggle({ label: 'Prefer photos I have not seen', sub: 'Keeps every game different', checked: cfg.preferUnseen, onChange: (v) => { cfg.preferUnseen = v; refresh(); } }))),
          block('E', 'Other ways to play',
            h('div.alt-modes',
              h('button.alt-mode', { type: 'button', onclick: () => SQ.quiz.start({ mode: 'sudden', title: 'Survival', area: cfg.area }) },
                icon('heart', { size: 22 }), h('span', h('strong', 'Survival'), h('small', 'One mistake ends the run. It starts easy and ends in the look-alikes.'))),
              h('a.alt-mode', { href: '#/daily' },
                icon('calendar', { size: 22 }), h('span', h('strong', 'Daily challenge'), h('small', 'Ten photos, the same for everyone, new every day in each region.'))),
              h('a.alt-mode', { href: '#/herpdle' },
                icon('grid', { size: 22 }), h('span', h('strong', 'Herpdle'), h('small', 'Name a mystery snake from clues in six goes.')))))),
        h('aside.setup-side',
          h('div.lcd.setup-lcd', h('p.legend', 'Readout'), readout),
          h('div.start-bar', summary, h('button.btn.btn-primary.btn-lg.start-btn', { type: 'button', onclick: start }, icon('play', { size: 20 }), 'Start quiz')))));
    drawStates();
    refresh();
    return { node, title: 'Set up a quiz', view: 'setup' };
  };

  /* ------------------------------------------------------------------ */
  /*  Daily: today's Sarpa challenge and today's Herpdle                  */
  /* ------------------------------------------------------------------ */

  SQ.dailyShareText = function (key, res, area) {
    const rows = [];
    for (let i = 0; i < res.grid.length; i += 10) rows.push(res.grid.slice(i, i + 10).replace(/G/g, '🟩').replace(/R/g, '🟥'));
    return `Sarpa daily snake quiz · ${SQ.data.area(area).label} · ${key}\n${res.correct}/${res.n} correct\n${rows.join('\n')}`;
  };

  /** The last two weeks as a row of LEDs for one game: lit = played that day. */
  function dayLeds(label, played) {
    const today = SQ.todayKey();
    const row = h('div.day-leds', { role: 'img', 'aria-label': `${label}: days played in the last two weeks` });
    for (let i = 13; i >= 0; i--) {
      const d = SQ.time.shiftDay(today, -i);
      const r = played(d);
      row.appendChild(h('span.day', { title: SQ.time.label(d) + (r ? `: ${r}` : '') },
        SQ.ui.led(r ? 'on' : ''), h('small', SQ.time.label(d, { weekday: 'narrow' }))));
    }
    return h('div.day-row', h('span.legend', label), row);
  }

  function clockText(ms) {
    const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  SQ.views.daily = function ({ query }) {
    const S = SQ.store, D = SQ.data;
    const qa = query.get('area');
    const area = qa === 'in' || qa === 'na' ? qa : homeArea();
    if (qa === 'in' || qa === 'na') S.saveSettings({ dailyArea: qa });
    const where = D.area(area).label;
    const suffix = area === 'na' ? '-na' : '';
    const key = SQ.todayKey();
    const done = S.dailyResult(key, area);
    const sess = SQ.quiz.current();
    const inProgress = sess && sess.mode === 'daily' && sess.config.dateKey === key && (sess.config.area || 'in') === area ? sess : null;
    const hs = SQ.herpdleState.load(area);
    const hg = hs.days[key];
    const hDone = hg && hg.done && SQ.herpdleState.usable(hg) ? hg : null;
    const hBusy = hg && !hg.done && !hg.remote && SQ.herpdleState.usable(hg) ? hg : null;
    const hStats = SQ.herpdleState.dailyStats(hs);
    const number = SQ.herpdle.dayNumber(key, area);
    const dateLabel = SQ.time.label(key, { weekday: 'long', day: 'numeric', month: 'long' });
    const herpdleHref = '#/herpdle?area=' + area;

    const clock = h('b.lcd-num', clockText(SQ.time.msToNextDay()));
    const timer = setInterval(() => {
      const ms = SQ.time.msToNextDay();
      clock.textContent = clockText(ms);
      if (ms < 1500) setTimeout(() => SQ.go('/daily?area=' + area), 1600);     // a new day: show the new puzzles
    }, 1000);

    const startSarpa = (btn) => async () => {
      btn.disabled = true;
      await SQ.quiz.start({ mode: 'daily', count: 10, difficulty: 'intermediate', area, region: 'all', timer: 0, hints: true, preferUnseen: false, dateKey: key, title: 'Daily challenge' });
      btn.disabled = false;
    };

    // ----- Sarpa daily -----
    let sarpaBody;
    const sarpaBoard = h('a.btn', { href: '#/ranks?board=sarpa-daily' + suffix }, icon('trophy', { size: 18 }), 'Leaderboard');
    if (done) {
      const grid = h('div.emoji-grid', { role: 'img', 'aria-label': `${done.correct} of ${done.n} correct` });
      for (let i = 0; i < done.grid.length; i += 10) grid.appendChild(h('div', done.grid.slice(i, i + 10).split('').map((c) => h('span.cell.' + (c === 'G' ? 'ok' : 'bad'), c === 'G' ? '✓' : '✗'))));
      sarpaBody = [
        h('div.daily-score', h('b', `${done.correct}/${done.n}`), h('span', `${done.points} points`)),
        grid,
        h('div.btn-row',
          h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.ui.shareText(SQ.dailyShareText(key, done, area), location.origin + location.pathname + '#/daily?area=' + area) }, icon('share', { size: 18 }), 'Share'),
          sarpaBoard)];
    } else if (inProgress) {
      sarpaBody = [h('p', `You are part-way through: ${inProgress.answers.length} of ${inProgress.questions.length} answered.`),
        h('div.btn-row', h('a.btn.btn-primary.btn-lg', { href: '#/quiz' }, icon('play', { size: 20 }), 'Continue'))];
    } else {
      const btn = h('button.btn.btn-primary.btn-lg', { type: 'button' }, icon('play', { size: 20 }), 'Start the challenge');
      btn.onclick = startSarpa(btn);
      sarpaBody = [h('p', `Ten photos of ${D.area(area).adj} snakes at an in-between level, the same for everyone. Hints are allowed and every answer is explained.`),
        h('div.btn-row', btn, sarpaBoard)];
    }
    const sarpaCard = h('section.card.daily-card' + (done ? '.is-done' : ''),
      h('div.daily-card-top', h('p.legend', h('b', '01'), `Sarpa daily · ${where}`), SQ.ui.led(done ? 'ok on' : inProgress ? 'on blink' : 'on')),
      h('h2', done ? 'Done for today' : 'Ten photos, one go'),
      ...sarpaBody);

    // ----- Herpdle -----
    let herpBody;
    const herpBoard = h('a.btn', { href: '#/ranks?board=herpdle' + suffix }, icon('trophy', { size: 18 }), 'Leaderboard');
    if (hDone) {
      herpBody = [
        h('div.daily-score', h('b', hDone.won ? `${hDone.g.length}/6` : 'X/6'), h('span', hDone.won ? `${hDone.points || SQ.herpdle.points(hDone.g.length, true)} points` : 'not solved')),
        h('p.muted', `It was the ${D.byId[hDone.sp].name}.`),
        h('div.btn-row',
          h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.ui.shareText(SQ.herpdleState.shareText(hDone, area), location.origin + location.pathname + herpdleHref) }, icon('share', { size: 18 }), 'Share'),
          h('a.btn', { href: herpdleHref }, 'See the board'),
          herpBoard)];
    } else if (hBusy) {
      herpBody = [h('p', `You have used ${hBusy.g.length} of 6 goes.`), h('div.btn-row', h('a.btn.btn-primary.btn-lg', { href: herpdleHref }, icon('play', { size: 20 }), 'Continue'))];
    } else if (hg && hg.remote) {
      herpBody = [h('p', 'You played today’s Herpdle on another device.'), h('div.btn-row', herpBoard)];
    } else {
      herpBody = [h('p', `A mystery ${D.area(area).adj} snake, six clues and six goes. Each guess shows how close you are.`),
        h('div.btn-row', h('a.btn.btn-primary.btn-lg', { href: herpdleHref }, icon('play', { size: 20 }), 'Play Herpdle'), herpBoard)];
    }
    const herpCard = h('section.card.daily-card' + (hDone ? '.is-done' : ''),
      h('div.daily-card-top', h('p.legend', h('b', '02'), `Herpdle #${number} · ${where}`), SQ.ui.led(hDone ? 'ok on' : hBusy ? 'on blink' : 'on')),
      h('h2', hDone ? (hDone.won ? 'Solved' : 'Better luck tomorrow') : 'Name the mystery snake'),
      ...herpBody);

    const daily = area === 'na' ? S.progress().dailyNa : S.progress().daily;
    const strip = h('section.lcd.daily-lcd',
      h('div.daily-reads',
        h('div.readout', h('span.legend', 'Next puzzles in'), clock),
        SQ.ui.readout('Sarpa streak', S.dailyStreak(area)),
        SQ.ui.readout('Herpdle streak', hStats.streak),
        SQ.ui.readout('Best', Math.max(daily.best, hStats.best))),
      dayLeds('Sarpa', (d) => { const r = S.dailyResult(d, area); return r ? `${r.correct}/${r.n}` : ''; }),
      dayLeds('Herpdle', (d) => { const g = hs.days[d]; return g && g.done ? (g.won ? `${g.g.length}/6` : 'X/6') : ''; }));

    const tabs = SQ.ui.segmented({
      name: 'Region', value: area, className: 'seg-area',
      options: [{ value: 'in', label: 'India' }, { value: 'na', label: 'North America' }],
      onChange: (v) => SQ.go('/daily?area=' + v),
    });
    const head = SQ.ui.pageHead('Daily', `${dateLabel}. Two puzzles in each region, the same for everyone, new every day at ${SQ.time.resetText()}.`, h('div.head-tools', tabs), [h('b', '03'), 'Daily']);
    const node = h('div.page.wrap.daily', head, h('div.daily-grid', sarpaCard, herpCard), strip);

    // signed in: show games played on another device
    if (SQ.api.session() && (!done || !hDone)) {
      SQ.api.me().then((me) => {
        if (!me.today || me.today.day !== key) return;
        const sarpaState = area === 'na' ? me.today.sarpaNa : me.today.sarpa;
        const herpState = area === 'na' ? me.today.herpdleNa : me.today.herpdle;
        if (!done && !inProgress && sarpaState === 'done') {
          const p = sarpaCard.querySelector('p:not(.legend)');
          if (p) p.textContent = 'You have played today’s challenge on another device.';
          const b = sarpaCard.querySelector('button.btn-primary');
          if (b) b.remove();
        }
        if (!hDone && !hBusy && herpState === 'done') {
          const p = herpCard.querySelector('p:not(.legend)');
          if (p) p.textContent = 'You have played today’s Herpdle on another device.';
          const b = herpCard.querySelector('a.btn-primary');
          if (b) b.remove();
        }
      }).catch(() => {});
    }
    return { node, title: 'Daily', view: 'daily', cleanup: () => clearInterval(timer) };
  };
})();
