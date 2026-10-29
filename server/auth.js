'use strict';
/* Accounts: a username and a 6-digit PIN, nothing else.
 *  - PINs are stored only as salted scrypt hashes (plus an optional server-side pepper, PIN_PEPPER).
 *  - Sessions are random tokens; the database keeps only their SHA-256, so a database leak does not leak sessions.
 *  - Sign-in attempts are rate limited per account and per network address, which makes guessing a PIN impractical.
 */
const crypto = require('crypto');
const { HttpError } = require('./http');

const K = {
  user: (u) => `sq:u:${u}`,              // hash: name, salt, hash, created, pinChanged
  session: (h) => `sq:s:${h}`,           // string: account key
  sessions: (u) => `sq:us:${u}`,         // set of session hashes
  rate: (scope, id) => `sq:rl:${scope}:${id}`,
};

const SESSION_DAYS = 180;
const SESSION_TTL = SESSION_DAYS * 86400;

const RESERVED = new Set(['admin', 'administrator', 'sarpa', 'herpdle', 'root', 'support', 'moderator', 'mod', 'staff', 'system',
  'null', 'undefined', 'guest', 'anonymous', 'anon', 'me', 'you', 'everyone', 'official', 'help', 'test', 'owner', 'inaturalist']);

// A short list of slurs and obscenities (English and Hindi, as typed in Latin letters). Matched after undoing
// common number-for-letter swaps, so "b1tch" is caught too. Ordinary words and names that happen to contain one
// (peacock, grape, Nazir) are taken out first.
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'rapist', 'nazi', 'hitler', 'porn', 'pussy', 'dick',
  'cock', 'whore', 'slut', 'bastard', 'asshole', 'wank', 'chutiya', 'chutia', 'madarchod', 'behenchod', 'bhenchod', 'bhosdi',
  'gandu', 'randi', 'lauda', 'harami', 'kamina', 'jihad', 'terrorist'];
const HARMLESS = /peacock|woodcock|shuttlecock|hancock|cockatoo|cockatiel|cockroach|cocktail|dickens|dickinson|grape|drape|scrape|trapez|nazir|nazia|nazim|randip|brandi|grandi|scunthorpe/g;

function canonical(name) { return String(name).toLowerCase(); }

function deLeet(s) {
  return s.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b').replace(/_/g, '');
}

/** Checks a username and returns it trimmed; throws a 400 with a friendly message when it is not allowed. */
function validateName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < 3 || name.length > 16) throw new HttpError(400, 'Choose a username of 3 to 16 characters.', 'bad_name');
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new HttpError(400, 'Use only letters, numbers and _ in your username.', 'bad_name');
  if (!/[A-Za-z]/.test(name)) throw new HttpError(400, 'Your username needs at least one letter.', 'bad_name');
  const low = canonical(name);
  if (RESERVED.has(low)) throw new HttpError(400, 'That username is reserved. Please pick another.', 'bad_name');
  const plain = deLeet(low).replace(HARMLESS, '');
  const bare = low.replace(/_/g, '').replace(HARMLESS, '');
  if (BLOCKED.some((w) => plain.includes(w) || bare.includes(w))) throw new HttpError(400, 'Please pick a different username.', 'bad_name');
  return name;
}

const WEAK = new Set(['123456', '654321', '123123', '112233', '121212', '123321', '102030', '000000', '696969', '159753', '147258', '258369', '987654', '123654']);

/** Checks the form of a PIN (exactly six digits). `strict` also refuses the most guessable ones, for new PINs. */
function validatePin(raw, strict) {
  const pin = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, 'Your PIN must be exactly 6 digits.', 'bad_pin');
  if (strict && (WEAK.has(pin) || /^(\d)\1{5}$/.test(pin) || /^(\d\d)\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin))) {
    throw new HttpError(400, 'That PIN is too easy to guess. Please choose a less obvious one.', 'weak_pin');
  }
  return pin;
}

