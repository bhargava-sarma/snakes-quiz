#!/usr/bin/env node
/* A local server for trying Sarpa out or testing it: serves the website and the accounts API at /api/sarpa.
 * The API uses an in-memory database (everything is forgotten when the server stops) unless Upstash details are set
 * in the environment (UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN). No packages needed.
 *
 *   node scripts/dev-server.js [port]            website + API
 *   node scripts/dev-server.js 8080 --no-api     website only, like a plain static host (no accounts)
 *   node scripts/dev-server.js 8080 --no-store   API without a database (accounts switched off)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const port = parseInt(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || '8080', 10);
const noApi = args.includes('--no-api');
const noStore = args.includes('--no-store');
// --shell: every page address gets index.html, never a prerendered copy (scripts/build-pages.js uses this, so that each
// page is drawn by the app alone)
const shellOnly = args.includes('--shell');
const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
if (!noStore && !hasUpstash) process.env.SARPA_STORE = 'memory';

const ROOT = path.resolve(__dirname, '..');
const { handler } = require(path.join(ROOT, 'server', 'app'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.ico': 'image/x-icon',
};

// The response headers that vercel.json gives each address (security headers, caching), so that local runs and the
// tests see what visitors get. Exact paths and patterns ending in "(.*)" are understood, which is all vercel.json uses.
const VERCEL = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const matches = (source, pathname) => {
  const parts = source.split('(.*)').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('^' + parts.join('.*') + '$').test(pathname);
};
const vercelHeaders = (pathname) => Object.assign({}, ...(VERCEL.headers || [])
  .filter((rule) => matches(rule.source, pathname))
  .map((rule) => Object.fromEntries(rule.headers.map((x) => [x.key, x.value]))));

/**
 * Where a page lives, the way Vercel finds it with "cleanUrls": "/guide/naja-naja" is guide/naja-naja.html (or a
 * folder's index.html). Returns the file, or null.
 */
function pageFile(rel) {
  const tries = rel === '/' ? ['index.html'] : [rel, rel + '.html', path.join(rel, 'index.html')];
  for (const t of tries) {
    const f = path.join(ROOT, path.normalize(t));
    if (!f.startsWith(ROOT + path.sep)) return null;
    try { if (fs.statSync(f).isFile()) return f; } catch (e) { /* try the next */ }
  }
  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const extra = vercelHeaders(url.pathname);
  if (url.pathname === '/api/sarpa' && !noApi) {
    Object.entries(extra).forEach(([k, v]) => res.setHeader(k, v));
    handler(req, res, noStore ? { store: null } : {}).catch((e) => { console.error(e); res.statusCode = 500; res.end(); });
    return;
  }
  // Vercel serves its analytics scripts under /_vercel/; here they are empty stand-ins, so nothing is ever collected
  if (url.pathname.startsWith('/_vercel/')) {
    const script = req.method === 'GET' && url.pathname.endsWith('.js');
    res.writeHead(script ? 200 : 204, Object.assign({}, extra, script ? { 'Content-Type': 'text/javascript; charset=utf-8' } : {}));
    res.end(script ? '/* Vercel analytics run only on Vercel */\n' : undefined);
    return;
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  // like Vercel with "trailingSlash": false and "cleanUrls": true: "/guide/" and "/guide.html" move to "/guide"
  const clean = rel.length > 1 && rel.endsWith('/') ? rel.replace(/\/+$/, '') : /\.html$/i.test(rel) ? rel.replace(/(\/index)?\.html$/i, '') || '/' : null;
  if (clean !== null && clean !== rel) {
    res.writeHead(308, Object.assign({}, extra, { Location: encodeURI(clean) + url.search }));
    res.end();
    return;
  }
  if (/[\\/]\.(git|env)/.test(path.normalize(rel))) { res.writeHead(403); res.end(); return; }
  const file = shellOnly && !/\.[a-z0-9]+$/i.test(rel) ? pageFile('/') : pageFile(rel);
  const missing = !file;
  // the site's own "not found" page, with status 404 (before scripts/build-pages.js has made it: the app's page, which
  // draws whatever the address names)
  const send = missing ? pageFile('/404') || (/\.[a-z0-9]+$/i.test(rel) ? null : pageFile('/')) : file;
  if (!send) { res.writeHead(404, Object.assign({}, extra, { 'Content-Type': 'text/html; charset=utf-8' })); res.end('<h1>Not found</h1>'); return; }
  fs.stat(send, (err, st) => {
    if (err) { res.writeHead(500); res.end(); return; }
    res.writeHead(missing ? 404 : 200, Object.assign({ 'Cache-Control': 'no-cache' }, extra, { 'Content-Type': TYPES[path.extname(send).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size }));
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(send).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  const db = noApi ? 'no API' : noStore ? 'API without a database' : hasUpstash ? 'API with Upstash' : 'API with an in-memory database';
  console.log(`Sarpa on http://127.0.0.1:${port}/  (${db})`);
});
