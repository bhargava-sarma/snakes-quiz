/* Progress, snakebite-safety, about and credits pages. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const REPO_URL = 'https://github.com/bhargava-sarma/snakes-quiz';

  /* ------------------------------------------------------------------ */
  /*  My progress                                                         */
  /* ------------------------------------------------------------------ */

  SQ.views.stats = function () {
    const D = SQ.data, S = SQ.store;
    const p = S.progress();
    const t = p.totals;
    const have = Object.keys(p.species).filter((id) => D.byId[id] && p.species[id].c > 0).length;

    const tiles = h('div.stat-tiles',
      [['Quizzes played', t.games], ['Questions answered', t.answered], ['Accuracy', SQ.pct(t.correct, t.answered) + '%'],
        ['Points earned', t.points.toLocaleString()], ['Best streak', t.bestStreak], ['Time played', SQ.fmtDuration(t.seconds)]]
        .map(([l, v]) => h('div.stat-tile', h('b', String(v)), h('span', l))));

    // recent games chart
    const recent = p.games.slice(0, 20).reverse();
    const chart = recent.length
      ? h('div.chart', { role: 'img', 'aria-label': 'Accuracy of your last quizzes' }, recent.map((g) => {
        const pct = SQ.pct(g.correct, g.n);
        return h('div.bar-col', { title: `${SQ.fmtDate(g.ts)}: ${g.correct}/${g.n} (${pct}%)` }, h('i', { style: { height: Math.max(pct, 3) + '%' }, class: pct >= 70 ? 'good' : pct >= 45 ? 'mid' : 'low' }), h('span', pct + ''));
      }))
      : h('p.muted', 'Play a quiz and your results will appear here.');

    // snake-dex
    const dex = h('div.dex', D.species.slice().sort((a, b) => a.name.localeCompare(b.name)).map((sp) => {
      const m = S.mastery(sp.id);
      return h('a.dex-item.m' + m, { href: '#/guide/' + sp.id, title: `${sp.name}: ${['not met yet', 'learning', 'getting there', 'mastered'][m]}` },
        SQ.ui.thumb(sp), h('span', sp.name));
    }));

    // weak spots
    const weak = S.weakSpecies(D.species.map((s) => s.id), 12);
    const weakList = weak.length
      ? h('div.weak-list', weak.map((id) => {
        const sp = D.byId[id], r = S.speciesRecord(id);
        return h('a.missed', { href: '#/guide/' + id }, SQ.ui.thumb(sp), h('div', h('strong', sp.name), h('small', `${r.c} of ${r.s} correct`)), icon('arrow', { size: 16 }));
      }))
      : h('p.muted', t.answered ? 'No weak spots right now. Nice work.' : 'Answer some questions and your trickiest snakes will be listed here.');

    const confusions = S.topConfusions(5).filter((c) => D.byId[c.correct] && D.byId[c.chosen]);
    const confList = confusions.length
      ? h('ul.confusions', confusions.map((c) => h('li', h('a', { href: '#/guide/' + c.correct }, D.byId[c.correct].name), ' mistaken for ', h('a', { href: '#/guide/' + c.chosen }, D.byId[c.chosen].name), h('small', ` × ${c.n}`))))
      : null;

    const badges = h('div.badge-grid', SQ.badges.all.map((b) => {
      const got = p.badges[b.id];
      return h('div.badge-card' + (got ? '.got' : '.locked'), h('span.badge-ico', icon(got ? b.icon : 'lock', { size: 24 })), h('div', h('strong', b.name), h('small', b.desc)));
    }));

    const history = p.games.length
      ? h('div.table-wrap', h('table.history',
        h('thead', h('tr', ['Date', 'Quiz', 'Score', 'Points', 'Time'].map((x) => h('th', x)))),
        h('tbody', p.games.slice(0, 10).map((g) => {
          const lvl = SQ.engine.DIFFICULTY[g.diff];
          const kind = g.mode === 'daily' ? 'Daily challenge' : g.mode === 'weak' ? 'Weak spots' : g.mode === 'practice' ? 'Practice' : `${lvl ? lvl.label : g.diff}${g.timer ? ', timed' : ''}`;
          return h('tr', h('td', SQ.fmtDate(g.ts)), h('td', kind), h('td', `${g.correct}/${g.n} (${SQ.pct(g.correct, g.n)}%)`), h('td', String(g.points)), h('td', SQ.fmtDuration(g.sec)));
        }))))
      : null;

    const flagged = S.flaggedList();
    const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try { S.importAll(await f.text()); SQ.ui.toast('Progress restored'); SQ.go('/stats'); }
      catch (e) { SQ.ui.toast(e.message || 'Could not read that file', 'bad'); }
    });

    const manage = h('section.card.manage',
      h('h3', 'Your data'),
      h('p.muted', 'Everything is stored only on this device (in your browser). Download a backup to move it to another device.'),
      h('div.btn-row',
        h('button.btn.btn-ghost', { type: 'button', onclick: () => {
          const blob = new Blob([S.exportAll()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `sarpa-progress-${SQ.todayKey()}.json` });
          document.body.appendChild(a); a.click(); a.remove();
        } }, icon('download', { size: 18 }), 'Download backup'),
        h('button.btn.btn-ghost', { type: 'button', onclick: () => fileInput.click() }, icon('upload', { size: 18 }), 'Restore backup'),
        flagged.length ? h('button.btn.btn-ghost', { type: 'button', onclick: () => { flagged.forEach((id) => S.unflagPhoto(id)); SQ.ui.toast(`Restored ${flagged.length} reported photos`); SQ.go('/stats'); } }, icon('flag', { size: 18 }), `Restore ${flagged.length} reported photo${flagged.length > 1 ? 's' : ''}`) : null,
        h('button.btn.btn-danger', { type: 'button', onclick: async () => {
          if (await SQ.ui.confirm({ title: 'Reset all progress?', text: 'This deletes your stats, badges and snake-dex on this device. It cannot be undone.', confirmLabel: 'Reset everything', danger: true })) { S.resetAll(); SQ.ui.toast('Progress reset'); SQ.go('/stats'); }
        } }, icon('trash', { size: 18 }), 'Reset progress')),
      fileInput);

    const node = h('div.page.wrap.stats',
      SQ.ui.pageHead('My progress', t.games ? 'Everything you have learned so far.' : 'Your quizzes, badges and snake-dex will build up here.'),
      tiles,
      h('div.two-col',
        h('section.card', h('h3', 'Last quizzes (accuracy %)'), chart),
        h('section.card', h('h3', 'Weak spots'), weakList,
          weak.length ? h('button.btn.btn-primary.btn-block', { type: 'button', onclick: () => SQ.quiz.start({
            mode: 'weak', title: 'Weak-spot practice', count: 20, difficulty: 'mixed', region: 'all', timer: 0, hints: true, preferUnseen: true, focus: weak,
          }) }, icon('target', { size: 18 }), 'Practise my weak spots') : null,
          confList ? h('div', h('h4.sub-h', 'Mix-ups to watch'), confList) : null)),
      h('section', h('h2.section-title', `Snake-dex`, h('small', `${have} of ${D.species.length} identified correctly`)),
        h('div.dex-legend', ['Not met yet', 'Learning', 'Getting there', 'Mastered'].map((l, i) => h('span', h('i.m' + i), l))), dex),
      h('section', h('h2.section-title', 'Badges', h('small', `${Object.keys(p.badges).length} of ${SQ.badges.all.length} unlocked`)), badges),
      history ? h('section', h('h2.section-title', 'Recent quizzes'), history) : null,
      manage);
    return { node, title: 'My progress', view: 'stats' };
  };

  /* ------------------------------------------------------------------ */
  /*  Snakebite safety                                                    */
  /* ------------------------------------------------------------------ */

  const MYTHS = [
    ['Venomous snakes have triangular heads and harmless ones do not.', 'Unreliable. Cobras and kraits, two of the deadliest groups in India, have narrow, rounded heads, while many harmless snakes can flatten their heads into a triangle when threatened.'],
    ['Round pupils mean a snake is harmless.', 'Wrong. Cobras, kraits and king cobras all have round pupils. Never judge danger from a photo or a quick glance.'],
    ['Snakes drink milk and love it.', 'No. Snakes are reptiles that eat whole animals. Milk cannot be digested and offering it harms the snake.'],
    ['Snakes chase people and take revenge.', 'Snakes flee when they can. Almost all bites happen when a snake is stepped on, cornered, handled or attacked.'],
    ['Snake charmers’ music makes snakes dance.', 'Snakes do not respond to tunes. They sway following the moving pipe. Snake charming is illegal in India because the snakes are cruelly treated.'],
    ['Cutting the bite and sucking out the venom works.', 'It does not. It increases infection and bleeding and wastes precious time. Tight bandages and tourniquets can also cause lasting damage.'],
    ['Herbs, stones, mantras or a healer can cure a bite.', 'Only anti-snake venom given in hospital treats envenoming. Delays for traditional treatment cost lives.'],
    ['A baby snake is more dangerous because it cannot control its venom.', 'A myth. Adult snakes carry more venom. Any venomous snake of any size deserves respect.'],
    ['A dead snake is safe.', 'Not always. Reflexes can make a freshly killed snake (even a severed head) bite. Do not handle dead snakes with bare hands.'],
  ];

  SQ.views.safety = function () {
    const D = SQ.data;
    const big4 = ['naja-naja', 'bungarus-caeruleus', 'daboia-russelii', 'echis-carinatus'].map((id) => D.byId[id]).filter(Boolean);

    const right = [
      ['R', 'Reassure', 'Keep the person calm and still. Fear and panic speed up the spread of venom. Many bites are from harmless snakes, and even venomous bites can be treated successfully if the person reaches hospital in time.'],
      ['I', 'Immobilise', 'Hold the bitten limb still, like a fractured limb, with a splint or sling. Remove rings, bangles, watches and anklets before swelling starts. Avoid walking if you can. Carry or transport them.'],
      ['GH', 'Get to Hospital immediately', 'Go to the nearest hospital that stocks anti-snake venom, by the fastest transport available, even if there are no symptoms yet. Kraits in particular can bite with little pain or swelling, and paralysis can follow hours later.'],
      ['T', 'Tell the doctor', 'Report anything that develops on the way: drooping eyelids, blurred vision, trouble speaking or breathing, vomiting, bleeding or spreading swelling, and the time of the bite. Describe the snake or show a photo if one was taken safely.'],
    ];

    const donts = [
      'Do not tie a tight band, rope or tourniquet around the limb.',
      'Do not cut the bite, burn it, or try to suck out venom.',
      'Do not apply ice, herbs, chemicals, cow dung or any home remedy.',
      'Do not give alcohol, and do not wait for symptoms or for a traditional healer.',
      'Do not chase, catch or kill the snake. It wastes time and risks more bites.',
      'If the person is unconscious, lay them on their side (recovery position) and keep the airway clear. Do not give anything by mouth.',
    ];

    const prevention = [
      'Carry a torch and wear closed shoes or boots when walking outdoors at night or in tall grass.',
      'Sleep off the floor on a cot, and under a bed-net where kraits are common. Kraits often enter homes at night.',
      'Never put hands into holes, woodpiles, rubble or thick vegetation. Use a stick to check first.',
      'Keep the area around the house clear of rubbish and rodents, which attract snakes.',
      'If you meet a snake, stop, step back slowly and give it space. Keep children and pets away and call a trained snake rescuer or the forest department.',
    ];

    const node = h('div.page.wrap.safety',
      SQ.ui.pageHead('Snakebite safety', 'Know what to do before you ever need it.'),
      h('div.notice.danger', icon('warn', { size: 24 }), h('div',
        h('strong', 'A snakebite is always a medical emergency. '),
        'Research estimates that snakebite caused about 58,000 deaths a year in India between 2000 and 2019, mostly among rural people, and most of these deaths could have been prevented by getting to hospital quickly for anti-snake venom. If someone has been bitten, call ',
        h('a', { href: 'tel:108' }, '108'), ' (ambulance) or ', h('a', { href: 'tel:112' }, '112'), ' and head for a hospital straight away.')),
      h('section', h('h2.section-title', 'First aid: do it R.I.G.H.T.'),
        h('div.right-grid', right.map(([k, t, text]) => h('div.right-card', h('span.right-key', k), h('h3', t), h('p', text))))),
      h('div.two-col',
        h('section.card', h('h3', icon('x', { size: 18, stroke: 3 }), ' What NOT to do'), h('ul.dont-list', donts.map((d) => h('li', d)))),
        h('section.card', h('h3', icon('shield', { size: 18 }), ' Avoiding bites'), h('ul.why-list', prevention.map((d) => h('li', d))))),
      h('section',
        h('h2.section-title', 'The "Big Four"', h('small', 'Cause most snakebite deaths in India')),
        h('p.lead-p', 'The standard Indian polyvalent anti-snake venom is made against these four. Learn to recognise them, but remember that any bite should be treated as an emergency.'),
        h('div.big4-grid', big4.map((sp) => h('a.big4-card', { href: '#/guide/' + sp.id }, SQ.ui.thumb(sp), h('div', h('strong', sp.name), h('i.sci', sp.sci)))))),
      h('section',
        h('h2.section-title', 'Myths and facts'),
        h('div.myths', MYTHS.map(([m, f]) => h('details.myth', h('summary', h('span.myth-tag', 'Myth'), m), h('p', h('span.fact-tag', 'Fact'), f))))),
      h('section.notice', icon('info', { size: 22 }), h('div',
        'This page is general information and not medical advice. Guidance follows the widely used "Do it R.I.G.H.T." approach in the national and WHO South-East Asia snakebite guidelines. Follow the advice of local doctors and emergency services.')));
    return { node, title: 'Snakebite safety', view: 'safety' };
  };

  /* ------------------------------------------------------------------ */
  /*  About                                                               */
  /* ------------------------------------------------------------------ */

  SQ.views.about = function () {
    const D = SQ.data;
    const m = D.meta || {};
    const licCount = {};
    D.photos.forEach((p) => { licCount[p.license] = (licCount[p.license] || 0) + 1; });
    const people = new Set(D.photos.map((p) => p.credit)).size;

    const node = h('div.page.wrap.about.prose',
      SQ.ui.pageHead('About Sarpa', 'A free photo quiz that teaches snake identification, one explanation at a time.'),
      h('section.card',
        h('h2', 'How it works'),
        h('p', `Sarpa shows you a real photograph of a snake from the Indian subcontinent and asks you to name it from four options. After you answer you see why the right answer is right and why each of the other three options is not, including how they differ from the snake in the photo.`),
        h('p', `The game holds ${D.photos.length.toLocaleString()} photographs of ${D.species.length} species. Every quiz is built fresh: species are balanced, the photos you have already seen are avoided, and the harder difficulty levels fill the options with genuine look-alikes.`)),
      h('section.card',
        h('h2', 'Where the photos come from'),
        h('p', 'All photos are community observations on ', h('a', { href: 'https://www.inaturalist.org', target: '_blank', rel: 'noopener' }, 'iNaturalist'),
          ' that reached "research grade", meaning other naturalists agreed with the species identification. They were taken in India, and every photographer chose an open Creative Commons licence.'),
        h('p', `This edition has photos from ${people.toLocaleString()} photographers. Each photo is credited beneath it and in the full `, h('a', { href: '#/credits' }, 'photo credits'), ' list. ',
          'Licences used: ', Object.entries(licCount).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n.toLocaleString()})`).join(', '), '.'),
        h('p', 'Some iNaturalist species are so alike that they cannot be told apart from a photo (for example several newly separated vine snakes). Those are grouped as a single species here, and the photo’s original iNaturalist name is shown in its credit line.'),
        h('p.muted', 'Some licences are "NonCommercial", so this site must stay non-commercial unless the data set is rebuilt with only commercial-friendly licences (the README explains how). State names are derived from each photo’s location using OpenStreetMap-based boundaries © OpenStreetMap contributors.')),
      h('section.card',
        h('h2', 'Accuracy and limits'),
        h('p', 'Species descriptions are written for general education from standard field-guide knowledge. Identification on iNaturalist is community-based and a few photos may be mislabelled, and snakes vary a lot in colour and pattern. If you spot a mistake, use the "Report photo" button on a question, or ', h('a', { href: REPO_URL + '/issues', target: '_blank', rel: 'noopener' }, 'open an issue'), '.'),
        h('p', h('strong', 'Do not use this app to decide whether a real snake is dangerous. '), 'Treat every wild snake as potentially dangerous and keep your distance.')),
      h('section.card',
        h('h2', 'Privacy'),
        h('p', 'No accounts, no cookies, no tracking, no ads. Your scores, badges and settings are stored only in your own browser. Photos are served from this site. If your browser cannot show a local image, it may load it directly from iNaturalist’s public image bucket instead.')),
      h('section.card',
        h('h2', 'Open source'),
        h('p', 'The code is open source (MIT licence). The README explains how the photo data set is built from iNaturalist’s open data and how to rebuild or extend it. ', h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, 'View the project on GitHub'), '.'),
        m.generated ? h('p.muted', `Data set built ${m.generated}.`) : null));
    return { node, title: 'About', view: 'about' };
  };

  /* ------------------------------------------------------------------ */
  /*  Credits                                                             */
  /* ------------------------------------------------------------------ */

  SQ.views.credits = function () {
    const D = SQ.data;
    const PAGE = 50;
    let q = '', page = 0;
    const body = h('tbody');
    const info = h('p.result-count');
    const pager = h('div.pager');

    function rows() {
      const needle = q.toLowerCase();
      return D.photos.filter((p) => !needle || (p.credit + ' ' + D.byId[p.sp].name + ' ' + D.byId[p.sp].sci + ' ' + p.state).toLowerCase().includes(needle));
    }

    function draw() {
      const list = rows();
      const pages = Math.max(1, Math.ceil(list.length / PAGE));
      page = Math.min(page, pages - 1);
      info.textContent = `${list.length.toLocaleString()} photos`;
      SQ.clear(body);
      list.slice(page * PAGE, page * PAGE + PAGE).forEach((p) => {
        body.appendChild(h('tr',
          h('td', h('a', { href: '#/guide/' + p.sp }, D.byId[p.sp].name)),
          h('td', p.credit),
          h('td', p.licenseUrl ? h('a', { href: p.licenseUrl, target: '_blank', rel: 'noopener' }, p.license) : p.license),
          h('td', p.state || '-'),
          h('td', h('a', { href: p.page, target: '_blank', rel: 'noopener' }, 'photo ' + p.id))));
      });
      SQ.clear(pager);
      pager.append(
        h('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: page === 0, onclick: () => { page--; draw(); window.scrollTo(0, 0); } }, icon('left', { size: 16 }), 'Prev'),
        h('span', `Page ${page + 1} of ${pages}`),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', disabled: page >= pages - 1, onclick: () => { page++; draw(); window.scrollTo(0, 0); } }, 'Next', icon('right', { size: 16 })));
    }

    const search = h('input', { type: 'search', placeholder: 'Search by photographer, species or state', 'aria-label': 'Search credits' });
    search.addEventListener('input', SQ.debounce(() => { q = search.value.trim(); page = 0; draw(); }, 150));
    const node = h('div.page.wrap.credits',
      SQ.ui.pageHead('Photo credits', 'Thank you to every photographer who shared their snake photos under an open licence on iNaturalist.'),
      h('div.filters', h('div.search-box', icon('search', { size: 18 }), search)), info,
      h('div.table-wrap', h('table.history', h('thead', h('tr', ['Species', 'Photographer', 'Licence', 'State', 'Source'].map((x) => h('th', x)))), body)),
      pager);
    draw();
    return { node, title: 'Photo credits', view: 'credits' };
  };
})();
