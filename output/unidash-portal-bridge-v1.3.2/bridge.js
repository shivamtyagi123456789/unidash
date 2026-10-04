/*
 * UniDash Bridge content script - injected ONLY into dashboard origins the
 * student paired from the extension popup.
 *
 * Page -> extension:  window.postMessage({ unidash: 'request', id, type, ...payload }, location.origin)
 * Extension -> page:  window.postMessage({ unidash: 'response', id, ...result }) and
 *                     window.postMessage({ unidash: 'event', type, ... })
 */
(function () {
  'use strict';
  if (window.__unidashBridgeLoaded) return;
  window.__unidashBridgeLoaded = true;

  const ALLOWED = ['PING', 'SCAN_START', 'SCAN_CANCEL', 'FORCE_READY', 'GET_LAST', 'ACCEPT_PENDING', 'RESET_BASELINE'];

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || d.unidash !== 'request' || ALLOWED.indexOf(d.type) === -1) return;
    const msg = Object.assign({}, d);
    delete msg.unidash; delete msg.id;
    try {
      chrome.runtime.sendMessage(msg, function (res) {
        const err = chrome.runtime.lastError;
        window.postMessage(Object.assign({ unidash: 'response', id: d.id }, err ? { ok: false, error: err.message } : (res || { ok: false, error: 'No response' })), location.origin);
      });
    } catch (e) {
      window.postMessage({ unidash: 'response', id: d.id, ok: false, error: 'Extension was reloaded - refresh this page.' }, location.origin);
    }
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.__unidash) return;
    const out = Object.assign({ unidash: 'event' }, msg);
    delete out.__unidash;
    window.postMessage(out, location.origin);
  });

  // Announce presence so the dashboard can show "Extension connected".
  function announce() {
    window.postMessage({ unidash: 'event', type: 'BRIDGE_READY', version: chrome.runtime.getManifest().version }, location.origin);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce); else announce();
})();
