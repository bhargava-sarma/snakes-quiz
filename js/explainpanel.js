/* The explanation shown after each answer: why it IS the right snake, and why it is NOT each other option. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  const ui = SQ.ui;

  ui.factsGrid = function (facts) {
    return h('dl.facts', facts.map(([k, v]) => h('div', h('dt', k), h('dd', v))));
  };

  /** Quick facts that start collapsed on phones (they are long) and open on wider screens. */
  ui.factsBox = function (facts) {
    const wide = window.matchMedia ? window.matchMedia('(min-width: 700px)').matches : true;
    const box = h('details.facts-box', h('summary', 'Quick facts: size, habitat, range, diet'), ui.factsGrid(facts));
    if (wide) box.setAttribute('open', '');
    return box;
  };

  /** Side-by-side comparison of the snake in the photo (a) and an option (b). */
  ui.compareTable = function (a, b, labels) {
    labels = Object.assign({ labelA: 'In the photo', labelB: 'This option' }, labels || {});
    const rows = SQ.explain.table(a, b);
    const wrap = h('div.cmp', { role: 'table', 'aria-label': `${a.name} compared with ${b.name}` });
    wrap.appendChild(h('div.cmp-row.cmp-head', { role: 'row' },
      h('div', { role: 'columnheader' }, h('span.sr-only', 'Trait')),
      h('div', { role: 'columnheader' }, h('small', labels.labelA), h('b', a.name)),
      h('div', { role: 'columnheader' }, h('small', labels.labelB), h('b', b.name))));
    rows.forEach(([label, x, y]) => {
      wrap.appendChild(h('div.cmp-row', { role: 'row' },
        h('div.cmp-label', { role: 'rowheader' }, label),
        h('div.cmp-a', { role: 'cell' }, x),
        h('div.cmp-b', { role: 'cell' }, y)));
    });
    return wrap;
  };

  function whyCorrectCard(sp) {
    const why = SQ.explain.whyCorrect(sp);
    return h('section.card.why-card',
      h('p.legend.card-tag', icon('check', { size: 13, stroke: 3 }), 'The answer'),
      h('div.why-head',
        h('div',
          h('h3', `Why it's ${SQ.article(sp.name)} ${sp.name}`),
          h('p.sci-line', h('i', sp.sci), sp.aka.length ? h('span.aka', ' · also called ' + SQ.listJoin(sp.aka.slice(0, 3))) : null)),
        h('div.badges', ui.venomBadge(sp), ui.big4Badge(sp))),
      h('p.venom-note', icon(why.venom.icon, { size: 16 }), ' ', SQ.cap(why.venom.note) + '.'),
      h('ul.why-list', why.points.map((p) => h('li', p))),
      why.facts.length ? ui.factsBox(why.facts) : null,
      why.fact ? h('p.fun', h('span.fun-tag', 'Did you know?'), ' ', why.fact) : null,
      h('a.more-link', { href: '#/guide/' + sp.id, onclick: () => ui.closeModal() }, `Open ${sp.name} in the field guide`, icon('arrow', { size: 16 })));
  }

  function whyNotCard(correct, other, isChosen) {
    const w = SQ.explain.whyNot(correct, other);
    return h('article.card.whynot' + (isChosen ? '.chosen' : ''), { id: 'why-' + other.id },
      h('header.wn-head',
        ui.thumb(other),
        h('div.wn-title',
          h('h4', h('span.wn-not', 'Not '), other.name, h('i.sci', other.sci)),
          h('div.badges', isChosen ? h('span.badge.you', 'Your answer') : null, ui.venomBadge(other, { short: true }), ui.big4Badge(other)))),
      h('p.wn-lead', w.lead),
      w.diffs.length
        ? h('ul.wn-diffs', w.diffs.map((d) => h('li', h('b', d.axis + '. '), `The ${correct.name} ${d.a}; the ${other.name} ${d.b}.`)))
        : null,
      w.venomNote ? h('p.wn-venom', icon('warn', { size: 16 }), ' ', w.venomNote) : null,
      h('details.wn-more',
        h('summary', icon('compare', { size: 16 }), ` How to recognise ${SQ.article(other.name)} ${other.name} · compare side by side`),
        h('div.wn-more-body',
          h('p.sub', `Telltale signs of ${SQ.article(other.name)} ${other.name}`),
          h('ul.why-list', w.ids.map((p) => h('li', p))),
          ui.compareTable(correct, other),
          h('a.more-link', { href: '#/guide/' + other.id, onclick: () => ui.closeModal() }, `Open ${other.name} in the field guide`, icon('arrow', { size: 16 })))));
  }

  /**
   * o = { correct, chosen, options, timedOut, isCorrect, points, streak, photo, showVerdict }
   *   correct / chosen / options are species objects.
   */
  ui.explanation = function (o) {
    const root = h('div.explain');
    if (o.showVerdict !== false) {
      const kind = o.timedOut ? 'timeout' : o.isCorrect ? 'ok' : 'bad';
      const text = SQ.explain.verdict(o.isCorrect, o.chosen, o.correct, o.chosen, o.timedOut);
      root.appendChild(h('div.verdict.' + kind, { role: 'status' },
        h('span.verdict-ico', icon(kind === 'ok' ? 'check' : kind === 'timeout' ? 'clock' : 'x', { size: 26, stroke: 3 })),
        h('div',
          h('h2', text),
          o.points != null ? h('p.verdict-sub',
            o.isCorrect ? `+${o.points} points` : 'No points this time',
            o.streak > 1 && o.isCorrect ? h('span.streak-chip', icon('flame', { size: 14 }), `${o.streak} in a row`) : null) : null)));
    }
    root.appendChild(whyCorrectCard(o.correct));

    const others = o.options.filter((s) => s.id !== o.correct.id);
    others.sort((a, b) => (o.chosen && a.id === o.chosen.id ? -1 : 0) - (o.chosen && b.id === o.chosen.id ? -1 : 0));
    if (others.length) {
      root.appendChild(h('h3.section-title', 'Why it is not any of the other options'));
      others.forEach((s) => root.appendChild(whyNotCard(o.correct, s, !!(o.chosen && o.chosen.id === s.id && !o.isCorrect))));
    }
    return root;
  };
})();
