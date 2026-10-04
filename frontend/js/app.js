/* =========================================================================
   UniDash — front-end prototype controller
   Hash routes: #radar #exams #deadlines #calendar #projects #attendance
                #files #whatsapp  (plus ?focus=<eventId> handled in-app)
   Account records are loaded from the signed-in UniDash APIs.
   ========================================================================= */
import * as DATA from './data.js';
import { createRadar } from './radar3d.js';
import * as FX from './fx.js';

const { subjects, kinds, events, attendance, feed, files, inbox, folders, projects, presentationSteps, waPeople, waMessages, waGroup, integrations, timetable, user, at, now } = DATA;
// This is a signed-in dashboard: clear all prototype records before painting.
for (const rows of [subjects, events, attendance, feed, files, inbox, projects, waPeople, waMessages, integrations, timetable]) rows.splice(0);
let csrfToken = '';
let driveConnected = false;
let portalBridgeState = 'checking';
let portalScanProgress = '';
let portalScanResult = null;
let portalImportStatus = '';
let attendanceScanInFlight = '';
let pendingPortalScanResult = null;
let portalRequestId = 0;
const portalRequests = new Map();
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const message = event.data;
  if (!message || !['response', 'event'].includes(message.unidash)) return;
  if (message.unidash === 'response') { const pending = portalRequests.get(message.id); if (!pending) return; clearTimeout(pending.timer); portalRequests.delete(message.id); pending.resolve(message); return; }
  if (message.type === 'BRIDGE_READY') portalBridgeState = 'connected';
  if (message.type === 'SCAN_PROGRESS') portalScanProgress = `${message.label || message.portal}: ${message.hint || message.stage}${message.error ? ` — ${message.error}` : ''}`;
  if (message.type === 'SCAN_RESULT') { portalScanResult = message.result; portalScanProgress = ''; void importTrustedScan(message.result); }
  updatePortalBridgeUI();
});
function portalBridgeRequest(type, extra = {}, timeoutMs = 3000) { return new Promise((resolve) => { const id = `web_${Date.now()}_${++portalRequestId}`; const timer = setTimeout(() => { portalRequests.delete(id); resolve({ ok: false, error: 'Portal Bridge is not paired with this site.' }); }, timeoutMs); portalRequests.set(id, { resolve, timer }); window.postMessage({ unidash: 'request', id, type, ...extra }, location.origin); }); }
function updatePortalBridgeUI() {
  const status = $('[data-bridge-status]'); if (!status) return;
  status.textContent = portalScanProgress || (portalBridgeState === 'connected' ? 'Extension connected' : portalBridgeState === 'checking' ? 'Checking extension…' : 'Extension not connected');
  const scan = $('[data-bridge-scan]'); if (scan) scan.disabled = portalBridgeState !== 'connected' || Boolean(portalScanProgress);
  const report = $('[data-bridge-report]');
  if (report && portalScanResult) { const rows = (portalScanResult.reports || []).map((item) => { const attendanceSection = Object.entries(item.sections || {}).find(([name]) => /attendance/i.test(name)); const attendanceRows = attendanceSection ? (item.records || []).filter((record) => record.type === 'attendance' && record.section === attendanceSection[0]).length : 0; const attendanceState = attendanceSection ? ` · attendance ${attendanceSection[1].ok ? 'read' : 'incomplete'} (${attendanceRows}/${attendanceSection[1].count})` : ''; return `<li>${esc(item.label || item.source)}: ${Number(item.recordCount || item.records?.length || 0)} records · ${item.trusted ? 'trusted' : 'review needed'}${item.source === 'ams' ? attendanceState : ''}</li>`; }).join(''); report.innerHTML = `<p class="muted">Last browser-local scan: ${esc(new Date(portalScanResult.finishedAt).toLocaleString())}</p><ul>${rows || '<li>No portal records were returned.</li>'}</ul>${portalImportStatus ? `<p class="muted" role="status">${esc(portalImportStatus)}</p>` : ''}`; }
}
function completeAttendanceSection(report) {
  if (report?.source !== 'ams') return false;
  const section = Object.entries(report.sections || {}).find(([name, value]) => /attendance/i.test(name) && value.ok);
  if (!section) return false;
  const rows = (report.records || []).filter((record) => record.type === 'attendance' && record.section === section[0]);
  return rows.length > 0 && rows.length === section[1].count;
}
function hasOnlyUnrelatedSectionWarnings(report) {
  // Trust the independently complete attendance section even when unrelated
  // scan sections (such as the academic calendar) need review.
  return completeAttendanceSection(report);
}
function recoverPortalAttendance(result) {
  const report = (result?.reports || []).find((item) => completeAttendanceSection(item) && (item.trusted || hasOnlyUnrelatedSectionWarnings(item)));
  if (attendance.length || !report || !result.scanId) return;
  if (!csrfToken) { pendingPortalScanResult = result; return; }
  if (attendanceScanInFlight === result.scanId) return;
  attendanceScanInFlight = result.scanId;
  void importTrustedScan(result);
}
async function checkPortalBridge() {
  const result = await portalBridgeRequest('PING'); portalBridgeState = result.ok ? 'connected' : 'missing';
  const last = await portalBridgeRequest('GET_LAST');
  if (last.ok) {
    portalScanResult = last.lastResult;
    recoverPortalAttendance(portalScanResult);
  }
  updatePortalBridgeUI();
}
async function startPortalScan() { if (portalBridgeState !== 'connected') return; portalScanProgress = 'Starting your manual scan…'; updatePortalBridgeUI(); const result = await portalBridgeRequest('SCAN_START', {}, 5000); if (!result.ok) { portalScanProgress = ''; toast(result.error || 'Could not start the scan.'); updatePortalBridgeUI(); } }
async function importTrustedScan(result) {
  if (!csrfToken) { pendingPortalScanResult = result; return; }
  portalImportStatus = 'Saving the scan report…'; updatePortalBridgeUI();
  const scanResponse = await fetch('/api/v1/integrations/scan', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(result) });
  const scanPayload = await scanResponse.json().catch(() => ({}));
  if (!scanResponse.ok) { portalImportStatus = scanPayload?.error?.message || 'Could not save the portal scan report.'; updatePortalBridgeUI(); toast(portalImportStatus); return; }
  portalImportStatus = 'Scan report saved. Importing attendance…'; updatePortalBridgeUI();
  let changed = 0;
  let attendanceSaved = false;
  let importFailed = false;
  for (const report of result?.reports || []) {
    if (report.source === 'ams') {
      const attendanceRecords = (report.records || []).filter((record) => record.type === 'attendance');
      if (attendanceRecords.length && (report.trusted || completeAttendanceSection(report))) {
        const response = await fetch('/api/v1/integrations/ams/attendance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ scanId: result.scanId }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { importFailed = true; portalImportStatus = payload?.error?.message || 'Could not save AMS attendance.'; toast(portalImportStatus); }
        else { attendanceSaved = true; portalImportStatus = `Attendance saved from ${attendanceRecords.length} AMS courses.`; toast(portalImportStatus); }
        updatePortalBridgeUI();
      }
    }
    if (!report.trusted) continue;
    let endpoint; let records = [];
    if (report.source === 'ams') {
      endpoint = '/api/v1/integrations/ams/import';
      records = (report.records || []).filter((record) => ['quiz', 'calendar_event'].includes(record.type)).map((record) => {
        const fields = record.fields || {}; const startsAt = fields['Starts at (IST)']; const endsAt = fields['Ends at (IST)'] || null;
        if (!record.key || !startsAt || Number.isNaN(Date.parse(startsAt)) || (endsAt && (Number.isNaN(Date.parse(endsAt)) || endsAt < startsAt))) return null;
        const isQuiz = record.type === 'quiz'; const courseCode = isQuiz ? String(fields.Course || '').match(/^\s*(\d{6,})\b/) : null;
        return { sourceRef: record.key, title: String(record.title || '').trim(), description: isQuiz ? [fields.Course && `Course: ${fields.Course}`, fields.Deadline && `Deadline: ${fields.Deadline}`, fields.Duration && `Duration: ${fields.Duration}`, fields.Questions && `Questions: ${fields.Questions}`, fields.Marks && `Marks: ${fields.Marks}`].filter(Boolean).join('\n') || null : null, kind: isQuiz ? 'QUIZ' : 'OTHER', subjectCode: courseCode?.[1] || null, startsAt, endsAt, isDeadline: isQuiz, isAllDay: !isQuiz };
      }).filter(Boolean);
    } else if (report.source === 'moodle') {
      endpoint = '/api/v1/integrations/moodle/import';
      records = (report.records || []).filter((record) => record.type === 'deadline' && /^moodle:event:\d+$/.test(record.key || '') && Number.isFinite(Date.parse(record.fields?.['Due at'] || ''))).map((record) => ({ sourceRef: record.key, title: String(record.title || '').trim(), description: record.fields.Type ? `Type: ${record.fields.Type}` : null, kind: /quiz/i.test(record.fields.Type || '') ? 'QUIZ' : 'ASSIGNMENT', subjectCode: String(record.fields.Course || '').match(/^\s*(\d{6,})\b/)?.[1] || null, startsAt: new Date(record.fields['Due at']).toISOString() }));
    } else continue;
    if (!records.length) continue;
    const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(report.source === 'ams' ? { source: 'AMS', trusted: true, records } : { trusted: true, records }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { importFailed = true; toast(payload?.error?.message || `Could not import ${report.source} scan records.`); continue; }
    changed += Number(payload.created || 0) + Number(payload.updated || 0);
  }
  if (changed) toast(`Saved ${changed} portal item${changed === 1 ? '' : 's'} to your dashboard.`);
  if (!importFailed && !attendanceSaved && !changed) portalImportStatus = 'Scan saved, but no complete attendance section was available to import.';
  updatePortalBridgeUI();
  if (!importFailed && (attendanceSaved || changed)) setTimeout(() => location.reload(), 800);
}
function makeSubject(code, name = code, color = '#ffb000') { const safeCode = String(code || ''); const safeName = String(name || safeCode); return { id: safeCode, code: esc(safeCode), name: esc(safeName), short: esc(safeName), faculty: '', color: /^#[\da-f]{6}$/i.test(color) ? color : '#ffb000', credits: 0 }; }
function mappedEvent(item) {
  return { id: item.id, label: item.label || undefined, title: item.title, description: item.description || '', kind: item.kind, subject: item.subjectCode || null, source: item.source, radarMarker: item.source === 'MANUAL' ? 'SWORD' : null, status: item.status, start: new Date(item.startsAt), end: item.endsAt ? new Date(item.endsAt) : undefined, isDeadline: item.isDeadline, isAllDay: item.isAllDay, venue: item.venue || '', syllabus: item.syllabus || '', weight: item.weightagePct ?? 0, maxMarks: item.maxMarks ?? null, progress: item.progress, updatedAt: item.updatedAt, persisted: true };
}
async function loadAccountData() {
  const request = async (url) => { const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw new Error(`Could not load account data (${response.status}).`); return response.json(); };
  try {
    const [settings, eventResult, attendanceResult, projectResult, feedResult, integrationResult, fileResult, subjectResult, me] = await Promise.all([
      request('/api/v1/settings'), request('/api/v1/events?limit=100'), request('/api/v1/attendance/summary'), request('/api/v1/projects'), request('/api/v1/feed?limit=20'), request('/api/v1/integrations'), request('/api/v1/storage/files?folderId=root'), request('/api/v1/subjects?active=true'), request('/api/v1/auth/me'),
    ]);
    csrfToken = settings.csrfToken; user.threshold = settings.attendanceThreshold;
    let savedAttendance = (attendanceResult.items || []).filter((row) => !/^Course\s+\d+$/i.test(String(row.subjectName || '').trim()));
    if (!savedAttendance.length) {
      try {
        const scanHistory = await request('/api/v1/integrations/scan');
        const priorAmsScan = (scanHistory.items || []).find((scan) => scan.source === 'AMS' && scan.report?.records?.some((record) => record.type === 'attendance'));
        if (priorAmsScan) {
          const response = await fetch('/api/v1/integrations/ams/attendance', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ scanId: priorAmsScan.scanId }) });
        if (response.ok) savedAttendance = ((await request('/api/v1/attendance/summary')).items || []).filter((row) => !/^Course\s+\d+$/i.test(String(row.subjectName || '').trim()));
        }
      } catch (error) { console.warn('Could not restore attendance from a saved AMS scan.', error); }
    }
    user.name = me.name || me.email || '';
    const avatar = $('.rail-avatar'); if (avatar) { avatar.textContent = user.name ? user.name.trim().slice(0, 2).toUpperCase() : 'U'; avatar.title = user.name ? `Signed in as ${user.name}` : 'Signed-in account'; }
    const palette = ['#ffb000', '#3ec7ff', '#c8ff4d', '#ff6fb5', '#a78bfa', '#e8d5b0'];
    for (const [index, row] of subjectResult.items.filter((item) => !/^Course\s+\d+$/i.test(String(item.name || '').trim())).entries()) subjects.push({ ...makeSubject(row.code || row.id, row.name, row.color || palette[index % palette.length]), id: row.code || row.id, apiId: row.id, faculty: row.facultyName || '' });
    for (const [index, row] of savedAttendance.entries()) { const code = row.subjectCode || row.subjectId; subjects.push({ ...makeSubject(code, row.subjectName || code, palette[index % palette.length]), id: code, code: esc(row.subjectCode || ''), faculty: '' }); attendance.push({ subject: code, a: row.attended, t: row.total, asOf: row.asOf, source: row.source, trend: Array(6).fill(row.percentage) }); }
    for (let index = subjects.length - 1; index >= 0; index--) { if (subjects.findIndex((row) => row.id === subjects[index].id) !== index) subjects.splice(index, 1); }
    const eventRows = [...(eventResult.items || [])];
    let eventCursor = eventResult.nextCursor || null;
    let pageCount = 0;
    while (eventCursor && pageCount < 50) { const page = await request(`/api/v1/events?limit=100&cursor=${encodeURIComponent(eventCursor)}`); eventRows.push(...(page.items || [])); eventCursor = page.nextCursor || null; pageCount++; }
    for (const item of eventRows) if (item.subjectCode && !subjects.some((s) => s.id === item.subjectCode)) subjects.push(makeSubject(item.subjectCode));
    events.push(...eventRows.map(mappedEvent).filter((item) => !Number.isNaN(item.start.getTime())));
    feed.push(...(feedResult.items || []).map((item) => ({ id: item.id, source: item.source, title: item.title || item.kind.replaceAll('_', ' ').toLowerCase(), body: item.body || '', time: new Date(item.createdAt), severity: item.severity || 'INFO', unread: !item.readAt })));
    projects.push(...(projectResult.items || []).map((item) => ({ id: item.id, type: item.type, subject: subjects.find((s) => s.apiId === item.subjectId)?.id || null, title: item.title, status: item.status, due: item.deadlineAt ? new Date(item.deadlineAt) : null, venue: esc(item.venue || ''), duration: esc(item.duration || ''), team: (item.team || []).map(esc), blockedBy: item.blockedBy ? esc(item.blockedBy) : '', updatedAt: item.updatedAt, tasks: (item.tasks || []).map((task) => ({ t: task.title, done: task.done })), milestones: (item.milestones || []).filter((m) => m.dueAt).map((m) => ({ t: esc(m.title), d: new Date(m.dueAt), done: m.done })) })));
    integrations.push(...(integrationResult.items || []).map((item) => ({ ...item, kind: item.kind, status: item.status, last: item.lastSuccessAt ? new Date(item.lastSuccessAt) : new Date(), tier: item.connected ? 'Connected' : 'Not connected', every: 0 })));
    driveConnected = Boolean(fileResult.storage?.connected);
    subjects.push(makeSubject('Drive', 'Drive', '#3ec7ff'));
    files.push(...(fileResult.items || []).map((item) => ({ id: item.id, name: item.name, type: (item.name.split('.').pop() || '').toLowerCase(), size: `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`, subject: subjects.find((subject) => subject.apiId === item.subjectId)?.id || 'Drive', folder: 'Drive', source: item.source || 'MANUAL', added: new Date(item.createdAt), isNew: false, tags: item.tags || [] })));
    render();
    if (pendingPortalScanResult) { const pending = pendingPortalScanResult; pendingPortalScanResult = null; recoverPortalAttendance(pending); }
  } catch (error) { console.error('UniDash account data could not be loaded.', error); render(); toast(error instanceof Error ? error.message : 'Could not load your saved data.'); }
}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const ic = (n) => `<i data-lucide="${n}"></i>`;
const subj = (id) => subjects.find((s) => s.id === id);
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
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return { n: '—', u: 'NO DATE' };
  const h = hoursLeft(d);
  if (h < 0) return { n: Math.round(-h) + 'h', u: 'OVERDUE' };
  if (h < 1) return { n: Math.round(h * 60) + 'm', u: 'LEFT' };
  if (h < 48) return { n: Math.floor(h) + 'h' + String(Math.floor((h % 1) * 60)).padStart(2, '0'), u: 'LEFT' };
  return { n: Math.ceil(h / 24), u: 'DAYS' };
}

