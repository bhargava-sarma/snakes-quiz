/* Search engines and link previews. Every page of the app describes itself: its title, description, address, picture
 * and structured data (schema.org JSON-LD). apply() writes that into the page head whenever a page is drawn, and
 * scripts/build-pages.js bakes the same tags into the prerendered copy of every page, which is what search engines and
 * link previews (WhatsApp, X, Facebook ...) read. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const CFG = window.SQ_CONFIG || {};

  const SITE = String(CFG.siteUrl || location.origin).replace(/\/+$/, '');
  const BRAND = 'Sarpa';
  const HOME_TITLE = 'Sarpa: Snake Identification Quiz · India & North America';
  const SHARE = {
    url: '/assets/social-preview.jpg', width: 1200, height: 630, type: 'image/jpeg',
    alt: 'Sarpa, the snake ID quiz for India and North America: how well do you know your snakes?',
  };
  const INDEX = 'index, follow, max-image-preview:large';
  const WEBSITE_ID = SITE + '/#website';

  /** A full address for a path of the site: "/guide" becomes "https://…/guide". */
  const abs = (path) => (/^https?:\/\//.test(path) ? path : SITE + (String(path).startsWith('/') ? path : '/' + path));

  /** Text cut to at most max characters, at a word boundary and with an ellipsis when it had to be cut. */
  function clip(text, max) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    const at = cut.lastIndexOf(' ');
    return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.(–—-]+$/, '') + '…';
  }

  /** The first of several titles that fits in a search result (about 70 characters), else the last, shortest one. */
  const fit = (options, max = 70) => options.find((t) => t.length <= max) || options[options.length - 1];

  /** A head element, made (and marked as ours) when the page does not have it yet. */
  function headTag(selector, make) {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = make();
      el.setAttribute('data-seo', '');
      document.head.appendChild(el);
    }
    return el;
  }
  const byName = (name) => headTag(`meta[name="${name}"]`, () => { const m = document.createElement('meta'); m.name = name; return m; });
  const byProp = (prop) => headTag(`meta[property="${prop}"]`, () => { const m = document.createElement('meta'); m.setAttribute('property', prop); return m; });

  /**
   * Writes a page's description into the head.
   * info: { title, description, path (the canonical address, the page's own path by default), image: { url, width,
   *         height, type, alt }, type ('website' or 'article'), noindex (true for pages that are personal or
   *         temporary), ld: [schema.org objects] }
   */
  function apply(info, path) {
    const i = info || {};
    const title = i.title || HOME_TITLE;
    const description = clip(i.description || 'Sarpa, a free snake identification quiz with real photos of the snakes of India, the USA and Canada.', 165);
    const url = abs(i.path || path || '/');
    const img = i.image || SHARE;
    document.title = title;
    byName('description').setAttribute('content', description);
    byName('robots').setAttribute('content', i.noindex ? 'noindex, follow' : INDEX);
    headTag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }).setAttribute('href', url);
    byProp('og:type').setAttribute('content', i.type || 'website');
    byProp('og:title').setAttribute('content', title.replace(/ · Sarpa$/, ''));
    byProp('og:description').setAttribute('content', description);
    byProp('og:url').setAttribute('content', url);
    byProp('og:image').setAttribute('content', abs(img.url));
    byProp('og:image:type').setAttribute('content', img.type || 'image/jpeg');
    byProp('og:image:width').setAttribute('content', String(img.width));
    byProp('og:image:height').setAttribute('content', String(img.height));
    byProp('og:image:alt').setAttribute('content', img.alt || title);
    const graph = [].concat(i.ld || []).filter(Boolean);
    const old = document.head.querySelector('script[type="application/ld+json"][data-seo]');
    if (!graph.length) { if (old) old.remove(); return; }
    const script = old || headTag('script[type="application/ld+json"][data-seo]', () => { const s = document.createElement('script'); s.type = 'application/ld+json'; return s; });
    // "<" is escaped so that no text in the data can ever close the script element early
    script.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  }

  /* ---------- structured data (schema.org) ---------- */

  const publisher = () => (CFG.operator ? { '@type': 'Person', name: CFG.operator, url: CFG.operatorUrl || undefined } : undefined);

  /** The site itself (on the home page: it gives search engines the site's name). */
  function website(description) {
    return {
      '@type': 'WebSite', '@id': WEBSITE_ID, url: SITE + '/', name: BRAND,
      alternateName: ['Sarpa Snake Quiz', 'Sarpa snake identification quiz'], description, inLanguage: 'en', publisher: publisher(),
    };
  }

  /**
   * The quiz (or a game of it): a free, interactive learning resource. (Not marked up as a software application: Google
   * would then expect star ratings, which the site does not collect.)
   */
  function app(name, path, description, kind) {
    return {
      '@type': kind === 'game' ? ['LearningResource', 'Game'] : 'LearningResource', '@id': abs(path) + '#app', name, url: abs(path),
      description, learningResourceType: kind === 'game' ? 'Game' : 'Quiz', educationalUse: 'self assessment', interactivityType: 'active',
      teaches: 'How to identify the snakes of India and North America from photos', about: { '@type': 'Thing', name: 'Snake identification' },
      isAccessibleForFree: true, inLanguage: 'en', image: abs(SHARE.url), publisher: publisher(),
    };
  }

  /** The trail of pages above this one: [["Field guide", "/guide"], ["Indian Cobra", "/guide/naja-naja"]]. */
  function crumbs(path, trail) {
    const items = [['Sarpa', '/']].concat(trail || []);
    return {
      '@type': 'BreadcrumbList', '@id': abs(path) + '#breadcrumb',
      itemListElement: items.map(([name, p], k) => ({ '@type': 'ListItem', position: k + 1, name, item: abs(p) })),
    };
  }

  /** A page of the site. kind: WebPage, CollectionPage, AboutPage ... */
  function page(kind, path, name, description, extra) {
    return Object.assign({
      '@type': kind, '@id': abs(path), url: abs(path), name, description: clip(description, 300), inLanguage: 'en',
      isPartOf: { '@id': WEBSITE_ID },
    }, extra || {});
  }

  /** A photo with its photographer and licence (search engines show "Licensable" and the credit for it). */
  function photo(p, caption) {
    if (!p) return null;
    return {
      '@type': 'ImageObject', contentUrl: abs(p.url), width: p.w || undefined, height: p.h || undefined, caption,
      creditText: p.credit, creator: { '@type': 'Person', name: p.credit }, copyrightNotice: '© ' + p.credit,
      license: p.licenseUrl || undefined, acquireLicensePage: p.page || undefined,
    };
  }

  /** A species as a scientific taxon, with its common names. */
  function taxon(sp, path) {
    return {
      '@type': 'Taxon', '@id': abs(path) + '#taxon', name: sp.sci, taxonRank: 'species',
      alternateName: [sp.name].concat(sp.aka || []),
      parentTaxon: sp.family ? { '@type': 'Taxon', name: sp.family, taxonRank: 'family' } : undefined,
    };
  }

  /* ---------- page descriptions that are built from the data ---------- */

  const VENOM_WORDS = {
    deadly: 'a highly venomous snake', venomous: 'a venomous snake',
    mild: 'a mildly venomous snake that is harmless to people', none: 'a harmless, non-venomous snake',
  };

  /** "India", "the USA and Canada" or both, for a species. */
  function whereOf(sp) {
    const r = (sp && sp.regions) || ['in'];
    if (r.length > 1) return 'India and North America';
    return r[0] === 'na' ? 'the USA and Canada' : 'India';
  }

  /** About 155 characters on how to identify a species, for search results. */
  function speciesDescription(sp) {
    const base = `How to identify the ${sp.name} (${sp.sci}), ${VENOM_WORDS[sp.venom] || 'a snake'} of ${whereOf(sp)}.`;
    const tail = ' Photos, ID tips and look-alikes.';
    const room = 160 - base.length - tail.length;
    const tip = room >= 40 && sp.ids && sp.ids[0] ? ' ' + clip(sp.ids[0], room - 1) : '';
    return base + tip + tail;
  }

  /** The picture shared with a species page: its cover photo, cropped for link previews (scripts/build-pages.js). */
  function speciesImage(sp) {
    return { url: `/images/share/${sp.id}.jpg`, width: 800, height: 420, type: 'image/jpeg', alt: `${sp.name} (${sp.sci})` };
  }

  SQ.seo = {
    SITE, BRAND, HOME_TITLE, SHARE, abs, clip, fit, apply,
    website, app, crumbs, page, photo, taxon,
    speciesDescription, speciesImage, whereOf,
  };
})();
