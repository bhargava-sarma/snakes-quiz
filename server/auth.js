'use strict';
/* Accounts: a username and a 6-digit PIN, nothing else.
 *  - PINs are stored only as salted scrypt hashes, made with a server-side pepper (PIN_PEPPER) when there is one.
 *  - Sessions are random tokens; the database keeps only their SHA-256, so a database leak does not leak sessions.
 *  - Every PIN check is rate limited per account and per network address, which makes guessing a PIN impractical.
 */
const crypto = require('crypto');
const { HttpError } = require('./http');

const K = {
  user: (u) => `sq:u:${u}`,              // hash: name, salt, hash, pv, created, pinChanged
  claim: (u) => `sq:uc:${u}`,            // string: held for a moment while the account for a name is being written
  session: (h) => `sq:s:${h}`,           // string: account key
  sessions: (u) => `sq:us:${u}`,         // set of session hashes
  rate: (scope, id) => `sq:rl:${scope}:${id}`,
};

const SESSION_DAYS = 180;
const SESSION_TTL = SESSION_DAYS * 86400;

const RESERVED = new Set(['admin', 'administrator', 'sarpa', 'herpdle', 'root', 'support', 'moderator', 'mod', 'staff', 'system',
  'null', 'undefined', 'guest', 'anonymous', 'anon', 'me', 'you', 'everyone', 'official', 'help', 'test', 'owner', 'inaturalist']);

// A short list of slurs and obscenities (English and Hindi, as typed in Latin letters), matched as typed and after
// undoing common number-for-letter swaps, so "b1tch" is caught too. These are refused wherever they appear:
const BLOCKED = ['fuck', 'shit', 'cunt', 'cock', 'dick', 'wank', 'rape', 'rapist', 'bitch', 'nigg', 'whore', 'slut', 'porn',
  'pussy', 'bastard', 'asshole', 'faggot', 'nazi', 'hitler', 'terrorist', 'madarchod', 'behenchod', 'bhenchod', 'bhosdi',
  'chutiya', 'chutia'];
// These short ones only as a whole word or at the start or end of one (words are split at _ and digits), because
// inside longer words and names they are usually innocent:
const BLOCKED_EDGE = ['fag', 'randi', 'lauda', 'kamina', 'gandu', 'harami', 'jihad'];
// Ordinary words and names that contain a blocked word are taken out before checking.
const HARMLESS = new RegExp([
  'peacock', 'woodcock', 'shuttlecock', 'hancock', 'hitchcock', 'babcock', 'gamecock', 'weathercock', 'cockatoo', 'cockatiel',
  'cockroach', 'cocktail', 'cockpit', 'cocker', 'cockney', 'cockle', 'cockscomb', 'cockburn',
  'dickens', 'dickinson', 'dickson', 'riddick', 'benedick',
  'grape', 'drape', 'scrape', 'trapez', 'therap', 'parapet', 'rapeseed',
  'nazir', 'nazia', 'naziya', 'nazim', 'nazish', 'nazifa', 'nazila',
  'randip', 'brandi', 'grandi', 'scunthorpe', 'wankhede', 'swank', 'obiwan', 'kaminari', 'fagun', 'fagan',
  'shital', 'shitansh', 'shitij', '[aikru]shit',     // Shital, Shitanshu, Ishita, Nishit, Akshita, Kshitij, Harshit, Darshit
].join('|'), 'g');

function canonical(name) { return String(name).toLowerCase(); }

function deLeet(s) {
  return s.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
}

/** True when a username contains a blocked word (see the lists above). */
function offensive(name) {
  const low = canonical(name);
  for (const variant of [low, deLeet(low)]) {
    // "f_u_c_k" and "obi_wan_kenobi" are read as one word for the first list
    if (BLOCKED.some((w) => variant.replace(/[^a-z]+/g, '').replace(HARMLESS, '_').includes(w))) return true;
    for (const word of variant.replace(HARMLESS, '_').split(/[^a-z]+/)) {
      if (word && BLOCKED_EDGE.some((w) => word.startsWith(w) || word.endsWith(w))) return true;
    }
  }
  return false;
}

