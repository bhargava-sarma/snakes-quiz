'use strict';
/* The Sarpa API: accounts and leaderboards. One endpoint, the action is a query parameter:
 *
 *   GET  /api/sarpa?action=health                       is the database set up?
 *   GET  /api/sarpa?action=daily&game=sarpa|herpdle     today's puzzle (the same for everyone)
 *   GET  /api/sarpa?action=leaderboard&board=..&period=day|week|all[&day=YYYY-MM-DD]
 *   GET  /api/sarpa?action=me                           (signed in) profile and stats
 *   POST /api/sarpa?action=signup | login               { username, pin }
 *   POST /api/sarpa?action=logout                       (signed in)
 *   POST /api/sarpa?action=change-pin                   (signed in) { pin, newPin }
 *   POST /api/sarpa?action=delete-account               (signed in) { pin }
 *   POST /api/sarpa?action=start                        (signed in) { game, mode, timer }
 *   POST /api/sarpa?action=submit                       (signed in) { runId, answers | guesses }
 *   POST /api/sarpa?action=admin-delete                 header x-admin-token: ADMIN_TOKEN, { username }
 *
 * Signed-in calls send "Authorization: Bearer <token>". Errors come back as { error, code } with an HTTP status.
 */
const { HttpError, readBody, query, bearer, clientId, send } = require('./http');
const storeLib = require('./store');
const auth = require('./auth');
const games = require('./games');
const time = require('./time');
const DATA = require('./data');

function needStore(store) {
  if (!store) throw new HttpError(503, 'Accounts and leaderboards are not set up on this site yet.', 'no_store');
  return store;
}

async function needUser(store, req) {
  const user = await auth.sessionUser(store, bearer(req));
  if (!user) throw new HttpError(401, 'Please sign in again.', 'signed_out');
  return user;
}

const POST_ONLY = new Set(['signup', 'login', 'logout', 'change-pin', 'delete-account', 'start', 'submit', 'admin-delete']);

async function route(req, store) {
  const q = query(req);
  const action = String(q.action || '');
  if (POST_ONLY.has(action) && req.method !== 'POST') throw new HttpError(405, 'Use POST for this.', 'method');
  const body = POST_ONLY.has(action) ? await readBody(req) : {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'The request was not valid.', 'bad_json');

  switch (action) {
    case 'health':
      return { body: { ok: true, accounts: !!store, day: time.dayKey(), now: Date.now(), dataVersion: DATA.version() } };

    case 'daily': {
      const game = q.game === 'herpdle' ? 'herpdle' : q.game === 'sarpa' ? 'sarpa' : null;
      if (!game) throw new HttpError(400, 'Unknown game.', 'bad_game');
      const day = time.dayKey();
      const puzzle = DATA.daily(game, day);
      if (!puzzle) throw new HttpError(404, 'No puzzle is scheduled for today.', 'no_daily');
      const ttl = Math.max(5, Math.min(3600, Math.floor(time.msToNextDay() / 1000) - 5));
      return { body: Object.assign({ game, day, version: DATA.version() }, puzzle), headers: { 'Cache-Control': `public, max-age=60, s-maxage=${ttl}` } };
    }

    case 'leaderboard': {
      const s = needStore(store);
      const token = bearer(req);
      const viewer = token ? await auth.sessionUser(s, token) : null;
      const out = await games.leaderboard(s, viewer, q);
      return { body: out, headers: { 'Cache-Control': token ? 'private, no-store' : 'public, max-age=15, s-maxage=20, stale-while-revalidate=40' } };
    }

    case 'me': {
      const s = needStore(store);
      const user = await needUser(s, req);
      return { body: await games.profile(s, user) };
    }

    case 'signup':
      return { body: await auth.signup(needStore(store), body, clientId(req)), status: 201 };

    case 'login':
      return { body: await auth.login(needStore(store), body, clientId(req)) };

    case 'logout': {
      const s = needStore(store);
      const user = await auth.sessionUser(s, bearer(req));
      if (user) await auth.logout(s, user);
      return { body: { ok: true } };
    }

    case 'change-pin': {
      const s = needStore(store);
      const user = await needUser(s, req);
      return { body: await auth.changePin(s, user, body, clientId(req)) };
    }

    case 'delete-account': {
      const s = needStore(store);
      const user = await needUser(s, req);
      await auth.deleteAccount(s, user, body, clientId(req));
      await games.removePlayer(s, user.key, user.name);
      return { body: { ok: true } };
    }

    case 'start': {
      const s = needStore(store);
      const user = await needUser(s, req);
      return { body: await games.start(s, user, body) };
    }

    case 'submit': {
      const s = needStore(store);
      const user = await needUser(s, req);
      return { body: await games.submit(s, user, body) };
    }

    case 'admin-delete': {
      const s = needStore(store);
      const want = process.env.ADMIN_TOKEN || '';
      const got = String(req.headers['x-admin-token'] || '');
      if (want.length < 16 || got !== want) throw new HttpError(403, 'Not allowed.', 'forbidden');
      const uname = auth.canonical(String(body.username || '').trim());
      const rec = await auth.getUser(s, uname);
      if (!rec) throw new HttpError(404, 'No such account.', 'no_user');
      await games.removePlayer(s, uname, rec.name);
      await auth.removeAccountRecords(s, uname);
      return { body: { ok: true, removed: rec.name } };
    }

    default:
      throw new HttpError(404, 'Unknown action.', 'unknown_action');
  }
}

/** Request handler for Vercel (api/sarpa.js) and for scripts/dev-server.js. */
async function handler(req, res, opts = {}) {
  const store = opts.store !== undefined ? opts.store : storeLib.fromEnv();
  try {
    const out = await route(req, store);
    send(res, out.status || 200, out.body, out.headers);
  } catch (e) {
    if (e instanceof HttpError) {
      send(res, e.status, { error: e.message, code: e.code });
    } else if (e instanceof storeLib.StoreError) {
      console.error('[sarpa api] store', e.message);
      send(res, 503, { error: 'The database is not responding. Please try again in a moment.', code: 'store_error' });
    } else {
      console.error('[sarpa api]', e);
      send(res, 500, { error: 'Something went wrong on our side. Please try again.', code: 'server_error' });
    }
  }
}

module.exports = { handler, route };
