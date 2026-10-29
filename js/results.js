/* The results screen shown after a quiz. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  /** Open one answered question's photo + full explanation in a dialog. */
  SQ.reviewItem = function (item) {
    const D = SQ.data;
    const photo = D.photoById[item.photo];          // can be missing when a newer data set dropped the photo
    const correctSp = D.byId[item.species];
    const options = item.options.map((id) => D.byId[id]);
    if (!correctSp || options.some((o) => !o)) return;
    const chosenSp = item.chosen >= 0 ? D.byId[item.options[item.chosen]] : null;
    SQ.ui.modal({
      title: `Question ${item.n}`, wide: true, className: 'review',
      body: [
        photo ? SQ.ui.photo(photo, { zoom: true, eager: true }) : null,
        photo ? SQ.ui.creditLine(photo) : h('p.muted', 'This photo has since been taken out of the game.'),
        SQ.ui.explanation({ correct: correctSp, chosen: chosenSp, options, timedOut: item.chosen < 0, isCorrect: item.correct, points: item.points, streak: 0 }),
      ],
    });
  };

  /** Where a ranked game landed on the leaderboards (updates itself once the server has answered). */
  function rankPanel(r) {
    const box = h('div.rank-panel', { 'aria-live': 'polite' });
    const draw = () => {
      SQ.clear(box);
      box.hidden = false;
      const board = r.mode === 'daily' ? 'sarpa-daily' : 'sarpa-points';
      if (r.ranked === 'saving') box.append(SQ.ui.led('on blink'), h('span', 'Saving to the leaderboard…'));
      else if (r.ranked === 'saved' && r.rank) {
        const rk = r.rank[board] || {};
        const bits = [rk.day && `#${rk.day} today`, rk.week && `#${rk.week} this week`, rk.all && `#${rk.all} all time`].filter(Boolean);
        box.append(icon('trophy', { size: 18 }),
          h('span', h('strong', r.mode === 'daily' ? 'Daily leaderboard ' : 'Quiz points '), bits.length ? bits.join(' · ') : 'saved'),
          h('a', { href: '#/ranks?board=' + board }, 'Leaderboard'));
      } else if (r.ranked === 'queued') box.append(icon('clock', { size: 18 }), h('span', 'Saved on this device. It will go on the leaderboard when you are back online.'));
      else if (r.ranked === 'error') box.append(icon('warn', { size: 18 }), h('span', 'This game was not ranked: ' + (r.rankError || 'unknown error')));
      else box.hidden = true;
    };
    const onResult = (e) => { if (e.detail && e.detail.id === r.id) { Object.assign(r, e.detail); draw(); } };
    window.addEventListener('sarpa-result', onResult);
    draw();
    return { el: box, stop: () => window.removeEventListener('sarpa-result', onResult) };
  }

  /** Survival runs are judged by how long they lasted. */
  function survivalRank(n) {
    if (n >= 60) return { title: 'Unbreakable', sub: 'A run most herpetologists would be proud of.' };
    if (n >= 35) return { title: 'Iron Nerves', sub: 'Deep into the look-alikes and still standing.' };
    if (n >= 20) return { title: 'Steady Hand', sub: 'Past the easy snakes and into the tricky ones.' };
    if (n >= 10) return { title: 'Warming Up', sub: 'The famous snakes are behind you. Now the hard part.' };
    return { title: 'Bitten Early', sub: 'Shake it off and go again. Every run is new.' };
  }

  function shareText(r, rank) {
    if (r.mode === 'sudden') return `Sarpa survival: ${r.correct} ${r.correct === 1 ? 'snake' : 'snakes'} in a row 🐍 (${rank.title})`;
    const pct = SQ.pct(r.correct, r.n);
    const rows = [];
    const marks = r.items.map((x) => (x.correct ? '🟩' : '🟥'));
    for (let i = 0; i < marks.length; i += 10) rows.push(marks.slice(i, i + 10).join(''));
    const lvl = SQ.engine.DIFFICULTY[r.difficulty];
    const head = r.mode === 'daily' ? `Sarpa daily snake quiz ${r.dateKey}` : `Sarpa snake quiz (${lvl ? lvl.label : r.difficulty}, ${r.n} questions)`;
    return `${head}\n${r.correct}/${r.n} (${pct}%) · ${rank.title}\n${rows.join('\n')}`;
  }

  SQ.views.results = function () {
    const D = SQ.data, S = SQ.store;
    const r = S.loadLastResult();
    if (!r) {
      return { node: h('div.page.wrap', SQ.ui.empty('No results yet', 'Play a quiz to see your results here.', h('a.btn.btn-primary', { href: '#/play' }, 'Start a quiz'))), view: 'results' };
    }
    // a game played before the data set was updated can mention a species that is no longer in it
    r.items = (r.items || []).filter((it) => D.byId[it.species] && (it.options || []).every((id) => D.byId[id]));
    const pct = SQ.pct(r.correct, r.n);
    const survival = r.mode === 'sudden';
    const rank = survival ? survivalRank(r.correct) : SQ.engine.rank(pct);
    const ranked = rankPanel(r);

    // by family
    const fam = {};
    r.items.forEach((it) => {
      const f = D.byId[it.species].family;
      (fam[f] = fam[f] || { n: 0, c: 0 });
      fam[f].n += 1; if (it.correct) fam[f].c += 1;
    });
    const famRows = Object.entries(fam).sort((a, b) => b[1].n - a[1].n);

    // missed species (unique)
    const missed = [];
    const seen = new Set();
    r.items.filter((x) => !x.correct).forEach((x) => {
      if (seen.has(x.species)) return;
      seen.add(x.species);
      missed.push(x);
    });

    const badgeCards = (r.newBadges || []).map((id) => SQ.badges.all.find((b) => b.id === id)).filter(Boolean)
      .map((b) => h('div.badge-card.new', h('span.badge-ico', icon(b.icon, { size: 26 })), h('div', h('strong', b.name), h('small', b.desc)), h('span.new-tag', 'New')));

    const tiles = h('div.tiles', r.items.map((it) => {
      const p = D.photoById[it.photo];
      return h('button.tile.' + (it.correct ? 'ok' : 'bad'), {
        type: 'button', title: `Question ${it.n}: ${D.byId[it.species].name}`,
        'aria-label': `Question ${it.n}, ${it.correct ? 'correct' : 'wrong'}: ${D.byId[it.species].name}. Open explanation`,
        onclick: () => SQ.reviewItem(it),
      }, p ? SQ.ui.photo(p, { alt: '' }) : h('span.tile-gone', { 'aria-hidden': 'true' }, icon('help', { size: 22 })),
      h('span.tile-n', String(it.n)), h('span.tile-mark', icon(it.correct ? 'check' : 'x', { size: 14, stroke: 3 })));
    }));

    const missedList = missed.length
      ? h('div.missed-list', missed.slice(0, 12).map((it) => {
        const sp = D.byId[it.species];
        const chosen = it.chosen >= 0 ? D.byId[it.options[it.chosen]] : null;
        return h('a.missed', { href: '#/guide/' + sp.id },
          SQ.ui.thumb(sp),
          h('div', h('strong', sp.name), h('small', chosen ? `You said ${chosen.name}` : 'Ran out of time')),
          icon('arrow', { size: 16 }));
      }))
      : h('p.muted', 'Nothing missed. That was a perfect round!');

    const actions = h('div.btn-row.result-actions',
      r.mode === 'daily'
        ? null
        : survival
          ? h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.quiz.start({ mode: 'sudden', title: 'Survival' }) }, icon('redo', { size: 18 }), 'New run')
          : h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.quiz.start({
          mode: r.mode === 'quiz' ? 'quiz' : r.mode, count: r.config.planned || r.n, difficulty: r.difficulty, region: r.region,
          timer: r.timer, hints: r.config.hints !== false, preferUnseen: true, focus: r.config.focus, title: r.title,
        }) }, icon('redo', { size: 18 }), 'Play again'),
      missed.length && r.mode !== 'daily' && !survival
        ? h('button.btn', { type: 'button', onclick: () => SQ.quiz.start({
          mode: 'practice', title: 'Practice: snakes you missed', count: Math.min(20, Math.max(10, missed.length * 2)),
          difficulty: 'mixed', region: 'all', timer: 0, hints: true, preferUnseen: true, focus: missed.map((m) => m.species),
        }) }, icon('target', { size: 18 }), `Practise the ${missed.length} I missed`)
        : null,
      h('button.btn', { type: 'button', onclick: () => SQ.ui.shareText(shareText(r, rank), location.origin + location.pathname) }, icon('share', { size: 18 }), 'Share'),
      h('a.btn', { href: r.mode === 'daily' ? '#/daily' : '#/play' }, r.mode === 'daily' ? 'Daily page' : 'New quiz settings'));

    const node = h('div.page.wrap.results',
      h('section.result-hero',
        survival
          ? SQ.ui.dial(Math.min(100, (100 * r.correct) / 60), { size: 248, label: String(r.correct), sub: 'in a row' })
          : SQ.ui.dial(pct, { size: 248, label: pct + '%', sub: `${r.correct} / ${r.n}` }),
        h('div.result-copy',
          h('p.legend', survival ? 'Survival run over' : r.early ? 'Quiz ended early' : r.mode === 'daily' ? 'Daily challenge complete' : 'Quiz complete'),
          h('h1', rank.title),
          h('p.lead', rank.sub),
          ranked.el,
          h('div.lcd.result-lcd',
            SQ.ui.readout('Points', r.points),
            SQ.ui.readout('Best streak', r.bestStreak),
            SQ.ui.readout('Time', SQ.fmtDuration(r.seconds)),
            SQ.ui.readout('Hints used', r.items.reduce((a, b) => a + (b.hints || 0), 0))),
          actions)),
      badgeCards.length ? h('section', h('h2.section-title', 'Badges unlocked'), h('div.badge-row', badgeCards)) : null,
      h('section', h('h2.section-title', 'Your answers', h('small', 'Tap a photo for the full explanation')), tiles),
      h('div.two-col',
        h('section', h('h2.section-title', 'Snakes to revisit'), missedList),
        h('section', h('h2.section-title', 'By family'), h('div.fam-bars', famRows.map(([f, v]) => h('div.fam-row',
          h('span.fam-name', f), h('div.fam-bar', h('i', { style: { width: SQ.pct(v.c, v.n) + '%' } })), h('span.fam-n', `${v.c}/${v.n}`)))))));

    if ((survival ? r.correct >= 25 : pct >= 85 && r.n >= 10 && !r.early)) setTimeout(() => SQ.ui.confetti(), 300);
    return { node, title: 'Results', view: 'results', cleanup: ranked.stop };
  };
})();
