/*
 * Portal extractors. Each function is injected into the portal tab with
 * chrome.scripting.executeScript({ func, args }) so it MUST be fully
 * self-contained (no closures over outer variables).
 *
 * They run inside the portal's own origin, so requests reuse the student's
 * own logged-in session cookies. No credentials are ever read or stored.
 */
(function (root) {
  'use strict';

  /* ---------- Login state probes (return 'logged_in' | 'login_page' | 'unknown') ---------- */

  function probeMoodle() {
    try {
      const body = document.body;
      if (!body) return { state: 'unknown' };
      const html = document.documentElement.innerHTML;
      const hasSesskey = /"sesskey":"[A-Za-z0-9]+"/.test(html) || !!document.querySelector('a[href*="logout.php?sesskey="]');
      if (body.classList.contains('notloggedin') || document.querySelector('form#login, #page-login-index, body#page-login-index')) {
        return { state: 'login_page' };
      }
      if (hasSesskey && document.querySelector('[data-userid], .usermenu, #user-menu-toggle, a[href*="logout.php"]')) {
        return { state: 'logged_in' };
      }
      return { state: 'unknown' };
    } catch (e) { return { state: 'unknown', error: String(e) }; }
  }

  function probeTable(loginSelector) {
    try {
      if (document.readyState === 'loading') return { state: 'unknown' };
      if (loginSelector && document.querySelector(loginSelector)) return { state: 'login_page' };
      if (document.querySelector('input[type="password"]')) return { state: 'login_page' };
      // Logged-in heuristics: logout link/button somewhere on the page.
      const logout = Array.from(document.querySelectorAll('a,button')).some(function (el) {
        return /log\s*out|sign\s*out|logout/i.test(el.textContent || '') || /logout|signout/i.test(el.getAttribute('href') || '');
      });
      return { state: logout ? 'logged_in' : 'unknown' };
    } catch (e) { return { state: 'unknown', error: String(e) }; }
  }

  /* ---------- Moodle extractor ---------- */
  // Uses Moodle's own AJAX web-service endpoint (/lib/ajax/service.php) with the
  // session's sesskey - the same calls the Moodle Dashboard itself makes.
  async function extractMoodle(opts) {
    const records = [];
    const sections = {};
    const base = location.origin + (function () {
      // Support Moodle installed in a sub-folder, e.g. https://host/moodle/
      const m = document.documentElement.innerHTML.match(/"wwwroot":"([^"]+)"/);
      if (m) { try { return new URL(m[1].replace(/\\\//g, '/')).pathname.replace(/\/$/, ''); } catch (e) {} }
      return '';
    })();
    const sessM = document.documentElement.innerHTML.match(/"sesskey":"([A-Za-z0-9]+)"/);
    let sesskey = sessM ? sessM[1] : '';
    if (!sesskey) {
      const a = document.querySelector('a[href*="sesskey="]');
      if (a) { const mm = a.href.match(/sesskey=([A-Za-z0-9]+)/); if (mm) sesskey = mm[1]; }
    }
    if (!sesskey) return { ok: false, error: 'Could not find Moodle session key - are you signed in?', records: [], sections: {} };

    async function ws(methodname, args) {
      const res = await fetch(base + '/lib/ajax/service.php?sesskey=' + encodeURIComponent(sesskey) + '&info=' + methodname, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ index: 0, methodname: methodname, args: args }]),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json) || !json[0]) throw new Error('Unexpected response');
      if (json[0].error) throw new Error((json[0].exception && json[0].exception.message) || 'Web service error');
      return json[0].data;
    }
    function strip(html) { const d = document.createElement('div'); d.innerHTML = html || ''; return (d.textContent || '').trim(); }

    // 1) Enrolled courses
    let courses = [];
    try {
      const data = await ws('core_course_get_enrolled_courses_by_timeline_classification', {
        offset: 0, limit: 0, classification: 'all', sort: 'fullname',
      });
      courses = (data && data.courses) || [];
      courses.forEach(function (c) {
        records.push({
          key: 'moodle:course:' + c.id, type: 'course', section: 'Courses',
          title: c.fullname || c.shortname, url: c.viewurl,
          fields: { 'Short name': c.shortname, 'Category': c.coursecategory || '', 'Progress %': c.progress == null ? '' : Math.round(c.progress), 'Hidden': c.hidden ? 'yes' : 'no' },
        });
      });
      sections.Courses = { ok: true, count: courses.length };
    } catch (e) { sections.Courses = { ok: false, count: 0, error: String(e.message || e) }; }

    // 2) Upcoming deadlines / action events (assignments, quizzes ...)
    try {
      const now = Math.floor(Date.now() / 1000);
      const data = await ws('core_calendar_get_action_events_by_timesort', {
        timesortfrom: now - 86400 * 7, timesortto: now + 86400 * (opts.deadlineWindowDays || 60), limitnum: 50,
      });
      const evs = (data && data.events) || [];
      evs.forEach(function (ev) {
        records.push({
          key: 'moodle:event:' + ev.id, type: 'deadline', section: 'Deadlines',
          title: ev.activityname || ev.name, url: ev.url || (ev.action && ev.action.url) || '',
          fields: {
            'Course': ev.course ? ev.course.fullname : '',
            'Type': ev.modulename || ev.eventtype || '',
            'Due': new Date((ev.timesort || ev.timestart) * 1000).toISOString().slice(0, 16).replace('T', ' '),
            'Status': ev.action ? (ev.action.actionable ? 'Action required: ' + (ev.action.name || '') : (ev.action.name || 'Done')) : (ev.overdue ? 'Overdue' : ''),
          },
        });
      });
      sections.Deadlines = { ok: true, count: evs.length };
    } catch (e) { sections.Deadlines = { ok: false, count: 0, error: String(e.message || e) }; }

    // 3) Notifications (new grades, feedback, forum posts ...)
    try {
      const uidM = document.documentElement.innerHTML.match(/data-userid="(\d+)"/) || document.documentElement.innerHTML.match(/"userid":(\d+)/);
      if (!uidM) throw new Error('User id not found');
      const data = await ws('message_popup_get_popup_notifications', { useridto: Number(uidM[1]), newestfirst: 1, limit: 30, offset: 0 });
      const ns = (data && data.notifications) || [];
      ns.forEach(function (n) {
        records.push({
          key: 'moodle:notif:' + n.id, type: 'notification', section: 'Notifications',
          title: n.subject || strip(n.smallmessage), url: n.contexturl || '',
          fields: { 'From': n.userfromfullname || '', 'Time': n.timecreated ? new Date(n.timecreated * 1000).toISOString().slice(0, 16).replace('T', ' ') : '', 'Message': strip(n.smallmessage || n.fullmessage).slice(0, 300) },
        });
      });
      sections.Notifications = { ok: true, count: ns.length };
    } catch (e) { sections.Notifications = { ok: false, count: 0, error: String(e.message || e) }; }

    // 4) Course grades - parsed from the "Grades overview" HTML page (works on every Moodle version).
    if (opts.fetchGrades) {
      try {
        const res = await fetch(base + '/grade/report/overview/index.php', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        if (doc.querySelector('form#login, body.notloggedin')) throw new Error('Session expired');
        const rows = doc.querySelectorAll('table#overview-grade tbody tr, table.generaltable tbody tr');
        let n = 0;
        rows.forEach(function (tr) {
          const cells = tr.querySelectorAll('td, th');
          if (cells.length < 2) return;
          const link = cells[0].querySelector('a');
          const name = (cells[0].textContent || '').trim();
          if (!name || /^(no grades|course)$/i.test(name)) return;
          const idM = link && link.href.match(/[?&]id=(\d+)/);
          records.push({
            key: 'moodle:grade:' + (idM ? idM[1] : name), type: 'grade', section: 'Grades',
            title: name, url: link ? link.href : '',
            fields: { 'Grade': (cells[1].textContent || '').trim(), 'Rank': cells[2] ? (cells[2].textContent || '').trim() : '' },
          });
          n++;
        });
        sections.Grades = { ok: true, count: n };
      } catch (e) { sections.Grades = { ok: false, count: 0, error: String(e.message || e) }; }
    } else sections.Grades = { ok: false, skipped: true, count: 0, error: 'Disabled in extension settings' };

    return { ok: true, records: records, sections: sections, meta: { courses: courses.length } };
  }

  /* ---------- Generic table extractor (AMS / any ERP-style portal) ---------- */
  // Reads HTML tables either from the current page, or from a list of
  // configured same-origin pages fetched with the student's session.
  async function extractTables(opts) {
    const records = [];
    const sections = {};

    function readTables(doc, page) {
      const sel = page.tableSelector || 'table';
      const tables = Array.from(doc.querySelectorAll(sel));
      let count = 0;
      tables.forEach(function (table, ti) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length < 2) return;
        let headerRow = table.querySelector('thead tr') || rows.find(function (r) { return r.querySelector('th'); }) || rows[0];
        const headers = Array.from(headerRow.children).map(function (c, i) { return (c.textContent || '').replace(/\s+/g, ' ').trim() || ('Col ' + (i + 1)); });
        rows.forEach(function (tr) {
          if (tr === headerRow) return;
          const cells = Array.from(tr.children).map(function (c) { return (c.textContent || '').replace(/\s+/g, ' ').trim(); });
          if (!cells.some(Boolean) || cells.length < 2) return;
          const keyCols = page.keyColumns && page.keyColumns.length ? page.keyColumns : [0];
          const keyVal = keyCols.map(function (i) { return cells[i] || ''; }).join(' / ');
          if (!keyVal) return;
          const fields = {};
          cells.forEach(function (v, i) { fields[headers[i] || ('Col ' + (i + 1))] = v; });
          records.push({
            key: 'ams:' + page.name + ':t' + ti + ':' + keyVal, type: 'row', section: page.name,
            title: keyVal, url: page.url || location.href, fields: fields,
          });
          count++;
        });
      });
      return count;
    }

    // MITS AMS's /student/courses page renders attendance as course cards,
    // not a <table>. Extract only each student's per-course attendance fields.
    function readAttendanceCards(doc, page) {
      const nodes = Array.from(doc.querySelectorAll('article, section, li, div')).filter(function (el) {
        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return /Attendance\s*:/i.test(text) && /Classes\s+Attended\s*:/i.test(text);
      }).sort(function (a, b) {
        return (a.textContent || '').length - (b.textContent || '').length;
      });
      const cards = [];
      nodes.forEach(function (node) {
        // Prefer the smallest container that contains both attendance labels.
        if (cards.some(function (existing) { return node.contains(existing); })) return;
        cards.push(node);
      });
      let count = 0;
      cards.forEach(function (card, index) {
        const text = (card.innerText || card.textContent || '').replace(/\s+/g, ' ').trim();
        const attendance = text.match(/Attendance\s*:\s*([\d.]+\s*%?)/i);
        const attended = text.match(/Classes\s+Attended\s*:\s*(\d+\s*\/\s*\d+)/i);
        if (!attendance || !attended) return;
        const code = text.match(/\b\d{6,}\b/);
        const heading = Array.from(card.querySelectorAll('h1,h2,h3,h4,h5,a,strong,b'))
          .map(function (el) { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(); })
          .find(function (value) { return value && !/^\d{6,}$/.test(value) && !/^(THEORY|PRACTICAL|OTHER)$/i.test(value) && !/Attendance|Classes Attended|Faculty|Semester|Branch/i.test(value); });
        const title = code ? code[0] + (heading ? ' · ' + heading : '') : (heading || 'Course ' + (index + 1));
        const key = code ? code[0] : title;
        records.push({
          key: 'ams:' + page.name + ':course:' + key,
          type: 'attendance',
          section: page.name,
          title: title,
          url: page.url || location.href,
          fields: { Attendance: attendance[1].replace(/\s+/g, ''), 'Classes Attended': attended[1].replace(/\s+/g, '') },
        });
        count++;
      });
      return count;
    }

    const pages = (opts.pages && opts.pages.length) ? opts.pages : [{ name: document.title || 'Current page', path: null }];
    for (const page of pages) {
      try {
        let doc = document;
        if (page.path) {
          const target = new URL(page.path, location.href);
          if (target.origin !== location.origin) throw new Error('AMS page must stay on the signed-in portal origin');
          const url = target.href;
          page.url = url;
          // If the student already navigated to this exact page, inspect the live
          // DOM so client-rendered attendance cards are available to the parser.
          if (target.pathname !== location.pathname || target.search !== location.search) {
            const res = await fetch(url, { credentials: 'same-origin', redirect: 'error' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            if (doc.querySelector('input[type="password"]')) throw new Error('Session expired / redirected to login');
          }
        }
        let n = readTables(doc, page);
        if (n === 0 && /student\/courses/i.test(page.path || '')) n = readAttendanceCards(doc, page);
        sections[page.name] = n > 0 ? { ok: true, count: n } : { ok: false, count: 0, error: 'No attendance cards or table rows found (page may render data with JavaScript or the selector may be wrong)' };
      } catch (e) {
        sections[page.name] = { ok: false, count: 0, error: String(e.message || e) };
      }
    }
    return { ok: true, records: records, sections: sections };
  }

  root.UniExtractors = {
    probe: { moodle: probeMoodle, table: probeTable },
    extract: { moodle: extractMoodle, table: extractTables },
  };
})(typeof self !== 'undefined' ? self : this);
