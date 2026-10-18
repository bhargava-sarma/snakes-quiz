/* Quiz sessions and the play screen. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  SQ.views = SQ.views || {};

  const LETTERS = ['A', 'B', 'C', 'D'];
  const HINT_COST = 25;

  const quiz = (SQ.quiz = {
    session: null,

    current() {
      if (!quiz.session) {
        const saved = SQ.store.loadSession();
        if (saved && !saved.finished && validSession(saved)) quiz.session = saved;
        else if (saved) SQ.store.clearSession();
      }
      return quiz.session;
    },

    /** Build a quiz and navigate to it. */
    start(opts) {
      const o = Object.assign({ mode: 'quiz', count: 20, difficulty: 'beginner', region: 'all', timer: 0, hints: true, preferUnseen: true }, opts);
      SQ.store.nextGameNumber();
      const built = SQ.engine.build(Object.assign({}, o, { personalise: o.mode !== 'daily' }));
      if (!built.questions.length) {
        SQ.ui.toast('Could not build a quiz with those settings.', 'bad');
        return false;
      }
      quiz.session = {
        v: 1, id: Date.now().toString(36), mode: o.mode, title: o.title || '',
        config: {
          count: built.questions.length, planned: o.count, difficulty: o.difficulty, region: o.region,
          timer: o.timer, hints: o.hints, dateKey: o.dateKey || null, focus: o.focus || null,
        },
        seed: built.seed, questions: built.questions, index: 0, answers: [], streak: 0, bestStreak: 0, points: 0,
        qHints: 0, removed: [], startedAt: Date.now(), activeMs: 0,
      };
      SQ.store.saveSession(quiz.session);
      SQ.go('/quiz');
      return true;
    },

    discard() {
      quiz.session = null;
      SQ.store.clearSession();
    },

    /** End the quiz, record it and show the results. */
    finish(sess, early) {
      const items = sess.answers.map((a, i) => {
        const q = sess.questions[i];
        return { n: q.n, photo: q.photo, species: q.species, options: q.options, chosen: a.chosen, correct: a.correct, hints: a.hints, points: a.points, ms: a.ms };
      });
      const n = items.length;
      if (!n) { quiz.discard(); SQ.go('/'); return null; }
      const correct = items.filter((x) => x.correct).length;
      const summary = {
        id: sess.id, mode: sess.mode, title: sess.title, n, planned: sess.config.planned || sess.questions.length, correct,
        points: sess.points, seconds: Math.round(sess.activeMs / 1000), bestStreak: sess.bestStreak,
        difficulty: sess.config.difficulty, region: sess.config.region, timer: sess.config.timer,
        dateKey: sess.config.dateKey, config: sess.config, items, finishedAt: Date.now(), early: !!early,
      };
      SQ.store.recordGame(summary);
      if (sess.mode === 'daily' && sess.config.dateKey) {
        SQ.store.recordDaily(sess.config.dateKey, { correct, n, points: sess.points, grid: items.map((x) => (x.correct ? 'G' : 'R')).join('') });
      }
      summary.newBadges = SQ.badges.evaluate(summary).map((b) => b.id);
      SQ.store.saveLastResult(summary);
      quiz.session = null;
      SQ.store.clearSession();
      SQ.go('/results');
      return summary;
    },
  });

  function validSession(s) {
    try {
      return Array.isArray(s.questions) && s.questions.length > 0 && s.questions.every((q) => SQ.data.photoById[q.photo] && SQ.data.byId[q.species] && q.options.every((id) => SQ.data.byId[id]));
    } catch (e) { return false; }
  }

  /* ------------------------------------------------------------------ */
  /*  The play screen                                                     */
  /* ------------------------------------------------------------------ */

  SQ.views.quiz = function () {
    const D = SQ.data;
    const sess = quiz.current();
    if (!sess) { setTimeout(() => SQ.go('/play'), 0); return h('div'); }
    const settings = SQ.store.settings();
    const timerSec = sess.config.timer || 0;
    const total = sess.questions.length;

    const progressText = h('span.q-count');
    const barFill = h('i');
    const pointsEl = h('b', '0');
    const streakEl = h('span.stat.streak', { hidden: true }, icon('flame', { size: 16 }), h('b', '0'));
    const timerEl = h('div.timer', { hidden: !timerSec });
    const timerText = h('span', String(timerSec));
    timerEl.innerHTML = `<svg viewBox="0 0 40 40" width="42" height="42" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="var(--line)" stroke-width="4"/><circle class="timer-arc" cx="20" cy="20" r="17" fill="none" stroke="var(--brand)" stroke-width="4" stroke-linecap="round" stroke-dasharray="106.8" stroke-dashoffset="0" transform="rotate(-90 20 20)"/></svg>`;
    timerEl.appendChild(timerText);
    const timerArc = timerEl.querySelector('.timer-arc');

    const top = h('div.quiz-top',
      h('div.q-progress', h('div.q-line', progressText, h('span.q-title-mini', quizTitle(sess))), h('div.bar', barFill)),
      h('div.q-stats', h('span.stat', icon('star', { size: 16 }), pointsEl, h('small', 'pts')), streakEl, timerEl));
    const grid = h('div.quiz-grid');
    const root = h('div.quiz.wrap', top, grid);

    let answered = false;
    let qStart = performance.now();
    let timerId = null;
    let optionBtns = [];
    let nextBtn = null, nextBar = null, explainEl = null;
    let hintArea = null, hintBtn = null;

    function quizTitle(s) {
      if (s.mode === 'daily') return 'Daily challenge';
      if (s.mode === 'weak') return 'Weak-spot practice';
      if (s.mode === 'practice') return s.title || 'Practice';
      const lvl = SQ.engine.DIFFICULTY[s.config.difficulty];
      return lvl ? lvl.label : '';
    }

    function updateTop() {
      const shown = Math.min(sess.index + 1, total);
      progressText.textContent = `Question ${shown} of ${total}`;
      barFill.style.width = (100 * sess.answers.length / total) + '%';
      pointsEl.textContent = String(sess.points);
      streakEl.hidden = sess.streak < 2;
      streakEl.querySelector('b').textContent = String(sess.streak);
    }

    /* ----- timer ----- */
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
    function startTimer() {
      stopTimer();
      if (!timerSec) return;
      timerEl.classList.remove('low');
      timerArc.style.strokeDashoffset = '0';
      timerText.textContent = String(timerSec);
      const t0 = performance.now();
      timerId = setInterval(() => {
        const left = timerSec - (performance.now() - t0) / 1000;
        timerArc.style.strokeDashoffset = String(106.8 * (1 - Math.max(left, 0) / timerSec));
        timerText.textContent = String(Math.max(0, Math.ceil(left)));
        timerEl.classList.toggle('low', left <= 5);
        if (left <= 0) { stopTimer(); choose(-1, true); }
      }, 100);
    }

    /* ----- one question ----- */
    function renderQuestion() {
      const q = sess.questions[sess.index];
      const photo = D.photoById[q.photo];
      answered = false;
      qStart = performance.now();
      SQ.clear(grid);
      updateTop();

      const optsEl = h('div.options', { role: 'group', 'aria-label': 'Answer options' });
      optionBtns = q.options.map((id, i) => {
        const s = D.byId[id];
        const btn = h('button.option', { type: 'button', 'data-i': i, onclick: () => choose(i) },
          h('span.opt-key', LETTERS[i]), SQ.ui.nameBlock(s, { sci: settings.showSci }), h('span.opt-mark'));
        optsEl.appendChild(btn);
        return btn;
      });

      hintArea = h('div.hint-area', { 'aria-live': 'polite' });
      hintBtn = h('button.btn.btn-ghost.btn-sm.hint-btn', { type: 'button', onclick: useHint }, icon('bulb', { size: 16 }), h('span.hint-label'));
      const actions = h('div.q-actions', sess.config.hints ? hintBtn : null, h('span.kbd-hint', 'Tip: press 1–4 or A–D to answer'));

      const photoCol = h('div.quiz-photo',
        SQ.ui.photo(photo, { zoom: true, eager: true }),
        h('p.photo-note', icon('zoom', { size: 14 }), ' Tap the photo to enlarge it'),
        hintArea);
      explainEl = h('div#explain.explain-wrap');
      nextBtn = h('button.btn.btn-primary.btn-lg.next-btn', { type: 'button', onclick: next },
        sess.index + 1 >= total ? 'See my results' : 'Next question', icon('arrow', { size: 20 }));
      nextBar = h('div.next-bar', { hidden: true }, nextBtn);

      grid.append(photoCol, h('div.quiz-side',
        h('h2.q-title', 'Which snake is this?'), optsEl, actions, explainEl, nextBar));

      // restore hints (e.g. after a refresh)
      for (let i = 0; i < sess.qHints; i++) applyHint(i, true);
      refreshHintBtn();

      const upcoming = sess.questions[sess.index + 1];
      if (upcoming) SQ.ui.preload(D.photoById[upcoming.photo]);

      // The page was reloaded after this question had been answered: show the answer again
      // instead of letting it be answered twice.
      if (sess.answers.length > sess.index) {
        const a = sess.answers[sess.index];
        answered = true;
        reveal(q, a.chosen, a.correct, a.chosen < 0, a.points);
        return;
      }
      startTimer();
    }

    /* ----- hints ----- */
    function hintList() {
      const q = sess.questions[sess.index];
      return SQ.explain.hints(D.byId[q.species], D.photoById[q.photo]);
    }
    function maxHints() { return hintList().length + 1; } // + the 50/50
    function refreshHintBtn() {
      if (!hintBtn) return;
      const left = maxHints() - sess.qHints;
      hintBtn.disabled = answered || left <= 0;
      hintBtn.querySelector('.hint-label').textContent = left > 0 ? `Hint (-${HINT_COST} pts) · ${left} left` : 'No hints left';
    }
    function applyHint(i, silent) {
      const hints = hintList();
      if (i < hints.length) {
        hintArea.appendChild(h('div.hint-chip', icon('bulb', { size: 15 }), hints[i].text));
      } else {
        // 50/50: knock out two wrong options
        const q = sess.questions[sess.index];
        if (!sess.removed.length) {
          const wrong = q.options.map((_, idx) => idx).filter((idx) => idx !== q.answer);
          sess.removed = SQ.shuffle(wrong).slice(0, 2);
        }
        sess.removed.forEach((idx) => { optionBtns[idx].disabled = true; optionBtns[idx].classList.add('struck'); });
        hintArea.appendChild(h('div.hint-chip', icon('bulb', { size: 15 }), 'Two wrong options have been crossed out.'));
      }
    }
    function useHint() {
      if (answered || sess.qHints >= maxHints()) return;
      applyHint(sess.qHints);
      sess.qHints += 1;
      SQ.store.saveSession(sess);
      refreshHintBtn();
    }

    /* ----- answering ----- */
    function choose(i, timedOut) {
      if (answered) return;
      if (!timedOut && sess.removed.includes(i)) return;
      answered = true;
      stopTimer();
      const q = sess.questions[sess.index];
      const correct = !timedOut && i === q.answer;
      const ms = performance.now() - qStart;
      const remaining = timerSec ? Math.max(0, timerSec - ms / 1000) : 0;
      const pts = SQ.engine.score({ correct, hintsUsed: sess.qHints, remaining, timerSec, streak: sess.streak });
      sess.streak = correct ? sess.streak + 1 : 0;
      sess.bestStreak = Math.max(sess.bestStreak, sess.streak);
      sess.points += pts;
      sess.answers.push({ chosen: timedOut ? -1 : i, correct, hints: sess.qHints, ms: Math.round(ms), points: pts });
      sess.activeMs += ms;
      SQ.store.recordAnswer({ speciesId: q.species, photoId: q.photo, correct, chosenId: i >= 0 ? q.options[i] : null });
      SQ.store.saveSession(sess);
      reveal(q, i, correct, timedOut, pts);
    }

    function reveal(q, chosenIdx, correct, timedOut, pts) {
      updateTop();
      refreshHintBtn();
      optionBtns.forEach((btn, idx) => {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        const mark = btn.querySelector('.opt-mark');
        if (idx === q.answer) { btn.classList.add('correct'); mark.appendChild(icon('check', { size: 20, stroke: 3 })); }
        else if (idx === chosenIdx) { btn.classList.add('wrong'); mark.appendChild(icon('x', { size: 20, stroke: 3 })); }
        else btn.classList.add('dim');
        btn.onclick = null;
        btn.addEventListener('click', () => {
          const target = document.getElementById('why-' + q.options[idx]) || document.querySelector('.why-card');
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        btn.disabled = false; // keep clickable: jumps to that option's explanation
      });

      const photo = D.photoById[q.photo];
      const correctSp = D.byId[q.species];
      const options = q.options.map((id) => D.byId[id]);
      const chosenSp = chosenIdx >= 0 ? D.byId[q.options[chosenIdx]] : null;
      explainEl.appendChild(SQ.ui.explanation({ correct: correctSp, chosen: chosenSp, options, timedOut, isCorrect: correct, points: pts, streak: sess.streak }));
      explainEl.appendChild(photoFooter(photo));

      nextBar.hidden = false;
      setTimeout(() => nextBtn.focus({ preventScroll: true }), 30);
      const verdict = explainEl.querySelector('.verdict');
      if (verdict && window.innerWidth < 960) setTimeout(() => verdict.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      if (correct && sess.streak > 0 && sess.streak % 10 === 0) SQ.ui.confetti();
    }

    function photoFooter(photo) {
      return h('div.photo-foot',
        SQ.ui.creditLine(photo),
        h('button.btn.btn-ghost.btn-sm', {
          type: 'button', title: 'Wrong species, poor quality or inappropriate photo?',
          onclick: async (e) => {
            const ok = await SQ.ui.confirm({ title: 'Report this photo?', text: 'It will not be shown again on this device. You can restore reported photos in My progress.', confirmLabel: 'Report photo' });
            if (ok) { SQ.store.flagPhoto(photo.id); SQ.ui.toast('Thanks. This photo will not be shown again.'); e.target.closest('button').disabled = true; }
          },
        }, icon('flag', { size: 15 }), 'Report photo'));
    }

    function next() {
      if (!answered) return;
      if (sess.index + 1 >= total) { quiz.finish(sess, false); return; }
      sess.index += 1;
      sess.qHints = 0;
      sess.removed = [];
      SQ.store.saveSession(sess);
      renderQuestion();
      window.scrollTo(0, 0);
    }

    /* ----- keyboard ----- */
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.body.classList.contains('modal-open')) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (!answered) {
        const idx = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
        if (k.length === 1 && idx >= 0 && idx < sess.questions[sess.index].options.length) { choose(idx); return; }
        if (k === 'h' && sess.config.hints) useHint();
      } else if (['enter', ' ', 'arrowright', 'n'].includes(k)) {
        // let links, summaries and other buttons keep their own Enter/Space behaviour
        if (e.target.closest && e.target.closest('a, summary, textarea')) return;
        if ((k === 'enter' || k === ' ') && e.target.tagName === 'BUTTON' && e.target !== nextBtn) return;
        e.preventDefault();
        next();
      }
    }
    document.addEventListener('keydown', onKey);

    /* ----- quit ----- */
    const quitBtn = document.getElementById('quit-btn');
    quitBtn.hidden = false;
    quitBtn.onclick = () => {
      const answeredCount = sess.answers.length;
      const body = h('div', h('p', answeredCount
        ? `You have answered ${answeredCount} of ${total} questions. You can see your results so far, or throw this quiz away.`
        : 'You have not answered anything yet.'));
      const actions = [
        h('button.btn.btn-ghost', { type: 'button', onclick: SQ.ui.closeModal }, 'Keep playing'),
        h('button.btn.btn-danger', { type: 'button', onclick: () => { SQ.ui.closeModal(); quiz.discard(); SQ.go('/'); } }, 'Discard quiz'),
      ];
      if (answeredCount) actions.push(h('button.btn.btn-primary', { type: 'button', onclick: () => { SQ.ui.closeModal(); quiz.finish(sess, true); } }, 'See results'));
      SQ.ui.modal({ title: 'Leave this quiz?', body, actions });
    };

    const cleanup = () => {
      stopTimer();
      document.removeEventListener('keydown', onKey);
      quitBtn.hidden = true;
      quitBtn.onclick = null;
    };

    renderQuestion();
    // when the user refreshed after the last answer, show that answer again so they can continue
    return { node: root, cleanup, focus: true, view: 'quiz', title: 'Quiz' };
  };
})();
