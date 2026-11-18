/* Field guide: searchable species list (India, North America or both) and species detail pages. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const FAMILY_LABEL = {
    Elapidae: 'Cobras, kraits, coral & sea snakes',
    Viperidae: 'Vipers & pit vipers',
    Colubridae: 'Colubrids (rat snakes, racers, kingsnakes, garter & water snakes ...)',
    Natricidae: 'Keelbacks & water snakes',
    Homalopsidae: 'Mud & mangrove water snakes',
    Pythonidae: 'Pythons',
    Erycidae: 'Sand boas',
    Boidae: 'Boas',
    Uropeltidae: 'Shieldtail snakes',
    Typhlopidae: 'Blind snakes',
    Gerrhopilidae: 'Blind snakes',
    Leptotyphlopidae: 'Slender blind snakes',
    Pareidae: 'Snail-eating snakes',
    Acrochordidae: 'File snakes',
    Xenodermidae: 'Odd-scaled snakes',
    Cylindrophiidae: 'Pipe snakes',
    Lamprophiidae: 'Lamprophiids',
    Psammophiidae: 'Sand snakes',
    Psammodynastidae: 'Mock vipers',
  };

  const VENOM_FILTERS = [
    { value: 'all', label: 'Any venom status' },
    { value: 'danger', label: 'Dangerous (venomous or highly venomous)' },
    { value: 'deadly', label: 'Highly venomous only' },
    { value: 'mild', label: 'Mildly venomous' },
    { value: 'none', label: 'Non-venomous' },
  ];

  function venomMatch(sp, f) {
    if (f === 'all') return true;
    if (f === 'danger') return sp.venom === 'deadly' || sp.venom === 'venomous';
    return sp.venom === f;
  }

  const state = { q: '', area: 'all', family: 'all', venom: 'all', region: 'all', status: 'all', sort: 'name' };

  /* ------------------------------------------------------------------ */
  /*  List                                                                */
  /* ------------------------------------------------------------------ */

  /** The address of the guide for a region: /guide, /guide/india or /guide/north-america. */
  const guidePath = (area) => (D_area(area) ? '/guide/' + SQ.data.area(area).slug : '/guide');
  const D_area = (area) => SQ.data.oneArea(area);

  SQ.views.guide = function ({ query, area }) {
    const D = SQ.data, S = SQ.store;
    // the region is part of the address (the old "?area=na" still works)
    const qa = query && query.get('area');
    state.area = area || (D.oneArea(qa) ? qa : 'all');
    if (!area && D.oneArea(qa)) SQ.setUrl(guidePath(qa));          // the old "?area=na" becomes "/guide/north-america"
    const inView = () => D.species.filter((sp) => state.area === 'all' || D.inArea(sp, state.area));

    const count = h('p.result-count');
    const grid = h('div.species-grid');

    function matches(sp) {
      if (state.area !== 'all' && !D.inArea(sp, state.area)) return false;
      if (state.family !== 'all' && sp.family !== state.family) return false;
      if (!venomMatch(sp, state.venom)) return false;
      if (state.region !== 'all' && !(D.stateIndex[state.region] && D.stateIndex[state.region][sp.id])) return false;
      if (state.status !== 'all') {
        const m = S.mastery(sp.id);
        if (state.status === 'spotted' && m === 0) return false;
        if (state.status === 'new' && m !== 0) return false;
      }
      if (state.q) {
        const q = state.q.toLowerCase();
        const hay = [sp.name, sp.sci, sp.family, ...(sp.aka || []), ...Object.values(sp.local || {})].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }

    function draw() {
      let list = D.species.filter(matches);
      if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      else if (state.sort === 'easy') list.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
      else if (state.sort === 'hard') list.sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
      else if (state.sort === 'venom') list.sort((a, b) => SQ.data.VENOM[b.venom].rank - SQ.data.VENOM[a.venom].rank || a.name.localeCompare(b.name));
      else if (state.sort === 'photos') list.sort((a, b) => b.photoCount - a.photoCount);
      const total = inView().length;
      count.textContent = `${list.length} of ${total} species` + (state.area === 'all' ? '' : ` in ${D.area(state.area).label}`);
      SQ.clear(grid);
      if (!list.length) { grid.appendChild(SQ.ui.empty('No snakes match', 'Try clearing a filter or searching for something else.')); return; }
      list.forEach((sp) => {
        const m = S.mastery(sp.id);
        grid.appendChild(h('a.species-card', { href: '/guide/' + sp.id },
          h('div.sc-photo', SQ.ui.thumb(sp), m > 0 ? h('span.sc-seen', { title: ['', 'Seen in quizzes', 'Getting there', 'Mastered'][m] }, icon('check', { size: 13, stroke: 3 })) : null),
          h('div.sc-body',
            h('h3', sp.name),
            h('i.sci', sp.sci),
            h('div.badges', SQ.ui.venomBadge(sp, { short: true }), SQ.ui.big4Badge(sp), state.area === 'all' ? SQ.ui.areaBadge(sp, { short: true }) : null))));
      });
    }

    const search = h('input#guide-search', { type: 'search', placeholder: 'Search by any name', value: state.q, 'aria-label': 'Search snakes', autocomplete: 'off' });
    search.addEventListener('input', SQ.debounce(() => { state.q = search.value.trim(); draw(); }, 120));

    // an option list, or groups of options ({ group, options }) shown under a heading each
    const optionNodes = (key, options) => options.map((o) => (o.group
      ? h('optgroup', { label: o.group }, optionNodes(key, o.options))
      : h('option', { value: o.value, selected: o.value === state[key] }, o.label)));
    const select = (label, key, options) => h('label.filter', h('span.legend', label),
      h('select', { onchange: (e) => { state[key] = e.target.value; draw(); countActive(); } }, optionNodes(key, options)));

    const filterSummary = h('span.filter-count');
    function countActive() {
      const n = ['family', 'venom', 'region', 'status'].filter((k) => state[k] !== 'all').length;
      filterSummary.textContent = n ? String(n) : '';
      filterSummary.hidden = !n;
    }
    const filterRow = h('div.filter-row');
    /** The family and state lists depend on the region in view, so they are rebuilt when it changes. */
    function drawFilters() {
      const families = {};
      inView().forEach((sp) => { families[sp.family] = (families[sp.family] || 0) + 1; });
      const famList = Object.entries(families).sort((a, b) => b[1] - a[1]);
      if (state.family !== 'all' && !families[state.family]) state.family = 'all';
      const stateOpts = (area) => D.regions(1, area).map((r) => ({ value: r.state, label: `${r.state} (${r.species})` }));
      const regionOpts = state.area === 'all'
        ? [{ value: 'all', label: 'Anywhere' }, ...D.AREA_ORDER.map((a) => ({ group: D.area(a).label, options: stateOpts(a) })).filter((g) => g.options.length)]
        : [{ value: 'all', label: `All of ${D.area(state.area).label}` }, ...stateOpts(state.area)];
      if (state.region !== 'all' && !(state.area === 'all' || D.stateArea[state.region] === state.area)) state.region = 'all';
      SQ.clear(filterRow);
      filterRow.append(
        select('Family', 'family', [{ value: 'all', label: 'All families' }, ...famList.map(([f, n]) => ({ value: f, label: `${FAMILY_LABEL[f] || f} (${n})` }))]),
        select('Venom', 'venom', VENOM_FILTERS),
        select(state.area === 'in' ? 'State' : 'State or province', 'region', regionOpts),
        select('Progress', 'status', [{ value: 'all', label: 'All snakes' }, { value: 'spotted', label: 'Ones I have met in quizzes' }, { value: 'new', label: 'Ones I have not met yet' }]),
        select('Sort', 'sort', [{ value: 'name', label: 'Name' }, { value: 'easy', label: 'Easiest first' }, { value: 'hard', label: 'Hardest first' }, { value: 'venom', label: 'Most dangerous first' }, { value: 'photos', label: 'Most photos' }]));
      countActive();
    }
    const panel = h('details.filter-panel',
      h('summary', icon('sliders', { size: 16 }), 'Filters and sorting', filterSummary),
      filterRow);
    if (window.matchMedia && window.matchMedia('(min-width: 860px)').matches) panel.setAttribute('open', '');
    drawFilters();

    const areaTabs = SQ.ui.segmented({
      name: 'Region', value: state.area, className: 'seg-area guide-areas',
      options: [{ value: 'all', label: 'All', sub: `${D.species.length} species` },
        ...D.AREA_ORDER.map((a) => ({ value: a, label: D.area(a).label, sub: `${D.byArea[a].length} species` }))],
      onChange: (v) => SQ.go(guidePath(v)),
    });

    const filters = h('div.filters.panel',
      areaTabs,
      h('div.search-box', icon('search', { size: 18 }), search),
      panel);

    const n = inView().length;
    const HEAD = {
      all: ['Field guide', `${D.species.length} snakes of India and North America with identification tips, look-alikes and photos.`],
      in: ['Snakes of India', `All ${n} snakes of India in Sarpa, from the Big Four (the Indian Cobra, Common Krait, Russell’s Viper and Saw-scaled Viper) to rare pit vipers and shieldtails, with identification tips, look-alikes and real photos.`],
      na: ['Snakes of North America', `All ${n} snakes of the USA and Canada in Sarpa: rattlesnakes, copperheads, cottonmouths and coral snakes, kingsnakes, rat snakes, garter and water snakes and many more, with identification tips, look-alikes and real photos.`],
    }[state.area];
    const node = h('div.page.wrap.guide',
      SQ.ui.pageHead(HEAD[0], HEAD[1],
        h('div.btn-row', h('a.btn.btn-sm', { href: '/learn' }, icon('eye', { size: 16 }), 'Flashcards'), h('a.btn.btn-sm', { href: '/compare' }, icon('compare', { size: 16 }), 'Compare snakes')),
        [h('b', '05'), state.area === 'all' ? 'Field guide' : 'Field guide · ' + D.area(state.area).label]),
      filters, count, h('h2.sr-only', 'Species'), grid);
    draw();

    // for search engines: the page, where it sits, and every snake it lists
    const path = guidePath(state.area);
    const SEO = {
      all: [`Field guide: ${D.species.length} snakes of India and North America · Sarpa`,
        `Identify ${D.species.length} snakes of India, the USA and Canada: real photos, identification tips, venom status, range and look-alikes for every species, from cobras and kraits to rattlesnakes.`],
      in: [`Snakes of India: ${n} species with photos and ID tips · Sarpa`,
        `The snakes of India, from the Big Four to rare pit vipers: real photos, identification tips, venom status and look-alikes for ${n} species, photographed all over India.`],
      na: [`Snakes of North America (USA and Canada): ${n} species · Sarpa`,
        `Rattlesnakes, copperheads, coral snakes, kingsnakes, garter snakes and more: real photos, identification tips, venom status and look-alikes for ${n} snakes of the USA and Canada.`],
    }[state.area];
    const listed = inView().slice().sort((a, b) => a.name.localeCompare(b.name));
    const trail = [['Field guide', '/guide']].concat(state.area === 'all' ? [] : [[HEAD[0], path]]);
    const seo = {
      title: SEO[0], description: SEO[1], path,
      ld: [
        SQ.seo.page('CollectionPage', path, HEAD[0], SEO[1], {
          breadcrumb: { '@id': SQ.seo.abs(path) + '#breadcrumb' },
          mainEntity: { '@type': 'ItemList', numberOfItems: listed.length, itemListElement: listed.map((sp, k) => ({ '@type': 'ListItem', position: k + 1, name: sp.name, url: SQ.seo.abs('/guide/' + sp.id) })) },
        }),
        SQ.seo.crumbs(path, trail),
      ],
    };
    return { node, seo, view: 'guide' };
  };

  /* ------------------------------------------------------------------ */
  /*  Species page                                                        */
  /* ------------------------------------------------------------------ */

  function lookalikeCards(sp) {
    const D = SQ.data;
    // hand-written notes first, then the closest-looking by traits
    const withNotes = (SQ.data.noteIndex && SQ.data.noteIndex[sp.id]) || [];
    const ordered = [];
    withNotes.forEach((id) => { if (D.byId[id] && !ordered.includes(D.byId[id])) ordered.push(D.byId[id]); });
    // the closest look-alikes where the snake lives (hand-written notes can still compare it with a snake elsewhere)
    D.lookalikes(sp.id, 8, sp.regions.length === 1 ? sp.regions[0] : undefined).forEach((s) => { if (!ordered.includes(s)) ordered.push(s); });
    return ordered.slice(0, 4).map((other) => {
      const w = SQ.explain.whyNot(sp, other);
      return h('a.look-card', { href: '/guide/' + other.id },
        SQ.ui.thumb(other),
        h('div',
          h('h3', other.name, h('i.sci', other.sci)),
          h('p', w.lead),
          h('div.badges', SQ.ui.venomBadge(other, { short: true }))));
    });
  }

  SQ.views.species = function ({ params }) {
    const D = SQ.data, S = SQ.store;
    const sp = D.byId[params.id];
    if (!sp) return SQ.views.notFound({ path: '/guide/' + params.id, what: 'That snake is not in the field guide.' });

    if (!D.noteIndex) {
      D.noteIndex = {};
      Object.values(D.pairMap).forEach((p) => {
        (D.noteIndex[p.a] = D.noteIndex[p.a] || []).push(p.b);
        (D.noteIndex[p.b] = D.noteIndex[p.b] || []).push(p.a);
      });
      Object.keys(D.noteIndex).forEach((k) => { D.noteIndex[k] = Array.from(new Set(D.noteIndex[k])); });
    }

    const photos = D.photosOf(sp.id);
    const photoAlt = (p) => `${sp.name} (${sp.sci})${p.state ? ', photographed in ' + p.state : ''}`;
    let current = 0;
    const stage = h('div.gallery-stage');
    const strip = h('div.gallery-strip');
    const credit = h('div.gallery-credit');

    function show(i) {
      current = (i + photos.length) % photos.length;
      const p = photos[current];
      SQ.clear(stage);
      stage.appendChild(h('div.viewport', SQ.ui.photo(p, { zoom: true, eager: true, vf: true, alt: photoAlt(p), tag: `${String(current + 1).padStart(2, '0')}/${String(photos.length).padStart(2, '0')}` })));
      if (photos.length > 1) {
        stage.appendChild(h('button.nav-btn.prev', { type: 'button', 'aria-label': 'Previous photo', onclick: () => show(current - 1) }, icon('left', { size: 22 })));
        stage.appendChild(h('button.nav-btn.next', { type: 'button', 'aria-label': 'Next photo', onclick: () => show(current + 1) }, icon('right', { size: 22 })));
      }
      SQ.clear(credit);
      credit.appendChild(SQ.ui.creditLine(p));
      SQ.$$('.gallery-strip button', strip).forEach((b, idx) => b.classList.toggle('on', idx === current));
    }
    photos.slice(0, 14).forEach((p, i) => {
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
      img.onerror = () => { if (!img.dataset.f) { img.dataset.f = '1'; img.src = p.remote; } };
      img.src = p.url;
      strip.appendChild(h('button', { type: 'button', 'aria-label': `Show photo ${i + 1}`, onclick: () => show(i) }, img));
    });

    const rec = S.speciesRecord(sp.id);
    const mastery = S.mastery(sp.id);
    const progressCard = h('div.card.progress-card',
      h('p.legend.card-tag.neutral', 'Your progress'),
      rec.s
        ? h('div', h('p', `You have met this snake ${SQ.plural(rec.s, 'time')} and identified it correctly ${SQ.plural(rec.c, 'time')} (${SQ.pct(rec.c, rec.s)}%).`),
          h('p.mastery', h('span.mastery-chip.m' + mastery, ['', 'Learning', 'Getting there', 'Mastered'][mastery])))
        : h('p.muted', 'You have not met this snake in a quiz yet.'),
      h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => SQ.quiz.start({
        mode: 'practice', title: `Practice: ${sp.name}`, count: 10, difficulty: 'expert', area: sp.regions.length === 1 ? sp.regions[0] : 'mix', region: 'all', timer: 0, hints: true, preferUnseen: true, focus: [sp.id],
      }) }, icon('target', { size: 18 }), `Practise the ${sp.name}`),
      h('a.btn.btn-block', { href: `/compare?a=${sp.id}` }, icon('compare', { size: 18 }), 'Compare with another snake'));

    // side-by-side pages for the look-alikes that have a hand-written note
    const pairs = (D.noteIndex[sp.id] || []).map((id) => D.byId[id]).filter(Boolean).slice(0, 8);
    const pairLinks = pairs.length
      ? h('div.pair-links', h('h3.sub-h', 'Side by side'),
        h('ul', pairs.map((o) => h('li', h('a', { href: D.comparePath(sp.id, o.id) }, `${sp.name} vs ${o.name}`, icon('arrow', { size: 14 }))))))
      : null;

    const facts = SQ.ui.factsGrid([
      ['Length', sp.len], ['Habitat', sp.habitat], ['Found in', sp.range], ['Eats', sp.diet], ['Active', sp.active],
      ['Family', `${sp.family}${FAMILY_LABEL[sp.family] ? ' (' + FAMILY_LABEL[sp.family].toLowerCase() + ')' : ''}`],
    ].filter((f) => f[1]));

    const topStates = (sp.stateCounts || []).slice(0, 8);
    const maxState = topStates.length ? topStates[0][1] : 1;
    const stateChips = topStates.length
      ? h('div.fam-bars', topStates.map(([name, n]) => h('div.fam-row',
        h('span.fam-name', name), h('div.fam-bar', h('i', { style: { width: Math.max(6, SQ.pct(n, maxState)) + '%' } })), h('span.fam-n', String(n)))))
      : h('p.muted', 'No location data.');

    const akaLine = sp.aka.length ? h('p.aka-line', 'Also called ', h('b', sp.aka.join(', '))) : null;
    const localLine = [];
    if (sp.local && Object.keys(sp.local).length) {
      const LANG = { hi: 'Hindi', mr: 'Marathi', ta: 'Tamil', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', te: 'Telugu', gu: 'Gujarati' };
      Object.entries(sp.local).forEach(([k, v]) => localLine.push(h('div', h('dt', LANG[k] || k), h('dd', { lang: k }, v))));
    }

    const hues = SQ.ui.hueDots(sp);
    const namesCard = (localLine.length || hues)
      ? h('section.card', h('p.legend.card-tag.neutral', 'Names and colours'),
        localLine.length ? h('dl.local-names', localLine) : null,
        hues ? h('p.hue-line', h('span.legend', 'Colours'), hues) : null)
      : null;
    const home = sp.regions[0] === 'na' ? 'na' : 'in';
    const listName = home === 'na' ? 'Snakes of North America' : 'Snakes of India';
    const path = '/guide/' + sp.id;
    const node = h('div.page.wrap.species',
      SQ.ui.crumbs([['Field guide', '/guide'], [listName, guidePath(home)], [sp.name]]),
      h('header.species-head',
        h('div.species-title',
          h('p.legend', h('b', String(sp.index + 1).padStart(3, '0')), `${sp.family} · ${sp.kind || 'snake'}`),
          h('h1', sp.name), h('p.sci-big', h('i', sp.sci)), akaLine),
        h('div.badges.big', SQ.ui.venomBadge(sp), SQ.ui.big4Badge(sp), SQ.ui.areaBadge(sp), h('span.badge.fam', sp.family), h('span.badge.tier', 'Difficulty ', SQ.ui.tierDots(sp)))),
      h('div.species-grid2',
        h('div.col-main',
          h('div.gallery', stage, credit, strip),
          h('section.card', h('p.legend.card-tag', icon('check', { size: 13, stroke: 3 }), 'How to identify'), h('h2.card-title', `${SQ.cap(SQ.article(sp.name))} ${sp.name}`),
            h('p.venom-note', icon(SQ.explain.venomInfo(sp).icon, { size: 16 }), ' ', SQ.cap(SQ.explain.venomInfo(sp).note) + '.'),
            h('ul.why-list', sp.ids.map((x) => h('li', x))),
            sp.fact ? h('p.fun', h('span.fun-tag', 'Did you know?'), ' ', sp.fact) : null),
          h('section', h('h2.section-title', 'Look-alikes', h('small', 'and how to tell them apart')), h('div.look-list', lookalikeCards(sp)), pairLinks)),
        h('aside.col-side',
          progressCard,
          h('section.card', h('p.legend.card-tag.neutral', 'Quick facts'), facts),
          namesCard,
          h('section.card', h('p.legend.card-tag.neutral', 'Where our photos were taken'), h('p.muted.small', sp.regions.includes('na') ? 'States and provinces where community members photographed this snake.' : 'States where community members photographed this snake.'), stateChips))));
    show(0);

    const desc = SQ.seo.speciesDescription(sp);
    const pics = photos.slice(0, 4).map((p) => SQ.seo.photo(p, photoAlt(p)));
    const seo = {
      title: SQ.seo.fit([`${sp.name} (${sp.sci}): how to identify it · Sarpa`, `${sp.name} (${sp.sci}): ID guide · Sarpa`, `${sp.name} (${sp.sci}) · Sarpa`, `${sp.name} · Sarpa`]),
      description: desc, path, type: 'article', image: SQ.seo.speciesImage(sp),
      ld: [
        SQ.seo.page('WebPage', path, `${sp.name} (${sp.sci})`, desc, {
          about: { '@id': SQ.seo.abs(path) + '#taxon' }, breadcrumb: { '@id': SQ.seo.abs(path) + '#breadcrumb' },
          primaryImageOfPage: pics[0] || undefined, image: pics.length ? pics : undefined,
        }),
        Object.assign(SQ.seo.taxon(sp, path), { image: pics[0] ? pics[0].contentUrl : undefined, url: SQ.seo.abs(path) }),
        SQ.seo.crumbs(path, [['Field guide', '/guide'], [listName, guidePath(home)], [sp.name, path]]),
      ],
    };
    return { node, seo, view: 'species' };
  };
})();
