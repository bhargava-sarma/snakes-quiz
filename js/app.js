/* App shell: router, theme, navigation and start-up. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;

  SQ.views = SQ.views || {};

  /* ---------- theme ---------- */

  const THEME_COLOR = { light: '#e8e7e2', dark: '#121211' };

  SQ.theme = {
    apply() {
      const t = SQ.store.settings().theme;
      const root = document.documentElement;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', THEME_COLOR[SQ.theme.effective()]);
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
      window.dispatchEvent(new Event('sarpa-theme'));      // canvases (the pixel snake) redraw in the new colours
    },
  };

  /* ---------- router ----------
   * Every page has a real address ("/guide/naja-naja"), so that search engines can find it and people can share it.
   * Links between pages are followed without reloading; the server also has a prerendered copy of every page
   * (scripts/build-pages.js), so any address works when it is opened directly. Old addresses ("/#/guide/naja-naja")
   * still work: they are turned into the new ones. */

  const routes = [];
  let cleanup = null;
  let token = 0;
  let shown = '';            // the address of the page drawn last (path and query)

  function add(path, handler) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ re, keys, handler, path });
  }

  // a broken link (a stray "%") would otherwise stop the page from changing at all
  const decode = (s) => { try { return decodeURIComponent(s); } catch (e) { return s; } };

  /** The current page: its path without a trailing slash or ".html" ("/guide/naja-naja") and its query. */
  function parseLocation() {
    const path = location.pathname.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '').replace(/\/+$/, '') || '/';
    return { path, query: new URLSearchParams(location.search) };
  }

  /** An old address ("#/guide/naja-naja") becomes the new one ("/guide/naja-naja"). True when it did. */
  function fromHash() {
    const m = /^#(\/[^#]*)$/.exec(location.hash);
    if (!m) return false;
    try { history.replaceState(history.state, '', m[1]); } catch (e) { return false; }
    return true;
  }

  /** Remembers how far down the current page is, so that the back button can return there. */
  function saveScroll() {
    try { history.replaceState(Object.assign({}, history.state, { y: Math.round(window.scrollY) }), ''); } catch (e) { /* ignore */ }
  }

  /** Is this address a page of the app (rather than a file, the API or another site)? */
  function isPage(url) {
    if (url.origin !== location.origin) return false;
    if (/^\/(api|_vercel|images|assets|data|css|js|server|scripts|docs)\//.test(url.pathname)) return false;
    return !/\.[a-z0-9]{1,5}$/i.test(url.pathname) || /\.html$/i.test(url.pathname);
  }

  /**
   * Draws the page for the current address.
   * quiet: the same page drawn again, keeping the scroll position and focus. y: scroll there (back and forward).
   */
  async function render(opts) {
    const o = opts || {};
    const scrollY = window.scrollY;
    const my = ++token;
    const { path, query } = parseLocation();
    shown = location.pathname + location.search;
    let route = null;
    const params = {};
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) { route = r; r.keys.forEach((k, i) => (params[k] = decode(m[i + 1]))); break; }
    }
    if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.error(e); } }
    cleanup = null;
    SQ.ui.closeModal();
    const main = document.getElementById('main');
    let result;
    try {
      result = await (route ? route.handler({ params, query, path }) : SQ.views.notFound({ path }));
    } catch (err) {
      console.error(err);
      result = { node: h('div.page.wrap', SQ.ui.empty('Something went wrong', String(err && err.message || err), h('a.btn.btn-primary', { href: '/' }, 'Back to home'))), seo: { title: 'Something went wrong · Sarpa', noindex: true } };
    }
    if (my !== token) return; // a newer navigation won
    const view = result && result.nodeType ? { node: result } : (result || { node: h('div') });
    SQ.clear(main);
    main.appendChild(view.node);
    cleanup = view.cleanup || null;
    SQ.seo.apply(view.seo || { title: (view.title ? view.title + ' · ' : '') + 'Sarpa' }, path);
    document.body.dataset.view = view.view || '';
    document.body.classList.toggle('in-quiz', !!view.focus);
    if (o.quiet) window.scrollTo(0, scrollY);
    else if (typeof o.y === 'number') window.scrollTo(0, o.y);
    else SQ.scrollTop();
    SQ.app.markNav(path);
    if (!o.quiet) main.focus({ preventScroll: true });
    if (typeof view.after === 'function') view.after();
  }

  /** Goes to a page of the site ("/guide?area=na") without reloading. replace: instead of adding a history entry. */
  SQ.go = function (to, opts) {
    const replace = !!(opts && opts.replace);
    if (!replace && to === location.pathname + location.search) { render(); return; }
    if (!replace) saveScroll();
    try { history[replace ? 'replaceState' : 'pushState']({ y: 0 }, '', to); } catch (e) { location.href = to; return; }
    render();
  };

  /** Shows another address for the page on screen without drawing it again (a filter or tab on the same page). */
  SQ.setUrl = function (to) {
    try { history.replaceState(history.state, '', to); } catch (e) { return; }
    shown = location.pathname + location.search;
  };

  /** Draws the current page again (after something it shows has changed). */
  SQ.refresh = (opts) => render(opts);

  /* ---------- shell ---------- */

  const NAV = [
    { path: '/play', label: 'Play', ico: 'play', tab: true },
    { path: '/herpdle', label: 'Herpdle', ico: 'grid', tab: true },
    { path: '/daily', label: 'Daily', ico: 'calendar', tab: true },
    { path: '/ranks', label: 'Ranks', ico: 'trophy', tab: true },
    { path: '/guide', label: 'Guide', ico: 'book', tab: true },
    { path: '/safety', label: 'Safety', ico: 'shield' },
  ];

  const app = (SQ.app = {
    markNav(path) {
      SQ.$$('[data-nav]').forEach((a) => {
        const on = path === a.dataset.nav || (a.dataset.nav !== '/' && path.startsWith(a.dataset.nav + '/'))
          || (a.dataset.nav === '/guide' && (path === '/compare' || path.startsWith('/compare/') || path === '/learn'))
          || (a.dataset.nav === '/play' && (path === '/results' || path === '/quiz'));
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
    },

    refreshThemeButton() {
      const btn = document.getElementById('theme-btn');
      if (!btn) return;
      const dark = SQ.theme.effective() === 'dark';
      btn.dataset.mode = dark ? 'dark' : 'light';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
      btn.setAttribute('aria-checked', dark ? 'true' : 'false');
    },

    /** The header, footer and tab bar (drawn again from scratch: the page may hold a prerendered copy of them). */
    buildShell() {
      ['site-header', 'tabbar', 'site-footer'].forEach((id) => SQ.clear(document.getElementById(id)));
      const header = document.getElementById('site-header');
      const safety = SQ.homeArea() === 'na' ? '/safety/north-america' : '/safety';
      header.appendChild(h('div.wrap.header-in',
        h('a.brand', { href: '/', 'data-nav': '/', 'aria-label': 'Sarpa, home' },
          h('img.brand-logo', { src: '/assets/icon.svg', width: 38, height: 38, alt: '' }),
          h('span.brand-text', h('strong', 'SARPA'), h('small', 'Snake ID quiz'))),
        h('nav.nav', { 'aria-label': 'Main' }, NAV.map((n, i) => h('a.nav-key', { href: n.path === '/safety' ? safety : n.path, 'data-nav': n.path }, h('i.nav-n', String(i + 1).padStart(2, '0')), n.label))),
        h('div.header-tools',
          h('a.icon-btn.safety-key', { href: safety, 'data-nav': '/safety', 'aria-label': 'Snakebite safety' }, icon('shield', { size: 18 })),
          SQ.account.headerButton(),
          h('button.theme-btn#theme-btn', { type: 'button', role: 'switch', onclick: SQ.theme.toggle },
            h('span.t-sun', icon('sun', { size: 18 })), h('span.t-moon', icon('moon', { size: 18 }))))));

      const tabbar = document.getElementById('tabbar');
      NAV.filter((t) => t.tab).forEach((t) => tabbar.appendChild(h('a.tab', { href: t.path, 'data-nav': t.path }, icon(t.ico, { size: 20 }), h('span', t.short || t.label))));

      const D = SQ.data;
      document.getElementById('site-footer').appendChild(h('div.wrap.footer-in',
        h('div.foot-cols',
          h('div',
            h('p.legend.foot-title', 'About'),
            h('p', h('strong', 'Sarpa'), ' is a free educational snake-identification quiz. Photos are community observations from ', h('a', { href: 'https://www.inaturalist.org', target: '_blank', rel: 'noopener' }, 'iNaturalist'), ', used under their Creative Commons licences.')),
          h('div',
            h('p.legend.foot-title', 'Snakes'),
            h('div.foot-links', h('a', { href: '/guide/india' }, 'Snakes of India'), h('a', { href: '/guide/north-america' }, 'Snakes of North America'), h('a', { href: '/guide' }, 'Field guide'), h('a', { href: '/compare' }, 'Compare two snakes'), h('a', { href: '/learn' }, 'Flashcards'), h('a', { href: '/safety' }, 'Snakebite first aid (India)'), h('a', { href: '/safety/north-america' }, 'Snakebite first aid (USA & Canada)'))),
          h('div',
            h('p.legend.foot-title', 'Play'),
            h('div.foot-links', h('a', { href: '/play' }, 'Snake ID quiz'), h('a', { href: '/daily' }, 'Daily challenge'), h('a', { href: '/herpdle' }, 'Herpdle'), h('a', { href: '/herpdle?mode=practice' }, 'Herpdle practice'), h('a', { href: '/ranks' }, 'Leaderboards'), h('a', { href: '/me' }, 'My progress'))),
          h('div',
            h('p.legend.foot-title', 'Sarpa'),
            h('div.foot-links', h('a', { href: '/about' }, 'About & data'), h('a', { href: '/credits' }, 'Photo credits'), SQ.legalPages.map((p) => h('a', { href: '/legal/' + p.key }, p.title)))),
          h('div.foot-warn', icon('warn', { size: 18 }),
            h('p', 'Never touch, corner or try to catch a wild snake. In a snakebite emergency go to a hospital at once. ', h('a', { href: safety }, 'Snakebite first aid')))),
        h('p.legend.foot-spec',
          h('span', 'Sarpa SQ-1'), h('span', `${D.photos.length.toLocaleString()} photos`), h('span', `${D.species.length} species`), h('span', 'Code MIT'), h('span', 'Photos © photographers, CC'))));
      app.refreshThemeButton();
    },

    start() {
      SQ.theme.apply();
      try {
        SQ.data.init();
      } catch (err) {
        console.error(err);
        SQ.clear(document.getElementById('main'));
        document.getElementById('main').appendChild(h('div.page.wrap', SQ.ui.empty('Could not load the snake data', String(err.message || err))));
        return;
      }
      app.buildShell();

      add('/', SQ.views.home);
      add('/play', SQ.views.setup);
      add('/quiz', SQ.views.quiz);
      add('/results', SQ.views.results);
      add('/daily', SQ.views.daily);
      add('/herpdle', SQ.views.herpdle);
      add('/ranks', SQ.views.ranks);
      add('/guide', SQ.views.guide);
      // "/guide/india" and "/guide/north-america" list a region's snakes; any other name is a species
      add('/guide/:id', (ctx) => (SQ.data.areaBySlug(ctx.params.id) ? SQ.views.guide(Object.assign({}, ctx, { area: SQ.data.areaBySlug(ctx.params.id) })) : SQ.views.species(ctx)));
      add('/compare', SQ.views.compare);
      add('/compare/:pair', SQ.views.compare);
      add('/learn', SQ.views.learn);
      add('/safety', SQ.views.safety);
      add('/safety/:area', SQ.views.safety);
      add('/me', SQ.views.stats);
      add('/stats', () => { setTimeout(() => SQ.go('/me', { replace: true }), 0); return { node: h('div'), seo: { noindex: true } }; });     // the old address
      add('/about', SQ.views.about);
      add('/credits', SQ.views.credits);
      add('/legal', SQ.views.legal);
      add('/legal/:page', SQ.views.legal);
      add('/404', SQ.views.notFound);

      // following links without reloading the page
      document.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest('a[href]');
        if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
        const url = new URL(a.getAttribute('href'), location.href);
        if (!isPage(url)) return;
        if (url.pathname === location.pathname && url.search === location.search && url.hash) return;   // a link within the page
        e.preventDefault();
        SQ.go(url.pathname + url.search);
      });
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      window.addEventListener('popstate', (e) => {
        if (fromHash()) { render(); return; }
        if (location.pathname + location.search === shown) return;       // only the #part changed (a link within the page)
        render({ y: e.state && typeof e.state.y === 'number' ? e.state.y : 0 });
      });
      window.addEventListener('hashchange', () => { if (fromHash()) render(); });
      if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => { SQ.theme.apply(); app.refreshThemeButton(); window.dispatchEvent(new Event('sarpa-theme')); };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
      }
      // a prerendered page is already on screen: draw it again in place (no scrolling, no entrance animation)
      const pre = document.documentElement.hasAttribute('data-prerendered');
      fromHash();
      render({ quiet: pre }).then(() => { document.documentElement.removeAttribute('data-prerendered'); });
      app.registerServiceWorker();
      // find out whether this site has accounts, then bring in progress made on the player's other devices and send any
      // game that could not be saved earlier
      SQ.api.status().then((state) => {
        if (state !== 'ok') return;
        if (SQ.api.session()) SQ.sync.sync();
        setTimeout(SQ.api.flush, 1500);
      });
      const path = () => parseLocation().path;
      const calm = () => !document.body.classList.contains('modal-open');
      window.addEventListener('sarpa-auth', () => {
        if (path().startsWith('/me') && calm()) render();
      });
      // progress from another device arrived: redraw the pages that show it (never a game in play)
      window.addEventListener('sarpa-progress', () => {
        if (['/', '/me', '/daily'].includes(path()) && calm() && !(document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName))) render({ quiet: true });
      });
    },

    registerServiceWorker() {
      if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
      window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
    },
  });

  document.addEventListener('DOMContentLoaded', app.start);
})();
