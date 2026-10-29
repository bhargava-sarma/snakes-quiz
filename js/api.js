/* Talking to the accounts-and-leaderboards API (api/sarpa.js). Everything here fails softly: without the API the
 * games still work, they just are not ranked. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const CFG = window.SQ_CONFIG || {};
  const BASE = CFG.apiBase || '/api/sarpa';

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code || 'error';
    }
  }

  /* ----- the signed-in account (kept on this device) ----- */

  function session() {
    const s = SQ.store.get('auth', null);
    return s && typeof s.token === 'string' && s.name ? s : null;
  }
  const emit = () => window.dispatchEvent(new Event('sarpa-auth'));
  function setSession(token, user) {
    SQ.store.set('auth', { token, name: user.name, created: user.created || 0, at: Date.now() });
    emit();
  }
  function clearSession() {
    if (!SQ.store.get('auth', null)) return;
    SQ.store.remove('auth');
    emit();
  }

  /* ----- requests ----- */

  async function request(action, { method = 'GET', body, query, auth = true, timeout = 12000 } = {}) {
    const params = new URLSearchParams({ action });
    Object.entries(query || {}).forEach(([k, v]) => { if (v != null && v !== '') params.set(k, v); });
    const headers = { Accept: 'application/json' };
    const s = auth ? session() : null;
    if (s) headers.Authorization = 'Bearer ' + s.token;
    if (body) headers['Content-Type'] = 'application/json';
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    let res;
    try {
      res = await fetch(BASE + '?' + params.toString(), {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined, cache: 'no-store', credentials: 'omit',
      });
    } catch (e) {
      throw new ApiError(navigator.onLine === false ? 'You are offline.' : 'Could not reach the Sarpa server.', 0, 'network');
    } finally {
      if (timer) clearTimeout(timer);
    }
    let json = null;
    if ((res.headers.get('content-type') || '').includes('application/json')) {
      try { json = await res.json(); } catch (e) { json = null; }
    }
    if (!json) {
      // a static copy of the site (no API at all) answers with a 404 page
      if (res.status === 404 || res.status === 405) throw new ApiError('Accounts are not available on this site.', res.status, 'no_api');
      throw new ApiError('The Sarpa server is not answering properly. Please try again later.', res.status, 'bad_response');
    }
    if (!res.ok) {
      if (res.status === 401 && json.code === 'signed_out' && s) clearSession();
      throw new ApiError(json.error || 'Something went wrong.', res.status, json.code);
    }
    return json;
  }

  /* ----- is the API there? ----- */

  let health = null;
  let healthing = null;

  /**
   * 'ok' (accounts and leaderboards work), 'off' (this copy of the site has none) or 'down' (they exist but cannot
   * be reached right now). Cached for a few minutes.
   */
  function status(force) {
    const fresh = health && Date.now() - health.at < (health.state === 'ok' ? 5 * 60000 : health.state === 'off' ? 30 * 60000 : 20000);
    if (!force && fresh) return Promise.resolve(health.state);
    if (!healthing) {
      healthing = request('health', { auth: false, timeout: 7000 })
        .then((j) => ({ state: j.accounts ? 'ok' : 'off', day: j.day, offset: (j.now || Date.now()) - Date.now() }))
        .catch((e) => ({ state: e.code === 'no_api' ? 'off' : 'down' }))
        .then((h) => {
          const changed = !health || health.state !== h.state;
          health = Object.assign(h, { at: Date.now() });
          healthing = null;
          if (changed) emit();
          return health.state;
        });
    }
    return healthing;
  }
  /** The last known state, without asking ('unknown' before the first answer). */
  const known = () => (health ? health.state : 'unknown');

  /* ----- games that could not be saved (offline): kept and sent again later ----- */

  const outbox = () => SQ.store.get('outbox', []);
  const saveOutbox = (list) => SQ.store.set('outbox', list.slice(-20));

  async function submit(runId, payload, meta) {
    try {
      const res = await request('submit', { method: 'POST', body: Object.assign({ runId }, payload) });
      return res;
    } catch (e) {
      if (e.code === 'network' || e.code === 'bad_response' || e.code === 'store_error' || e.status >= 500) {
        const list = outbox().filter((x) => x.runId !== runId);
        list.push({ runId, payload, meta: meta || {}, at: Date.now() });
        saveOutbox(list);
        e.queued = true;
      }
      throw e;
    }
  }

  let flushing = false;
  async function flush() {
    if (flushing || !session()) return;
    const list = outbox();
    if (!list.length) return;
    flushing = true;
    const keep = [];
    let saved = 0;
    for (const item of list) {
      if (Date.now() - item.at > 36 * 3600 * 1000) continue;        // runs expire on the server
      try {
        const res = await request('submit', { method: 'POST', body: Object.assign({ runId: item.runId }, item.payload) });
        saved++;
        window.dispatchEvent(new CustomEvent('sarpa-saved', { detail: { meta: item.meta, result: res } }));
      } catch (e) {
        if (e.code === 'network' || e.code === 'bad_response' || e.status >= 500) keep.push(item);
        if (e.code === 'network') { keep.push(...list.slice(list.indexOf(item) + 1)); break; }
      }
    }
    saveOutbox(keep);
    flushing = false;
    if (saved && SQ.ui) SQ.ui.toast(saved === 1 ? 'Your earlier game was saved to the leaderboard.' : `${saved} earlier games were saved to the leaderboard.`);
  }

  SQ.api = {
    ApiError,
    session,
    user: () => { const s = session(); return s ? { name: s.name, created: s.created } : null; },
    status,
    known,
    request,

    async signup(username, pin) {
      const j = await request('signup', { method: 'POST', body: { username, pin }, auth: false });
      setSession(j.token, j.user);
      status(true);
      return j.user;
    },
    async login(username, pin) {
      const j = await request('login', { method: 'POST', body: { username, pin }, auth: false });
      setSession(j.token, j.user);
      flush();
      return j.user;
    },
    async logout() {
      try { await request('logout', { method: 'POST', body: {}, timeout: 6000 }); } catch (e) { /* signed out here either way */ }
      clearSession();
    },
    changePin: (pin, newPin) => request('change-pin', { method: 'POST', body: { pin, newPin } }),
    async deleteAccount(pin) {
      await request('delete-account', { method: 'POST', body: { pin } });
      clearSession();
      SQ.store.remove('outbox');
    },
    me: () => request('me'),
    leaderboard: (board, period, day) => request('leaderboard', { query: { board, period, day }, auth: !!session() }),
    daily: (game) => request('daily', { query: { game }, auth: false }),
    start: (game, mode, timer) => request('start', { method: 'POST', body: { game, mode, timer: timer || 0 } }),
    submit,
    flush,
    pending: () => outbox().length,
    clearSession,
  };

  window.addEventListener('online', () => { status(true).then((s) => { if (s === 'ok') flush(); }); });
})();
