#!/usr/bin/env node
/* Tests for the accounts-and-leaderboards API (server/), with the in-memory database and a pretend clock.
 * Also runs a few commands through the Upstash client against a small imitation of Upstash's REST API, to check the
 * wire format. No packages needed:  node scripts/qa/api_test.js */
'use strict';
const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { handler } = require(path.join(ROOT, 'server/app'));
const storeLib = require(path.join(ROOT, 'server/store'));
const games = require(path.join(ROOT, 'server/games'));
const time = require(path.join(ROOT, 'server/time'));
const DATA = require(path.join(ROOT, 'server/data'));

let failures = 0, passes = 0;
function ok(cond, msg, extra) {
  if (cond) { passes++; return; }
  failures++;
  console.log('  FAIL', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
}
const eq = (a, b, msg) => ok(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// a pretend clock, so that the tests can step through days and timings
const realNow = Date.now;
let now = Date.parse('2026-11-03T06:30:00Z');          // noon in India
Date.now = () => now;
const advance = (ms) => { now += ms; };

function call(store, method, action, { body, token, query = {}, ip = '10.0.0.1', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(Object.assign({ action }, query)).toString();
    const req = {
      method, url: '/api/sarpa?' + qs,
      headers: Object.assign({ 'x-forwarded-for': ip }, method === 'POST' ? { 'content-type': 'application/json' } : {},
        token ? { authorization: 'Bearer ' + token } : {}, headers),
      body: method === 'POST' ? (body || {}) : undefined,
    };
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(text) {
        try { resolve({ status: this.statusCode, body: JSON.parse(text), headers: this.headers }); } catch (e) { reject(e); }
      },
    };
    handler(req, res, { store }).catch(reject);
  });
}

/** Answers for a Sarpa daily: right for the first `right` questions, wrong after that. */
function sarpaAnswers(questions, right, ms = 4000) {
  return questions.map((q, i) => ({ p: q.photo, c: i < right ? q.species : q.options.find((o) => o !== q.species), h: 0, ms }));
}

