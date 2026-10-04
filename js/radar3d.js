/* =========================================================================
   UniDash v2 — 3D Academic Radar (Three.js r160)
   Polar "time radar": centre = NOW, distance = time remaining (log scale),
   angle sector = subject, height = priority score (SPEC §10.3 formula),
   shape = event kind (SPEC §14.3). A sweep beam rotates like an ATC scope.

   v2 additions
   - Cinematic fly-in camera on mount, critically-damped camera springs
   - Drag inertia (flick to spin), pointer parallax tilt, smooth zoom
   - Rings draw-in stagger, starfield + drifting dust, volumetric core beam
   - Additive glow sprites (bloom-like, no post-processing → works with alpha)
   - Light columns + floor shock-ripples when the sweep hits a blip
   - Signal "comets" travelling from NOW to the most urgent items
   - Eased hover/focus states (no snapping), hover lifts & spins the blip
   ========================================================================= */
import * as THREE from 'three';

const RINGS = [
  { h: 0, label: 'NOW' }, { h: 24, label: '24 H' }, { h: 72, label: '72 H' },
  { h: 168, label: '7 D' }, { h: 720, label: '30 D' }, { h: 1440, label: '60 D' },
];
const R_MAX = 10;
const H_MAX = 1440;
const rOf = (hours) => hours <= 0 ? 0.9 : 1.3 + (R_MAX - 1.3) * Math.log(1 + hours / 8) / Math.log(1 + H_MAX / 8);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
/* Frame-rate independent damping (critically damped feel) */
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

