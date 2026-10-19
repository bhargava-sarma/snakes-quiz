/* The results screen shown after a quiz. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  /** Open one answered question's photo + full explanation in a dialog. */
  SQ.reviewItem = function (item) {
    const D = SQ.data;
    const photo = D.photoById[item.photo];
    if (!photo) return;
    const correctSp = D.byId[item.species];
    const options = item.options.map((id) => D.byId[id]);
    const chosenSp = item.chosen >= 0 ? D.byId[item.options[item.chosen]] : null;
    SQ.ui.modal({
      title: `Question ${item.n}`, wide: true, className: 'review',
      body: [
        SQ.ui.photo(photo, { zoom: true, eager: true }),
        SQ.ui.creditLine(photo),
        SQ.ui.explanation({ correct: correctSp, chosen: chosenSp, options, timedOut: item.chosen < 0, isCorrect: item.correct, points: item.points, streak: 0 }),
      ],
    });
  };

  function shareText(r, rank) {
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
    const pct = SQ.pct(r.correct, r.n);
    const rank = SQ.engine.rank(pct);
    const ringColor = pct >= 70 ? 'var(--ok)' : pct >= 45 ? 'var(--brand-2)' : 'var(--bad)';

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
      }, SQ.ui.photo(p, { alt: '' }), h('span.tile-n', String(it.n)), h('span.tile-mark', icon(it.correct ? 'check' : 'x', { size: 14, stroke: 3 })));
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
        : h('button.btn.btn-primary', { type: 'button', onclick: () => SQ.quiz.start({
          mode: r.mode === 'quiz' ? 'quiz' : r.mode, count: r.config.planned || r.n, difficulty: r.difficulty, region: r.region,
          timer: r.timer, hints: r.config.hints !== false, preferUnseen: true, focus: r.config.focus, title: r.title,
        }) }, icon('redo', { size: 18 }), 'Play again'),
      missed.length && r.mode !== 'daily'
        ? h('button.btn.btn-ghost', { type: 'button', onclick: () => SQ.quiz.start({
          mode: 'practice', title: 'Practice: snakes you missed', count: Math.min(20, Math.max(10, missed.length * 2)),
          difficulty: 'mixed', region: 'all', timer: 0, hints: true, preferUnseen: true, focus: missed.map((m) => m.species),
        }) }, icon('target', { size: 18 }), `Practise the ${missed.length} I missed`)
        : null,
      h('button.btn.btn-ghost', { type: 'button', onclick: () => SQ.ui.shareText(shareText(r, rank), location.origin + location.pathname) }, icon('share', { size: 18 }), 'Share'),
      h('a.btn.btn-ghost', { href: r.mode === 'daily' ? '#/daily' : '#/play' }, r.mode === 'daily' ? 'Daily page' : 'New quiz settings'));

    const node = h('div.page.wrap.results',
      h('section.result-hero',
        SQ.ui.ring(pct, { size: 168, stroke: 14, label: pct + '%', sub: `${r.correct} / ${r.n}`, color: ringColor }),
        h('div.result-copy',
          h('p.eyebrow', r.early ? 'Quiz ended early' : r.mode === 'daily' ? 'Daily challenge complete' : 'Quiz complete'),
          h('h1', rank.title),
          h('p.lead', rank.sub),
          h('div.result-stats',
            h('div', h('b', String(r.points)), h('span', 'points')),
            h('div', h('b', String(r.bestStreak)), h('span', 'best streak')),
            h('div', h('b', SQ.fmtDuration(r.seconds)), h('span', 'time')),
            h('div', h('b', r.items.reduce((a, b) => a + (b.hints || 0), 0) + ''), h('span', 'hints used')))),
        ),
      badgeCards.length ? h('section', h('h2.section-title', 'Badges unlocked'), h('div.badge-row', badgeCards)) : null,
      actions,
      h('section', h('h2.section-title', 'Your answers', h('small', 'Tap a photo to see the full explanation')), tiles),
      h('div.two-col',
        h('section', h('h2.section-title', 'Snakes to revisit'), missedList),
        h('section', h('h2.section-title', 'By family'), h('div.fam-bars', famRows.map(([f, v]) => h('div.fam-row',
          h('span.fam-name', f), h('div.fam-bar', h('i', { style: { width: SQ.pct(v.c, v.n) + '%' } })), h('span.fam-n', `${v.c}/${v.n}`)))))));

    if (pct >= 85 && r.n >= 10 && !r.early) setTimeout(() => SQ.ui.confetti(), 300);
    return { node, title: 'Results', view: 'results' };
  };
})();