async function main() {
  const store = storeLib.memory();
  store._setClock(() => now);

  console.log('health and set-up');
  let r = await call(null, 'GET', 'health');
  eq(r.status, 200, 'health without a database');
  eq(r.body.accounts, false, 'health reports no accounts');
  r = await call(null, 'POST', 'signup', { body: { username: 'abc', pin: '482913' } });
  eq(r.status, 503, 'signup without a database');
  eq(r.body.code, 'no_store', 'error code without a database');
  r = await call(store, 'GET', 'health');
  eq(r.body.accounts, true, 'health with a database');
  eq(r.body.day, time.dayKey(now), 'health reports the India day');
  r = await call(store, 'GET', 'nope');
  eq(r.status, 404, 'unknown action');
  r = await call(store, 'GET', 'signup');
  eq(r.status, 405, 'signup needs POST');

  console.log('sign up');
  r = await call(store, 'POST', 'signup', { body: { username: 'ab', pin: '482913' } });
  eq(r.body.code, 'bad_name', 'short name refused');
  r = await call(store, 'POST', 'signup', { body: { username: 'Naga_Raj', pin: '123456' } });
  eq(r.body.code, 'weak_pin', 'weak PIN refused');
  r = await call(store, 'POST', 'signup', { body: { username: 'Naga_Raj', pin: '12345' } });
  eq(r.body.code, 'bad_pin', '5-digit PIN refused');
  r = await call(store, 'POST', 'signup', { body: { username: 'Naga_Raj', pin: '482913' } });
  eq(r.status, 201, 'signup works');
  ok(typeof r.body.token === 'string' && r.body.token.length > 30, 'signup returns a token');
  eq(r.body.user.name, 'Naga_Raj', 'display name kept');
  const tokA = r.body.token;
  r = await call(store, 'POST', 'signup', { body: { username: 'naga_raj', pin: '771903' } });
  eq(r.status, 409, 'same name in other letter case is taken');
  r = await call(store, 'POST', 'signup', { body: { username: 'Kaveri', pin: '660917' }, ip: '10.0.0.2' });
  eq(r.status, 201, 'second player');
  const tokB = r.body.token;
  ok(!Object.keys(Object.fromEntries(store._data)).some((k) => k.includes(tokA)), 'raw tokens are not stored');
  const userRec = await store.cmd('HGETALL', 'sq:u:naga_raj');
  ok(!userRec.includes('482913'), 'PIN not stored in plain text');

  console.log('sign in');
  r = await call(store, 'POST', 'login', { body: { username: 'NAGA_RAJ', pin: '482913' } });
  eq(r.status, 200, 'login is case-insensitive');
  const tokA2 = r.body.token;
  r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '000001' } });
  eq(r.status, 401, 'wrong PIN');
  eq(r.body.error, 'Wrong username or PIN.', 'wrong PIN message');
  r = await call(store, 'POST', 'login', { body: { username: 'nobody_here', pin: '000001' } });
  eq(r.body.error, 'Wrong username or PIN.', 'unknown name gives the same message');
  for (let i = 0; i < 6; i++) r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '000002' }, ip: '10.9.9.9' });
  eq(r.status, 401, 'six wrong tries are answered normally');
  r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '482913' }, ip: '10.9.9.9' });
  eq(r.status, 429, 'seventh try from the same network is blocked, even with the right PIN');
  r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '482913' }, ip: '10.0.0.1' });
  eq(r.status, 200, 'other networks are not blocked');
  advance(16 * 60 * 1000);
  r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '482913' }, ip: '10.9.9.9' });
  eq(r.status, 200, 'the block lifts after 15 minutes');

  console.log('profile');
  r = await call(store, 'GET', 'me', { token: tokA });
  eq(r.status, 200, 'me');
  eq(r.body.user.name, 'Naga_Raj', 'me name');
  eq(r.body.today.sarpa, 'new', 'today not played');
  r = await call(store, 'GET', 'me', { token: 'not-a-token' });
  eq(r.status, 401, 'bad token');
  eq(r.body.code, 'signed_out', 'bad token code');

  console.log('Sarpa daily');
  const today = time.dayKey(now);
  r = await call(store, 'GET', 'daily', { query: { game: 'sarpa' } });
  eq(r.status, 200, 'daily puzzle');
  eq(r.body.day, today, 'daily day');
  eq(r.body.questions.length, 10, 'ten questions');
  ok(/s-maxage=\d+/.test(r.headers['cache-control']), 'daily is cached until midnight', r.headers['cache-control']);
  const questions = r.body.questions;
  ok(questions.every((q) => DATA.photoSpecies(q.photo) === q.species && q.options.includes(q.species)), 'daily answers match the photos');
  r = await call(store, 'POST', 'start', { token: tokA, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.status, 200, 'start daily');
  const runA = r.body.runId;
  r = await call(store, 'POST', 'start', { token: tokA, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.body.runId, runA, 'starting again resumes the same run');
  eq(r.body.resumed, true, 'resumed flag');
  advance(20000);
  r = await call(store, 'POST', 'submit', { token: tokA, body: { runId: runA, answers: sarpaAnswers(questions, 10, 4000) } });
  eq(r.status, 422, 'answers taking longer than the real time are refused');
  r = await call(store, 'POST', 'start', { token: tokA, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.status, 409, 'a refused daily cannot be replayed');

  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'daily' } });
  const runB = r.body.runId;
  advance(60000);
  const wrongOrder = sarpaAnswers(questions, 10).slice().reverse();
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: runB, answers: wrongOrder } });
  eq(r.body.code, 'not_daily', 'answers to other questions are refused');

  // a fresh player plays it properly
  r = await call(store, 'POST', 'signup', { body: { username: 'Ranger_C', pin: '305817' }, ip: '10.0.0.3' });
  const tokC = r.body.token;
  r = await call(store, 'POST', 'start', { token: tokC, body: { game: 'sarpa', mode: 'daily' } });
  const runC = r.body.runId;
  advance(50000);
  r = await call(store, 'POST', 'submit', { token: tokC, body: { runId: runC, answers: sarpaAnswers(questions, 8, 4500) } });
  eq(r.status, 200, 'daily submitted');
  // 8 right in a row from the start: 100 + 105 + ... + 135, then two wrong
  eq(r.body.points, [0, 1, 2, 3, 4, 5, 6, 7].reduce((a, k) => a + 100 + 5 * k, 0), 'daily points worked out by the server');
  eq(r.body.correct, 8, 'daily correct');
  eq(r.body.rank['sarpa-daily'].day, 1, 'rank on the day');
  eq(r.body.streak, 1, 'daily streak');
  r = await call(store, 'POST', 'submit', { token: tokC, body: { runId: runC, answers: sarpaAnswers(questions, 8, 4500) } });
  eq(r.status, 409, 'a run counts once');
  r = await call(store, 'POST', 'start', { token: tokC, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.body.code, 'daily_done', 'one daily a day');

  console.log('leaderboards');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'day' } });
  eq(r.status, 200, 'leaderboard');
  eq(r.body.entries.length, 1, 'one player on the board');
  eq(r.body.entries[0].name, 'Ranger_C', 'board name');
  eq(r.body.entries[0].detail.c, 8, 'board detail');
  eq(r.body.entries[0].seconds, 45, 'board time');
  ok(/public/.test(r.headers['cache-control']), 'anonymous boards can be cached');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'day' }, token: tokC });
  eq(r.body.me.rank, 1, 'my row');
  ok(/private/.test(r.headers['cache-control']), 'personal boards are not shared by caches');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'week' } });
  eq(r.body.entries[0].points, 940, 'weekly total');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'nope', period: 'day' } });
  eq(r.status, 400, 'unknown board');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'herpdle', period: 'day', day: '2020-01-01' } });
  eq(r.status, 400, 'days too far back are refused');

  console.log('Herpdle daily');
  r = await call(store, 'GET', 'daily', { query: { game: 'herpdle' } });
  const answer = r.body.species;
  ok(DATA.speciesExists(answer) && DATA.photoSpecies(r.body.photo) === answer, 'herpdle puzzle', r.body);
  const others = DATA.load().raw.species.filter((id) => id !== answer);
  r = await call(store, 'POST', 'start', { token: tokA, body: { game: 'herpdle', mode: 'daily' } });
  const hA = r.body.runId;
  advance(30000);
  r = await call(store, 'POST', 'submit', { token: tokA, body: { runId: hA, guesses: [others[0], '', answer] } });
  eq(r.status, 200, 'herpdle solved on the third go');
  eq(r.body.points, 400, 'herpdle points for three goes');
  eq(r.body.won, true, 'won');
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'herpdle', mode: 'daily' } });
  const hB = r.body.runId;
  advance(10000);
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: hB, guesses: [others[0], others[1]] } });
  eq(r.body.code, 'unfinished', 'an unfinished herpdle is refused');
  r = await call(store, 'POST', 'start', { token: tokC, body: { game: 'herpdle', mode: 'daily' } });
  const hC = r.body.runId;
  advance(10000);
  r = await call(store, 'POST', 'submit', { token: tokC, body: { runId: hC, guesses: [answer, answer] } });
  eq(r.status, 422, 'guessing on after solving is refused');
  r = await call(store, 'POST', 'signup', { body: { username: 'Dhaman', pin: '918273' }, ip: '10.0.0.4' });
  const tokD = r.body.token;
  r = await call(store, 'POST', 'start', { token: tokD, body: { game: 'herpdle', mode: 'daily' } });
  const hD = r.body.runId;
  advance(10000);
  r = await call(store, 'POST', 'submit', { token: tokD, body: { runId: hD, guesses: others.slice(0, 6) } });
  eq(r.status, 200, 'a lost herpdle is saved');
  eq(r.body.points, 0, 'no points for a loss');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'herpdle', period: 'day' }, token: tokD });
  eq(r.body.entries.length, 2, 'both finishers listed');
  eq(r.body.entries[0].name, 'Naga_Raj', 'winner first');
  eq(r.body.me.rank, 2, 'loser ranked after');
  r = await call(store, 'GET', 'me', { token: tokA });
  eq(r.body.stats.h_won, 1, 'herpdle wins counted');
  eq(r.body.stats.h_d3, 1, 'guess distribution');
  eq(r.body.today.herpdle, 'done', 'today done');

  console.log('ranked quizzes');
  const photos = DATA.load().raw.photos.slice(0, 20);
  const quizAnswers = photos.map(([pid, sp]) => ({ p: pid, c: DATA.load().raw.species[sp], h: 0, ms: 3000 }));
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'quiz', timer: 15 } });
  const qB = r.body.runId;
  advance(65000);
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: qB, answers: quizAnswers } });
  eq(r.status, 200, 'quiz submitted');
  // 20 right: base 100, time bonus round(40 * 12/15) = 32, streak bonus 5 * min(k, 10)
  const expect = quizAnswers.reduce((a, _, k) => a + 100 + 32 + 5 * Math.min(k, 10), 0);
  eq(r.body.points, expect, 'quiz points worked out by the server');
  eq(r.body.rank['sarpa-points'].all, 1, 'points board rank');
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'quiz', timer: 20 } });
  eq(r.body.code, 'bad_timer', 'unknown timer refused');
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'quiz', timer: 0 } });
  const qFast = r.body.runId;
  advance(60000);
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: qFast, answers: quizAnswers.map((a) => Object.assign({}, a, { ms: 100 })) } });
  eq(r.body.code, 'bad_timing', 'impossibly fast answers refused');
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'sudden', timer: 30 } });
  const sB = r.body.runId;
  advance(60000);
  const sudden = quizAnswers.slice(0, 6).map((a, i) => (i === 2 ? Object.assign({}, a, { c: DATA.load().raw.species.find((id) => id !== a.c) }) : a));
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: sB, answers: sudden } });
  eq(r.body.code, 'bad_answers', 'survival must stop at the first mistake');
  r = await call(store, 'POST', 'start', { token: tokB, body: { game: 'sarpa', mode: 'sudden', timer: 30 } });
  const sB2 = r.body.runId;
  advance(60000);
  r = await call(store, 'POST', 'submit', { token: tokB, body: { runId: sB2, answers: sudden.slice(0, 3) } });
  eq(r.status, 200, 'survival run saved');
  eq(r.body.correct, 2, 'survival correct');
  r = await call(store, 'POST', 'submit', { token: tokA, body: { runId: sB2, answers: sudden.slice(0, 3) } });
  ok(r.status === 403 || r.status === 409, 'someone else cannot submit my run', r.body);

  console.log('a new day');
  advance(24 * 3600 * 1000);
  const tomorrow = time.dayKey(now);
  ok(tomorrow !== today, 'the day changed');
  r = await call(store, 'GET', 'daily', { query: { game: 'sarpa' } });
  const q2 = r.body.questions;
  r = await call(store, 'POST', 'start', { token: tokC, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.status, 200, 'next day can be played');
  const runC2 = r.body.runId;
  advance(60000);
  r = await call(store, 'POST', 'submit', { token: tokC, body: { runId: runC2, answers: sarpaAnswers(q2, 10, 3000) } });
  eq(r.body.streak, 2, 'streak grows on consecutive days');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'day', day: today } });
  eq(r.body.entries[0].name, 'Ranger_C', 'yesterday can still be viewed');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'all' } });
  eq(r.body.entries[0].points, 940 + 1225, 'all-time total');

  console.log('ties share a rank');
  const tieStore = storeLib.memory();
  await tieStore.cmd('ZADD', 'sq:lb:sarpa-points:all', 500, 'a', 500, 'b', 300, 'c');
  r = await call(tieStore, 'GET', 'leaderboard', { query: { board: 'sarpa-points', period: 'all' } });
  eq(r.body.entries.map((e) => e.rank).join(','), '1,1,3', 'tie ranks');

  console.log('account changes');
  r = await call(store, 'POST', 'change-pin', { token: tokA, body: { pin: '111111', newPin: '529017' } });
  eq(r.status, 401, 'change PIN needs the current PIN');
  r = await call(store, 'POST', 'change-pin', { token: tokA, body: { pin: '482913', newPin: '529017' } });
  eq(r.status, 200, 'PIN changed');
  ok(r.body.signedOutOthers >= 1, 'other devices signed out');
  r = await call(store, 'GET', 'me', { token: tokA2 });
  eq(r.status, 401, 'the other device is signed out');
  r = await call(store, 'POST', 'login', { body: { username: 'naga_raj', pin: '529017' }, ip: '10.0.0.8' });
  eq(r.status, 200, 'new PIN works');
  r = await call(store, 'POST', 'logout', { token: tokA });
  eq(r.status, 200, 'logout');
  r = await call(store, 'GET', 'me', { token: tokA });
  eq(r.status, 401, 'logged out token is dead');

  r = await call(store, 'POST', 'delete-account', { token: tokC, body: { pin: '000000' } });
  eq(r.status, 401, 'delete needs the PIN');
  r = await call(store, 'POST', 'delete-account', { token: tokC, body: { pin: '305817' } });
  eq(r.status, 200, 'account deleted');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'all' } });
  ok(!r.body.entries.some((e) => e.name === 'Ranger_C'), 'deleted player gone from the boards');
  r = await call(store, 'GET', 'leaderboard', { query: { board: 'sarpa-daily', period: 'day', day: today } });
  eq(r.body.entries.length, 0, 'and from past days');
  const left = Array.from(store._data.keys()).filter((k) => k.includes('ranger_c'));
  ok(left.every((k) => k.startsWith('sq:rl:')), 'only rate-limit counters remain for a deleted account', left);
  ok(!(await store.cmd('HGET', `sq:dly:sarpa:${tomorrow}`, 'ranger_c')), 'the deleted account’s “already played today” mark is gone');
  r = await call(store, 'POST', 'signup', { body: { username: 'Ranger_C', pin: '305817' }, ip: '10.0.0.9' });
  eq(r.status, 201, 'the name is free again');
  r = await call(store, 'POST', 'start', { token: r.body.token, body: { game: 'sarpa', mode: 'daily' } });
  eq(r.status, 200, 'a new account with the old name does not inherit its daily games');

  console.log('admin');
  process.env.ADMIN_TOKEN = 'x'.repeat(24);
  r = await call(store, 'POST', 'admin-delete', { body: { username: 'Kaveri' }, headers: { 'x-admin-token': 'wrong' } });
  eq(r.status, 403, 'admin needs the token');
  r = await call(store, 'POST', 'admin-delete', { body: { username: 'Kaveri' }, headers: { 'x-admin-token': 'x'.repeat(24) } });
  eq(r.status, 200, 'admin delete');
  r = await call(store, 'GET', 'me', { token: tokB });
  eq(r.status, 401, 'removed player is signed out');
  delete process.env.ADMIN_TOKEN;

  console.log('signup rate limit');
  let last;
  for (let i = 0; i < 21; i++) last = await call(store, 'POST', 'signup', { body: { username: 'bulk' + i + 'x', pin: '493817' }, ip: '10.7.7.7' });
  eq(last.status, 429, 'many accounts from one network are slowed down');

  console.log('Upstash wire format');
  await upstashWire();

  console.log('username filter');
  const auth = require('../../server/auth');
  // names and words that merely contain a blocked word must be allowed (Ishita, Harshita, Kshitij, obiwankenobi ...)
  const fine = ['obiwankenobi_05', 'obi_wan_kenobi', 'Ishita', 'Harshita', 'Nishita', 'Akshita', 'Kshitij07', 'Shital', 'Darshit',
    'Harshit', 'Dikshit', 'Ashit', 'Nazia', 'Nazir_22', 'Nazish', 'Wankhede', 'therapist', 'peacock_9', 'Cocktail', 'Hitchcock',
    'Dickens', 'grapefruit', 'Randhir', 'Brandi', 'Gandhi', 'Kamini', 'Fagun', 'scunthorpe', 'Matsushita', 'assassin', 'classic'];
  const rude = ['shit_head', 'bullsh1t', 'sh1t', 'eatshitandie', 'wanker', 'f_u_c_k', 'a55hole', 'nazis', 'rapist', 'dickhead',
    'b1tch', 'pornstar', 'mycuntface', 'madarchod', 'dogshit', 'gandu', 'randi_x', 'fagboy', 'chutiya99'];
  const wrongly = fine.filter((n) => auth.offensive(n));
  const missed = rude.filter((n) => !auth.offensive(n));
  ok(!wrongly.length, 'innocent names that contain a blocked word are allowed', wrongly);
  ok(!missed.length, 'rude names are refused, also with numbers for letters', missed);
  r = await call(store, 'POST', 'signup', { body: { username: 'obiwankenobi_05', pin: '482913' } });
  eq(r.status, 201, 'obiwankenobi_05 can sign up');
  r = await call(store, 'POST', 'signup', { body: { username: 'wank3r_x', pin: '482913' } });
  ok(r.body.code === 'bad_name' && /not allowed/.test(r.body.error), 'a refused name says why', r.body);

  console.log('database settings');
  const { credentials } = require('../../server/store');
  eq(credentials({ UPSTASH_REDIS_REST_URL: 'https://a.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't1' })[1], 't1', 'Upstash variable names');
  eq(credentials({ KV_REST_API_URL: 'https://b.upstash.io', KV_REST_API_TOKEN: 't2', KV_REST_API_READ_ONLY_TOKEN: 'ro' })[1], 't2', 'Vercel integration names (read-write token)');
  eq(credentials({ SARPA_REST_API_URL: 'https://c.upstash.io', SARPA_REST_API_TOKEN: 't3' })[1], 't3', 'a custom prefix');
  eq(credentials({ OTHER_REST_API_URL: 'https://example.com', OTHER_REST_API_TOKEN: 'x' })[0], '', 'other services are not mistaken for the database');

  console.log('privacy and security');
  await securityChecks(auth);

  Date.now = realNow;
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

/** The defences added after the privacy and security review. */
async function securityChecks(auth) {
  const httpLib = require('../../server/http');
  const sec = storeLib.memory();
  sec._setClock(() => now);
  let r;

  // other websites cannot make a visitor's browser send forms or plain text to the API
  for (const type of ['text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    r = await call(sec, 'POST', 'login', { body: { username: 'abc', pin: '123456' }, headers: { 'content-type': type, 'content-length': '40' } });
    eq(r.status, 415, `${type.split(';')[0]} is refused`);
  }
  r = await call(sec, 'POST', 'logout', { headers: { 'content-type': '', 'content-length': '0' } });
  eq(r.status, 200, 'a request without a body needs no type');
  r = await call(sec, 'POST', 'signup', { body: { username: 'json_ok', pin: '582039' }, headers: { 'content-type': 'application/json; charset=utf-8' } });
  eq(r.status, 201, 'JSON with a charset is fine');

  // names no account can have are simply a wrong sign-in, and do not reach the database
  r = await call(sec, 'POST', 'login', { body: { username: 'a:b*c', pin: '582039' } });
  eq(r.status, 401, 'an impossible name is a wrong sign-in');
  ok(!Array.from(sec._data.keys()).some((k) => k.includes('a:b*c')), 'and leaves nothing in the database');

  // a rate-limit counter that lost its expiry gets one back (it would otherwise lock someone out for good)
  await sec.cmd('SET', 'sq:rl:test:x', '3');
  await auth.rateLimit(sec, 'test', 'x', 10, 60);
  ok(Number(await sec.cmd('TTL', 'sq:rl:test:x')) > 0, 'a counter without an expiry gets one');

  // at most 100 PIN attempts a day on one account, from anywhere
  await sec.cmd('SET', 'sq:rl:login-acct-day:json_ok', 100, 'EX', 86400);
  r = await call(sec, 'POST', 'login', { body: { username: 'json_ok', pin: '582039' }, ip: '10.9.9.9' });
  eq(r.status, 429, 'the daily cap on sign-in attempts');
  ok(/tomorrow/.test(r.body.error || ''), 'says when to come back', r.body);

  // PIN checks while signed in are limited like signing in
  r = await call(sec, 'POST', 'signup', { body: { username: 'pin_guard', pin: '582039' }, ip: '10.3.3.2' });
  const tokG = r.body.token;
  for (let i = 0; i < 6; i++) await call(sec, 'POST', 'delete-account', { token: tokG, body: { pin: '111111' }, ip: '10.3.3.3' });
  r = await call(sec, 'POST', 'delete-account', { token: tokG, body: { pin: '582039' }, ip: '10.3.3.3' });
  eq(r.status, 429, 'guessing a PIN through "delete account" is limited');

  // two sign-ups for the same name at the same moment, on a database with some delay: exactly one gets it
  const slow = {
    kind: 'slow',
    cmd: async (...a) => { await new Promise((ok2) => setTimeout(ok2, 3)); return sec.cmd(...a); },
    pipe: async (c) => { await new Promise((ok2) => setTimeout(ok2, 3)); return sec.pipe(c); },
    multi: async (c) => { await new Promise((ok2) => setTimeout(ok2, 3)); return sec.multi(c); },
  };
  const both = await Promise.all([
    call(slow, 'POST', 'signup', { body: { username: 'Twin_Name', pin: '582039' }, ip: '10.4.4.1' }),
    call(slow, 'POST', 'signup', { body: { username: 'twin_name', pin: '730591' }, ip: '10.4.4.2' }),
  ]);
  eq(both.map((x) => x.status).sort().join(','), '201,409', 'one name, two sign-ups at once: one wins');
  const firstWon = both[0].status === 201;
  r = await call(sec, 'POST', 'login', { body: { username: 'twin_name', pin: firstWon ? '582039' : '730591' }, ip: '10.4.4.3' });
  eq(r.status, 200, 'the winner’s PIN works');
  r = await call(sec, 'POST', 'login', { body: { username: 'twin_name', pin: firstWon ? '730591' : '582039' }, ip: '10.4.4.3' });
  eq(r.status, 401, 'the other PIN does not');
  await sec.cmd('SET', 'sq:uc:held_name', '1', 'EX', 30);          // a sign-up that died while writing this name
  r = await call(sec, 'POST', 'signup', { body: { username: 'held_name', pin: '582039' }, ip: '10.4.4.4' });
  eq(r.status, 409, 'a name being written by another sign-up cannot be taken');
  advance(31000);
  r = await call(sec, 'POST', 'signup', { body: { username: 'held_name', pin: '582039' }, ip: '10.4.4.4' });
  eq(r.status, 201, 'the hold lapses by itself');

  // PIN_PEPPER can be added after people have signed up: their PINs are re-hashed with it when they next sign in
  delete process.env.PIN_PEPPER;
  r = await call(sec, 'POST', 'signup', { body: { username: 'early_bird', pin: '582039' }, ip: '10.5.5.5' });
  const before = await auth.getUser(sec, 'early_bird');
  eq(before.pv, '0', 'a PIN hashed without a pepper is marked so');
  process.env.PIN_PEPPER = 'p'.repeat(40);
  r = await call(sec, 'POST', 'login', { body: { username: 'early_bird', pin: '582039' }, ip: '10.5.5.5' });
  eq(r.status, 200, 'it still works after the pepper is added');
  const after = await auth.getUser(sec, 'early_bird');
  ok(after.pv === '1' && after.hash !== before.hash, 'and is re-hashed with the pepper', after);
  r = await call(sec, 'POST', 'login', { body: { username: 'early_bird', pin: '582039' }, ip: '10.5.5.6' });
  eq(r.status, 200, 'the re-hashed PIN works');
  r = await call(sec, 'POST', 'login', { body: { username: 'early_bird', pin: '582030' }, ip: '10.5.5.6' });
  eq(r.status, 401, 'a wrong PIN still fails');
  for (const withPepper of [true, false]) {          // records from before the pv mark
    if (withPepper) process.env.PIN_PEPPER = 'p'.repeat(40); else delete process.env.PIN_PEPPER;
    const made = await auth.hashPin('604817');
    const legacy = withPepper ? 'legacy_pep' : 'legacy_plain';
    await sec.cmd('HSET', 'sq:u:' + legacy, 'name', legacy, 'salt', made.salt, 'hash', made.hash, 'created', now);
    process.env.PIN_PEPPER = 'p'.repeat(40);
    r = await call(sec, 'POST', 'login', { body: { username: legacy, pin: '604817' }, ip: '10.5.5.7' });
    eq(r.status, 200, `an older record hashed ${withPepper ? 'with' : 'without'} the pepper still works`);
    eq((await auth.getUser(sec, legacy)).pv, '1', 'and is then marked as peppered');
    r = await call(sec, 'POST', 'login', { body: { username: legacy, pin: '604818' }, ip: '10.5.5.8' });
    eq(r.status, 401, 'and a wrong PIN for it still fails');
  }
  delete process.env.PIN_PEPPER;

  // network addresses are only ever stored as hashes keyed with a server secret
  const req = (ip) => ({ headers: { 'x-forwarded-for': ip } });
  process.env.IP_SALT = 'one-secret';
  const a1 = httpLib.clientId(req('203.0.113.7'));
  process.env.IP_SALT = 'another-secret';
  const a2 = httpLib.clientId(req('203.0.113.7'));
  delete process.env.IP_SALT;
  ok(a1 !== a2 && a1.length === 24, 'address hashes depend on the server secret');
  const plain = require('crypto').createHash('sha256').update('sarpa-rl::203.0.113.7').digest('hex').slice(0, 24);
  ok(httpLib.clientId(req('203.0.113.7')) !== plain, 'without IP_SALT the hash is still keyed');

  // the admin token is compared in constant time; near misses fail
  process.env.ADMIN_TOKEN = 'x'.repeat(24);
  r = await call(sec, 'POST', 'admin-delete', { body: { username: 'json_ok' }, headers: { 'x-admin-token': 'x'.repeat(23) + 'y' } });
  eq(r.status, 403, 'a token one character off is refused');
  delete process.env.ADMIN_TOKEN;
}

/** A tiny imitation of the Upstash REST API (single command, /pipeline, /multi-exec) on top of the memory store. */
async function upstashWire() {
  const backing = storeLib.memory();
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      seen.push({ url: req.url, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer tok') { res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return; }
      const body = JSON.parse(raw);
      const one = async (cmd) => { try { return { result: await backing.cmd(...cmd) }; } catch (e) { return { error: e.message }; } };
      let out;
      if (req.url === '/pipeline' || req.url === '/multi-exec') out = await Promise.all(body.map(one));
      else out = await one(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const up = storeLib.upstash(url + '/', 'tok');
  eq(await up.cmd('SET', 'k', 5, 'EX', 60, 'NX'), 'OK', 'upstash SET');
  eq(await up.cmd('INCR', 'k'), 6, 'upstash INCR');
  const piped = await up.pipe([['HSET', 'h', 'a', 1], ['HGETALL', 'h']]);
  eq(JSON.stringify(piped), JSON.stringify([1, ['a', '1']]), 'upstash pipeline');
  eq(seen[seen.length - 1].url, '/pipeline', 'pipeline endpoint');
  let threw = false;
  try { await up.cmd('HGET', 'k', 'x'); } catch (e) { threw = e instanceof storeLib.StoreError; }
  ok(threw, 'upstash errors become StoreError');
  const bad = storeLib.upstash(url, 'nope');
  threw = false;
  try { await bad.cmd('GET', 'k'); } catch (e) { threw = e instanceof storeLib.StoreError; }
  ok(threw, 'bad token becomes StoreError');
  const down = storeLib.upstash('http://127.0.0.1:9', 'tok');
  threw = false;
  try { await down.cmd('GET', 'k'); } catch (e) { threw = e instanceof storeLib.StoreError; }
  ok(threw, 'unreachable database becomes StoreError');
  // the full API on the Upstash client
  now = Date.parse('2026-11-05T06:30:00Z');
  let r = await call(up, 'POST', 'signup', { body: { username: 'wire_test', pin: '582039' } });
  eq(r.status, 201, 'signup through the Upstash client');
  r = await call(up, 'GET', 'me', { token: r.body.token });
  eq(r.body.user.name, 'wire_test', 'me through the Upstash client');
  r = await call(storeLib.upstash('http://127.0.0.1:9', 'tok'), 'GET', 'me', { token: 'x' });
  eq(r.status, 503, 'database down gives 503');
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
