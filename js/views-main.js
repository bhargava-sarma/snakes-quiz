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

  /** A non-interactive preview of the quiz screen: a real photo and four keys. */
  function demoScreen() {
    const D = SQ.data;
    const showy = D.photos.filter((p) => D.byId[p.sp].tier <= 3 && p.w / p.h > 1.2 && p.w / p.h < 1.7 && !p.hard);
    const photo = SQ.pick(showy.length ? showy : D.photos);
    const sp = D.byId[photo.sp];
    const others = D.lookalikes(sp.id, 10).filter((s) => s.tier <= 3).slice(0, 3);
    const options = SQ.shuffle([sp, ...others]);
    return h('a.demo', { href: '#/play', 'aria-hidden': 'true', tabindex: '-1' },
      h('div.demo-top', h('span.legend', 'Sarpa SQ-1 · photo quiz'), h('span.demo-leds', SQ.ui.led('on'), SQ.ui.led(), SQ.ui.led())),
      h('div.viewport', SQ.ui.photo(photo, { eager: true, vf: true, alt: '', tag: 'Q07' })),
      h('div.demo-keys', { 'aria-hidden': 'true' }, options.map((o, i) => h('span.demo-key', h('span.opt-key', LETTERS[i]), h('span.demo-name', o.name)))));
  }

  SQ.views.home = function () {
    const D = SQ.data, S = SQ.store;
    const settings = S.settings();
    const prog = S.progress();
    const lvl = SQ.engine.DIFFICULTY[settings.difficulty] || SQ.engine.DIFFICULTY.beginner;
    const streak = S.dailyStreak();
    const stateCount = new Set(D.photos.map((p) => p.state).filter(Boolean)).size;
    const people = new Set(D.photos.map((p) => p.credit)).size;

    const snake = SQ.ui.pixelSnake({ cell: 6, gap: 2, rows: 8, length: 12 });

    const pads = [20, 50, 100].map((n) => h('button.pad', {
      type: 'button',
      onclick: () => SQ.quiz.start({ mode: 'quiz', count: n, difficulty: settings.difficulty, region: settings.region, timer: settings.timer, hints: settings.hints, preferUnseen: settings.preferUnseen }),
    }, SQ.ui.led(), h('span.pad-num', String(n)), h('span.pad-label', 'questions'), h('span.legend', `≈ ${MINUTES[n]} min`)));
    pads.push(h('a.pad.pad-daily', { href: '#/daily' }, SQ.ui.led(streak ? 'on' : ''), h('span.pad-num', icon('calendar', { size: 34, stroke: 1.6 })), h('span.pad-label', 'Daily challenge'), h('span.legend', streak ? `${streak} day streak` : 'new every day')));

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
      h('div.guide-copy', h('p.legend', h('b', '03'), 'Field guide'), h('h3', `Browse all ${D.species.length} species`), h('p', 'Identification tips, look-alikes, ranges and photo galleries for every snake in the quiz.'),
        h('span.more-link', 'Open the field guide', icon('arrow', { size: 16 }))));

    const features = [
      ['compare', 'The reason behind every answer', 'See why the right snake is right, and why each of the other options is wrong, with side-by-side comparisons.'],
      ['layers', `${D.photos.length.toLocaleString()} real photos`, 'Community photographs from across India. Every game is a fresh set, and photos you have seen are avoided.'],
      ['target', 'Four difficulty levels', 'Start with the famous snakes, then graduate to genuine look-alikes where even experts hesitate.'],
      ['calendar', 'Daily challenge', 'Ten new questions every day, the same for everyone. Build a streak and share your score.'],
      ['book', 'Illustrated field guide', `${D.species.length} species with identification tips, ranges, look-alikes and photo galleries.`],
      ['compare', 'Compare any two snakes', 'Pick two species and see how they differ, side by side. Great for the look-alikes that fool everyone.'],
      ['eye', 'Flashcards', 'Study at your own pace: look at a photo, think, then reveal the answer and what to look for.'],
      ['shield', 'Snakebite first aid', 'Know what to do (and what not to do) in an emergency, and which four snakes cause most bites.'],
      ['pin', 'Learn your own state', 'Filter the quiz to the snakes recorded in your state or region.'],
      ['award', 'Progress and badges', 'Track what you have mastered, practise your weak spots and unlock achievements.'],
    ];

    const node = h('div.home',
      h('section.hero.wrap',
        h('div.hero-copy',
          h('p.legend', h('b', 'SQ-1'), 'Snakes of the Indian subcontinent'),
          h('h1', 'How well do you know India’s snakes?'),
          h('p.hero-lead', `Spot the snake in ${D.photos.length.toLocaleString()} real photographs of ${D.species.length} species, then learn exactly why it is, and is not, each option.`),
          h('div.hero-cta',
            h('a.btn.btn-primary.btn-lg', { href: '#/play' }, icon('play', { size: 20 }), 'Start a quiz'),
            h('a.btn.btn-lg', { href: '#/daily' }, icon('calendar', { size: 20 }), 'Daily challenge', streak ? h('span.streak-chip', icon('flame', { size: 14 }), String(streak)) : null)),
          h('p.hero-note', icon('shield', { size: 15 }), ' Free, no sign-up. For learning only. Never handle wild snakes.')),
        demoScreen()),

      h('section.wrap.home-section',
        h('div.lcd.marquee',
          h('div.marquee-stats',
            SQ.ui.readout('Photos', D.photos.length.toLocaleString()),
            SQ.ui.readout('Species', D.species.length),
            SQ.ui.readout('States', stateCount),
            SQ.ui.readout('Photographers', people.toLocaleString())),
          snake.el)),

      h('section.wrap.home-section', resumeBanner(),
        h('div.section-head', h('h2', 'Quick start'), h('p.legend', `${lvl.label} · ${settings.timer ? settings.timer + 's per question' : 'no timer'} · `, h('a', { href: '#/play' }, 'change settings'))),
        h('div.pads', pads)),

      progress ? h('section.wrap.home-section', h('div.section-head', h('h2', 'Your progress'), h('a.legend', { href: '#/stats' }, 'See details')), progress) : null,

      h('section.wrap.home-section.home-duo', SQ.snakeOfTheDay(), guideCard),

      h('section.wrap.home-section',
        h('div.section-head', h('h2', 'What’s inside'), h('p.legend', 'Specifications')),
        h('div.spec-grid', features.map(([ico, title, text], i) => h('div.spec',
          h('div.spec-top', h('span.legend', String(i + 1).padStart(2, '0')), h('span.spec-ico', icon(ico, { size: 20 }))),
          h('h3', title), h('p', text))))),

      h('section.wrap.home-section',
        h('div.notice.danger', icon('warn', { size: 22 }),
          h('div', h('strong', 'Identifying a snake from a photo is not a safety tool. '),
            'Many harmless snakes look like dangerous ones and the reverse. If you find a snake at home, keep your distance and call a trained local snake rescuer or the forest department. If someone is bitten, go to a hospital immediately. ',
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
    const cfg = {
      count: [20, 50, 100].includes(n) ? n : st.count,
      difficulty: st.difficulty in SQ.engine.DIFFICULTY ? st.difficulty : 'beginner',
      timer: st.timer, region: st.region, hints: st.hints, preferUnseen: st.preferUnseen, showSci: st.showSci,
    };

    const readout = h('div.setup-readout');
    const summary = h('p.setup-summary');
    const levelsBox = h('div.level-grid', { role: 'radiogroup', 'aria-label': 'Difficulty' });
    const regions = D.regions(12);
    if (cfg.region !== 'all' && !regions.some((r) => r.state === cfg.region)) cfg.region = 'all';

    function refresh() {
      S.saveSettings(cfg);
      SQ.clear(levelsBox);
      Object.entries(SQ.engine.DIFFICULTY).forEach(([key, lv]) => {
        const size = SQ.engine.poolSize(key, cfg.region);
        const on = cfg.difficulty === key;
        levelsBox.appendChild(h('button.level' + (on ? '.on' : ''), {
          type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          onclick: () => { cfg.difficulty = key; refresh(); },
        }, h('span.level-top', h('span.level-name', lv.label), SQ.ui.led(on ? 'on' : '')), h('span.level-blurb', lv.blurb), h('span.level-size', `${size} species in play`)));
      });
      const lv = SQ.engine.DIFFICULTY[cfg.difficulty];
      const pool = SQ.engine.poolSize(cfg.difficulty, cfg.region);
      summary.textContent = `${cfg.count} questions · ${lv.label} · ${cfg.timer ? cfg.timer + ' s per question' : 'no timer'}${cfg.region !== 'all' ? ' · ' + cfg.region : ''}`;
      SQ.clear(readout);
      readout.append(
        h('div.readout', h('span.legend', 'Questions'), h('b.lcd-num.big', String(cfg.count))),
        h('dl.readout-lines',
          h('div', h('dt', 'Level'), h('dd', lv.label)),
          h('div', h('dt', 'Timer'), h('dd', cfg.timer ? cfg.timer + ' s' : 'Off')),
          h('div', h('dt', 'Region'), h('dd', cfg.region === 'all' ? 'All of India' : cfg.region)),
          h('div', h('dt', 'Species'), h('dd', String(pool))),
          h('div', h('dt', 'Time'), h('dd', `≈ ${MINUTES[cfg.count]} min`))));
    }

    const regionSelect = h('select#region', { onchange: (e) => { cfg.region = e.target.value; refresh(); } },
      h('option', { value: 'all' }, 'All of India'),
      regions.map((r) => h('option', { value: r.state, selected: r.state === cfg.region }, `${r.state} (${r.species} species)`)));

    function start() {
      refresh();
      SQ.quiz.start({
        mode: 'quiz', count: cfg.count, difficulty: cfg.difficulty, region: cfg.region,
        timer: cfg.timer, hints: cfg.hints, preferUnseen: cfg.preferUnseen,
      });
    }

    const block = (num, title, ...body) => h('section.panel.setup-block', h('header', h('p.legend', h('b', num), title)), ...body);

    const node = h('div.page.wrap.setup',
      SQ.ui.pageHead('Set up your quiz', 'Choose how long and how tough. Every quiz is built fresh from thousands of photos.', null, [h('b', '01'), 'Play']),
      resumeBanner(),
      h('div.setup-grid',
        h('div.setup-main',
          block('A', 'How many questions?',
            SQ.ui.segmented({
              name: 'Number of questions', value: cfg.count, className: 'seg-big',
              options: [{ value: 20, label: '20', sub: '6 min' }, { value: 50, label: '50', sub: '15 min' }, { value: 100, label: '100', sub: '30 min' }],
              onChange: (v) => { cfg.count = v; refresh(); },
            })),
          block('B', 'How tough?', levelsBox),
          block('C', 'Options',
            h('div.opt-grid',
              h('div.opt', h('label', h('strong', 'Timer'), h('small', 'Faster answers earn bonus points')),
                SQ.ui.segmented({ name: 'Timer', value: cfg.timer, options: [{ value: 0, label: 'Off' }, { value: 15, label: '15s' }, { value: 30, label: '30s' }, { value: 45, label: '45s' }], onChange: (v) => { cfg.timer = v; refresh(); } })),
              regions.length ? h('div.opt', h('label', { for: 'region' }, h('strong', 'Region'), h('small', 'Only snakes recorded in a state')), regionSelect) : null,
              SQ.ui.toggle({ label: 'Hints', sub: 'Location, family and a 50/50 (cost points)', checked: cfg.hints, onChange: (v) => { cfg.hints = v; refresh(); } }),
              SQ.ui.toggle({ label: 'Show scientific names', sub: 'On the answer buttons', checked: cfg.showSci, onChange: (v) => { cfg.showSci = v; refresh(); } }),
              SQ.ui.toggle({ label: 'Prefer photos I have not seen', sub: 'Keeps every game different', checked: cfg.preferUnseen, onChange: (v) => { cfg.preferUnseen = v; refresh(); } })))),
        h('aside.setup-side',
          h('div.lcd.setup-lcd', h('p.legend', 'Readout'), readout),
          h('div.start-bar', summary, h('button.btn.btn-primary.btn-lg.start-btn', { type: 'button', onclick: start }, icon('play', { size: 20 }), 'Start quiz')))));
    refresh();
    return { node, title: 'Set up a quiz', view: 'setup' };
  };

  /* ------------------------------------------------------------------ */
  /*  Daily challenge                                                     */
  /* ------------------------------------------------------------------ */

  function msToNextDay() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return next - now;
  }

  SQ.dailyShareText = function (key, res) {
    const rows = [];
    for (let i = 0; i < res.grid.length; i += 10) rows.push(res.grid.slice(i, i + 10).replace(/G/g, '🟩').replace(/R/g, '🟥'));
    return `Sarpa daily snake quiz ${key}\n${res.correct}/${res.n} correct\n${rows.join('\n')}`;
  };

  /** The last two weeks as a row of LEDs: lit = played that day. */
  function weekLeds() {
    const S = SQ.store;
    const row = h('div.day-leds', { role: 'img', 'aria-label': 'Days you played the daily challenge in the last two weeks' });
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const r = S.dailyResult(SQ.todayKey(d));
      row.appendChild(h('span.day', { title: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (r ? `: ${r.correct}/${r.n}` : '') },
        SQ.ui.led(r ? 'on' : ''), h('small', d.toLocaleDateString(undefined, { weekday: 'narrow' }))));
    }
    return row;
  }

  SQ.views.daily = function () {
    const S = SQ.store, D = SQ.data;
    const key = SQ.todayKey();
    const done = S.dailyResult(key);
    const streak = S.dailyStreak();
    const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    const head = SQ.ui.pageHead('Daily challenge', `${dateLabel}. Ten questions, the same for everyone, once a day.`, null, [h('b', '02'), 'Daily']);
    const streakCard = h('section.lcd.daily-lcd',
      h('div.daily-reads',
        SQ.ui.readout('Day streak', streak),
        SQ.ui.readout('Best streak', S.progress().daily.best)),
      weekLeds());

    let body;
    if (done) {
      const clock = h('b', '');
      const tick = () => {
        const ms = msToNextDay();
        const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000);
        clock.textContent = `${hh}h ${String(mm).padStart(2, '0')}m`;
      };
      tick();
      const timer = setInterval(tick, 30000);
      const grid = h('div.emoji-grid');
      for (let i = 0; i < done.grid.length; i += 10) grid.appendChild(h('div', done.grid.slice(i, i + 10).split('').map((c) => h('span.cell.' + (c === 'G' ? 'ok' : 'bad'), c === 'G' ? '✓' : '✗'))));
      body = h('section.card.daily-done',
        h('p.legend', 'Today’s result'),
        h('div.daily-score', h('b', `${done.correct}/${done.n}`), h('span', `${done.points} points`)),
        grid,
        h('p.muted', 'Next challenge in ', clock),
        h('div.btn-row',
          h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.ui.shareText(SQ.dailyShareText(key, done), location.origin + location.pathname) }, icon('share', { size: 18 }), 'Share result'),
          h('a.btn', { href: '#/play' }, 'Play a regular quiz')));
      body.prepend(h('h2', 'You have finished today’s challenge'));
      return { node: h('div.page.wrap.daily', head, h('div.daily-grid', body, streakCard)), title: 'Daily challenge', view: 'daily', cleanup: () => clearInterval(timer) };
    }

    body = h('section.card.daily-start',
      h('p.legend', 'Today’s ten'),
      h('h2', 'Ready when you are'),
      h('p', 'A balanced mix of species at an in-between difficulty. Hints are allowed, and every answer is explained. Come back tomorrow for a new set.'),
      h('button.btn.btn-primary.btn-lg', {
        type: 'button',
        onclick: () => SQ.quiz.start({
          mode: 'daily', count: 10, difficulty: 'intermediate', region: 'all', timer: 0, hints: true, preferUnseen: false,
          seed: SQ.hashSeed(`sarpa-daily-${key}-${D.meta.version || 1}`), dateKey: key, title: 'Daily challenge',
        }),
      }, icon('play', { size: 20 }), 'Start today’s challenge'));
    return { node: h('div.page.wrap.daily', head, resumeBanner(), h('div.daily-grid', body, streakCard)), title: 'Daily challenge', view: 'daily' };
  };
})();
