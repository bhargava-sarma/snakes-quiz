/* Reusable UI pieces: badges, photo figures, modal, lightbox, toast, rings. */
(function () {
  'use strict';
  const SQ = (window.SQ = window.SQ || {});
  const { h, icon } = SQ;

  const ui = {};

  /* ---------- names and badges ---------- */

  ui.venomBadge = function (sp, opts = {}) {
    const v = SQ.explain.venomInfo(sp);
    const label = opts.short ? v.short : v.label;
    return h(`span.badge.venom-${v.level}`, { title: SQ.cap(v.note) }, icon(v.icon, { size: 14 }), label);
  };

  ui.big4Badge = (sp) => (sp.big4 ? h('span.badge.big4', { title: 'One of the "Big Four" snakes responsible for most snakebite deaths in India' }, 'Big Four') : null);

  ui.tierDots = function (sp) {
    const label = ['', 'Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'][sp.tier] || '';
    const dots = h('span.dots', { title: `Identification difficulty: ${label}`, 'aria-label': `Difficulty ${sp.tier} of 5: ${label}` });
    for (let i = 1; i <= 5; i++) dots.appendChild(h('i', { class: i <= sp.tier ? 'on' : '' }));
    return dots;
  };

  ui.nameBlock = function (sp, opts = {}) {
    return h('span.names',
      h('span.common', sp.name),
      opts.sci === false ? null : h('i.sci', sp.sci));
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
    bits.forEach((b, i) => { if (i) el.appendChild(h('span.dot', '·')); el.appendChild(b); });
    return el;
  };

  /**
   * A photo box: blurred backdrop + the picture itself "contained" so the whole snake is always visible.
   * opts.zoom adds an "enlarge" button, opts.eager marks it as high priority.
   */
  ui.photo = function (photo, opts = {}) {
    const fig = h('figure.photo.is-loading');
    const blur = h('img.photo-blur', { alt: '', 'aria-hidden': 'true', decoding: 'async' });
    const main = h('img.photo-main', {
      alt: opts.alt || 'Photo of a snake to identify', decoding: 'async',
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
    fig.append(blur, main, h('div.skeleton'));
    if (opts.zoom) {
      fig.classList.add('zoomable');
      const open = () => ui.lightbox(photo);
      fig.appendChild(h('button.zoom-btn', { type: 'button', 'aria-label': 'Enlarge photo', onclick: open }, icon('zoom', { size: 18 })));
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
  ui.modal = function ({ title, body, actions, wide, onClose, className }) {
    ui.closeModal();
    lastFocus = document.activeElement;
    ui._onClose = onClose || null;
    const box = h('div.modal' + (wide ? '.wide' : '') + (className ? '.' + className : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
      h('button.icon-btn.modal-x', { type: 'button', 'aria-label': 'Close', onclick: ui.closeModal }, icon('x')),
      title ? h('h2.modal-title', title) : null,
      h('div.modal-body', body),
      actions && actions.length ? h('div.modal-actions', actions) : null);
    const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) ui.closeModal(); } }, box);
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
  ui.lightbox = function (photo, extra) {
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

  /** Segmented single-choice control. */
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

  /** Circular progress ring with a label inside. */
  ui.ring = function (pct, { size = 140, stroke = 12, label, sub, color } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const wrap = h('div.ring', { style: { width: size + 'px', height: size + 'px' } });
    wrap.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
      <circle class="ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || 'var(--brand)'}" stroke-width="${stroke}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
    wrap.appendChild(h('div.ring-label', h('strong', label != null ? label : pct + '%'), sub ? h('span', sub) : null));
    const arc = wrap.querySelector('.ring-arc');
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = c * (1 - Math.max(0, Math.min(100, pct)) / 100); }));
    return wrap;
  };

  ui.empty = (title, text, action) => h('div.empty', h('h3', title), text ? h('p', text) : null, action || null);

  ui.pageHead = function (title, sub, right) {
    return h('div.page-head', h('div', h('h1', title), sub ? h('p.lead', sub) : null), right || null);
  };

  /** Lightweight confetti burst (CSS only, removes itself). */
  ui.confetti = function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = h('div.confetti', { 'aria-hidden': 'true' });
    const colors = ['#1c6b4a', '#e8962b', '#d94a3a', '#2b8fd6', '#8f5bd6', '#f2c94c'];
    for (let i = 0; i < 70; i++) {
      const p = h('i', { style: {
        left: Math.random() * 100 + '%', background: colors[i % colors.length],
        animationDelay: Math.random() * 0.6 + 's', animationDuration: 1.8 + Math.random() * 1.6 + 's',
        transform: `rotate(${Math.random() * 360}deg)`, width: 6 + Math.random() * 6 + 'px', height: 8 + Math.random() * 8 + 'px',
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
