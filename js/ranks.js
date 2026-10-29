/* Leaderboards: Sarpa daily, Herpdle and ranked-quiz points, for a day, a week or all time. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const BOARDS = [
    { id: 'sarpa-daily', label: 'Sarpa daily', sub: 'Ten photos a day', ico: 'calendar', play: '#/daily' },
    { id: 'herpdle', label: 'Herpdle', sub: 'The daily clue game', ico: 'grid', play: '#/herpdle' },
    { id: 'sarpa-points', label: 'Quiz points', sub: 'Every ranked quiz', ico: 'zap', play: '#/play' },
  ];
  const PERIODS = [{ value: 'day', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'all', label: 'All time' }];
  const MAX_BACK = 120;

  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

  /** The small print under a score, e.g. "8/10 · 0:45" or "3 guesses · 1:12". */
  function detailText(board, e) {
    const d = e.detail;
    if (!d) return e.seconds != null ? mmss(e.seconds) : '';
    if (board === 'herpdle') return d.w ? `${d.g} ${d.g === 1 ? 'guess' : 'guesses'} · ${mmss(d.s)}` : `not solved · ${mmss(d.s)}`;
    return `${d.c}/${d.n} right · ${mmss(d.s)}`;
  }

  SQ.views.ranks = function ({ query }) {
    const today = SQ.todayKey();
    let board = BOARDS.some((b) => b.id === query.get('board')) ? query.get('board') : 'sarpa-daily';
    let period = PERIODS.some((p) => p.value === query.get('period')) ? query.get('period') : 'day';
    let day = query.get('day');
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || SQ.time.dayIndex(today) - SQ.time.dayIndex(day) > MAX_BACK) day = today;
    let token = 0;

    const out = h('div.lb-out', { 'aria-live': 'polite' });
    const dayNav = h('div.lb-daynav');
    const periodBox = h('div.lb-periods');
    const boardBox = h('div.lb-boards', { role: 'radiogroup', 'aria-label': 'Leaderboard' });

    function syncUrl() {
      const q = new URLSearchParams({ board, period });
      if (period === 'day' && day !== today) q.set('day', day);
      try { history.replaceState(null, '', '#/ranks?' + q.toString()); } catch (e) { /* ignore */ }
    }

    function drawControls() {
      SQ.clear(boardBox);
      BOARDS.forEach((b) => {
        const on = b.id === board;
        boardBox.appendChild(h('button.lb-board' + (on ? '.on' : ''), {
          type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          onclick: () => { board = b.id; refresh(); },
        }, h('span.lb-board-top', icon(b.ico, { size: 18 }), SQ.ui.led(on ? 'on' : '')), h('strong', b.label), h('small', b.sub)));
      });
      SQ.clear(periodBox);
      periodBox.appendChild(SQ.ui.segmented({
        name: 'Period', value: period, options: PERIODS,
        onChange: (v) => { period = v; if (v !== 'day') day = today; refresh(); },
      }));
      SQ.clear(dayNav);
      dayNav.hidden = period !== 'day';
      if (period === 'day') {
        const back = SQ.time.dayIndex(today) - SQ.time.dayIndex(day);
        dayNav.append(
          h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Previous day', disabled: back >= MAX_BACK, onclick: () => { day = SQ.time.shiftDay(day, -1); refresh(); } }, icon('left', { size: 16 })),
          h('span.lb-day', day === today ? 'Today' : day === SQ.time.shiftDay(today, -1) ? 'Yesterday' : SQ.time.label(day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })),
          h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Next day', disabled: day >= today, onclick: () => { day = SQ.time.shiftDay(day, 1); refresh(); } }, icon('right', { size: 16 })));
      }
    }

    function row(e, me, isMe) {
      const pts = h('b.lb-pts', (e.points || 0).toLocaleString());
      return h('li.lb-row' + (isMe ? '.me' : '') + (e.rank <= 3 ? '.top' + e.rank : ''),
        h('span.lb-rank', h('b.lcd-num', String(e.rank))),
        h('span.lb-name', e.name, isMe ? h('span.badge.you', 'You') : null),
        h('span.lb-score', pts, h('small', period === 'day' && board !== 'sarpa-points' ? detailText(board, e) : 'points')));
    }

    async function load() {
      const my = ++token;
      SQ.clear(out);
      out.appendChild(h('div.lb-loading', SQ.ui.led('on blink'), 'Loading the leaderboard…'));
      const state = await SQ.api.status();
      if (my !== token) return;
      if (state === 'off') {
        SQ.clear(out);
        out.appendChild(SQ.ui.empty('Leaderboards are not switched on', 'This copy of Sarpa has no accounts database yet, so games are played on this device only. The README explains how to add one.'));
        return;
      }
      try {
        const lb = await SQ.api.leaderboard(board, period, period === 'day' ? day : '');
        if (my !== token) return;
        SQ.clear(out);
        const meta = BOARDS.find((b) => b.id === board);
        const user = SQ.api.user();
        const whenText = period === 'day' ? (day === today ? 'today' : SQ.time.label(day, { day: 'numeric', month: 'long' })) : period === 'week' ? `week ${lb.week.split('-W')[1]} (Mon to Sun, India time)` : 'all time';
        out.appendChild(h('div.lb-head',
          h('h2', meta.label, h('small', ` · ${whenText}`)),
          h('p.legend', `${lb.total.toLocaleString()} ${lb.total === 1 ? 'player' : 'players'}`)));
        if (!lb.entries.length) {
          out.appendChild(h('div.card.lb-empty',
            h('p', period === 'day' && day === today ? 'Nobody is on this board yet today. Be the first!' : 'Nobody played in this period.'),
            h('a.btn.btn-primary', { href: meta.play }, icon('play', { size: 18 }), 'Play now')));
          return;
        }
        const list = h('ol.lb-list', lb.entries.map((e) => row(e, lb.me, user && e.name === user.name)));
        out.appendChild(list);
        if (lb.me && !lb.entries.some((e) => e.name === lb.me.name)) {
          out.appendChild(h('ol.lb-list.lb-mine', { 'aria-label': 'Your place' }, row(lb.me, lb.me, true)));
        }
        if (!user && SQ.api.known() === 'ok') {
          out.appendChild(h('p.lb-note', icon('user', { size: 15 }), h('span', h('button.link-btn', { type: 'button', onclick: () => SQ.account.open({}).then((ok) => ok && load()) }, 'Sign in'), ' to see your own place.')));
        }
        out.appendChild(h('p.lb-note.muted', icon('info', { size: 15 }), h('span', board === 'sarpa-points'
          ? 'Points from every ranked quiz, up to 20 quizzes a day. Days and weeks follow India time.'
          : 'One game per player per day. Equal points are split by time taken. Days follow India time (midnight IST).')));
      } catch (e) {
        if (my !== token) return;
        SQ.clear(out);
        out.appendChild(SQ.ui.empty('Could not load the leaderboard', e.code === 'network' ? 'You seem to be offline.' : e.message,
          h('button.btn', { type: 'button', onclick: load }, icon('redo', { size: 18 }), 'Try again')));
      }
    }

    function refresh() { drawControls(); syncUrl(); load(); }

    const onAuth = () => load();
    window.addEventListener('sarpa-auth', onAuth);

    const node = h('div.page.wrap.ranks',
      SQ.ui.pageHead('Leaderboards', 'Daily, weekly and all-time rankings. Everyone plays the same daily puzzles.',
        h('button.btn.btn-sm', { type: 'button', onclick: () => load(), 'aria-label': 'Refresh' }, icon('redo', { size: 16 }), 'Refresh'), [h('b', '04'), 'Ranks']),
      boardBox,
      h('div.lb-controls', periodBox, dayNav),
      out);
    refresh();
    return { node, title: 'Leaderboards', view: 'ranks', cleanup: () => { token++; window.removeEventListener('sarpa-auth', onAuth); } };
  };
})();
