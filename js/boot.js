/* Runs before the first paint (loaded without defer, in the page head). It is a file rather than inline code so that
 * the page's Content Security Policy can forbid inline scripts altogether. */
(function () {
  'use strict';

  /* ----- Sarpa's address moved (snakes-quiz.vercel.app -> www.sarpa.live) -----
   * A browser keeps a site's data (the sign-in, settings, progress) under its address, so on the old address the
   * player is sent to the new one with that data in the part of the link after "#", which is never sent to any
   * server. The new address takes it only when it comes straight from the old one (the browser says where a page was
   * opened from), within a few minutes, and only if it holds no sign-in or progress of its own yet; then the "#" part
   * is removed from the address at once, before any other script runs. Signed-in players' progress is also on the
   * server, so it follows them in any case. The new address is the one the page names as its canonical address
   * (siteUrl in js/config.js). */
  var MOVED_FROM = ['snakes-quiz.vercel.app'];
  var KEYS = ['auth', 'settings', 'outbox', 'progress', 'herpdle', 'herpdle-na'];
  var LIMIT = 30000;           // the longest "#" part sent (long addresses can fail in some browsers)
  var b64 = function (s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  var unb64 = function (s) { return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))); };

  if (MOVED_FROM.indexOf(location.hostname) >= 0) {
    var canon = document.querySelector('link[rel="canonical"]');
    var to = canon && /^https:\/\//.test(canon.href) ? canon.href.replace(/^(https:\/\/[^/]+).*$/, '$1') : null;
    if (to && to !== location.origin) {
      window.SQ_MOVING = true;              // the app does not start here
      // an old "#/guide/naja-naja" link becomes "/guide/naja-naja"
      var path = /^#\//.test(location.hash) ? location.hash.slice(1) : location.pathname + location.search;
      var frag = '';
      try {
        var pack = { v: 1, t: Date.now() };
        var any = false;
        KEYS.forEach(function (k) {
          var raw = localStorage.getItem('sarpa.v1.' + k);
          if (!raw) return;
          if (k === 'progress') { var p = JSON.parse(raw); delete p.seen; raw = JSON.stringify(p); }   // device-only, and big
          pack[k] = raw;
          any = true;
        });
        if (any) {
          frag = b64(JSON.stringify(pack));
          // too long: keep the sign-in and settings (a signed-in player's progress comes back from the server)
          if (frag.length > LIMIT) { delete pack.progress; delete pack.herpdle; delete pack['herpdle-na']; frag = b64(JSON.stringify(pack)); }
          if (frag.length > LIMIT) { delete pack.outbox; frag = b64(JSON.stringify(pack)); }
          frag = frag.length > LIMIT ? '' : '#sarpa-move=' + frag;
        }
      } catch (e) { frag = ''; }
      location.replace(to + path + frag);
      return;
    }
  }

  var moved = /^#sarpa-move=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (moved) {
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    try {
      var ref = document.referrer || '';
      var fromOld = MOVED_FROM.some(function (h) { return ref.indexOf('https://' + h + '/') === 0; });
      var fresh = !localStorage.getItem('sarpa.v1.auth') && !localStorage.getItem('sarpa.v1.progress');
      var data = fromOld && fresh ? JSON.parse(unb64(moved[1])) : null;
      if (data && data.v === 1 && Math.abs(Date.now() - data.t) < 5 * 60000) {
        KEYS.forEach(function (k) {
          if (typeof data[k] === 'string') { JSON.parse(data[k]); localStorage.setItem('sarpa.v1.' + k, data[k]); }
        });
        sessionStorage.setItem('sarpa.moved', '1');      // the app says hello once it has started
      }
    } catch (e) { /* not taken: the player signs in again, and the progress comes back from the server */ }
  }

  // Use the saved theme before the first paint, so a dark page does not flash light while the app loads.
  try {
    var t = JSON.parse(localStorage.getItem('sarpa.v1.settings') || '{}').theme;
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#121211' : '#e8e7e2');
  } catch (e) { /* storage blocked: the app sorts the theme out when it starts */ }
  // (the main fonts are preloaded by <link rel="preload"> tags in the page head)
})();
