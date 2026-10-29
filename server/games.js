'use strict';
/* Ranked games and leaderboards.
 *
 * A ranked game is a "run": the website asks for one when a signed-in player starts (start), plays in the browser,
 * then sends the answers (submit). The server re-checks every answer against its own copy of the data, works out the
 * points itself and only then updates the leaderboards. Each daily puzzle can be submitted once per account.
 *
 * Leaderboards (Redis sorted sets, member = display name):
 *   sarpa-daily    the Sarpa daily challenge   day: points, ties broken by speed   week / all: points added up
 *   herpdle        the daily Herpdle           day: points (fewer guesses = more), ties by speed
 *   sarpa-points   every ranked Sarpa game     points earned in the day / week / all time
 */
const crypto = require('crypto');
const { HttpError } = require('./http');
const time = require('./time');
const DATA = require('./data');
const { rateLimit } = require('./auth');

const BOARDS = {
  'sarpa-daily': { game: 'sarpa', daily: true },
  herpdle: { game: 'herpdle', daily: true },
  'sarpa-points': { game: 'sarpa', daily: false },
};
const PERIODS = ['day', 'week', 'all'];
const DAY_TTL = 140 * 86400;
const WEEK_TTL = 400 * 86400;
const TOP = 50;

const K = {
  run: (id) => `sq:run:${id}`,
  dailyStatus: (game, day) => `sq:dly:${game}:${day}`,
  board: (board, period, key) => (period === 'all' ? `sq:lb:${board}:all` : `sq:lb:${board}:${period === 'day' ? 'd' : 'w'}:${key}`),
  detail: (board, day) => `sq:lbd:${board}:${day}`,
  userBoards: (u) => `sq:ulb:${u}`,
  stats: (u) => `sq:st:${u}`,
  recent: (u) => `sq:rg:${u}`,
};

const SARPA_MODES = new Set(['daily', 'quiz', 'practice', 'weak', 'sudden']);
const HERPDLE_MODES = new Set(['daily']);
const TIMERS = new Set([0, 15, 30, 45]);
const HERPDLE_POINTS = [600, 500, 400, 300, 200, 100];
const MAX_ANSWERS = 100;            // the longest quiz (and the longest survival run)
const MIN_MS_PER_ANSWER = 600;      // nobody reads a photo and four names faster than this, on average
const RANKED_PER_DAY = 20;          // quizzes per player and day that count for the points leaderboard
const composite = (points, seconds) => points * 100000 + Math.max(0, 99999 - Math.min(99999, Math.round(seconds)));
const splitComposite = (score) => ({ points: Math.floor(score / 100000), seconds: 99999 - (score % 100000) });

/** The same scoring as js/engine.js (score). */
function sarpaPoints({ correct, hints, remaining, timer, streak }) {
  if (!correct) return 0;
  let pts = Math.max(30, 100 - 25 * hints);
  if (timer > 0) pts += Math.round(40 * Math.max(0, Math.min(1, remaining / timer)));
  pts += 5 * Math.min(streak, 10);
  return pts;
}

const int = (v, lo, hi) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/* ------------------------------------------------------------------ */
/*  Starting a run                                                      */
/* ------------------------------------------------------------------ */

