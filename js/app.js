/* =========================================================================
   UniDash — front-end prototype controller
   Hash routes: #radar #exams #deadlines #calendar #projects #attendance #files
   All data is FAKE demo data from js/data.js.
   ========================================================================= */
import * as DATA from './data.js';
import { createRadar } from './radar3d.js';
import * as FX from './fx.js';

const { subjects, kinds, attendance, presentationSteps, timetable, user, at, now } = DATA;
let projects = [];
// Keep the local preview inside the agreed v1 boundary. WhatsApp remains a v2 idea.
let events = DATA.events.filter((event) => event.source !== 'WHATSAPP');
let hiddenEvents = [];
let hiddenEventsMode = 'idle';
let showHiddenEvents = false;
let eventDataMode = 'loading';
let integrationDataMode = 'loading';
let integrationStatuses = {};
let integrationPromptDismissed = false;
let csrfToken = null;
let portalBridgeState = 'checking';
let portalScanResult = null;
let portalScanProgress = '';
const portalAwaitingLogin = new Map();
let portalBridgeRequestId = 0;
const portalBridgePending = new Map();
let pendingManualEventRequest = null;
let manualEventSaving = false;
let manualEventEditingId = null;
const feed = DATA.feed.filter((item) => item.source !== 'WHATSAPP');
const files = DATA.files.filter((file) => file.source !== 'WHATSAPP');
const integrations = DATA.integrations.filter((item) => item.kind !== 'WHATSAPP');

// The optional Edge/Chrome extension is paired to this exact dashboard origin.
// Portal data stays in extension storage; this page only receives the local report.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || !['response', 'event'].includes(message.unidash)) return;
  if (message.unidash === 'response') {
    const pending = portalBridgePending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    portalBridgePending.delete(message.id);
    pending.resolve(message);
    return;
  }
  if (message.type === 'BRIDGE_READY') {
    portalBridgeState = 'connected';
    updatePortalBridgeUI();
  } else if (message.type === 'SCAN_PROGRESS') {
    const stages = { opening: 'Opening portal…', awaiting_login: 'Sign in to the portal in the opened tab…', preparing: 'Opening the next portal page…', extracting: message.hint || 'Reading portal records…', done: 'Portal scan complete.', error: 'Portal scan failed.' };
    portalScanProgress = `${message.label || message.portal}: ${stages[message.stage] || message.stage}${message.error ? ` ${message.error}` : ''}`;
    if (message.stage === 'awaiting_login') portalAwaitingLogin.set(message.portal, message.label || message.portal);
    if (['extracting', 'done', 'error'].includes(message.stage)) portalAwaitingLogin.delete(message.portal);
    updatePortalBridgeUI();
  } else if (message.type === 'SCAN_RESULT') {
    portalScanResult = message.result;
    portalScanProgress = '';
    portalAwaitingLogin.clear();
    updatePortalBridgeUI();
    void importTrustedAmsScan(message.result);
  }
});

async function importTrustedAmsScan(scanResult) {
  const report = (scanResult?.reports || []).find((item) => item.source === 'ams');
  if (!report?.trusted) return;
  if (!csrfToken) await refreshPersistedEvents();
  if (!csrfToken) return;
  const records = [];
  for (const record of report.records || []) {
    const fields = record.fields || {};
    if (!['quiz', 'calendar_event'].includes(record.type)) continue;
    const startsAt = fields['Starts at (IST)'];
    const endsAt = fields['Ends at (IST)'] || null;
    if (!record.key || !startsAt || Number.isNaN(Date.parse(startsAt))) continue;
    if (endsAt && (Number.isNaN(Date.parse(endsAt)) || endsAt < startsAt)) continue;
    if (endsAt && Date.parse(endsAt) < Date.now()) continue;
    const isQuiz = record.type === 'quiz';
    const detailLines = isQuiz
      ? [fields.Course && `Course: ${fields.Course}`, fields.Deadline && `Deadline: ${fields.Deadline}`, fields.Duration && `Duration: ${fields.Duration}`, fields.Questions && `Questions: ${fields.Questions}`, fields.Marks && `Marks: ${fields.Marks}`].filter(Boolean)
      : [fields.Status && `AMS status: ${fields.Status}`, fields.Start && fields.End && `Scheduled: ${fields.Start} – ${fields.End}`].filter(Boolean);
    const courseCode = isQuiz ? String(fields.Course || '').match(/^\s*(\d{6,})\b/) : null;
    records.push({
      sourceRef: record.key,
      title: String(record.title || '').trim(),
      description: detailLines.join('\n') || null,
      kind: isQuiz ? 'QUIZ' : 'OTHER',
      subjectCode: courseCode ? courseCode[1] : null,
      startsAt,
      endsAt,
      isDeadline: isQuiz,
      isAllDay: !isQuiz,
    });
  }
  if (!records.length) return;
  try {
    const response = await fetch('/api/v1/integrations/ams/import', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ source: 'AMS', trusted: true, records }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || 'AMS calendar import failed.');
    const changed = Number(payload?.created || 0) + Number(payload?.updated || 0);
    await refreshPersistedEvents();
    toast(changed ? `Added or updated ${changed} AMS item${changed === 1 ? '' : 's'} in Calendar and Deadlines.` : 'AMS Calendar and Deadlines are up to date.');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not import the AMS calendar scan.');
  }
}

function portalBridgeRequest(type, extra = {}, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const id = `web_${Date.now()}_${++portalBridgeRequestId}`;
    const timer = setTimeout(() => { portalBridgePending.delete(id); resolve({ ok: false, error: 'UniDash Portal Bridge is not paired with this site yet.' }); }, timeoutMs);
    portalBridgePending.set(id, { resolve, timer });
    window.postMessage({ unidash: 'request', id, type, ...extra }, location.origin);
  });
}

function portalReportMarkup(result) {
  if (!result) return '<p class="muted">No browser scan report yet. Your first scan creates a baseline; the next scan compares it for changes.</p>';
  const reports = (result.reports || []).map((report) => {
    const warnings = (report.warnings || []).map((warning) => `<li>${esc(warning)}</li>`).join('');
    const changes = [
      ...report.added.map((record) => `<li><b>Added:</b> ${esc(record.title)} <span class="muted">${esc(record.section || '')}</span></li>`),
      ...report.modified.map((item) => `<li><b>Changed:</b> ${esc(item.record.title)} — ${item.changes.map((change) => `${esc(change.field)}: ${esc(change.before)} → ${esc(change.after)}`).join('; ')}</li>`),
      ...report.removed.map((record) => `<li><b>Removed:</b> ${esc(record.title)} <span class="muted">${esc(record.section || '')}</span></li>`),
    ].slice(0, 40);
    const sections = Object.entries(report.sections || {}).map(([name, section]) => `${esc(name)}: ${section.ok ? `${section.count} rows` : section.skipped ? 'skipped' : `not read (${esc(section.error || 'unknown error')})`}`).join(' · ');
    const scanned = (report.records || []).slice(0, 80).map((record) => {
      const fields = Object.entries(record.fields || {}).filter(([, value]) => value !== '').map(([name, value]) => `${esc(name)}: ${esc(value)}`).join(' · ');
      return `<li><b>${esc(record.title)}</b> <span class="muted">${esc(record.section || '')}</span>${fields ? `<br><span class="muted">${fields}</span>` : ''}</li>`;
    }).join('');
    const counts = report.baseline ? 'Baseline scan — no prior scan to compare.' : `+${report.added.length} new · ${report.modified.length} changed · −${report.removed.length} removed · ${report.unchangedCount} unchanged`;
    return `<article class="panel panel-pad" style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><b>${esc(report.label || report.source)}</b><span class="chip">${report.trusted ? 'TRUSTED SCAN' : 'REVIEW NEEDED'}</span></div><p class="muted" style="margin:8px 0">${counts} · ${report.recordCount} records</p>${sections ? `<p class="muted">${sections}</p>` : ''}${warnings ? `<div class="panel panel-pad" style="margin-top:8px;color:var(--accent)"><b>Review before trusting</b><ul>${warnings}</ul><button class="btn sm" data-bridge-accept="${esc(report.source)}" type="button">Accept this scan as baseline</button></div>` : ''}${changes.length ? `<details style="margin-top:8px"><summary>Show changes (${report.added.length + report.modified.length + report.removed.length})</summary><ul>${changes.join('')}</ul>${(report.added.length + report.modified.length + report.removed.length) > 40 ? '<p class="muted">Showing first 40 changes.</p>' : ''}</details>` : ''}${scanned ? `<details style="margin-top:8px"><summary>View scanned AMS information (${report.records.length})</summary><ul>${scanned}</ul>${report.records.length > 80 ? '<p class="muted">Showing first 80 records.</p>' : ''}</details>` : ''}</article>`;
  }).join('');
  const errors = (result.errors || []).map((entry) => `<li><b>${esc(entry.label || entry.portal)}:</b> ${esc(entry.error)}</li>`).join('');
  return `<p class="muted">Last scan: ${esc(new Date(result.finishedAt).toLocaleString())} · Browser-local report; records are not uploaded to UniDash.</p>${reports || '<p class="muted">No portal produced a report.</p>'}${errors ? `<article class="panel panel-pad" style="margin-top:10px;color:var(--accent)"><b>Scan issues</b><ul>${errors}</ul></article>` : ''}`;
}

function updatePortalBridgeUI() {
  const status = $('[data-bridge-status]');
  if (!status) return;
  status.textContent = portalScanProgress || (portalBridgeState === 'connected' ? 'Extension connected' : portalBridgeState === 'checking' ? 'Checking extension…' : 'Extension not connected');
  status.dataset.state = portalScanProgress ? 'working' : portalBridgeState;
  const report = $('[data-bridge-report]');
  if (report) report.innerHTML = portalReportMarkup(portalScanResult);
  const progress = $('[data-bridge-progress]');
  if (progress) progress.innerHTML = `${portalScanProgress ? `<p class="muted" role="status">${esc(portalScanProgress)}</p>` : ''}${[...portalAwaitingLogin].map(([portal, label]) => `<button class="btn sm" type="button" data-bridge-ready="${esc(portal)}">I’m signed in to ${esc(label)}</button>`).join(' ')}`;
  const scan = $('[data-bridge-scan]');
  if (scan) scan.disabled = portalBridgeState !== 'connected' || !!portalScanProgress;
  $$('[data-bridge-accept]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const response = await portalBridgeRequest('ACCEPT_PENDING', { portal: button.dataset.bridgeAccept });
    toast(response.ok ? 'Scan accepted as the new comparison baseline.' : (response.error || 'Could not accept scan.'));
    if (response.ok) {
      const refreshed = await portalBridgeRequest('GET_LAST');
      if (refreshed.ok) portalScanResult = refreshed.lastResult;
      updatePortalBridgeUI();
    } else button.disabled = false;
  }));
  $$('[data-bridge-ready]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    const response = await portalBridgeRequest('FORCE_READY', { portal: button.dataset.bridgeReady });
    if (!response.ok) { button.disabled = false; toast(response.error || 'Could not continue scan.'); }
  }));
}

async function checkPortalBridge() {
  const response = await portalBridgeRequest('PING');
  portalBridgeState = response.ok ? 'connected' : 'missing';
  updatePortalBridgeUI();
  if (response.ok) {
    const last = await portalBridgeRequest('GET_LAST');
    if (last.ok) { portalScanResult = last.lastResult; updatePortalBridgeUI(); }
  }
}

async function startPortalScan() {
  if (portalBridgeState !== 'connected') return;
  portalScanProgress = 'Starting your scan…';
  updatePortalBridgeUI();
  const response = await portalBridgeRequest('SCAN_START', {}, 5000);
  if (!response.ok) { portalScanProgress = ''; toast(response.error || 'Could not start the scan.'); updatePortalBridgeUI(); return; }
  portalScanProgress = 'Scan started. Complete sign-in in the portal tabs that open.';
  updatePortalBridgeUI();
}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ic = (n) => `<i data-lucide="${n}"></i>`;
const subj = (id) => {
  if (!id) return undefined;
  const known = subjects.find((s) => s.id === id);
  if (known) return known;
  const label = String(id).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return { id, code: label, name: label, short: label, color: 'var(--muted)', faculty: '' };
};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const H = 3600e3, D = 24 * H;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- IST formatting (SPEC §1.4: store UTC, display Asia/Kolkata) ---------- */
const fmtCache = {};
const fmt = (d, o) => { const k = JSON.stringify(o); return (fmtCache[k] ||= new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o })).format(d); };
const fTime = (d) => fmt(d, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '\u202f').toUpperCase();
const fDay = (d) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const fDayTime = (d) => `${fDay(d)} · ${fTime(d)}`;
const dayIdx = (d) => Math.floor((d.getTime() - at(0).getTime()) / D);
const hoursLeft = (d) => (d.getTime() - now().getTime()) / H;

function rel(d) {
  const h = hoursLeft(d);
  if (h < 0) { const a = -h; return a < 24 ? `${Math.round(a)}h overdue` : `${Math.round(a / 24)}d overdue`; }
  if (h < 1) return `in ${Math.max(1, Math.round(h * 60))}m`;
  if (h < 36) return `in ${Math.round(h)}h`;
  return `in ${Math.round(h / 24)} days`;
}
function countdown(d) {
  const h = hoursLeft(d);
  if (h < 0) return { n: Math.round(-h) + 'h', u: 'OVERDUE' };
  if (h < 1) return { n: Math.round(h * 60) + 'm', u: 'LEFT' };
  if (h < 48) return { n: Math.floor(h) + 'h' + String(Math.floor((h % 1) * 60)).padStart(2, '0'), u: 'LEFT' };
  return { n: Math.ceil(h / 24), u: 'DAYS' };
}

