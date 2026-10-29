'use strict';
/* The database: Upstash Redis over its REST API in production, an in-memory copy for tests and local runs.
 *
 * Both expose the same three calls:
 *   await store.cmd('HGET', key, field)          one command
 *   await store.pipe([[...], [...]])             several commands in one round trip (not atomic)
 *   await store.multi([[...], [...]])            several commands as one transaction (atomic)
 * Results follow Redis conventions as the REST API returns them: strings, integers, arrays, null.
 */

class StoreError extends Error {}

/* ------------------------------------------------------------------ */
/*  Upstash (production)                                                */
/* ------------------------------------------------------------------ */

function upstash(url, token) {
  const base = url.replace(/\/+$/, '');
  async function call(path, body) {
    let res;
    try {
      res = await fetch(base + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new StoreError('database unreachable: ' + (e && e.message));
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* handled below */ }
    if (!res.ok && !(Array.isArray(json))) throw new StoreError('database error: ' + ((json && json.error) || res.status));
    return json;
  }
  const unwrap = (rows) => rows.map((r) => {
    if (r && r.error) throw new StoreError('database error: ' + r.error);
    return r ? r.result : null;
  });
  return {
    kind: 'upstash',
    async cmd(...args) {
      const json = await call('', args.map(String));
      if (!json || json.error) throw new StoreError('database error: ' + (json && json.error));
      return json.result;
    },
    async pipe(cmds) {
      if (!cmds.length) return [];
      return unwrap(await call('/pipeline', cmds.map((c) => c.map(String))));
    },
    async multi(cmds) {
      if (!cmds.length) return [];
      return unwrap(await call('/multi-exec', cmds.map((c) => c.map(String))));
    },
  };
}

/* ------------------------------------------------------------------ */
/*  In memory (tests, local development)                                */
/* ------------------------------------------------------------------ */

function memory() {
  const data = new Map();      // key -> { t: 'str'|'hash'|'set'|'zset'|'list', v, exp }
  let now = () => Date.now();

  const live = (key) => {
    const e = data.get(key);
    if (!e) return null;
    if (e.exp && e.exp <= now()) { data.delete(key); return null; }
    return e;
  };
  const get = (key, type, create) => {
    let e = live(key);
    if (e && e.t !== type) throw new StoreError('WRONGTYPE Operation against a key holding the wrong kind of value');
    if (!e && create) { e = { t: type, v: type === 'str' ? null : type === 'list' ? [] : new Map(), exp: 0 }; if (type === 'set') e.v = new Set(); data.set(key, e); }
    return e;
  };
  const num = (s) => {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new StoreError('ERR value is not a valid float');
    return n;
  };
  const fmt = (n) => String(Number.isInteger(n) ? n : +n.toPrecision(17));
  const zsorted = (e) => Array.from(e.v.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));

  const commands = {
    GET(key) { const e = get(key, 'str'); return e ? e.v : null; },
    SET(key, value, ...opts) {
      const up = opts.map((o) => String(o).toUpperCase());
      const nx = up.includes('NX');
      const exIdx = up.indexOf('EX');
      if (nx && live(key)) return null;
      const e = { t: 'str', v: String(value), exp: exIdx >= 0 ? now() + 1000 * Number(opts[exIdx + 1]) : 0 };
      data.set(key, e);
      return 'OK';
    },
    DEL(...keys) { let n = 0; keys.forEach((k) => { if (live(k)) { data.delete(k); n++; } }); return n; },
    EXISTS(...keys) { return keys.filter((k) => live(k)).length; },
    EXPIRE(key, sec) { const e = live(key); if (!e) return 0; e.exp = now() + 1000 * Number(sec); return 1; },
    TTL(key) { const e = live(key); if (!e) return -2; if (!e.exp) return -1; return Math.ceil((e.exp - now()) / 1000); },
    INCR(key) { return commands.INCRBY(key, 1); },
    INCRBY(key, by) {
      const e = get(key, 'str', true);
      const v = (e.v == null ? 0 : parseInt(e.v, 10)) + parseInt(by, 10);
      e.v = String(v);
      return v;
    },
    HSET(key, ...fv) {
      const e = get(key, 'hash', true); let n = 0;
      for (let i = 0; i < fv.length; i += 2) { if (!e.v.has(String(fv[i]))) n++; e.v.set(String(fv[i]), String(fv[i + 1])); }
      return n;
    },
    HSETNX(key, f, v) { const e = get(key, 'hash', true); if (e.v.has(String(f))) return 0; e.v.set(String(f), String(v)); return 1; },
    HGET(key, f) { const e = get(key, 'hash'); return e && e.v.has(String(f)) ? e.v.get(String(f)) : null; },
    HMGET(key, ...fs) { const e = get(key, 'hash'); return fs.map((f) => (e && e.v.has(String(f)) ? e.v.get(String(f)) : null)); },
    HGETALL(key) { const e = get(key, 'hash'); const out = []; if (e) e.v.forEach((v, f) => out.push(f, v)); return out; },
    HINCRBY(key, f, by) {
      const e = get(key, 'hash', true);
      const v = (e.v.has(String(f)) ? parseInt(e.v.get(String(f)), 10) : 0) + parseInt(by, 10);
      e.v.set(String(f), String(v));
      return v;
    },
    HDEL(key, ...fs) { const e = get(key, 'hash'); if (!e) return 0; let n = 0; fs.forEach((f) => { if (e.v.delete(String(f))) n++; }); if (!e.v.size) data.delete(key); return n; },
    SADD(key, ...ms) { const e = get(key, 'set', true); let n = 0; ms.forEach((m) => { if (!e.v.has(String(m))) { e.v.add(String(m)); n++; } }); return n; },
    SREM(key, ...ms) { const e = get(key, 'set'); if (!e) return 0; let n = 0; ms.forEach((m) => { if (e.v.delete(String(m))) n++; }); if (!e.v.size) data.delete(key); return n; },
    SMEMBERS(key) { const e = get(key, 'set'); return e ? Array.from(e.v) : []; },
    ZADD(key, ...args) {
      let gt = false;
      while (args.length && /^[A-Za-z]+$/.test(String(args[0]))) { if (String(args.shift()).toUpperCase() === 'GT') gt = true; }
      const e = get(key, 'zset', true); let n = 0;
      for (let i = 0; i < args.length; i += 2) {
        const score = num(args[i]), m = String(args[i + 1]);
        if (!e.v.has(m)) { n++; e.v.set(m, score); } else if (!gt || score > e.v.get(m)) e.v.set(m, score);
      }
      return n;
    },
    ZINCRBY(key, by, m) { const e = get(key, 'zset', true); const v = (e.v.get(String(m)) || 0) + num(by); e.v.set(String(m), v); return fmt(v); },
    ZSCORE(key, m) { const e = get(key, 'zset'); return e && e.v.has(String(m)) ? fmt(e.v.get(String(m))) : null; },
    ZREM(key, ...ms) { const e = get(key, 'zset'); if (!e) return 0; let n = 0; ms.forEach((m) => { if (e.v.delete(String(m))) n++; }); if (!e.v.size) data.delete(key); return n; },
    ZCARD(key) { const e = get(key, 'zset'); return e ? e.v.size : 0; },
    ZCOUNT(key, min, max) {
      const e = get(key, 'zset'); if (!e) return 0;
      const bound = (b) => {
        const s = String(b);
        const excl = s.startsWith('(');
        const v = s.replace(/^\(/, '');
        return { v: v === '+inf' ? Infinity : v === '-inf' ? -Infinity : num(v), excl };
      };
      const lo = bound(min), hi = bound(max);
      let n = 0;
      e.v.forEach((sc) => { if ((lo.excl ? sc > lo.v : sc >= lo.v) && (hi.excl ? sc < hi.v : sc <= hi.v)) n++; });
      return n;
    },
    ZREVRANK(key, m) { const e = get(key, 'zset'); if (!e || !e.v.has(String(m))) return null; return zsorted(e).findIndex(([x]) => x === String(m)); },
    ZREVRANGE(key, start, stop, withScores) {
      const e = get(key, 'zset'); if (!e) return [];
      const all = zsorted(e);
      let s = parseInt(start, 10), t = parseInt(stop, 10);
      if (s < 0) s = Math.max(0, all.length + s);
      if (t < 0) t = all.length + t;
      const slice = all.slice(s, t + 1);
      if (withScores && String(withScores).toUpperCase() === 'WITHSCORES') return slice.flatMap(([m, sc]) => [m, fmt(sc)]);
      return slice.map(([m]) => m);
    },
    LPUSH(key, ...vs) { const e = get(key, 'list', true); vs.forEach((v) => e.v.unshift(String(v))); return e.v.length; },
    LTRIM(key, start, stop) {
      const e = get(key, 'list'); if (!e) return 'OK';
      let s = parseInt(start, 10), t = parseInt(stop, 10);
      if (s < 0) s = Math.max(0, e.v.length + s);
      if (t < 0) t = e.v.length + t;
      e.v = e.v.slice(s, t + 1);
      if (!e.v.length) data.delete(key);
      return 'OK';
    },
    LRANGE(key, start, stop) {
      const e = get(key, 'list'); if (!e) return [];
      let s = parseInt(start, 10), t = parseInt(stop, 10);
      if (s < 0) s = Math.max(0, e.v.length + s);
      if (t < 0) t = e.v.length + t;
      return e.v.slice(s, t + 1);
    },
  };

  const run = (args) => {
    const name = String(args[0]).toUpperCase();
    const fn = commands[name];
    if (!fn) throw new StoreError('ERR unknown command ' + name);
    return fn(...args.slice(1));
  };
  return {
    kind: 'memory',
    async cmd(...args) { return run(args); },
    async pipe(cmds) { return cmds.map(run); },
    async multi(cmds) {
      // all-or-nothing is not needed here: commands run one after another without interleaving
      return cmds.map(run);
    },
    /* test helpers */
    _data: data,
    _setClock(fn) { now = fn; },
  };
}

/* ------------------------------------------------------------------ */

let cached = null;

/**
 * The store for this deployment, or null when no database is configured.
 * Works with the variable names of the Vercel Upstash integration (KV_REST_API_URL / KV_REST_API_TOKEN)
 * and of Upstash itself (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
 */
function fromEnv(env = process.env) {
  if (cached && cached.env === env) return cached.store;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '';
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  let store = null;
  if (env.SARPA_STORE === 'memory') store = memory();
  else if (url && token) store = upstash(url, token);
  cached = { env, store };
  return store;
}

module.exports = { upstash, memory, fromEnv, StoreError };
