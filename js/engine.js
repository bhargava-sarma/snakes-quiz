/* Question generation and scoring. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const DIFFICULTY = {
    beginner: {
      label: 'Beginner',
      blurb: 'Well-known, easy-to-recognise snakes. Look-alikes are kept apart.',
      tierWeights: { 1: 3, 2: 2.2, 3: 0.8 },
      distractorTierMax: 3,
      lookalikes: [0, 0, 0, 1],      // chance table for the number of look-alike options
    },
    intermediate: {
      label: 'Intermediate',
      blurb: 'Common and uncommon species, with one or two look-alike options.',
      tierWeights: { 1: 1.2, 2: 2, 3: 2, 4: 0.9, 5: 0.15 },
      distractorTierMax: 5,
      lookalikes: [0, 1, 1, 2],
    },
    expert: {
      label: 'Expert',
      blurb: 'Rare and tricky species, and most options are genuine look-alikes.',
      tierWeights: { 1: 0.3, 2: 0.8, 3: 1.6, 4: 2.2, 5: 2.2 },
      distractorTierMax: 5,
      lookalikes: [2, 2, 3, 3],
    },
    mixed: {
      label: 'All species',
      blurb: 'Every species is equally likely. Anything can turn up.',
      tierWeights: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
      distractorTierMax: 5,
      lookalikes: [0, 1, 1, 2],
    },
  };

  const MAX_LOOK_POOL = 8;

  function speciesPool(opts, rnd) {
    const D = SQ.data;
    const level = DIFFICULTY[opts.difficulty] || DIFFICULTY.mixed;
    let all = D.species.filter((sp) => D.photosOf(sp.id, opts.mode === 'daily').length > 0);

    let region = null;
    if (opts.region && opts.region !== 'all') {
      region = D.speciesInState(opts.region);
      const inRegion = all.filter((sp) => region.has(sp.id));
      if (inRegion.length >= 8) all = inRegion; else region = null;
    }

    let weights;
    if (opts.focus && opts.focus.length) {
      const focus = new Set(opts.focus);
      weights = (sp) => (focus.has(sp.id) ? 1 : 0);
    } else {
      weights = (sp) => level.tierWeights[sp.tier] || 0;
    }

    const seen = opts.preferUnseen ? SQ.store.seenMap() : {};
    const personal = opts.personalise !== false;
    const weightFn = (sp) => {
      let w = weights(sp);
      if (!w) return 0;
      if (personal && opts.preferUnseen) {
        const photos = D.photosOf(sp.id);
        const unseen = photos.filter((p) => seen[p.id] == null).length;
        w *= unseen === 0 ? 0.55 : 1 + 0.35 * (unseen / photos.length);
        const rec = SQ.store.speciesRecord(sp.id);
        if (opts.mode === 'weak' && rec.s) w *= 1 + 2.5 * (1 - rec.c / rec.s);
      }
      return w;
    };

    return { all, region, weightFn, level };
  }

  /** Targets are drawn in "cycles" so every species appears k or k+1 times. */
  function pickTargets(pool, count, rnd) {
    const targets = [];
    const candidates = pool.all.filter((sp) => pool.weightFn(sp) > 0);
    while (targets.length < count) {
      const need = count - targets.length;
      let round = SQ.weightedSample(candidates, pool.weightFn, Math.min(candidates.length, need), rnd);
      round = SQ.shuffle(round, rnd);
      if (targets.length && round.length > 1 && round[0].id === targets[targets.length - 1].id) {
        [round[0], round[1]] = [round[1], round[0]];
      }
      if (!round.length) break;
      targets.push(...round);
    }
    return targets;
  }

  function pickPhoto(sp, opts, used, rnd, regionSet) {
    const D = SQ.data;
    let photos = D.photosOf(sp.id, opts.mode === 'daily');
    if (opts.region && opts.region !== 'all' && regionSet) {
      const local = photos.filter((p) => p.state === opts.region);
      if (local.length >= 2) photos = local;
    }
    // easier levels show clear photos; expert shows every photo, including the awkward ones
    if (opts.difficulty === 'beginner' || opts.difficulty === 'intermediate') {
      const clear = photos.filter((p) => !p.hard);
      if (clear.length >= 3 || (clear.length && opts.difficulty === 'beginner')) photos = clear;
    }
    const fresh = photos.filter((p) => !used.has(p.id) && !(opts.exclude && opts.exclude.has(p.id)));
    if (fresh.length) photos = fresh;
    if (opts.preferUnseen && opts.personalise !== false) {
      const seen = SQ.store.seenMap();
      const unseen = photos.filter((p) => seen[p.id] == null);
      if (unseen.length) photos = unseen;
      else {
        const oldest = Math.min(...photos.map((p) => seen[p.id]));
        photos = photos.filter((p) => seen[p.id] === oldest);
      }
    }
    return SQ.pick(photos, rnd);
  }

  function pickDistractors(sp, pool, rnd, opts) {
    const D = SQ.data;
    const level = pool.level;
    let dpool = pool.region ? D.species.filter((s) => pool.region.has(s.id)) : D.species;
    if (dpool.length < 12) dpool = D.species;
    dpool = dpool.filter((s) => s.id !== sp.id && s.name !== sp.name && !D.isCryptic(sp.id, s.id) && D.photosOf(s.id).length > 0);

    // never let two options be species that cannot be told apart from a photo
    const clashes = (s, others) => others.some((o) => D.isCryptic(o.id, s.id));

    const maxTier = level.distractorTierMax;
    const tiered = dpool.filter((s) => s.tier <= maxTier);
    const usable = tiered.length >= 12 ? tiered : dpool;

    const wantLook = SQ.pick(level.lookalikes, rnd);
    const chosen = [];

    if (wantLook) {
      const ranked = D.lookalikes(sp.id, 60).filter((s) => usable.includes(s)).slice(0, MAX_LOOK_POOL);
      const picks = SQ.weightedSample(ranked, (s) => Math.pow(Math.max(D.similarity(sp.id, s.id), 0.5), 2), wantLook + 2, rnd);
      for (const pick of picks) {
        if (chosen.length >= wantLook) break;
        if (!clashes(pick, chosen)) chosen.push(pick);
      }
    }

    // fill the rest at random; in the easy level avoid options that look too much like the answer
    const easy = opts.difficulty === 'beginner';
    let rest = usable.filter((s) => !chosen.includes(s));
    if (easy) {
      const apart = rest.filter((s) => D.similarity(sp.id, s.id) < 5);
      if (apart.length >= 6) rest = apart;
    }
    // variety: prefer different families so the four options are not all the same kind of snake
    const famSeen = new Set([sp.family, ...chosen.map((s) => s.family)]);
    while (chosen.length < 3 && rest.length) {
      const ok = rest.filter((s) => !clashes(s, chosen));
      const base = ok.length ? ok : rest;
      const diffFam = base.filter((s) => !famSeen.has(s.family));
      const from = diffFam.length && chosen.length < 2 && !wantLook ? diffFam : base;
      const next = SQ.pick(from, rnd);
      chosen.push(next);
      famSeen.add(next.family);
      rest = rest.filter((s) => s !== next);
    }
    return chosen.slice(0, 3);
  }

  const engine = {
    DIFFICULTY,

    /** Number of species that can be asked about at a given setting. */
    poolSize(difficulty, region) {
      const pool = speciesPool({ difficulty, region, preferUnseen: false, personalise: false }, Math.random);
      return pool.all.filter((sp) => pool.weightFn(sp) > 0).length;
    },

    build(opts) {
      const D = SQ.data;
      const seed = opts.seed != null ? opts.seed : SQ.randomSeed();
      const rnd = SQ.rng(seed);
      const pool = speciesPool(opts, rnd);
      const targets = pickTargets(pool, opts.count, rnd);
      const used = new Set();
      const questions = targets.map((sp, i) => {
        const photo = pickPhoto(sp, opts, used, rnd, pool.region);
        used.add(photo.id);
        const options = SQ.shuffle([sp, ...pickDistractors(sp, pool, rnd, opts)], rnd).map((s) => s.id);
        return { n: i + 1, photo: photo.id, species: sp.id, options, answer: options.indexOf(sp.id) };
      });
      return { seed, questions };
    },

    /**
     * A day's daily challenge: the same ten questions for everyone. The server's schedule of daily puzzles is made
     * with this function too (scripts/dataset/10_server_data.js), so keep it free of anything personal.
     */
    dailySet(day) {
      return engine.build({
        mode: 'daily', count: 10, difficulty: 'intermediate', region: 'all', timer: 0, hints: true,
        preferUnseen: false, personalise: false, seed: SQ.hashSeed(`sarpa-daily-${day}-${SQ.data.meta.version || 1}`),
      });
    },

    /** Survival: one long run that gets harder as it goes (famous snakes first, then look-alikes). */
    SURVIVAL: { timer: 30, plan: [['beginner', 10], ['intermediate', 20], ['expert', 70]] },
    buildSurvival(opts = {}) {
      const seed = opts.seed != null ? opts.seed : SQ.randomSeed();
      const used = new Set();
      const questions = [];
      engine.SURVIVAL.plan.forEach(([difficulty, count], k) => {
        const part = engine.build(Object.assign({}, opts, { mode: 'sudden', difficulty, count, region: 'all', seed: (seed + 7919 * k) >>> 0, exclude: used }));
        part.questions.forEach((q) => {
          if (used.has(q.photo)) return;      // every photo at most once in a run
          used.add(q.photo);
          questions.push(Object.assign(q, { n: questions.length + 1 }));
        });
      });
      return { seed, questions };
    },

    /** Points for one answer. */
    score({ correct, hintsUsed, remaining, timerSec, streak }) {
      if (!correct) return 0;
      let pts = Math.max(30, 100 - 25 * hintsUsed);
      if (timerSec > 0) pts += Math.round(40 * Math.max(0, Math.min(1, remaining / timerSec)));
      pts += 5 * Math.min(streak, 10);
      return pts;
    },

    rank(pct) {
      if (pct >= 95) return { title: 'King Cobra', sub: 'Master herpetologist. Nothing slips past you.' };
      if (pct >= 85) return { title: 'Cobra Scholar', sub: 'Superb eye for scales, patterns and posture.' };
      if (pct >= 70) return { title: 'Viper Tracker', sub: 'Sharp spotting. A few tricky look-alikes left to master.' };
      if (pct >= 55) return { title: 'Rat Snake Ranger', sub: 'Solid knowledge. Keep studying those look-alikes.' };
      if (pct >= 40) return { title: 'Keelback Rookie', sub: 'A good start. The field guide will speed you up.' };
      return { title: 'Hatchling', sub: 'Everyone starts here. Read the explanations and try again.' };
    },
  };

  SQ.engine = engine;
})();
