/* Builds the "why it is X" and "why it is NOT Y" explanations from the species knowledge base. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const PATTERN = {
    plain: 'a plain, unmarked body',
    banded: 'distinct cross-bands along the body',
    blotched: 'large blotches or saddles down the back',
    striped: 'stripes running along the body',
    spotted: 'a spotted pattern',
    checkered: 'a checkered pattern',
    reticulate: 'a net-like pattern',
    speckled: 'fine speckles or flecks',
    ringed: 'bold rings around the body',
    chain: 'a chain-like pattern of linked marks',
    bicolour: 'two clearly different colours (back and belly or front and rear)',
  };

  const HABIT = {
    terrestrial: 'lives on the ground',
    arboreal: 'lives up in bushes and trees',
    'semi-arboreal': 'is equally at home on the ground and in bushes and trees',
    aquatic: 'lives in or beside water',
    fossorial: 'lives underground (burrowing)',
    marine: 'lives in the sea',
  };

  const SIZE = {
    1: 'stays small (usually under 40 cm)',
    2: 'is fairly small (roughly 40-80 cm)',
    3: 'is medium-sized (roughly 0.8-1.5 m)',
    4: 'grows large (roughly 1.5-2.5 m)',
    5: 'is a giant (well over 2.5 m)',
  };

  const BUILD = {
    thin: 'has a very thin, whip-like body',
    slender: 'has a slim body',
    medium: 'has a body of medium thickness',
    stout: 'has a thick, stout body',
    heavy: 'has a very heavy, muscular body',
    worm: 'is a thin, worm-like burrower',
  };

  const HEAD = {
    distinct: 'has a head clearly broader than its neck',
    indistinct: 'has a narrow head barely wider than its neck',
    flat: 'has a flat, wide head',
    pointed: 'has a long, narrow head',
  };

  const SNOUT = {
    blunt: 'has a blunt, rounded snout',
    pointed: 'has a long, pointed snout',
    upturned: 'has an upturned, hump-like snout',
    wedge: 'has a small, wedge-shaped snout for burrowing',
  };

  const SCALES = {
    smooth: 'has smooth scales',
    glossy: 'has smooth, glossy scales',
    keeled: 'has rough, keeled scales',
  };

  const PUPIL = {
    round: 'has round pupils',
    vertical: 'has vertical, cat-like pupils',
    keyhole: 'has horizontal, keyhole-shaped pupils',
  };

  const joinHue = (hues) => SQ.listJoin(hues || []);

  /** Visual axes, most noticeable in a photo first. */
  const AXES = [
    { key: 'hood', label: 'Hood',
      differs: (a, b) => !!a.t.hood !== !!b.t.hood,
      phrase: (s) => (s.t.hood ? 'spreads a broad hood when alarmed' : 'never spreads a hood') },
    { key: 'pat', label: 'Pattern',
      differs: (a, b) => a.t.pat && b.t.pat && a.t.pat !== b.t.pat,
      phrase: (s) => `has ${PATTERN[s.t.pat] || 'its own pattern'}` },
    { key: 'hue', label: 'Colour',
      differs: (a, b) => a.t.hue && b.t.hue && !a.t.hue.some((h) => b.t.hue.includes(h)),
      phrase: (s) => `is mostly ${joinHue(s.t.hue)}` },
    { key: 'snout', label: 'Snout',
      differs: (a, b) => a.t.snout !== b.t.snout && (a.t.snout !== 'blunt' || b.t.snout !== 'blunt'),
      phrase: (s) => SNOUT[s.t.snout] || SNOUT.blunt },
    { key: 'head', label: 'Head',
      differs: (a, b) => a.t.head !== b.t.head,
      phrase: (s) => HEAD[s.t.head] || HEAD.indistinct },
    { key: 'scales', label: 'Scales',
      differs: (a, b) => (a.t.scales === 'keeled') !== (b.t.scales === 'keeled'),
      phrase: (s) => SCALES[s.t.scales] || SCALES.smooth },
    { key: 'build', label: 'Build',
      differs: (a, b) => a.t.build !== b.t.build && Math.abs(['worm', 'thin', 'slender', 'medium', 'stout', 'heavy'].indexOf(a.t.build) - ['worm', 'thin', 'slender', 'medium', 'stout', 'heavy'].indexOf(b.t.build)) >= 2,
      phrase: (s) => BUILD[s.t.build] || BUILD.medium },
    { key: 'size', label: 'Size',
      differs: (a, b) => Math.abs(a.t.size - b.t.size) >= 2,
      phrase: (s) => SIZE[s.t.size] || SIZE[3] },
    { key: 'pupil', label: 'Eyes',
      differs: (a, b) => a.t.pupil !== b.t.pupil,
      phrase: (s) => PUPIL[s.t.pupil] || PUPIL.round },
    { key: 'habit', label: 'Habitat',
      differs: (a, b) => a.t.habit !== b.t.habit,
      phrase: (s) => HABIT[s.t.habit] || HABIT.terrestrial },
  ];

  const THE = (sp) => `The ${sp.name}`;
  const the = (sp) => `the ${sp.name}`;

  function venomInfo(sp) {
    const v = SQ.data.VENOM[sp.venom] || SQ.data.VENOM.none;
    return { level: sp.venom, label: v.label, short: v.short, icon: v.icon, note: v.note, big4: !!sp.big4 };
  }

  const explain = {
    venomInfo,

    /** Why the snake in the photo IS this species. */
    whyCorrect(sp) {
      const facts = [
        ['Length', sp.len], ['Habitat', sp.habitat], ['Found in', sp.range],
        ['Eats', sp.diet], ['Active', sp.active],
      ].filter((f) => f[1]);
      return { species: sp, points: sp.ids.slice(), facts, venom: venomInfo(sp), fact: sp.fact || '' };
    },

    /** The differences (most visible first) between the snake in the photo (a) and another option (b). */
    differences(a, b, limit = 3) {
      const out = [];
      for (const axis of AXES) {
        if (out.length >= limit) break;
        if (axis.differs(a, b)) out.push({ axis: axis.label, a: axis.phrase(a), b: axis.phrase(b) });
      }
      return out;
    },

    /** Side-by-side rows from the descriptive fields. */
    table(a, b) {
      const row = (label, x, y) => (x || y ? [label, x || '-', y || '-'] : null);
      return [
        row('Colour', a.look.colour, b.look.colour),
        row('Pattern', a.look.pattern, b.look.pattern),
        row('Head', a.look.head, b.look.head),
        row('Body', a.look.body, b.look.body),
        row('Length', a.len, b.len),
        row('Habitat', a.habitat, b.habitat),
        row('Venom', venomInfo(a).label, venomInfo(b).label),
      ].filter(Boolean);
    },

    /** Why the snake in the photo (a) is NOT species b. */
    whyNot(a, b) {
      const pair = SQ.data.pair(a.id, b.id);
      const diffs = explain.differences(a, b, 3);
      const hasTip = !!(pair && pair.tip);
      let lead, listed;
      if (hasTip) {
        lead = pair.tip;           // hand-written note for this pair of look-alikes
        listed = diffs;
      } else if (diffs.length) {
        lead = `${THE(b)} ${diffs[0].b}, whereas ${the(a)} ${diffs[0].a}.`;
        listed = diffs.slice(1);   // the first difference is already in the lead
      } else {
        lead = `${THE(b)} can look similar to ${the(a)} at a glance, but the details below tell them apart.`;
        listed = [];
      }
      let venomNote = '';
      const va = SQ.data.VENOM[a.venom].rank, vb = SQ.data.VENOM[b.venom].rank;
      if (vb >= 2 && va < 2) venomNote = `${THE(b)} is dangerous (${venomInfo(b).label.toLowerCase()}), unlike ${the(a)}.`;
      else if (va >= 2 && vb < 2) venomNote = `${THE(b)} is not dangerous, but ${the(a)} is ${venomInfo(a).label.toLowerCase()}.`;
      return { species: b, lead, hasTip, diffs: listed, ids: b.ids.slice(0, 3), table: explain.table(a, b), venom: venomInfo(b), venomNote };
    },

    /** The little verdict line shown above the explanation. */
    verdict(correct, chosen, sp, chosenSp, timedOut) {
      if (timedOut) return `Time's up! That was ${SQ.article(sp.name)} ${sp.name}.`;
      if (correct) return `Correct! That's ${SQ.article(sp.name)} ${sp.name}.`;
      return `Not quite. That's ${SQ.article(sp.name)} ${sp.name}, not ${SQ.article(chosenSp.name)} ${chosenSp.name}.`;
    },

    /** Progressive hints for a question (cheapest first). */
    hints(sp, photo) {
      const list = [];
      if (photo && photo.state) list.push({ id: 'where', text: `This photo was taken in ${photo.state}.` });
      const kind = (sp.kind || 'snake').toLowerCase();
      list.push({ id: 'family', text: `It belongs to the ${kind} group (family ${sp.family}) and is ${venomInfo(sp).label.toLowerCase()}.` });
      return list;
    },
  };

  SQ.explain = explain;
})();