/** Checks a username and returns it trimmed; throws a 400 with a friendly message when it is not allowed. */
function validateName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < 3 || name.length > 16) throw new HttpError(400, 'Choose a username of 3 to 16 characters.', 'bad_name');
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new HttpError(400, 'Use only letters, numbers and _ in your username.', 'bad_name');
  if (!/[A-Za-z]/.test(name)) throw new HttpError(400, 'Your username needs at least one letter.', 'bad_name');
  if (RESERVED.has(canonical(name))) throw new HttpError(400, 'That username is reserved. Please pick another.', 'bad_name');
  if (offensive(name)) throw new HttpError(400, 'That username contains a word that is not allowed here. Please pick a different one.', 'bad_name');
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

/*
 * A PIN hash is scrypt(PIN, salt), or scrypt(HMAC(PIN_PEPPER, PIN), salt) when the server has a pepper. The pepper
 * lives only in the server's settings, so a copy of the database alone is not enough to try all million PINs.
 * Each record notes which kind it is (pv: '1' with the pepper, '0' without; records from before this have no pv).
 * A PIN hashed without the pepper is re-hashed with it the next time its owner signs in, so PIN_PEPPER can be added
 * at any time. It must never be changed or removed once set, or the PINs hashed with it stop working.
 */
const pepper = () => process.env.PIN_PEPPER || '';

function scrypt(pin, salt, withPepper) {
  const input = withPepper ? crypto.createHmac('sha256', pepper()).update(pin).digest() : pin;
  return new Promise((resolve, reject) => {
    crypto.scrypt(input, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const withPepper = !!pepper();
  const hash = await scrypt(pin, salt, withPepper);
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), pv: withPepper ? '1' : '0' };
}

/** Checks a PIN against an account record. Returns false, or { upgrade } (true: re-hash it with the pepper). */
async function checkPin(pin, rec) {
  if (!rec || !rec.salt || !rec.hash) {
    await scrypt(pin, crypto.randomBytes(16), false);        // same work either way, so timing does not reveal unknown names
    return false;
  }
  const salt = Buffer.from(rec.salt, 'base64');
  const want = Buffer.from(rec.hash, 'base64');
  const has = !!pepper();
  if (rec.pv === '1' && !has) console.error('[sarpa api] PIN_PEPPER is missing, so PINs hashed with it cannot be checked');
  // the ways this record may have been hashed, most likely first
  const ways = rec.pv === '1' ? [true] : rec.pv === '0' ? [false] : has ? [true, false] : [false];
  for (const withPepper of ways) {
    if (withPepper && !has) continue;
    const got = await scrypt(pin, salt, withPepper);
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) return { upgrade: has && (!withPepper || rec.pv !== '1') };
  }
  return false;
}

