/*
 * UniDash shared change-detection engine.
 * Used by BOTH the extension service worker (importScripts) and the
 * UniDash web dashboard (<script src>), so the report logic is identical.
 *
 * Record shape:
 *   { key, source, type, title, url?, fields: { name: value, ... } }
 * Snapshot shape:
 *   { source, takenAt, complete, sections: { name: {ok, count, error?} }, records: { key: record } }
 */
(function (root) {
  'use strict';

  // Normalise values so cosmetic differences never show up as "changes".
  function norm(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(Math.round(v * 1000) / 1000);
    return String(v)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normFields(fields) {
    const out = {};
    Object.keys(fields || {}).sort().forEach(function (k) {
      const nk = norm(k);
      if (!nk) return;
      // Fields that change on every page load are ignored (timestamps "x minutes ago", etc.)
      if (/^(last access|last accessed|time ago|_ts)$/i.test(nk)) return;
      out[nk] = norm(fields[k]);
    });
    return out;
  }

  // Small, deterministic string hash (FNV-1a) - good enough for change detection.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function recordHash(rec) {
    return hash(JSON.stringify([norm(rec.title), normFields(rec.fields)]));
  }

  function buildSnapshot(source, records, sections) {
    const map = {};
    const dupes = [];
    (records || []).forEach(function (r) {
      if (!r || !r.key) return;
      const k = norm(r.key);
      if (map[k]) { dupes.push(k); return; }
      map[k] = {
        key: k,
        source: source,
        type: r.type || 'record',
        title: norm(r.title),
        url: r.url || '',
        section: r.section || r.type || 'default',
        fields: normFields(r.fields),
      };
      map[k].hash = recordHash(map[k]);
    });
    const secs = sections || {};
    // A deliberately disabled section is not a failure, but it is also not
    // evidence that its old records disappeared.
    const complete = Object.keys(secs).length > 0 &&
      Object.keys(secs).every(function (s) { return secs[s].ok || secs[s].skipped; });
    return {
      source: source,
      takenAt: Date.now(),
      complete: complete,
      sections: secs,
      duplicateKeys: dupes,
      recordCount: Object.keys(map).length,
      records: map,
    };
  }

  /*
   * Validate a fresh snapshot against the previous one BEFORE trusting it.
   * Returns { trusted: bool, warnings: [] }. Untrusted snapshots are NOT
   * committed as the new baseline unless the student explicitly accepts.
   */
  function validate(prev, next) {
    const warnings = [];
    if (!next.complete) {
      Object.keys(next.sections).forEach(function (s) {
        if (!next.sections[s].ok && !next.sections[s].skipped) warnings.push('Section "' + s + '" could not be read: ' + (next.sections[s].error || 'unknown error'));
      });
    }
    if (prev && prev.recordCount > 0) {
      if (next.recordCount === 0) {
        warnings.push('Scan returned 0 records but the previous scan had ' + prev.recordCount + '. Possibly logged out or page changed.');
      } else if (next.recordCount < prev.recordCount * 0.5 && prev.recordCount >= 6) {
        warnings.push('Record count dropped from ' + prev.recordCount + ' to ' + next.recordCount + ' (more than 50%).');
      }
    }
    if (next.duplicateKeys && next.duplicateKeys.length) {
      warnings.push(next.duplicateKeys.length + ' duplicate record keys were ignored.');
    }
    const hardFail = next.recordCount === 0 && prev && prev.recordCount > 0;
    const bigDrop = warnings.some(function (w) { return /dropped/.test(w); });
    const duplicateKeys = !!(next.duplicateKeys && next.duplicateKeys.length);
    // Any failed section makes the scan partial. Never call partial coverage
    // verified: otherwise a dashboard could claim a clean scan despite errors.
    return { trusted: next.complete && !hardFail && !bigDrop && !duplicateKeys, warnings: warnings };
  }

  /*
   * Diff two snapshots. "Removed" is only reported for sections that were
   * read successfully in BOTH scans - a failed section never produces
   * fake "removed" entries.
   */
  function diff(prev, next) {
    const report = {
      source: next.source,
      from: prev ? prev.takenAt : null,
      to: next.takenAt,
      baseline: !prev,
      added: [], removed: [], modified: [],
      unchangedCount: 0,
    };
    if (!prev) {
      report.unchangedCount = next.recordCount;
      return report;
    }
    const okIn = function (snap, sec) {
      const status = snap.sections && snap.sections[sec];
      return !!status && !!status.ok && !status.skipped;
    };
    Object.keys(next.records).forEach(function (k) {
      const n = next.records[k];
      const p = prev.records[k];
      if (!p) { report.added.push(n); return; }
      if (p.hash === n.hash) { report.unchangedCount++; return; }
      const changes = [];
      if (p.title !== n.title) changes.push({ field: 'Title', before: p.title, after: n.title });
      const keys = {};
      Object.keys(p.fields).forEach(function (f) { keys[f] = 1; });
      Object.keys(n.fields).forEach(function (f) { keys[f] = 1; });
      Object.keys(keys).sort().forEach(function (f) {
        const a = p.fields[f] === undefined ? '' : p.fields[f];
        const b = n.fields[f] === undefined ? '' : n.fields[f];
        if (a !== b) changes.push({ field: f, before: a, after: b });
      });
      report.modified.push({ record: n, changes: changes });
    });
    Object.keys(prev.records).forEach(function (k) {
      if (next.records[k]) return;
      const p = prev.records[k];
      if (okIn(next, p.section) && okIn(prev, p.section)) report.removed.push(p);
    });
    return report;
  }

  /*
   * Build the baseline to store after a trusted scan. Records belonging to a
   * section that FAILED in this scan are carried over from the previous
   * baseline, so a temporary failure never causes "everything added" next time.
   */
  function mergeBaseline(prev, next) {
    if (!prev) return next;
    const merged = JSON.parse(JSON.stringify(next));
    Object.keys(prev.records).forEach(function (k) {
      const p = prev.records[k];
      const sec = next.sections && next.sections[p.section];
      // Preserve records when their section failed, was skipped, or vanished
      // from the current scan configuration. Absence is not proof of removal.
      if ((!sec || !sec.ok || sec.skipped) && !merged.records[k]) merged.records[k] = p;
    });
    merged.recordCount = Object.keys(merged.records).length;
    return merged;
  }

  root.UniDiff = { norm: norm, hash: hash, buildSnapshot: buildSnapshot, validate: validate, diff: diff, mergeBaseline: mergeBaseline };
})(typeof self !== 'undefined' ? self : this);
