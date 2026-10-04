/* Default configuration shared by background, popup and options. */
(function (root) {
  'use strict';
  const DEFAULT_CONFIG = {
    version: 1,
    // Dashboard origins the student explicitly paired from the extension popup.
    pairedOrigins: [],
    closeTabsAfterScan: true,
    loginTimeoutMinutes: 10,
    portals: {
      moodle: {
        enabled: false,
        label: 'Moodle (LMS)',
        kind: 'moodle',
        // Current MITS Moodle login observed at moodle.mitsweb.in; keep disabled until owner enables it.
        url: 'https://moodle.mitsweb.in/',
        fetchGrades: true,
        deadlineWindowDays: 60,
      },
      ams: {
        enabled: false,
        label: 'AMS (Academic Management System)',
        kind: 'table',
        // Owner-provided official AMS login URL; attendance page still needs setup.
        url: 'https://ams.mitsgwalior.in/',
        // Selector that only exists on the login page.
        loginSelector: 'input[type="password"]',
        // Verified MITS routes: dashboard quizzes/schedule, academic calendar,
        // and the per-course attendance cards on My Courses.
        pages: [
          { name: 'AMS dashboard', path: '/student/dashboard', type: 'dashboard' },
          { name: 'Academic calendar', path: '/student/academic-calendar', type: 'calendar' },
          { name: 'Courses and attendance', path: '/student/courses', type: 'attendance', tableSelector: 'table', keyColumns: [0] },
        ],
      },
    },
  };

  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (typeof base !== 'object' || base === null) return over === undefined ? base : over;
    const out = {};
    Object.keys(base).forEach(function (k) { out[k] = merge(base[k], over ? over[k] : undefined); });
    if (over && typeof over === 'object') {
      Object.keys(over).forEach(function (k) { if (!(k in out)) out[k] = over[k]; });
    }
    return out;
  }

  async function loadConfig() {
    const got = await chrome.storage.local.get('config');
    return merge(DEFAULT_CONFIG, got.config || {});
  }

  async function saveConfig(cfg) {
    await chrome.storage.local.set({ config: cfg });
  }

  function originPattern(url) {
    const u = new URL(url);
    return u.protocol + '//' + u.host + '/*';
  }

  root.UniConfig = { DEFAULT_CONFIG: DEFAULT_CONFIG, loadConfig: loadConfig, saveConfig: saveConfig, originPattern: originPattern };
})(typeof self !== 'undefined' ? self : this);
