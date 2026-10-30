/* Accounts on the website: the sign-in / create-account dialog, the account key in the header, the account panel on
 * the profile page and the rule that the games need an account when this copy of the site has accounts. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;
  const CFG = window.SQ_CONFIG || {};

  const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

  /* ----- form pieces ----- */

  function field(id, label, input, help) {
    return h('div.field',
      h('label', { for: id }, label),
      input,
      help ? h('p.field-help', { id: id + '-help' }, help) : null);
  }

  /** A 6-digit PIN box with a show / hide key. */
  function pinField(id, label, autocomplete, help) {
    const input = h('input.pin-input', {
      id, type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 6, autocomplete,
      'aria-describedby': help ? id + '-help' : null, spellcheck: 'false', autocapitalize: 'off', enterkeyhint: 'go',
    });
    input.addEventListener('input', () => {
      const v = input.value.replace(/\D+/g, '').slice(0, 6);       // some keyboards let letters through
      if (v !== input.value) input.value = v;
    });
    const eye = h('button.pin-eye', {
      type: 'button', 'aria-label': 'Show PIN', 'aria-pressed': 'false',
      onclick: () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        eye.setAttribute('aria-pressed', show ? 'true' : 'false');
        eye.setAttribute('aria-label', show ? 'Hide PIN' : 'Show PIN');
        eye.classList.toggle('on', show);
        input.focus();
      },
    }, icon('eye', { size: 18 }));
    return { input, el: field(id, label, h('div.pin-wrap', input, eye), help) };
  }

  function friendly(e) {
    if (!e) return 'Something went wrong. Please try again.';
    if (e.code === 'network') return 'Could not reach the Sarpa server. Check your connection and try again.';
    return e.message || 'Something went wrong. Please try again.';
  }

  /* ----- the sign-in / create-account dialog ----- */

  /**
   * Opens the account dialog. Resolves true once the player is signed in, false if they close it.
   * opts.mode: 'signup' | 'signin'; opts.reason: 'play' (they tried to start a game) or anything else.
   */
  function open(opts = {}) {
    const last = SQ.store.get('lastName', '');
    let mode = opts.mode || (last ? 'signin' : 'signup');
    return new Promise((resolve) => {
      let done = false;
      const body = h('div.acct-form');

      function draw() {
        SQ.clear(body);
        const signup = mode === 'signup';
        const err = h('p.form-error', { role: 'alert', hidden: true });
        const name = h('input#acct-name', {
          type: 'text', autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
          maxlength: 16, enterkeyhint: 'next', 'aria-describedby': 'acct-name-help', value: signup ? '' : last,
        });
        const pin = pinField('acct-pin', signup ? 'Choose a 6-digit PIN' : 'PIN', signup ? 'new-password' : 'current-password',
          signup ? 'Numbers only. There is no e-mail on your account, so a forgotten PIN cannot be reset. Keep it somewhere safe.' : null);
        const pin2 = signup ? pinField('acct-pin2', 'Type the PIN again', 'new-password') : null;
        const agree = signup ? h('input#acct-agree', { type: 'checkbox' }) : null;
        const submit = h('button.btn.btn-primary.btn-lg.btn-block', { type: 'submit' }, signup ? 'Create account' : 'Sign in');

        const show = (msg, focus) => { err.textContent = msg; err.hidden = false; if (focus) focus.focus(); };

        const form = h('form.acct-fields', { novalidate: true, onsubmit: async (e) => {
          e.preventDefault();
          err.hidden = true;
          const n = name.value.trim();
          if (!n) return show('Enter a username.', name);
          if (signup && !NAME_RE.test(n)) return show('Use 3 to 16 letters, numbers or _ in your username.', name);
          if (!/^\d{6}$/.test(pin.input.value)) return show('The PIN must be exactly 6 digits.', pin.input);
          if (signup && pin.input.value !== pin2.input.value) return show('The two PINs are not the same.', pin2.input);
          if (signup && !agree.checked) return show('Please tick the box to accept the terms.', agree);
          submit.disabled = true;
          submit.textContent = signup ? 'Creating your account…' : 'Signing in…';
          try {
            const user = signup ? await SQ.api.signup(n, pin.input.value) : await SQ.api.login(n, pin.input.value);
            SQ.store.set('lastName', user.name);
            done = true;
            SQ.ui.closeModal();
            SQ.ui.toast(signup ? `Welcome to Sarpa, ${user.name}!` : `Signed in as ${user.name}`);
            resolve(true);
          } catch (ex) {
            submit.disabled = false;
            submit.textContent = signup ? 'Create account' : 'Sign in';
            show(friendly(ex), ex.code === 'bad_name' || ex.code === 'name_taken' ? name : ex.code === 'bad_pin' || ex.code === 'weak_pin' || ex.code === 'bad_credentials' ? pin.input : null);
          }
        } },
          field('acct-name', 'Username', name, signup ? '3 to 16 letters, numbers or _. Everyone sees it on the leaderboards, so please do not use your full real name.' : 'Not case sensitive.'),
          pin.el,
          pin2 ? pin2.el : null,
          signup ? h('label.check', agree, h('span', 'I am 18 or older, or my parent or guardian agrees to this account, and I accept the ',
            h('a', { href: '#/legal/terms', target: '_blank', rel: 'noopener' }, 'terms'), ' and the ',
            h('a', { href: '#/legal/privacy', target: '_blank', rel: 'noopener' }, 'privacy policy'), '.')) : null,
          err,
          submit);

        const tabs = SQ.ui.segmented({
          name: 'Account', value: mode, className: 'acct-tabs',
          options: [{ value: 'signup', label: 'Create account' }, { value: 'signin', label: 'Sign in' }],
          onChange: (v) => { mode = v; draw(); setTimeout(() => (mode === 'signin' && last ? pin.input : name).focus(), 0); },
        });
        body.append(
          opts.reason === 'play'
            ? h('p.acct-lead', 'Make a free account to play Sarpa and Herpdle. Your games count on the daily, weekly and all-time leaderboards.')
            : h('p.acct-lead', 'One username and a 6-digit PIN. That is all: no e-mail, no phone number.'),
          tabs, form,
          h('p.acct-note', icon('book', { size: 15 }), 'The field guide, flashcards, safety guide and everything else work without an account.'));
      }

      draw();
      SQ.ui.modal({
        title: opts.reason === 'play' ? 'Sign in to play' : 'Your Sarpa account', body, className: 'acct', place: 'top',
        onClose: () => { if (!done) resolve(false); },
      });
      setTimeout(() => { const f = mode === 'signin' && last ? SQ.$('#acct-pin') : SQ.$('#acct-name'); if (f) f.focus(); }, 40);
    });
  }

  /* ----- the rule: games need an account (when the site has accounts) ----- */

  /**
   * Call before starting a game. Resolves { ranked } to go ahead (ranked: the game counts on the leaderboards)
   * or null when the player closed the sign-in dialog.
   */
  async function gate() {
    const state = await SQ.api.status();
    const signedIn = !!SQ.api.session();
    if (state === 'off') return { ranked: false, why: 'off' };
    if (state !== 'ok') {
      SQ.ui.toast(signedIn ? 'Cannot reach the Sarpa server. This game will not be ranked.' : 'Cannot reach the Sarpa server, so you are playing as a guest. This game will not be ranked.');
      return { ranked: false, why: 'down' };
    }
    if (signedIn) return { ranked: true };
    if (!CFG.requireAccountForGames) return { ranked: false, why: 'guest' };
    const ok = await open({ reason: 'play' });
    return ok ? { ranked: true } : null;
  }

  /* ----- the account key in the header ----- */

  function headerButton() {
    const label = h('span.acct-name');
    const btn = h('button.acct-btn#acct-btn', {
      type: 'button',
      onclick: () => { if (SQ.api.session()) SQ.go('/me'); else open({}); },
    }, h('span.acct-ico', icon('user', { size: 18 })), label);
    const draw = () => {
      const s = SQ.api.session();
      const state = SQ.api.known();
      btn.hidden = !s && state !== 'ok' && state !== 'down';
      btn.classList.toggle('in', !!s);
      label.textContent = s ? s.name : 'Sign in';
      btn.setAttribute('aria-label', s ? `Your account: ${s.name}` : 'Sign in or create an account');
    };
    window.addEventListener('sarpa-auth', draw);
    draw();
    return btn;
  }

  /* ----- dialogs for the profile page ----- */

  function changePin() {
    const cur = pinField('cp-cur', 'Current PIN', 'current-password');
    const nxt = pinField('cp-new', 'New 6-digit PIN', 'new-password');
    const nxt2 = pinField('cp-new2', 'Type the new PIN again', 'new-password');
    const err = h('p.form-error', { role: 'alert', hidden: true });
    const go = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Change PIN');
    const form = h('form.acct-fields', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      const fail = (m, f) => { err.textContent = m; err.hidden = false; if (f) f.focus(); };
      if (!/^\d{6}$/.test(cur.input.value)) return fail('Enter your current 6-digit PIN.', cur.input);
      if (!/^\d{6}$/.test(nxt.input.value)) return fail('The new PIN must be exactly 6 digits.', nxt.input);
      if (nxt.input.value !== nxt2.input.value) return fail('The two new PINs are not the same.', nxt2.input);
      go.disabled = true;
      try {
        const r = await SQ.api.changePin(cur.input.value, nxt.input.value);
        SQ.ui.closeModal();
        SQ.ui.toast(r.signedOutOthers ? 'PIN changed. Your other devices have been signed out.' : 'PIN changed.');
      } catch (ex) {
        go.disabled = false;
        fail(friendly(ex), ex.code === 'bad_credentials' ? cur.input : nxt.input);
      }
    } }, cur.el, nxt.el, nxt2.el, err, go);
    SQ.ui.modal({ title: 'Change your PIN', body: form, className: 'acct', place: 'top' });
    setTimeout(() => cur.input.focus(), 40);
  }

  function deleteAccount(name) {
    const pin = pinField('del-pin', 'Your PIN', 'current-password');
    const err = h('p.form-error', { role: 'alert', hidden: true });
    const go = h('button.btn.btn-danger.btn-block', { type: 'submit' }, icon('trash', { size: 18 }), 'Delete my account');
    const form = h('form.acct-fields', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      err.hidden = true;
      if (!/^\d{6}$/.test(pin.input.value)) { err.textContent = 'Enter your 6-digit PIN.'; err.hidden = false; pin.input.focus(); return; }
      go.disabled = true;
      try {
        await SQ.api.deleteAccount(pin.input.value);
        SQ.store.remove('lastName');
        SQ.ui.closeModal();
        SQ.ui.toast('Your account has been deleted.');
        SQ.go('/me');
      } catch (ex) {
        go.disabled = false;
        err.textContent = friendly(ex); err.hidden = false;
      }
    } },
    h('p', `This permanently deletes the account `, h('strong', name), ', its PIN, its statistics and its places on every leaderboard. It cannot be undone. Your progress on this device (snake-dex, badges) is kept.'),
    pin.el, err, go);
    SQ.ui.modal({ title: 'Delete your account?', body: form, className: 'acct', place: 'top' });
    setTimeout(() => pin.input.focus(), 40);
  }

  async function signOut() {
    const ok = await SQ.ui.confirm({ title: 'Sign out?', text: 'You can sign in again with your username and PIN. Your progress on this device stays.', confirmLabel: 'Sign out' });
    if (!ok) return;
    await SQ.api.logout();
    SQ.ui.toast('Signed out');
    SQ.go('/me');
  }

  /* ----- the account panel on the profile page ----- */

  const pctOf = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  /** The top of the profile page: who you are, your server-side statistics and the account keys. */
  function panel() {
    const box = h('section.acct-panel');
    const s = SQ.api.session();

    if (!s) {
      SQ.api.status().then((state) => {
        if (state === 'off') { box.remove(); return; }
        box.append(h('div.card.acct-cta',
          h('div', h('p.legend', icon('user', { size: 13 }), ' Account'),
            h('h2', 'Play for the leaderboards'),
            h('p.muted', CFG.requireAccountForGames
              ? 'Sarpa and Herpdle need a free account: just a username and a 6-digit PIN. Your progress below stays on this device either way.'
              : 'Sign in to put your games on the daily, weekly and all-time leaderboards.')),
          h('div.btn-row',
            h('button.btn.btn-primary', { type: 'button', onclick: () => open({ mode: 'signup' }).then((ok) => ok && SQ.go('/me')) }, 'Create account'),
            h('button.btn', { type: 'button', onclick: () => open({ mode: 'signin' }).then((ok) => ok && SQ.go('/me')) }, 'Sign in'))));
      });
      return box;
    }

    const stats = h('div.acct-stats', h('div.lcd.acct-lcd', SQ.ui.readout('Loading', '····')));
    box.append(h('div.card.acct-card',
      h('div.acct-head',
        h('div.acct-id', h('span.acct-avatar', { 'aria-hidden': 'true' }, s.name.slice(0, 1).toUpperCase()),
          h('div', h('p.legend', 'Signed in'), h('h2', s.name), s.created ? h('p.muted.small', 'Member since ' + SQ.fmtDate(s.created)) : null)),
        h('div.btn-row.acct-actions',
          h('a.btn.btn-sm', { href: '#/ranks' }, icon('award', { size: 16 }), 'Leaderboards'),
          h('button.btn.btn-sm', { type: 'button', onclick: changePin }, icon('lock', { size: 16 }), 'Change PIN'),
          h('button.btn.btn-sm', { type: 'button', onclick: signOut }, 'Sign out'))),
      stats,
      h('div.acct-foot', h('button.link-btn.danger', { type: 'button', onclick: () => deleteAccount(s.name) }, 'Delete account'))));

    SQ.api.me().then((me) => {
      const st = me.stats || {};
      SQ.clear(stats);
      const hPlayed = st.h_played || 0, hWon = st.h_won || 0;
      const dist = [1, 2, 3, 4, 5, 6].map((n) => st['h_d' + n] || 0);
      const maxD = Math.max(1, ...dist);
      stats.append(
        h('div.lcd.acct-lcd',
          SQ.ui.readout('Sarpa daily streak', st.sd_streak || 0),
          SQ.ui.readout('Best', st.sd_best || 0),
          SQ.ui.readout('Herpdle streak', st.h_streak || 0),
          SQ.ui.readout('Best', st.h_best || 0),
          SQ.ui.readout('Ranked quizzes', st.s_games || 0),
          SQ.ui.readout('Ranked points', (st.s_points || 0).toLocaleString()),
          SQ.ui.readout('Accuracy', pctOf(st.s_correct || 0, st.s_answered || 0) + '%'),
          SQ.ui.readout('Survival best', st.s_sudden_best || 0)),
        hPlayed ? h('div.acct-dist',
          h('p.legend', `Herpdle · ${hPlayed} played · ${pctOf(hWon, hPlayed)}% solved`),
          h('div.dist', dist.map((n, i) => h('div.dist-row', h('span.dist-n', String(i + 1)), h('span.dist-bar', h('i', { style: { width: Math.max(4, (100 * n) / maxD) + '%' } }, String(n))))))) : null,
        h('p.muted.small', me.today
          ? `Today: Sarpa daily ${me.today.sarpa === 'done' ? 'played' : 'not played yet'} · Herpdle ${me.today.herpdle === 'done' ? 'played' : 'not played yet'}`
          : ''));
    }).catch((e) => {
      SQ.clear(stats);
      stats.append(h('p.muted', e.code === 'signed_out' ? 'You have been signed out. Please sign in again.' : 'Your statistics could not be loaded right now. ' + friendly(e)));
    });
    return box;
  }

  SQ.account = { open, gate, headerButton, panel, changePin, deleteAccount, signOut };
})();
