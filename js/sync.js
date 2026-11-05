/* Keeps a signed-in player's progress on the server, so it follows them to other browsers and devices.
 *
 * What is shared: answers per species, totals, confusions, recent games, badges, reported photos, daily results and
 * Herpdle games (both areas). What stays on the device: settings, the photo "seen" history and any unfinished game.
 *
 * Merging never counts anything twice: counts are kept per device (js/store.js `dev`) and a merge keeps the larger
 * value of each device's count; lists are merged as unions. A reset (or restoring a backup) on one device starts a new
 * "epoch", and the newer epoch wins everywhere.
 *
 * The data on this device belongs to one account at most ("owner"). Progress made before signing in is carried into
 * the first account that signs in here; another account's progress is never mixed in, and signing out clears it.
 */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const HERPDLE_KEYS = { in: 'herpdle', na: 'herpdle-na' };
  const MAX_GAMES = 60;
  const MAX_FLAGGED = 2000;
  const MAX_RECENT = 40;
  const MAX_DAYS = 400;
  const MAX_DEVICES = 10;
  const STALE_DEVICE_MS = 365 * 86400000;

  const keys = (o) => Object.keys(o || {});
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

  const SAFE = (k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
  /** Per key, the larger of two values (combine decides how two values are merged). */
  function maxMap(a, b, combine = Math.max) {
    const out = {};
    Object.entries(a || {}).forEach(([k, v]) => { if (SAFE(k)) out[k] = v; });
    Object.entries(b || {}).forEach(([k, v]) => { if (SAFE(k)) out[k] = k in out ? combine(out[k], v) : v; });
    return out;
  }
  const maxTriple = (x, y) => [Math.max(x[0] || 0, y[0] || 0), Math.max(x[1] || 0, y[1] || 0), Math.max(x[2] || 0, y[2] || 0)];
  const lastDays = (days) => {
    const out = {};
    keys(days).sort().slice(-MAX_DAYS).forEach((k) => { out[k] = days[k]; });
    return out;
  };

  /** One area's Herpdle games: a finished game beats an unfinished one; practice counts are per device. */
  function mergeHerpdle(x, y) {
    if (!x) return y || null;
    if (!y) return x;
    const days = Object.assign({}, y.days || {});
    Object.entries(x.days || {}).forEach(([d, g]) => { if (!days[d] || (g && g.done) || !(days[d] && days[d].done)) days[d] = g; });
    const recent = Array.from(new Set([...(x.recent || []), ...(y.recent || [])])).slice(0, MAX_RECENT);
    const pdev = maxMap(x.pdev, y.pdev, (a, b) => ({ played: Math.max(a.played || 0, b.played || 0), won: Math.max(a.won || 0, b.won || 0) }));
    return { days: lastDays(days), recent, pdev, seenHelp: !!(x.seenHelp || y.seenHelp) };
  }

  /** Merges two copies of a player's progress (see the top of this file). */
  function merge(a, b) {
    if (!isObj(a)) return b;
    if (!isObj(b)) return a;
    if ((a.epoch || 0) !== (b.epoch || 0)) return (a.epoch || 0) > (b.epoch || 0) ? a : b;
    const dev = {};
    new Set([...keys(a.dev), ...keys(b.dev)]).forEach((id) => {
      const x = (a.dev || {})[id] || {}, y = (b.dev || {})[id] || {};
      dev[id] = {
        sp: maxMap(x.sp, y.sp, maxTriple),
        tot: maxMap(x.tot, y.tot),
        conf: maxMap(x.conf, y.conf),
        u: Math.max(x.u || 0, y.u || 0),
      };
    });
    const seen = new Set();
    const games = [...(a.games || []), ...(b.games || [])]
      .filter((g) => { const k = g && g.ts + '|' + g.mode; if (!g || seen.has(k)) return false; seen.add(k); return true; })
      .sort((x, y) => y.ts - x.ts).slice(0, MAX_GAMES);
    // a photo is reported unless it was restored after it was last reported (the later of the two wins)
    const unflagged = maxMap(a.unflagged, b.unflagged);
    const flagTimes = maxMap(a.flagTimes, b.flagTimes);
    const flagged = Array.from(new Set([...(a.flagged || []), ...(b.flagged || [])]))
      .filter((id) => !(unflagged[id] > (flagTimes[id] || 0))).slice(-MAX_FLAGGED);
    const herpdle = {};
    keys(HERPDLE_KEYS).forEach((area) => {
      const m = mergeHerpdle((a.herpdle || {})[area], (b.herpdle || {})[area]);
      if (m) herpdle[area] = m;
    });
    return {
      v: 2, epoch: a.epoch || 0, dev, games, flagged, unflagged, flagTimes,
      daily: lastDays(Object.assign({}, b.daily, a.daily)), dailyNa: lastDays(Object.assign({}, b.dailyNa, a.dailyNa)),
      badges: maxMap(a.badges, b.badges, Math.min), herpdle,
    };
  }

  /** Devices that have not been used for a year are folded into one slot, so the copy stays small. */
  function foldOld(doc) {
    const ids = keys(doc.dev).filter((id) => id !== 'old');
    if (ids.length <= MAX_DEVICES) return doc;
    const now = Date.now();
    const stale = ids.filter((id) => now - (doc.dev[id].u || 0) > STALE_DEVICE_MS && id !== SQ.store.deviceId());
    if (!stale.length) return doc;
    const old = doc.dev.old || { sp: {}, tot: {}, conf: {}, u: 0 };
    stale.forEach((id) => {
      const d = doc.dev[id];
      Object.entries(d.sp || {}).forEach(([k, v]) => { const o = old.sp[k] || [0, 0, 0]; old.sp[k] = [o[0] + (v[0] || 0), o[1] + (v[1] || 0), Math.max(o[2], v[2] || 0)]; });
      Object.entries(d.tot || {}).forEach(([k, v]) => { old.tot[k] = k === 'bestStreak' ? Math.max(old.tot[k] || 0, v || 0) : (old.tot[k] || 0) + (v || 0); });
      Object.entries(d.conf || {}).forEach(([k, v]) => { old.conf[k] = (old.conf[k] || 0) + (v || 0); });
      delete doc.dev[id];
    });
    doc.dev.old = old;
    return doc;
  }

  /* ----- this device's copy ----- */

  const blankDoc = () => ({ v: 2, epoch: 0, dev: {}, games: [], flagged: [], unflagged: {}, flagTimes: {}, daily: {}, dailyNa: {}, badges: {}, herpdle: {} });

  function readHerpdle(key) {
    const s = SQ.store.get(key, null);
    if (!isObj(s)) return null;
    const pdev = isObj(s.pdev) ? s.pdev : { [SQ.store.deviceId()]: Object.assign({ played: 0, won: 0 }, s.pstats) };
    return { days: s.days || {}, recent: s.recent || [], pdev, seenHelp: !!s.seenHelp };
  }

  /** A copy of the part of this device's data that is shared between the player's devices. */
  function snapshot() {
    const p = SQ.store.progress();
    const me = p.dev[SQ.store.deviceId()];
    // when this device was last used (for folding away devices unused for a year): updated at most twice a day,
    // so that a copy with nothing new in it is the same as the last one and need not be saved again
    if (me && Date.now() - (me.u || 0) > 12 * 3600000) me.u = Date.now();
    const herpdle = {};
    Object.entries(HERPDLE_KEYS).forEach(([area, key]) => { const x = readHerpdle(key); if (x) herpdle[area] = x; });
    return JSON.parse(JSON.stringify({
      v: 2, epoch: p.epoch || 0, dev: p.dev, games: p.games, flagged: p.flagged, unflagged: p.unflagged || {}, flagTimes: p.flagTimes || {},
      daily: p.daily.days, dailyNa: p.dailyNa.days, badges: p.badges, herpdle,
    }));
  }

  /** Writes a merged copy back to this device. */
  function apply(doc) {
    const p = SQ.store.progress();
    SQ.store.replaceProgress(Object.assign({}, p, {
      epoch: doc.epoch || 0, dev: doc.dev || {}, games: doc.games || [], flagged: doc.flagged || [], unflagged: doc.unflagged || {}, flagTimes: doc.flagTimes || {},
      badges: doc.badges || {}, daily: Object.assign({}, p.daily, { days: doc.daily || {} }), dailyNa: Object.assign({}, p.dailyNa, { days: doc.dailyNa || {} }),
    }));
    Object.entries(HERPDLE_KEYS).forEach(([area, key]) => {
      const x = (doc.herpdle || {})[area];
      if (!x) return;
      const cur = SQ.store.get(key, null) || {};
      const pstats = { played: 0, won: 0 };
      Object.values(x.pdev || {}).forEach((d) => { pstats.played += d.played || 0; pstats.won += d.won || 0; });
      SQ.store.set(key, Object.assign({}, cur, { days: x.days || {}, recent: x.recent || [], pdev: x.pdev || {}, pstats, seenHelp: !!x.seenHelp }));
    });
    window.dispatchEvent(new Event('sarpa-progress'));
  }

  /** Clears the shared data on this device (signing out): it is safe on the server. */
  function clearLocal() {
    const blank = Object.assign(SQ.store.blankProgress(), { epoch: SQ.store.progress().epoch || 0 });
    SQ.store.replaceProgress(blank);
    Object.values(HERPDLE_KEYS).forEach((key) => SQ.store.remove(key));
    SQ.store.remove('last');
    SQ.store.remove('owner');
    window.dispatchEvent(new Event('sarpa-progress'));
  }

  /* ----- talking to the server ----- */

  let busy = null, timer = null, again = false, dirty = false, lastSaved = '';

  /** JSON with every object's keys in order, so that two equal copies always give the same text. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (isObj(v)) return '{' + keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }

  /**
   * Fetches the server's copy, merges it with this device's and saves the result in both places. Resolves true when
   * the two are in step (or there is nothing to do), false when the server could not be reached.
   */
  function sync() {
    if (busy) { again = true; return busy; }
    const s = SQ.api.session();
    if (!s || !SQ.api.known || SQ.api.known() === 'off') return Promise.resolve(true);
    busy = (async () => {
      try {
        const me = String(s.name).toLowerCase();
        const remote = await SQ.api.request('progress');
        const owner = SQ.store.get('owner', null);
        // another account's progress on this device is never mixed into this one: start from nothing instead
        const local = owner && owner !== me ? blankDoc() : snapshot();
        let doc = foldOld(merge(local, remote.doc) || local);
        let rev = remote.rev || 0;
        for (let tries = 0; tries < 3; tries++) {
          const text = stable(doc);
          if (text === stable(remote.doc) && owner === me) break;      // already in step
          try {
            const res = await SQ.api.request('progress', { method: 'POST', body: { doc, rev } });
            rev = res.rev;
            lastSaved = text;
            break;
          } catch (e) {
            if (e.code !== 'progress_conflict' || !e.data) throw e;
            // another device saved in between: merge with that and try again
            doc = foldOld(merge(doc, e.data.doc));
            rev = e.data.rev || 0;
          }
        }
        // the player may have played on while the server answered: merge that in again, so nothing is lost
        const latest = owner && owner !== me ? blankDoc() : snapshot();
        const merged = foldOld(merge(latest, doc) || doc);
        SQ.store.set('owner', me);
        dirty = false;
        // only rewrite this device's copy (and redraw) when something came from elsewhere
        if (owner !== me || stable(merged) !== stable(latest)) apply(merged);
        if (stable(merged) !== stable(doc)) soon();          // and save what was added meanwhile
        return true;
      } catch (e) {
        if (e.code === 'signed_out' || e.code === 'no_api' || e.code === 'no_store') return true;
        return false;
      } finally {
        busy = null;
        if (again) { again = false; setTimeout(sync, 0); }
      }
    })();
    return busy;
  }

  /** Saves soon after something changed (several changes in a row are saved together). */
  function soon(ms = 2500) {
    if (!SQ.api || !SQ.api.session()) return;
    clearTimeout(timer);
    timer = setTimeout(sync, ms);
  }

  /** Notes a change that is saved with the next save rather than straight away (every answer in a quiz). */
  function later() { dirty = true; }

  /** Saves what is left before the account signs out on this device. Resolves false if that did not work. */
  async function beforeSignOut() {
    clearTimeout(timer);
    if (busy) await busy;            // a save that started earlier may not have everything in it
    return sync();
  }

  SQ.sync = { merge, snapshot, apply, sync, soon, later, beforeSignOut, clearLocal, foldOld, _lastSaved: () => lastSaved };

  // save before the page goes away, and catch up when it comes back
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && (timer || dirty)) { clearTimeout(timer); timer = null; sync(); }
    else if (document.visibilityState === 'visible') soon(400);
  });
})();
