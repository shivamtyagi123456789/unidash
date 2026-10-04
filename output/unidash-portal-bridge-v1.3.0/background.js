/*
 * UniDash Portal Bridge - service worker (Manifest V3).
 *
 * Flow (student-initiated only, no background polling, no stored passwords):
 *   1. Dashboard (paired origin) sends SCAN_START through the bridge content script.
 *   2. For each enabled portal we open/focus a tab; the student signs in themselves.
 *   3. We probe the tab every 2s until it is signed in (or the student clicks "I'm signed in").
 *   4. The extractor runs inside the portal tab using the student's own session.
 *   5. Snapshot -> validate -> diff against the last trusted baseline -> report.
 *   6. Report is sent back to the dashboard and kept in chrome.storage.local.
 */
importScripts('lib/config.js', 'lib/diff.js', 'lib/extractors.js');

const PROBE_INTERVAL_MS = 2000;
const BRIDGE_SCRIPT_ID = 'unidash-bridge';
let activeScan = null; // { id, cancel, forceReady:Set, dashboardTabId }

/* ------------------------- helpers ------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function notifyDashboard(tabId, payload) {
  if (tabId == null) return;
  try { await chrome.tabs.sendMessage(tabId, { __unidash: true, ...payload }); } catch (e) { /* tab closed */ }
}

async function runInTab(tabId, func, args) {
  const [res] = await chrome.scripting.executeScript({ target: { tabId }, func, args: args || [], world: 'ISOLATED' });
  return res ? res.result : undefined;
}

async function getStore() {
  const s = await chrome.storage.local.get(['baselines', 'pending', 'history']);
  return { baselines: s.baselines || {}, pending: s.pending || {}, history: s.history || [] };
}

async function waitForTabComplete(tabId, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t) throw new Error('Portal tab was closed');
    if (t.status === 'complete') return t;
    await sleep(400);
  }
  return chrome.tabs.get(tabId);
}

/* ------------------------- bridge registration ------------------------- */
async function syncBridgeRegistration() {
  const cfg = await UniConfig.loadConfig();
  const matches = cfg.pairedOrigins.map((o) => o.replace(/\/$/, '') + '/*');
  try { await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_SCRIPT_ID] }); } catch (e) {}
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([{
    id: BRIDGE_SCRIPT_ID, js: ['bridge.js'], matches, runAt: 'document_start', persistAcrossSessions: true,
  }]);
}
chrome.runtime.onInstalled.addListener(syncBridgeRegistration);
chrome.runtime.onStartup.addListener(syncBridgeRegistration);

