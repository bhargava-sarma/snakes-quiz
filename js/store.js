/* Everything the player keeps on their own device (localStorage, with an in-memory fallback). For a signed-in player,
 * js/sync.js also keeps a copy on the server, so it follows them to other browsers.
 *
 * Counts that can grow on several devices (answers per species, totals, confusions) are kept twice: once added up,
 * for the pages that show them, and once per device in `dev`, so that two devices' progress can be merged without
 * counting anything twice (each device only ever adds to its own slot; a merge keeps the larger value of each). */
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
    area: 'in',           // in (India) | na (North America) | mix (both)
    region: 'all',        // a state or province within the area, or all
    preferUnseen: true,
  };

  const MAX_DAYS = 400;   // daily results kept per area

  const blankTotals = () => ({ answered: 0, correct: 0, games: 0, points: 0, bestStreak: 0, seconds: 0 });
  const blankDaily = () => ({ days: {}, streak: 0, best: 0, last: null });
  const blankProgress = () => ({
    v: 2,
    species: {},          // id -> { s: seen, c: correct, t: last timestamp }   (added up over all devices)
    totals: blankTotals(),
    games: [],
    seen: {},             // photoId -> game counter when last shown            (this device only)
    gameCounter: 0,       //                                                     (this device only)
    flagged: [],
    confusions: {},       // "correctId>chosenId" -> times
    daily: blankDaily(),  // the India daily challenge
    dailyNa: blankDaily(),// the North America daily challenge
    badges: {},
    dev: {},              // deviceId -> { sp: { id: [s, c, t] }, tot: totals, conf: { key: n } }
    epoch: 0,             // when the progress was last reset (a reset on one device clears all of them)
  });

  /** A random id for this browser, so its counts can be told apart from other devices'. */
  function deviceId() {
    let id = read('device', null);
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
      // random only: nothing about the device or the time is in it
      const bytes = window.crypto && crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(14))) : Array.from({ length: 14 }, () => Math.floor(Math.random() * 256));
      id = bytes.map((n) => (n % 36).toString(36)).join('');
      write('device', id);
    }
    return id;
  }

  /** Puts the device slots' counts back together into the added-up fields. */
  function recount(p) {
    const species = {}, confusions = {}, totals = blankTotals();
    Object.values(p.dev || {}).forEach((d) => {
      Object.entries(d.sp || {}).forEach(([id, [sn, c, t]]) => {
        const r = (species[id] = species[id] || { s: 0, c: 0, t: 0 });
        r.s += sn || 0; r.c += c || 0; r.t = Math.max(r.t, t || 0);
      });
      Object.entries(d.conf || {}).forEach(([k, n]) => { confusions[k] = (confusions[k] || 0) + (n || 0); });
      const tot = d.tot || {};
      ['answered', 'correct', 'games', 'points', 'seconds'].forEach((k) => { totals[k] += tot[k] || 0; });
      totals.bestStreak = Math.max(totals.bestStreak, tot.bestStreak || 0);
    });
    p.species = species; p.confusions = confusions; p.totals = totals;
  }

  /** Streaks and the last day played, worked out again from the saved days. */
  function restreak(d) {
    const days = Object.keys(d.days).sort();
    days.slice(0, Math.max(0, days.length - MAX_DAYS)).forEach((k) => delete d.days[k]);
    let streak = 0, best = 0, prev = null;
    Object.keys(d.days).sort().forEach((k) => {
      streak = prev && SQ.time.shiftDay(prev, 1) === k ? streak + 1 : 1;
      best = Math.max(best, streak);
      prev = k;
    });
    d.streak = streak; d.best = Math.max(best, d.best || 0); d.last = prev;
  }

  let progress = null;
  function P() {
    if (!progress) {
      const saved = read('progress', null);
      progress = Object.assign(blankProgress(), saved || {});
      progress.totals = Object.assign(blankTotals(), progress.totals || {});
      progress.daily = Object.assign(blankDaily(), progress.daily || {});
      progress.dailyNa = Object.assign(blankDaily(), progress.dailyNa || {});
      if (!progress.dev || typeof progress.dev !== 'object') progress.dev = {};
      if (!progress.dev[deviceId()]) {
        // progress from before devices were counted apart (or a new device): it all belongs to this device
        const counted = Object.keys(progress.dev).length > 0;
        progress.dev[deviceId()] = counted ? { sp: {}, tot: blankTotals(), conf: {} } : {
          sp: Object.fromEntries(Object.entries(progress.species || {}).map(([id, r]) => [id, [r.s || 0, r.c || 0, r.t || 0]])),
          tot: Object.assign(blankTotals(), progress.totals),
          conf: Object.assign({}, progress.confusions || {}),
        };
      }
      progress.v = 2;
      recount(progress);
    }
    return progress;
  }
  const mine = () => P().dev[deviceId()];
  // how a change reaches the account: 'now' (saved a few seconds later), 'later' (with the next save, or when the page is
  // hidden; every answer in a quiz), or not at all (what stays on this device, such as the photos already seen)
  const save = (synced) => {
    write('progress', P());
    if (SQ.sync && synced) { if (synced === 'later') SQ.sync.later(); else SQ.sync.soon(); }
  };
  const dailyOf = (area) => (area === 'na' ? P().dailyNa : P().daily);

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
    deviceId,
    blankProgress,
    recount,
    restreak,
    /** Replaces the saved progress (after a merge with the server's copy, or a backup). */
    replaceProgress(next) {
      const keep = progress ? { seen: progress.seen, gameCounter: progress.gameCounter } : {};
      progress = Object.assign(blankProgress(), next, keep);
      progress.dev = progress.dev || {};
      if (!progress.dev[deviceId()]) progress.dev[deviceId()] = { sp: {}, tot: blankTotals(), conf: {} };
      recount(progress);
      restreak(progress.daily); restreak(progress.dailyNa);
      save();
    },

    /* ----- answers ----- */
    recordAnswer({ speciesId, photoId, correct, chosenId }) {
      const p = P(), d = mine();
      const now = Date.now();
      const s = (p.species[speciesId] = p.species[speciesId] || { s: 0, c: 0, t: 0 });
      const ds = (d.sp[speciesId] = d.sp[speciesId] || [0, 0, 0]);
      s.s += 1; ds[0] += 1;
      if (correct) { s.c += 1; ds[1] += 1; }
      s.t = now; ds[2] = now;
      p.totals.answered += 1; d.tot.answered += 1;
      if (correct) { p.totals.correct += 1; d.tot.correct += 1; }
      if (!correct && chosenId) {
        const key = speciesId + '>' + chosenId;
        p.confusions[key] = (p.confusions[key] || 0) + 1;
        d.conf[key] = (d.conf[key] || 0) + 1;
      }
      p.seen[photoId] = p.gameCounter;
      save('later');
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
      const p = P(), d = mine();
      for (const t of [p.totals, d.tot]) {
        t.games += 1;
        t.points += summary.points || 0;
        t.seconds += summary.seconds || 0;
        t.bestStreak = Math.max(t.bestStreak, summary.bestStreak || 0);
      }
      p.games.unshift({
        ts: Date.now(), mode: summary.mode, n: summary.n, correct: summary.correct,
        points: summary.points, sec: Math.round(summary.seconds || 0), diff: summary.difficulty,
        area: summary.area || 'in', region: summary.region, timer: summary.timer, streak: summary.bestStreak,
      });
      p.games.length = Math.min(p.games.length, MAX_GAMES);
      save(true);
    },

    /** A finished daily challenge, in its area ('in' or 'na'). */
    recordDaily(dateKey, result, area) {
      const d = dailyOf(area);
      if (d.days[dateKey]) return d.days[dateKey];
      d.days[dateKey] = result;
      restreak(d);
      save(true);
      return result;
    },
    dailyResult(dateKey, area) { return dailyOf(area).days[dateKey] || null; },
    dailyStreak(area) {
      const d = dailyOf(area);
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
      p.flagTimes = Object.assign({}, p.flagTimes, { [id]: Date.now() });      // later than any earlier "restore"
      if (!p.flagged.includes(id)) p.flagged.push(id);
      save(true);
    },
    unflagPhoto(id) {
      const p = P();
      p.flagged = p.flagged.filter((x) => x !== id);
      p.unflagged = Object.assign({}, p.unflagged, { [id]: Date.now() });      // so a merge does not bring it back
      save(true);
    },
    isFlagged(id) { return P().flagged.includes(id); },
    flaggedList() { return P().flagged.slice(); },

    /* ----- badges ----- */
    awardBadge(id) {
      const p = P();
      if (p.badges[id]) return false;
      p.badges[id] = Date.now();
      save(true);
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
      return JSON.stringify({ app: 'sarpa', v: 2, settings: this.settings(), progress: P(), herpdle: read('herpdle', null), herpdleNa: read('herpdle-na', null) }, null, 1);
    },
    /** Restores a backup. It replaces the progress everywhere (like a reset followed by the backup's progress). */
    importAll(text) {
      let data = null;
      try { data = JSON.parse(text); } catch (e) { /* reported below */ }
      if (!data || data.app !== 'sarpa' || !data.progress || typeof data.progress !== 'object' || Array.isArray(data.progress)) throw new Error('This file is not a Sarpa backup.');
      write('settings', Object.assign({}, DEFAULT_SETTINGS, data.settings || {}));
      // the backup's counts become this device's, under a new reset time
      const old = data.progress;
      progress = null;
      write('progress', Object.assign({}, old, { dev: {}, epoch: Date.now() }));
      P();
      if (data.herpdle && typeof data.herpdle === 'object') write('herpdle', data.herpdle);
      if (data.herpdleNa && typeof data.herpdleNa === 'object') write('herpdle-na', data.herpdleNa);
      save(true);
    },
    resetAll() {
      progress = Object.assign(blankProgress(), { epoch: Date.now() });
      progress.dev[deviceId()] = { sp: {}, tot: blankTotals(), conf: {} };
      save(true);
      remove('session');
      remove('herpdle');
      remove('herpdle-na');
      remove('last');
    },
  };
})();
