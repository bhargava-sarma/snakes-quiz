/* Extra learning tools: side-by-side comparison, flashcards and "snake of the day". */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  /* ------------------------------------------------------------------ */
  /*  Snake of the day                                                    */
  /* ------------------------------------------------------------------ */

  SQ.snakeOfTheDay = function () {
    const D = SQ.data;
    const key = SQ.todayKey();
    const pool = D.species.filter((s) => s.tier <= 4 && s.fact);
    const sp = pool[SQ.hashSeed('sotd-' + key) % pool.length];
    return h('a.sotd', { href: '#/guide/' + sp.id },
      SQ.ui.thumb(sp),
      h('div.sotd-body',
        h('p.legend', icon('star', { size: 13 }), ' Snake of the day'),
        h('h3', sp.name, h('i.sci', sp.sci)),
        h('p', sp.fact),
        h('div.badges', SQ.ui.venomBadge(sp, { short: true }), SQ.ui.big4Badge(sp))));
  };

  /* ------------------------------------------------------------------ */
  /*  Compare                                                             */
  /* ------------------------------------------------------------------ */

  SQ.views.compare = function ({ query }) {
    const D = SQ.data;
    const sorted = D.species.slice().sort((x, y) => x.name.localeCompare(y.name));
    let a = D.byId[query.get('a')] || D.byId['naja-naja'] || sorted[0];
    let b = D.byId[query.get('b')];
    if (!b || b === a) b = D.lookalikes(a.id, 1)[0] || sorted[1];

    const out = h('div.cmp-out');
    const makeSelect = (id, get, set) => {
      const sel = h('select#' + id, { onchange: (e) => { set(D.byId[e.target.value]); draw(); } },
        sorted.map((s) => h('option', { value: s.id, selected: s.id === get().id }, `${s.name} (${s.sci})`)));
      return sel;
    };
    const selA = makeSelect('cmp-a', () => a, (v) => { a = v; });
    const selB = makeSelect('cmp-b', () => b, (v) => { b = v; });

    function column(sp, letter) {
      const cover = D.coverOf(sp.id);
      return h('div.cmp-col',
        h('a.cmp-photo', { href: '#/guide/' + sp.id, 'aria-label': `${sp.name} in the field guide` }, cover ? SQ.ui.photo(cover, { alt: sp.name, vf: true, tag: letter }) : SQ.ui.thumb(sp)),
        h('h2', sp.name), h('i.sci', sp.sci),
        h('div.badges', SQ.ui.venomBadge(sp), SQ.ui.big4Badge(sp)));
    }

    function draw() {
      selA.value = a.id; selB.value = b.id;
      try { history.replaceState(null, '', `#/compare?a=${a.id}&b=${b.id}`); } catch (e) { /* ignore */ }
      SQ.clear(out);
      if (a.id === b.id) { out.appendChild(SQ.ui.empty('Pick two different snakes', 'Choose another species to compare.')); return; }
      const cryptic = D.isCryptic(a.id, b.id);
      const w = SQ.explain.whyNot(a, b);
      SQ.append(out,
        h('div.cmp-cols', column(a, 'A'), column(b, 'B')),
        cryptic ? h('div.notice.info', icon('info', { size: 20 }), h('div', 'These two are almost impossible to tell apart from a photograph. Experts rely on where the snake was found and on counting scales.')) : null,
        h('div.cmp-split',
          h('section.card',
            h('p.legend.card-tag.neutral', 'What sets them apart'),
            h('p.wn-lead', w.lead),
            w.diffs.length ? h('ul.wn-diffs', w.diffs.map((d) => h('li', h('b', d.axis + '. '), `The ${a.name} ${d.a}; the ${b.name} ${d.b}.`))) : null,
            w.venomNote ? h('p.wn-venom', icon('warn', { size: 16 }), ' ', w.venomNote) : null),
          h('section.card', h('p.legend.card-tag.neutral', 'Side by side'), SQ.ui.compareTable(a, b, { labelA: 'Snake A', labelB: 'Snake B' }))),
        h('div.cmp-ids',
          h('section.card', h('h3', `Recognising the ${a.name}`), h('ul.why-list', a.ids.map((x) => h('li', x)))),
          h('section.card', h('h3', `Recognising the ${b.name}`), h('ul.why-list', b.ids.map((x) => h('li', x))))));
    }

    const node = h('div.page.wrap.compare',
      h('a.back-link', { href: '#/guide' }, icon('back', { size: 16 }), 'Field guide'),
      SQ.ui.pageHead('Compare two snakes', 'See exactly how two look-alikes differ.', null, [h('b', '03'), 'Field guide · compare']),
      h('div.cmp-pick',
        h('div.cmp-field', h('label.legend', { for: 'cmp-a' }, h('b', 'A'), 'First snake'), selA),
        h('button.btn.btn-sm.cmp-swap', { type: 'button', 'aria-label': 'Swap the two snakes', onclick: () => { [a, b] = [b, a]; draw(); } }, icon('redo', { size: 16 }), 'Swap'),
        h('div.cmp-field', h('label.legend', { for: 'cmp-b' }, h('b', 'B'), 'Second snake'), selB)),
      out);
    draw();
    return { node, title: 'Compare snakes', view: 'compare' };
  };

  /* ------------------------------------------------------------------ */
  /*  Flashcards                                                          */
  /* ------------------------------------------------------------------ */

  const FLASH_FILTERS = [
    { value: 'all', label: 'All snakes' },
    { value: 'danger', label: 'Venomous snakes' },
    { value: 'none', label: 'Harmless and mildly venomous snakes' },
    { value: 'big4', label: 'The Big Four' },
    { value: 'easy', label: 'Easy ones (start here)' },
    { value: 'hard', label: 'Tricky ones' },
    { value: 'weak', label: 'My weak spots' },
  ];

  function deckFor(filter) {
    const D = SQ.data, S = SQ.store;
    let list = D.species.slice();
    if (filter === 'danger') list = list.filter((s) => s.venom === 'deadly' || s.venom === 'venomous');
    else if (filter === 'none') list = list.filter((s) => s.venom === 'none' || s.venom === 'mild');
    else if (filter === 'big4') list = list.filter((s) => s.big4);
    else if (filter === 'easy') list = list.filter((s) => s.tier <= 2);
    else if (filter === 'hard') list = list.filter((s) => s.tier >= 4);
    else if (filter === 'weak') { const weak = new Set(S.weakSpecies(list.map((s) => s.id), 40)); list = list.filter((s) => weak.has(s.id)); }
    return SQ.shuffle(list).slice(0, 30);
  }

  SQ.views.learn = function () {
    const D = SQ.data;
    let filter = 'easy', deck = [], i = 0, shown = false;
    const stage = h('div.flash-stage');

    function pickPhoto(sp) { return SQ.pick(D.photosOf(sp.id)); }

    function draw() {
      SQ.clear(stage);
      if (!deck.length) {
        stage.appendChild(SQ.ui.empty('No cards here yet', filter === 'weak' ? 'Answer some quiz questions first and your weak spots will appear here.' : 'Try another set.'));
        return;
      }
      const sp = deck[i];
      const photo = sp._photo || (sp._photo = pickPhoto(sp));
      const pad = (n) => String(n).padStart(2, '0');
      const counter = h('div.lcd.flash-lcd', h('span.legend', 'Card'), h('b.lcd-num', `${pad(i + 1)}/${pad(deck.length)}`));
      const photoCol = h('div.flash-photo', h('div.viewport', SQ.ui.photo(photo, { zoom: true, eager: true, vf: true, alt: 'Snake to identify', tag: 'Card ' + pad(i + 1) })));
      const back = shown
        ? h('div.flash-back',
          h('p.legend.card-tag', icon('check', { size: 13, stroke: 3 }), 'The answer'),
          h('h2', sp.name), h('i.sci', sp.sci),
          h('div.badges', SQ.ui.venomBadge(sp), SQ.ui.big4Badge(sp)),
          h('ul.why-list', sp.ids.slice(0, 3).map((x) => h('li', x))),
          SQ.ui.creditLine(photo, { inat: false }),
          h('a.more-link', { href: '#/guide/' + sp.id }, `Open ${sp.name} in the field guide`, icon('arrow', { size: 16 })))
        : h('div.flash-prompt', h('p.legend', 'Your turn'), h('h2', 'What snake is this?'), h('p', 'Look closely, say the name out loud, then reveal the answer.'));
      const nextOrReveal = shown
        ? h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: next }, i + 1 >= deck.length ? 'Start over' : 'Next card', icon('arrow', { size: 20 }))
        : h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => { shown = true; draw(); } }, icon('eye', { size: 20 }), 'Reveal the answer');
      SQ.append(stage, h('div.flash-grid', photoCol, h('div.flash-side', counter, back,
        h('div.flash-actions', h('button.btn.btn-lg', { type: 'button', disabled: i === 0, onclick: prev }, icon('left', { size: 18 }), h('span.flash-back-label', 'Back')), nextOrReveal))));
    }

    function next() { shown = false; if (i + 1 >= deck.length) { deck = deckFor(filter); i = 0; } else i += 1; draw(); window.scrollTo(0, 0); }
    function prev() { if (i > 0) { shown = false; i -= 1; draw(); } }
    function reset() { deck = deckFor(filter); i = 0; shown = false; draw(); }

    const sel = h('select#flash-set', { 'aria-label': 'Which snakes', onchange: (e) => { filter = e.target.value; reset(); } },
      FLASH_FILTERS.map((f) => h('option', { value: f.value, selected: f.value === filter }, f.label)));

    function onKey(e) {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.body.classList.contains('modal-open')) return;
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        e.preventDefault(); if (!shown) { shown = true; draw(); } else next();
      } else if (e.key === 'ArrowLeft') prev();
    }
    document.addEventListener('keydown', onKey);

    const node = h('div.page.wrap.learn',
      h('a.back-link', { href: '#/guide' }, icon('back', { size: 16 }), 'Field guide'),
      SQ.ui.pageHead('Flashcards', 'Look at the photo, say the name out loud, then check yourself. No scores, no pressure.', null, [h('b', '03'), 'Field guide · flashcards']),
      h('div.flash-controls', sel, h('button.btn.btn-sm', { type: 'button', onclick: reset }, icon('redo', { size: 16 }), 'Shuffle')),
      stage);
    reset();
    return { node, title: 'Flashcards', view: 'learn', cleanup: () => document.removeEventListener('keydown', onKey) };
  };
})();
