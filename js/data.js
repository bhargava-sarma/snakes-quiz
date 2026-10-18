/* Loads the generated species + photo data and offers lookups on top of it. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const LICENSE_URL = {
    'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC-BY': 'https://creativecommons.org/licenses/by/4.0/',
    'CC-BY-SA': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'CC-BY-NC': 'https://creativecommons.org/licenses/by-nc/4.0/',
    'CC-BY-NC-SA': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  };
  const EXT = ['jpg', 'jpeg', 'png'];
  const REMOTE = 'https://inaturalist-open-data.s3.amazonaws.com/photos';

  const VENOM = {
    deadly: { rank: 3, label: 'Highly venomous', short: 'Deadly venom', icon: 'warn', note: 'medically important: its bite can kill without urgent hospital treatment' },
    venomous: { rank: 2, label: 'Venomous', short: 'Venomous', icon: 'warn', note: 'venomous: a bite needs urgent medical care' },
    mild: { rank: 1, label: 'Mildly venomous', short: 'Mild venom', icon: 'info', note: 'mildly venomous (rear-fanged): not considered dangerous to people' },
    none: { rank: 0, label: 'Non-venomous', short: 'Harmless', icon: 'check', note: 'non-venomous' },
  };

  const DEFAULT_TAGS = { hood: false, head: 'indistinct', snout: 'blunt', pupil: 'round', scales: 'smooth', habit: 'terrestrial', build: 'medium', size: 3 };

  const data = {
    ready: false,
    species: [],
    byId: {},
    photos: [],
    photoById: {},
    bySpecies: {},
    states: [],
    meta: {},
    VENOM,
  };

  data.init = function () {
    if (data.ready) return data;
    const S = window.SQ_SPECIES;
    const P = window.SQ_PHOTOS;
    if (!S || !P) throw new Error('Data files are missing (data/species.js, data/photos.js).');

    data.meta = S.meta || {};
    data.noPair = S.noPair || [];
    data.states = P.states;

    data.species = S.species.map((sp) => {
      sp.t = Object.assign({}, DEFAULT_TAGS, sp.t || {});
      sp.grp = sp.grp || [];
      sp.aka = sp.aka || [];
      sp.ids = sp.ids || [];
      sp.look = sp.look || {};
      sp.stateCounts = (sp.states || []).map(([i, n]) => [P.states[i], n]);
      return sp;
    });
    data.species.forEach((sp, i) => { sp.index = i; data.byId[sp.id] = sp; data.bySpecies[sp.id] = []; });

    data.pairMap = {};
    (S.pairs || []).forEach((p) => { data.pairMap[p.a + '|' + p.b] = p; data.pairMap[p.b + '|' + p.a] = p; });

    data.photos = P.rows.map((r) => {
      const [id, spIdx, stateIdx, creditIdx, licIdx, w, h, inatIdx, ext, hard] = r;
      const sp = data.species[spIdx];
      const lic = P.licenses[licIdx];
      const photo = {
        id, sp: sp.id, state: stateIdx >= 0 ? P.states[stateIdx] : '', credit: P.credits[creditIdx],
        license: lic, licenseUrl: LICENSE_URL[lic] || '', w, h, hard: hard ? 1 : 0,
        inat: inatIdx >= 0 ? P.inat[inatIdx] : '',
        url: `images/${sp.id}/${id}.avif`,
        remote: `${REMOTE}/${id}/medium.${EXT[ext || 0]}`,
        page: `https://www.inaturalist.org/photos/${id}`,
      };
      data.photoById[id] = photo;
      data.bySpecies[sp.id].push(photo);
      return photo;
    });

    data.species.forEach((sp) => {
      sp.thumb = `images/thumbs/${sp.id}.avif`;
      sp.photoCount = data.bySpecies[sp.id].length;
    });

    // species per state
    const perState = {};
    data.photos.forEach((p) => {
      if (!p.state) return;
      (perState[p.state] = perState[p.state] || {})[p.sp] = (perState[p.state][p.sp] || 0) + 1;
    });
    data.stateIndex = perState;

    data.ready = true;
    return data;
  };

  data.sp = (id) => data.byId[id];

  /** Photos of a species the player has not reported. */
  data.photosOf = (id, ignoreFlags) => {
    const all = data.bySpecies[id] || [];
    if (ignoreFlags) return all;
    const flagged = SQ.store ? SQ.store.flaggedList() : [];
    if (!flagged.length) return all;
    const bad = new Set(flagged);
    const kept = all.filter((p) => !bad.has(p.id));
    return kept.length ? kept : all;   // never leave a species without any photo
  };

  data.coverOf = (id) => {
    const sp = data.byId[id];
    return (sp && data.photoById[sp.cover]) || (data.bySpecies[id] || [])[0];
  };

  /** [{ state, species, photos }] for states with at least `minSpecies` species. */
  data.regions = function (minSpecies = 12) {
    return Object.entries(data.stateIndex)
      .map(([state, m]) => ({ state, species: Object.keys(m).length, photos: Object.values(m).reduce((a, b) => a + b, 0) }))
      .filter((r) => r.species >= minSpecies)
      .sort((a, b) => b.species - a.species);
  };

  data.speciesInState = (state) => new Set(Object.keys(data.stateIndex[state] || {}));

  data.pair = (a, b) => data.pairMap[a + '|' + b] || null;

  data.isCryptic = (a, b) => data.noPair.some((set) => set.includes(a) && set.includes(b));

  /** How alike two species look (higher = more confusable). */
  data.similarity = function (aId, bId) {
    if (aId === bId) return -1;
    const a = data.byId[aId], b = data.byId[bId];
    let s = 0;
    if (a.grp.some((g) => b.grp.includes(g))) s += 5;
    if (data.pair(aId, bId)) s += 3;
    if (a.family === b.family) s += 1.5;
    const ta = a.t, tb = b.t;
    const hueA = ta.hue || [], hueB = tb.hue || [];
    if (hueA.some((h) => hueB.includes(h))) s += 1;
    if (ta.pat && ta.pat === tb.pat) s += 1.2;
    if (ta.build === tb.build) s += 0.5;
    if (ta.habit === tb.habit) s += 0.8;
    if (Math.abs(ta.size - tb.size) <= 1) s += 0.5;
    if (ta.hood && tb.hood) s += 2;
    if (ta.scales === tb.scales) s += 0.3;
    if (ta.pupil === tb.pupil) s += 0.2;
    return s;
  };

  /** Ordered list of the species that look most like `id`. */
  data.lookalikes = function (id, limit = 6) {
    const cache = (data._lookCache = data._lookCache || {});
    if (!cache[id]) {
      cache[id] = data.species
        .filter((s) => s.id !== id && !data.isCryptic(id, s.id))
        .map((s) => [s, data.similarity(id, s.id)])
        .sort((x, y) => y[1] - x[1])
        .map((x) => x[0]);
    }
    return cache[id].slice(0, limit);
  };

  /** Image src with a graceful fallback to iNaturalist's own JPEG if AVIF fails to load. */
  data.attachImage = function (img, photo) {
    img.onerror = () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      img.src = photo.remote;
    };
    img.src = photo.url;
    return img;
  };

  SQ.data = data;
})();
