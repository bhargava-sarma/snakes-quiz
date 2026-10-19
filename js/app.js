/* App shell: hash router, theme, navigation and start-up. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;

  SQ.views = SQ.views || {};

  /* ---------- theme ---------- */

  SQ.theme = {
    apply() {
      const t = SQ.store.settings().theme;
      const root = document.documentElement;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', SQ.theme.effective() === 'dark' ? '#0d1713' : '#1c6b4a');
    },
    effective() {
      const t = SQ.store.settings().theme;
      if (t === 'light' || t === 'dark') return t;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    toggle() {
      SQ.store.saveSettings({ theme: SQ.theme.effective() === 'dark' ? 'light' : 'dark' });
      SQ.theme.apply();
      SQ.app.refreshThemeButton();
    },
  };

  /* ---------- router ---------- */

  const routes = [];
  let cleanup = null;
  let token = 0;

  function add(path, handler) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ re, keys, handler, path });
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const q = raw.indexOf('?');
    const path = q >= 0 ? raw.slice(0, q) : raw;
    return { path: path || '/', query: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '') };
  }

  async function render() {
    const my = ++token;
    const { path, query } = parseHash();
    let route = null, params = {};
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) { route = r; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; }
    }
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    SQ.ui.closeModal();
    const main = document.getElementById('main');
    if (!route) route = routes[0];
    let result;
    try {
      result = await route.handler({ params, query, path });
    } catch (err) {
      console.error(err);
      result = { node: h('div.page', SQ.ui.empty('Something went wrong', String(err && err.message || err), h('a.btn.btn-primary', { href: '#/' }, 'Back to home'))) };
    }
    if (my !== token) return; // a newer navigation won
    const view = result && result.nodeType ? { node: result } : result;
    SQ.clear(main);
    main.appendChild(view.node);
    cleanup = view.cleanup || null;
    document.title = (view.title ? view.title + ' · ' : '') + 'Sarpa · Indian Snake Quiz';
    document.body.dataset.view = view.view || '';
    document.body.classList.toggle('in-quiz', !!view.focus);
    window.scrollTo(0, 0);
    SQ.app.markNav(path);
    main.focus({ preventScroll: true });
  }

  SQ.go = function (path) {
    const target = '#' + path;
    if (location.hash === target) render(); else location.hash = target;
  };

  /* ---------- shell ---------- */

  const NAV = [
    { path: '/play', label: 'Play', ico: 'play' },
    { path: '/daily', label: 'Daily', ico: 'calendar' },
    { path: '/guide', label: 'Field guide', ico: 'book' },
    { path: '/stats', label: 'My progress', ico: 'chart' },
    { path: '/safety', label: 'Snakebite safety', ico: 'shield' },
  ];

  const app = (SQ.app = {
    markNav(path) {
      SQ.$$('[data-nav]').forEach((a) => {
        const on = path === a.dataset.nav || (a.dataset.nav !== '/' && path.startsWith(a.dataset.nav + '/'));
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    },

    refreshThemeButton() {
      const btn = document.getElementById('theme-btn');
      if (!btn) return;
      SQ.clear(btn);
      btn.appendChild(icon(SQ.theme.effective() === 'dark' ? 'sun' : 'moon'));
      btn.setAttribute('aria-label', SQ.theme.effective() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    },

    buildShell() {
      const header = document.getElementById('site-header');
      header.appendChild(h('div.wrap.header-in',
        h('a.brand', { href: '#/', 'data-nav': '/', 'aria-label': 'Sarpa home' }, h('img.brand-logo', { src: 'assets/icon.svg', width: 38, height: 38, alt: '' }), h('span.brand-text', h('strong', 'Sarpa'), h('small', 'Indian snake quiz'))),
        h('nav.nav', { 'aria-label': 'Main' }, NAV.map((n) => h('a', { href: '#' + n.path, 'data-nav': n.path }, n.label))),
        h('div.header-tools',
          h('button.icon-btn#theme-btn', { type: 'button', onclick: SQ.theme.toggle }),
          h('button.btn.btn-sm.btn-quit', { type: 'button', id: 'quit-btn', hidden: true }, icon('x', { size: 16 }), 'Quit'))));

      const tabbar = document.getElementById('tabbar');
      const tabs = [
        { path: '/', label: 'Home', ico: 'home' },
        { path: '/play', label: 'Play', ico: 'play' },
        { path: '/guide', label: 'Guide', ico: 'book' },
        { path: '/stats', label: 'Progress', ico: 'chart' },
        { path: '/safety', label: 'Safety', ico: 'shield' },
      ];
      tabs.forEach((t) => tabbar.appendChild(h('a.tab', { href: '#' + t.path, 'data-nav': t.path }, icon(t.ico, { size: 22 }), h('span', t.label))));

      document.getElementById('site-footer').appendChild(h('div.wrap.footer-in',
        h('p', h('strong', 'Sarpa'), ' is a free educational snake-identification quiz. Photos are community observations from ', h('a', { href: 'https://www.inaturalist.org', target: '_blank', rel: 'noopener' }, 'iNaturalist'), ', used under their Creative Commons licences.'),
        h('p.footer-warn', icon('warn', { size: 16 }), ' Never touch, corner or try to catch a wild snake. In a snakebite emergency go to a hospital at once. ', h('a', { href: '#/safety' }, 'Snakebite first aid')),
        h('p.footer-links', h('a', { href: '#/about' }, 'About & data'), h('a', { href: '#/credits' }, 'Photo credits'), h('a', { href: '#/guide' }, 'Field guide'))));
      app.refreshThemeButton();
    },

    start() {
      SQ.theme.apply();
      try {
        SQ.data.init();
      } catch (err) {
        console.error(err);
        document.getElementById('main').appendChild(h('div.page', SQ.ui.empty('Could not load the snake data', String(err.message || err))));
        return;
      }
      app.buildShell();

      add('/', SQ.views.home);
      add('/play', SQ.views.setup);
      add('/quiz', SQ.views.quiz);
      add('/results', SQ.views.results);
      add('/daily', SQ.views.daily);
      add('/guide', SQ.views.guide);
      add('/guide/:id', SQ.views.species);
      add('/compare', SQ.views.compare);
      add('/learn', SQ.views.learn);
      add('/safety', SQ.views.safety);
      add('/stats', SQ.views.stats);
      add('/about', SQ.views.about);
      add('/credits', SQ.views.credits);

      window.addEventListener('hashchange', render);
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => { SQ.theme.apply(); app.refreshThemeButton(); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
      }
      render();
      app.registerServiceWorker();
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
      window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    },
  });

  document.addEventListener('DOMContentLoaded', app.start);
})();