/* ------------------------- scanning ------------------------- */
async function scanPortal(portalId, portal, ctx) {
  const emit = (stage, extra) => notifyDashboard(ctx.dashboardTabId, { type: 'SCAN_PROGRESS', scanId: ctx.id, portal: portalId, label: portal.label, stage, ...extra });

  // Host permission check (portal URL may have been changed in Options)
  const pattern = UniConfig.originPattern(portal.url);
  const has = await chrome.permissions.contains({ origins: [pattern] });
  if (!has) throw new Error('Extension has no permission for ' + pattern + '. Open the extension Options and click "Save & grant access".');
  // Older installed extension configs may only contain the attendance route.
  // Add the verified dashboard and calendar routes without discarding user pages.
  if (portal.kind === 'table') {
    const defaults = UniConfig.DEFAULT_CONFIG.portals.ams.pages;
    const savedPages = Array.isArray(portal.pages) ? portal.pages : [];
    const classify = (page) => page.type || (/academic-calendar/i.test(page.path || '') ? 'calendar' : (/student\/courses(?:$|[/?])/i.test(page.path || '') ? 'attendance' : (/dashboard/i.test(page.path || '') ? 'dashboard' : 'custom')));
    const typedSaved = savedPages.map((page) => ({ ...page, type: classify(page) }));
    const completePages = defaults.filter((page) => !typedSaved.some((saved) => saved.path === page.path || saved.type === page.type));
    portal = { ...portal, pages: [...completePages, ...typedSaved] };
  }

  emit('opening');
  const tab = await chrome.tabs.create({ url: portal.url, active: true });
  ctx.openedTabs.push(tab.id);
  const probeFn = portal.kind === 'moodle' ? UniExtractors.probe.moodle : UniExtractors.probe.table;
  const probeArgs = portal.kind === 'moodle' ? [] : [portal.loginSelector || ''];

  const deadline = Date.now() + (ctx.cfg.loginTimeoutMinutes || 10) * 60000;
  let sawLogin = false;
  let announcedLogin = false;
  while (true) {
    if (ctx.cancelled) throw new Error('Scan cancelled');
    if (Date.now() > deadline) throw new Error('Timed out waiting for sign-in');
    const t = await chrome.tabs.get(tab.id).catch(() => null);
    if (!t) throw new Error('Portal tab was closed before scanning');
    let state = 'unknown';
    if (t.status === 'complete' && t.url && t.url.startsWith(new URL(portal.url).origin)) {
      try { state = ((await runInTab(tab.id, probeFn, probeArgs)) || {}).state || 'unknown'; } catch (e) { state = 'unknown'; }
    }
    if (state === 'login_page') {
      sawLogin = true;
      if (!announcedLogin) { emit('awaiting_login', { tabId: tab.id }); announcedLogin = true; }
    }
    const forced = ctx.forceReady.has(portalId);
    // For generic portals: "unknown" after we previously saw the login form usually means signed in.
    if (state === 'logged_in' || forced || (portal.kind !== 'moodle' && sawLogin && state === 'unknown' && t.status === 'complete')) break;
    if (!announcedLogin && state === 'unknown' && t.status === 'complete') { emit('awaiting_login', { tabId: tab.id, hint: 'Sign in, then press "I\'m signed in" if the scan does not start automatically.' }); announcedLogin = true; }
    await sleep(PROBE_INTERVAL_MS);
  }

  await waitForTabComplete(tab.id, 15000);
  let result;
  if (portal.kind === 'moodle') {
    emit('extracting');
    result = await runInTab(tab.id, UniExtractors.extract.moodle, [portal]);
  } else {
    const records = [];
    const sections = {};
    const origin = new URL(portal.url).origin;
    for (const page of portal.pages || []) {
      if (ctx.cancelled) throw new Error('Scan cancelled');
      if (!page.path) continue;
      const current = await chrome.tabs.get(tab.id);
      const target = new URL(page.path, portal.url);
      if (target.origin !== origin) throw new Error('AMS scan page must stay on the configured portal origin');
      const currentUrl = new URL(current.url);
      if (target.pathname !== currentUrl.pathname || target.search !== currentUrl.search) {
        emit('preparing', { hint: 'Opening ' + (page.name || 'AMS page') + '…' });
        await chrome.tabs.update(tab.id, { url: target.href });
        await waitForTabComplete(tab.id, 20000);
      }
      let extractFn;
      if (page.type === 'dashboard') {
        await runInTab(tab.id, async function () {
          const end = Date.now() + 15000;
          while (Date.now() < end) {
            if (/Welcome back|Quizzes|Class Schedule/i.test(document.body?.innerText || '')) return true;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          return false;
        });
        extractFn = UniExtractors.extract.amsDashboard;
      } else if (page.type === 'calendar') {
        await runInTab(tab.id, async function () {
          const end = Date.now() + 12000;
          while (Date.now() < end) {
            if (/Academic Calendar/i.test(document.body?.innerText || '') && document.querySelector('h1,h2,h3,h4')) return true;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          return false;
        });
        extractFn = UniExtractors.extract.amsCalendar;
      } else {
        if (page.type === 'attendance') {
          await runInTab(tab.id, async function () {
            const end = Date.now() + 15000;
            while (Date.now() < end) {
              const text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
              if (/Attendance\s*:/i.test(text) && /Classes\s+Attended\s*:/i.test(text)) return true;
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            return false;
          });
        }
        extractFn = UniExtractors.extract.table;
      }
      emit('extracting', { hint: 'Reading ' + (page.name || 'AMS page') + '…' });
      const pageResult = await runInTab(tab.id, extractFn, (page.type === 'custom' || page.type === 'attendance') ? [{ pages: [page] }] : []);
      if (!pageResult || !pageResult.ok) {
        sections[page.name] = { ok: false, count: 0, error: (pageResult && pageResult.error) || 'Page extraction failed' };
        continue;
      }
      records.push(...(pageResult.records || []));
      Object.assign(sections, pageResult.sections || {});
    }
    result = { ok: true, records, sections };
  }
  if (!result || !result.ok) throw new Error((result && result.error) || 'Extraction failed');

  const store = await getStore();
  const prev = store.baselines[portalId] || null;
  const snap = UniDiff.buildSnapshot(portalId, result.records, result.sections);
  const check = UniDiff.validate(prev, snap);
  const report = UniDiff.diff(prev, snap);
  report.label = portal.label;
  report.trusted = check.trusted;
  report.warnings = check.warnings;
  report.sections = snap.sections;
  report.recordCount = snap.recordCount;
  // Keep only AMS's current read-only records in the visible dashboard report.
  // Moodle notifications/grades continue to be summarized by change counts.
  report.records = portalId === 'ams' ? Object.values(snap.records) : [];

  if (check.trusted) {
    store.baselines[portalId] = UniDiff.mergeBaseline(prev, snap);
    delete store.pending[portalId];
  } else {
    store.pending[portalId] = snap; // kept until student accepts or rescans
  }
  await chrome.storage.local.set({ baselines: store.baselines, pending: store.pending });
  emit('done', { summary: { added: report.added.length, modified: report.modified.length, removed: report.removed.length, trusted: report.trusted } });
  return report;
}

async function startScan(msg, sender) {
  if (activeScan) return { ok: false, error: 'A scan is already running' };
  const cfg = await UniConfig.loadConfig();
  const ctx = { id: 'scan_' + Date.now(), cfg, cancelled: false, forceReady: new Set(), openedTabs: [], dashboardTabId: sender.tab ? sender.tab.id : null };
  activeScan = ctx;
  const wanted = (msg.portals && msg.portals.length) ? msg.portals : Object.keys(cfg.portals).filter((p) => cfg.portals[p].enabled);

  (async () => {
    const reports = [];
    const errors = [];
    for (const pid of wanted) {
      const portal = cfg.portals[pid];
      if (!portal || !portal.enabled) continue;
      try { reports.push(await scanPortal(pid, portal, ctx)); }
      catch (e) {
        errors.push({ portal: pid, label: portal.label, error: String(e.message || e) });
        notifyDashboard(ctx.dashboardTabId, { type: 'SCAN_PROGRESS', scanId: ctx.id, portal: pid, label: portal.label, stage: 'error', error: String(e.message || e) });
      }
    }
    const result = { scanId: ctx.id, finishedAt: Date.now(), reports, errors };
    const store = await getStore();
    store.history.unshift(result);
    await chrome.storage.local.set({ history: store.history.slice(0, 20), lastResult: result });
    if (cfg.closeTabsAfterScan) { for (const t of ctx.openedTabs) chrome.tabs.remove(t).catch(() => {}); }
    if (ctx.dashboardTabId != null) chrome.tabs.update(ctx.dashboardTabId, { active: true }).catch(() => {});
    await notifyDashboard(ctx.dashboardTabId, { type: 'SCAN_RESULT', result });
    activeScan = null;
  })();

  return { ok: true, scanId: ctx.id, portals: wanted };
}

/* ------------------------- message router ------------------------- */
async function isPaired(sender) {
  if (!sender.tab || !sender.url) return false;
  const cfg = await UniConfig.loadConfig();
  const origin = new URL(sender.url).origin;
  return cfg.pairedOrigins.includes(origin);
}

async function handle(msg, sender) {
  // Messages from popup/options (extension pages) are always trusted.
  const fromExtension = sender.id === chrome.runtime.id && !sender.tab;
  if (!fromExtension && !(await isPaired(sender))) return { ok: false, error: 'This site is not paired with UniDash Bridge' };

  switch (msg.type) {
    case 'PING': {
      const cfg = await UniConfig.loadConfig();
      return { ok: true, version: chrome.runtime.getManifest().version, portals: Object.fromEntries(Object.entries(cfg.portals).map(([k, p]) => [k, { label: p.label, enabled: p.enabled, url: p.url }])), scanning: !!activeScan };
    }
    case 'SCAN_START': return startScan(msg, sender);
    case 'SCAN_CANCEL': if (activeScan) activeScan.cancelled = true; return { ok: true };
    case 'FORCE_READY': if (activeScan) activeScan.forceReady.add(msg.portal); return { ok: true };
    case 'GET_LAST': { const s = await chrome.storage.local.get(['lastResult', 'history']); return { ok: true, lastResult: s.lastResult || null, history: (s.history || []).map((h) => ({ scanId: h.scanId, finishedAt: h.finishedAt })) }; }
    case 'ACCEPT_PENDING': {
      const store = await getStore();
      if (!store.pending[msg.portal]) return { ok: false, error: 'Nothing pending' };
      store.baselines[msg.portal] = UniDiff.mergeBaseline(store.baselines[msg.portal] || null, store.pending[msg.portal]);
      delete store.pending[msg.portal];
      await chrome.storage.local.set({ baselines: store.baselines, pending: store.pending });
      return { ok: true };
    }
    case 'RESET_BASELINE': {
      const store = await getStore();
      if (msg.portal) { delete store.baselines[msg.portal]; delete store.pending[msg.portal]; }
      else { store.baselines = {}; store.pending = {}; }
      await chrome.storage.local.set({ baselines: store.baselines, pending: store.pending });
      return { ok: true };
    }
    case 'PAIR_ORIGIN': {
      if (!fromExtension) return { ok: false, error: 'Pairing must be done from the extension popup' };
      const cfg = await UniConfig.loadConfig();
      if (!cfg.pairedOrigins.includes(msg.origin)) cfg.pairedOrigins.push(msg.origin);
      await UniConfig.saveConfig(cfg);
      await syncBridgeRegistration();
      if (msg.tabId != null) { try { await chrome.scripting.executeScript({ target: { tabId: msg.tabId }, files: ['bridge.js'] }); } catch (e) {} }
      return { ok: true };
    }
    case 'UNPAIR_ORIGIN': {
      if (!fromExtension) return { ok: false, error: 'Not allowed' };
      const cfg = await UniConfig.loadConfig();
      cfg.pairedOrigins = cfg.pairedOrigins.filter((o) => o !== msg.origin);
      await UniConfig.saveConfig(cfg);
      await syncBridgeRegistration();
      return { ok: true };
    }
    case 'RESYNC_BRIDGE': await syncBridgeRegistration(); return { ok: true };
    default: return { ok: false, error: 'Unknown message ' + msg.type };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.__unidash) return false;
  handle(msg, sender).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
  return true; // async response
});