/* ---------- User-owned state (progress, dismissed proposals) ---------- */
const store = {};
store.progress ||= {}; store.proposals ||= {}; store.tracked ||= {}; store.tasks ||= {}; store.filed ||= {};
const save = () => {};
const progressOf = (e) => store.progress[e.id] || e.progress || 'NOT_STARTED';

/* ---------- Priority score (SPEC §10.3) ---------- */
function score(e) {
  const base = kinds[e.kind]?.base ?? 5;
  const h = hoursLeft(e.start);
  const done = progressOf(e) === 'DONE';
  const urgency = h < 0 && !done ? 120 : 100 * Math.exp(-Math.max(h, 0) / 72);
  return Math.round(base + urgency + Math.min(e.weight || 0, 30));
}
const isExam = (e) => ['MINOR_EXAM', 'MAJOR_EXAM', 'PRACTICAL_EXAM', 'VIVA'].includes(e.kind);
const isDeadline = (e) => !['CLASS', 'LAB_SESSION', 'HOLIDAY'].includes(e.kind) && !isExam(e);

/* ---------- Attendance maths (SPEC §10.8) ---------- */
const EPS = 1e-9;
const canSkip = (a, t, r) => r <= 0 ? null : Math.max(0, Math.floor(a / r - t + EPS));
const mustAttend = (a, t, r) => r >= 1 ? (a >= t ? 0 : null) : Math.max(0, Math.ceil((r * t - a) / (1 - r) - EPS));
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
const TABS = ['radar', 'calendar', 'files'];

function buildShell() {
  $('#rail-nav').innerHTML = NAV.map((n) => `<a class="rail-link" href="#${n.id}" data-view="${n.id}" aria-label="${n.label}">${ic(n.icon)}<span>${n.label}</span>${n.dot ? '<b class="dot"></b>' : ''}</a>`).join('');
  $('#tab-bar').innerHTML = TABS.map((id) => { const n = NAV.find((x) => x.id === id); return `<a class="tab-link" href="#${id}" data-view="${id}">${ic(n.icon)}<span>${n.label}</span>${n.dot ? '<b class="dot"></b>' : ''}</a>`; }).join('')
    + `<a class="tab-link" href="#more" data-view="more">${ic('layout-grid')}<span>More</span><b class="dot"></b></a>`;
  $('#sync-chips').innerHTML = ['AMS', 'MOODLE'].map((kind) => `<button class="sync-chip" type="button" data-sync="${kind}" title="Loading status"><i></i>${kind === 'MOODLE' ? 'Moodle' : 'AMS'} <b>…</b></button>`).join('');
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
          <span><i class="radar-sword-key" aria-hidden="true"></i>Added by you</span>
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
          return `<li class="next-up-item ${past ? 'past' : ''} ${isNow ? 'now' : ''}" style="--c:${c}" data-event="${e.id || ''}"><time>${fTime(e.start)}</time><div><div class="t">${esc(e.title)}</div><div class="m">${kinds[e.kind].label} · ${e.venue || 'Online'}${isNow ? ' · <b style="color:var(--accent)">happening now</b>' : ''}</div></div></li>`;
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
  if (a.proposals) return `<li class="attention-item" data-go="whatsapp" tabindex="0"><span class="stripe" style="background:var(--success)"></span><span class="kind-badge" style="color:var(--success)">${ic('message-circle-more')}</span><div class="body"><div class="title">${a.proposals} proposed events to review</div><div class="meta"><span class="chip src-WHATSAPP">WhatsApp</span>from tracked people</div></div><div class="countdown"><b>${ic('chevron-right')}</b></div></li>`;
  const e = a.e, s = subj(e.subject), k = kinds[e.kind], cd = countdown(e.start);
  return `<li class="attention-item ${a.critical ? 'critical' : ''}" data-event="${e.id}" tabindex="0"><span class="stripe" style="background:${s?.color || k.color}"></span><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><div class="body"><div class="title">${esc(e.title)}</div><div class="meta"><span class="chip src-${e.source}">${srcName(e.source)}</span>${a.moved ? `<span class="chip moved">↻ moved</span>` : ''}${a.critical ? '<span class="chip danger">Overdue</span>' : ''}${s ? s.code : ''}</div></div><div class="countdown"><b class="tabular">${cd.n}</b>${a.moved ? 'days' : cd.u.toLowerCase()}</div></li>`;
}
const srcName = (s) => ({ AMS: 'AMS', MOODLE: 'Moodle', WHATSAPP: 'WhatsApp', MANUAL: 'Manual', SYSTEM: 'System' }[s]);

