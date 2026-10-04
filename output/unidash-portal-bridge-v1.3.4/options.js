(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const status = (t, ok) => { $('status').textContent = t; $('status').style.color = ok ? '#15803d' : '#b91c1c'; };
  let cfg = await UniConfig.loadConfig();

  function fill() {
    const m = cfg.portals.moodle, a = cfg.portals.ams;
    $('moodle-enabled').checked = m.enabled; $('moodle-url').value = m.url;
    $('moodle-grades').checked = m.fetchGrades; $('moodle-window').value = m.deadlineWindowDays;
    $('ams-enabled').checked = a.enabled; $('ams-url').value = a.url;
    $('ams-login').value = a.loginSelector;
    const existingPages = Array.isArray(a.pages) ? a.pages : [];
    const builtInPages = UniConfig.DEFAULT_CONFIG.portals.ams.pages;
    const amsPages = [
      ...builtInPages.filter((page) => !existingPages.some((saved) => saved.path === page.path || saved.type === page.type)),
      ...existingPages,
    ];
    $('ams-pages').value = JSON.stringify(amsPages, null, 2);
    $('close-tabs').checked = cfg.closeTabsAfterScan; $('login-timeout').value = cfg.loginTimeoutMinutes;
  }
  fill();

  $('save-btn').onclick = async () => {
    let pages;
    try { pages = JSON.parse($('ams-pages').value || '[]'); if (!Array.isArray(pages)) throw new Error('must be an array'); }
    catch (e) { return status('AMS pages JSON is invalid: ' + e.message); }
    const pageNames = new Set();
    for (const p of pages) {
      if (!p || typeof p.name !== 'string' || !p.name.trim()) return status('Every AMS page needs a name');
      p.name = p.name.trim();
      if (pageNames.has(p.name)) return status('AMS page names must be unique');
      pageNames.add(p.name);
      if (p.path != null && p.path !== '') {
        if (typeof p.path !== 'string' || !p.path.startsWith('/') || p.path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(p.path)) {
          return status('AMS paths must be relative paths on the portal, starting with one /');
        }
      }
      if (p.tableSelector != null && typeof p.tableSelector !== 'string') return status('AMS tableSelector must be text');
      if (p.keyColumns != null && (!Array.isArray(p.keyColumns) || p.keyColumns.some((n) => !Number.isInteger(n) || n < 0 || n > 30))) {
        return status('AMS keyColumns must be an array of column numbers from 0 to 30');
      }
    }

    const urls = [];
    for (const id of ['moodle-url', 'ams-url']) {
      try {
        const enabled = id === 'moodle-url' ? $('moodle-enabled').checked : $('ams-enabled').checked;
        const raw = $(id).value.trim();
        if (!enabled && !raw) { urls.push(''); continue; }
        const u = new URL(raw);
        const localHttp = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
        if (u.protocol !== 'https:' && !localHttp) throw 0;
        if (u.username || u.password || u.hash) throw 0;
        urls.push(u.href);
      }
      catch (e) { return status('Invalid URL in ' + id); }
    }
    // Ask for host access to the configured portals (must be in this click handler).
    const origins = urls.filter(Boolean).map(UniConfig.originPattern);
    if (origins.length) {
      const granted = await chrome.permissions.request({ origins });
      if (!granted) return status('Access to the portal sites was not granted - scans will fail.');
    }

    cfg.portals.moodle = Object.assign(cfg.portals.moodle, {
      enabled: $('moodle-enabled').checked, url: urls[0], fetchGrades: $('moodle-grades').checked,
      deadlineWindowDays: Number($('moodle-window').value) || 60,
    });
    cfg.portals.ams = Object.assign(cfg.portals.ams, {
      enabled: $('ams-enabled').checked, url: urls[1], loginSelector: $('ams-login').value.trim(), pages,
    });
    cfg.closeTabsAfterScan = $('close-tabs').checked;
    cfg.loginTimeoutMinutes = Number($('login-timeout').value) || 10;
    await UniConfig.saveConfig(cfg);
    status('Saved ✓', true);
  };

  $('reset-btn').onclick = async () => {
    if (!confirm('Forget all saved baselines? The next scan will become the new baseline.')) return;
    await chrome.storage.local.set({ baselines: {}, pending: {} });
    status('Baselines cleared', true);
  };
})();