/* ---------- User-owned state (progress, dismissed proposals) ---------- */
function readDemoStore() {
  try {
    const value = JSON.parse(window.localStorage.getItem('unidash-demo') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const store = readDemoStore();
for (const key of ['progress', 'proposals', 'tracked', 'tasks', 'filed']) {
  if (!store[key] || typeof store[key] !== 'object' || Array.isArray(store[key])) store[key] = {};
}
const save = () => {
  try { window.localStorage.setItem('unidash-demo', JSON.stringify(store)); return true; }
  catch { return false; }
};
const progressOf = (e) => e.persisted ? e.progress : store.progress[e.id] || e.progress || 'NOT_STARTED';

/* ---------- Priority score (SPEC §10.3) ---------- */
function score(e) {
  const base = kinds[e.kind]?.base ?? 5;
  const h = hoursLeft(e.start);
  const done = progressOf(e) === 'DONE';
  const urgency = h < 0 && !done ? 120 : 100 * Math.exp(-Math.max(h, 0) / 72);
  return Math.round(base + urgency + Math.min(e.weight || 0, 30));
}
const isExam = (e) => ['MINOR_EXAM', 'MAJOR_EXAM', 'PRACTICAL_EXAM', 'VIVA'].includes(e.kind);
const isDeadline = (e) => typeof e.isDeadline === 'boolean' ? e.isDeadline : !['CLASS', 'LAB_SESSION', 'HOLIDAY'].includes(e.kind) && !isExam(e);

/* ---------- Attendance maths (SPEC §10.8) ---------- */
const EPS = 1e-9;
const canSkip = (a, t, r) => Math.max(0, Math.floor(a / r - t + EPS));
const mustAttend = (a, t, r) => Math.max(0, Math.ceil((r * t - a) / (1 - r) - EPS));
function attStatus(pct, thr) {
  if (pct < thr) return { k: 'Short', c: 'var(--danger)', i: 'octagon-alert' };
  if (pct < thr + 2.5) return { k: 'At risk', c: 'var(--warning)', i: 'triangle-alert' };
  if (pct < thr + 6) return { k: 'Watch', c: 'var(--cyan)', i: 'eye' };
  return { k: 'Safe', c: 'var(--success)', i: 'shield-check' };
}

/* ---------- Needs-attention rules (SPEC §10.1) ---------- */
function attention() {
  const out = [];
  events.forEach((e) => {
    const h = hoursLeft(e.start), done = progressOf(e) === 'DONE';
    if (isDeadline(e) && h < 0 && !done) out.push({ rank: 0, e, why: 'Overdue', critical: true });
    else if (isDeadline(e) && h >= 0 && h < 24 && !done) out.push({ rank: 1, e, why: 'Due within 24 h' });
    else if (isExam(e) && h >= 0 && h < 72) out.push({ rank: 2, e, why: 'Exam within 72 h' });
  });
  const moved = events.find((e) => e.movedFrom && hoursLeft(e.start) > 0);
  if (moved) out.push({ rank: 3, e: moved, why: `Moved from ${fDayTime(moved.movedFrom)}`, moved: true });
  attendance.forEach((a) => {
    const pct = (a.a / a.t) * 100;
    if (pct < user.threshold + 2.5) out.push({ rank: 4, att: a, why: pct < user.threshold ? 'Below minimum' : 'Close to minimum', critical: pct < user.threshold });
  });
  return out.sort((a, b) => a.rank - b.rank || (a.e && b.e ? a.e.start - b.e.start : 0));
}

/* ---------- Crunch detection (SPEC §10.1) ---------- */
function crunch() {
  const hot = events.filter((e) => hoursLeft(e.start) > 0 && (isExam(e) || e.kind === 'QUIZ' || e.kind === 'PRESENTATION' || (e.kind === 'ASSIGNMENT' && (e.weight || 0) >= 10))).sort((a, b) => a.start - b.start);
  for (let i = 0; i < hot.length; i++) {
    const win = hot.filter((x) => x.start - hot[i].start >= 0 && x.start - hot[i].start <= 72 * H);
    if (win.length >= 3 && win.some(isExam)) return win;
  }
  return null;
}

/* ======================= SHELL ======================= */
const NAV = [
  { id: 'radar', label: 'Radar', icon: 'radar' },
  { id: 'exams', label: 'Exam Hub', icon: 'clipboard-list' },
  { id: 'deadlines', label: 'Deadlines', icon: 'list-checks', dot: true },
  { id: 'calendar', label: 'Calendar', icon: 'calendar-range' },
  { id: 'projects', label: 'Projects', icon: 'presentation' },
  { id: 'attendance', label: 'Attendance', icon: 'gauge', dot: true },
  { id: 'files', label: 'Files', icon: 'folder-tree' },
];
const TABS = ['radar', 'exams', 'calendar', 'files'];

function buildShell() {
  $('#rail-nav').innerHTML = NAV.map((n) => `<a class="rail-link" href="#${n.id}" data-view="${n.id}" aria-label="${n.label}">${ic(n.icon)}<span>${n.label}</span>${n.dot ? '<b class="dot"></b>' : ''}</a>`).join('')
    + `<a class="rail-link integration-rail-link" href="#more" data-view="more" aria-label="Integrations">${ic('plug-zap')}<span>Integrations</span></a>`;
  $('#tab-bar').innerHTML = TABS.map((id) => { const n = NAV.find((x) => x.id === id); return `<a class="tab-link" href="#${id}" data-view="${id}">${ic(n.icon)}<span>${n.label}</span>${n.dot ? '<b class="dot"></b>' : ''}</a>`; }).join('')
    + `<a class="tab-link" href="#more" data-view="more">${ic('layout-grid')}<span>More</span><b class="dot"></b></a>`;
  $('#sync-chips').innerHTML = integrations.map((i) => `<button class="sync-chip" type="button" data-sync="${i.kind}" data-status="LOADING" title="Loading your connection status"><i></i>${i.kind === 'MOODLE' ? 'Moodle' : 'AMS'} <b>…</b></button>`).join('');
  tickClock(); setInterval(tickClock, 1000);
}
function tickClock() {
  const n = now();
  $('#clock-date').textContent = fmt(n, { weekday: 'short', day: 'numeric', month: 'short' });
  $('#clock-time').textContent = fmt(n, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).toUpperCase() + ' IST';
  $$('[data-ago]').forEach((el) => { const m = Math.max(0, Math.round((n - +el.dataset.ago) / 6e4)); el.textContent = m < 1 ? 'now' : m + 'm'; });
  $$('[data-countdown]').forEach((el) => { el.textContent = rel(new Date(+el.dataset.countdown)); });
}

/* ======================= VIEW: RADAR ======================= */
let radar = null;
function viewRadar() {
  const att = attention();
  const cr = crunch();
  const todayEvents = buildDay(0);
  const nextExam = events.filter((e) => isExam(e) && hoursLeft(e.start) > 0).sort((a, b) => a.start - b.start)[0];
  const dueToday = events.filter((e) => isDeadline(e) && dayIdx(e.start) === 0 && progressOf(e) !== 'DONE').length;
  const risk = attendance.filter((a) => (a.a / a.t) * 100 < user.threshold + 2.5).length;
  const hr = +fmt(now(), { hour: 'numeric', hour12: false });
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const newSince = feed.filter((f) => f.time > user.lastVisit);

  return `
  <section class="view" id="radar-view">
    ${cr ? `<div class="crunch-banner" role="alert">${ic('triangle-alert')}<div><b>Crunch window ahead · ${fDay(cr[0].start)} → ${fDay(cr[cr.length - 1].start)}</b><p>${cr.length} exams in 72 hours (${cr.map((e) => subj(e.subject)?.short).join(', ')}). Start with <strong>${subj(cr[0].subject)?.short}</strong> — your prep checklist is ${Math.round(((cr[0].prep || []).filter(Boolean).length / ((cr[0].prep || [1]).length)) * 100)}% done.</p></div><button class="btn sm" data-go="exams" style="margin-left:auto">Open Exam Hub</button></div>` : ''}
    <div class="radar-layout">
      <div class="panel corner radar-stage" id="radar-stage">
        <div class="radar-vignette"></div><div class="radar-scan-line"></div>
        <div class="radar-hud tl"><div class="hud-title">Academic <em>Radar</em></div><span class="hud-sub">centre = now · distance = time left<br>height = priority · sector = subject</span></div>
        <div class="radar-hud tr ring-legend"><span>24 h — act today</span><span>72 h — plan</span><span>7 d — watch</span><span>60 d — horizon</span></div>
        <div class="radar-hud bl"><div class="legend-row">
          <span><i style="background:${kinds.MINOR_EXAM.color};transform:rotate(45deg)"></i>Minor</span>
          <span><i style="background:${kinds.MAJOR_EXAM.color}"></i>Major</span>
          <span><i style="background:${kinds.QUIZ.color};clip-path:polygon(50% 0,100% 100%,0 100%)"></i>Quiz</span>
          <span><i style="background:${kinds.ASSIGNMENT.color};border-radius:50%"></i>Assignment</span>
          <span><i style="border:2px solid ${kinds.PRESENTATION.color};border-radius:50%;background:none"></i>Presentation</span>
          <span><i style="border:1px dashed var(--warning);background:none"></i>Tentative</span>
        </div></div>
        <div class="radar-hud br"><div class="radar-mode" role="group" aria-label="Camera">
          <button type="button" data-mode="orbit" class="on">ORBIT</button><button type="button" data-mode="top">TOP</button><button type="button" data-mode="side">SIDE</button>
        </div></div>
        <div class="radar-tooltip" id="radar-tip"></div>
      </div>

      <div class="radar-side">
        <div class="panel corner greeting">
          <div class="eyebrow">${fmt(now(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h2>${greet}, ${user.name}. <em>${att.filter((a) => a.rank <= 2).length} things</em> need you today.</h2>
          <div style="color:var(--muted);font-size:13px">${newSince.length} changes since last night · next exam <b style="color:var(--text)">${nextExam ? subj(nextExam.subject).short + ' ' + rel(nextExam.start) : '—'}</b></div>
          <div class="summary-stats">
            <div class="amber"><b class="tabular">${dueToday}</b><span>due today</span></div>
            <div><b class="tabular">${events.filter((e) => isExam(e) && hoursLeft(e.start) > 0 && hoursLeft(e.start) < 24 * 21).length}</b><span>exams · 3 wks</span></div>
            <div class="${risk ? 'warn' : ''}"><b class="tabular">${risk}</b><span>attendance risk</span></div>
          </div>
        </div>
        <div class="panel corner">
          <div class="panel-head"><h3>${ic('siren')} Needs attention <span class="n">${att.length}</span></h3><a href="#deadlines">see all →</a></div>
          <ul class="attention-list">${att.slice(0, 5).map(attentionRow).join('')}</ul>
        </div>
      </div>
    </div>

    <div class="below-grid">
      <div class="panel corner">
        <div class="panel-head"><h3>${ic('clock-3')} Next up · today</h3><a href="#calendar">calendar →</a></div>
        <ul class="next-up-list">${todayEvents.map((e) => {
          const past = e.end ? e.end < now() : e.start < now();
          const isNow = e.start <= now() && e.end && e.end > now();
          const c = subj(e.subject)?.color || kinds[e.kind].color;
          return `<li class="next-up-item ${past ? 'past' : ''} ${isNow ? 'now' : ''}" style="--c:${c}" data-event="${e.id || ''}"><time>${fTime(e.start)}</time><div><div class="t">${esc(e.title)}</div><div class="m">${kinds[e.kind].label} · ${e.venue ? esc(e.venue) : 'Online'}${isNow ? ' · <b style="color:var(--accent)">happening now</b>' : ''}</div></div></li>`;
        }).join('')}</ul>
      </div>
      <div class="panel corner">
        <div class="panel-head"><h3>${ic('calendar-days')} This week</h3><span class="mono" style="font-size:11px;color:var(--muted)">LOAD</span></div>
        ${weekStrip()}
      </div>
      <div class="panel corner">
        <div class="panel-head"><h3>${ic('history')} Since your last visit <span class="n">${newSince.length}</span></h3><button class="link" type="button" id="mark-read">mark read</button></div>
        <ul class="feed-list">${feed.slice(0, 4).map(feedCard).join('')}</ul>
      </div>
    </div>
  </section>`;
}

function attentionRow(a) {
  if (a.att) {
    const s = subj(a.att.subject), pct = ((a.att.a / a.att.t) * 100).toFixed(1);
    return `<li class="attention-item ${a.critical ? 'critical' : ''}" data-go="attendance" tabindex="0"><span class="stripe" style="background:${s.color}"></span><span class="kind-badge" style="color:var(--warning)">${ic('gauge')}</span><div class="body"><div class="title">${s.short} attendance ${pct}%</div><div class="meta"><span class="chip src-AMS">AMS</span>${a.why} · limit ${user.threshold}%</div></div><div class="countdown"><b>${mustAttend(a.att.a, a.att.t, user.threshold / 100) || canSkip(a.att.a, a.att.t, user.threshold / 100)}</b>${mustAttend(a.att.a, a.att.t, user.threshold / 100) ? 'must attend' : 'can skip'}</div></li>`;
  }
  const e = a.e, s = subj(e.subject), k = kinds[e.kind], cd = countdown(e.start);
  return `<li class="attention-item ${a.critical ? 'critical' : ''}" data-event="${e.id}" tabindex="0"><span class="stripe" style="background:${s?.color || k.color}"></span><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><div class="body"><div class="title">${esc(e.title)}</div><div class="meta"><span class="chip src-${e.source}">${srcName(e.source)}</span>${a.moved ? `<span class="chip moved">↻ moved</span>` : ''}${a.critical ? '<span class="chip danger">Overdue</span>' : ''}${s ? s.code : ''}</div></div><div class="countdown"><b class="tabular">${cd.n}</b>${a.moved ? 'days' : cd.u.toLowerCase()}</div></li>`;
}
const srcName = (s) => ({ AMS: 'AMS', MOODLE: 'Moodle', WHATSAPP: 'WhatsApp', MANUAL: 'Manual', SYSTEM: 'System' }[s]);

function feedCard(f) {
  const unread = f.time > user.lastVisit && !store.read;
  return `<li class="feed-card ${f.severity === 'CRITICAL' ? 'critical' : ''} ${unread ? 'unread' : ''}" ${f.event ? `data-event="${f.event}"` : ''} tabindex="0">
    <div class="top"><span class="chip src-${f.source}">${srcName(f.source)}</span>${f.severity === 'CRITICAL' ? '<span class="chip danger">Critical</span>' : f.severity === 'IMPORTANT' ? '<span class="chip" style="color:var(--warning)">● Important</span>' : ''}<span>${relPast(f.time)}</span></div>
    <div class="title">${esc(f.title)}</div>
    ${f.before ? `<div class="before-after"><s>${f.before}</s>→<b>${f.after}</b></div>` : `<div class="body">${esc(f.body || '')}</div>`}
  </li>`;
}
function relPast(d) { const m = Math.round((now() - d) / 6e4); if (m < 60) return m + 'm ago'; if (m < 60 * 24) return Math.round(m / 60) + 'h ago'; return Math.round(m / 1440) + 'd ago'; }

function buildDay(offset) {
  const date = at(offset); const dow = +fmt(date, { weekday: 'narrow' }) || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(date, { weekday: 'short' }));
  const tt = timetable.filter((t) => t.dow === dow).map((t) => ({ id: null, kind: t.kind, subject: t.subject, title: `${subj(t.subject).short} ${t.kind === 'LAB_SESSION' ? 'Lab' : 'Lecture'}`, start: at(offset, Math.floor(t.h), (t.h % 1) * 60), end: at(offset, Math.floor(t.h + t.len), ((t.h + t.len) % 1) * 60), venue: t.venue, tt: true }));
  const ev = events.filter((e) => dayIdx(e.start) === offset);
  // Replace timetable slots that collide with a real event of same subject
  const merged = [...ev, ...tt.filter((t) => !ev.some((e) => e.subject === t.subject && Math.abs(e.start - t.start) < 2 * H))];
  return merged.sort((a, b) => a.start - b.start);
}

function weekStrip() {
  // Week Mon 28 Sep → Sun 4 Oct? Show today-centred: Mon of current week
  const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(now(), { weekday: 'short' }));
  const start = -((todayDow + 6) % 7) + 7 * 0;
  // show from today forward 7 days — more useful for "this week" radar
  const days = Array.from({ length: 7 }, (_, i) => i);
  let load = 0;
  const html = days.map((d) => {
    const ev = events.filter((e) => dayIdx(e.start) === d && !['CLASS', 'LAB_SESSION'].includes(e.kind));
    load += ev.reduce((s, e) => s + (isExam(e) ? 3 : 1), 0);
    const date = at(d);
    return `<div class="week-day ${d === 0 ? 'today' : ''}" title="${esc(ev.map((e) => e.title).join('\n'))}"><span class="dn">${fmt(date, { weekday: 'short' })}</span><span class="dd">${fmt(date, { day: 'numeric' })}</span><div class="pips">${ev.map((e) => `<i class="pip" style="background:${kinds[e.kind].color}${e.status === 'TENTATIVE' ? ';opacity:.5;background-image:repeating-linear-gradient(90deg,transparent 0 3px,rgba(0,0,0,.4) 3px 5px)' : ''}"></i>`).join('')}</div></div>`;
  }).join('');
  void start;
  const bars = Math.min(12, load);
  return `<div class="load-meter"><span>${load} pts</span><div class="bar">${Array.from({ length: 12 }, (_, i) => `<i class="${i < bars ? 'on' : ''}"></i>`).join('')}</div><span>${load > 8 ? 'heavy' : load > 4 ? 'moderate' : 'light'}</span></div><div class="week-strip">${html}</div>`;
}

function mountRadar() {
  // wait for the boot screen to clear so the cinematic camera fly-in is actually seen
  if (!FX.isBooted()) { FX.afterBoot(() => { if (current === 'radar' && !radar) mountRadar(); }); return; }
  const stage = $('#radar-stage'); if (!stage || radar) return;
  const items = events
    .filter((e) => !['CLASS', 'LAB_SESSION', 'HOLIDAY'].includes(e.kind) && progressOf(e) !== 'DONE' && hoursLeft(e.start) < 1440)
    .map((e) => ({ id: e.id, kind: e.kind, subject: e.subject, title: e.title, color: kinds[e.kind].color, hoursLeft: hoursLeft(e.start), score: score(e), tentative: e.status === 'TENTATIVE', critical: hoursLeft(e.start) < 0, e }));
  const tip = $('#radar-tip');
  radar = createRadar({
    container: stage, items, subjects, reducedMotion: reduced,
    onHover(item, p) {
      if (!item) { tip.classList.remove('show'); return; }
      const e = item.e, s = subj(e.subject);
      tip.innerHTML = `<div style="display:flex;gap:6px;align-items:center"><span class="chip" style="color:${kinds[e.kind].color}">${kinds[e.kind].label}</span><span class="chip src-${e.source}">${srcName(e.source)}</span>${e.status === 'TENTATIVE' ? '<span class="chip tentative">Tentative</span>' : ''}</div><h4>${esc(e.title)}</h4><div class="meta">${fDayTime(e.start)} · ${rel(e.start)}<br>${s ? s.code + ' · ' : ''}priority ${item.score}</div>`;
      tip.style.left = p.x + 'px'; tip.style.top = p.y + 'px'; tip.classList.add('show');
    },
    onSelect(item) { openEvent(item.id); },
  });
  if (!radar) stage.insertAdjacentHTML('beforeend', '<div class="webgl-fallback">3D radar needs WebGL. Everything below still works.</div>');
  $$('[data-mode]', stage).forEach((b) => b.addEventListener('click', () => { $$('[data-mode]', stage).forEach((x) => x.classList.toggle('on', x === b)); radar?.setMode(b.dataset.mode); }));
  $('#mark-read')?.addEventListener('click', () => { store.read = true; save(); $$('.feed-card.unread').forEach((c) => c.classList.remove('unread')); toast('Marked all as read'); });
}

/* ======================= VIEW: EXAMS ======================= */
let examFilter = 'all';
function viewExams() {
  const ex = events.filter(isExam).sort((a, b) => a.start - b.start);
  const compact = window.matchMedia('(max-width: 760px)').matches;
  const SPAN = 60, PAD = compact ? 8 : 60, PXD = compact ? 18 : 46;
  const pos = (d) => `${PAD + (dayIdx(d) + 3 + (d.getTime() - at(dayIdx(d)).getTime()) / D) * PXD}px`;
  const corridorW = PAD * 2 + (SPAN + 3) * PXD;
  const shapeIcon = { MINOR_EXAM: 'diamond', MAJOR_EXAM: 'square', PRACTICAL_EXAM: 'circle', VIVA: 'triangle' };
  const ticks = Array.from({ length: SPAN / 3 + 1 }, (_, i) => i * 3 - 3).map((d) => { const date = at(d); const first = +fmt(date, { day: 'numeric' }) <= 3; return `<div class="exam-tick ${first ? 'month' : ''}" style="left:${pos(date)}">${first ? fmt(date, { month: 'short' }).toUpperCase() : fmt(date, { day: 'numeric' })}</div>`; }).join('');
  const monoliths = ex.map((e, i) => {
    const k = kinds[e.kind], s = subj(e.subject), hgt = 36 + (e.weight || 0) * 2.7;
    const lift = i % 2 ? 34 : 0; // stagger neighbouring labels
    return `<button class="exam-monolith ${e.status === 'TENTATIVE' ? 'tentative' : ''}" type="button" data-event="${e.id}" style="left:${pos(e.start)};--c:${k.color};animation-delay:${0.1 + i * 0.06}s" aria-label="${esc(e.title)}, ${fDay(e.start)}">
      <span class="lbl" style="margin-bottom:${lift}px">${esc(e.label || k.label)}<small>${s?.short || ''} · ${fmt(e.start, { day: 'numeric', month: 'short' })}</small></span>
      <span class="cap">${ic(shapeIcon[e.kind])}</span>
      <div class="pillar" style="height:${hgt}px"></div></button>`;
  }).join('');

  const filterSubjects = [...new Set(ex.map((e) => e.subject).filter(Boolean))].map(subj);
  const groups = [
    { k: 'Minor-2', f: (e) => e.kind === 'MINOR_EXAM' },
    { k: 'Practicals & Vivas', f: (e) => e.kind === 'PRACTICAL_EXAM' || e.kind === 'VIVA' },
    { k: 'Major · End-Sem', f: (e) => e.kind === 'MAJOR_EXAM' },
  ];
  const filt = (e) => examFilter === 'all' || e.subject === examFilter;
  return `<section class="view" id="exams-view">
    <div class="view-head"><div><div class="eyebrow">Exam Hub · majors &amp; minors</div><h1 class="view-title">The <em>exam corridor</em></h1><p class="view-sub">Every Minor, Major, Practical and Viva from now to end of term. Pillar height = weightage. Tap a pillar for details; scroll sideways through the semester.</p></div>
      <div class="exam-legend"><span style="color:${kinds.MINOR_EXAM.color}">${ic('diamond')} Minor</span><span style="color:${kinds.MAJOR_EXAM.color}">${ic('square')} Major</span><span style="color:${kinds.PRACTICAL_EXAM.color}">${ic('circle')} Practical</span><span style="color:${kinds.VIVA.color}">${ic('triangle')} Viva</span></div></div>
    <div class="panel corner exam-stage">
      <div class="exam-floor"></div>
      <div class="radar-hud tl"><b>${ex.filter((e) => hoursLeft(e.start) > 0).length}</b> exams ahead${eventDataMode === 'live' ? '' : ' · sample preview'}</div>
      <div class="radar-hud tr">${eventDataMode === 'live' ? 'Saved UniDash events' : 'Preview · sample dates'}</div>
      <div class="exam-strip-scroll"><div class="exam-strip-inner" style="width:${corridorW}px">
        <div class="exam-axis"></div>${ticks}
        <div class="exam-today" style="left:${pos(now())}"><span>TODAY</span></div>
        ${monoliths}
      </div></div>
    </div>
    <div class="filter-row" role="group" aria-label="Filter by subject"><button class="filter-pill ${examFilter === 'all' ? 'on' : ''}" data-xf="all">All subjects</button>${filterSubjects.map((s) => `<button class="filter-pill ${examFilter === s.id ? 'on' : ''}" data-xf="${esc(s.id)}"><span style="color:${s.color}">■</span> ${s.short}</button>`).join('')}</div>
    ${groups.map((g) => { const list = ex.filter(g.f).filter(filt); return list.length ? `<div class="exam-group"><h2 class="section-label">${g.k} <span class="count">${list.length}</span></h2><div class="exam-grid">${list.map(examCard).join('')}</div></div>` : ''; }).join('')}
  </section>`;
}
function examCard(e) {
  const k = kinds[e.kind], cd = countdown(e.start);
  const prep = e.prep || [], done = prep.filter(Boolean).length, pct = prep.length ? Math.round((done / prep.length) * 100) : 0;
  const subject = subj(e.subject);
  return `<article class="panel corner exam-card" data-event="${e.id}" tabindex="0">
    <span class="stripe" style="background:${subject?.color || k.color}"></span><span class="glare"></span>
    <div class="head"><div><div class="type" style="color:${k.color}">${esc(e.label || k.label)}${subject ? ` · ${subject.code}` : ''}</div><h4>${subject?.name || esc(e.title)}</h4><div class="when">${fDay(e.start)} · ${fTime(e.start)}${e.end ? '–' + fTime(e.end) : ''}${e.venue ? ` · ${esc(e.venue)}` : ''}</div>${e.movedFrom ? `<div class="was">↻ was ${fDayTime(e.movedFrom)}</div>` : ''}</div>
    <div class="big-count"><b class="tabular">${cd.n}</b><span>${cd.u}</span></div></div>
    <div class="chips"><span class="chip ${e.status === 'TENTATIVE' ? 'tentative' : 'ok'}">${e.status === 'TENTATIVE' ? '◌ Tentative' : '● Confirmed'}</span><span class="chip src-${e.source}">${srcName(e.source)}</span>${e.movedFrom ? '<span class="chip moved">↻ moved</span>' : ''}${e.weight != null ? `<span class="chip">${e.weight}% weight</span>` : ''}${e.syllabus ? `<span class="chip">${ic('book-open')} ${esc(e.syllabus)}</span>` : ''}${e.files ? `<span class="chip">${ic('paperclip')} ${e.files}</span>` : ''}</div>
    <div class="prep-bar"><span>Prep</span><div class="track"><i style="width:${pct}%"></i></div><span class="mono">${done}/${prep.length}</span></div>
    <div class="foot"><button class="btn sm primary" type="button" data-remind="${e.id}">${ic('bell-plus')} Reminder</button><button class="btn sm" type="button" data-toast="Opening AMS in a new tab (demo)">${ic('external-link')} AMS</button><button class="btn sm ghost" type="button" data-toast="Exam pack ZIP prepared (demo)">${ic('package')} Exam pack</button></div>
  </article>`;
}
function mountExams() {
  $$('[data-xf]').forEach((b) => b.addEventListener('click', () => { examFilter = b.dataset.xf; render(); }));
  // 3D tilt is handled globally by fx.js
  // Scroll corridor so today is near the left
  const sc = $('.exam-strip-scroll'); if (sc) sc.scrollLeft = 0;
}

/* ======================= VIEW: DEADLINES ======================= */
let dlSort = 'score';
function viewDeadlines() {
  const list = events.filter((e) => isDeadline(e) || (isExam(e) && hoursLeft(e.start) < 24 * 21));
  const bucketOf = (e) => { const h = hoursLeft(e.start), d = dayIdx(e.start); if (h < 0) return 'overdue'; if (d === 0) return 'today'; if (d === 1) return 'tomorrow'; if (d < 7) return 'week'; return 'later'; };
  const B = [['overdue', 'Overdue', 'alarm-clock-off'], ['today', 'Today', 'sun'], ['tomorrow', 'Tomorrow', 'sunrise'], ['week', 'This week', 'calendar-days'], ['later', 'Later', 'calendar-clock']];
  const sorter = dlSort === 'score' ? (a, b) => score(b) - score(a) : (a, b) => a.start - b.start;
  return `<section class="view" id="deadlines-view">
    <div class="view-head"><div><div class="eyebrow">Deadlines board</div><h1 class="view-title">What's <em>due</em>, ranked.</h1><p class="view-sub">Priority = kind + urgency + weightage. Moodle "submitted" auto-marks done — you can always undo.</p></div>
    <div class="board-toolbar"><div class="seg" role="group" aria-label="Sort"><button class="${dlSort === 'score' ? 'on' : ''}" data-sort="score">By priority</button><button class="${dlSort === 'date' ? 'on' : ''}" data-sort="date">By date</button></div><button id="quick-add" class="btn" type="button">${ic('plus')} Quick add</button></div></div>
    <div class="deadline-board">${B.map(([id, label, icon]) => { const items = list.filter((e) => bucketOf(e) === id).sort(sorter); return `<div class="panel bucket ${id}"><div class="bucket-head"><h3>${ic(icon)} ${label}</h3><span class="n">${items.length}</span></div><ul class="bucket-list">${items.map(deadlineRow).join('') || '<li style="color:var(--faint);font-size:12.5px;padding:10px 4px">Nothing here. Breathe.</li>'}</ul></div>`; }).join('')}</div>
    <section class="hidden-events-section">
      <button id="hidden-events-toggle" class="btn" type="button" aria-expanded="${showHiddenEvents}">${ic(showHiddenEvents ? 'chevron-up' : 'eye-off')} ${showHiddenEvents ? 'Hide hidden events' : 'Hidden events'}${hiddenEventsMode === 'ready' ? ` · ${hiddenEvents.length}` : ''}</button>
      ${showHiddenEvents ? `<div class="panel hidden-events-panel"><h2 class="section-label">Hidden source events</h2>${hiddenEventsMode === 'loading' ? '<p class="hidden-events-empty">Loading hidden events…</p>' : hiddenEventsMode === 'error' ? '<p class="hidden-events-empty">Could not load hidden events. Close and reopen this section to retry.</p>' : hiddenEvents.length ? `<ul class="hidden-event-list">${hiddenEvents.map((event) => `<li><div><b>${esc(event.title)}</b><span>${srcName(event.source)} · ${fDayTime(event.start)}</span></div><button class="btn sm" type="button" data-event-unhide="${event.id}">Restore</button></li>`).join('')}</ul>` : '<p class="hidden-events-empty">No hidden events.</p>'}</div>` : ''}
    </section>
  </section>`;
}
function deadlineRow(e) {
  const s = subj(e.subject), k = kinds[e.kind], p = progressOf(e);
  return `<li class="deadline-row ${p === 'DONE' ? 'done' : ''} ${e.status === 'TENTATIVE' ? 'tentative' : ''}" data-event="${e.id}" tabindex="0">
    <span class="stripe" style="background:${s?.color || k.color}"></span>
    <div class="r1"><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><div style="min-width:0"><div class="t">${esc(e.title)}</div><div class="m">${fDayTime(e.start)} · <span data-countdown="${e.start.getTime()}">${rel(e.start)}</span></div></div></div>
    <div class="r2"><div class="chips"><span class="chip src-${e.source}">${srcName(e.source)}</span>${e.status === 'TENTATIVE' ? '<span class="chip tentative">Tentative</span>' : ''}${e.weight != null ? `<span class="chip">${e.weight}%</span>` : ''}${e.submission ? `<span class="chip ${['SUBMITTED', 'GRADED'].includes(e.submission) ? 'ok' : ''}">${e.submission === 'NOT_SUBMITTED' ? 'Not submitted' : e.submission === 'GRADED' ? 'Graded' : 'Submitted'}</span>` : ''}</div>
    ${isExam(e) ? `<span class="score">P${score(e)}</span>` : `<div class="progress-ctl" role="group" aria-label="Progress">${[['NOT_STARTED', 'circle', 'Not started'], ['IN_PROGRESS', 'loader', 'In progress'], ['DONE', 'check', 'Done']].map(([v, i, l]) => `<button type="button" class="${p === v ? 'on' : ''} ${v === 'DONE' ? 'done' : ''}" data-prog="${e.id}:${v}" aria-label="${l}" title="${l}">${ic(i)}</button>`).join('')}</div>`}</div>
  </li>`;
}
function mountDeadlines() {
  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { dlSort = b.dataset.sort; render(); }));
  $('#quick-add')?.addEventListener('click', openManualEventDialog);
  $('#hidden-events-toggle')?.addEventListener('click', () => {
    showHiddenEvents = !showHiddenEvents;
    if (showHiddenEvents && (hiddenEventsMode === 'idle' || hiddenEventsMode === 'error')) {
      hiddenEventsMode = 'loading';
      render();
      void refreshHiddenEvents();
    } else render();
  });
}