function feedCard(f) {
  const unread = f.unread;
  return `<li class="feed-card ${f.severity === 'CRITICAL' ? 'critical' : ''} ${unread ? 'unread' : ''}" ${f.event ? `data-event="${f.event}"` : ''} tabindex="0">
    <div class="top"><span class="chip src-${f.source}">${srcName(f.source)}</span>${f.severity === 'CRITICAL' ? '<span class="chip danger">Critical</span>' : f.severity === 'IMPORTANT' ? '<span class="chip" style="color:var(--warning)">● Important</span>' : ''}<span>${relPast(f.time)}</span></div>
    <div class="title">${esc(f.title)}</div>
    ${f.before ? `<div class="before-after"><s>${f.before}</s>→<b>${f.after}</b></div>` : `<div class="body">${esc(f.body || '')}</div>`}
  </li>`;
}
function relPast(d) { const m = Math.round((now() - d) / 6e4); if (m < 60) return m + 'm ago'; if (m < 60 * 24) return Math.round(m / 60) + 'h ago'; return Math.round(m / 1440) + 'd ago'; }

function buildDay(offset) {
  const date = at(offset); const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(date, { weekday: 'short' }));
  const dateKey = istDateInput(date);
  const holiday = GOVT_HOLIDAYS_2026.find((item) => item.date === dateKey);
  const slots = holiday ? [] : (WEEKLY_CLASSES[dow] || []);
  const tt = slots.map((t) => ({ id: null, kind: t.kind, subject: null, title: t.title, description: t.faculty, start: at(offset, t.start), end: at(offset, t.end), venue: t.room, tt: true, code: t.code }));
  const ev = events.filter((e) => dayIdx(e.start) === offset);
  // Replace timetable slots that collide with a real event of same subject
  const merged = [...ev, ...tt.filter((t) => !ev.some((e) => e.subject === t.subject && Math.abs(e.start - t.start) < 2 * H))];
  if (holiday && !ev.some((item) => item.kind === 'HOLIDAY')) merged.push({ id: null, kind: 'HOLIDAY', title: holiday.name, description: 'Madhya Pradesh government holiday · 2026', start: at(offset), end: at(offset + 1), isAllDay: true, source: 'SYSTEM', status: 'CONFIRMED' });
  return merged.sort((a, b) => a.start - b.start);
}

// User-provided MITS timetable. These are recurring weekly class slots, not
// fabricated attendance or portal records; they repeat on every matching weekday.
const WEEKLY_CLASSES = {
  1: [
    { start: 11, end: 12, title: 'Cyber World and Security Concern', faculty: 'Dr. Kirti Raj Bhatele', room: 'Room 113B', code: 'CWSC', kind: 'CLASS' },
    { start: 12, end: 13, title: 'Engineering Mathematics-I', faculty: 'Dr. D. K. Mishra', room: 'Room 113B', code: 'ENGG MATHS', kind: 'CLASS' },
    { start: 14, end: 16, title: 'Micro Project-I', faculty: 'Prof. Mona Pandey Sharma + Dr. Pooja Mishra', room: 'Room PL2', code: 'MICRO PROJ-I', kind: 'LAB_SESSION' },
  ],
  2: [
    { start: 10, end: 12, title: 'Semester Proficiency', faculty: 'Dr. Rohit Agarwal + Dr. Manish Dixit', room: 'Room 113B', code: 'SEM PROF · BATCH B3', kind: 'CLASS' },
    { start: 12, end: 13, title: 'Emerging Technologies in Computer Science', faculty: 'Dr. Nishant Jain', room: 'Room 113B', code: 'ETCS', kind: 'CLASS' },
    { start: 14, end: 16, title: 'Language Lab', faculty: 'Dr. Sanjeev Khanna', room: 'Room 113B', code: 'LANG LAB · BATCH B3', kind: 'LAB_SESSION' },
    { start: 16, end: 17, title: 'Computer Programming', faculty: 'Prof. Yamini Richhariya', room: 'Room 113B', code: 'CP', kind: 'CLASS' },
  ],
  3: [
    { start: 11, end: 13, title: 'CS Foundation Lab (Digital Electronics Lab)', faculty: 'Dr. R. K. Gupta + Prof. Manisha Pathak', room: 'Room DCS Lab (IT)', code: 'DIG ELEC LAB · BATCH B3', kind: 'LAB_SESSION' },
    { start: 14, end: 15, title: 'Engineering Mathematics-I', faculty: 'Dr. D. K. Mishra', room: 'Room 113B', code: 'ENGG MATHS', kind: 'CLASS' },
    { start: 15, end: 16, title: 'Digital Electronics', faculty: 'Dr. R. K. Gupta', room: 'Room 113B', code: 'DIG ELEC', kind: 'CLASS' },
    { start: 16, end: 17, title: 'Computer Programming', faculty: 'Prof. Yamini Richhariya', room: 'Room 113B', code: 'CP', kind: 'CLASS' },
    { start: 17, end: 18, title: 'Emerging Technologies in Computer Science', faculty: 'Dr. Nishant Jain', room: 'Room 113B', code: 'ETCS', kind: 'CLASS' },
  ],
  4: [
    { start: 11, end: 13, title: 'Computer Programming Lab', faculty: 'Prof. Yamini Richhariya + Dr. Lalita Agrawal', room: 'Room PL1', code: 'CP LAB · BATCH B3', kind: 'LAB_SESSION' },
    { start: 14, end: 15, title: 'Engineering Mathematics-I', faculty: 'Dr. D. K. Mishra', room: 'Room 113B', code: 'ENGG MATHS', kind: 'CLASS' },
    { start: 15, end: 16, title: 'Digital Electronics', faculty: 'Dr. R. K. Gupta', room: 'Room 113B', code: 'DIG ELEC', kind: 'CLASS' },
    { start: 16, end: 17, title: 'Cyber World and Security Concern', faculty: 'Dr. Kirti Raj Bhatele', room: 'Room 113B', code: 'CWSC', kind: 'CLASS' },
  ],
  5: [
    { start: 10, end: 11, title: 'Emerging Technologies in Computer Science', faculty: 'Dr. Nishant Jain', room: 'Room 113B', code: 'ETCS', kind: 'CLASS' },
    { start: 11, end: 12, title: 'Digital Electronics', faculty: 'Dr. R. K. Gupta', room: 'Room 113B', code: 'DIG ELEC', kind: 'CLASS' },
    { start: 12, end: 13, title: 'Cyber World and Security Concern', faculty: 'Dr. Kirti Raj Bhatele', room: 'Room 113B', code: 'CWSC', kind: 'CLASS' },
  ],
};