async function start(store, user, body) {
  const game = body.game;
  const mode = body.mode;
  if (game === 'sarpa' ? !SARPA_MODES.has(mode) : game === 'herpdle' ? !HERPDLE_MODES.has(mode) : true) {
    throw new HttpError(400, 'Unknown game.', 'bad_game');
  }
  await rateLimit(store, 'start', user.key, 150, 3600, 'You are starting games very fast. Please wait a little.');
  const now = Date.now();
  const today = time.dayKey(now);

  if (mode === 'daily') {
    if (!DATA.daily(game, today)) throw new HttpError(409, 'Today’s puzzle is not available for ranking.', 'no_daily');
    const statusKey = K.dailyStatus(game, today);
    const status = await store.cmd('HGET', statusKey, user.key);
    if (status && status.startsWith('d:')) {
      throw new HttpError(409, 'You have already played today’s puzzle. A new one comes at midnight (India time).', 'daily_done');
    }
    if (status && status.startsWith('s:')) {
      const runId = status.slice(2);
      const run = await store.cmd('HGETALL', K.run(runId));
      if (run && run.length) return { runId, day: today, resumed: true };
    }
    const runId = crypto.randomBytes(12).toString('base64url');
    await store.pipe([
      ['HSET', K.run(runId), 'u', user.key, 'g', game, 'm', mode, 'd', today, 't', now],
      ['EXPIRE', K.run(runId), 2 * 86400],
      ['HSET', statusKey, user.key, 's:' + runId],
      ['EXPIRE', statusKey, 4 * 86400],
    ]);
    return { runId, day: today, resumed: false };
  }

  const timer = int(body.timer || 0, 0, 45);
  if (!TIMERS.has(timer)) throw new HttpError(400, 'Unknown timer.', 'bad_timer');
  const runId = crypto.randomBytes(12).toString('base64url');
  await store.pipe([
    ['HSET', K.run(runId), 'u', user.key, 'g', game, 'm', mode, 'd', today, 't', now, 'timer', timer],
    ['EXPIRE', K.run(runId), 12 * 3600],
  ]);
  return { runId, day: today, resumed: false };
}

/* ------------------------------------------------------------------ */
/*  Checking a finished run                                             */
/* ------------------------------------------------------------------ */

function checkSarpa(run, body) {
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers || !answers.length || answers.length > MAX_ANSWERS) throw new HttpError(422, 'This game could not be checked.', 'bad_answers');
  const timer = Number(run.timer) || 0;
  let questions = null;
  if (run.m === 'daily') {
    questions = DATA.daily('sarpa', run.d).questions;
    if (answers.length !== questions.length) throw new HttpError(422, 'This daily challenge is not complete.', 'bad_answers');
  }
  const seen = new Set();
  let streak = 0, best = 0, points = 0, correct = 0, totalMs = 0;
  answers.forEach((a, i) => {
    const photo = int(a && a.p, 1, 2 ** 40);
    const chosen = typeof (a && a.c) === 'string' ? a.c : '';
    const hints = int(a && a.h != null ? a.h : 0, 0, 4);
    const ms = int(a && a.ms != null ? Math.round(a.ms) : -1, 0, 3600 * 1000);
    if (photo == null || hints == null || ms == null || seen.has(photo)) throw new HttpError(422, 'This game could not be checked.', 'bad_answers');
    seen.add(photo);
    const truth = DATA.photoSpecies(photo);
    if (!truth) throw new HttpError(422, 'This game used a photo that is no longer in the collection.', 'bad_photo');
    if (chosen && !DATA.speciesExists(chosen)) throw new HttpError(422, 'This game could not be checked.', 'bad_answers');
    if (questions) {
      const q = questions[i];
      if (q.photo !== photo || (chosen && !q.options.includes(chosen))) throw new HttpError(422, 'These are not today’s questions.', 'not_daily');
    }
    const ok = !!chosen && chosen === truth;
    if (run.m === 'sudden' && !ok && i !== answers.length - 1) throw new HttpError(422, 'This game could not be checked.', 'bad_answers');
    const remaining = timer ? Math.max(0, timer - ms / 1000) : 0;
    if (timer && ms > timer * 1000 + 1500 && chosen) throw new HttpError(422, 'This game could not be checked.', 'bad_answers');
    points += sarpaPoints({ correct: ok, hints, remaining, timer, streak });
    streak = ok ? streak + 1 : 0;
    best = Math.max(best, streak);
    if (ok) correct += 1;
    totalMs += ms;
  });
  const elapsed = Date.now() - Number(run.t);
  if (totalMs > elapsed + 5000) throw new HttpError(422, 'The timings of this game do not add up.', 'bad_timing');
  if (totalMs < MIN_MS_PER_ANSWER * answers.length) throw new HttpError(422, 'That was faster than anyone can answer.', 'bad_timing');
  return { points, correct, n: answers.length, bestStreak: best, seconds: Math.round(totalMs / 1000) };
}

