/* Runs before the first paint (loaded without defer, in the page head). It is a file rather than inline code so that
 * the page's Content Security Policy can forbid inline scripts altogether. */
(function () {
  'use strict';
  // Use the saved theme before the first paint, so a dark page does not flash light while the app loads.
  try {
    var t = JSON.parse(localStorage.getItem('sarpa.v1.settings') || '{}').theme;
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#121211' : '#e8e7e2');
  } catch (e) { /* storage blocked: the app sorts the theme out when it starts */ }
  // (the main fonts are preloaded by <link rel="preload"> tags in the page head)
})();