/* ======================= VIEW: CALENDAR ======================= */
let calWeek = 0;
let calMode = 'week';
function viewCalendar() {
  const todayDow = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(now(), { weekday: 'short' })) + 6) % 7; // Mon=0
  const mon = -todayDow + calWeek * 7;
  const H0 = 8, H1 = 19, PX = 56;
  const days = Array.from({ length: 7 }, (_, i) => mon + i);
  const cols = days.map((d) => {
    const items = buildDay(d);
    const isWeekend = [5, 6].includes(d - mon);
    const blocks = items.map((e) => {
      const sh = +fmt(e.start, { hour: 'numeric', hour12: false }) + +fmt(e.start, { minute: 'numeric' }) / 60;
      const eh = e.end ? +fmt(e.end, { hour: 'numeric', hour12: false }) + +fmt(e.end, { minute: 'numeric' }) / 60 : sh;
      const k = kinds[e.kind], s = subj(e.subject);
      const c = s?.color || k.color;
      if (e.kind === 'HOLIDAY') return `<div class="cal-event" style="--c:${k.color};top:2px;height:${(H1 - H0) * PX - 4}px;opacity:.6" data-event="${e.id}"><b>${ic('party-popper')} ${esc(e.title)}</b></div>`;
      const top = Math.max(0, (Math.min(sh, H1 - 0.5) - H0) * PX);
      const point = !e.end;
      return `<div class="cal-event ${point ? 'deadline' : ''} ${e.status === 'TENTATIVE' ? 'tentative' : ''}" style="--c:${point ? k.color : c};top:${sh > H1 || sh < H0 ? (sh < H0 ? 0 : (H1 - H0) * PX - 24) : top}px;height:${point ? 22 : Math.max(26, (eh - sh) * PX - 3)}px" ${e.id ? `data-event="${e.id}"` : ''} title="${esc(e.title)}"><b>${point ? '⚑ ' : ''}${esc(point ? e.title : (s ? s.short + (e.tt ? '' : ' · ' + k.label) : e.title))}</b>${point ? '' : `<span>${fTime(e.start)}${e.venue ? ' · ' + esc(e.venue) : ''}</span>`}</div>`;
    }).join('');
    const nowLine = d === 0 ? (() => { const h = +fmt(now(), { hour: 'numeric', hour12: false }) + +fmt(now(), { minute: 'numeric' }) / 60; return h >= H0 && h <= H1 ? `<div class="cal-now" style="top:${(h - H0) * PX}px"></div>` : ''; })() : '';
    return `<div class="cal-day ${d === 0 ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" style="height:${(H1 - H0) * PX}px">${blocks}${nowLine}</div>`;
  }).join('');
  const heads = days.map((d) => `<div class="cal-col-head ${d === 0 ? 'today' : ''}"><span>${fmt(at(d), { weekday: 'short' })}</span><b>${fmt(at(d), { day: 'numeric' })}</b></div>`).join('');
  const hours = Array.from({ length: H1 - H0 }, (_, i) => `<div class="cal-hour">${((H0 + i - 1) % 12) + 1}${H0 + i < 12 ? 'a' : 'p'}</div>`).join('');

  // Semester timeline
  const S0 = -62, S1 = 62, span = S1 - S0, P = (d) => ((d - S0) / span) * 100 + '%';
  const bands = [
    { a: -26, b: -21, l: 'Minor-1', c: kinds.MINOR_EXAM.color },
    { a: 12, b: 18, l: 'Minor-2 week', c: kinds.MINOR_EXAM.color },
    { a: 18, b: 21, l: 'Dussehra', c: kinds.HOLIDAY.color },
    { a: 4, b: 5, l: '🎤', c: kinds.PRESENTATION.color },
    { a: 40, b: 43, l: 'Practicals', c: kinds.PRACTICAL_EXAM.color },
    { a: 47, b: 54, l: 'Majors', c: kinds.MAJOR_EXAM.color },
  ];
  const months = [-62, -31, 0, 29, 60].map((d) => { const dt = at(d); return `<div class="sem-month" style="left:${P(d)}">${fmt(dt, { month: 'short' }).toUpperCase()}</div>`; }).join('');
  const agenda = days.map((d) => {
    const day = at(d), items = buildDay(d);
    const rows = items.map((e) => {
      const s = subj(e.subject), k = kinds[e.kind], time = fTime(e.start);
      const content = `<time>${time}</time><span class="agenda-card" style="--c:${s?.color || k.color}"><b>${esc(e.title)}</b><small>${s ? `${s.short} · ` : ''}${k.label}${e.venue ? ` · ${esc(e.venue)}` : ''}</small></span>`;
      return `<li>${e.id ? `<button class="agenda-row" type="button" data-event="${e.id}">${content}</button>` : `<div class="agenda-row">${content}</div>`}</li>`;
    }).join('');
    return `<section class="agenda-day ${d === 0 ? 'today' : ''}"><h3>${fmt(day, { weekday: 'long', day: 'numeric', month: 'short' })}${d === 0 ? '<span>Today</span>' : ''}<small>${items.length} item${items.length === 1 ? '' : 's'}</small></h3>${rows ? `<ul>${rows}</ul>` : '<p class="agenda-empty">No classes or deadlines scheduled.</p>'}</section>`;
  }).join('');
  const calendarContent = calMode === 'agenda'
    ? `<div class="cal-agenda">${agenda}</div>`
    : `<div class="panel corner cal-wrap"><div class="cal-scroll"><div class="cal-grid"><div class="cal-col-head" style="border-left:0"></div>${heads}<div class="cal-hours">${hours}</div>${cols}</div></div></div>`;

  return `<section class="view" id="calendar-view">
    <div class="view-head"><div><div class="eyebrow">Calendar · ${calMode}</div><h1 class="view-title">${fmt(at(mon), { day: 'numeric', month: 'short' })} — <em>${fmt(at(mon + 6), { day: 'numeric', month: 'short' })}</em></h1><p class="view-sub">Sample timetable and deadlines. Connect the AMS and Moodle APIs later to replace this preview with live data.</p></div>
    <div class="board-toolbar"><div class="seg"><button data-cw="-1" aria-label="Previous week">←</button><button data-cw="0" class="${calWeek === 0 ? 'on' : ''}">This week</button><button data-cw="1" aria-label="Next week">→</button></div><div class="seg" role="group" aria-label="Calendar layout"><button type="button" data-cal-mode="week" class="${calMode === 'week' ? 'on' : ''}">Week</button><button type="button" data-cal-mode="agenda" class="${calMode === 'agenda' ? 'on' : ''}">Agenda</button></div><button class="btn" type="button" data-toast="Calendar export will be available after backend setup.">${ic('link')} Export calendar</button></div></div>
    ${calendarContent}
    <div class="panel corner semester-timeline"><h2 class="section-label" style="margin:0">Semester at a glance</h2>
      <div class="sem-track"><div class="sem-axis"></div>${bands.map((b) => `<div class="sem-band" style="left:${P(b.a)};width:calc(${P(b.b)} - ${P(b.a)});background:color-mix(in srgb, ${b.c} 22%, transparent);border:1px solid ${b.c};color:var(--text)">${b.l}</div>`).join('')}<div class="sem-today" style="left:${P(0)}"></div>${months}</div>
    </div>
  </section>`;
}
function mountCalendar() {
  $$('[data-cw]').forEach((b) => b.addEventListener('click', () => { const v = +b.dataset.cw; calWeek = v === 0 ? 0 : calWeek + v; render(); }));
  $$('[data-cal-mode]').forEach((b) => b.addEventListener('click', () => { calMode = b.dataset.calMode; render(); }));
  const sc = $('.cal-scroll'); if (sc) sc.scrollTop = 40;
}