function checkHerpdle(run, body) {
  const guesses = Array.isArray(body.guesses) ? body.guesses : null;
  if (!guesses || !guesses.length || guesses.length > 6) throw new HttpError(422, 'This puzzle could not be checked.', 'bad_guesses');
  const answer = DATA.daily('herpdle', run.d).species;
  const seen = new Set();
  let won = false;
  guesses.forEach((g, i) => {
    const id = typeof g === 'string' ? g : '';
    if (id) {
      if (!DATA.speciesExists(id) || seen.has(id)) throw new HttpError(422, 'This puzzle could not be checked.', 'bad_guesses');
      seen.add(id);
    }
    if (id === answer) {
      if (i !== guesses.length - 1) throw new HttpError(422, 'This puzzle could not be checked.', 'bad_guesses');
      won = true;
    }
  });
  if (!won && guesses.length !== 6) throw new HttpError(422, 'This puzzle is not finished yet.', 'unfinished');
  const n = guesses.length;
  const seconds = Math.round((Date.now() - Number(run.t)) / 1000);
  return { points: won ? HERPDLE_POINTS[n - 1] : 0, won, n, seconds };
}

/* ------------------------------------------------------------------ */
/*  Submitting                                                          */
/* ------------------------------------------------------------------ */

const toObj = (flat) => {
  const o = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};

/** Consecutive-day streak update: returns [streak, best]. */
function streakAfter(stats, prefix, day, keepGoing) {
  const last = stats[prefix + '_last'] || '';
  let streak = Number(stats[prefix + '_streak']) || 0;
  if (!keepGoing) streak = 0;
  else if (last === time.shiftDay(day, -1)) streak += 1;
  else if (last !== day) streak = 1;
  const best = Math.max(Number(stats[prefix + '_best']) || 0, streak);
  return [streak, best];
}

