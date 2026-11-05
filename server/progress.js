'use strict';
/* A signed-in player's progress (see js/sync.js), kept on the server so that it follows them to other browsers and
 * devices. The server only stores the copy it is given, after checking its size and shape, and hands it back to the
 * same account; the merging of two devices' copies happens in the browser. A revision number lets a device notice
 * that another device saved in between, so it can merge that in first. */
const { HttpError } = require('./http');
const { rateLimit } = require('./auth');

const K = { progress: (u) => `sq:pg:${u}` };
const MAX_BYTES = 200 * 1024;

async function get(store, user) {
  const [doc, rev] = await store.pipe([['HGET', K.progress(user.key), 'doc'], ['HGET', K.progress(user.key), 'rev']]);
  let parsed = null;
  try { parsed = doc ? JSON.parse(doc) : null; } catch (e) { parsed = null; }
  return { doc: parsed, rev: Number(rev) || 0 };
}

async function put(store, user, body) {
  const doc = body.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.v !== 2) throw new HttpError(400, 'That is not Sarpa progress.', 'bad_progress');
  const text = JSON.stringify(doc);
  if (text.length > MAX_BYTES) throw new HttpError(413, 'Your progress is too large to save.', 'too_large');
  const base = Number(body.rev) || 0;
  await rateLimit(store, 'progress', user.key, 240, 3600, 'Your progress is being saved very often. Please wait a little.');
  const cur = await get(store, user);
  if (cur.rev !== base) {
    const e = new HttpError(409, 'Your progress changed on another device.', 'progress_conflict');
    e.extra = cur;                  // the newer copy, to merge with
    throw e;
  }
  const rev = base + 1;
  await store.cmd('HSET', K.progress(user.key), 'doc', text, 'rev', rev, 'at', Date.now());
  return { ok: true, rev };
}

module.exports = { K, MAX_BYTES, get, put };
