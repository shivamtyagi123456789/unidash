(async function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const send = (msg) => new Promise((r) => chrome.runtime.sendMessage(msg, r));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let origin = null;
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) origin = u.origin; } catch (e) {}

  async function render() {
    const cfg = await UniConfig.loadConfig();
    $('current-origin').textContent = origin || '(not a web page)';
    const paired = origin && cfg.pairedOrigins.includes(origin);
    $('pair-state').innerHTML = paired ? '<span class="ok">✓ Paired</span>' : (origin ? 'Not paired' : '');
    $('pair-btn').hidden = !origin || paired;

    const list = $('paired-list');
    list.innerHTML = '';
    if (!cfg.pairedOrigins.length) list.innerHTML = '<li class="muted">None yet</li>';
    cfg.pairedOrigins.forEach((o) => {
      const li = document.createElement('li');
      li.className = 'row';
      const span = document.createElement('span'); span.className = 'origin'; span.textContent = o;
      const b = document.createElement('button'); b.className = 'danger'; b.textContent = 'Unpair';
      b.onclick = async () => { await send({ type: 'UNPAIR_ORIGIN', origin: o }); render(); };
      li.append(span, b); list.append(li);
    });

    const { lastResult } = await chrome.storage.local.get('lastResult');
    if (lastResult) {
      const parts = lastResult.reports.map((r) => `${r.label}: +${r.added.length} ~${r.modified.length} −${r.removed.length}`);
      lastResult.errors.forEach((e) => parts.push(`${e.label}: error`));
      $('last-scan').textContent = new Date(lastResult.finishedAt).toLocaleString() + ' — ' + parts.join(' · ');
    }
  }

  $('pair-btn').onclick = async () => {
    // Permission prompt must be triggered by this click (user gesture).
    const granted = await chrome.permissions.request({ origins: [origin + '/*'] });
    if (!granted) { $('status').textContent = 'Permission denied - cannot pair.'; return; }
    const res = await send({ type: 'PAIR_ORIGIN', origin, tabId: tab.id });
    $('status').textContent = res && res.ok ? 'Paired! The dashboard can now request scans.' : 'Error: ' + (res && res.error);
    render();
  };
  $('options-btn').onclick = () => chrome.runtime.openOptionsPage();
  render();
})();