async function submit(store, user, body) {
  const runId = typeof body.runId === 'string' && body.runId.length < 40 ? body.runId : '';
  const run = runId ? toObj(await store.cmd('HGETALL', K.run(runId))) : {};
  if (!run.u) throw new HttpError(404, 'This game has expired and cannot be ranked.', 'no_run');
  if (run.u !== user.key) throw new HttpError(403, 'This game belongs to another account.', 'not_yours');
  if (run.done) throw new HttpError(409, 'This game has already been saved.', 'already_saved');
  // claim the run first, so that two submissions of the same game cannot both count
  const claim = await store.cmd('HSETNX', K.run(runId), 'done', Date.now());
  if (Number(claim) !== 1) throw new HttpError(409, 'This game has already been saved.', 'already_saved');

  const game = run.g, mode = run.m, isDaily = mode === 'daily';
  const day = isDaily ? run.d : time.dayKey();
  const week = time.weekKey(day);
  if (game === 'sarpa' && !isDaily) {
    await rateLimit(store, 'ranked-quiz', `${user.key}:${day}`, RANKED_PER_DAY, 2 * 86400, `Only ${RANKED_PER_DAY} quizzes a day count for the leaderboard. You can keep playing; games count again tomorrow.`);
  }
  let result;
  try {
    result = game === 'herpdle' ? checkHerpdle(run, body) : checkSarpa(run, body);
  } catch (e) {
    if (isDaily) await store.cmd('HSET', K.dailyStatus(game, day), user.key, 'd:x');      // a daily cannot be retried
    throw e;
  }

  const name = user.name;
  const stats = toObj(await store.cmd('HGETALL', K.stats(user.key)));
  const cmds = [];
  const boards = [];
  const touch = (key, ttl) => { boards.push(key); if (ttl) cmds.push(['EXPIRE', key, ttl]); };
  const addPoints = (board) => {
    if (!result.points) return;
    for (const [period, key, ttl] of [['day', day, DAY_TTL], ['week', week, WEEK_TTL], ['all', '', 0]]) {
      const k = K.board(board, period, key);
      cmds.push(['ZINCRBY', k, result.points, name]);
      touch(k, ttl);
    }
  };

  if (game === 'sarpa') {
    cmds.push(['HINCRBY', K.stats(user.key), 's_games', 1], ['HINCRBY', K.stats(user.key), 's_points', result.points],
      ['HINCRBY', K.stats(user.key), 's_correct', result.correct], ['HINCRBY', K.stats(user.key), 's_answered', result.n]);
    if (result.bestStreak > (Number(stats.s_best_streak) || 0)) cmds.push(['HSET', K.stats(user.key), 's_best_streak', result.bestStreak]);
    if (mode === 'sudden' && result.correct > (Number(stats.s_sudden_best) || 0)) cmds.push(['HSET', K.stats(user.key), 's_sudden_best', result.correct]);
    if (isDaily) {
      const dk = K.board('sarpa-daily', 'day', day);
      cmds.push(['ZADD', dk, composite(result.points, result.seconds), name]);
      touch(dk, DAY_TTL);
      const det = K.detail('sarpa-daily', day);
      cmds.push(['HSET', det, name, JSON.stringify({ c: result.correct, n: result.n, s: result.seconds })]);
      touch(det, DAY_TTL);
      for (const [period, key, ttl] of [['week', week, WEEK_TTL], ['all', '', 0]]) {
        const k = K.board('sarpa-daily', period, key);
        cmds.push(['ZINCRBY', k, result.points, name]);
        touch(k, ttl);
      }
      const [streak, best] = streakAfter(stats, 'sd', day, true);
      cmds.push(['HSET', K.stats(user.key), 'sd_last', day, 'sd_streak', streak, 'sd_best', best], ['HINCRBY', K.stats(user.key), 'sd_played', 1]);
      result.streak = streak;
    }
    addPoints('sarpa-points');
  } else {
    const dk = K.board('herpdle', 'day', day);
    cmds.push(['ZADD', dk, composite(result.points, result.seconds), name]);
    touch(dk, DAY_TTL);
    const det = K.detail('herpdle', day);
    cmds.push(['HSET', det, name, JSON.stringify({ g: result.n, w: result.won ? 1 : 0, s: result.seconds })]);
    touch(det, DAY_TTL);
    for (const [period, key, ttl] of [['week', week, WEEK_TTL], ['all', '', 0]]) {
      if (!result.points) break;
      const k = K.board('herpdle', period, key);
      cmds.push(['ZINCRBY', k, result.points, name]);
      touch(k, ttl);
    }
    const [streak, best] = streakAfter(stats, 'h', day, result.won);
    cmds.push(['HSET', K.stats(user.key), 'h_last', day, 'h_streak', streak, 'h_best', best], ['HINCRBY', K.stats(user.key), 'h_played', 1]);
    if (result.won) cmds.push(['HINCRBY', K.stats(user.key), 'h_won', 1], ['HINCRBY', K.stats(user.key), 'h_d' + result.n, 1]);
    result.streak = streak;
  }
  if (isDaily) cmds.push(['HSET', K.dailyStatus(game, day), user.key, 'd:' + result.points]);
  if (boards.length) cmds.push(['SADD', K.userBoards(user.key), ...boards]);
  cmds.push(['LPUSH', K.recent(user.key), JSON.stringify({ g: game, m: mode, d: day, p: result.points, c: result.correct, n: result.n, w: result.won ? 1 : 0, t: Date.now() })],
    ['LTRIM', K.recent(user.key), 0, 49]);
  await store.pipe(cmds);

  // where the player now stands (equal scores share a rank)
  const rankBoards = game === 'sarpa' ? (isDaily ? ['sarpa-daily', 'sarpa-points'] : ['sarpa-points']) : ['herpdle'];
  const rankKeys = [];
  rankBoards.forEach((b) => PERIODS.forEach((p) => rankKeys.push([b, p, K.board(b, p, p === 'day' ? day : p === 'week' ? week : '')])));
  const scores = await store.pipe(rankKeys.map(([, , k]) => ['ZSCORE', k, name]));
  const present = rankKeys.map((rk, i) => [rk, scores[i]]).filter(([, sc]) => sc != null);
  const counts = await store.pipe(present.map(([[, , k], sc]) => ['ZCOUNT', k, '(' + sc, '+inf']));
  const rank = {};
  present.forEach(([[b, p]], i) => { (rank[b] = rank[b] || {})[p] = Number(counts[i]) + 1; });
  return Object.assign({ ok: true, game, mode, day, rank }, result);
}

/* ------------------------------------------------------------------ */
/*  Reading                                                             */
/* ------------------------------------------------------------------ */