function scrypt(pin, salt) {
  const pepper = process.env.PIN_PEPPER || '';
  const input = pepper ? crypto.createHmac('sha256', pepper).update(pin).digest() : pin;
  return new Promise((resolve, reject) => {
    crypto.scrypt(input, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pin, salt);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

async function checkPin(pin, rec) {
  if (!rec || !rec.salt || !rec.hash) {
    await scrypt(pin, crypto.randomBytes(16));        // same work either way, so timing does not reveal unknown names
    return false;
  }
  const got = await scrypt(pin, Buffer.from(rec.salt, 'base64'));
  const want = Buffer.from(rec.hash, 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** A fixed-window counter. Throws 429 once `limit` is exceeded within `windowSec`. */
async function rateLimit(store, scope, id, limit, windowSec, message) {
  const key = K.rate(scope, id);
  // SET NX starts the window (with its expiry) only once; INCR keeps the expiry
  const [, count] = await store.pipe([['SET', key, 0, 'EX', windowSec, 'NX'], ['INCR', key]]);
  if (Number(count) > limit) {
    const ttl = Number(await store.cmd('TTL', key));
    const mins = Math.max(1, Math.ceil((ttl > 0 ? ttl : windowSec) / 60));
    throw new HttpError(429, message || `Too many attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`, 'rate_limited');
  }
}

const toObj = (flat) => {
  const o = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};

async function getUser(store, uname) {
  const rec = toObj(await store.cmd('HGETALL', K.user(uname)));
  return rec.name ? rec : null;
}

async function createSession(store, uname) {
  const token = newToken();
  const h = sha256(token);
  await store.pipe([
    ['SET', K.session(h), uname, 'EX', SESSION_TTL],
    ['SADD', K.sessions(uname), h],
    ['EXPIRE', K.sessions(uname), SESSION_TTL],
  ]);
  return token;
}

/** The signed-in account for a request, or null. Refreshes the session's lifetime. */
async function sessionUser(store, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const h = sha256(token);
  const uname = await store.cmd('GET', K.session(h));
  if (!uname) return null;
  const [rec] = await store.pipe([['HGETALL', K.user(uname)], ['EXPIRE', K.session(h), SESSION_TTL], ['EXPIRE', K.sessions(uname), SESSION_TTL]]);
  const user = toObj(rec);
  if (!user.name) return null;
  return { key: uname, name: user.name, created: Number(user.created) || 0, tokenHash: h };
}

async function signup(store, { username, pin }, ipId) {
  const name = validateName(username);
  const p = validatePin(pin, true);
  await rateLimit(store, 'signup-ip', ipId, 20, 3600, 'Too many new accounts from this network. Please try again in an hour.');
  const uname = canonical(name);
  const { salt, hash } = await hashPin(p);
  const created = Date.now();
  // HSETNX makes the name check and the claim one atomic step, so two people cannot take the same name
  const claimed = await store.cmd('HSETNX', K.user(uname), 'name', name);
  if (Number(claimed) !== 1) {
    // a half-written record (the request that claimed it failed before saving the PIN) may be taken over
    const rec = toObj(await store.cmd('HGETALL', K.user(uname)));
    if (rec.hash) throw new HttpError(409, 'That username is taken. Please choose another.', 'name_taken');
  }
  await store.cmd('HSET', K.user(uname), 'name', name, 'salt', salt, 'hash', hash, 'created', created, 'pinChanged', created);
  const token = await createSession(store, uname);
  return { token, user: { name, created } };
}

async function login(store, { username, pin }, ipId) {
  const name = typeof username === 'string' ? username.trim() : '';
  if (!name || name.length > 32) throw new HttpError(400, 'Enter your username.', 'bad_name');
  const p = validatePin(pin, false);
  const uname = canonical(name);
  await rateLimit(store, 'login-ip', ipId, 40, 900);
  await rateLimit(store, 'login-acct', `${uname}:${ipId}`, 6, 900);
  await rateLimit(store, 'login-acct-all', uname, 30, 3600, 'Too many sign-in attempts for this account. Please try again in an hour.');
  const rec = await getUser(store, uname);
  const ok = await checkPin(p, rec);
  if (!ok) throw new HttpError(401, 'Wrong username or PIN.', 'bad_credentials');
  await store.cmd('DEL', K.rate('login-acct', `${uname}:${ipId}`));
  const token = await createSession(store, uname);
  return { token, user: { name: rec.name, created: Number(rec.created) || 0 } };
}

async function logout(store, user) {
  await store.pipe([['DEL', K.session(user.tokenHash)], ['SREM', K.sessions(user.key), user.tokenHash]]);
}

async function changePin(store, user, { pin, newPin }, ipId) {
  const p = validatePin(pin, false);
  const np = validatePin(newPin, true);
  await rateLimit(store, 'login-acct', `${user.key}:${ipId}`, 6, 900);
  const rec = await getUser(store, user.key);
  if (!(await checkPin(p, rec))) throw new HttpError(401, 'Your current PIN is not right.', 'bad_credentials');
  const { salt, hash } = await hashPin(np);
  await store.cmd('HSET', K.user(user.key), 'salt', salt, 'hash', hash, 'pinChanged', Date.now());
  // sign out every other device
  const others = (await store.cmd('SMEMBERS', K.sessions(user.key))).filter((h) => h !== user.tokenHash);
  if (others.length) await store.pipe([...others.map((h) => ['DEL', K.session(h)]), ['SREM', K.sessions(user.key), ...others]]);
  return { ok: true, signedOutOthers: others.length };
}

/** Removes the sessions and the account record; game data is removed by the caller. */
async function deleteAccount(store, user, { pin }, ipId) {
  const p = validatePin(pin, false);
  await rateLimit(store, 'login-acct', `${user.key}:${ipId}`, 6, 900);
  const rec = await getUser(store, user.key);
  if (!(await checkPin(p, rec))) throw new HttpError(401, 'Your PIN is not right.', 'bad_credentials');
  await removeAccountRecords(store, user.key);
}

async function removeAccountRecords(store, uname) {
  const all = await store.cmd('SMEMBERS', K.sessions(uname));
  await store.pipe([...all.map((h) => ['DEL', K.session(h)]), ['DEL', K.sessions(uname)], ['DEL', K.user(uname)]]);
}

module.exports = {
  K, SESSION_DAYS, canonical, validateName, validatePin, hashPin, checkPin, sha256, rateLimit, toObj,
  getUser, signup, login, logout, sessionUser, changePin, deleteAccount, removeAccountRecords,
};