async function upgradePin(store, uname, pin) {
  const { salt, hash, pv } = await hashPin(pin);
  await store.cmd('HSET', K.user(uname), 'salt', salt, 'hash', hash, 'pv', pv);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** A fixed-window counter. Throws 429 once `limit` is exceeded within `windowSec`. */
async function rateLimit(store, scope, id, limit, windowSec, message) {
  const key = K.rate(scope, id);
  // SET NX starts the window (with its expiry) only once; INCR keeps the expiry. Should the key run out between the
  // two, INCR makes a new one without an expiry, which is then given one: a counter must never outlive its window.
  const [, count, left] = await store.pipe([['SET', key, 0, 'EX', windowSec, 'NX'], ['INCR', key], ['TTL', key]]);
  if (Number(left) === -1) await store.cmd('EXPIRE', key, windowSec);
  if (Number(count) > limit) {
    const mins = Math.max(1, Math.ceil((Number(left) > 0 ? Number(left) : windowSec) / 60));
    throw new HttpError(429, message || `Too many attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`, 'rate_limited');
  }
}

/** Counts one PIN attempt on an account: from one network address, and from everywhere in an hour and in a day. */
async function pinAttempt(store, uname, ipId) {
  await rateLimit(store, 'login-acct', `${uname}:${ipId}`, 6, 900);
  await rateLimit(store, 'login-acct-all', uname, 30, 3600, 'Too many sign-in attempts for this account. Please try again in an hour.');
  await rateLimit(store, 'login-acct-day', uname, 100, 86400, 'Too many sign-in attempts for this account today. Please try again tomorrow.');
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
  const taken = () => new HttpError(409, 'That username is taken. Please choose another.', 'name_taken');
  const { salt, hash, pv } = await hashPin(p);
  // Only one sign-up at a time may hold a name while its account is written, so two people choosing the same name at
  // the same moment cannot both get in. The hold lapses by itself if a request dies half-way.
  if ((await store.cmd('SET', K.claim(uname), '1', 'EX', 30, 'NX')) !== 'OK') throw taken();
  try {
    if (await store.cmd('HGET', K.user(uname), 'hash')) throw taken();
    const created = Date.now();
    await store.cmd('HSET', K.user(uname), 'name', name, 'salt', salt, 'hash', hash, 'pv', pv, 'created', created, 'pinChanged', created);
    const token = await createSession(store, uname);
    return { token, user: { name, created } };
  } finally {
    await store.cmd('DEL', K.claim(uname));
  }
}

async function login(store, { username, pin }, ipId) {
  const name = typeof username === 'string' ? username.trim() : '';
  if (!name || name.length > 32) throw new HttpError(400, 'Enter your username.', 'bad_name');
  const p = validatePin(pin, false);
  const wrong = () => new HttpError(401, 'Wrong username or PIN.', 'bad_credentials');
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw wrong();         // no account can have such a name
  const uname = canonical(name);
  await rateLimit(store, 'login-ip', ipId, 40, 900);
  await pinAttempt(store, uname, ipId);
  const rec = await getUser(store, uname);
  const ok = await checkPin(p, rec);
  if (!ok) throw wrong();
  if (ok.upgrade) await upgradePin(store, uname, p);
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
  await pinAttempt(store, user.key, ipId);
  const rec = await getUser(store, user.key);
  if (!(await checkPin(p, rec))) throw new HttpError(401, 'Your current PIN is not right.', 'bad_credentials');
  const { salt, hash, pv } = await hashPin(np);
  await store.cmd('HSET', K.user(user.key), 'salt', salt, 'hash', hash, 'pv', pv, 'pinChanged', Date.now());
  // sign out every other device
  const others = (await store.cmd('SMEMBERS', K.sessions(user.key))).filter((h) => h !== user.tokenHash);
  if (others.length) await store.pipe([...others.map((h) => ['DEL', K.session(h)]), ['SREM', K.sessions(user.key), ...others]]);
  return { ok: true, signedOutOthers: others.length };
}

/** Checks the PIN of a signed-in account before something that cannot be undone (deleting the account). */
async function confirmPin(store, user, { pin }, ipId) {
  const p = validatePin(pin, false);
  await pinAttempt(store, user.key, ipId);
  const rec = await getUser(store, user.key);
  if (!(await checkPin(p, rec))) throw new HttpError(401, 'Your PIN is not right.', 'bad_credentials');
}

/** Removes the sessions and the account record (game data is removed separately, by games.removePlayer). */
async function removeAccountRecords(store, uname) {
  const all = await store.cmd('SMEMBERS', K.sessions(uname));
  await store.pipe([...all.map((h) => ['DEL', K.session(h)]), ['DEL', K.sessions(uname)], ['DEL', K.user(uname)]]);
}

module.exports = {
  K, SESSION_DAYS, canonical, validateName, offensive, validatePin, hashPin, checkPin, sha256, rateLimit, toObj,
  getUser, signup, login, logout, sessionUser, changePin, confirmPin, removeAccountRecords,
};