// Mandatory holidays shown in the user's Madhya Pradesh government calendar
// reference for 2026. These are calendar dates, not invented account records.
const GOVT_HOLIDAYS_2026 = [
  ['2026-01-26', 'Republic Day'], ['2026-02-01', 'Sant Ravidas Jayanti'], ['2026-02-15', 'Maha Shivaratri'],
  ['2026-03-03', 'Holi'], ['2026-03-19', 'Gudi Padwa'], ['2026-03-20', 'Cheti Chand'], ['2026-03-21', 'Eid-ul-Fitr'],
  ['2026-03-27', 'Ram Navami'], ['2026-03-31', 'Mahavir Jayanti'], ['2026-04-03', 'Good Friday'],
  ['2026-04-14', 'Dr. B. R. Ambedkar Jayanti'], ['2026-04-20', 'Parshuram Jayanti'], ['2026-05-01', 'Buddha Purnima'],
  ['2026-05-27', 'Eid-ul-Zuha (Bakrid)'], ['2026-06-17', 'Maharana Pratap Jayanti / Chhatrasal Jayanti'], ['2026-06-26', 'Muharram'],
  ['2026-08-15', 'Independence Day'], ['2026-08-26', 'Milad-un-Nabi'], ['2026-08-28', 'Raksha Bandhan'],
  ['2026-09-04', 'Janmashtami'], ['2026-09-14', 'Ganesh Chaturthi'], ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-10-20', 'Dussehra (Vijayadashami)'], ['2026-10-26', 'Maharishi Valmiki Jayanti'], ['2026-11-08', 'Diwali (Deepavali)'],
  ['2026-11-09', 'Govardhan Puja'], ['2026-11-15', 'Janjatiya Gaurav Diwas'], ['2026-11-24', 'Guru Nanak Jayanti'],
  ['2026-12-25', 'Christmas Day'],
].map(([date, name]) => ({ date, name }));

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
    return `<div class="week-day ${d === 0 ? 'today' : ''}" title="${ev.map((e) => e.title).join('\n')}"><span class="dn">${fmt(date, { weekday: 'short' })}</span><span class="dd">${fmt(date, { day: 'numeric' })}</span><div class="pips">${ev.map((e) => `<i class="pip" style="background:${kinds[e.kind].color}${e.status === 'TENTATIVE' ? ';opacity:.5;background-image:repeating-linear-gradient(90deg,transparent 0 3px,rgba(0,0,0,.4) 3px 5px)' : ''}"></i>`).join('')}</div></div>`;
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
    .filter((e) => !['CLASS', 'LAB_SESSION', 'HOLIDAY'].includes(e.kind) && progressOf(e) !== 'DONE' && (hoursLeft(e.start) < 1440 || e.radarMarker === 'SWORD'))
    .map((e) => ({ id: e.id, kind: e.kind, subject: e.subject, title: e.title, color: e.radarMarker === 'SWORD' ? '#ffb000' : kinds[e.kind].color, customMarker: e.radarMarker, hoursLeft: hoursLeft(e.start), score: score(e), tentative: e.status === 'TENTATIVE', critical: hoursLeft(e.start) < 0, e }));
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
  $('#mark-read')?.addEventListener('click', async () => {
    const unreadItems = feed.filter((item) => item.unread);
    const results = await Promise.all(unreadItems.map(async (item) => { const response = await fetch(`/api/v1/feed/${encodeURIComponent(item.id)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ read: true }) }); if (!response.ok) return false; item.unread = false; return true; }));
    if (results.every(Boolean)) { $$('.feed-card.unread').forEach((card) => card.classList.remove('unread')); toast('Marked as read'); } else toast('Some items could not be marked as read.');
  });
}

/* ======================= VIEW: EXAMS ======================= */
let examFilter = 'all';
function viewExams() {
  const ex = events.filter(isExam).sort((a, b) => a.start - b.start);
  const SPAN = 60, PAD = 60, PXD = 46; // 46px per day → wide corridor, no label collisions
  const pos = (d) => `${PAD + (dayIdx(d) + 3 + (d.getTime() - at(dayIdx(d)).getTime()) / D) * PXD}px`;
  const corridorW = PAD * 2 + (SPAN + 3) * PXD;
  const shapeIcon = { MINOR_EXAM: 'diamond', MAJOR_EXAM: 'square', PRACTICAL_EXAM: 'circle', VIVA: 'triangle' };
  const ticks = Array.from({ length: SPAN / 3 + 1 }, (_, i) => i * 3 - 3).map((d) => { const date = at(d); const first = +fmt(date, { day: 'numeric' }) <= 3; return `<div class="exam-tick ${first ? 'month' : ''}" style="left:${pos(date)}">${first ? fmt(date, { month: 'short' }).toUpperCase() : fmt(date, { day: 'numeric' })}</div>`; }).join('');
  const monoliths = ex.map((e, i) => {
    const k = kinds[e.kind], s = subj(e.subject), hgt = 36 + e.weight * 2.7;
    const lift = i % 2 ? 34 : 0; // stagger neighbouring labels
    return `<button class="exam-monolith ${e.status === 'TENTATIVE' ? 'tentative' : ''}" type="button" data-event="${e.id}" style="left:${pos(e.start)};--c:${k.color};animation-delay:${0.1 + i * 0.06}s" aria-label="${esc(e.title)}, ${fDay(e.start)}">
      <span class="lbl" style="margin-bottom:${lift}px">${e.label || k.label}<small>${s.short} · ${fmt(e.start, { day: 'numeric', month: 'short' })}</small></span>
      <span class="cap">${ic(shapeIcon[e.kind])}</span>
      <div class="pillar" style="height:${hgt}px"></div></button>`;
  }).join('');

  const groups = [
    { k: 'Minor-2', f: (e) => e.kind === 'MINOR_EXAM' },
    { k: 'Practicals & Vivas', f: (e) => e.kind === 'PRACTICAL_EXAM' || e.kind === 'VIVA' },
    { k: 'Major · End-Sem', f: (e) => e.kind === 'MAJOR_EXAM' },
  ];
  const filt = (e) => examFilter === 'all' || e.subject === examFilter;
  return `<section class="view" id="exams-view">
    <div class="view-head"><div><div class="eyebrow">Exam Hub · majors &amp; minors</div><h1 class="view-title">The <em>exam corridor</em></h1><p class="view-sub">Every Minor, Major, Practical and Viva from now to end of term. Pillar height = weightage. Scroll sideways to travel through the semester.</p></div>
      <div class="exam-legend"><span style="color:${kinds.MINOR_EXAM.color}">${ic('diamond')} Minor</span><span style="color:${kinds.MAJOR_EXAM.color}">${ic('square')} Major</span><span style="color:${kinds.PRACTICAL_EXAM.color}">${ic('circle')} Practical</span><span style="color:${kinds.VIVA.color}">${ic('triangle')} Viva</span></div></div>
    <div class="panel corner exam-stage">
      <div class="exam-floor"></div>
      <div class="radar-hud tl"><b>${ex.filter((e) => hoursLeft(e.start) > 0).length}</b> exams ahead · <b>1</b> rescheduled · <b style="color:var(--warning)">crunch</b> 14–17 Oct</div>
      <div class="radar-hud tr">AMS date-sheet · synced <b data-ago="${integrations[0].last.getTime()}"></b> ago</div>
      <div class="exam-strip-scroll"><div class="exam-strip-inner" style="width:${corridorW}px">
        <div class="exam-axis"></div>${ticks}
        <div class="exam-today" style="left:${pos(now())}"><span>TODAY</span></div>
        ${monoliths}
      </div></div>
    </div>
    <div class="filter-row" role="group" aria-label="Filter by subject"><button class="filter-pill ${examFilter === 'all' ? 'on' : ''}" data-xf="all">All subjects</button>${subjects.filter((s) => ex.some((e) => e.subject === s.id)).map((s) => `<button class="filter-pill ${examFilter === s.id ? 'on' : ''}" data-xf="${s.id}"><span style="color:${s.color}">■</span> ${s.short}</button>`).join('')}</div>
    ${groups.map((g) => { const list = ex.filter(g.f).filter(filt); return list.length ? `<div class="exam-group"><h2 class="section-label">${g.k} <span class="count">${list.length}</span></h2><div class="exam-grid">${list.map(examCard).join('')}</div></div>` : ''; }).join('')}
  </section>`;
}
function examCard(e) {
  const s = subj(e.subject), k = kinds[e.kind], cd = countdown(e.start);
  const prep = e.prep || [], done = prep.filter(Boolean).length, pct = prep.length ? Math.round((done / prep.length) * 100) : 0;
  return `<article class="panel corner exam-card" data-event="${e.id}" tabindex="0">
    <span class="stripe" style="background:${s.color}"></span><span class="glare"></span>
    <div class="head"><div><div class="type" style="color:${k.color}">${e.label || k.label} · ${s.code}</div><h4>${s.name}</h4><div class="when">${fDay(e.start)} · ${fTime(e.start)}${e.end ? '–' + fTime(e.end) : ''} · ${e.venue}</div>${e.movedFrom ? `<div class="was">↻ was ${fDayTime(e.movedFrom)}</div>` : ''}</div>
    <div class="big-count"><b class="tabular">${cd.n}</b><span>${cd.u}</span></div></div>
    <div class="chips"><span class="chip ${e.status === 'TENTATIVE' ? 'tentative' : 'ok'}">${e.status === 'TENTATIVE' ? '◌ Tentative' : '● Confirmed'}</span><span class="chip src-${e.source}">${srcName(e.source)}</span>${e.movedFrom ? '<span class="chip moved">↻ moved</span>' : ''}<span class="chip">${e.weight}% weight</span><span class="chip">${ic('book-open')} ${e.syllabus}</span><span class="chip">${ic('paperclip')} ${e.files}</span></div>
    <div class="prep-bar"><span>Prep</span><div class="track"><i style="width:${pct}%"></i></div><span class="mono">${done}/${prep.length}</span></div>
    <div class="foot"><button class="btn sm primary" type="button" data-remind="${e.id}">${ic('bell-plus')} Reminder</button></div>
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
    <div class="board-toolbar"><div class="seg" role="group" aria-label="Sort"><button class="${dlSort === 'score' ? 'on' : ''}" data-sort="score">By priority</button><button class="${dlSort === 'date' ? 'on' : ''}" data-sort="date">By date</button></div></div></div>
    <div class="deadline-board">${B.map(([id, label, icon]) => { const items = list.filter((e) => bucketOf(e) === id).sort(sorter); return `<div class="panel bucket ${id}"><div class="bucket-head"><h3>${ic(icon)} ${label}</h3><span class="n">${items.length}</span></div><ul class="bucket-list">${items.map(deadlineRow).join('') || '<li style="color:var(--faint);font-size:12.5px;padding:10px 4px">Nothing here. Breathe.</li>'}</ul></div>`; }).join('')}</div>
  </section>`;
}
function deadlineRow(e) {
  const s = subj(e.subject), k = kinds[e.kind], p = progressOf(e);
  return `<li class="deadline-row ${p === 'DONE' ? 'done' : ''} ${e.status === 'TENTATIVE' ? 'tentative' : ''}" data-event="${e.id}" tabindex="0">
    <span class="stripe" style="background:${s?.color || k.color}"></span>
    <div class="r1"><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><div style="min-width:0"><div class="t">${esc(e.title)}</div><div class="m">${fDayTime(e.start)} · <span data-countdown="${e.start.getTime()}">${rel(e.start)}</span></div></div></div>
    <div class="r2"><div class="chips"><span class="chip src-${e.source}">${srcName(e.source)}</span>${e.status === 'TENTATIVE' ? '<span class="chip tentative">Tentative</span>' : ''}${e.weight ? `<span class="chip">${e.weight}%</span>` : ''}${e.submission ? `<span class="chip ${e.submission === 'SUBMITTED' ? 'ok' : ''}">${e.submission === 'NOT_SUBMITTED' ? 'Not submitted' : 'Submitted'}</span>` : ''}</div>
    ${isExam(e) ? `<span class="score">P${score(e)}</span>` : `<div class="progress-ctl" role="group" aria-label="Progress">${[['NOT_STARTED', 'circle', 'Not started'], ['IN_PROGRESS', 'loader', 'In progress'], ['DONE', 'check', 'Done']].map(([v, i, l]) => `<button type="button" class="${p === v ? 'on' : ''} ${v === 'DONE' ? 'done' : ''}" data-prog="${e.id}:${v}" aria-label="${l}" title="${l}">${ic(i)}</button>`).join('')}</div>`}</div>
  </li>`;
}
function mountDeadlines() {
  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { dlSort = b.dataset.sort; render(); }));
}

/* ======================= VIEW: CALENDAR ======================= */
let calWeek = 0;
function viewCalendar() {
  const todayDow = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(now(), { weekday: 'short' })) + 6) % 7; // Mon=0
  const mon = -todayDow + calWeek * 7;
  const H0 = 8, H1 = 19, PX = 56;
  const days = Array.from({ length: 7 }, (_, i) => mon + i);
  const cols = days.map((d) => {
    const items = buildDay(d);
    const isWeekend = [5, 6].includes(d - mon);
    const isHoliday = items.some((item) => item.kind === 'HOLIDAY');
    const blocks = items.map((e) => {
      const sh = +fmt(e.start, { hour: 'numeric', hour12: false }) + +fmt(e.start, { minute: 'numeric' }) / 60;
      const eh = e.end ? +fmt(e.end, { hour: 'numeric', hour12: false }) + +fmt(e.end, { minute: 'numeric' }) / 60 : sh;
      const k = kinds[e.kind], s = subj(e.subject);
      const c = s?.color || k.color;
      if (e.kind === 'HOLIDAY') return `<div class="cal-event cal-holiday" style="--c:${k.color};top:2px;height:40px" title="${esc(e.title)}"><b>${ic('party-popper')} ${esc(e.title)}</b><span>Government holiday · no classes</span></div>`;
      const top = Math.max(0, (Math.min(sh, H1 - 0.5) - H0) * PX);
      const point = !e.end;
      return `<div class="cal-event ${point ? 'deadline' : ''} ${e.status === 'TENTATIVE' ? 'tentative' : ''}" style="--c:${point ? k.color : c};top:${sh > H1 || sh < H0 ? (sh < H0 ? 0 : (H1 - H0) * PX - 24) : top}px;height:${point ? 22 : Math.max(26, (eh - sh) * PX - 3)}px" ${e.id ? `data-event="${e.id}"` : ''} title="${esc(e.title)}"><b>${point ? '⚑ ' : ''}${esc(e.tt || !s ? e.title : s.short + ' · ' + k.label)}</b>${point ? '' : `<span>${fTime(e.start)}${e.venue ? ' · ' + e.venue : ''}${e.tt ? ' · ' + esc(e.description) : ''}</span>`}</div>`;
    }).join('');
    const nowLine = d === 0 ? (() => { const h = +fmt(now(), { hour: 'numeric', hour12: false }) + +fmt(now(), { minute: 'numeric' }) / 60; return h >= H0 && h <= H1 ? `<div class="cal-now" style="top:${(h - H0) * PX}px"></div>` : ''; })() : '';
    const lunch = !isWeekend && !isHoliday ? `<div class="cal-lunch" style="top:${(13 - H0) * PX}px;height:${PX}px">LUNCH · 1:00 PM – 2:00 PM</div>` : '';
    return `<div class="cal-day ${d === 0 ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" style="height:${(H1 - H0) * PX}px">${lunch}${blocks}${nowLine}</div>`;
  }).join('');
  const heads = days.map((d) => `<div class="cal-col-head ${d === 0 ? 'today' : ''}"><span>${fmt(at(d), { weekday: 'short' })}</span><b>${fmt(at(d), { day: 'numeric' })}</b></div>`).join('');
  const hours = Array.from({ length: H1 - H0 }, (_, i) => `<div class="cal-hour">${((H0 + i - 1) % 12) + 1}${H0 + i < 12 ? 'a' : 'p'}</div>`).join('');

  // Semester timeline
  const S0 = -62, S1 = 62, span = S1 - S0, P = (d) => ((d - S0) / span) * 100 + '%';
  const bands = events.filter((event) => ['MINOR_EXAM', 'MAJOR_EXAM', 'PRACTICAL_EXAM', 'VIVA', 'PRESENTATION', 'HOLIDAY'].includes(event.kind)).map((event) => ({ a: dayIdx(event.start), b: Math.max(dayIdx(event.end || event.start) + 1, dayIdx(event.start) + 1), l: event.label || kinds[event.kind].label, c: kinds[event.kind].color }));
  const months = [-62, -31, 0, 29, 60].map((d) => { const dt = at(d); return `<div class="sem-month" style="left:${P(d)}">${fmt(dt, { month: 'short' }).toUpperCase()}</div>`; }).join('');

  return `<section class="view" id="calendar-view">
    <div class="view-head"><div><div class="eyebrow">Calendar · week</div><h1 class="view-title">${fmt(at(mon), { day: 'numeric', month: 'short' })} — <em>${fmt(at(mon + 6), { day: 'numeric', month: 'short' })}</em></h1><p class="view-sub">Saved events, deadlines, and your recurring Monday–Friday timetable.</p></div>
    <div class="board-toolbar"><div class="seg"><button data-cw="-1" aria-label="Previous week">←</button><button data-cw="0" class="${calWeek === 0 ? 'on' : ''}">This week</button><button data-cw="1" aria-label="Next week">→</button></div><button class="btn sm primary" type="button" data-add-event>${ic('plus')} Add event</button><button class="btn sm ghost" type="button" data-export-ics>${ic('download')} Export .ics</button></div></div>
    <form class="panel panel-pad action-form" data-event-form hidden><strong>New calendar event</strong><div class="action-form-grid"><label>Title<input name="title" required maxlength="200"></label><label>Kind<select name="kind"><option value="PERSONAL">Personal</option><option value="ASSIGNMENT">Assignment</option><option value="QUIZ">Quiz</option><option value="PRESENTATION">Presentation</option><option value="OTHER">Other</option></select></label><label>Date<input name="date" type="date" required value="${istDateInput(at(0))}"></label><label>Start time<input name="start" type="time" required value="09:00"></label><label>End time<input name="end" type="time"></label><label>Subject<select name="subject"><option value="">No subject</option>${subjects.filter((s) => s.apiId).map((s) => `<option value="${s.apiId}">${esc(s.name)}</option>`).join('')}</select></label><label>Location<input name="venue" maxlength="200"></label><label>Description<input name="description" maxlength="1000"></label></div><div class="action-form-actions"><button class="btn sm primary" type="submit">Save event</button><button class="btn sm ghost" type="button" data-cancel-form>Cancel</button></div></form>
    <div class="panel corner cal-wrap"><div class="cal-scroll"><div class="cal-grid"><div class="cal-col-head" style="border-left:0"></div>${heads}<div class="cal-hours">${hours}</div>${cols}</div></div></div>
    <div class="panel corner semester-timeline"><h2 class="section-label" style="margin:0">Semester at a glance</h2>
      <div class="sem-track"><div class="sem-axis"></div>${bands.map((b) => `<div class="sem-band" style="left:${P(b.a)};width:calc(${P(b.b)} - ${P(b.a)});background:color-mix(in srgb, ${b.c} 22%, transparent);border:1px solid ${b.c};color:var(--text)">${b.l}</div>`).join('')}<div class="sem-today" style="left:${P(0)}"></div>${months}</div>
    </div>
  </section>`;
}
function mountCalendar() {
  $$('[data-cw]').forEach((b) => b.addEventListener('click', () => { const v = +b.dataset.cw; calWeek = v === 0 ? 0 : calWeek + v; render(); }));
  $('[data-add-event]')?.addEventListener('click', () => { const form = $('[data-event-form]'); form.hidden = !form.hidden; });
  $('[data-cancel-form]')?.addEventListener('click', () => { $('[data-event-form]').hidden = true; });
  $('[data-event-form]')?.addEventListener('submit', (event) => void createManualEvent(event));
  $('[data-export-ics]')?.addEventListener('click', exportCalendarIcs);
  const sc = $('.cal-scroll'); if (sc) sc.scrollTop = 40;
}

function istDateTime(date, time) { return new Date(`${date}T${time}:00+05:30`); }
function istDateInput(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
async function postJson(url, body, extraHeaders = {}) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, ...extraHeaders }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'Could not save your changes.');
  return payload;
}
async function createManualEvent(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
  const start = istDateTime(data.get('date'), data.get('start'));
  const end = data.get('end') ? istDateTime(data.get('date'), data.get('end')) : null;
  if (end && end < start) { toast('End time must be after the start time.'); return; }
  const selected = subjects.find((subject) => subject.apiId === data.get('subject'));
  const button = $('button[type="submit"]', form); button.disabled = true;
  try {
    const payload = await postJson('/api/v1/events', { title: String(data.get('title')).trim(), kind: data.get('kind'), subjectCode: selected?.id || null, startsAt: start.toISOString(), endsAt: end?.toISOString() || null, isDeadline: ['ASSIGNMENT', 'QUIZ'].includes(data.get('kind')), isAllDay: false, venue: String(data.get('venue') || '').trim() || null, description: String(data.get('description') || '').trim() || null }, { 'Idempotency-Key': `event-${crypto.randomUUID()}` });
    events.push(mappedEvent(payload.item)); form.reset(); render(); toast('Event saved to your calendar.');
  } catch (error) { toast(error.message || 'Could not save the event.'); button.disabled = false; }
}
function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function icsDate(date) { return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function foldIcsLine(line) {
  const chunks = []; let chunk = ''; let width = 0;
  for (const char of line) { const size = new TextEncoder().encode(char).length; if (width + size > 72) { chunks.push(chunk); chunk = ' '; width = 1; } chunk += char; width += size; }
  chunks.push(chunk); return chunks.join('\r\n');
}
function exportCalendarIcs() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UniDash//Student Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:UniDash'];
  const add = (uid, title, start, end, description, location, status, rule = '') => {
    lines.push('BEGIN:VEVENT', `UID:${icsEscape(uid)}`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`);
    if (end) lines.push(`DTEND:${icsDate(end)}`);
    lines.push(`SUMMARY:${icsEscape(title)}`);
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if (location) lines.push(`LOCATION:${icsEscape(location)}`);
    if (status === 'CANCELLED') lines.push('STATUS:CANCELLED');
    if (rule) lines.push(`RRULE:${rule}`);
    lines.push('END:VEVENT');
  };
  events.forEach((event) => add(`${event.id}@unidash`, event.title, event.start, event.end, event.description, event.venue, event.status));
  for (const holiday of GOVT_HOLIDAYS_2026) {
    const nextDate = istDateInput(new Date(new Date(`${holiday.date}T00:00:00+05:30`).getTime() + D));
    lines.push('BEGIN:VEVENT', `UID:mp-holiday-${holiday.date}@unidash`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART;VALUE=DATE:${holiday.date.replaceAll('-', '')}`, `DTEND;VALUE=DATE:${nextDate.replaceAll('-', '')}`, `SUMMARY:${icsEscape(holiday.name)}`, 'DESCRIPTION:Madhya Pradesh government holiday', 'END:VEVENT');
  }
  const weekdayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  for (const [day, slots] of Object.entries(WEEKLY_CLASSES)) for (const slot of slots) {
    let offset = (Number(day) - ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(fmt(now(), { weekday: 'short' })) + 7) % 7;
    const start = at(offset, slot.start); const end = at(offset, slot.end);
    const slug = slot.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    add(`class-${day}-${slot.start}-${slug}@unidash`, slot.title, start, end, slot.faculty, slot.room, '', `FREQ=WEEKLY;BYDAY=${weekdayCodes[Number(day)]}`);
  }
  lines.push('END:VCALENDAR');
  const content = lines.map(foldIcsLine).join('\r\n') + '\r\n';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'unidash-calendar.ics' });
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Calendar export downloaded with saved events and recurring classes.');
}

/* ======================= VIEW: ATTENDANCE ======================= */
function viewAttendance() {
  const total = attendance.reduce((sum, row) => sum + row.t, 0);
  const attended = attendance.reduce((sum, row) => sum + row.a, 0);
  const missed = Math.max(0, total - attended);
  const overall = total ? attended / total * 100 : 0;
  const lastSync = attendance.map((row) => row.asOf).filter(Boolean).sort().at(-1);
  const latest = lastSync ? new Date(lastSync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
  const bars = attendance.map((row, index) => {
    const subject = subj(row.subject) || makeSubject(row.subject);
    const pct = row.t ? row.a / row.t * 100 : 0;
    const x = 56 + index * 76;
    const barY = 166 - pct * 1.28;
    return `<g><rect x="${x}" y="38" width="50" height="128" rx="7" fill="var(--bg-2)"/><rect x="${x}" y="${barY.toFixed(1)}" width="50" height="${(pct * 1.28).toFixed(1)}" rx="7" fill="${subject.color}"/><text x="${x + 25}" y="${Math.max(30, barY - 8).toFixed(1)}" text-anchor="middle" class="att-chart-value">${pct.toFixed(0)}%</text><text x="${x + 25}" y="190" text-anchor="end" transform="rotate(-42 ${x + 25} 190)" class="att-chart-label">${esc(subject.short)}</text></g>`;
  }).join('');
  const courseCards = attendance.map((row) => {
    const subject = subj(row.subject) || makeSubject(row.subject);
    const pct = row.t ? row.a / row.t * 100 : 0;
    const status = attStatus(pct, user.threshold);
    const skip = canSkip(row.a, row.t, user.threshold / 100);
    const attendNext = mustAttend(row.a, row.t, user.threshold / 100);
    return `<article class="panel corner att-course-card"><div class="att-course-head"><div><div class="att-course-code">${subject.code || 'AMS COURSE'}</div><h3>${esc(subject.short)}</h3></div><span class="att-course-status" style="--status:${status.c}">${status.k}</span></div><div class="att-course-pct"><span>Attendance</span><b style="color:${status.c}">${pct.toFixed(1)}%</b></div><div class="att-course-pct"><span>Classes attended</span><b>${row.a} / ${row.t}</b></div><div class="att-course-track"><i style="width:${pct}%;--course-color:${subject.color}"></i><span style="left:${user.threshold}%" title="${user.threshold}% minimum"></span></div><div class="att-course-foot"><span>${skip === null ? 'Skip guidance unavailable' : `${skip} safe skip${skip === 1 ? '' : 's'}`}</span><span>${attendNext ? `${attendNext} to recover` : `${user.threshold}% minimum`}</span></div></article>`;
  }).join('');
  const chartWidth = Math.max(380, 78 * attendance.length + 30);
  const charts = attendance.length ? `<div class="att-overview-grid"><article class="panel corner att-overview-card"><div class="att-panel-heading"><div><span class="eyebrow">Attendance overview</span><h2>Classes attended</h2></div><span class="att-panel-total">${overall.toFixed(1)}%</span></div><div class="att-donut-wrap"><div class="att-donut" role="img" aria-label="${attended} classes attended and ${missed} not attended" style="--attended:${overall}%"><div><b>${overall.toFixed(1)}%</b><small>OVERALL</small></div></div><div class="att-legend"><span><i class="present-dot"></i><b>${attended}</b> attended</span><span><i class="missed-dot"></i><b>${missed}</b> not attended</span><small>${total} classes counted</small></div></div></article><article class="panel corner att-overview-card"><div class="att-panel-heading"><div><span class="eyebrow">Course breakdown</span><h2>Attendance by course</h2></div><span class="att-threshold">${user.threshold}% minimum</span></div><div class="att-chart-scroll"><svg class="att-chart" style="min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} 224" role="img" aria-label="Attendance percentage for each course"><line x1="44" x2="${chartWidth - 10}" y1="38" y2="38"/><line x1="44" x2="${chartWidth - 10}" y1="70" y2="70"/><line x1="44" x2="${chartWidth - 10}" y1="102" y2="102"/><line x1="44" x2="${chartWidth - 10}" y1="134" y2="134"/><line x1="44" x2="${chartWidth - 10}" y1="166" y2="166"/><text x="4" y="42">100%</text><text x="12" y="74">75%</text><text x="12" y="106">50%</text><text x="12" y="138">25%</text><text x="22" y="170">0%</text>${bars}</svg></div></article></div><div class="att-section-heading"><div><span class="eyebrow">Saved from your portal</span><h2>My Courses</h2></div><span>${attendance.length} courses${latest ? ` · Synced ${esc(latest)} IST` : ''}</span></div><div class="att-course-grid">${courseCards}</div>` : `<article class="panel corner att-empty"><div class="eyebrow">Attendance · ${user.threshold}% minimum</div><h2>Real subject names are needed to show attendance.</h2><p>The last AMS scan contained attendance totals but only placeholder course labels. Update UniDash Portal Bridge to version 1.3.8, then scan again while signed in to AMS. UniDash will show only course names read from your portal.</p><button class="btn primary" type="button" data-go="more">Open Integrations ${ic('arrow-up-right')}</button></article>`;
  return `<section class="view" id="attendance-view"><div class="view-head"><div><div class="eyebrow">Attendance · limit ${user.threshold}%</div><h1 class="view-title">Your <em>attendance</em>.</h1><p class="view-sub">Saved AMS class totals, overall progress, and the courses that need your attention.${latest ? ` Updated ${esc(latest)} IST.` : ''}</p></div></div>${charts}</section>`;
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
let fileSubject = 'all';
function viewFiles() {
  const list = files.filter((f) => fileSubject === 'all' || (fileSubject === 'new' ? f.isNew : f.subject === fileSubject));
  const extColor = { pdf: '#ff6b5b', ppt: '#ffb000', code: '#3ec7ff', img: '#c8ff4d', zip: '#a78bfa' };
  const pending = inbox.filter((i) => !store.filed[i.id]);
  return `<section class="view" id="files-view">
    <div class="view-head"><div><div class="eyebrow">Files · Google Drive</div><h1 class="view-title">Your <em>files</em>.</h1><p class="view-sub">Files saved in your connected Drive account.</p></div>
    <div class="board-toolbar">${driveConnected ? `<button class="btn primary" type="button" data-upload-trigger>${ic('upload')} Upload</button>` : '<a class="btn primary" href="/api/v1/storage/drive/connect">Connect Google Drive</a>'}</div></div>
    ${driveConnected ? `<form class="panel panel-pad action-form upload-form" data-upload-form hidden><strong>Upload to your Drive</strong><div class="action-form-grid"><label>Files<input name="files" type="file" multiple required accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx"></label><label>Subject folder<select name="subject"><option value="">Drive root</option>${subjects.filter((s) => s.apiId).map((s) => `<option value="${s.apiId}">${esc(s.name)}</option>`).join('')}</select></label></div><div class="action-form-actions"><button class="btn sm primary" type="submit">Upload files</button><button class="btn sm ghost" type="button" data-upload-cancel>Cancel</button><span class="muted">Maximum 20 MB per file. Files are validated and saved in your connected Drive.</span></div></form>` : ''}
    <div class="files-layout">
      <nav class="panel corner folder-tree" aria-label="Folders">
        <button class="tree-item ${fileSubject === 'all' ? 'on' : ''}" data-fs="all">${ic('hard-drive')} All files<span class="n">${files.length}</span></button>
        <button class="tree-item ${fileSubject === 'new' ? 'on' : ''}" data-fs="new">${ic('sparkles')} New since last visit<span class="n">${files.filter((f) => f.isNew).length}</span></button>
        <div class="tree-sem">Subjects</div>
        ${subjects.map((s) => `<button class="tree-item ${fileSubject === s.id ? 'on' : ''}" data-fs="${s.id}"><span class="sw" style="background:${s.color}"></span>${s.short}<span class="n">${files.filter((f) => f.subject === s.id).length}</span></button>`).join('')}
        <div class="quota"><span>Stored in your Google Drive</span><div class="track"><i></i></div></div>
      </nav>
      <div>
        ${pending.length ? `<div class="panel inbox-panel"><h2 class="section-label" style="margin:0">${ic('inbox')} Inbox · needs a home <span class="count">${pending.length}</span></h2>${pending.map((i) => `<div class="inbox-row" id="inbox-${i.id}"><span class="kind-badge" style="color:var(--accent)">${ic('file')}</span><div><div class="nm">${esc(i.name)}</div><div class="m">${i.size} · from ${esc(i.from)} · <span class="chip src-${i.source}">${srcName(i.source)}</span></div></div><div class="sug"><span>→ <b style="color:var(--text)">${subj(i.suggest.subject).short} / ${i.suggest.folder}</b> <span class="conf" style="color:${i.confidence > 0.8 ? 'var(--success)' : 'var(--warning)'}">${Math.round(i.confidence * 100)}%</span></span><button class="btn sm primary" type="button" data-file="${i.id}">${ic('check')} File it</button></div></div>`).join('')}</div>` : ''}
        <h2 class="section-label">${fileSubject === 'all' ? 'All files' : fileSubject === 'new' ? 'New since last visit' : (subj(fileSubject)?.name || 'Drive')} <span class="count">${list.length}</span></h2>
        <div class="file-grid">${list.map((f) => { const s = subj(f.subject) || makeSubject('Drive'); return `<article class="panel file-tile"><div class="file-thumb" style="background:linear-gradient(135deg, color-mix(in srgb, ${s.color} 14%, var(--bg-2)), var(--bg-2))"><div class="page"></div><span class="ext" style="background:${extColor[f.type] || 'var(--muted)'}">${esc(f.type.toUpperCase())}</span></div><div class="nm">${esc(f.name)}</div><div class="m"><span><span style="color:${s.color}">■</span> ${s.short} / ${f.folder}</span></div><div class="m"><span>${f.size} · ${relPast(f.added)}</span><a class="link" href="/api/v1/storage/files/${encodeURIComponent(f.id)}" download>Download</a></div></article>`; }).join('') || '<p class="muted">No files are saved in your Drive yet.</p>'}</div>
      </div>
    </div>
  </section>`;
}
function mountFiles() {
  $$('[data-fs]').forEach((b) => b.addEventListener('click', () => { fileSubject = b.dataset.fs; render(); }));
  $('[data-upload-trigger]')?.addEventListener('click', () => { const form = $('[data-upload-form]'); form.hidden = !form.hidden; });
  $('[data-upload-cancel]')?.addEventListener('click', () => { $('[data-upload-form]').hidden = true; });
  $('[data-upload-form]')?.addEventListener('submit', (event) => void uploadDriveFiles(event));
  $$('[data-file]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation(); const id = b.dataset.file, row = $('#inbox-' + id); row.classList.add('filed');
    store.filed[id] = true; save();
    const it = inbox.find((x) => x.id === id);
    setTimeout(() => { toast(`Filed to ${subj(it.suggest.subject).short} / ${it.suggest.folder} · routing rule learned`, () => { delete store.filed[id]; save(); render(); }); render(); }, 320);
  }));
}
async function uploadDriveFiles(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const selectedFiles = data.getAll('files').filter((file) => file instanceof File && file.size);
  if (!selectedFiles.length) { toast('Choose at least one file to upload.'); return; }
  const button = $('button[type="submit"]', form); button.disabled = true;
  try {
    const subjectId = String(data.get('subject') || '');
    for (const file of selectedFiles) {
      const body = new FormData(); body.set('file', file); if (subjectId) body.set('subjectId', subjectId);
      const response = await fetch('/api/v1/storage/files', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body });
      const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || `Could not upload ${file.name}.`);
      const item = payload.item; files.unshift({ id: item.id, name: item.name, type: item.name.split('.').pop().toLowerCase(), size: `${Math.max(1, Math.round(item.sizeBytes / 1024))} KB`, subject: subjects.find((subject) => subject.apiId === item.subjectId)?.id || 'Drive', folder: 'Drive', source: 'MANUAL', added: new Date(item.createdAt), isNew: true, tags: [] });
    }
    render(); toast(`${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} saved to Google Drive.`);
  } catch (error) { toast(error.message || 'Could not upload files.'); button.disabled = false; }
}

/* ======================= VIEW: WHATSAPP ======================= */
function viewWhatsapp() {
  const person = (id) => waPeople.find((p) => p.id === id);
  const visible = waMessages.filter((m) => store.tracked[m.person] !== false);
  const byDay = {};
  visible.forEach((m) => { const k = fmt(m.time, { weekday: 'long', day: 'numeric', month: 'short' }); (byDay[k] ||= []).push(m); });
  const hl = (t) => esc(t).replace(/(kal|tomorrow|\b\d{1,2}(st|nd|rd|th)?\s?(oct|october)\b|\b\d{1,2}\s?(baje|pm|am|PM|AM)\b|\b\d{1,2}:\d{2}\b|wednesday|thursday|tuesday|saturday|\bTue\b|\bThu\b|quiz|minor-2|presentation)/gi, '<mark>$1</mark>');
  return `<section class="view" id="whatsapp-view">
    <div class="view-head"><div><div class="eyebrow">WhatsApp · tracked people only</div><h1 class="view-title">Signal, <em>not noise</em>.</h1><p class="view-sub">Only messages from people you picked. Dates are detected in English and Hinglish and turned into proposals — nothing reaches your calendar without your tap.</p></div></div>
    <div class="wa-layout">
      <aside class="panel corner wa-side">
        <div class="wa-group"><span class="ic">${ic('users')}</span><div><b>${waGroup.name}</b><span>${waGroup.members} members · ${waGroup.listener}</span></div></div>
        <h2 class="section-label">Tracked people <span class="count">${waPeople.filter((p) => store.tracked[p.id] !== false).length}</span></h2>
        ${waPeople.map((p) => `<div class="person-row"><span class="avatar" style="background:${p.color}">${p.initials}</span><div><div class="nm">${p.label}</div><div class="rl">${p.role}</div></div><button class="switch ${store.tracked[p.id] === false ? 'off' : ''}" type="button" role="switch" aria-checked="${store.tracked[p.id] !== false}" aria-label="Track ${p.label}" data-track="${p.id}"></button></div>`).join('')}
        <div class="privacy-note">${ic('shield-check')}<div><b style="color:var(--text)">Read-only listener.</b> UniDash never sends, reacts, or marks messages read. The other ${waGroup.members - 3} members' messages are never stored.</div></div>
      </aside>
      <div class="wa-feed">${Object.entries(byDay).map(([day, msgs]) => `<div class="wa-day">${day}</div>${msgs.map((m) => {
        const p = person(m.person), decided = store.proposals[m.id];
        const pr = m.proposal;
        let extract = '';
        if (pr) {
          if (pr.status === 'MATCHED') extract = `<div class="wa-extract matched"><span class="lbl">${ic('check-check')} MATCHES AMS</span><span class="val">${m.extracted}</span><span style="font-size:12px;color:var(--muted)">${pr.note}</span></div>`;
          else if (pr.status === 'ACCEPTED' || decided === 'ACCEPTED') extract = `<div class="wa-extract matched"><span class="lbl">${ic('calendar-check')} ON YOUR CALENDAR</span><span class="val">${m.extracted}</span>${pr.event ? `<button class="btn sm ghost act" type="button" data-event="${pr.event}">View →</button>` : ''}</div>`;
          else if (decided === 'REJECTED') extract = `<div class="wa-extract" style="opacity:.5"><span class="lbl">${ic('x')} DISMISSED</span><span class="val">${m.extracted}</span></div>`;
          else extract = `<div class="wa-extract"><span class="lbl">${ic('sparkles')} DATE DETECTED · ${m.category}</span><span class="val">${m.extracted}</span><div class="act"><button class="btn sm primary" type="button" data-prop="${m.id}:ACCEPTED">${ic('plus')} Add as tentative</button><button class="btn sm ghost" type="button" data-prop="${m.id}:REJECTED" aria-label="Dismiss">${ic('x')}</button></div></div>`;
        }
        return `<div class="wa-msg"><span class="avatar" style="background:${p.color}">${p.initials}</span><div class="wa-bubble"><div class="who"><b style="color:${p.color}">${p.label}</b><span class="chip">${p.role}</span>${m.subject ? `<span class="chip"><span style="color:${subj(m.subject).color}">■</span> ${subj(m.subject).short}</span>` : ''}<time>${fTime(m.time)}</time></div>${m.file ? `<div class="wa-file">${ic('file-text')}<div><b>${m.file.name}</b><div style="font-size:11.5px;color:var(--muted)">${m.file.size} · sent to Files Inbox</div></div></div>` : `<p lang="hi-Latn">${hl(m.text)}</p>`}${extract}</div></div>`;
      }).join('')}`).join('') || '<div class="pal-empty">No tracked people selected.</div>'}</div>
    </div>
  </section>`;
}
function mountWhatsapp() {
  $$('[data-track]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.track; store.tracked[id] = store.tracked[id] === false; save(); render(); }));
  $$('[data-prop]').forEach((b) => b.addEventListener('click', () => {
    const [id, v] = b.dataset.prop.split(':'); store.proposals[id] = v; save(); render();
    toast(v === 'ACCEPTED' ? 'Added to calendar as Tentative — it’ll confirm when AMS / Moodle agrees' : 'Proposal dismissed', () => { delete store.proposals[id]; save(); render(); });
  }));
}

/* ======================= VIEW: PROJECTS ======================= */
function viewProjects() {
  const teamColors = ['#ffb000', '#ff6fb5', '#3ec7ff', '#c8ff4d', '#a78bfa'];
  return `<section class="view" id="projects-view">
    <div class="view-head"><div><div class="eyebrow">Projects &amp; presentations</div><h1 class="view-title">Work in <em>flight</em>.</h1><p class="view-sub">Each project is a small workspace: status, milestones on your calendar, tasks, team and files.</p></div><div class="board-toolbar">${driveConnected ? `<button class="btn primary" type="button" data-add-project>${ic('plus')} New project</button>` : '<a class="btn primary" href="/api/v1/storage/drive/connect">Connect Google Drive</a>'}</div></div>
    ${driveConnected ? `<form class="panel panel-pad action-form" data-project-form hidden><strong>Create a project</strong><div class="action-form-grid"><label>Project name<input name="title" required maxlength="180"></label><label>Type<select name="type"><option value="PROJECT">Project</option><option value="PRESENTATION">Presentation</option><option value="LAB_FILE">Lab file</option><option value="SEMINAR">Seminar</option><option value="RESEARCH">Research</option><option value="OTHER">Other</option></select></label><label>Subject<select name="subject"><option value="">No subject</option>${subjects.filter((s) => s.apiId).map((s) => `<option value="${s.apiId}">${esc(s.name)}</option>`).join('')}</select></label><label>Deadline<input name="deadline" type="date" value=""></label><label>Description<input name="description" maxlength="4000"></label><label>Team members<input name="team" placeholder="Names separated by commas"></label></div><div class="action-form-actions"><button class="btn sm primary" type="submit">Create project</button><button class="btn sm ghost" type="button" data-project-cancel>Cancel</button><span class="muted">A project folder will be created in your connected Drive.</span></div></form>` : ''}
    <div class="proj-grid">${projects.map((p) => {
      const s = subj(p.subject) || makeSubject('Project');
      const tasks = p.tasks.map((t, i) => ({ ...t, done: store.tasks[p.id + i] ?? t.done }));
      const doneN = tasks.filter((t) => t.done).length;
      let mid = '';
      if (p.type === 'PRESENTATION') {
        const cur = presentationSteps.indexOf(p.status);
        mid = `<div class="stepper">${presentationSteps.map((st, i) => `<i class="${i < cur ? 'on' : i === cur ? 'cur' : ''}"></i>`).join('')}</div><div class="stepper-labels">${presentationSteps.map((st, i) => `<span class="${i === cur ? 'cur' : ''}">${st.replace('_', ' ').toLowerCase()}</span>`).join('')}</div>`;
      } else if (p.milestones.length) {
        const t0 = p.milestones[0].d.getTime(), t1 = Math.max(t0 + 1, p.milestones[p.milestones.length - 1].d.getTime());
        const P = (d) => ((d.getTime() - t0) / (t1 - t0)) * 92 + 4;
        mid = `<div class="milestones"><div class="line"></div><div class="fill" style="width:${Math.max(0, Math.min(100, P(now())))}%"></div>${p.milestones.map((m) => `<div class="ms ${m.done ? 'done' : ''}" style="left:${P(m.d)}%"><i></i><span>${m.t}</span></div>`).join('')}</div>`;
      }
      return `<article class="panel corner proj-card">
        <div class="head"><div><div class="eyebrow" style="color:${s.color}">${p.type === 'PRESENTATION' ? 'Presentation' : 'Project'} · ${s.code}</div><h4>${esc(p.title)}</h4></div><div style="text-align:right"><div class="mono" style="font-size:22px">${countdown(p.due).n}<span style="font-size:10px;color:var(--muted)"> ${countdown(p.due).u}</span></div><span class="chip ${p.status === 'BLOCKED' ? 'danger' : ''}">${p.status.replace('_', ' ')}</span></div></div>
        <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${p.due ? fDayTime(p.due) : 'No deadline set'}${p.venue ? ' · ' + p.venue : ''}${p.duration ? ' · ' + p.duration : ''}</div>
        ${mid}
        ${p.blockedBy ? `<div class="blocked">${ic('octagon-pause')} ${esc(p.blockedBy)}</div>` : ''}
        <ul class="task-list">${tasks.map((t, i) => `<li class="${t.done ? 'done' : ''}" data-task="${p.id}:${i}" tabindex="0"><span class="cb">${t.done ? ic('check') : ''}</span><span>${esc(t.t)}</span></li>`).join('')}</ul>
        <div class="team"><div class="avs">${p.team.map((n, i) => `<span class="avatar" style="background:${teamColors[i % 5]}" title="${n}">${n.slice(0, 2).toUpperCase()}</span>`).join('')}</div><span>${p.team.length} member${p.team.length > 1 ? 's' : ''} · ${doneN}/${tasks.length} tasks</span></div>
      </article>`;
    }).join('') || '<p class="muted">No projects with saved deadlines yet.</p>'}</div>
  </section>`;
}
function mountProjects() {
  $('[data-add-project]')?.addEventListener('click', () => { const form = $('[data-project-form]'); form.hidden = !form.hidden; });
  $('[data-project-cancel]')?.addEventListener('click', () => { $('[data-project-form]').hidden = true; });
  $('[data-project-form]')?.addEventListener('submit', (event) => void createProject(event));
  $$('[data-task]').forEach((li) => li.addEventListener('click', () => {
    const [pid, i] = li.dataset.task.split(':'); const p = projects.find((x) => x.id === pid);
    const next = p.tasks.map((task, index) => ({ title: task.t, done: index === +i ? !task.done : task.done }));
    void fetch(`/api/v1/projects/${encodeURIComponent(pid)}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'If-Match': `"${p.updatedAt}"` }, body: JSON.stringify({ tasks: next }) }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || 'Could not update the project task.'); p.updatedAt = payload.item.updatedAt; p.tasks[+i].done = !p.tasks[+i].done; render(); }).catch((error) => toast(error.message));
  }));
}
async function createProject(event) {
  event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const button = $('button[type="submit"]', form); button.disabled = true;
  const subject = subjects.find((item) => item.apiId === data.get('subject'));
  try {
    const item = (await postJson('/api/v1/projects', { title: String(data.get('title')).trim(), type: data.get('type'), description: String(data.get('description') || '').trim() || null, subjectId: subject?.apiId || null, deadlineAt: data.get('deadline') ? istDateTime(data.get('deadline'), '23:59').toISOString() : null, team: String(data.get('team') || '').split(',').map((name) => name.trim()).filter(Boolean) })).item;
    projects.push({ id: item.id, type: item.type, subject: subject?.id || null, title: item.title, status: item.status, due: item.deadlineAt ? new Date(item.deadlineAt) : null, venue: esc(item.venue || ''), duration: esc(item.duration || ''), team: (item.team || []).map(esc), blockedBy: item.blockedBy || '', updatedAt: item.updatedAt, tasks: (item.tasks || []).map((task) => ({ t: task.title, done: task.done })), milestones: (item.milestones || []).filter((milestone) => milestone.dueAt).map((milestone) => ({ t: esc(milestone.title), d: new Date(milestone.dueAt), done: milestone.done })) });
    render(); toast('Project saved and its Drive folder created.');
  } catch (error) { toast(error.message || 'Could not create project.'); button.disabled = false; }
}