/* Soft radial texture used for all glow sprites */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,255,255,.65)');
  grd.addColorStop(0.45, 'rgba(255,255,255,.16)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/* Vertical fade texture for light columns */
function columnTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(255,255,255,.9)'); grd.addColorStop(0.4, 'rgba(255,255,255,.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export function createRadar({ container, items, subjects, onHover, onSelect, reducedMotion }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'radar-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  const world = new THREE.Group();
  scene.add(world);

  const theme = () => ({
    accent: new THREE.Color(cssVar('--accent') || '#ffb224'),
    accent2: new THREE.Color(cssVar('--accent-2') || '#ff7a45'),
    violet: new THREE.Color(cssVar('--violet') || '#9d8cff'),
    cyan: new THREE.Color(cssVar('--cyan') || '#4cc9ff'),
    grid: new THREE.Color(cssVar('--border-strong') || '#353c4c'),
    faint: new THREE.Color(cssVar('--faint') || '#6f7684'),
    danger: new THREE.Color(cssVar('--danger') || '#ff5a4e'),
    light: document.documentElement.getAttribute('data-theme') === 'light',
  });
  let T = theme();
  const additive = () => (T.light ? THREE.NormalBlending : THREE.AdditiveBlending);
  const GLOW = glowTexture(), COLUMN = columnTexture();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(6, 14, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(T.violet, 0.8); rim.position.set(-10, 4, -8); scene.add(rim);
  const glow = new THREE.PointLight(T.accent, 40, 20, 2); glow.position.set(0, 2.5, 0); scene.add(glow);

  /* ---------- Starfield (far) ---------- */
  const starGeo = new THREE.BufferGeometry(); const NS = 900; const sp = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) {
    const r = 60 + Math.random() * 80, th = Math.random() * TAU, ph = Math.acos(Math.random() * 1.6 - 0.6);
    sp[i * 3] = r * Math.sin(ph) * Math.cos(th); sp[i * 3 + 1] = r * Math.cos(ph); sp[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.35, map: GLOW, color: 0xffffff, transparent: true, opacity: T.light ? 0 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(stars);

  /* ---------- Floor: rings, spokes, sector wedges ---------- */
  const floor = new THREE.Group(); world.add(floor);
  const lineMat = new THREE.LineBasicMaterial({ color: T.grid, transparent: true, opacity: 0.95 });
  const faintMat = new THREE.LineBasicMaterial({ color: T.grid, transparent: true, opacity: 0.4 });
  const accentLineMat = new THREE.LineBasicMaterial({ color: T.accent, transparent: true, opacity: 0.85 });

  function circle(r, mat, seg = 192) {
    const pts = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
  }
  const ringObjs = [];
  RINGS.forEach((ring, i) => {
    if (i === 0) return;
    const c = circle(rOf(ring.h), i === 1 ? accentLineMat : lineMat);
    c.scale.setScalar(reducedMotion ? 1 : 0.001); floor.add(c); ringObjs.push({ o: c, delay: 0.15 + i * 0.12 });
  });
  const outer = circle(R_MAX + 0.6, faintMat); floor.add(outer); ringObjs.push({ o: outer, delay: 0.9 });
  outer.scale.setScalar(reducedMotion ? 1 : 0.001);

  // Rotating tick bezel
  const tickPts = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU, r1 = R_MAX + 0.6, r2 = r1 + (i % 15 === 0 ? 0.55 : i % 5 === 0 ? 0.3 : 0.14);
    tickPts.push(new THREE.Vector3(Math.cos(a) * r1, 0, Math.sin(a) * r1), new THREE.Vector3(Math.cos(a) * r2, 0, Math.sin(a) * r2));
  }
  const bezel = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tickPts), lineMat); floor.add(bezel);
  // Inner counter-rotating dashed ring
  const innerDash = circle(1.6, new THREE.LineDashedMaterial({ color: T.accent, dashSize: 0.18, gapSize: 0.14, transparent: true, opacity: 0.6 }));
  innerDash.computeLineDistances(); floor.add(innerDash);

  // Subject sectors (spokes)
  const nSub = subjects.length;
  const sectorAngle = (i) => (i / nSub) * TAU - Math.PI / 2;
  const spokePts = [];
  subjects.forEach((s, i) => {
    const a = sectorAngle(i) - Math.PI / nSub;
    spokePts.push(new THREE.Vector3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1), new THREE.Vector3(Math.cos(a) * (R_MAX + 0.6), 0, Math.sin(a) * (R_MAX + 0.6)));
  });
  floor.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(spokePts), faintMat));

  // Sector tinted wedges (subject colour) — brighten when hovered blip is in sector
  const wedges = subjects.map((s, i) => {
    const a0 = sectorAngle(i) - Math.PI / nSub;
    const g = new THREE.RingGeometry(1.1, R_MAX + 0.6, 64, 1, -a0 - TAU / nSub, TAU / nSub);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(g, m); mesh.rotation.x = -Math.PI / 2; floor.add(mesh);
    return { mesh, base: T.light ? 0.06 : 0.04, cur: 0 };
  });

  // Core "now" disc + pulse + volumetric beam
  const coreMat = new THREE.MeshBasicMaterial({ color: T.accent, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CircleGeometry(1.1, 64), coreMat); core.rotation.x = -Math.PI / 2; floor.add(core);
  floor.add(circle(1.1, accentLineMat));
  const pulseRings = [0, 0.33, 0.66].map((o) => { const r = circle(1, new THREE.LineBasicMaterial({ color: T.accent, transparent: true, opacity: 0.6 })); floor.add(r); return { r, o }; });
  const beamMat = new THREE.MeshBasicMaterial({ map: COLUMN, color: T.accent, transparent: true, opacity: T.light ? 0.25 : 0.55, depthWrite: false, blending: additive(), side: THREE.DoubleSide });
  const coreBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 7, 32, 1, true), beamMat); coreBeam.position.y = 3.5; world.add(coreBeam);
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: T.accent, transparent: true, opacity: 0.9, depthWrite: false, blending: additive() }));
  coreGlow.scale.setScalar(4.2); coreGlow.position.y = 0.2; world.add(coreGlow);

  /* ---------- Sweep beam ---------- */
  const sweepCanvas = document.createElement('canvas'); sweepCanvas.width = 1024; sweepCanvas.height = 1024;
  function paintSweep() {
    const c = sweepCanvas.getContext('2d'); c.clearRect(0, 0, 1024, 1024);
    const col = '#' + T.accent.getHexString();
    if (c.createConicGradient) {
      const grd = c.createConicGradient(0, 512, 512);
      grd.addColorStop(0, col + '00'); grd.addColorStop(0.72, col + '00'); grd.addColorStop(0.95, col + (T.light ? '40' : '55'));
      grd.addColorStop(0.995, col + (T.light ? '90' : 'cc')); grd.addColorStop(1, col + 'ff');
      c.fillStyle = grd; c.beginPath(); c.arc(512, 512, 512, 0, TAU); c.fill();
    }
    // Leading edge hairline
    c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(512, 512); c.lineTo(1024, 512); c.stroke();
  }
  paintSweep();
  const sweepTex = new THREE.CanvasTexture(sweepCanvas);
  const sweep = new THREE.Mesh(new THREE.CircleGeometry(R_MAX + 0.6, 128), new THREE.MeshBasicMaterial({ map: sweepTex, transparent: true, depthWrite: false, blending: additive(), side: THREE.DoubleSide }));
  sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.012; floor.add(sweep);

  /* ---------- Dust particles (near, drifting upward) ---------- */
  const dustGeo = new THREE.BufferGeometry(); const N = 900; const pos = new Float32Array(N * 3); const dSpeed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const r = Math.random() * 15, a = Math.random() * TAU; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 9 - 0.5; pos[i * 3 + 2] = Math.sin(a) * r; dSpeed[i] = 0.05 + Math.random() * 0.25; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.09, map: GLOW, color: T.accent, transparent: true, opacity: T.light ? 0.4 : 0.7, depthWrite: false, blending: additive() }));
  world.add(dust);

  /* ---------- Blips ---------- */
  const geoms = {
    MINOR_EXAM: new THREE.OctahedronGeometry(0.44),
    MAJOR_EXAM: new THREE.BoxGeometry(0.68, 0.68, 0.68),
    PRACTICAL_EXAM: new THREE.IcosahedronGeometry(0.4, 2),
    VIVA: new THREE.ConeGeometry(0.4, 0.72, 3),
    QUIZ: new THREE.TetrahedronGeometry(0.44),
    PRESENTATION: new THREE.TorusGeometry(0.3, 0.11, 14, 40),
    PROJECT_MILESTONE: new THREE.ConeGeometry(0.28, 0.62, 4),
    default: new THREE.CylinderGeometry(0.27, 0.27, 0.18, 32),
  };
  const edgeCache = new Map();
  const edgesOf = (g) => { if (!edgeCache.has(g)) edgeCache.set(g, new THREE.EdgesGeometry(g, 20)); return edgeCache.get(g); };
  const blips = [];
  const blipGroup = new THREE.Group(); world.add(blipGroup);
  const fxGroup = new THREE.Group(); world.add(fxGroup);
  const ndSubjectIdx = Object.fromEntries(subjects.map((s, i) => [s.id, i]));

  const perSector = {};
  items.forEach((it) => {
    const si = it.subject != null ? ndSubjectIdx[it.subject] : (it.kind === 'FEE_DUE' ? nSub - 1 : 0);
    const k = si ?? 0;
    perSector[k] = (perSector[k] || 0) + 1;
    it._sector = k; it._slot = perSector[k] - 1;
  });

  items.forEach((it) => {
    const color = new THREE.Color(it.color);
    const r = rOf(it.hoursLeft);
    const total = perSector[it._sector];
    const spread = (TAU / nSub) * 0.7;
    const offset = total > 1 ? (it._slot / (total - 1) - 0.5) * spread : 0;
    const jitter = (it._slot % 2 ? 0.08 : -0.08);
    const a = sectorAngle(it._sector) + offset + jitter;
    const height = 0.6 + (it.score / 160) * 4.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;

    const g = new THREE.Group(); g.position.set(x, 0, z);
    const geo = geoms[it.kind] || geoms.default;
    const mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.25, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2, transparent: true, opacity: it.tentative ? 0.28 : 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height;
    if (it.kind === 'PRESENTATION') mesh.rotation.x = Math.PI / 2;
    g.add(mesh);
    // Crisp edge outline (wire look for tentative, subtle outline for confirmed)
    const edges = new THREE.LineSegments(edgesOf(geo), new THREE.LineBasicMaterial({ color: it.tentative ? T.accent : 0xffffff, transparent: true, opacity: it.tentative ? 0.9 : 0.25 }));
    mesh.add(edges);
    // Glow sprite (bloom substitute)
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity: 0.5, depthWrite: false, blending: additive() }));
    spr.scale.setScalar(2.2); spr.position.y = height; g.add(spr);
    // Halo ring (billboard)
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: additive() }));
    halo.position.y = height; g.add(halo);
    // Stem
    const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, height - 0.32, 0)]),
      new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.6, dashSize: 0.12, gapSize: 0.08 }));
    stem.computeLineDistances(); g.add(stem);
    // Light column (flares on sweep)
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, height, 16, 1, true), new THREE.MeshBasicMaterial({ map: COLUMN, color, transparent: true, opacity: 0, depthWrite: false, blending: additive(), side: THREE.DoubleSide }));
    col.position.y = height / 2; g.add(col);
    // Ground marker + ripple
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.21, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    foot.rotation.x = -Math.PI / 2; foot.position.y = 0.02; g.add(foot);
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: additive() }));
    ripple.rotation.x = -Math.PI / 2; ripple.position.y = 0.025; g.add(ripple);
    // Hit area
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = height; hit.userData.item = it; g.add(hit);

    g.scale.setScalar(reducedMotion ? 1 : 0.001);
    blipGroup.add(g);
    blips.push({ g, mesh, spr, halo, col, ripple, rip: 1, hit, item: it, angle: ((a % TAU) + TAU) % TAU, baseY: height, flare: 0, hov: 0, delay: 1.0 + r * 0.08, critical: it.critical, spin: 0.4 + Math.random() * 0.5 });
  });

  /* ---------- Signal comets: NOW → most urgent upcoming items ---------- */
  const comets = [];
  blips.filter((b) => b.item.hoursLeft >= 0).sort((a, b) => b.item.score - a.item.score).slice(0, 5).forEach((b, i) => {
    const end = new THREE.Vector3(b.g.position.x, b.baseY, b.g.position.z);
    const mid = end.clone().multiplyScalar(0.5); mid.y = b.baseY + 2.2;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.3, 0), mid, end);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(48)), new THREE.LineBasicMaterial({ color: b.item.color, transparent: true, opacity: 0.0, depthWrite: false, blending: additive() }));
    fxGroup.add(line);
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: b.item.color, transparent: true, opacity: 0, depthWrite: false, blending: additive() }));
    head.scale.setScalar(0.9); fxGroup.add(head);
    comets.push({ curve, line, head, phase: i * 0.37, speed: 0.28 + i * 0.03 });
  });

  /* ---------- HTML labels for rings + sectors ---------- */
  const labelLayer = document.createElement('div'); labelLayer.className = 'radar-labels'; container.appendChild(labelLayer);
  const labels = [];
  RINGS.slice(1).forEach((ring) => {
    const el = document.createElement('div'); el.className = 'radar-label ring'; el.textContent = ring.label; labelLayer.appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(0.0, 0.02, rOf(ring.h)).applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 9) });
  });
  subjects.forEach((s, i) => {
    const a = sectorAngle(i), r = R_MAX + 1.9;
    const el = document.createElement('div'); el.className = 'radar-label'; el.innerHTML = `<span style="color:${s.color}">■</span> ${s.short}`; labelLayer.appendChild(el);
    labels.push({ el, pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), sector: i });
  });

  /* ---------- Camera: spring targets, inertia, parallax, fly-in ---------- */
  const HOME = { theta: -Math.PI / 2 + 0.35, phi: 0.95, dist: 26 };
  const cam = reducedMotion
    ? { theta: HOME.theta, phi: HOME.phi, dist: HOME.dist, tTheta: HOME.theta, tPhi: HOME.phi, tDist: HOME.dist }
    : { theta: HOME.theta - 2.4, phi: 0.12, dist: 62, tTheta: HOME.theta, tPhi: HOME.phi, tDist: HOME.dist };
  const look = { y: 0.8, ty: 0.8, x: 0, tx: 0, z: 0, tz: 0 };
  let dragging = false, lastX = 0, lastY = 0, velX = 0, velY = 0, autoSpin = !reducedMotion, idleTimer;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; velX = velY = 0; autoSpin = false; clearTimeout(idleTimer); canvas.setPointerCapture?.(e.pointerId); canvas.style.cursor = 'grabbing'; };
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    pointerPx.x = e.clientX - rect.left; pointerPx.y = e.clientY - rect.top; pointerInside = true;
    par.tx = pointer.x; par.ty = pointer.y;
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    velX = dx * 0.006; velY = dy * 0.004;
    cam.tTheta += velX; cam.tPhi = clamp(cam.tPhi - velY, 0.14, 1.45);
    lastX = e.clientX; lastY = e.clientY;
  };
  const onUp = () => { if (!dragging) return; dragging = false; canvas.style.cursor = hovered ? 'pointer' : 'grab'; idleTimer = setTimeout(() => { autoSpin = !reducedMotion; }, 4500); };
  const onLeave = () => { pointerInside = false; par.tx = par.ty = 0; setHover(null); };
  const onWheel = (e) => { e.preventDefault(); cam.tDist = clamp(cam.tDist + e.deltaY * 0.025, 12, 42); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.style.cursor = 'grab';

  /* ---------- Picking ---------- */
  const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(9, 9); const pointerPx = { x: 0, y: 0 };
  let pointerInside = false, hovered = null, downAt = 0, downX = 0, downY = 0;
  function setHover(b) {
    if (hovered === b) return;
    hovered = b; if (!dragging) canvas.style.cursor = b ? 'pointer' : 'grab';
    if (onHover) onHover(b ? b.item : null, b ? projected(b) : null);
  }
  const pv = new THREE.Vector3();
  function projected(b) {
    b.mesh.getWorldPosition(pv); pv.project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: (pv.x * 0.5 + 0.5) * rect.width, y: (-pv.y * 0.5 + 0.5) * rect.height };
  }
  canvas.addEventListener('pointerdown', (e) => { downAt = performance.now(); downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('click', (e) => {
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (hovered && performance.now() - downAt < 350 && moved < 6) { hovered.flare = 1; hovered.rip = 0; if (onSelect) onSelect(hovered.item); }
  });
  canvas.addEventListener('touchend', () => { setTimeout(() => setHover(null), 1800); });

  /* ---------- Resize ---------- */
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    camera.fov = w < 520 ? 54 : w < 900 ? 44 : 38; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  /* ---------- Loop ---------- */
  const clock = new THREE.Clock(); let raf, sweepAngle = 0, running = true;
  const v3 = new THREE.Vector3();
  function frame() {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;

    // Camera springs + inertia
    if (!dragging && !reducedMotion) { cam.tTheta += velX; cam.tPhi = clamp(cam.tPhi - velY, 0.14, 1.45); velX *= Math.pow(0.05, dt); velY *= Math.pow(0.05, dt); }
    if (autoSpin) cam.tTheta += dt * 0.045;
    const intro = t < 2.6 && !reducedMotion; // slower lambda during fly-in → cinematic
    const L = intro ? 1.7 : 5;
    cam.theta = damp(cam.theta, cam.tTheta, L, dt); cam.phi = damp(cam.phi, cam.tPhi, L, dt); cam.dist = damp(cam.dist, cam.tDist, intro ? 1.5 : 4, dt);
    par.x = damp(par.x, par.tx, 3, dt); par.y = damp(par.y, par.ty, 3, dt);
    look.x = damp(look.x, look.tx, 3, dt); look.z = damp(look.z, look.tz, 3, dt); look.y = damp(look.y, look.ty, 3, dt);
    const th = cam.theta + (reducedMotion ? 0 : par.x * 0.06), ph = clamp(cam.phi - (reducedMotion ? 0 : par.y * 0.04), 0.1, 1.5);
    camera.position.set(look.x + Math.cos(th) * Math.sin(ph) * cam.dist, Math.cos(ph) * cam.dist, look.z + Math.sin(th) * Math.sin(ph) * cam.dist);
    camera.lookAt(look.x, look.y, look.z);

    // Rings draw-in
    ringObjs.forEach((r) => { if (r.o.scale.x < 1) { const k = clamp((t - r.delay) / 1.1, 0, 1); r.o.scale.setScalar(Math.max(0.001, easeOutExpo(k))); } });

    // Sweep rotation
    if (!reducedMotion) sweepAngle = (sweepAngle + dt * 1.05) % TAU;
    sweep.rotation.z = sweepAngle;
    const beamWorld = ((-sweepAngle) % TAU + TAU) % TAU;
    bezel.rotation.y = reducedMotion ? 0 : -t * 0.02;
    innerDash.rotation.y = reducedMotion ? 0 : t * 0.25;

    // Core pulse rings + beam
    pulseRings.forEach((p) => { const k = reducedMotion ? 0.5 : (t * 0.45 + p.o) % 1; p.r.scale.setScalar(1 + k * 2.2); p.r.material.opacity = 0.65 * (1 - k); });
    coreGlow.material.opacity = 0.7 + Math.sin(t * 2) * 0.15;
    coreBeam.material.opacity = (T.light ? 0.2 : 0.45) + Math.sin(t * 1.3) * 0.08;

    // Sector wedge emphasis
    const hovSector = hovered ? hovered.item._sector : -1;
    wedges.forEach((w, i) => { const target = (i === hovSector ? w.base * 4 : w.base) * (ringObjs[0].o.scale.x); w.cur = damp(w.cur, target, 6, dt); w.mesh.material.opacity = w.cur; });

    blips.forEach((b) => {
      // Intro rise with overshoot
      if (!reducedMotion && b.g.scale.x < 0.999) {
        const k = clamp((t - b.delay) / 0.9, 0, 1);
        b.g.scale.setScalar(Math.max(0.001, k === 0 ? 0.001 : easeOutBack(k)));
        if (k >= 1) b.g.scale.setScalar(1);
      }
      // Sweep flare + ripple trigger
      let diff = Math.abs(beamWorld - b.angle); diff = Math.min(diff, TAU - diff);
      if (diff < 0.05 && b.flare < 0.5) { b.flare = 1; b.rip = 0; }
      b.flare *= Math.pow(0.12, dt);
      const isHover = hovered === b;
      b.hov = damp(b.hov, isHover ? 1 : 0, 10, dt);

      b.mesh.rotation.y += dt * (b.spin + b.hov * 2.6);
      if (b.item.kind !== 'PRESENTATION') b.mesh.rotation.x = Math.sin(t * 0.7 + b.angle) * 0.25;
      const bob = reducedMotion ? 0 : Math.sin(t * 1.3 + b.angle * 3) * 0.1;
      b.mesh.position.y = b.baseY + bob + b.hov * 0.45;
      const crit = b.critical ? (Math.sin(t * 5) * 0.5 + 0.5) : 0;
      b.mesh.material.emissiveIntensity = 0.45 + b.flare * 1.4 + b.hov * 0.8 + crit * 0.9;
      const s = 1 + b.flare * 0.22 + b.hov * 0.35;
      b.mesh.scale.setScalar(b.item.kind === 'MAJOR_EXAM' ? s * 1.1 : s);
      b.spr.position.y = b.mesh.position.y;
      b.spr.material.opacity = (T.light ? 0.25 : 0.45) + b.flare * 0.5 + b.hov * 0.4 + crit * 0.4;
      b.spr.scale.setScalar(2.1 + b.flare * 1.2 + b.hov * 1.2);
      b.halo.position.y = b.mesh.position.y;
      b.halo.lookAt(camera.position);
      b.halo.material.opacity = Math.max(b.flare * 0.8, b.hov * 0.95, b.critical ? 0.35 + Math.sin(t * 5) * 0.25 : 0);
      b.halo.scale.setScalar(1 + (1 - b.flare) * 0.5 + b.hov * 0.15);
      b.col.material.opacity = b.flare * (T.light ? 0.3 : 0.55) + b.hov * 0.35;
      // Floor ripple
      if (b.rip < 1) { b.rip = Math.min(1, b.rip + dt * 0.9); b.ripple.scale.setScalar(1 + easeOutExpo(b.rip) * 7); b.ripple.material.opacity = (1 - b.rip) * 0.8; }
      else b.ripple.material.opacity = 0;
    });

    // Comets
    const introDone = clamp((t - 2.2) / 1.2, 0, 1);
    comets.forEach((c) => {
      const k = ((t * c.speed + c.phase) % 1);
      c.curve.getPoint(easeOutExpo(k * 0.98), c.head.position);
      c.head.material.opacity = (reducedMotion ? 0 : Math.sin(k * Math.PI) * 0.95) * introDone;
      c.line.material.opacity = (T.light ? 0.18 : 0.22) * introDone;
    });

    // Dust drift
    if (!reducedMotion) {
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < N; i++) { arr[i * 3 + 1] += dSpeed[i] * dt; if (arr[i * 3 + 1] > 8.5) arr[i * 3 + 1] = -0.5; }
      dustGeo.attributes.position.needsUpdate = true;
      dust.rotation.y += dt * 0.02; stars.rotation.y -= dt * 0.004;
    }

    // Hover pick
    if (pointerInside && !dragging) {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(blips.map((b) => b.hit), false)[0];
      setHover(hit ? blips.find((b) => b.hit === hit.object) : null);
      if (hovered && onHover) onHover(hovered.item, projected(hovered));
    }

    // Labels
    const rect = { w: container.clientWidth, h: container.clientHeight };
    const lab = ringObjs[0].o.scale.x;
    labels.forEach((l) => {
      v3.copy(l.pos); world.localToWorld(v3); v3.project(camera);
      l.el.style.transform = `translate3d(${(v3.x * 0.5 + 0.5) * rect.w}px, ${(-v3.y * 0.5 + 0.5) * rect.h}px, 0) translate(-50%, -50%)${l.sector === hovSector ? ' scale(1.15)' : ''}`;
      l.el.style.opacity = v3.z < 1 ? lab : 0;
    });

    renderer.render(scene, camera);
  }
  frame();

  // Pause when off-screen
  const io = new IntersectionObserver(([e]) => { const vis = e.isIntersecting; if (vis && !running) { running = true; clock.getDelta(); frame(); } else if (!vis) { running = false; cancelAnimationFrame(raf); } });
  io.observe(container);

  return {
    setMode(mode) {
      autoSpin = mode === 'orbit' && !reducedMotion;
      look.tx = 0; look.tz = 0; look.ty = 0.8;
      if (mode === 'top') { cam.tPhi = 0.16; cam.tDist = 27; }
      else if (mode === 'side') { cam.tPhi = 1.32; cam.tDist = 24; }
      else { cam.tPhi = HOME.phi; cam.tDist = HOME.dist; }
    },
    focus(id) {
      const b = blips.find((x) => x.item.id === id); if (!b) return;
      clearTimeout(idleTimer);
      // shortest rotation to the item's bearing
      const target = Math.atan2(b.g.position.z, b.g.position.x);
      let d = ((target - cam.tTheta) % TAU + TAU + Math.PI) % TAU - Math.PI;
      cam.tTheta += d; cam.tDist = 15; cam.tPhi = 0.85; autoSpin = false; b.flare = 1; b.rip = 0;
      look.tx = b.g.position.x * 0.45; look.tz = b.g.position.z * 0.45; look.ty = b.baseY * 0.5;
      idleTimer = setTimeout(() => { autoSpin = !reducedMotion; cam.tDist = HOME.dist; cam.tPhi = HOME.phi; look.tx = look.tz = 0; look.ty = 0.8; }, 6000);
    },
    retheme() {
      T = theme();
      [lineMat, faintMat].forEach((m) => m.color.copy(T.grid)); accentLineMat.color.copy(T.accent); coreMat.color.copy(T.accent);
      pulseRings.forEach((p) => p.r.material.color.copy(T.accent)); dust.material.color.copy(T.accent); glow.color.copy(T.accent);
      innerDash.material.color.copy(T.accent); coreGlow.material.color.copy(T.accent); beamMat.color.copy(T.accent);
      stars.material.opacity = T.light ? 0 : 0.55;
      const blend = additive();
      [sweep.material, dust.material, coreGlow.material, beamMat, ...blips.flatMap((b) => [b.spr.material, b.halo.material, b.col.material, b.ripple.material]), ...comets.flatMap((c) => [c.head.material, c.line.material])]
        .forEach((m) => { m.blending = blend; m.needsUpdate = true; });
      wedges.forEach((w) => { w.base = T.light ? 0.06 : 0.04; });
      paintSweep(); sweepTex.needsUpdate = true;
    },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); clearTimeout(idleTimer);
      window.removeEventListener('pointerup', onUp);
      scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.(); } });
      GLOW.dispose(); COLUMN.dispose(); sweepTex.dispose();
      renderer.dispose(); renderer.forceContextLoss?.();
      labelLayer.remove(); canvas.remove();
    },
  };
}
