/* Herpdle, the screen: name the mystery snake in six goes. Every miss (or skip) reveals one more clue and makes the
 * pixelated photo a little sharper; every guess is compared with the answer, trait by trait. The rules themselves are
 * in herpdle-core.js. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  /* ------------------------------------------------------------------ */
  /*  Saved games (on this device)                                        */
  /* ------------------------------------------------------------------ */

  const blank = () => ({ v: 1, days: {}, practice: null, recent: [], pstats: { played: 0, won: 0 }, seenHelp: false });

  function load() {
    const raw = SQ.store.get('herpdle', null);
    const s = Object.assign(blank(), raw && typeof raw === 'object' ? raw : {});
    if (!s.days || typeof s.days !== 'object') s.days = {};
    if (!Array.isArray(s.recent)) s.recent = [];
    s.pstats = Object.assign({ played: 0, won: 0 }, s.pstats || {});
    return s;
  }
  const save = (s) => SQ.store.set('herpdle', s);

  /** A saved game is only usable if its snake, photo and guesses are still in the data. */
  function usable(g) {
    const D = SQ.data;
    return !!(g && D.byId[g.sp] && D.photoById[g.photo] && D.photoById[g.photo].sp === g.sp && Array.isArray(g.g) && g.g.every((x) => x === '' || D.byId[x]));
  }

  /** Daily statistics, worked out from the saved days. */
  function dailyStats(s = load()) {
    const days = Object.entries(s.days).filter(([, g]) => g && g.done && !g.remote).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const dist = [0, 0, 0, 0, 0, 0];
    let won = 0;
    days.forEach(([, g]) => { if (g.won) { won++; dist[Math.min(6, g.g.length) - 1]++; } });
    // a streak is consecutive days solved, ending today or yesterday
    const today = SQ.todayKey();
    const solved = new Set(days.filter(([, g]) => g.won).map(([d]) => d));
    let streak = 0;
    let d = solved.has(today) ? today : SQ.time.shiftDay(today, -1);
    while (solved.has(d)) { streak++; d = SQ.time.shiftDay(d, -1); }
    let best = 0, run = 0, prev = null;
    days.forEach(([day, g]) => {
      if (!g.won) { run = 0; prev = day; return; }
      run = prev && SQ.time.shiftDay(prev, 1) === day && run ? run + 1 : 1;
      best = Math.max(best, run);
      prev = day;
    });
    return { played: days.length, won, streak, best: Math.max(best, streak), dist };
  }

  /* ------------------------------------------------------------------ */
  /*  The pixelated photo                                                  */
  /* ------------------------------------------------------------------ */

  function pixelPhoto(photo) {
    const wrap = h('div.hd-photo', { role: 'img', 'aria-label': 'Pixelated photo of the mystery snake. It gets sharper with every guess.' });
    const canvas = h('canvas.hd-canvas', { 'aria-hidden': 'true' });
    const tag = h('span.photo-tag', 'Signal 1/6');
    wrap.append(canvas, tag);
    const ctx = canvas.getContext('2d');
    const mid = document.createElement('canvas'), small = document.createElement('canvas');
    const img = new Image();
    img.decoding = 'async';
    let level = 0, ready = false, ro = null;

    function draw() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.round(rect.width * dpr), Hh = Math.round(rect.height * dpr);
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
      const cols = SQ.herpdle.PIXELS[Math.min(level, SQ.herpdle.PIXELS.length - 1)];
      const rows = Math.max(1, Math.round((cols * Hh) / W));
      if (!ready) {
        // waiting for the picture: an empty dot-matrix
        ctx.fillStyle = '#141413'; ctx.fillRect(0, 0, W, Hh);
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        const bw = W / cols, bh = Hh / rows;
        for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) ctx.fillRect(x * bw + 1, y * bh + 1, bw - 2, bh - 2);
        return;
      }
      // crop the photo to the frame, shrink it in two steps (a fair average colour per block), then blow it up unsmoothed
      const ir = img.naturalWidth / img.naturalHeight, cr = W / Hh;
      let sw = img.naturalWidth, sh = img.naturalHeight;
      if (ir > cr) sw = sh * cr; else sh = sw / cr;
      const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
      mid.width = Math.max(cols, Math.min(240, Math.round(sw))); mid.height = Math.max(rows, Math.round((mid.width * sh) / sw));
      const m = mid.getContext('2d');
      m.imageSmoothingEnabled = true; m.imageSmoothingQuality = 'high';
      m.drawImage(img, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
      small.width = cols; small.height = rows;
      const s = small.getContext('2d');
      s.imageSmoothingEnabled = true; s.imageSmoothingQuality = 'high';
      s.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, cols, rows);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, W, Hh);
      // a faint grid between the blocks, like the cells of an LCD
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      for (let x = 1; x < cols; x++) { const px = Math.round((x * W) / cols) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, Hh); }
      for (let y = 1; y < rows; y++) { const py = Math.round((y * Hh) / rows) + 0.5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
      ctx.stroke();
    }

    img.onload = () => { ready = true; draw(); };
    img.onerror = () => { if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = photo.remote; } };
    img.src = photo.url;

    return {
      el: wrap,
      start() {
        if (window.ResizeObserver) { ro = new ResizeObserver(() => draw()); ro.observe(wrap); }
        draw();
      },
      setLevel(n) {
        level = n;
        tag.textContent = `Signal ${Math.min(n + 1, 6)}/6`;
        draw();
      },
      stop() { if (ro) { ro.disconnect(); ro = null; } },
    };
  }

  /* ------------------------------------------------------------------ */
  /*  The guess box (a searchable list of every snake)                     */
  /* ------------------------------------------------------------------ */

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ऀ-෿]+/g, ' ').trim();

  let index = null;
  function searchIndex() {
    if (!index) {
      index = SQ.data.species.map((sp) => ({
        sp, name: norm(sp.name), sci: norm(sp.sci), hay: norm(SQ.herpdle.searchText(sp)),
        exact: new Set([sp.name, sp.sci].concat(sp.aka || []).map(norm)),
      }));
    }
    return index;
  }

  function search(q, exclude) {
    const qn = norm(q);
    if (!qn) return [];
    const tokens = qn.split(' ');
    return searchIndex()
      .filter((x) => !exclude.has(x.sp.id) && tokens.every((t) => x.hay.includes(t)))
      .map((x) => {
        let rank = 3;
        if (x.name.startsWith(qn)) rank = 0;
        else if (x.name.split(' ').some((w) => w.startsWith(tokens[0]))) rank = 1;
        else if (x.sci.startsWith(qn)) rank = 2;
        return [rank, x];
      })
      .sort((a, b) => a[0] - b[0] || a[1].sp.tier - b[1].sp.tier || a[1].sp.name.localeCompare(b[1].sp.name))
      .slice(0, 8)
      .map((x) => x[1].sp);
  }

  function exactMatch(q, exclude) {
    const qn = norm(q);
    const hit = searchIndex().find((x) => !exclude.has(x.sp.id) && x.exact.has(qn));
    return hit ? hit.sp : null;
  }

  function guessBox({ exclude, onGuess, guessesLeft }) {
    const input = h('input#hd-input', {
      type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'hd-list',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go',
      placeholder: 'Type a snake’s name', 'aria-label': 'Your guess: type a snake’s name and pick it from the list',
    });
    const list = h('ul#hd-list.hd-list', { role: 'listbox', 'aria-label': 'Matching snakes', hidden: true });
    const msg = h('p.hd-msg', { role: 'status', 'aria-live': 'polite' });
    let items = [], active = -1, chosen = null;

    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };

    function fit() {
      // keep the list above the phone keyboard
      const vv = window.visualViewport;
      const r = input.getBoundingClientRect();
      const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const below = viewBottom - r.bottom - 10;
      const above = r.top - (vv ? vv.offsetTop : 0) - 80;
      const up = below < 150 && above > below;
      list.classList.toggle('up', up);
      list.style.maxHeight = Math.max(120, Math.min(300, up ? above : below)) + 'px';
    }

    function render() {
      SQ.clear(list);
      items = search(input.value, exclude);
      if (!input.value.trim()) { close(); return; }
      if (!items.length) {
        list.appendChild(h('li.hd-none', { role: 'option', 'aria-disabled': 'true', 'aria-selected': 'false' }, 'No snake by that name. Try another spelling.'));
      }
      items.forEach((sp, i) => {
        const li = h('li.hd-opt' + (i === active ? '.on' : ''), { role: 'option', id: 'hd-opt-' + i, 'aria-selected': i === active ? 'true' : 'false' },
          h('span.common', sp.name), h('i.sci', sp.sci));
        li.addEventListener('mousedown', (e) => e.preventDefault());       // keep the focus in the box
        li.addEventListener('click', () => { pick(sp); submit(); });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      if (active >= 0) input.setAttribute('aria-activedescendant', 'hd-opt-' + active); else input.removeAttribute('aria-activedescendant');
      fit();
    }

    function pick(sp) { chosen = sp; input.value = sp.name; close(); }

    function submit() {
      msg.textContent = '';
      const sp = chosen && !exclude.has(chosen.id) ? chosen : exactMatch(input.value, exclude) || (items.length === 1 ? items[0] : null);
      if (!sp) {
        msg.textContent = input.value.trim() ? 'Pick a snake from the list.' : 'Type the name of a snake first.';
        input.focus();
        return;
      }
      if (exclude.has(sp.id)) { msg.textContent = 'You have already tried that one.'; return; }
      input.value = ''; chosen = null; close();
      onGuess(sp.id);
    }

    input.addEventListener('input', () => { chosen = null; active = -1; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = active <= 0 ? items.length - 1 : active - 1; render(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (active >= 0 && items[active]) pick(items[active]);
        submit();
      } else if (e.key === 'Escape') { close(); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('focus', () => {
      if (window.matchMedia('(max-width: 899.98px)').matches) {
        // on phones, bring the box up so the suggestions fit above the keyboard
        setTimeout(() => entry.scrollIntoView({ block: 'start', behavior: 'smooth' }), 260);
      }
      if (input.value.trim()) render();
    });
    const onViewport = () => { if (!list.hidden) fit(); };
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewport);

    const guessBtn = h('button.btn.btn-primary.hd-go', { type: 'button', onclick: submit, 'aria-label': 'Guess' }, h('span.hd-go-label', 'Guess'), icon('arrow', { size: 18 }));
    const skipBtn = h('button.btn.btn-ghost.btn-sm.hd-skip', { type: 'button', onclick: () => { msg.textContent = ''; onGuess(''); },
      title: 'Use up a guess to see the next clue' }, icon('skip', { size: 15 }), guessesLeft > 1 ? 'Skip, show the next clue' : 'Give up');
    const entry = h('div.hd-entry',
      h('div.hd-entry-row', h('div.hd-input-wrap', icon('search', { size: 18 }), input, list), guessBtn),
      h('div.hd-entry-foot', skipBtn, msg));
    return {
      el: entry,
      focus: () => input.focus({ preventScroll: true }),
      destroy: () => { if (window.visualViewport) window.visualViewport.removeEventListener('resize', onViewport); },
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Pieces of the board                                                  */
  /* ------------------------------------------------------------------ */

  const STATE_MARK = { hit: 'check', near: 'target', miss: 'x' };

  function tileEl(t, i, animate) {
    return h('div.hd-tile.' + t.state + (animate ? '.flip' : ''), { title: t.say, style: animate ? { animationDelay: i * 90 + 'ms' } : null },
      h('span.hd-tile-k', t.label),
      h('span.hd-tile-v', t.value),
      h('span.hd-tile-m', { 'aria-hidden': 'true' }, t.dir ? icon(t.dir, { size: 13, stroke: 3 }) : icon(STATE_MARK[t.state], { size: 11, stroke: 3 })),
      h('span.sr-only', t.say + '.'));
  }

  function guessRow(id, answer, n, opts = {}) {
    const D = SQ.data;
    if (!id) {
      return h('li.hd-row.skipped', h('div.hd-row-head', h('span.hd-row-n', String(n)), h('span.hd-row-name', 'Skipped')),
        h('div.hd-tiles', { 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(() => h('div.hd-tile.blank'))));
    }
    const sp = D.byId[id];
    const win = id === answer.id;
    const nameEl = opts.links ? h('a.hd-row-name', { href: '#/guide/' + sp.id }, sp.name) : h('span.hd-row-name', sp.name);
    return h('li.hd-row' + (win ? '.win' : ''),
      h('div.hd-row-head', h('span.hd-row-n', String(n)), nameEl, h('i.sci', sp.sci), win ? h('span.badge.ok-badge', icon('check', { size: 12, stroke: 3 }), 'Got it') : null),
      h('div.hd-tiles', SQ.herpdle.compare(sp, answer).map((t, i) => tileEl(t, i, opts.animate))));
  }

  /** One clue. Revealed clues fold open and shut (on phones only the newest starts open, to keep the list short). */
  function clueEl(clue, i, { open, expanded, fresh, unmask, sp }) {
    if (!open) {
      return h('li.hd-clue.locked', h('span.hd-clue-n', String(i + 1).padStart(2, '0')), h('span.hd-clue-t', clue.title),
        h('span.hd-clue-lock', icon('lock', { size: 13 }), `after guess ${i}`));
    }
    const extra = clue.extra === 'venom' ? SQ.ui.venomBadge(sp, { short: true }) : clue.extra === 'hues' ? SQ.ui.hueDots(sp) : null;
    return h('li.hd-clue' + (fresh ? '.fresh' : ''),
      h('details', { open: expanded ? true : null },
        h('summary.hd-clue-top', h('span.hd-clue-n', String(i + 1).padStart(2, '0')), h('span.hd-clue-t', clue.title), extra, fresh ? h('span.new-tag', 'New') : null),
        h('dl.hd-clue-rows', clue.rows.map((r) => h('div', h('dt', r.label),
          h('dd', r.parts.map((p) => (p.hide ? (unmask ? h('mark.hd-word', p.w) : h('span.redact', { title: 'Hidden: part of the snake’s name' }, h('span.sr-only', '(hidden word)'))) : p.t))))))));
  }

  function shareText(g) {
    const D = SQ.data;
    const answer = D.byId[g.sp];
    const rows = g.g.map((id) => {
      if (!id) return '⬜⬜⬜⬜⬜⬜';
      return SQ.herpdle.compare(D.byId[id], answer).map((t) => (t.state === 'hit' ? '🟩' : t.state === 'near' ? '🟨' : '⬛')).join('');
    });
    const head = g.kind === 'daily' ? `Herpdle #${g.number}` : `Herpdle practice (${(SQ.herpdle.LEVELS[g.level] || {}).label || ''})`;
    return `${head} ${g.won ? g.g.length : 'X'}/6 🐍\n${rows.join('\n')}`;
  }

  function howTo() {
    const D = SQ.data;
    const a = D.byId['naja-naja'], b = D.byId['ptyas-mucosa'];
    const sample = a && b ? h('div.hd-tiles.sample', SQ.herpdle.compare(b, a).map((t, i) => tileEl(t, i, false))) : null;
    SQ.ui.modal({
      title: 'How to play Herpdle', className: 'hd-help',
      body: [
        h('p', 'Name the mystery snake in ', h('strong', 'six goes'), '. You start with one clue and a very blurry photo.'),
        h('ul.why-list',
          h('li', 'Type a snake’s name and pick it from the list. Every snake in the field guide can be guessed.'),
          h('li', 'Each wrong guess (or skip) reveals the next clue and sharpens the photo.'),
          h('li', 'Words that would give the name away are blacked out.')),
        h('p.legend', 'Every guess is compared with the answer'),
        sample,
        a && b ? h('p.muted.small', `Above: guessing ${b.name} when the answer is ${a.name}.`) : null,
        h('ul.hd-legend',
          h('li', h('span.hd-key.hit', icon('check', { size: 11, stroke: 3 })), 'Green: the same as the answer.'),
          h('li', h('span.hd-key.near', icon('target', { size: 11, stroke: 3 })), 'Amber: close (one step away, a similar pattern or lifestyle, or a range that overlaps).'),
          h('li', h('span.hd-key.miss', icon('x', { size: 11, stroke: 3 })), 'Grey: different.'),
          h('li', h('span.hd-key.miss', icon('up', { size: 11, stroke: 3 })), 'Arrows: the answer is more (up) or less (down) venomous, or bigger or smaller.')),
        h('p.muted.small', 'Size: XS under 40 cm, S 40-80 cm, M 0.8-1.5 m, L 1.5-2.5 m, XL bigger. Region: N north, NE north-east, E east, C central, W west, S south, AN Andaman & Nicobar.'),
        h('p', h('strong', 'Points: '), '600 for the first go, then 500, 400, 300, 200 and 100. A new daily Herpdle arrives every midnight (India time); practice as much as you like in between.'),
      ],
      actions: [h('button.btn.btn-primary', { type: 'button', onclick: SQ.ui.closeModal }, 'Got it')],
    });
  }

  function countdown() {
    const el = h('b.lcd-num.hd-clock', '--:--:--');
    const tick = () => {
      const ms = SQ.time.msToNextDay();
      const hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000);
      el.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    };
    tick();
    const t = setInterval(tick, 1000);
    return { el, stop: () => clearInterval(t) };
  }

  /* ------------------------------------------------------------------ */
  /*  The view                                                             */
  /* ------------------------------------------------------------------ */

  SQ.views.herpdle = function ({ query }) {
    const D = SQ.data;
    const practice = query.get('mode') === 'practice';
    const today = SQ.todayKey();
    const number = SQ.herpdle.dayNumber(today);
    let st = load();
    let game = null;
    let photoBox = null, clock = null, box = null;
    let alive = true;

    const root = h('div.page.wrap.herpdle');
    const stage = h('div.hd-stage');

    const modeTabs = h('div.hd-modes', { role: 'tablist', 'aria-label': 'Herpdle mode' },
      h('a.hd-mode' + (!practice ? '.on' : ''), { href: '#/herpdle', role: 'tab', 'aria-selected': !practice ? 'true' : 'false' }, icon('calendar', { size: 16 }), `Daily #${number}`),
      h('a.hd-mode' + (practice ? '.on' : ''), { href: '#/herpdle?mode=practice', role: 'tab', 'aria-selected': practice ? 'true' : 'false' }, icon('redo', { size: 16 }), 'Practice'));

    root.append(
      SQ.ui.pageHead('Herpdle', practice ? 'Practice with any snake, as often as you like. Practice games are not ranked.' : 'One mystery snake a day, the same for everyone. Six goes to name it.',
        h('button.btn.btn-sm', { type: 'button', onclick: howTo }, icon('help', { size: 16 }), 'How to play'), [h('b', '02'), 'Clue game']),
      modeTabs, stage);

    function persist() {
      if (!game) return;
      if (game.kind === 'daily') st.days[game.day] = game; else st.practice = game;
      save(st);
    }

    /* ----- before a game ----- */

    function intro() {
      SQ.clear(stage);
      if (practice) {
        let level = SQ.store.settings().herpdleLevel || 'medium';
        if (!SQ.herpdle.LEVELS[level]) level = 'medium';
        const levels = SQ.ui.segmented({
          name: 'Practice level', value: level,
          options: Object.entries(SQ.herpdle.LEVELS).map(([k, lv]) => ({ value: k, label: lv.label, sub: `${SQ.herpdle.pool(k).length} snakes` })),
          onChange: (v) => { level = v; SQ.store.saveSettings({ herpdleLevel: v }); },
        });
        const startBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: async () => {
          startBtn.disabled = true;
          const gate = await SQ.account.gate();
          startBtn.disabled = false;
          if (!gate) return;
          const pick = SQ.herpdle.randomPick(level, st.recent);
          game = { kind: 'practice', level, sp: pick.species, photo: pick.photo, g: [], done: false, won: false, ranked: false, at: Date.now() };
          persist();
          board(true);
        } }, icon('play', { size: 20 }), 'Start a practice game');
        stage.append(h('section.card.hd-intro',
          h('p.legend', 'Practice'),
          h('h2', 'Pick a level'),
          levels,
          h('p.muted', `${st.pstats.played} practice games played, ${st.pstats.won} solved.`),
          startBtn));
        return;
      }
      const done = st.days[today];
      const playBtn = h('button.btn.btn-primary.btn-lg', { type: 'button', onclick: () => startDaily(playBtn) }, icon('play', { size: 20 }), 'Play today’s Herpdle');
      stage.append(h('section.card.hd-intro',
        h('p.legend', `Herpdle #${number} · ${SQ.time.label(today, { weekday: 'long', day: 'numeric', month: 'long' })}`),
        h('h2', 'Today’s mystery snake is waiting'),
        h('p', 'You get one clue and a blurry photo to begin with. Every guess tells you how close you are, and every miss reveals another clue.'),
        done && done.remote ? h('p.notice.info', icon('info', { size: 18 }), h('div', 'You have already played today’s Herpdle on another device.')) : null,
        h('div.btn-row', done && done.remote ? null : playBtn, h('button.btn', { type: 'button', onclick: howTo }, icon('help', { size: 18 }), 'How to play'))));
      if (!st.seenHelp) { st.seenHelp = true; save(st); setTimeout(howTo, 300); }
    }

    async function startDaily(btn) {
      btn.disabled = true;
      const gate = await SQ.account.gate();
      if (!gate) { btn.disabled = false; return; }
      let pick = null, runId = null, ranked = false;
      if (gate.ranked) {
        try {
          const srv = await SQ.api.daily('herpdle');
          if (srv.day === today && D.byId[srv.species] && D.photoById[srv.photo] && D.photoById[srv.photo].sp === srv.species) pick = { species: srv.species, photo: srv.photo };
          else if (srv.day === today) {
            SQ.ui.toast('A newer version of Sarpa is available. Reload the page to play today’s ranked Herpdle.', 'bad');
          }
          if (pick) {
            const run = await SQ.api.start('herpdle', 'daily');
            runId = run.runId; ranked = true;
          }
        } catch (e) {
          if (e.code === 'daily_done') {
            st.days[today] = { kind: 'daily', day: today, remote: true, done: false };
            save(st);
            btn.disabled = false;
            intro();
            return;
          }
          pick = null; ranked = false;
          SQ.ui.toast('Cannot reach the Sarpa server. Today’s game will not be ranked.');
        }
      }
      if (!pick) pick = SQ.herpdle.dailyPick(today);
      game = { kind: 'daily', day: today, number, sp: pick.species, photo: pick.photo, g: [], done: false, won: false, ranked, runId, at: Date.now() };
      persist();
      board(true);
    }

    /* ----- the board ----- */

    function teardown() {
      if (photoBox) { photoBox.stop(); photoBox = null; }
      if (clock) { clock.stop(); clock = null; }
      if (box) { box.destroy(); box = null; }
    }

    function board(focusInput) {
      SQ.clear(stage);
      teardown();
      const answer = D.byId[game.sp];
      const photo = D.photoById[game.photo];
      const clues = SQ.herpdle.clues(answer);
      const used = game.g.length;
      const left = SQ.herpdle.MAX_GUESSES - used;
      const over = game.done;

      // status strip: goes used, points still on offer
      const leds = h('div.hd-leds', { role: 'img', 'aria-label': `${used} of 6 guesses used` },
        [0, 1, 2, 3, 4, 5].map((i) => SQ.ui.led(i < used ? (game.won && i === used - 1 ? 'ok on' : game.g[i] ? 'bad on' : 'on') : '')));
      const worth = over ? (game.won ? SQ.herpdle.points(used, true) : 0) : SQ.herpdle.POINTS[Math.min(used, 5)];
      const status = h('div.lcd.hd-status',
        h('div.readout', h('span.legend', game.kind === 'daily' ? `Herpdle #${game.number}` : `Practice · ${(SQ.herpdle.LEVELS[game.level] || {}).label || ''}`), h('b.lcd-num', over ? (game.won ? 'SOLVED' : 'MISSED') : `GO ${used + 1}/6`)),
        h('div.readout', h('span.legend', over ? 'Points' : 'Worth'), h('b.lcd-num', String(worth).padStart(3, '0'))),
        leds);

      // photo: pixelated while playing, the real thing afterwards
      let photoEl;
      if (over) {
        photoEl = h('div.hd-photo-done', SQ.ui.photo(photo, { zoom: true, eager: true, vf: true, alt: `Photo of ${SQ.article(answer.name)} ${answer.name}` }), SQ.ui.creditLine(photo));
      } else {
        photoBox = pixelPhoto(photo);
        photoBox.setLevel(used);
        photoEl = photoBox.el;
      }

      const exclude = new Set(game.g.filter(Boolean));
      const rows = h('ol.hd-rows', { 'aria-label': 'Your guesses' }, game.g.map((id, i) => guessRow(id, answer, i + 1, { animate: i === used - 1 && focusInput === 'guessed', links: over })));
      const wide = window.matchMedia('(min-width: 1024px)').matches;
      const clueList = h('ol.hd-clues', { 'aria-label': 'Clues' }, clues.map((c, i) => clueEl(c, i, {
        open: over || i <= used, expanded: wide || over || i === Math.min(used, 5), fresh: !over && i === used && used > 0, unmask: over, sp: answer,
      })));

      let entry = null;
      if (!over) {
        entry = box = guessBox({ exclude, guessesLeft: left, onGuess: (id) => guess(id) });
      }

      const playCol = h('div.hd-play', photoEl, rows.children.length ? rows : null, over ? result(answer) : entry.el);
      const clueCol = h('section.hd-cluecol', h('h2.sub-h', 'Clues', h('small', over ? 'all six, with the hidden words shown' : `${Math.min(used + 1, 6)} of 6 revealed`)), clueList);
      stage.append(status, h('div.hd-grid', playCol, clueCol));
      if (photoBox) photoBox.start();
      if (entry && focusInput === true && window.matchMedia('(hover: hover) and (pointer: fine)').matches) entry.focus();
      if (focusInput === 'guessed' && !over) {
        const fresh = clueList.querySelector('.hd-clue.fresh');
        if (entry) entry.focus();
        if (fresh && window.matchMedia('(max-width: 899.98px)').matches) setTimeout(() => fresh.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
      }
      if (focusInput === 'guessed' && over) {
        setTimeout(() => { const r = stage.querySelector('.hd-result'); if (r) r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 80);
        if (game.won && used <= 3) setTimeout(() => SQ.ui.confetti(), 250);
      }
    }

    function guess(id) {
      if (game.done) return;
      const answer = game.sp;
      if (id && game.g.includes(id)) return;
      game.g.push(id);
      if (id === answer) { game.done = true; game.won = true; }
      else if (game.g.length >= SQ.herpdle.MAX_GUESSES) { game.done = true; game.won = false; }
      if (game.done) finish();
      persist();
      board('guessed');
    }

    function finish() {
      game.points = SQ.herpdle.points(game.g.length, game.won);
      game.finishedAt = Date.now();
      setTimeout(() => {
        SQ.badges.evaluate({ game: 'herpdle', kind: game.kind, won: game.won, guesses: game.g.length, ranked: game.ranked ? 'saving' : 'off' })
          .forEach((b) => SQ.ui.toast(`Badge unlocked: ${b.name}`));
      }, 600);
      if (game.kind === 'practice') {
        st.pstats.played += 1;
        if (game.won) st.pstats.won += 1;
        st.recent = [game.sp].concat(st.recent.filter((x) => x !== game.sp)).slice(0, 25);
        return;
      }
      if (game.ranked && game.runId) {
        game.saving = true;
        const runId = game.runId, day = game.day, guesses = game.g.slice();
        SQ.api.submit(runId, { guesses }, { game: 'herpdle', day }).then((res) => {
          const s = load();
          const g = s.days[day];
          if (g) { g.saving = false; g.result = { points: res.points, rank: res.rank, streak: res.streak }; save(s); }
          st = s;
          if (alive && game && game.day === day) { game = g; board(false); }
        }).catch((e) => {
          const s = load();
          const g = s.days[day];
          if (g) { g.saving = false; g.saveError = e.queued ? 'queued' : (e.message || 'error'); save(s); }
          st = s;
          if (alive && game && game.day === day) { game = g; board(false); }
        });
      }
    }

    /* ----- after a game ----- */

    function result(answer) {
      const won = game.won, n = game.g.length;
      const lines = ['', 'Incredible! First go.', 'Brilliant, two goes.', 'Great work, three goes.', 'Nicely done, four goes.', 'Got there in five.', 'Phew! On the last go.'];
      let rankLine = null;
      if (game.kind === 'daily') {
        if (game.ranked) {
          if (game.saving) rankLine = h('p.hd-rank', SQ.ui.led('on blink'), 'Saving to the leaderboard…');
          else if (game.result && game.result.rank && game.result.rank.herpdle) {
            const r = game.result.rank.herpdle;
            rankLine = h('p.hd-rank', icon('trophy', { size: 16 }), h('span', `#${r.day} today`, r.week ? ` · #${r.week} this week` : '', r.all ? ` · #${r.all} all time` : ''), h('a', { href: '#/ranks?board=herpdle' }, 'Leaderboard'));
          } else if (game.saveError === 'queued') rankLine = h('p.hd-rank', icon('clock', { size: 16 }), 'Saved on this device. It will go on the leaderboard when you are back online.');
          else if (game.saveError) rankLine = h('p.hd-rank.bad', icon('warn', { size: 16 }), 'Not ranked: ' + game.saveError);
        } else {
          rankLine = h('p.hd-rank', icon('info', { size: 16 }), SQ.api.known() === 'off' ? 'Played on this device.' : 'This game was not ranked.');
        }
      }
      const stats = game.kind === 'daily' ? dailyStats(st) : null;
      clock = game.kind === 'daily' ? countdown() : null;
      const maxD = stats ? Math.max(1, ...stats.dist) : 1;
      const again = h('a.btn' + (game.kind === 'practice' ? '.btn-primary' : ''), {
        href: '#/herpdle?mode=practice',
        onclick: (e) => { if (game.kind === 'practice') { e.preventDefault(); st.practice = null; save(st); game = null; intro(); } },
      }, icon('redo', { size: 18 }), game.kind === 'practice' ? 'Another snake' : 'Practice more');

      return h('section.card.hd-result',
        h('p.legend', won ? `Solved in ${n}` : 'Out of guesses'),
        h('h2', won ? lines[n] : 'So close. It was…'),
        h('a.hd-answer', { href: '#/guide/' + answer.id },
          SQ.ui.thumb(answer),
          h('div', h('strong', answer.name), h('i.sci', answer.sci), h('div.badges', SQ.ui.venomBadge(answer, { short: true }), SQ.ui.big4Badge(answer))),
          icon('arrow', { size: 18 })),
        h('div.lcd.hd-points', SQ.ui.readout('Points', game.points || 0), stats ? SQ.ui.readout('Streak', stats.streak) : SQ.ui.readout('Practice solved', `${st.pstats.won}/${st.pstats.played}`)),
        rankLine,
        h('div.btn-row',
          h('button.btn' + (game.kind === 'daily' ? '.btn-primary' : ''), { type: 'button', onclick: () => SQ.ui.shareText(shareText(game), location.origin + location.pathname + '#/herpdle') }, icon('share', { size: 18 }), 'Share'),
          again,
          h('a.btn', { href: '#/guide/' + answer.id }, icon('book', { size: 18 }), 'Read about it')),
        stats ? h('div.hd-stats',
          h('div.hd-stat-nums', [['Played', stats.played], ['Solved', SQ.pct(stats.won, stats.played) + '%'], ['Streak', stats.streak], ['Best', stats.best]].map(([l, v]) => h('div', h('b', String(v)), h('span', l)))),
          h('p.legend', 'Guess distribution'),
          h('div.dist', stats.dist.map((v, i) => h('div.dist-row' + (won && n === i + 1 ? '.me' : ''), h('span.dist-n', String(i + 1)), h('span.dist-bar', h('i', { style: { width: Math.max(4, (100 * v) / maxD) + '%' } }, String(v))))))) : null,
        clock ? h('p.hd-next', 'Next Herpdle in ', clock.el) : null);
    }

    /* ----- open the right game ----- */

    if (practice) {
      if (st.practice && usable(st.practice)) { game = st.practice; board(false); } else { st.practice = null; intro(); }
    } else {
      const g = st.days[today];
      if (g && !g.remote && usable(g)) { game = g; board(false); } else intro();
    }

    return {
      node: root, title: practice ? 'Herpdle practice' : `Herpdle #${number}`, view: 'herpdle',
      cleanup: () => { alive = false; teardown(); },
    };
  };

  SQ.herpdleState = { load, save, dailyStats, shareText, howTo, usable };
})();