/* ======================= VIEW: ATTENDANCE ======================= */
function viewAttendance() {
  const r = user.threshold / 100;
  return `<section class="view" id="attendance-view">
    <div class="view-head"><div><div class="eyebrow">Attendance · limit ${user.threshold}%</div><h1 class="view-title">Can I <em>skip</em> it?</h1><p class="view-sub">Sample attendance data. Use the simulator to see where you would land if you skip or attend the next few classes.</p></div></div>
    <div class="att-grid">${attendance.map((a) => {
      const s = subj(a.subject), pct = (a.a / a.t) * 100, st = attStatus(pct, user.threshold);
      const C = 2 * Math.PI * 42;
      const cs = canSkip(a.a, a.t, r), ma = mustAttend(a.a, a.t, r);
      const min = Math.min(...a.trend) - 2, max = Math.max(...a.trend) + 2;
      const pts = a.trend.map((v, i) => `${(i / (a.trend.length - 1)) * 100},${34 - ((v - min) / (max - min)) * 30}`).join(' ');
      const thrY = 34 - ((user.threshold - min) / (max - min)) * 30;
      return `<article class="panel corner att-card" data-att="${a.subject}">
        <div class="att-top">
          <div class="att-ring"><svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="42" fill="none" stroke="var(--border)" stroke-width="7"/><circle cx="48" cy="48" r="42" fill="none" stroke="${st.c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-ring="${C * (1 - pct / 100)}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"/><line x1="48" y1="2" x2="48" y2="14" stroke="var(--text)" stroke-width="2" transform="rotate(${360 * r} 48 48)"/></svg><div class="val"><div>${pct.toFixed(1)}<small>${a.a}/${a.t}</small></div></div></div>
          <div class="att-name"><h4><span style="color:${s.color}">■</span> ${s.short}</h4><div class="m">${s.code} · ${s.faculty}</div><div class="status-tag" style="color:${st.c}">${ic(st.i)} ${st.k}</div></div>
        </div>
        <svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="${thrY}" y2="${thrY}" stroke="var(--danger)" stroke-dasharray="2 2" stroke-width=".6"/><polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>
        <div class="att-math"><div><b style="color:${cs ? 'var(--success)' : 'var(--faint)'}">${cs}</b><span>classes you can skip</span></div><div><b style="color:${ma ? 'var(--danger)' : 'var(--faint)'}">${ma}</b><span>must attend in a row</span></div></div>
        <div class="sim-row"><span>Skip</span><input type="range" min="-5" max="5" value="0" step="1" data-sim="${a.subject}" aria-label="Simulate skipping or attending classes for ${s.short}"><span>Attend</span><span class="sim-out" id="sim-${a.subject}">${pct.toFixed(1)}%</span></div>
      </article>`;
    }).join('')}</div>
  </section>`;
}
function mountAttendance() {
  requestAnimationFrame(() => setTimeout(() => $$('[data-ring]').forEach((c) => { c.style.strokeDashoffset = c.dataset.ring; }), 60));
  $$('[data-sim]').forEach((inp) => inp.addEventListener('input', () => {
    const a = attendance.find((x) => x.subject === inp.dataset.sim), k = +inp.value;
    const p = k < 0 ? a.a / (a.t - k) : (a.a + k) / (a.t + k);
    const out = $('#sim-' + a.subject); out.textContent = (p * 100).toFixed(1) + '%';
    out.style.color = p * 100 < user.threshold ? 'var(--danger)' : 'var(--text)';
  }));
}

