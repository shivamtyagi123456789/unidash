/* =========================================================================
   UniDash v2 — motion engine
   Smooth scroll (Lenis) · scroll reveals · split-letter headlines ·
   rAF-smoothed 3D tilt with glare · cursor spotlight on panels ·
   magnetic buttons · click ripples · custom cursor · count-up numbers ·
   sliding rail indicator · scroll progress bar.
   Everything degrades to "no motion" under prefers-reduced-motion.
   ========================================================================= */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const lerp = (a, b, k) => a + (b - a) * k;

let lenis = null;
const mainView = () => $('#main-view');

/* ---------- Smooth scroll ---------- */
function initScroll() {
  const wrapper = mainView(), content = $('#view-host');
  if (!reduced && window.Lenis && wrapper && content) {
    try {
      lenis = new window.Lenis({ wrapper, content, duration: 1.1, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    } catch (e) { lenis = null; }
  }
  const bar = $('#scroll-progress i');
  const onScroll = () => {
    scrolledOnce = true;
    checkReveals();
    const el = mainView(); const max = el.scrollHeight - el.clientHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? el.scrollTop / max : 0})`;
  };
  wrapper.addEventListener('scroll', onScroll, { passive: true });
}
export function scrollTo(y, immediate = true) {
  if (lenis) lenis.scrollTo(y, { immediate, force: true });
  else mainView().scrollTop = y;
}
export function scrollTop() { return mainView().scrollTop; }

/* ---------- Split headline into animated letters ---------- */
function splitText(el) {
  if (el.dataset.split) return; el.dataset.split = '1';
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(' ')); return; }
          const word = document.createElement('span'); word.className = 'split-word'; word.setAttribute('aria-hidden', 'true');
          [...w].forEach((ch) => { const s = document.createElement('span'); s.className = 'split-ch'; s.style.setProperty('--i', Math.min(i++, 28)); s.textContent = ch; word.appendChild(s); });
          frag.appendChild(word);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.matches('svg, i')) walk(n);
    });
  };
  walk(el);
}

/* ---------- Reveal on scroll ---------- */
const REVEAL = '.panel, .crunch-banner, .section-label, .filter-row, .board-toolbar, .wa-day, .wa-msg, .view-sub, .exam-legend';
let booted = !document.body || !document.getElementById('boot-screen');
const bootWaiters = [];
export function markBooted() { booted = true; bootWaiters.splice(0).forEach((f) => f()); }
export function afterBoot(fn) { booted ? fn() : bootWaiters.push(fn); }
export const isBooted = () => booted;
function setupReveals(root, instant) {
  if (!instant && !booted) { root.classList.add('pre-boot'); afterBoot(() => { root.classList.remove('pre-boot'); setupReveals(root, false); }); return; }
  pending = [];
  let k = 0;
  $$(REVEAL, root).forEach((el) => {
    if (el.closest('.view-ghost') || el.parentElement.closest('[data-reveal]:not(.view)')) return; // only outermost
    el.setAttribute('data-reveal', '');
    if (instant || reduced) { el.classList.add('in', 'revealed'); return; }
    el.style.setProperty('--d', Math.min(k++, 12) * 70 + 'ms');
    pending.push(el);
  });
  checkReveals();
  setTimeout(checkReveals, 120);
}
/* Geometry-based reveal check (more reliable than IntersectionObserver inside a
   transformed, smooth-scrolled container). Runs on scroll + resize. */
let pending = [];
function checkReveals() {
  if (!pending.length) return;
  const limit = window.innerHeight * 0.96;
  let k = 0;
  pending = pending.filter((el) => {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.top < limit && r.bottom > 0) {
      if (!el.classList.contains('in')) {
        // elements revealed by scrolling get a small fresh stagger instead of their mount delay
        if (scrolledOnce) el.style.setProperty('--d', Math.min(k++, 6) * 60 + 'ms');
        el.classList.add('in');
        const d = parseInt(el.style.getPropertyValue('--d')) || 0;
        // once the entrance is over, drop the long transition so 3D tilt feels instant
        setTimeout(() => el.classList.add('revealed'), 1150 + d);
      }
      return false;
    }
    return true;
  });
}
let scrolledOnce = false;

/* ---------- Count-up numbers ---------- */
function countUp(root, instant) {
  if (instant || reduced) return;
  if (!booted) { afterBoot(() => countUp(root, false)); return; }
  $$('.summary-stats b, .att-math b, .exam-card .big-count b, .sheet-count', root).forEach((el) => {
    const txt = el.textContent.trim();
    if (!/^\d+(\.\d+)?$/.test(txt)) return;
    const to = parseFloat(txt), dec = (txt.split('.')[1] || '').length, t0 = performance.now() + 250, dur = 1100;
    el.textContent = (0).toFixed(dec);
    const step = (now) => {
      const k = Math.min(1, Math.max(0, (now - t0) / dur)); const e = 1 - Math.pow(1 - k, 4);
      el.textContent = (to * e).toFixed(dec);
      if (k < 1) requestAnimationFrame(step); else el.textContent = txt;
    };
    requestAnimationFrame(step);
  });
}

/* ---------- Stagger indices for CSS-driven micro animations ---------- */
function stagger(root) {
  $$('.week-day', root).forEach((d, di) => $$('.pip', d).forEach((p, i) => p.style.setProperty('--pi', di + i)));
  $$('.load-meter .bar i', root).forEach((b, i) => b.style.setProperty('--bi', i));
  $$('.cal-event', root).forEach((c, i) => c.style.setProperty('--ci', i % 40));
  $$('.sem-band', root).forEach((b, i) => b.style.setProperty('--si', i));
  $$('.exam-monolith', root).forEach((m, i) => m.style.setProperty('--sd', (i * 0.27).toFixed(2) + 's'));
}

/* ---------- 3D tilt (rAF smoothed) ---------- */
const TILT = '.exam-card, .att-card, .proj-card, .file-tile, .greeting';
const tilts = new Map();
let tiltRaf = 0;
function tiltLoop() {
  tiltRaf = 0;
  let active = false;
  tilts.forEach((s, el) => {
    s.rx = lerp(s.rx, s.trx, 0.14); s.ry = lerp(s.ry, s.try, 0.14); s.z = lerp(s.z, s.tz, 0.14);
    el.style.transform = `perspective(1000px) rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg) translateZ(${s.z.toFixed(1)}px)`;
    const settled = Math.abs(s.rx - s.trx) < 0.02 && Math.abs(s.ry - s.try) < 0.02 && Math.abs(s.z - s.tz) < 0.1;
    if (settled && !s.on) { el.style.transform = ''; el.classList.remove('tilt-active'); tilts.delete(el); } else active = true;
  });
  if (active) tiltRaf = requestAnimationFrame(tiltLoop);
}
function kickTilt() { if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltLoop); }
function bindTilt() {
  if (reduced || !fine) return;
  document.addEventListener('pointermove', (ev) => {
    const el = ev.target.closest?.(TILT);
    tilts.forEach((s, k) => { if (k !== el && s.on) { s.on = false; s.trx = s.try = s.tz = 0; } });
    if (!el || el.closest('.view-ghost')) { kickTilt(); return; }
    if (!el.querySelector(':scope > .tilt-glare')) { el.classList.add('tilt'); el.insertAdjacentHTML('beforeend', '<span class="tilt-glare" aria-hidden="true"></span>'); }
    const r = el.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    const big = r.width > 420 ? 0.55 : 1;
    let s = tilts.get(el); if (!s) { s = { rx: 0, ry: 0, z: 0 }; tilts.set(el, s); }
    s.on = true; s.trx = (0.5 - y) * 10 * big; s.try = (x - 0.5) * 12 * big; s.tz = 12;
    el.classList.add('tilt-active');
    el.style.setProperty('--gx', x * 100 + '%'); el.style.setProperty('--gy', y * 100 + '%');
    kickTilt();
  }, { passive: true });
}

/* ---------- Spotlight + magnetic + cursor ---------- */
function bindPointerFx() {
  if (!fine) return;
  const dot = $('#cursor-dot'), ring = $('#cursor-ring');
  let mx = -100, my = -100, rx = -100, ry = -100, cursorRaf = 0;
  const loop = () => {
    rx = lerp(rx, mx, 0.2); ry = lerp(ry, my, 0.2);
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    cursorRaf = Math.abs(rx - mx) + Math.abs(ry - my) > 0.1 ? requestAnimationFrame(loop) : 0;
  };
  if (!reduced) document.body.classList.add('has-cursor');
  let lastPanel = null, magnet = null;
  document.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    mx = ev.clientX; my = ev.clientY;
    if (!reduced) { dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`; if (!cursorRaf) cursorRaf = requestAnimationFrame(loop); }
    const t = ev.target;
    document.body.classList.toggle('cursor-hover', !!t.closest?.('a, button, [data-event], [data-go], [tabindex="0"], input, .exam-monolith'));
    // Panel spotlight
    const p = t.closest?.('.panel');
    if (lastPanel && lastPanel !== p) { lastPanel.style.setProperty('--mx', '-500px'); lastPanel.style.setProperty('--my', '-500px'); }
    if (p) { const r = p.getBoundingClientRect(); p.style.setProperty('--mx', ev.clientX - r.left + 'px'); p.style.setProperty('--my', ev.clientY - r.top + 'px'); }
    lastPanel = p;
    // Magnetic buttons
    if (reduced) return;
    const m = t.closest?.('.btn, .icon-btn, .rail-btn, .filter-pill, .rail-link');
    if (magnet && magnet !== m) { magnet.style.transform = ''; }
    if (m && !m.closest('.view-ghost')) {
      const r = m.getBoundingClientRect(); const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      const k = m.classList.contains('rail-link') ? 0.18 : 0.28;
      m.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    }
    magnet = m;
  }, { passive: true });
  document.addEventListener('pointerdown', () => document.body.classList.add('cursor-down'));
  document.addEventListener('pointerup', () => document.body.classList.remove('cursor-down'));
  document.addEventListener('mouseleave', () => { document.body.classList.remove('has-cursor'); });
  document.addEventListener('mouseenter', () => { if (!reduced) document.body.classList.add('has-cursor'); });
}
function bindRipple() {
  if (reduced) return;
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest?.('.btn'); if (!b) return;
    const r = b.getBoundingClientRect(); const d = Math.max(r.width, r.height);
    const s = document.createElement('span'); s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${ev.clientX - r.left - d / 2}px;top:${ev.clientY - r.top - d / 2}px`;
    b.appendChild(s); setTimeout(() => s.remove(), 700);
  });
}

/* ---------- Rail indicator ---------- */
export function moveRail() {
  const nav = $('#rail-nav'); if (!nav) return;
  let ind = $('.rail-indicator', nav), glow = $('.rail-glow', nav);
  if (!ind) { nav.insertAdjacentHTML('afterbegin', '<i class="rail-indicator" aria-hidden="true"></i><i class="rail-glow" aria-hidden="true"></i>'); ind = $('.rail-indicator', nav); glow = $('.rail-glow', nav); }
  const a = $('.rail-link.active', nav);
  if (!a) { ind.style.opacity = 0; glow.style.opacity = 0; return; }
  ind.style.opacity = 1; glow.style.opacity = 1;
  ind.style.top = a.offsetTop + (a.offsetHeight - 26) / 2 + 'px';
  glow.style.top = a.offsetTop + 'px';
}

/* ---------- Draggable horizontal scrollers (exam corridor) ---------- */
function dragScroll(root) {
  $$('.exam-strip-scroll', root).forEach((sc) => {
    let down = false, sx = 0, sl = 0, v = 0, last = 0, raf = 0;
    sc.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = sc.scrollLeft; last = e.clientX; v = 0; cancelAnimationFrame(raf); sc.classList.add('dragging'); });
    window.addEventListener('pointermove', (e) => { if (!down) return; sc.scrollLeft = sl - (e.clientX - sx); v = e.clientX - last; last = e.clientX; });
    window.addEventListener('pointerup', () => {
      if (!down) return; down = false; sc.classList.remove('dragging');
      const glide = () => { sc.scrollLeft -= v; v *= 0.93; if (Math.abs(v) > 0.3) raf = requestAnimationFrame(glide); };
      if (!reduced) glide();
    });
    // vertical wheel → horizontal travel
    sc.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); sc.scrollBy({ left: e.deltaY * 1.2, behavior: 'smooth' }); } }, { passive: false });
    sc.setAttribute('data-lenis-prevent', '');
  });
  $$('.cal-scroll, .deadline-board, #radar-canvas', root).forEach((el) => el.setAttribute('data-lenis-prevent', ''));
}

/* ---------- Public: decorate a freshly rendered view ---------- */
export function decorate(root, { instant = false } = {}) {
  if (!root) return;
  if (!instant && !reduced) afterBoot(() => $$('.view-title, .greeting h2', root).forEach(splitText));
  setupReveals(root, instant);
  stagger(root);
  countUp(root, instant);
  dragScroll(root);
  moveRail();
  scrolledOnce = false;
  const bar = $('#scroll-progress i'); if (bar) bar.style.transform = 'scaleX(0)';
}

export function init() {
  initScroll();
  bindTilt();
  bindPointerFx();
  bindRipple();
  window.addEventListener('resize', () => { moveRail(); checkReveals(); });
  $('#palette-results')?.setAttribute('data-lenis-prevent', '');
  $('#side-sheet')?.setAttribute('data-lenis-prevent', '');
}

export const isReduced = reduced;