/* ======================= MORE (mobile) ======================= */
function viewMore() {
  return `<section class="view"><div class="view-head"><div><div class="eyebrow">More</div><h1 class="view-title">Everything <em>else</em></h1></div></div>
  <div class="att-grid">${NAV.filter((n) => !TABS.includes(n.id)).map((n) => `<a class="panel corner panel-pad" href="#${n.id}" style="display:flex;align-items:center;gap:14px;text-decoration:none"><span class="kind-badge" style="color:var(--accent)">${ic(n.icon)}</span><b>${n.label}</b><span style="margin-left:auto;color:var(--muted)">${ic('chevron-right')}</span></a>`).join('')}</div>
  <h2 class="section-label" style="margin-top:28px">Integrations</h2>
  <div class="att-grid">${integrations.map((i) => `<div class="panel panel-pad"><div style="display:flex;justify-content:space-between;align-items:center"><b>${srcName(i.kind)}</b><span class="chip ${i.connected ? 'ok' : 'tentative'}">${i.status.replaceAll('_', ' ')}</span></div><div style="font-size:12px;color:var(--muted);margin-top:6px">${i.lastSuccessAt ? `Last success ${relPast(i.last)}` : 'No successful scan yet.'}${i.lastErrorMessage ? ` · ${esc(i.lastErrorMessage)}` : ''}</div></div>`).join('')}</div>
  <article class="panel panel-pad" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>Portal scan</b><div class="muted" data-bridge-status style="margin-top:5px">Checking extension…</div></div><button class="btn sm primary" type="button" data-bridge-scan disabled>Scan enabled portals</button></div><p class="muted" style="margin:10px 0">Scans start only when you click. Portal pages open in your browser session; your sign-in details are not entered or stored by UniDash.</p><div data-bridge-report><p class="muted">No browser scan report yet.</p></div></article></section>`;
}
function mountMore() { $('[data-bridge-scan]')?.addEventListener('click', () => void startPortalScan()); void checkPortalBridge(); }