/* ======================= VIEW: FILES ======================= */
let fileFolderId = null;
let storageFiles = [];
let storageFolders = [];
let storageAccount = null;
let storageMode = 'loading';
let storageBusy = false;
let storageLastLoadedAt = 0;
let storageCurrentFolderName = 'My files';
const fileSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const storageError = async (response) => {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.error?.message || 'Storage request failed. Please try again.');
};
async function loadStorageFiles() {
  storageMode = 'loading';
  try {
    const query = fileFolderId ? `?folderId=${encodeURIComponent(fileFolderId)}` : '?folderId=root';
    const response = await fetch('/api/v1/storage/files' + query, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw await storageError(response);
    const payload = await response.json();
    if (!Array.isArray(payload.items) || !Array.isArray(payload.folders) || typeof payload.storage?.connected !== 'boolean') throw new Error('Storage response was invalid.');
    storageFiles = payload.items;
    storageFolders = payload.folders;
    storageAccount = payload.storage.connected ? payload.storage.accountEmail : null;
    storageMode = payload.storage.connected ? 'connected' : 'unconnected';
  } catch (error) {
    storageMode = 'unavailable';
    storageFiles = [];
    storageFolders = [];
    storageAccount = null;
    toast(error instanceof Error ? error.message : 'Could not load Google Drive files.');
  }
  storageLastLoadedAt = Date.now();
  updatePreviewPill();
  if (current === 'files') render();
}
async function connectDrive() {
  if (!csrfToken || storageBusy) { toast('Sign in again before connecting Google Drive.'); return; }
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/drive/connect', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw await storageError(response);
    const payload = await response.json();
    if (!payload.authorizationUrl) throw new Error('Google authorization link was missing.');
    window.location.assign(payload.authorizationUrl);
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not start Google Drive connection.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
async function disconnectDrive() {
  if (!csrfToken || storageBusy || !window.confirm('Disconnect Google Drive? Your Drive files will stay in your account.')) return;
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/drive', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw await storageError(response);
    fileFolderId = null;
    await loadStorageFiles();
    toast('Google Drive disconnected. Files remain in your Drive.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not disconnect Google Drive.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
async function uploadStorageFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!csrfToken || storageBusy) { toast('Sign in again before uploading.'); return; }
  const form = new FormData(); form.set('file', file);
  if (fileFolderId) form.set('folderId', fileFolderId);
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/files', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body: form });
    if (!response.ok) throw await storageError(response);
    await loadStorageFiles();
    toast('Uploaded “' + file.name + '” to Google Drive.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Upload failed.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
async function createStorageFolder() {
  const name = window.prompt('Name this folder');
  if (name === null) return;
  if (!csrfToken || storageBusy) { toast('Sign in again before creating a folder.'); return; }
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/folders', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ name: name.trim(), parentId: fileFolderId }) });
    if (!response.ok) throw await storageError(response);
    await loadStorageFiles();
    toast('Folder created in Google Drive.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not create folder.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
async function deleteStorageFile(id) {
  if (!csrfToken || storageBusy || !window.confirm('Move this file to Google Drive trash?')) return;
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/files/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw await storageError(response);
    await loadStorageFiles();
    toast('File moved to Google Drive trash.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete file.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
async function deleteStorageFolder(id) {
  if (!csrfToken || storageBusy || !window.confirm('Move this empty folder to Google Drive trash?')) return;
  storageBusy = true;
  try {
    const response = await fetch('/api/v1/storage/folders/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw await storageError(response);
    fileFolderId = null;
    await loadStorageFiles();
    toast('Folder moved to Google Drive trash.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not delete folder.'); }
  finally { storageBusy = false; if (current === 'files') render(); }
}
function viewFiles() {
  const list = storageFiles;
  const extColor = { 'application/pdf': '#ff6b5b', 'image/jpeg': '#c8ff4d', 'image/png': '#c8ff4d', 'image/gif': '#c8ff4d', 'video/mp4': '#3ec7ff', 'application/zip': '#a78bfa' };
  const label = (type) => ({ 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/gif': 'GIF', 'video/mp4': 'MP4', 'application/zip': 'ZIP' }[type] || 'FILE');
  const location = fileFolderId ? storageCurrentFolderName : 'My files';
  const statusText = storageMode === 'loading' ? 'Loading your Google Drive…' : storageMode === 'connected' ? `Connected to ${esc(storageAccount)} · files are stored in your Google Drive.` : storageMode === 'unconnected' ? 'Connect your Google Drive to store and manage your study files.' : 'Storage is unavailable. Confirm that you are signed in and the backend is configured.';
  return `<section class="view" id="files-view">
    <div class="view-head"><div><div class="eyebrow">Files · Google Drive</div><h1 class="view-title">Your study <em>files</em>.</h1><p class="view-sub">${statusText}</p></div>
    <div class="board-toolbar">${storageMode === 'connected' ? `<button class="btn" type="button" data-drive-upload ${storageBusy ? 'disabled' : ''}>${ic('upload')} Upload</button><button class="btn" type="button" data-drive-folder ${storageBusy ? 'disabled' : ''}>${ic('folder-plus')} New folder</button>${fileFolderId ? `<button class="btn" type="button" data-drive-delete-folder="${esc(fileFolderId)}" ${storageBusy ? 'disabled' : ''}>${ic('trash-2')} Delete folder</button>` : ''}<button class="btn" type="button" data-drive-disconnect ${storageBusy ? 'disabled' : ''}>Disconnect</button>` : `<button class="btn primary" type="button" data-drive-connect ${storageBusy || storageMode === 'loading' ? 'disabled' : ''}>${ic('hard-drive')} Connect Google Drive</button>`}<input id="drive-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.mp4,.zip,application/pdf,image/jpeg,image/png,image/gif,video/mp4,application/zip" hidden></div></div>
    <div class="files-layout">
      <nav class="panel corner folder-tree" aria-label="Folders">
        <button class="tree-item ${!fileFolderId ? 'on' : ''}" type="button" data-drive-root>${ic('hard-drive')} All files<span class="n">${storageFiles.length}</span></button>
        ${storageFolders.map((folder) => `<button class="tree-item ${fileFolderId === folder.id ? 'on' : ''}" type="button" data-drive-folder-open="${esc(folder.id)}">${ic('folder')} ${esc(folder.name)}</button>`).join('')}
        ${storageMode === 'connected' ? '<div class="quota"><span>Storage managed by Google Drive</span></div>' : ''}
      </nav>
      <div>
        ${fileFolderId ? `<button class="btn sm" type="button" data-drive-root>${ic('arrow-left')} Back to all files</button>` : ''}
        <h2 class="section-label">${esc(location)} <span class="count">${list.length}</span></h2>
        ${storageMode === 'loading' ? '<div class="panel" style="padding:24px">Loading files…</div>' : ''}
        ${storageMode === 'unconnected' ? '<div class="panel" style="padding:24px">Connect Google Drive to create your private UniDash folder and begin uploading files.</div>' : ''}
        ${storageMode === 'unavailable' ? '<div class="panel" style="padding:24px">Files could not be loaded. Check your sign-in and server configuration.</div>' : ''}
        ${storageMode === 'connected' && !list.length && !storageFolders.length ? '<div class="panel" style="padding:24px">No files here yet. Upload a PDF, image, video, or ZIP to get started.</div>' : ''}
        <div class="file-grid">${list.map((file) => `<article class="panel file-tile"><a href="/api/v1/storage/files/${encodeURIComponent(file.id)}" class="drive-file-link" title="Download ${esc(file.name)}"><div class="file-thumb"><div class="page"></div><span class="ext" style="background:${extColor[file.mimeType] || 'var(--muted)'}">${label(file.mimeType)}</span></div><div class="nm">${esc(file.name)}</div></a><div class="m"><span>${file.kind} · ${fileSize(file.sizeBytes)}</span><button type="button" class="btn sm" data-drive-delete-file="${esc(file.id)}" ${storageBusy ? 'disabled' : ''}>Delete</button></div></article>`).join('')}</div>
      </div>
    </div>
  </section>`;
}
function mountFiles() {
  $$('[data-drive-connect]').forEach((b) => b.addEventListener('click', () => void connectDrive()));
  $$('[data-drive-disconnect]').forEach((b) => b.addEventListener('click', () => void disconnectDrive()));
  $$('[data-drive-upload]').forEach((b) => b.addEventListener('click', () => $('#drive-file-input').click()));
  $('#drive-file-input')?.addEventListener('change', (event) => void uploadStorageFile(event.currentTarget));
  $$('[data-drive-folder]').forEach((b) => b.addEventListener('click', () => void createStorageFolder()));
  $$('[data-drive-folder-open]').forEach((b) => b.addEventListener('click', () => { fileFolderId = b.dataset.driveFolderOpen; storageCurrentFolderName = b.textContent.trim(); void loadStorageFiles(); }));
  $$('[data-drive-root]').forEach((b) => b.addEventListener('click', () => { fileFolderId = null; storageCurrentFolderName = 'My files'; void loadStorageFiles(); }));
  $$('[data-drive-delete-file]').forEach((b) => b.addEventListener('click', () => void deleteStorageFile(b.dataset.driveDeleteFile)));
  $$('[data-drive-delete-folder]').forEach((b) => b.addEventListener('click', () => void deleteStorageFolder(b.dataset.driveDeleteFolder)));
  if (!storageLastLoadedAt || Date.now() - storageLastLoadedAt > 30_000) void loadStorageFiles();
}

/* ======================= VIEW: PROJECTS ======================= */
let projectsMode = 'loading';
let projectsLastLoadedAt = 0;
let projectBusy = false;
async function loadProjects(force = false) {
  if (!force && projectsLastLoadedAt && Date.now() - projectsLastLoadedAt < 30_000) return;
  projectsMode = 'loading';
  try {
    const response = await fetch('/api/v1/projects', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw await storageError(response);
    const payload = await response.json();
    if (!Array.isArray(payload.items)) throw new Error('Projects response was invalid.');
    projects = payload.items.map((p) => ({ ...p, due: p.deadlineAt ? new Date(p.deadlineAt) : null, tasks: (p.tasks || []).map((t) => ({ ...t, t: t.title })), milestones: (p.milestones || []).map((m) => ({ ...m, t: m.title, d: m.dueAt ? new Date(m.dueAt) : null })), team: p.team || [], files: p.files || [] }));
    projectsMode = 'ready';
  } catch (error) {
    projects = []; projectsMode = 'error';
    if (!(error instanceof Error && error.message.includes('Sign in'))) toast(error instanceof Error ? error.message : 'Could not load saved projects.');
  }
  projectsLastLoadedAt = Date.now(); updatePreviewPill();
  if (current === 'projects') render();
}
async function createProject(form) {
  if (!csrfToken || projectBusy) return;
  const values = new FormData(form);
  const payload = {
    type: values.get('type'), title: String(values.get('title') || '').trim(), description: String(values.get('description') || '').trim() || null,
    status: values.get('status'), deadlineAt: values.get('deadlineAt') ? new Date(values.get('deadlineAt')).toISOString() : null,
    team: String(values.get('team') || '').split(',').map((name) => name.trim()).filter(Boolean).slice(0, 20),
    tasks: String(values.get('tasks') || '').split('\n').map((title) => title.trim()).filter(Boolean).slice(0, 100).map((title) => ({ title, done: false })),
  };
  const submit = $('#project-submit'), errorEl = $('#project-form-error');
  projectBusy = true; submit.disabled = true; submit.textContent = 'Saving…'; errorEl.hidden = true;
  try {
    const response = await fetch('/api/v1/projects', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload) });
    if (!response.ok) throw await storageError(response);
    const { item } = await response.json();
    const selectedFiles = [...values.getAll('files'), ...values.getAll('folderFiles')].filter((file) => file instanceof File && file.size);
    const uploadResult = await uploadProjectFiles(item.id, selectedFiles, (done, total) => { submit.textContent = `Uploading ${done}/${total}…`; });
    $('#project-dialog').close(); projectsLastLoadedAt = 0; await loadProjects(true);
    if (uploadResult.failed.length) {
      const summary = `${uploadResult.uploaded} of ${selectedFiles.length} files uploaded to Drive. Failed: ${uploadResult.failed.slice(0, 3).join(', ')}${uploadResult.failed.length > 3 ? ', …' : ''}. You can retry from the project card.`;
      toast('Project saved. ' + summary);
    } else {
      toast(selectedFiles.length ? `Project created; all ${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} saved to Google Drive.` : 'Project saved with its own Google Drive folder.');
    }
  } catch (error) {
    errorEl.textContent = error instanceof Error ? error.message : 'Could not save the project.'; errorEl.hidden = false;
  }
  finally { projectBusy = false; submit.disabled = false; submit.textContent = 'Create project'; }
}
async function updateProjectTask(id, index) {
  if (!csrfToken || projectBusy) return;
  const project = projects.find((item) => item.id === id); if (!project) return;
  const tasks = project.tasks.map((task, i) => ({ title: task.title || task.t, done: i === index ? !task.done : task.done }));
  projectBusy = true;
  try {
    const response = await fetch('/api/v1/projects/' + encodeURIComponent(id), { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'If-Match': `"${project.updatedAt}"` }, body: JSON.stringify({ tasks }) });
    if (!response.ok) throw await storageError(response);
    projectsLastLoadedAt = 0; await loadProjects(true);
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not save that task.'); }
  finally { projectBusy = false; }
}
async function uploadProjectFiles(id, selectedFiles, onProgress = () => {}) {
  const result = { uploaded: 0, failed: [] };
  for (const [index, file] of selectedFiles.entries()) {
    onProgress(index + 1, selectedFiles.length);
    try {
      const form = new FormData(); form.set('file', file); form.set('projectId', id);
      if (file.webkitRelativePath) form.set('relativePath', file.webkitRelativePath);
      const response = await fetch('/api/v1/storage/files', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body: form });
      if (!response.ok) throw await storageError(response);
      result.uploaded += 1;
    } catch (error) { result.failed.push(`${file.name} (${error instanceof Error ? error.message : 'upload failed'})`); }
  }
  return result;
}
async function uploadProjectFile(id, input) {
  const selectedFiles = Array.from(input.files || []); input.value = ''; if (!selectedFiles.length) return;
  if (!csrfToken || projectBusy) { toast('Sign in again before uploading.'); return; }
  projectBusy = true;
  try {
    const result = await uploadProjectFiles(id, selectedFiles, (done, total) => { if (done === 1 || done % 5 === 0) toast(`Uploading project files to Google Drive: ${done}/${total}…`); });
    projectsLastLoadedAt = 0; await loadProjects(true);
    toast(result.failed.length ? `${result.uploaded}/${selectedFiles.length} files uploaded. ${result.failed.slice(0, 2).join('; ')}` : `Uploaded ${result.uploaded} file${result.uploaded === 1 ? '' : 's'} to this project's Google Drive folder.`);
  } catch (error) { toast(error instanceof Error ? error.message : 'Project file upload failed.'); }
  finally { projectBusy = false; if (current === 'projects') render(); }
}
async function archiveProject(id) {
  const project = projects.find((item) => item.id === id);
  if (!project || !csrfToken || projectBusy || !window.confirm(`Archive “${project.title}”? Its files will remain in Google Drive.`)) return;
  projectBusy = true;
  try {
    const response = await fetch('/api/v1/projects/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken, 'If-Match': `"${project.updatedAt}"` } });
    if (!response.ok) throw await storageError(response);
    projectsLastLoadedAt = 0; await loadProjects(true); toast('Project archived. Its Drive files were kept.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Could not archive project.'); }
  finally { projectBusy = false; }
}
function viewProjects() {
  const teamColors = ['#ffb000', '#ff6fb5', '#3ec7ff', '#c8ff4d', '#a78bfa'];
  return `<section class="view" id="projects-view">
    <div class="view-head"><div><div class="eyebrow">Projects &amp; presentations</div><h1 class="view-title">Work in <em>flight</em>.</h1><p class="view-sub">Projects save to your account. Uploaded project files are stored in Google Drive.</p></div><button class="btn primary" type="button" data-project-new>${ic('plus')} New project</button></div>
    ${projectsMode === 'loading' ? '<div class="panel" style="padding:24px">Loading your projects…</div>' : ''}
    ${projectsMode === 'error' ? '<div class="panel" style="padding:24px">Could not load saved projects. Refresh and try again.</div>' : ''}
    ${projectsMode === 'ready' && !projects.length ? '<div class="panel" style="padding:24px">No saved projects yet. Create one to get a dedicated Google Drive folder.</div>' : ''}
    <div class="proj-grid">${projectsMode === 'ready' ? projects.map((p) => {
      const s = p.subjectId ? subj(p.subjectId) : { code: p.type.replaceAll('_', ' '), color: 'var(--accent)' };
      const tasks = p.tasks.map((t) => ({ ...t, t: t.title || t.t }));
      const doneN = tasks.filter((t) => t.done).length;
      let mid = '';
      if (p.type === 'PRESENTATION') {
        const cur = presentationSteps.indexOf(p.status);
        mid = `<div class="stepper">${presentationSteps.map((st, i) => `<i class="${i < cur ? 'on' : i === cur ? 'cur' : ''}"></i>`).join('')}</div><div class="stepper-labels">${presentationSteps.map((st, i) => `<span class="${i === cur ? 'cur' : ''}">${st.replace('_', ' ').toLowerCase()}</span>`).join('')}</div>`;
      } else if (p.milestones.length) {
        const dated = p.milestones.filter((m) => m.d instanceof Date && !Number.isNaN(m.d.getTime()));
        if (dated.length) {
        const t0 = dated[0].d.getTime(), t1 = dated[dated.length - 1].d.getTime();
        const P = (d) => t1 === t0 ? 50 : ((d.getTime() - t0) / (t1 - t0)) * 92 + 4;
        mid = `<div class="milestones"><div class="line"></div><div class="fill" style="width:${Math.max(0, Math.min(100, P(now())))}%"></div>${dated.map((m) => `<div class="ms ${m.done ? 'done' : ''}" style="left:${P(m.d)}%"><i></i><span>${esc(m.t)}</span></div>`).join('')}</div>`;
        }
      }
      return `<article class="panel corner proj-card">
        <div class="head"><div><div class="eyebrow" style="color:${s.color}">${p.type === 'PRESENTATION' ? 'Presentation' : 'Project'} · ${esc(s.code)}</div><h4>${esc(p.title)}</h4></div><div style="text-align:right">${p.due ? `<div class="mono" style="font-size:22px">${countdown(p.due).n}<span style="font-size:10px;color:var(--muted)"> ${countdown(p.due).u}</span></div>` : ''}<span class="chip ${p.status === 'BLOCKED' ? 'danger' : ''}">${p.status.replaceAll('_', ' ')}</span></div></div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${p.due ? fDayTime(p.due) : 'No deadline set'}${p.venue ? ' · ' + esc(p.venue) : ''}${p.duration ? ' · ' + esc(p.duration) : ''}</div>
        ${p.description ? `<p style="font-size:13px;color:var(--muted);line-height:1.5">${esc(p.description)}</p>` : ''}
        ${mid}
        ${p.blockedBy ? `<div class="blocked">${ic('octagon-pause')} ${esc(p.blockedBy)}</div>` : ''}
        ${tasks.length ? `<ul class="task-list">${tasks.map((t, i) => `<li class="${t.done ? 'done' : ''}" data-task="${p.id}:${i}" tabindex="0"><span class="cb">${t.done ? ic('check') : ''}</span><span>${esc(t.t)}</span></li>`).join('')}</ul>` : ''}
        <div class="team"><div class="avs">${p.team.map((n, i) => `<span class="avatar" style="background:${teamColors[i % 5]}" title="${esc(n)}">${esc(n.slice(0, 2).toUpperCase())}</span>`).join('')}</div><span>${p.team.length} member${p.team.length !== 1 ? 's' : ''} · ${doneN}/${tasks.length} tasks</span></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px"><label class="btn sm" style="cursor:pointer">${ic('upload')} Add files<input type="file" data-project-upload="${p.id}" multiple hidden></label><label class="btn sm" style="cursor:pointer">${ic('folder-up')} Upload folder<input type="file" data-project-upload="${p.id}" webkitdirectory directory multiple hidden></label><button class="btn sm" type="button" data-project-archive="${p.id}">Archive</button></div>
        ${p.files.length ? `<div style="display:grid;gap:6px;margin-top:12px"><b style="font-size:11px;color:var(--muted)">FILES IN GOOGLE DRIVE</b>${p.files.map((file) => {
          const isHtml = file.mimeType === 'text/html' || /\.html?$/i.test(file.name);
          const href = isHtml ? `/api/v1/projects/${encodeURIComponent(p.id)}/files/${encodeURIComponent(file.id)}/preview` : `/api/v1/storage/files/${encodeURIComponent(file.id)}`;
          return `<a href="${href}" class="drive-file-link" ${isHtml ? 'target="_blank" rel="noopener noreferrer" title="Open this HTML site in a new tab"' : ''}>${ic(isHtml ? 'external-link' : 'file')} ${esc(file.name)}${isHtml ? ' · Open site' : ''} <span style="color:var(--muted)">${fileSize(file.sizeBytes)}</span></a>`;
        }).join('')}</div>` : ''}
      </article>`;
    }).join('') : ''}</div>
    <dialog id="project-dialog" class="event-dialog"><form id="project-form">
      <div class="event-dialog-head"><div><div class="eyebrow">Project workspace</div><h2>Create project</h2></div><button class="btn sm" type="button" data-project-cancel>Close</button></div>
      <div class="event-form-grid">
        <label class="event-field event-field-wide">Title<input name="title" required maxlength="180" placeholder="e.g. Mess Management System"></label>
        <label class="event-field">Type<select name="type"><option value="PROJECT">Project</option><option value="PRESENTATION">Presentation</option><option value="LAB_FILE">Lab file</option><option value="SEMINAR">Seminar</option><option value="RESEARCH">Research</option><option value="OTHER">Other</option></select></label>
        <label class="event-field">Status<select name="status"><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="SUBMITTED">Submitted</option><option value="DONE">Done</option></select></label>
        <label class="event-field event-field-wide">Deadline<input type="datetime-local" name="deadlineAt"></label>
        <label class="event-field event-field-wide">Description<textarea name="description" maxlength="4000"></textarea></label>
        <label class="event-field event-field-wide">Team members<input name="team" maxlength="1200" placeholder="Names separated by commas"></label>
        <label class="event-field event-field-wide">Tasks<textarea name="tasks" placeholder="One task per line"></textarea></label>
        <label class="event-field event-field-wide">Choose files (optional)<input name="files" type="file" multiple><small>Select multiple files, including common Office, text, and source-code formats. Each file can be up to 20 MB.</small></label>
        <label class="event-field event-field-wide">Or choose a complete folder<input name="folderFiles" type="file" webkitdirectory directory multiple><small>Folder structure is recreated in this project's Google Drive folder. Supported file types only; each file can be up to 20 MB.</small></label>
      </div>
      <div id="project-form-error" class="event-form-error" role="alert" hidden></div>
      <div class="event-dialog-actions"><button class="btn" type="button" data-project-cancel>Cancel</button><button id="project-submit" class="btn primary" type="submit">Create project</button></div>
    </form></dialog>
  </section>`;
}
function mountProjects() {
  $$('[data-project-new]').forEach((button) => button.addEventListener('click', () => {
    if (!csrfToken) { toast('Sign in again before creating a project.'); return; }
    $('#project-form').reset(); $('#project-form-error').hidden = true; $('#project-dialog').showModal();
  }));
  $$('[data-project-cancel]').forEach((button) => button.addEventListener('click', () => $('#project-dialog').close()));
  $('#project-form')?.addEventListener('submit', (event) => { event.preventDefault(); void createProject(event.currentTarget); });
  $$('[data-task]').forEach((li) => li.addEventListener('click', () => { const [id, index] = li.dataset.task.split(':'); void updateProjectTask(id, Number(index)); }));
  $$('[data-project-upload]').forEach((input) => input.addEventListener('change', () => void uploadProjectFile(input.dataset.projectUpload, input)));
  $$('[data-project-archive]').forEach((button) => button.addEventListener('click', () => void archiveProject(button.dataset.projectArchive)));
  if (!projectsLastLoadedAt || Date.now() - projectsLastLoadedAt > 30_000) void loadProjects(true);
}

/* ======================= MORE (mobile) ======================= */
function viewMore() {
  return `<section class="view"><div class="view-head"><div><div class="eyebrow">More</div><h1 class="view-title">Everything <em>else</em></h1></div></div>
  <div class="att-grid">${NAV.filter((n) => !TABS.includes(n.id)).map((n) => `<a class="panel corner panel-pad" href="#${n.id}" style="display:flex;align-items:center;gap:14px;text-decoration:none"><span class="kind-badge" style="color:var(--accent)">${ic(n.icon)}</span><b>${n.label}</b><span style="margin-left:auto;color:var(--muted)">${ic('chevron-right')}</span></a>`).join('')}</div>
  <h2 class="section-label" style="margin-top:28px">Integrations</h2>
  <div class="att-grid">
    <article class="panel panel-pad"><div style="display:flex;justify-content:space-between;align-items:center"><b>Moodle</b><span class="chip integration-status" data-integration-status="MOODLE">${esc(integrationStatuses.MOODLE?.status || 'LOADING')}</span></div>
      <p style="font-size:12px;color:var(--muted);margin:8px 0">Use the local Portal Bridge scan below to read Moodle in your browser after you sign in. The verified web-service token is a separate future server-sync option.</p>
      <form data-moodle-connect style="display:grid;gap:8px"><label class="event-field">Moodle web-service token<input name="token" type="password" required minlength="20" maxlength="512" autocomplete="off" spellcheck="false" placeholder="Paste token here; never send it in chat"></label><button class="btn sm primary" type="submit">Verify and connect</button></form>
      <button class="btn sm" type="button" data-moodle-disconnect style="margin-top:8px" ${integrationStatuses.MOODLE?.connected ? '' : 'hidden'}>Disconnect Moodle</button>
      <a href="https://moodle.mitsweb.in/login/index.php" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:12px">Open MITS Moodle ↗</a>
      <p style="font-size:11px;color:var(--muted);margin:8px 0 0">If Moodle does not show a Security keys/token option, your account may need the institute administrator to enable a read-only web-service token.</p>
    </article>
    <article class="panel panel-pad"><div style="display:flex;justify-content:space-between;align-items:center"><b>AMS</b><span class="chip integration-status" data-integration-status="AMS">${esc(integrationStatuses.AMS?.status || 'NOT CONNECTED')}</span></div>
      <p style="font-size:12px;color:var(--muted);margin:8px 0">AMS is read from your signed-in browser session. Configure the attendance page path and table in the extension first; the scanner will flag pages it cannot safely read.</p>
      <a href="https://ams.mitsgwalior.in/login" target="_blank" rel="noopener noreferrer">Open MITS AMS ↗</a>
    </article>
    <article class="panel panel-pad" style="grid-column:1/-1">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>Portal scan report</b><div class="muted" data-bridge-status style="margin-top:5px">Checking extension…</div></div><button class="btn sm primary" type="button" data-bridge-scan disabled>Scan enabled portals</button></div>
      <p class="muted" style="margin:10px 0">Manual scan only. The extension opens the portals so you can sign in; it compares this scan with your previous local baseline. Portal rows stay in this browser extension and are not uploaded to UniDash. Scanned values do not replace the demo attendance or dashboard data.</p>
      <div class="panel panel-pad" style="margin:10px 0"><b>One-time setup in Microsoft Edge</b><ol class="muted"><li>Open <code>edge://extensions</code> and turn on <b>Developer mode</b>.</li><li>Choose <b>Load unpacked</b> and select this project’s <code>extension/portal-bridge</code> folder.</li><li>Return to this UniDash tab, click the extension icon, then <b>Pair with this dashboard</b>.</li><li>Open extension <b>Portal settings</b>, enable the portals, configure the AMS attendance page if needed, then click <b>Save &amp; grant access</b>.</li><li>Return here and click <b>Scan enabled portals</b>. Sign in yourself in the portal tabs that open.</li></ol><button class="btn sm" type="button" data-bridge-refresh>Check extension again</button></div>
      <div data-bridge-progress></div><div data-bridge-report><p class="muted">No browser scan report yet. Your first scan creates a baseline; the next scan compares it for changes.</p></div>
    </article>
    <div class="panel panel-pad"><div style="display:flex;justify-content:space-between;align-items:center"><b>WhatsApp</b><span class="chip">Deferred to v2</span></div><div style="font-size:12px;color:var(--muted);margin-top:6px">No group messages are connected or monitored in v1.</div></div>
  </div></section>`;
}
async function connectMoodle(form) {
  if (!csrfToken) { toast('Sign in again before connecting Moodle.'); return; }
  const input = form.elements.namedItem('token');
  const button = form.querySelector('button[type="submit"]');
  const token = input.value.trim();
  button.disabled = true;
  try {
    const response = await fetch('/api/v1/integrations/moodle', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ token }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Could not verify Moodle token.');
    input.value = '';
    toast('Moodle connection verified. Data sync is the next step.');
    await refreshIntegrationChips();
    render();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not verify Moodle token.');
  } finally {
    button.disabled = false;
  }
}
async function disconnectMoodle() {
  if (!csrfToken || !window.confirm('Disconnect Moodle and remove its saved token from UniDash?')) return;
  try {
    const response = await fetch('/api/v1/integrations/moodle', { method: 'DELETE', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken } });
    if (!response.ok) throw new Error();
    toast('Moodle disconnected.');
    await refreshIntegrationChips();
    render();
  } catch { toast('Could not disconnect Moodle. Refresh and try again.'); }
}
function mountMore() {
  $('[data-moodle-connect]')?.addEventListener('submit', (event) => { event.preventDefault(); void connectMoodle(event.currentTarget); });
  $('[data-moodle-disconnect]')?.addEventListener('click', () => void disconnectMoodle());
  $('[data-bridge-scan]')?.addEventListener('click', () => void startPortalScan());
  $('[data-bridge-refresh]')?.addEventListener('click', () => void checkPortalBridge());
  void checkPortalBridge();
}

/* ======================= SHEET ======================= */
function openEvent(id) {
  const e = events.find((x) => x.id === id); if (!e) return;
  const s = subj(e.subject), k = kinds[e.kind], cd = countdown(e.start);
  const rem = isExam(e) ? ['7 d', '3 d', '1 d', '3 h'] : e.kind === 'PRESENTATION' ? ['7 d', '3 d', '1 d', '3 h', 'rehearsal −2 d'] : ['1 d', '3 h', '1 h'];
  $('#sheet-body').innerHTML = `
    <div class="sheet-kind"><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><span class="chip" style="color:${k.color}">${esc(e.label || k.label)}</span><span class="chip src-${e.source}">${srcName(e.source)}</span><span class="chip ${e.status === 'TENTATIVE' ? 'tentative' : 'ok'}">${e.status === 'TENTATIVE' ? 'Tentative' : 'Confirmed'}</span></div>
    <h2 id="sheet-title">${esc(e.title)}</h2>
    <div class="sheet-count tabular">${cd.n}<small>${cd.u.toLowerCase()}</small></div>
    <dl class="sheet-meta">
      <dt>When</dt><dd>${fDayTime(e.start)}${e.end ? ' – ' + fTime(e.end) : ''} <span style="color:var(--muted)">IST</span></dd>
      ${e.venue ? `<dt>Where</dt><dd>${esc(e.venue)}</dd>` : ''}
      ${e.subject ? `<dt>Subject</dt><dd><span style="color:${s.color}">■</span> ${esc(s.code)} · ${esc(s.name)}${s.faculty ? `<br><span style="color:var(--muted);font-size:12.5px">${esc(s.faculty)}</span>` : ''}</dd>` : ''}
      ${e.weight ? `<dt>Weight</dt><dd>${e.weight}% · priority ${score(e)}</dd>` : ''}
      ${e.syllabus ? `<dt>Syllabus</dt><dd>${esc(e.syllabus)}${e.files ? ` · ${e.files} files` : ''}</dd>` : ''}
      ${e.description ? `<dt>Details</dt><dd>${esc(e.description)}</dd>` : ''}
      ${e.submission ? `<dt>Moodle</dt><dd>${e.submission === 'NOT_SUBMITTED' ? 'Not submitted yet' : e.submission === 'GRADED' ? 'Graded' : 'Submitted'}</dd>` : ''}
      <dt>Reminders</dt><dd class="reminder-list">${rem.map((r) => `<span class="chip">${ic('bell')} ${r}</span>`).join('')}</dd>
    </dl>
    <h3 class="section-label">History</h3>
    <ul class="history">
      ${e.movedFrom ? `<li><b>Rescheduled on AMS</b> · today 7:12 AM<br><s>${fDayTime(e.movedFrom)}</s> → ${fDayTime(e.start)}</li><li><b>Prof. Sharma</b> on WhatsApp confirmed the change · 7:40 AM</li>` : ''}
      ${e.source === 'WHATSAPP' ? `<li><b>Proposed from WhatsApp</b> · Rahul — CR · 8:51 AM</li><li>Waiting for Moodle / AMS to confirm</li>` : ''}
      <li><b>First seen</b> on ${srcName(e.source)} · ${e.source === 'MANUAL' ? 'added by you' : 'auto-synced'}</li>
    </ul>
    <div class="sheet-actions">
      ${e.persisted ? `<button class="btn" type="button" data-event-edit="${e.id}">${ic('pencil')} Edit details</button>` : ''}
      ${e.persisted && e.source === 'MANUAL' ? `<button class="btn ghost" type="button" data-event-delete="${e.id}">${ic('trash-2')} Delete event</button>` : ''}
      ${e.persisted && e.source !== 'MANUAL' ? `<button class="btn ghost" type="button" data-event-hide="${e.id}">${ic('eye-off')} Hide source event</button>` : ''}
      ${isDeadline(e) ? `<button class="btn primary" type="button" data-prog="${e.id}:DONE">${ic('check')} Mark done</button>` : `<button class="btn primary" type="button" data-remind="${e.id}">${ic('bell-plus')} Add reminder</button>`}
      <button class="btn" type="button" data-toast="Opening ${srcName(e.source)} (demo)">${ic('external-link')} Open in ${srcName(e.source)}</button>
      <button class="btn ghost" type="button" data-focus="${e.id}">${ic('radar')} Show on radar</button>
    </div>`;
  lucide.createIcons();
  $('#side-sheet').hidden = false; $('#sheet-scrim').hidden = false;
  $('#sheet-close').focus();
}
function closeSheet() { $('#side-sheet').hidden = true; $('#sheet-scrim').hidden = true; }

/* ======================= PALETTE ======================= */
let palSel = 0, palItems = [];
function openPalette() { $('#palette').hidden = false; const i = $('#palette-input'); i.value = ''; runSearch(''); setTimeout(() => i.focus(), 20); }
function closePalette() { $('#palette').hidden = true; }
function runSearch(q) {
  q = q.trim().toLowerCase();
  const m = (s) => !q || s.toLowerCase().includes(q);
  const groups = [];
  const ev = events.filter((e) => m(e.title + ' ' + (subj(e.subject)?.name || '') + ' ' + (e.label || '') + ' ' + kinds[e.kind].label)).slice(0, 6);
  if (ev.length) groups.push(['Events', ev.map((e) => ({ html: `<span class="kind-badge" style="color:${kinds[e.kind].color}">${ic(kinds[e.kind].icon)}</span>${esc(e.title)}<span class="m">${fDay(e.start)}</span>`, run: () => openEvent(e.id) }))]);
  const searchableFiles = storageMode === 'connected' ? storageFiles : files;
  const fl = searchableFiles.filter((f) => m(f.name + ' ' + (f.subject ? subj(f.subject).name : ''))).slice(0, 4);
  if (q && fl.length) groups.push(['Files', fl.map((f) => ({ html: `<span class="kind-badge" style="color:var(--cyan)">${ic('file')}</span>${esc(f.name)}`, run: () => go('files') }))]);
  const nv = NAV.filter((n) => m(n.label));
  if (nv.length) groups.push(['Go to', nv.map((n) => ({ html: `<span class="kind-badge" style="color:var(--accent)">${ic(n.icon)}</span>${n.label}<span class="m">view</span>`, run: () => go(n.id) }))]);
  palItems = groups.flatMap((g) => g[1]); palSel = 0;
  let idx = 0;
  $('#palette-results').innerHTML = groups.length ? groups.map(([g, items]) => `<div class="pal-group">${g}</div>${items.map(() => `<div class="pal-item ${idx === 0 ? 'sel' : ''}" data-pi="${idx++}">${palItems[idx - 1].html}</div>`).join('')}`).join('') : '<div class="pal-empty">No results. Try “minor”, “dbms”, “quiz” or “kal”.</div>';
  lucide.createIcons();
}

/* ======================= TOAST ======================= */
let toastTimer;
function toast(msg, undo) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" id="toast-undo">Undo</button>' : ''}`; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
  if (undo) $('#toast-undo').onclick = () => { undo(); t.hidden = true; };
}

/* ======================= ROUTER ======================= */
const VIEWS = {
  radar: [viewRadar, mountRadar], exams: [viewExams, mountExams], deadlines: [viewDeadlines, mountDeadlines], calendar: [viewCalendar, mountCalendar],
  attendance: [viewAttendance, mountAttendance], files: [viewFiles, mountFiles], projects: [viewProjects, mountProjects], more: [viewMore, mountMore],
};
let current = null;
function go(v) { if (location.hash === '#' + v) render(); else location.hash = v; }
const ORDER = [...NAV.map((n) => n.id), 'more'];
function render() {
  const requested = (location.hash.slice(1) || 'radar').split('?')[0];
  if (!VIEWS[requested]) {
    if (location.hash !== '#radar') { location.hash = 'radar'; return; }
  }
  const v = VIEWS[requested] ? requested : 'radar';
  const [view, mount] = VIEWS[v] || VIEWS.radar;
  const same = current === v;
  const host = $('#view-host');
  const oldScroll = FX.scrollTop();
  const keepScroll = same ? oldScroll : 0;
  const dir = current && ORDER.indexOf(v) < ORDER.indexOf(current) ? -1 : 1;
  // 3D page transition: the outgoing view becomes a ghost that recedes into depth
  const old = host.querySelector('.view:not(.view-ghost)');
  host.querySelectorAll('.view-ghost').forEach((g) => g.remove());
  if (old && !same && !FX.isReduced) {
    old.classList.add('view-ghost'); old.classList.remove('v-enter'); old.style.setProperty('--dir', dir); old.style.top = -oldScroll + 'px';
    old.removeAttribute('id'); old.setAttribute('aria-hidden', 'true'); old.setAttribute('inert', '');
    old.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    setTimeout(() => old.remove(), 650);
  } else if (old) old.remove();
  if (radar) { const r = radar; radar = null; if (old && !same && !FX.isReduced) setTimeout(() => r.destroy(), 640); else r.destroy(); }
  const content = view().replace(/(<section class="view"[^>]*>)/, `$1${eventDataNotice()}`);
  host.insertAdjacentHTML('beforeend', content);
  const fresh = host.lastElementChild;
  if (!same) { fresh.classList.add('v-enter'); fresh.style.setProperty('--dir', dir); }
  current = v;
  $$('[data-view]').forEach((a) => a.classList.toggle('active', a.dataset.view === v || (v !== 'more' && a.dataset.view === 'more' && !TABS.includes(v) && innerWidth <= 760)));
  $$('[data-view]').forEach((a) => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
  lucide.createIcons();
  mount();
  FX.scrollTo(keepScroll);
  FX.decorate(fresh, { instant: same });
  document.title = `${NAV.find((n) => n.id === v)?.label || 'More'} · UniDash`;
}

/* ======================= GLOBAL EVENTS ======================= */
function bindGlobal() {
  window.addEventListener('hashchange', render);
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-prog],[data-remind],[data-toast],[data-focus],[data-go],[data-event-edit],[data-event-delete],[data-event-hide],[data-event-unhide],[data-event],[data-sync],[data-pi],[data-integration-prompt-connect],[data-integration-prompt-later]');
    if (!t) return;
    if (t.dataset.integrationPromptConnect !== undefined) { openPortalConnections(); return; }
    if (t.dataset.integrationPromptLater !== undefined) { dismissIntegrationPrompt(); return; }
    if (t.dataset.prog) {
      ev.stopPropagation();
      const [id, v] = t.dataset.prog.split(':'); const e = events.find((x) => x.id === id); const prev = progressOf(e);
      if (e?.persisted) { void savePersistedProgress(e, v); return; }
      store.progress[id] = v; save(); closeSheet(); render();
      toast(v === 'DONE' ? `Marked “${e.title}” done` : `Progress → ${v.replace('_', ' ').toLowerCase()}`, () => { store.progress[id] = prev; save(); render(); });
    } else if (t.dataset.remind) { ev.stopPropagation(); toast('Reminders set: 7 d, 3 d, 1 d and 3 h before'); }
    else if (t.dataset.toast) { ev.stopPropagation(); toast(t.dataset.toast); }
    else if (t.dataset.eventEdit) { ev.stopPropagation(); openManualEventDialog(t.dataset.eventEdit); }
    else if (t.dataset.eventDelete) { ev.stopPropagation(); void deleteManualEvent(t.dataset.eventDelete); }
    else if (t.dataset.eventHide) { ev.stopPropagation(); void setSourceEventHidden(t.dataset.eventHide, true); }
    else if (t.dataset.eventUnhide) { ev.stopPropagation(); void setSourceEventHidden(t.dataset.eventUnhide, false); }
    else if (t.dataset.focus) { closeSheet(); if (current !== 'radar') { go('radar'); setTimeout(() => radar?.focus(t.dataset.focus), 400); } else radar?.focus(t.dataset.focus); }
    else if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.event) { openEvent(t.dataset.event); if (current === 'radar') radar?.focus(t.dataset.event); }
    else if (t.dataset.sync) {
      go('more');
    }
    else if (t.dataset.pi) { closePalette(); palItems[+t.dataset.pi].run(); }
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); if ($('#palette').hidden) openPalette(); else closePalette(); return; }
    if (ev.key === 'Escape') { closePalette(); closeSheet(); }
    if (ev.key === '/' && document.activeElement.tagName !== 'INPUT') { ev.preventDefault(); openPalette(); }
    if (!$('#palette').hidden) {
      const els = $$('.pal-item');
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); palSel = (palSel + (ev.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length; els.forEach((e, i) => e.classList.toggle('sel', i === palSel)); els[palSel]?.scrollIntoView({ block: 'nearest' }); }
      if (ev.key === 'Enter' && palItems[palSel]) { closePalette(); palItems[palSel].run(); }
    }
    if (ev.key === 'Enter' && document.activeElement?.matches?.('[data-event],[data-go],[data-task]') && $('#palette').hidden) document.activeElement.click();
  });
  $('#palette-input').addEventListener('input', (e) => runSearch(e.target.value));
  $('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
  $('#event-form').addEventListener('submit', saveManualEvent);
  $('#event-dialog').addEventListener('cancel', (e) => { if (manualEventSaving) e.preventDefault(); });
  $('#event-dialog').addEventListener('click', (e) => { if (e.target.id === 'event-dialog' && !manualEventSaving) e.currentTarget.close(); });
  $$('[data-event-cancel]').forEach((button) => button.addEventListener('click', () => {
    if (!manualEventSaving) $('#event-dialog').close();
  }));
  $('#search-trigger').addEventListener('click', openPalette);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-scrim').addEventListener('click', closeSheet);
  $('#bell-btn').addEventListener('click', () => go('radar'));
  $('#integration-prompt')?.addEventListener('cancel', dismissIntegrationPrompt);
  $('#integration-prompt')?.addEventListener('click', (event) => { if (event.target.id === 'integration-prompt') dismissIntegrationPrompt(); });
  const flip = () => { const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { window.localStorage.setItem('unidash-theme', n); } catch {} radar?.retheme(); };
  $('#theme-toggle').addEventListener('click', flip); $('#theme-toggle-m').addEventListener('click', flip);
}

/* ======================= BOOT ======================= */
function boot() {
  const screen = $('#boot-screen');
  let finished = false;
  const hasBooted = () => { try { return window.sessionStorage.getItem('unidash-booted') === '1'; } catch { return false; } };
  const finish = () => { if (finished) return; finished = true; screen.classList.add('done'); try { window.sessionStorage.setItem('unidash-booted', '1'); } catch {} setTimeout(FX.markBooted, reduced ? 0 : 250); };
  if (reduced || hasBooted() || location.search.includes('noboot')) { finish(); return; }
  const lines = [
    ['AMS · sample data', 'PREVIEW'], ['Moodle · sample data', 'PREVIEW'], ['WhatsApp', 'DEFERRED'],
    ['Change detection', 'PREVIEW'], ['Reminders · queue', 'PREVIEW'], ['Radar', 'ready'],
  ];
  const ol = $('#boot-lines'), bar = $('#boot-progress');
  lines.forEach(([a, b], i) => setTimeout(() => { ol.insertAdjacentHTML('beforeend', `<li><span>${a}</span><b>${b}</b></li>`); bar.style.width = ((i + 1) / lines.length) * 100 + '%'; }, 160 + i * 190));
  const t = setTimeout(finish, 160 + lines.length * 190 + 350);
  screen.addEventListener('click', () => { clearTimeout(t); finish(); });
  window.addEventListener('keydown', function k(e) { if (e.key === 'Enter') { clearTimeout(t); finish(); window.removeEventListener('keydown', k); } });
}

buildShell();
void refreshIntegrationChips();
void refreshPersistedEvents();
FX.init();

function eventDataNotice() {
  const fileStatus = storageMode === 'connected' ? 'Google Drive files are live' : storageMode === 'unconnected' ? 'Google Drive is not connected' : 'Drive file status has not been loaded';
  const message = eventDataMode === 'live'
    ? `Saved UniDash events are loaded. ${fileStatus}; projects use saved data when signed in. Attendance and feed still need live sources.`
    : eventDataMode === 'loading'
      ? 'Loading saved events · sample preview is shown temporarily.'
      : 'Sample preview only · saved events could not be loaded. AMS and Moodle data are not connected.';
  return `<div class="data-mode-note" role="status">${message}</div>`;
}

function updatePreviewPill() {
  const pill = $('#preview-pill');
  if (!pill) return;
  if (eventDataMode === 'live' && integrationDataMode === 'live') {
    pill.textContent = 'PARTIAL';
    pill.title = `Saved events, settings, integration status, and projects load from your account. ${storageMode === 'connected' ? 'Google Drive files are live.' : 'Drive files are not connected.'} Attendance and activity still use preview data.`;
  } else if (eventDataMode === 'live') {
    pill.textContent = 'EVENTS LIVE';
    pill.title = `Saved events, settings, and projects load from your account. ${storageMode === 'connected' ? 'Google Drive files are live.' : 'Drive files are not connected.'} Attendance and activity still use preview data; connection status is unavailable.`;
  } else if (integrationDataMode === 'live') {
    pill.textContent = 'STATUS LIVE';
    pill.title = 'Integration status is live. Academic events could not be loaded, so the dashboard shows sample preview data.';
  } else {
    pill.textContent = eventDataMode === 'loading' || integrationDataMode === 'loading' ? 'LOADING' : 'PREVIEW';
    pill.title = eventDataMode === 'loading'
      ? 'Preview data is shown while saved events load.'
      : 'Saved events could not be loaded. The dashboard is showing sample preview data.';
  }
}

function mapPersistedEvent(item) {
  return {
    id: item.id,
    label: item.label || undefined,
    title: item.title,
    description: item.description || undefined,
    kind: item.kind,
    subject: item.subjectCode || null,
    source: item.source,
    status: item.status,
    start: new Date(item.startsAt),
    end: item.endsAt ? new Date(item.endsAt) : undefined,
    isDeadline: item.isDeadline,
    isAllDay: item.isAllDay,
    venue: item.venue || undefined,
    syllabus: item.syllabus || undefined,
    weight: item.weightagePct ?? undefined,
    maxMarks: item.maxMarks ?? undefined,
    lockedFields: item.lockedFields || [],
    submission: item.submissionState === 'UNKNOWN' ? undefined : item.submissionState,
    progress: item.progress,
    updatedAt: item.updatedAt,
    hiddenAt: item.hiddenAt || null,
    hidden: Boolean(item.hiddenAt),
    persisted: true,
  };
}

function istDateTimeInputValue(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((value) => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function istDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function showManualEventError(message) {
  const error = $('#event-form-error');
  error.textContent = message || '';
  error.hidden = !message;
}

function openManualEventDialog(eventId = null) {
  if (!csrfToken) {
    toast('Sign in again to add a saved event.');
    return;
  }
  const dialog = $('#event-dialog');
  const form = $('#event-form');
  const existing = eventId ? events.find((event) => event.id === eventId && event.persisted) : null;
  if (eventId && !existing) { toast('This event is no longer available. Refresh and try again.'); return; }
  manualEventEditingId = existing?.id || null;
  form.reset();
  showManualEventError('');
  const set = (name, value) => { form.elements.namedItem(name).value = value ?? ''; };
  if (existing) {
    set('title', existing.title);
    set('kind', existing.kind);
    set('label', existing.label);
    set('subjectCode', existing.subject);
    set('startsAt', istDateTimeInputValue(existing.start));
    set('endsAt', existing.end ? istDateTimeInputValue(existing.end) : '');
    set('venue', existing.venue);
    set('syllabus', existing.syllabus);
    set('weightagePct', existing.weight);
    set('maxMarks', existing.maxMarks);
    set('description', existing.description);
    form.elements.namedItem('isDeadline').checked = Boolean(existing.isDeadline);
    form.elements.namedItem('isAllDay').checked = Boolean(existing.isAllDay);
    closeSheet();
  } else {
    set('startsAt', istDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  }
  $('[data-event-submit]').textContent = existing ? 'Save changes' : 'Save event';
  dialog.showModal();
  form.elements.namedItem('title').focus();
}

async function saveManualEvent(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  if (!form.reportValidity()) return;
  if (!csrfToken || manualEventSaving) return;

  const data = new FormData(form);
  const startsAt = istDateTimeToIso(data.get('startsAt'));
  const endsAt = istDateTimeToIso(data.get('endsAt'));
  if (!startsAt || (data.get('endsAt') && !endsAt)) {
    showManualEventError('Enter a valid start and end time.');
    return;
  }
  if (endsAt && new Date(endsAt) < new Date(startsAt)) {
    showManualEventError('End time must be on or after start time.');
    return;
  }
  const optionalNumber = (field) => {
    const value = String(data.get(field) || '').trim();
    return value ? Number(value) : null;
  };
  const body = {
    title: String(data.get('title') || '').trim(),
    kind: String(data.get('kind') || 'OTHER'),
    label: String(data.get('label') || '').trim() || null,
    subjectCode: String(data.get('subjectCode') || '').trim() || null,
    startsAt,
    endsAt,
    isDeadline: data.has('isDeadline'),
    isAllDay: data.has('isAllDay'),
    venue: String(data.get('venue') || '').trim() || null,
    syllabus: String(data.get('syllabus') || '').trim() || null,
    description: String(data.get('description') || '').trim() || null,
    weightagePct: optionalNumber('weightagePct'),
    maxMarks: optionalNumber('maxMarks'),
  };
  const editingEvent = manualEventEditingId ? events.find((event) => event.id === manualEventEditingId) : null;
  if (manualEventEditingId && (!editingEvent || !editingEvent.updatedAt)) {
    showManualEventError('This event needs a refresh before it can be edited.');
    return;
  }
  let requestBody = body;
  if (editingEvent) {
    const original = {
      title: editingEvent.title,
      kind: editingEvent.kind,
      label: editingEvent.label || null,
      subjectCode: editingEvent.subject || null,
      startsAt: istDateTimeInputValue(editingEvent.start),
      endsAt: editingEvent.end ? istDateTimeInputValue(editingEvent.end) : null,
      isDeadline: Boolean(editingEvent.isDeadline),
      isAllDay: Boolean(editingEvent.isAllDay),
      venue: editingEvent.venue || null,
      syllabus: editingEvent.syllabus || null,
      description: editingEvent.description || null,
      weightagePct: editingEvent.weight ?? null,
      maxMarks: editingEvent.maxMarks ?? null,
    };
    const comparable = { ...body, startsAt: String(data.get('startsAt')), endsAt: String(data.get('endsAt') || '') || null };
    requestBody = Object.fromEntries(Object.entries(body).filter(([key]) => comparable[key] !== original[key]));
    if (!Object.keys(requestBody).length) {
      showManualEventError('There are no changes to save.');
      return;
    }
  }
  const serialized = JSON.stringify(requestBody);
  if (!editingEvent && (!pendingManualEventRequest || pendingManualEventRequest.body !== serialized)) {
    pendingManualEventRequest = { body: serialized, key: crypto.randomUUID() };
  }

  manualEventSaving = true;
  showManualEventError('');
  const submit = $('[data-event-submit]');
  const cancelButtons = $$('#event-dialog [data-event-cancel]');
  submit.disabled = true;
  submit.textContent = 'Saving…';
  cancelButtons.forEach((button) => { button.disabled = true; });
  try {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
    if (editingEvent) headers['If-Match'] = editingEvent.updatedAt;
    else headers['Idempotency-Key'] = pendingManualEventRequest.key;
    const response = await fetch(editingEvent ? `/api/v1/events/${encodeURIComponent(editingEvent.id)}` : '/api/v1/events', {
      method: editingEvent ? 'PATCH' : 'POST',
      credentials: 'same-origin',
      headers,
      body: serialized,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error?.message || 'Could not save this event. Try again.');
    if (!payload?.item || payload.item.source !== 'MANUAL' || !payload.item.id) throw new Error('The saved event response was invalid. Retry to check the saved result.');

    const created = mapPersistedEvent(payload.item);
    if (Number.isNaN(created.start.getTime()) || !kinds[created.kind]) throw new Error('The saved event response was invalid. Retry to check the saved result.');
    events = [...events.filter((event) => event.id !== created.id), created].sort((a, b) => a.start - b.start);
    eventDataMode = 'live';
    pendingManualEventRequest = null;
    manualEventEditingId = null;
    updatePreviewPill();
    $('#event-dialog').close();
    render();
    toast(`${editingEvent ? 'Updated' : 'Saved'} “${created.title}”`);
  } catch (error) {
    showManualEventError(error instanceof Error ? error.message : 'Could not save this event. Try again.');
  } finally {
    manualEventSaving = false;
    submit.disabled = false;
    submit.textContent = manualEventEditingId ? 'Save changes' : 'Save event';
    cancelButtons.forEach((button) => { button.disabled = false; });
  }
}

async function refreshPersistedEvents() {
  try {
    const settingsResponse = await fetch('/api/v1/settings', { cache: 'no-store', credentials: 'same-origin' });
    if (!settingsResponse.ok) throw new Error('Saved settings are unavailable.');
    const settings = await settingsResponse.json();
    if (typeof settings.csrfToken !== 'string' || typeof settings.attendanceThreshold !== 'number') throw new Error('Saved settings response is invalid.');
    csrfToken = settings.csrfToken;
    user.threshold = settings.attendanceThreshold;

    const items = [];
    const seenCursors = new Set();
    let cursor = null;
    do {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/v1/events?${query}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Saved events are unavailable.');
      const payload = await response.json();
      if (!Array.isArray(payload.items) || !(payload.nextCursor === null || typeof payload.nextCursor === 'string')) throw new Error('Saved events response is invalid.');
      items.push(...payload.items);
      cursor = payload.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw new Error('Saved event pagination repeated a cursor.');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    const mapped = items.filter((item) => item.source !== 'WHATSAPP').map(mapPersistedEvent);
    if (mapped.some((event) => Number.isNaN(event.start.getTime()) || !kinds[event.kind])) throw new Error('Saved event data is invalid.');
    events = mapped;
    eventDataMode = 'live';
  } catch {
    eventDataMode = 'preview';
  }
  updatePreviewPill();
  render();
}

async function refreshHiddenEvents() {
  try {
    const items = [];
    const seenCursors = new Set();
    let cursor = null;
    do {
      const query = new URLSearchParams({ limit: '100', visibility: 'hidden' });
      if (cursor) query.set('cursor', cursor);
      const response = await fetch(`/api/v1/events?${query}`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Hidden events are unavailable.');
      const payload = await response.json();
      if (!Array.isArray(payload.items) || !(payload.nextCursor === null || typeof payload.nextCursor === 'string')) throw new Error('Hidden event response is invalid.');
      items.push(...payload.items);
      cursor = payload.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw new Error('Hidden event pagination repeated a cursor.');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    const mapped = items.filter((item) => item.source !== 'WHATSAPP').map(mapPersistedEvent);
    if (mapped.some((event) => !event.hidden || Number.isNaN(event.start.getTime()) || !kinds[event.kind])) throw new Error('Hidden event data is invalid.');
    hiddenEvents = mapped;
    hiddenEventsMode = 'ready';
  } catch {
    hiddenEventsMode = 'error';
  }
  if (showHiddenEvents && current === 'deadlines') render();
}

async function setSourceEventHidden(eventId, hidden) {
  const sourceEvents = hidden ? events : hiddenEvents;
  const event = sourceEvents.find((item) => item.id === eventId && item.persisted && item.source !== 'MANUAL');
  if (!event) { toast('This source event is no longer available. Refresh and try again.'); return; }
  if (!csrfToken || !event.updatedAt) { toast('Could not verify this change. Refresh and try again.'); return; }
  try {
    const response = await fetch(`/api/v1/events/${encodeURIComponent(event.id)}/visibility`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'If-Match': event.updatedAt },
      body: JSON.stringify({ hidden }),
    });
    if (response.status === 409) {
      toast('This event changed elsewhere. Refreshing saved data.');
      await refreshPersistedEvents();
      hiddenEventsMode = 'idle';
      return;
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || 'Could not update event visibility.');
    if (result?.hidden !== hidden || typeof result.updatedAt !== 'string') throw new Error('The visibility response was invalid.');
    const changed = { ...event, hidden, hiddenAt: result.hiddenAt, updatedAt: result.updatedAt };
    if (hidden) {
      events = events.filter((item) => item.id !== event.id);
      hiddenEvents = [...hiddenEvents.filter((item) => item.id !== event.id), changed];
      hiddenEventsMode = 'ready';
      closeSheet();
    } else {
      hiddenEvents = hiddenEvents.filter((item) => item.id !== event.id);
      events = [...events.filter((item) => item.id !== event.id), changed].sort((a, b) => a.start - b.start);
    }
    eventDataMode = 'live';
    updatePreviewPill();
    render();
    toast(hidden ? `Hidden “${event.title}”` : `Restored “${event.title}”`);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not update event visibility.');
  }
}

async function deleteManualEvent(eventId) {
  const event = events.find((item) => item.id === eventId && item.persisted && item.source === 'MANUAL');
  if (!event) { toast('This event is no longer available. Refresh and try again.'); return; }
  if (!csrfToken || !event.updatedAt) { toast('Could not verify the delete. Refresh and try again.'); return; }
  if (!window.confirm(`Delete “${event.title}” from your UniDash calendar?`)) return;
  try {
    const response = await fetch(`/api/v1/events/${encodeURIComponent(event.id)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken, 'If-Match': event.updatedAt },
    });
    if (response.status === 409) {
      toast('This event changed elsewhere. Refreshing saved data.');
      await refreshPersistedEvents();
      return;
    }
    if (!response.ok) throw new Error('Could not delete this event.');
    events = events.filter((item) => item.id !== event.id);
    closeSheet();
    render();
    toast(`Deleted “${event.title}”`);
  } catch {
    toast('Could not delete this event. Try again.');
  }
}

async function savePersistedProgress(event, progress) {
  if (!csrfToken || !event.updatedAt) { toast('Could not verify the update. Refresh and try again.'); return; }
  try {
    const response = await fetch(`/api/v1/events/${encodeURIComponent(event.id)}/progress`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'If-Match': event.updatedAt },
      body: JSON.stringify({ progress }),
    });
    if (response.status === 409) { toast('This event changed elsewhere. Refreshing saved data.'); await refreshPersistedEvents(); return; }
    if (!response.ok) throw new Error('Could not save progress.');
    const result = await response.json();
    if (result.progress !== progress || typeof result.updatedAt !== 'string') throw new Error('Progress response is invalid.');
    const previous = event.progress;
    event.progress = result.progress;
    event.updatedAt = result.updatedAt;
    closeSheet();
    render();
    toast(progress === 'DONE' ? `Marked “${event.title}” done` : `Progress → ${progress.replace('_', ' ').toLowerCase()}`, () => { void savePersistedProgress(event, previous); });
  } catch {
    toast('Could not save progress. Try again.');
  }
}

async function refreshIntegrationChips() {
  const chips = $$('#sync-chips [data-sync]');
  const labels = {
    NOT_CONNECTED: 'OFF',
    READY: 'READY',
    SYNCING: 'SYNCING',
    NEEDS_REAUTH: 'REAUTH',
    PAUSED: 'PAUSED',
    ERROR: 'ERROR',
  };

  try {
    const response = await fetch('/api/v1/integrations', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Connection status is unavailable.');
    const payload = await response.json();
    if (!Array.isArray(payload.items)) throw new Error('Connection status is unavailable.');
    integrationDataMode = 'live';
    integrationStatuses = Object.fromEntries(payload.items.map((item) => [item.kind, item]));

    for (const chip of chips) {
      const integration = payload.items.find((item) => item.kind === chip.dataset.sync);
      if (!integration || !Object.hasOwn(labels, integration.status)) throw new Error('Connection status is unavailable.');
      chip.dataset.status = integration.status;
      chip.querySelector('b').textContent = labels[integration.status];
      chip.title = integration.lastErrorMessage || `${srcName(integration.kind)} · ${integration.status.replaceAll('_', ' ').toLowerCase()}`;
    }
    $$('[data-integration-status]').forEach((element) => {
      const integration = integrationStatuses[element.dataset.integrationStatus];
      element.textContent = integration?.status?.replaceAll('_', ' ') || 'UNKNOWN';
      const disconnect = $('[data-moodle-disconnect]');
      if (disconnect) disconnect.hidden = !integrationStatuses.MOODLE?.connected;
    });
    maybePromptForIntegrations();
  } catch {
    integrationDataMode = 'preview';
    for (const chip of chips) {
      chip.dataset.status = 'UNAVAILABLE';
      chip.querySelector('b').textContent = 'UNAVAILABLE';
      chip.title = 'Could not load the connection status. Refresh to try again.';
    }
  }
  updatePreviewPill();
}

function maybePromptForIntegrations() {
  const dialog = $('#integration-prompt');
  if (!dialog || dialog.open || integrationPromptDismissed || integrationDataMode !== 'live') return;
  if (['AMS', 'MOODLE'].some((kind) => !integrationStatuses[kind]?.connected)) dialog.showModal();
}

function dismissIntegrationPrompt() {
  const dialog = $('#integration-prompt');
  if (dialog?.open) dialog.close();
  integrationPromptDismissed = true;
}

function openPortalConnections() {
  dismissIntegrationPrompt();
  // Trigger both trusted MITS tabs directly from the user's click.
  if (!integrationStatuses.MOODLE?.connected) window.open('https://moodle.mitsweb.in/login/index.php', '_blank', 'noopener,noreferrer');
  if (!integrationStatuses.AMS?.connected) window.open('https://ams.mitsgwalior.in/login', '_blank', 'noopener,noreferrer');
  go('more');
}
bindGlobal();
boot();
render();
const driveCallbackResult = new URLSearchParams(location.search).get('drive');
if (driveCallbackResult) {
  const messages = { connected: 'Google Drive connected. Your files are ready.', denied: 'Google Drive connection was cancelled.', invalid: 'Google Drive connection could not be verified. Please retry.', 'setup-required': 'Google Drive setup is incomplete on the server.', 'token-failed': 'Google authorization did not return the required Drive access.', 'profile-failed': 'Google did not return a verified account email.', 'drive-setup-failed': 'UniDash could not create its folder in Google Drive.' };
  toast(messages[driveCallbackResult] || 'Google Drive connection did not complete.');
  history.replaceState(null, '', location.pathname + location.hash);
}
