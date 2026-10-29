/* Everything the player keeps on their own device (localStorage, with an in-memory fallback). */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const PREFIX = 'sarpa.v1.';
  const mem = {};
  const MAX_SEEN = 6000;
  const MAX_GAMES = 60;

  function read(key, def) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw == null) return key in mem ? mem[key] : def;
      return JSON.parse(raw);
    } catch (e) {
      return key in mem ? mem[key] : def;
    }
  }

  function write(key, value) {
    mem[key] = value;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) { /* private mode / quota: keep the in-memory copy */ }
  }

  function remove(key) {
    delete mem[key];
    try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  const DEFAULT_SETTINGS = {
    theme: 'auto',        // auto | light | dark
    showSci: true,        // show scientific names on the answer buttons
    hints: true,
    timer: 0,             // seconds per question, 0 = off
    count: 20,
    difficulty: 'beginner',
    region: 'all',
    preferUnseen: true,
  };

  const blankProgress = () => ({
    v: 1,
    species: {},          // id -> { s: seen, c: correct, t: last timestamp }
    totals: { answered: 0, correct: 0, games: 0, points: 0, bestStreak: 0, seconds: 0 },
    games: [],
    seen: {},             // photoId -> game counter when last shown
    gameCounter: 0,
    flagged: [],
    confusions: {},       // "correctId>chosenId" -> times
    daily: { days: {}, streak: 0, best: 0, last: null },
    badges: {},
  });

  let progress = null;
  function P() {
    if (!progress) {
      const saved = read('progress', null);
      progress = Object.assign(blankProgress(), saved || {});
      progress.totals = Object.assign(blankProgress().totals, progress.totals || {});
      progress.daily = Object.assign(blankProgress().daily, progress.daily || {});
    }
    return progress;
  }
  const save = () => write('progress', P());

  SQ.store = {
    /** Plain storage for other modules (Herpdle, the account): store.get('herpdle', {}) */
    get: read,
    set: write,
    remove,

    settings() {
      return Object.assign({}, DEFAULT_SETTINGS, read('settings', {}));
    },
    saveSettings(patch) {
      const next = Object.assign(this.settings(), patch);
      write('settings', next);
      return next;
    },

    progress: P,

    /* ----- answers ----- */
    recordAnswer({ speciesId, photoId, correct, chosenId }) {
      const p = P();
      const s = (p.species[speciesId] = p.species[speciesId] || { s: 0, c: 0, t: 0 });
      s.s += 1;
      if (correct) s.c += 1;
      s.t = Date.now();
      p.totals.answered += 1;
      if (correct) p.totals.correct += 1;
      if (!correct && chosenId) {
        const key = speciesId + '>' + chosenId;
        p.confusions[key] = (p.confusions[key] || 0) + 1;
      }
      p.seen[photoId] = p.gameCounter;
      save();
    },

    markSeen(photoId) {
      const p = P();
      p.seen[photoId] = p.gameCounter;
      const ids = Object.keys(p.seen);
      if (ids.length > MAX_SEEN) {
        ids.sort((a, b) => p.seen[a] - p.seen[b]);
        ids.slice(0, ids.length - MAX_SEEN + 500).forEach((id) => delete p.seen[id]);
      }
      save();
    },

    /** A plain number per photo: how recently (in games) it was shown. */
    seenMap() { return P().seen; },
    nextGameNumber() { const p = P(); p.gameCounter += 1; save(); return p.gameCounter; },

    recordGame(summary) {
      const p = P();
      p.totals.games += 1;
      p.totals.points += summary.points || 0;
      p.totals.seconds += summary.seconds || 0;
      p.totals.bestStreak = Math.max(p.totals.bestStreak, summary.bestStreak || 0);
      p.games.unshift({
        ts: Date.now(), mode: summary.mode, n: summary.n, correct: summary.correct,
        points: summary.points, sec: Math.round(summary.seconds || 0), diff: summary.difficulty,
        region: summary.region, timer: summary.timer, streak: summary.bestStreak,
      });
      p.games.length = Math.min(p.games.length, MAX_GAMES);
      save();
    },

    recordDaily(dateKey, result) {
      const p = P();
      const d = p.daily;
      if (d.days[dateKey]) return d.days[dateKey];
      d.days[dateKey] = result;
      if (d.last && d.last > dateKey) { save(); return result; }      // an older day finished late: keep the streak as it is
      d.streak = d.last === SQ.time.shiftDay(dateKey, -1) ? d.streak + 1 : d.last === dateKey ? d.streak : 1;
      d.best = Math.max(d.best, d.streak);
      d.last = dateKey;
      save();
      return result;
    },
    dailyResult(dateKey) { return P().daily.days[dateKey] || null; },
    dailyStreak() {
      const d = P().daily;
      const today = SQ.todayKey();
      return d.last === today || d.last === SQ.time.shiftDay(today, -1) ? d.streak : 0;
    },

    /* ----- mastery ----- */
    speciesRecord(id) { return P().species[id] || { s: 0, c: 0, t: 0 }; },

    /** 0 = never seen, 1 = learning, 2 = getting there, 3 = mastered */
    mastery(id) {
      const r = this.speciesRecord(id);
      if (!r.s) return 0;
      const acc = r.c / r.s;
      if (r.s >= 4 && acc >= 0.85) return 3;
      if (r.s >= 2 && acc >= 0.6) return 2;
      return 1;
    },

    weakSpecies(ids, limit = 20) {
      return ids
        .map((id) => ({ id, r: this.speciesRecord(id) }))
        .filter((x) => x.r.s >= 1 && x.r.c / x.r.s < 0.75)
        .sort((a, b) => a.r.c / a.r.s - b.r.c / b.r.s || b.r.s - a.r.s)
        .slice(0, limit)
        .map((x) => x.id);
    },

    topConfusions(limit = 5) {
      return Object.entries(P().confusions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k, n]) => { const [a, b] = k.split('>'); return { correct: a, chosen: b, n }; });
    },

    /* ----- flagged photos ----- */
    flagPhoto(id) {
      const p = P();
      if (!p.flagged.includes(id)) { p.flagged.push(id); save(); }
    },
    unflagPhoto(id) {
      const p = P();
      p.flagged = p.flagged.filter((x) => x !== id);
      save();
    },
    isFlagged(id) { return P().flagged.includes(id); },
    flaggedList() { return P().flagged.slice(); },

    /* ----- badges ----- */
    awardBadge(id) {
      const p = P();
      if (p.badges[id]) return false;
      p.badges[id] = Date.now();
      save();
      return true;
    },
    badges() { return Object.assign({}, P().badges); },

    /* ----- an unfinished quiz, so a refresh does not lose it ----- */
    saveSession(s) { write('session', s); },
    loadSession() { return read('session', null); },
    clearSession() { remove('session'); },

    /* ----- the most recent finished quiz, for the results page ----- */
    saveLastResult(r) { write('last', r); },
    loadLastResult() { return read('last', null); },

    /* ----- backup ----- */
    exportAll() {
      return JSON.stringify({ app: 'sarpa', v: 1, settings: this.settings(), progress: P(), herpdle: read('herpdle', null) }, null, 1);
    },
    importAll(text) {
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* reported below */ }
      if (!data || data.app !== 'sarpa' || !data.progress || typeof data.progress !== 'object') throw new Error('This file is not a Sarpa backup.');
      write('settings', Object.assign({}, DEFAULT_SETTINGS, data.settings || {}));
      progress = null;
      write('progress', data.progress);
      P();
      if (data.herpdle && typeof data.herpdle === 'object') write('herpdle', data.herpdle);
      save();
    },
    resetAll() {
      progress = blankProgress();
      remove('progress');
      remove('session');
      remove('herpdle');
      remove('last');
    },
  };
})();
