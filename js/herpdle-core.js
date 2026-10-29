/* Herpdle: name the snake from clues. The rules only (no screen): which snake is today's, the six clues and the
 * colour-coded comparison of a guess with the answer. scripts/dataset/10_server_data.js runs this file too, to
 * write the server's schedule of daily puzzles, so it must not use the page or anything stored on the device. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const MAX_GUESSES = 6;
  const POINTS = [600, 500, 400, 300, 200, 100];
  const EPOCH = '2026-10-29';            // Herpdle #1

  const LEVELS = {
    easy: { label: 'Easy', blurb: 'Famous, widespread snakes.', maxTier: 2 },
    medium: { label: 'Medium', blurb: 'The daily mix: well-known and fairly common snakes.', maxTier: 3 },
    hard: { label: 'Hard', blurb: 'Any snake in the game, rarities included.', maxTier: 5 },
  };
  const DAILY_LEVEL = 'medium';

  /* ----- parts of India, for the Region tile ----- */

  const ZONES = {
    N: { label: 'North', states: ['Jammu and Kashmir', 'Ladakh', 'Himachal Pradesh', 'Punjab', 'Chandigarh', 'Haryana', 'Delhi', 'Uttarakhand', 'Uttar Pradesh'] },
    NE: { label: 'North-east', states: ['Assam', 'Arunachal Pradesh', 'Meghalaya', 'Nagaland', 'Manipur', 'Mizoram', 'Tripura', 'Sikkim'] },
    E: { label: 'East', states: ['West Bengal', 'Bihar', 'Jharkhand', 'Odisha'] },
    C: { label: 'Central', states: ['Madhya Pradesh', 'Chhattisgarh'] },
    W: { label: 'West', states: ['Rajasthan', 'Gujarat', 'Maharashtra', 'Goa', 'Dadra and Nagar Haveli and Daman and Diu'] },
    S: { label: 'South', states: ['Karnataka', 'Kerala', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana', 'Puducherry', 'Lakshadweep'] },
    AN: { label: 'Andaman & Nicobar', states: ['Andaman and Nicobar Islands'] },
  };
  const ZONE_ORDER = Object.keys(ZONES);
  const ZONE_OF = {};
  ZONE_ORDER.forEach((z) => ZONES[z].states.forEach((st) => { ZONE_OF[st] = z; }));

  /* ----- labels for the comparison tiles ----- */

  const SIZE = {
    1: { short: 'XS', label: 'Very small, under about 40 cm' },
    2: { short: 'S', label: 'Small, about 40 to 80 cm' },
    3: { short: 'M', label: 'Medium, about 0.8 to 1.5 m' },
    4: { short: 'L', label: 'Large, about 1.5 to 2.5 m' },
    5: { short: 'XL', label: 'Giant, over 2.5 m' },
  };
  const HABIT = {
    terrestrial: { short: 'Ground', label: 'Lives on the ground' },
    arboreal: { short: 'Trees', label: 'Lives in trees and bushes' },
    'semi-arboreal': { short: 'Shrubs', label: 'On the ground and in bushes' },
    aquatic: { short: 'Water', label: 'Lives in fresh water' },
    fossorial: { short: 'Burrow', label: 'Lives underground' },
    marine: { short: 'Sea', label: 'Lives in the sea' },
  };
  const HABIT_NEAR = [['terrestrial', 'semi-arboreal'], ['arboreal', 'semi-arboreal'], ['aquatic', 'marine']];
  const PATTERN = {
    plain: 'Plain', banded: 'Banded', ringed: 'Ringed', blotched: 'Blotched', spotted: 'Spotted', checkered: 'Checkered',
    speckled: 'Speckled', striped: 'Striped', bicolour: 'Two-tone', chain: 'Chain', reticulate: 'Netted',
  };
  const PATTERN_GROUP = {
    banded: 'bands', ringed: 'bands', blotched: 'marks', spotted: 'marks', checkered: 'marks', speckled: 'marks', chain: 'marks',
    reticulate: 'marks', plain: 'plain', bicolour: 'plain', striped: 'stripes',
  };
  const FAMILY_NOTE = {
    Elapidae: 'cobras, kraits, coral snakes and sea snakes',
    Viperidae: 'vipers and pit vipers',
    Colubridae: 'the large family of typical snakes',
    Natricidae: 'keelbacks and their relatives',
    Pareidae: 'snail-eaters and their relatives',
    Typhlopidae: 'blind snakes',
    Gerrhopilidae: 'worm-like blind snakes',
    Pythonidae: 'pythons',
    Erycidae: 'sand boas',
    Homalopsidae: 'mud and water snakes',
    Uropeltidae: 'shieldtails, burrowing snakes of the hills',
    Psammophiidae: 'sand snakes',
    Psammodynastidae: 'mock vipers',
    Acrochordidae: 'file snakes',
    Xenodermidae: 'odd-scaled snakes',
    Lamprophiidae: 'African and Asian house snakes',
  };

  const familyShort = (f) => String(f || '').replace(/idae$/, 'id');

  const VENOM_TEXT = {
    deadly: 'Highly venomous. A bite can kill without urgent hospital treatment.',
    venomous: 'Venomous. A bite needs urgent medical care.',
    mild: 'Mildly venomous (rear-fanged), not considered dangerous to people.',
    none: 'Non-venomous and harmless to people.',
  };

  /* ----- species pools and picks ----- */

  const poolCache = {};
  function pool(level) {
    const D = SQ.data;
    const lv = LEVELS[level] || LEVELS[DAILY_LEVEL];
    if (!poolCache[level]) {
      poolCache[level] = D.species
        .filter((sp) => sp.tier <= lv.maxTier && (D.bySpecies[sp.id] || []).length > 0 && sp.ids.length && sp.look)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));   // independent of the order of the data files
    }
    return poolCache[level];
  }

  /** A clear photo that shows the snake well, picked with the given random function. */
  function photoFor(sp, rnd) {
    const D = SQ.data;
    const all = D.bySpecies[sp.id] || [];
    const clear = all.filter((p) => !p.hard);
    const wide = clear.filter((p) => p.w && p.h && p.w / p.h >= 1.15 && p.w / p.h <= 1.85);
    const from = wide.length >= 3 ? wide : clear.length ? clear : all;
    return SQ.pick(from, rnd);
  }

  const dayNumber = (day) => SQ.time.dayIndex(day) - SQ.time.dayIndex(EPOCH) + 1;

  /** Order of the daily snakes within one pass through the pool. No snake comes back until all the others have had a turn. */
  function cycleOrder(list, cycle) {
    return SQ.shuffle(list.map((sp) => sp.id), SQ.rng(SQ.hashSeed('herpdle-cycle-' + cycle)));
  }

  /** The day's snake and photo: { species, photo, number }. The same for everyone. */
  function dailyPick(day) {
    const D = SQ.data;
    const list = pool(DAILY_LEVEL);
    const n = list.length;
    const i = SQ.time.dayIndex(day) - SQ.time.dayIndex(EPOCH);
    const cycle = Math.floor(i / n), pos = ((i % n) + n) % n;
    const order = cycleOrder(list, cycle);
    if (n > 1) {
      // the last snake of one pass must not be the first of the next
      const prevLast = cycleOrder(list, cycle - 1)[n - 1];
      if (order[0] === prevLast) [order[0], order[1]] = [order[1], order[0]];
    }
    const sp = D.byId[order[pos]];
    const photo = photoFor(sp, SQ.rng(SQ.hashSeed('herpdle-photo-' + day)));
    return { species: sp.id, photo: photo.id, number: dayNumber(day) };
  }

  /** A practice snake at a level, avoiding the recently played ones when possible. */
  function randomPick(level, avoid = []) {
    const list = pool(level);
    const skip = new Set(avoid);
    const fresh = list.filter((sp) => !skip.has(sp.id));
    const sp = SQ.pick(fresh.length ? fresh : list);
    return { species: sp.id, photo: photoFor(sp, Math.random).id };
  }

  /* ----- clues ----- */

  const GENERIC = new Set(['snake', 'snakes', 'the', 'of', 'and', 'a', 'an', 'common', 'indian', 'india', 'sri', 'lankan', 'lanka',
    'south', 'north', 'east', 'west', 'eastern', 'western', 'northern', 'southern', 'great', 'greater', 'lesser', 'little',
    'large', 'small', 'big', 'tree', 'sea', 'water', 'green', 'black', 'brown', 'red', 'yellow', 'white', 'grey', 'gray',
    'striped', 'banded', 'spotted', 'mountain', 'hill', 'forest', 'sand', 'rat', 'wolf', 'cat', 'pit', 'rock', 'ground', 'house',
    'blue', 'olive', 'orange', 'pink', 'purple', 'silver', 'tan', 'cream']);

  /** Words that would give the answer away: its names (common, other, scientific), but not everyday words. */
  function secretWords(sp) {
    const words = new Set();
    const add = (text) => String(text || '').split(/[^A-Za-zÀ-ɏ'’-]+/).forEach((w) => {
      const clean = w.replace(/['’]s$/i, '').replace(/^['’-]+|['’-]+$/g, '').toLowerCase();
      if (clean.length >= 3 && !GENERIC.has(clean)) words.add(clean);
    });
    add(sp.name);
    (sp.aka || []).forEach(add);
    add(sp.sci);
    return words;
  }

  /**
   * Splits text into pieces, hiding the secret words: [{ t: 'text' } | { hide: true, w: 'the word' }].
   * A word is hidden when it is a secret word or its plural or possessive (Cobra, cobras; Russell, Russell's).
   */
  function mask(text, secret) {
    const out = [];
    const re = /[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*/g;
    let last = 0, m;
    const push = (t) => { if (!t) return; const prev = out[out.length - 1]; if (prev && prev.t != null) prev.t += t; else out.push({ t }); };
    while ((m = re.exec(text))) {
      const word = m[0].toLowerCase().replace(/['’]s$/, '');
      const hit = secret.has(word) || secret.has(word.replace(/e?s$/, ''));       // cobras, Russell's
      if (!hit) continue;
      push(text.slice(last, m.index));
      out.push({ hide: true, w: m[0] });
      last = m.index + m[0].length;
    }
    push(text.slice(last));
    return out;
  }

  const sentence = (s) => { s = String(s || '').trim(); return s && !/[.!?]$/.test(s) ? s + '.' : s; };

  /**
   * The six clues for a snake, from vague to telling. Each clue is { key, title, rows: [{ label, parts }], extra }
   * where parts are pieces of text with hidden words (see mask) and extra names a small picture the screen can add.
   */
  function clues(sp) {
    const secret = secretWords(sp);
    const row = (label, text) => (text ? { label, parts: mask(sentence(text), secret) } : null);
    const fam = sp.family;
    const local = sp.local ? Array.from(new Set(Object.values(sp.local))) : [];
    const idFirst = sp.ids[0] || '';
    const lastRows = [];
    if (sp.fact) lastRows.push(row('Did you know', sp.fact));
    else if (sp.ids[1]) lastRows.push(row('Also look for', sp.ids[1]));
    if (local.length) lastRows.push({ label: 'Local names', parts: [{ t: local.slice(0, 3).join(' · ') }] });
    if (!lastRows.length) lastRows.push(row('Body', sp.look.body));
    return [
      { key: 'where', title: 'Where it lives', rows: [row('Found in', sp.range), row('Habitat', sp.habitat)].filter(Boolean) },
      { key: 'what', title: 'What it is', extra: 'venom',
        rows: [{ label: 'Family', parts: [{ t: `${fam}${FAMILY_NOTE[fam] ? ' (' + FAMILY_NOTE[fam] + ')' : ''}.` }] },
          { label: 'Venom', parts: [{ t: VENOM_TEXT[sp.venom] || VENOM_TEXT.none }] }] },
      { key: 'life', title: 'How it lives', rows: [row('Length', sp.len), row('Active', sp.active), row('Eats', sp.diet)].filter(Boolean) },
      { key: 'look', title: 'How it looks', extra: 'hues', rows: [row('Colour', sp.look.colour), row('Pattern', sp.look.pattern), row('Head', sp.look.head)].filter(Boolean) },
      // the group is not hidden even when it is part of the name: "a cobra" is the point of this clue
      { key: 'sign', title: 'Tell-tale sign', rows: [{ label: 'Group', parts: [{ t: `${SQ.cap(SQ.article(sp.kind || 'snake'))} ${String(sp.kind || 'snake').toLowerCase()}.` }] }, row('Look for', idFirst)].filter(Boolean) },
      { key: 'last', title: 'Last clue', rows: lastRows.filter(Boolean) },
    ];
  }

  /* ----- comparing a guess with the answer ----- */

  const zoneCache = {};
  /** Parts of India where a species has been photographed (ignoring stray records). */
  function zones(sp) {
    if (!zoneCache[sp.id]) {
      const counts = {};
      let total = 0;
      (sp.stateCounts || []).forEach(([state, n]) => {
        const z = ZONE_OF[state];
        if (!z) return;
        counts[z] = (counts[z] || 0) + n;
        total += n;
      });
      let list = ZONE_ORDER.filter((z) => counts[z] && (counts[z] >= 3 || counts[z] / total >= 0.1));
      if (!list.length) list = ZONE_ORDER.filter((z) => counts[z]);
      zoneCache[sp.id] = list;
    }
    return zoneCache[sp.id];
  }

  const zoneText = (list) => (list.length > 2 ? `${list.length} zones` : list.join('+') || '?');
  const zoneLabel = (list) => SQ.listJoin(list.map((z) => ZONES[z].label)) || 'unknown';

  function ordinal(a, b) {
    if (a === b) return { state: 'hit', dir: null };
    return { state: Math.abs(a - b) === 1 ? 'near' : 'miss', dir: b > a ? 'up' : 'down' };
  }

  /**
   * How a guessed snake compares with the answer, one tile per trait:
   * [{ key, label, value, state: 'hit' | 'near' | 'miss', dir: 'up' | 'down' | null, say }]
   * `dir` points at the answer: 'up' means the answer is more venomous / bigger.
   */
  function compare(guess, answer) {
    const V = SQ.data.VENOM;
    const g = guess.t, a = answer.t;
    const venomG = (V[guess.venom] || V.none), venomA = (V[answer.venom] || V.none);
    const tiles = [];

    tiles.push({ key: 'family', label: 'Family', value: familyShort(guess.family), state: guess.family === answer.family ? 'hit' : 'miss', dir: null,
      say: `Family ${guess.family}: ${guess.family === answer.family ? 'same family' : 'a different family'}` });

    const vo = ordinal(venomG.rank, venomA.rank);
    tiles.push(Object.assign({ key: 'venom', label: 'Venom', value: venomG.short.replace('Deadly venom', 'Deadly').replace('Mild venom', 'Mild') }, vo, {
      say: `Venom: ${venomG.label}. ${vo.state === 'hit' ? 'Same' : vo.dir === 'up' ? 'The answer is more venomous' : 'The answer is less venomous'}` }));

    const so = ordinal(g.size, a.size);
    tiles.push(Object.assign({ key: 'size', label: 'Size', value: (SIZE[g.size] || SIZE[3]).short }, so, {
      say: `Size: ${(SIZE[g.size] || SIZE[3]).label}. ${so.state === 'hit' ? 'Same size' : so.dir === 'up' ? 'The answer grows bigger' : 'The answer is smaller'}` }));

    const habitHit = g.habit === a.habit;
    const habitNear = !habitHit && HABIT_NEAR.some(([x, y]) => (g.habit === x && a.habit === y) || (g.habit === y && a.habit === x));
    tiles.push({ key: 'habit', label: 'Lives', value: (HABIT[g.habit] || HABIT.terrestrial).short, state: habitHit ? 'hit' : habitNear ? 'near' : 'miss', dir: null,
      say: `Lifestyle: ${(HABIT[g.habit] || HABIT.terrestrial).label}. ${habitHit ? 'Same' : habitNear ? 'Close' : 'Different'}` });

    const patHit = g.pat === a.pat;
    const patNear = !patHit && PATTERN_GROUP[g.pat] && PATTERN_GROUP[g.pat] === PATTERN_GROUP[a.pat];
    tiles.push({ key: 'pattern', label: 'Pattern', value: PATTERN[g.pat] || SQ.cap(g.pat || '?'), state: patHit ? 'hit' : patNear ? 'near' : 'miss', dir: null,
      say: `Pattern: ${PATTERN[g.pat] || g.pat}. ${patHit ? 'Same' : patNear ? 'Similar' : 'Different'}` });

    const zg = zones(guess), za = zones(answer);
    const same = zg.length === za.length && zg.every((z) => za.includes(z));
    const overlap = zg.some((z) => za.includes(z));
    tiles.push({ key: 'region', label: 'Region', value: zoneText(zg), state: same ? 'hit' : overlap ? 'near' : 'miss', dir: null,
      say: `Region: ${zoneLabel(zg)}. ${same ? 'Same parts of India' : overlap ? 'Overlaps with the answer' : 'Lives elsewhere'}` });
    return tiles;
  }

  /** Points for a finished puzzle. */
  const points = (guessesUsed, won) => (won ? POINTS[Math.max(1, Math.min(MAX_GUESSES, guessesUsed)) - 1] : 0);

  /** How pixelated the photo is before the n-th guess (0-based): columns of blocks across the photo. */
  const PIXELS = [7, 10, 15, 22, 33, 50];

  /** Everything a player might type for a snake, for the search box. */
  function searchText(sp) {
    const local = sp.local ? Object.values(sp.local).join(' ') : '';
    return [sp.name, (sp.aka || []).join(' '), sp.sci, local].join(' ').toLowerCase();
  }

  SQ.herpdle = {
    MAX_GUESSES, POINTS, EPOCH, LEVELS, DAILY_LEVEL, ZONES, ZONE_ORDER, SIZE, HABIT, PATTERN, PIXELS,
    pool, photoFor, dayNumber, dailyPick, randomPick, clues, mask, secretWords, compare, zones, zoneLabel, points, searchText, familyShort,
  };
})();
