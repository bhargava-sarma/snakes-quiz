'use strict';
/* Small helpers for the API: errors with an HTTP status, reading the request, writing JSON. They work with plain Node
 * request/response objects and with Vercel's (which add req.body and req.query). */
const crypto = require('crypto');
const { credentials } = require('./store');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

const MAX_BODY = 64 * 1024;

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  // Vercel has usually parsed it already
  try {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
      const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
      return text ? JSON.parse(text) : {};
    }
  } catch (e) {
    throw new HttpError(400, 'The request was not valid JSON.', 'bad_json');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'The request is too large.', 'too_large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, 'The request was not valid JSON.', 'bad_json'); }
}

function query(req) {
  if (req.query && typeof req.query === 'object') return req.query;
  const u = new URL(req.url, 'http://localhost');
  return Object.fromEntries(u.searchParams.entries());
}

function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(Array.isArray(h) ? h[0] : h);
  return m ? m[1].trim() : '';
}

/**
 * True when a request carries a JSON body, or no body at all. Forms and plain text are refused: another website can
 * make a visitor's browser send those to this API without asking, but a JSON request from another site needs the
 * browser to ask first (CORS), and this API never says yes.
 */
function jsonOrEmpty(req) {
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json') return true;
  return !type && !Number(req.headers['content-length'] || 0) && !req.headers['transfer-encoding'];
}

/** The secret that keys the address hashes: IP_SALT, or else a secret the deployment already has. */
const addressKey = () => process.env.IP_SALT || process.env.PIN_PEPPER || credentials(process.env)[1] || 'sarpa-local';

/** A short hash of the caller's network address, keyed with a server secret, only used for rate limits. Without
 * that secret it cannot be turned back into the address, even by trying every possible one. */
function clientId(req) {
  const fwd = req.headers['x-forwarded-for'];
  const raw = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim() || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return crypto.createHmac('sha256', addressKey()).update('sarpa-rl:' + raw).digest('hex').slice(0, 24);
}

function send(res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!headers['Cache-Control']) res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.end(text);
}

module.exports = { HttpError, readBody, query, bearer, jsonOrEmpty, clientId, send };