async function leaderboard(store, viewer, q) {
  const board = BOARDS[q.board] ? q.board : null;
  const period = PERIODS.includes(q.period) ? q.period : null;
  if (!board || !period) throw new HttpError(400, 'Unknown leaderboard.', 'bad_board');
  const today = time.dayKey();
  let day = today;
  if (q.day) {
    if (!time.isDayKey(q.day)) throw new HttpError(400, 'Unknown day.', 'bad_day');
    if (time.dayIndex(q.day) > time.dayIndex(today) || time.dayIndex(today) - time.dayIndex(q.day) > 120) throw new HttpError(400, 'That day is not available.', 'bad_day');
    day = q.day;
  }
  const week = time.weekKey(day);
  const key = K.board(board, period, period === 'day' ? day : period === 'week' ? week : '');
  const dailyDay = BOARDS[board].daily && period === 'day';
  const cmds = [['ZREVRANGE', key, 0, TOP - 1, 'WITHSCORES'], ['ZCARD', key]];
  if (viewer) cmds.push(['ZSCORE', key, viewer.name]);
  const res = await store.pipe(cmds);
  const myScore = viewer ? res[2] : null;
  const myCount = myScore != null ? Number(await store.cmd('ZCOUNT', key, '(' + myScore, '+inf')) : null;
  const flat = res[0] || [];
  const entries = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const score = Number(flat[i + 1]);
    const e = { rank: entries.length + 1, name: flat[i] };
    if (dailyDay) Object.assign(e, splitComposite(score)); else e.points = Math.round(score);
    entries.push(e);
  }
  // equal scores share a rank
  entries.forEach((e, i) => {
    if (i && (dailyDay ? (e.points === entries[i - 1].points && e.seconds === entries[i - 1].seconds) : e.points === entries[i - 1].points)) e.rank = entries[i - 1].rank;
  });
  let me = null;
  if (myScore != null) {
    const score = Number(myScore);
    me = Object.assign({ rank: myCount + 1, name: viewer.name }, dailyDay ? splitComposite(score) : { points: Math.round(score) });
  }
  if (dailyDay && entries.length) {
    const names = entries.map((e) => e.name);
    if (me && !names.includes(me.name)) names.push(me.name);
    const det = await store.cmd('HMGET', K.detail(board, day), ...names);
    const byName = {};
    names.forEach((n, i) => { try { byName[n] = det[i] ? JSON.parse(det[i]) : null; } catch (e) { byName[n] = null; } });
    entries.forEach((e) => { e.detail = byName[e.name]; });
    if (me) me.detail = byName[me.name];
  }
  return { board, period, day, week, total: Number(res[1]) || 0, entries, me };
}

async function profile(store, user) {
  const [stats, recent] = await store.pipe([['HGETALL', K.stats(user.key)], ['LRANGE', K.recent(user.key), 0, 19]]);
  const today = time.dayKey();
  const [s1, s2] = await store.pipe([['HGET', K.dailyStatus('sarpa', today), user.key], ['HGET', K.dailyStatus('herpdle', today), user.key]]);
  const st = toObj(stats);
  const numbers = {};
  Object.entries(st).forEach(([k, v]) => { numbers[k] = /_last$/.test(k) ? v : Number(v); });
  // a streak only counts if it reaches yesterday or today
  for (const p of ['sd', 'h']) {
    const last = st[p + '_last'];
    if (last !== today && last !== time.shiftDay(today, -1)) numbers[p + '_streak'] = 0;
  }
  const status = (s) => (s && s.startsWith('d:') ? 'done' : s && s.startsWith('s:') ? 'started' : 'new');
  return {
    user: { name: user.name, created: user.created },
    stats: numbers,
    today: { day: today, sarpa: status(s1), herpdle: status(s2) },
    recent: (recent || []).map((r) => { try { return JSON.parse(r); } catch (e) { return null; } }).filter(Boolean),
  };
}

/** Removes everything a player has in the game tables (used when an account is deleted). */
async function removePlayer(store, uname, name) {
  const boards = await store.cmd('SMEMBERS', K.userBoards(uname));
  const cmds = boards.map((k) => (k.startsWith('sq:lbd:') ? ['HDEL', k, name] : ['ZREM', k, name]));
  cmds.push(['DEL', K.userBoards(uname)], ['DEL', K.stats(uname)], ['DEL', K.recent(uname)]);
  await store.pipe(cmds);
}

module.exports = { BOARDS, PERIODS, K, sarpaPoints, composite, splitComposite, start, submit, leaderboard, profile, removePlayer, checkSarpa, checkHerpdle };
