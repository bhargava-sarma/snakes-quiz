/* Achievements, checked at the end of every quiz. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});

  const speciesSpotted = () => {
    const rec = SQ.store.progress().species;
    return Object.keys(rec).filter((id) => rec[id].c > 0 && SQ.data.byId[id]);
  };

  const BADGES = [
    { id: 'first-quiz', name: 'First Steps', icon: 'play', desc: 'Finish your first quiz.',
      test: () => SQ.store.progress().totals.games >= 1 },
    { id: 'perfect', name: 'Flawless', icon: 'star', desc: 'Get every question right in a quiz of 20 or more.',
      test: (c) => c.summary.n >= 20 && c.summary.correct === c.summary.n },
    { id: 'streak10', name: 'On a Roll', icon: 'flame', desc: 'Answer 10 questions correctly in a row.',
      test: (c) => c.summary.bestStreak >= 10 || SQ.store.progress().totals.bestStreak >= 10 },
    { id: 'streak25', name: 'Unstoppable', icon: 'zap', desc: 'Answer 25 questions correctly in a row.',
      test: (c) => c.summary.bestStreak >= 25 || SQ.store.progress().totals.bestStreak >= 25 },
    { id: 'century', name: 'Century', icon: 'award', desc: 'Complete a 100-question quiz.',
      test: (c) => c.summary.mode === 'quiz' && c.summary.planned >= 100 && c.summary.n >= 100 },
    { id: 'expert80', name: 'Look-alike Slayer', icon: 'target', desc: 'Score 80% or more on an Expert quiz of 20+ questions.',
      test: (c) => c.summary.difficulty === 'expert' && c.summary.n >= 20 && c.summary.correct / c.summary.n >= 0.8 },
    { id: 'timed90', name: 'Quick Eyes', icon: 'clock', desc: 'Score 90% or more in a timed quiz of 20+ questions.',
      test: (c) => c.summary.timer > 0 && c.summary.n >= 20 && c.summary.correct / c.summary.n >= 0.9 },
    { id: 'dex25', name: 'Spotter', icon: 'eye', desc: 'Correctly identify 25 different species.',
      test: () => speciesSpotted().length >= 25 },
    { id: 'dex75', name: 'Naturalist', icon: 'book', desc: 'Correctly identify 75 different species.',
      test: () => speciesSpotted().length >= 75 },
    { id: 'dexall', name: 'Completionist', icon: 'layers', desc: 'Correctly identify every species in the game.',
      test: () => speciesSpotted().length >= SQ.data.species.length },
    { id: 'big4', name: 'Big Four Expert', icon: 'shield', desc: 'Correctly identify all of the "Big Four" medically important snakes.',
      test: () => {
        const big4 = SQ.data.species.filter((s) => s.big4);
        const got = new Set(speciesSpotted());
        return big4.length > 0 && big4.every((s) => got.has(s.id));
      } },
    { id: 'venom15', name: 'Venom Wise', icon: 'warn', desc: 'Correctly identify 15 different venomous species.',
      test: () => speciesSpotted().filter((id) => SQ.data.byId[id].venom === 'deadly' || SQ.data.byId[id].venom === 'venomous').length >= 15 },
    { id: 'daily7', name: 'Daily Devotee', icon: 'calendar', desc: 'Play the daily challenge 7 days in a row.',
      test: () => SQ.store.progress().daily.best >= 7 },
    { id: 'survival25', name: 'Survivor', icon: 'heart', desc: 'Name 25 snakes in a row in a Survival run.',
      test: (c) => c.summary.mode === 'sudden' && c.summary.correct >= 25 },
    { id: 'ranked', name: 'On the Board', icon: 'trophy', desc: 'Finish a game that counts on the leaderboards.',
      test: (c) => !!c.summary.ranked && c.summary.ranked !== 'off' },
    { id: 'herpdle1', name: 'Clue Hunter', icon: 'grid', desc: 'Solve a Herpdle.',
      test: (c) => c.summary.game === 'herpdle' && c.summary.won },
    { id: 'herpdle2', name: 'Snake Whisperer', icon: 'zap', desc: 'Solve a Herpdle in two goes or fewer.',
      test: (c) => c.summary.game === 'herpdle' && c.summary.won && c.summary.guesses <= 2 },
    { id: 'herpdle7', name: 'Clue Streak', icon: 'flame', desc: 'Solve the daily Herpdle 7 days in a row.',
      test: () => !!SQ.herpdleState && SQ.herpdleState.dailyStats().best >= 7 },
  ];

  SQ.badges = {
    all: BADGES,
    /** Award any newly earned badges and return them. */
    evaluate(summary) {
      const ctx = { summary };
      const fresh = [];
      for (const b of BADGES) {
        if (SQ.store.progress().badges[b.id]) continue;
        let ok = false;
        try { ok = !!b.test(ctx); } catch (e) { ok = false; }
        if (ok && SQ.store.awardBadge(b.id)) fresh.push(b);
      }
      return fresh;
    },
  };
})();