/* ======================= SHEET ======================= */
function openEvent(id) {
  const e = events.find((x) => x.id === id); if (!e) return;
  const s = subj(e.subject), k = kinds[e.kind], cd = countdown(e.start);
  const rem = isExam(e) ? ['7 d', '3 d', '1 d', '3 h'] : e.kind === 'PRESENTATION' ? ['7 d', '3 d', '1 d', '3 h', 'rehearsal −2 d'] : ['1 d', '3 h', '1 h'];
  $('#sheet-body').innerHTML = `
    <div class="sheet-kind"><span class="kind-badge" style="color:${k.color}">${ic(k.icon)}</span><span class="chip" style="color:${k.color}">${e.label || k.label}</span><span class="chip src-${e.source}">${srcName(e.source)}</span><span class="chip ${e.status === 'TENTATIVE' ? 'tentative' : 'ok'}">${e.status === 'TENTATIVE' ? 'Tentative' : 'Confirmed'}</span></div>
    <h2 id="sheet-title">${esc(e.title)}</h2>
    <div class="sheet-count tabular">${cd.n}<small>${cd.u.toLowerCase()}</small></div>
    <dl class="sheet-meta">
      <dt>When</dt><dd>${fDayTime(e.start)}${e.end ? ' – ' + fTime(e.end) : ''} <span style="color:var(--muted)">IST</span></dd>
      ${e.venue ? `<dt>Where</dt><dd>${e.venue}</dd>` : ''}
      ${s ? `<dt>Subject</dt><dd><span style="color:${s.color}">■</span> ${s.code} · ${s.name}<br><span style="color:var(--muted);font-size:12.5px">${s.faculty}</span></dd>` : ''}
      ${e.weight ? `<dt>Weight</dt><dd>${e.weight}% · priority ${score(e)}</dd>` : ''}
      ${e.syllabus ? `<dt>Syllabus</dt><dd>${e.syllabus} · ${e.files} files</dd>` : ''}
      ${e.submission ? `<dt>Moodle</dt><dd>${e.submission === 'NOT_SUBMITTED' ? 'Not submitted yet' : 'Submitted'}</dd>` : ''}
      <dt>Reminders</dt><dd class="reminder-list">${rem.map((r) => `<span class="chip">${ic('bell')} ${r}</span>`).join('')}</dd>
    </dl>
    <h3 class="section-label">History</h3>
    <ul class="history">
      ${e.movedFrom ? `<li><b>Rescheduled on AMS</b> · today 7:12 AM<br><s>${fDayTime(e.movedFrom)}</s> → ${fDayTime(e.start)}</li><li><b>Prof. Sharma</b> on WhatsApp confirmed the change · 7:40 AM</li>` : ''}
      ${e.source === 'WHATSAPP' ? `<li><b>Proposed from WhatsApp</b> · Rahul — CR · 8:51 AM</li><li>Waiting for Moodle / AMS to confirm</li>` : ''}
      <li><b>First seen</b> on ${srcName(e.source)} · ${e.source === 'MANUAL' ? 'added by you' : 'auto-synced'}</li>
    </ul>
    <div class="sheet-actions">
      ${isDeadline(e) ? `<button class="btn primary" type="button" data-prog="${e.id}:DONE">${ic('check')} Mark done</button>` : `<button class="btn primary" type="button" data-remind="${e.id}">${ic('bell-plus')} Add reminder</button>`}
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
  const fl = files.filter((f) => m(f.name + ' ' + subj(f.subject).name)).slice(0, 4);
  if (q && fl.length) groups.push(['Files', fl.map((f) => ({ html: `<span class="kind-badge" style="color:var(--cyan)">${ic('file')}</span>${esc(f.name)}<span class="m">${subj(f.subject).short}</span>`, run: () => { fileSubject = f.subject; go('files'); } }))]);
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
  const v = (location.hash.slice(1) || 'exams').split('?')[0];
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
  host.insertAdjacentHTML('beforeend', view());
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
    const t = ev.target.closest('[data-prog],[data-remind],[data-toast],[data-focus],[data-go],[data-event],[data-sync],[data-pi]');
    if (!t) return;
    if (t.dataset.prog) {
      ev.stopPropagation();
      const [id, v] = t.dataset.prog.split(':'); const e = events.find((x) => x.id === id);
      void fetch(`/api/v1/events/${encodeURIComponent(id)}/progress`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, 'If-Match': `"${e.updatedAt}"` }, body: JSON.stringify({ progress: v }) }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || 'Could not update progress.'); e.progress = v; e.updatedAt = payload.item.updatedAt; closeSheet(); render(); toast(v === 'DONE' ? `Marked “${e.title}” done` : `Progress → ${v.replace('_', ' ').toLowerCase()}`); }).catch((error) => toast(error.message));
    } else if (t.dataset.remind) {
      ev.stopPropagation(); const e = events.find((item) => item.id === t.dataset.remind); const remindAt = new Date(e.start.getTime() - 60 * 60 * 1000);
      if (remindAt <= new Date()) { toast('This event starts too soon for a reminder.'); return; }
      void fetch(`/api/v1/events/${encodeURIComponent(e.id)}/reminders`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ remindAt: remindAt.toISOString(), offsetLabel: '1 hour before', channel: 'IN_APP' }) }).then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || 'Could not save the reminder.'); toast('Reminder saved for 1 hour before this event.'); }).catch((error) => toast(error.message));
    }
    else if (t.dataset.toast) { ev.stopPropagation(); toast(t.dataset.toast); }
    else if (t.dataset.focus) { closeSheet(); if (current !== 'radar') { go('radar'); setTimeout(() => radar?.focus(t.dataset.focus), 400); } else radar?.focus(t.dataset.focus); }
    else if (t.dataset.go) go(t.dataset.go);
    else if (t.dataset.event) { openEvent(t.dataset.event); if (current === 'radar') radar?.focus(t.dataset.event); }
    else if (t.dataset.sync) go('more');
    else if (t.dataset.pi) { closePalette(); palItems[+t.dataset.pi].run(); }
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') { ev.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
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
  $('#search-trigger').addEventListener('click', openPalette);
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-scrim').addEventListener('click', closeSheet);
  $('#bell-btn').addEventListener('click', () => go('radar'));
  const flip = () => { const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); localStorage.setItem('unidash-theme', n); radar?.retheme(); };
  $('#theme-toggle').addEventListener('click', flip); $('#theme-toggle-m').addEventListener('click', flip);
}

/* ======================= BOOT ======================= */
function boot() {
  const screen = $('#boot-screen');
  let finished = false;
  const finish = () => { if (finished) return; finished = true; screen.classList.add('done'); sessionStorage.setItem('unidash-booted', '1'); setTimeout(FX.markBooted, reduced ? 0 : 250); };
  if (reduced || sessionStorage.getItem('unidash-booted') || location.search.includes('noboot')) { finish(); return; }
  const lines = [
    ['Account', 'verifying'], ['Saved data', 'loading'], ['Dashboard', 'ready'],
  ];
  const ol = $('#boot-lines'), bar = $('#boot-progress');
  lines.forEach(([a, b], i) => setTimeout(() => { ol.insertAdjacentHTML('beforeend', `<li><span>${a}</span><b>${b}</b></li>`); bar.style.width = ((i + 1) / lines.length) * 100 + '%'; }, 160 + i * 190));
  const t = setTimeout(finish, 160 + lines.length * 190 + 350);
  screen.addEventListener('click', () => { clearTimeout(t); finish(); });
  window.addEventListener('keydown', function k(e) { if (e.key === 'Enter') { clearTimeout(t); finish(); window.removeEventListener('keydown', k); } });
}

buildShell();
FX.init();
bindGlobal();
boot();
void loadAccountData();
