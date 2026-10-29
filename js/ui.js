/* Reusable UI pieces: tags, photo viewfinder, dialogs, LCD widgets, the dial gauge and the pixel snake. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;

  const ui = {};

  /* ---------- names and tags ---------- */

  /** Venom status as a little LED meter: 0 lit (harmless) to 3 lit (highly venomous). */
  ui.venomBadge = function (sp, opts = {}) {
    const v = SQ.explain.venomInfo(sp);
    const label = opts.short ? v.short : v.label;
    return h(`span.badge.venom-${v.level}`, { title: SQ.cap(v.note) },
      h('span.vleds', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), label);
  };

  ui.big4Badge = (sp) => (sp.big4 ? h('span.badge.big4', { title: 'One of the "Big Four" snakes responsible for most snakebite deaths in India' }, 'Big Four') : null);

  ui.tierDots = function (sp) {
    const label = ['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][sp.tier] || '';
    const dots = h('span.dots', { title: `Identification difficulty: ${label}`, role: 'img', 'aria-label': `Difficulty ${sp.tier} of 5: ${label}` });
    for (let i = 1; i <= 5; i++) dots.appendChild(h('i', { class: i <= sp.tier ? 'on' : '' }));
    return dots;
  };

  const HUES = {
    black: '#1b1b1a', brown: '#7a4b2b', grey: '#8d8d88', green: '#3fa34d', yellow: '#e8c21a', red: '#d23a2b', orange: '#f08a24',
    blue: '#3b6fd6', white: '#f4f2ec', olive: '#7d8a2b', pink: '#e88aa8', cream: '#efe3c2', silver: '#c3c7c9', tan: '#c9a77a',
  };
  /** The snake's main colours as small round swatches ("colourway"). */
  ui.hueDots = function (sp) {
    const hues = (sp.t && sp.t.hue) || [];
    if (!hues.length) return null;
    return h('span.hues', { role: 'img', 'aria-label': 'Colours: ' + hues.join(', ') },
      hues.map((c) => h('i', { title: SQ.cap(c), style: { background: HUES[c] || '#999' } })));
  };

  ui.nameBlock = function (sp, opts = {}) {
    return h('span.names',
      h('span.common', sp.name),
      opts.sci === false ? null : h('i.sci', sp.sci));
  };

  /* ---------- the pixel snake mark ---------- */

  const SNAKE_CELLS = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [5, 4], [4, 4], [3, 4], [2, 4], [1, 4], [0, 4]];

  /** The logo snake (an "S" of LED cells) in the current text colour. */
  ui.snakeMark = function (cls) {
    const span = h('span.snake-mark' + (cls ? '.' + cls : ''), { 'aria-hidden': 'true' });
    const cells = SNAKE_CELLS.map(([c, r]) => `<rect x="${c * 8 + .5}" y="${r * 8 + .5}" width="7" height="7" rx="1.3"/>`).join('');
    span.innerHTML = `<svg viewBox="0 0 56 40" fill="currentColor">${cells}<rect x="35.8" y="1.7" width="2.3" height="2.3" fill="var(--panel)"/><path d="M41 4H43.6M43.6 4L47.6 1.4M43.6 4L47.6 6.6" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
    return span;
  };

  /* ---------- images ---------- */

  ui.thumb = function (sp, cls = '') {
    const img = h('img.thumb' + (cls ? '.' + cls : ''), { alt: '', loading: 'lazy', decoding: 'async' });
    img.onerror = () => {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      const cover = SQ.data.coverOf(sp.id);
      if (cover) img.src = cover.remote;
    };
    img.src = sp.thumb;
    return img;
  };

  ui.creditText = function (photo) {
    return `Photo: ${photo.credit}`;
  };

  ui.creditLine = function (photo, opts = {}) {
    const bits = [
      h('span', '© ', photo.credit),
      photo.licenseUrl
        ? h('a', { href: photo.licenseUrl, target: '_blank', rel: 'noopener' }, photo.license.replace(/^CC-(?=[A-Z])/, 'CC '))
        : h('span', photo.license),
      h('a', { href: photo.page, target: '_blank', rel: 'noopener' }, 'iNaturalist'),
    ];
    if (photo.state && opts.place !== false) bits.push(h('span.place', icon('pin', { size: 13 }), photo.state));
    if (photo.inat && opts.inat !== false) bits.push(h('span', { title: 'The name this photo carries on iNaturalist' }, `iNat ID: ${photo.inat}`));
    const el = h('p.credit');
    bits.forEach((b, i) => { if (i) el.appendChild(h('span.dot', { 'aria-hidden': 'true' }, '·')); el.appendChild(b); });
    return el;
  };

  /**
   * A photo box: blurred backdrop + the picture itself "contained" so the whole snake is always visible.
   * opts.zoom adds an "enlarge" button, opts.eager marks it as high priority, opts.vf draws viewfinder corners,
   * opts.tag prints a small label on it, opts.ratio === 'natural' sizes the box to the picture's own shape.
   */
  ui.photo = function (photo, opts = {}) {
    const fig = h('figure.photo.is-loading' + (opts.vf ? '.vf' : ''));
    if (opts.ratio === 'natural' && photo.w && photo.h) fig.style.aspectRatio = String(Math.min(1.9, Math.max(0.7, photo.w / photo.h)));
    const blur = h('img.photo-blur', { alt: '', 'aria-hidden': 'true', decoding: 'async' });
    const main = h('img.photo-main', {
      alt: opts.alt != null ? opts.alt : 'Photo of a snake to identify', decoding: 'async',
      width: photo.w || null, height: photo.h || null,
    });
    if (opts.eager) main.setAttribute('fetchpriority', 'high'); else main.loading = 'lazy';
    const done = () => fig.classList.remove('is-loading');
    main.addEventListener('load', done);
    main.addEventListener('error', () => {
      if (main.dataset.fallback) { fig.classList.remove('is-loading'); fig.classList.add('is-broken'); return; }
      main.dataset.fallback = '1';
      main.src = photo.remote;
      blur.src = photo.remote;
    });
    main.src = photo.url;
    blur.src = photo.url;
    fig.append(blur, main, h('div.skeleton'), h('span.photo-broken', 'Photo unavailable'));
    if (opts.tag) fig.appendChild(h('span.photo-tag', opts.tag));
    if (opts.zoom) {
      fig.classList.add('zoomable');
      const open = () => ui.lightbox(photo);
      fig.appendChild(h('button.zoom-btn', { type: 'button', 'aria-label': 'Enlarge photo', onclick: open }, icon('zoom', { size: 20 })));
      main.addEventListener('click', open);
    }
    if (main.complete && main.naturalWidth) done();
    return fig;
  };

  ui.preload = function (photo) {
    if (!photo) return;
    const img = new Image();
    img.onerror = () => { img.onerror = null; img.src = photo.remote; };
    img.src = photo.url;
  };

  /* ---------- modal & lightbox ---------- */

  const modalRoot = () => document.getElementById('modal-root');
  let lastFocus = null;

  ui.closeModal = function () {
    const root = modalRoot();
    if (!root.firstChild) return;
    SQ.clear(root);
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', modalKeys, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
    if (ui._onClose) { const f = ui._onClose; ui._onClose = null; f(); }
  };

  function modalKeys(e) {
    if (e.key === 'Escape') { e.stopPropagation(); ui.closeModal(); return; }
    if (e.key === 'Tab') {
      const box = modalRoot().querySelector('.modal');
      if (!box) return;
      const items = SQ.$$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', box);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /** Show a dialog. Returns a function that closes it. */
  ui.modal = function ({ title, body, actions, wide, onClose, className, place }) {
    ui.closeModal();
    lastFocus = document.activeElement;
    ui._onClose = onClose || null;
    const box = h('div.modal' + (wide ? '.wide' : '') + (className ? '.' + className : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      h('button.icon-btn.modal-x', { type: 'button', 'aria-label': 'Close', onclick: ui.closeModal }, icon('x')),
      title ? h('h2.modal-title', title) : null,
      h('div.modal-body', body),
      actions && actions.length ? h('div.modal-actions', actions) : null);
    // place 'top': on phones the dialog opens near the top instead of as a bottom sheet, so the keyboard does not cover its fields
    const back = h('div.modal-back' + (place === 'top' ? '.top' : ''), { onclick: (e) => { if (e.target === back) ui.closeModal(); } }, box);
    modalRoot().appendChild(back);
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', modalKeys, true);
    const focusTarget = SQ.$('[autofocus]', box) || SQ.$('button.btn-primary', box) || box;
    if (focusTarget === box) box.setAttribute('tabindex', '-1');
    setTimeout(() => focusTarget.focus(), 20);
    return ui.closeModal;
  };

  ui.confirm = function ({ title, text, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      let answered = false;
      const finish = (v) => { answered = true; ui.closeModal(); resolve(v); };
      ui.modal({
        title, body: h('p', text),
        actions: [
          h('button.btn.btn-ghost', { type: 'button', onclick: () => finish(false) }, cancelLabel),
          h('button.btn.' + (danger ? 'btn-danger' : 'btn-primary'), { type: 'button', autofocus: true, onclick: () => finish(true) }, confirmLabel),
        ],
        onClose: () => { if (!answered) resolve(false); },
      });
    });
  };

  /** Full-screen photo viewer with click-to-zoom and drag-to-pan. */
  ui.lightbox = function (photo) {
    const img = h('img.lb-img', { alt: 'Enlarged snake photo', draggable: 'false' });
    img.onerror = () => { if (!img.dataset.fallback) { img.dataset.fallback = '1'; img.src = photo.remote; } };
    img.src = photo.url;
    const stage = h('div.lb-stage', img);
    let scale = 1, tx = 0, ty = 0, drag = null;
    const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; stage.classList.toggle('zoomed', scale > 1); };
    const toggle = (e) => {
      if (scale > 1) { scale = 1; tx = ty = 0; } else {
        const r = img.getBoundingClientRect();
        scale = 2.6;
        tx = -((e.clientX - (r.left + r.width / 2)) * (scale - 1));
        ty = -((e.clientY - (r.top + r.height / 2)) * (scale - 1));
      }
      apply();
    };
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (scale > 1) { tx = drag.tx + dx; ty = drag.ty + dy; apply(); }
    });
    stage.addEventListener('pointerup', (e) => { const d = drag; drag = null; if (d && !d.moved) toggle(e); });
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 0.87)));
      if (scale === 1) tx = ty = 0;
      apply();
    }, { passive: false });
    ui.modal({
      className: 'lightbox', wide: true, title: '',
      body: [stage, h('div.lb-cap', ui.creditLine(photo, { inat: false }), h('p.hint-text', 'Click or tap to zoom, drag to pan'))],
    });
  };

  /* ---------- toast ---------- */

  ui.toast = function (message, kind) {
    const root = document.getElementById('toast-root');
    const t = h('div.toast' + (kind ? '.' + kind : ''), { role: 'status' }, message);
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  };

  /* ---------- small widgets ---------- */

  /** Single-choice row of keys. */
  ui.segmented = function ({ options, value, onChange, name, className }) {
    const wrap = h('div.seg' + (className ? '.' + className : ''), { role: 'radiogroup', 'aria-label': name || '' });
    const draw = () => {
      SQ.clear(wrap);
      options.forEach((o) => {
        const on = o.value === value;
        wrap.appendChild(h('button.seg-btn' + (on ? '.on' : ''), {
          type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false',
          onclick: () => { value = o.value; draw(); onChange && onChange(value); },
        }, h('span.seg-main', o.label), o.sub ? h('span.seg-sub', o.sub) : null));
      });
    };
    draw();
    return wrap;
  };

  ui.toggle = function ({ label, sub, checked, onChange }) {
    const input = h('input', { type: 'checkbox', role: 'switch' });
    input.checked = !!checked;
    input.addEventListener('change', () => onChange && onChange(input.checked));
    return h('label.switch', h('span.switch-text', h('span.switch-label', label), sub ? h('span.switch-sub', sub) : null), input, h('span.switch-track', h('span.switch-knob')));
  };

  ui.led = (state) => h('span.led' + (state ? '.' + state.split(' ').join('.') : ''), { 'aria-hidden': 'true' });

  /** A readout on an LCD: tiny printed label above big dot-matrix digits. */
  ui.readout = function (label, value, cls) {
    return h('div.readout' + (cls ? '.' + cls : ''), h('span.legend', label), h('b.lcd-num', String(value)));
  };

  /**
   * Rotary-knob gauge: a scale ring, a value arc and a knob turned to the score. Digits sit on the knob.
   * (kept the .ring-label markup so tests and styles can find the number)
   */
  ui.dial = function (pct, { size = 232, label, sub } = {}) {
    pct = Math.max(0, Math.min(100, pct));
    const tone = pct >= 70 ? 'ok' : pct >= 45 ? 'warn' : 'bad';
    const wrap = h('div.dial.ring', { 'data-tone': tone, style: { '--size': size + 'px' } });
    const C = 2 * Math.PI * 80, span = C * 0.75;
    let ticks = '';
    for (let i = 0; i <= 40; i++) {
      const a = (-135 + i * (270 / 40) - 90) * Math.PI / 180, major = i % 5 === 0;
      const r1 = 97, r2 = r1 - (major ? 11 : 6);
      ticks += `<line x1="${(100 + r1 * Math.cos(a)).toFixed(2)}" y1="${(100 + r1 * Math.sin(a)).toFixed(2)}" x2="${(100 + r2 * Math.cos(a)).toFixed(2)}" y2="${(100 + r2 * Math.sin(a)).toFixed(2)}" stroke-width="${major ? 2 : 1.2}"/>`;
    }
    wrap.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true">
      <g class="dial-ticks" stroke="currentColor" stroke-linecap="round">${ticks}</g>
      <circle class="dial-track" cx="100" cy="100" r="80" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${span} ${C}" transform="rotate(135 100 100)"/>
      <circle class="dial-val" cx="100" cy="100" r="80" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="0 ${C}" transform="rotate(135 100 100)"/></svg>`;
    const notch = h('span.dial-notch');
    notch.style.transform = 'rotate(-135deg)';
    wrap.appendChild(h('div.dial-knob', notch, h('div.ring-label', h('strong', label != null ? label : pct + '%'), sub ? h('span', sub) : null)));
    const arc = wrap.querySelector('.dial-val');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      arc.style.strokeDasharray = `${(span * pct / 100).toFixed(2)} ${C}`;
      notch.style.transform = `rotate(${-135 + 270 * pct / 100}deg)`;
    }));
    return wrap;
  };
  ui.ring = ui.dial;

  /**
   * Quiz progress as a snake's backbone: one segment per question. Answered segments turn green or red,
   * the current one is the head.
   */
  ui.steps = function (total) {
    const bar = h('div.steps' + (total > 30 ? '.dense' : ''), { role: 'progressbar', 'aria-label': 'Quiz progress', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': 0 });
    for (let i = 0; i < total; i++) bar.appendChild(h('i'));
    const cells = Array.from(bar.children);
    return {
      el: bar,
      update(answers, index) {
        cells.forEach((c, i) => {
          const a = answers[i];
          c.className = a ? (a.correct ? 'ok' : 'bad') : i === index ? 'now' : '';
        });
        bar.setAttribute('aria-valuenow', String(answers.length));
      },
    };
  };

  /**
   * A tiny Nokia-style snake crawling along a sine wave on a dot-matrix screen. Purely decorative.
   * Returns { el, start, stop }; the owner must call stop() when the view goes away.
   */
  ui.pixelSnake = function (opts = {}) {
    const cell = opts.cell || 7, gap = opts.gap != null ? opts.gap : 2, rows = opts.rows || 7, len = opts.length || 10;
    const pitch = cell + gap;
    const wrap = h('div.pixsnake', { 'aria-hidden': 'true' });
    const canvas = h('canvas');
    wrap.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cols = 0, path = [], tick = 0, timer = null, ro = null, food = 0, total = 0;

    function build() {
      const w = Math.max(wrap.clientWidth, 120);
      cols = Math.max(14, Math.floor((w + gap) / pitch));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = cols * pitch * dpr; canvas.height = rows * pitch * dpr;
      canvas.style.width = cols * pitch - gap + 'px'; canvas.style.height = rows * pitch - gap + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const target = (x) => Math.round((rows - 1) / 2 + ((rows - 1) / 2 - 0.35) * Math.sin(x * 0.36 + 0.6));
      path = []; let y = target(0);
      path.push([0, y]);
      for (let x = 1; x < cols; x++) {
        path.push([x, y]);
        const t = target(x);
        while (y !== t) { y += y < t ? 1 : -1; path.push([x, y]); }
      }
      food = Math.floor(path.length * 0.62);
      total = path.length + len + 14;
      tick = reduce ? Math.floor(path.length * 0.45) : Math.min(tick, total - 1);
    }

    function colors() {
      const cs = getComputedStyle(wrap);
      return { ink: cs.getPropertyValue('--lcd-ink').trim() || '#1b2417', dim: cs.getPropertyValue('--lcd-dim').trim() || 'rgba(27,36,23,.16)' };
    }

    function draw() {
      const c = colors();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = c.dim;
      for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) ctx.fillRect(x * pitch, y * pitch, cell, cell);
      ctx.fillStyle = c.ink;
      for (let k = 0; k < len; k++) {
        const p = path[tick - k];
        if (p) ctx.fillRect(p[0] * pitch, p[1] * pitch, cell, cell);
      }
      if (tick < food && (reduce || tick % 6 < 4)) { const f = path[food]; ctx.fillRect(f[0] * pitch + 1, f[1] * pitch + 1, cell - 2, cell - 2); }
    }

    function step() {
      if (document.hidden) return;
      tick = (tick + 1) % total;
      draw();
    }

    function start() {
      if (!ro && window.ResizeObserver) { ro = new ResizeObserver(() => { build(); draw(); }); ro.observe(wrap); }
      window.addEventListener('sarpa-theme', draw);
      build(); draw();
      if (!reduce && !timer) timer = setInterval(step, 105);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (ro) { ro.disconnect(); ro = null; }
      window.removeEventListener('sarpa-theme', draw);
    }
    return { el: wrap, start, stop };
  };

  ui.empty = (title, text, action) => h('div.empty', ui.snakeMark(), h('h2', title), text ? h('p', text) : null, action || null);

  ui.pageHead = function (title, sub, right, legend) {
    return h('div.page-head',
      h('div', legend ? h('p.legend', legend) : null, h('h1', title), sub ? h('p.lead', sub) : null),
      right ? h('div.page-head-actions', right) : null);
  };

  /** Lightweight confetti burst (CSS only, removes itself). */
  ui.confetti = function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = h('div.confetti', { 'aria-hidden': 'true' });
    const colors = ['#ff5a12', '#131312', '#19a757', '#2b62ff', '#f2a900', '#d9193a', '#f4f3ef'];
    for (let i = 0; i < 70; i++) {
      const p = h('i', { style: {
        left: Math.random() * 100 + '%', background: colors[i % colors.length],
        animationDelay: Math.random() * 0.6 + 's', animationDuration: 1.8 + Math.random() * 1.6 + 's',
        transform: `rotate(${Math.random() * 360}deg)`, width: 6 + Math.random() * 6 + 'px', height: 6 + Math.random() * 8 + 'px',
      } });
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 4200);
  };

  /** Copy text, using the share sheet on phones when available. */
  ui.shareText = async function (text, url) {
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      ui.toast('Result copied to clipboard');
    } catch (e) {
      ui.modal({ title: 'Copy your result', body: h('textarea.share-box', { rows: 6, readonly: true }, text) });
    }
  };

  SQ.ui = ui;
})();
