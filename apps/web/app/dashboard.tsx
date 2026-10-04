"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type EventItem = { id: string; title: string; description: string | null; kind: string; source: string; startsAt: string; endsAt: string | null; subjectCode: string | null; progress: string };
type FeedItem = { id: string; kind: string; title: string; body: string | null; createdAt: string; readAt: string | null };
type ReminderItem = { id: string; eventId: string; remindAt: string; offsetLabel: string | null; channel: string; state: string; title: string; startsAt: string; kind: string; source: string };
type Attendance = { subjectId: string; subjectCode: string | null; subjectName: string; attended: number; total: number; percentage: number; asOf: string; source: string };
type Project = { id: string; title: string; description: string | null; status: string; deadlineAt: string | null; files: { id: string; name: string }[] };
type PortalRecord = { key: string; type: string; section: string; title: string; fields: Record<string, unknown> };
type ScanReport = { label: string; trusted: boolean; baseline: boolean; recordCount: number; unchangedCount: number | null; addedCount: number; changedCount: number; removedCount: number; warnings: string[]; sections: Record<string, { ok: boolean; count: number; skipped?: boolean; error?: string }>; records: PortalRecord[] };
type ScanHistory = { source: string; scanId: string; finishedAt: string; trusted: boolean; report: ScanReport };
type Integration = { kind: string; status: string; lastSuccessAt: string | null; lastErrorMessage: string | null; connected: boolean };
type StoredFile = { id: string; name: string; mimeType: string; sizeBytes: number; createdAt: string };
type ExtensionReport = { source: string; trusted: boolean; records: PortalRecord[] };
type ExtensionScan = { scanId: string; finishedAt: number; reports: ExtensionReport[]; errors: { portal: string; error: string }[] };
type BridgeResponse = { ok: boolean; error?: string };
type Page = "radar" | "exams" | "deadlines" | "calendar" | "attendance" | "projects" | "files" | "more";

const nav: { id: Page; label: string; icon: string }[] = [
  { id: "radar", label: "Radar", icon: "◉" }, { id: "exams", label: "Exam Hub", icon: "▤" },
  { id: "deadlines", label: "Deadlines", icon: "☷" }, { id: "calendar", label: "Calendar", icon: "▦" },
  { id: "projects", label: "Projects", icon: "▱" }, { id: "attendance", label: "Attendance", icon: "◴" },
  { id: "files", label: "Files", icon: "▧" }, { id: "more", label: "More · AMS & Moodle", icon: "⋯" },
];

function dateLabel(value: string | null | undefined) {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function Dashboard() {
  const router = useRouter();
  const [page, setPage] = useState<Page>("radar");
  const [csrf, setCsrf] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [driveConnected, setDriveConnected] = useState(false);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [scans, setScans] = useState<ScanHistory[]>([]);
  const [extension, setExtension] = useState<"checking" | "connected" | "offline">("checking");
  const [scanState, setScanState] = useState("");
  const [now, setNow] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const uploadProjectId = useRef("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const generalUploadInput = useRef<HTMLInputElement>(null);

  const request = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.method && init.method !== "GET" ? { "X-CSRF-Token": csrf } : {}), ...init?.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
    return data as T;
  }, [csrf]);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [settings, me, eventData, feedData, reminderData, attendanceData, projectData, integrationData, scanData, storageData, fileData] = await Promise.all([
        fetch("/api/v1/settings", { credentials: "same-origin", cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error("Could not load your account settings."); return r.json(); }),
        fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error("Your sign-in expired. Sign in again."); return r.json(); }),
        fetch("/api/v1/events?limit=100", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/feed?limit=100", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/reminders", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/attendance/summary", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/projects", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/integrations", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/integrations/scan", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/storage/drive", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
        fetch("/api/v1/storage/files?folderId=root", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()),
      ]);
      if (settings.csrfToken) setCsrf(settings.csrfToken);
      setNow(new Date().toISOString());
      setUser({ name: me.name || me.email, email: me.email });
      setEvents(eventData.items || []); setFeed(feedData.items || []); setReminders(reminderData.items || []); setAttendance(attendanceData.items || []);
      setProjects(projectData.items || []); setIntegrations(integrationData.items || []); setScans(scanData.items || []);
      setDriveConnected(Boolean(storageData.connected));
      setStoredFiles(fileData.items || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your saved data."); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    const fromHash = () => { const raw = location.hash.slice(1); const candidate = (raw === "overview" || raw === "integrations" || raw === "reminders" ? (raw === "integrations" || raw === "reminders" ? "more" : "radar") : raw) as Page; setPage(nav.some((item) => item.id === candidate) ? candidate : "radar"); };
    fromHash(); window.addEventListener("hashchange", fromHash); return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.unidash !== "event") return;
      const message = event.data;
      if (message.type === "BRIDGE_READY") setExtension("connected");
      if (message.type === "SCAN_PROGRESS") setScanState(`${message.label || message.portal}: ${message.hint || message.stage}${message.error ? ` — ${message.error}` : ""}`);
      if (message.type === "SCAN_RESULT") {
        setScanState("Saving the portal scan and updating your dashboard…");
        void (async () => {
          try {
            const result = message.result as ExtensionScan;
            await request("/api/v1/integrations/scan", { method: "POST", body: JSON.stringify(result) });
            const ams = result.reports?.find((report) => report.source === "ams" && report.trusted);
            const records = (ams?.records || []).flatMap((record) => {
              const startsAt = record.fields?.["Starts at (IST)"];
              if (typeof startsAt !== "string" || !startsAt || Number.isNaN(Date.parse(startsAt)) || Date.parse(startsAt) < Date.now()) return [];
              const quiz = record.type === "quiz";
              if (!quiz && record.type !== "calendar_event") return [];
              const code = quiz ? String(record.fields?.Course || "").match(/^\s*(\d{6,})\b/) : null;
              return [{ sourceRef: record.key, title: record.title, description: quiz ? `Course: ${record.fields?.Course || ""}\nDeadline: ${record.fields?.Deadline || ""}` : "Imported from the trusted AMS calendar scan.", kind: quiz ? "QUIZ" : "OTHER", subjectCode: code?.[1] ?? null, startsAt, endsAt: record.fields?.["Ends at (IST)"] || null, isDeadline: quiz, isAllDay: !quiz }];
            });
            if (records.length) await request("/api/v1/integrations/ams/import", { method: "POST", body: JSON.stringify({ source: "AMS", trusted: true, records }) });
            for (const report of result.reports || []) {
              if (report.source !== "moodle" || !report.trusted) continue;
              const moodleRecords = report.records.flatMap((record) => {
                const startsAt = record.fields?.["Due at"];
                if (record.type !== "deadline" || typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt)) || Date.parse(startsAt) <= Date.now()) return [];
                const rawType = String(record.fields?.["Type"] || "").toLowerCase();
                if (!/quiz|assign/.test(rawType)) return [];
                const course = String(record.fields?.["Course"] || "");
                const code = course.match(/^\s*(\d{6,})\b/);
                return [{ sourceRef: record.key, title: record.title, description: `${course ? `Course: ${course}\n` : ""}${record.fields?.["Type"] || "Moodle deadline"}`, kind: /quiz/.test(rawType) ? "QUIZ" : "ASSIGNMENT", startsAt, subjectCode: code?.[1] ?? null }];
              });
              if (moodleRecords.length) await request("/api/v1/integrations/moodle/import", { method: "POST", body: JSON.stringify({ trusted: true, records: moodleRecords }) });
            }
            setScanState("Scan saved. Your dashboard now shows the latest trusted portal data."); await refresh();
          } catch (cause) { setScanState(cause instanceof Error ? cause.message : "Could not save the portal scan."); }
        })();
      }
    };
    window.addEventListener("message", onMessage); return () => window.removeEventListener("message", onMessage);
  }, [request, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const id = `initial_ping_${Date.now()}`;
      const timeout = window.setTimeout(() => setExtension((value) => value === "checking" ? "offline" : value), 2000);
      const handler = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== location.origin || event.data?.unidash !== "response" || event.data.id !== id) return;
        window.clearTimeout(timeout); window.removeEventListener("message", handler); setExtension(event.data.ok ? "connected" : "offline");
      };
      window.addEventListener("message", handler);
      window.postMessage({ unidash: "request", id, type: "PING" }, location.origin);
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const upcoming = useMemo(() => events.filter((event) => now && Date.parse(event.startsAt) >= Date.parse(now) && event.progress !== "DONE" && event.progress !== "SKIPPED").sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)), [events, now]);
  const unread = feed.filter((item) => !item.readAt);
  const runScan = async () => {
    setBusy(true); setScanState("Starting the Edge extension scan…");
    try {
      const response = await new Promise<BridgeResponse>((resolve) => {
        const id = `react_${Date.now()}`; const timer = setTimeout(() => resolve({ ok: false, error: "Extension did not respond. Pair it with this site and try again." }), 5000);
        const handler = (event: MessageEvent) => { if (event.source === window && event.origin === location.origin && event.data?.unidash === "response" && event.data.id === id) { clearTimeout(timer); window.removeEventListener("message", handler); resolve(event.data); } };
        window.addEventListener("message", handler); window.postMessage({ unidash: "request", id, type: "SCAN_START" }, location.origin);
      });
      if (!response.ok) { setExtension("offline"); throw new Error(response.error || "Could not start the scan."); }
      setScanState("The scan is running. Sign in to the portal tabs if prompted; this report updates when extraction finishes.");
    } catch (cause) { setScanState(cause instanceof Error ? cause.message : "Scan failed to start."); }
    finally { setBusy(false); }
  };

  const addProject = async (event: FormEvent) => {
    event.preventDefault(); if (!projectTitle.trim()) return;
    setBusy(true); setError("");
    try { await request("/api/v1/projects", { method: "POST", body: JSON.stringify({ title: projectTitle.trim(), type: "PROJECT" }) }); setProjectTitle(""); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Project could not be saved."); }
    finally { setBusy(false); }
  };

  const uploadProjectFiles = async (projectId: string, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file); form.append("projectId", projectId);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        if (relativePath) form.append("relativePath", relativePath);
        const response = await fetch("/api/v1/storage/files", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrf }, body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error?.message || `Could not upload ${file.name}.`);
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload project files."); }
    finally { setBusy(false); if (uploadInput.current) uploadInput.current.value = ""; if (folderInput.current) folderInput.current.value = ""; }
  };

  const uploadDriveFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/v1/storage/files", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrf }, body: form });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result?.error?.message || `Could not upload ${file.name}.`);
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload files."); }
    finally { setBusy(false); if (generalUploadInput.current) generalUploadInput.current.value = ""; }
  };

  const addEvent = async (event: FormEvent) => {
    event.preventDefault(); if (!eventTitle.trim() || !eventDate) return;
    setBusy(true); setError("");
    try {
      await request("/api/v1/events", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ title: eventTitle.trim(), kind: "QUIZ", startsAt: new Date(eventDate).toISOString(), isDeadline: true }) });
      setEventTitle(""); setEventDate(""); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reminder could not be saved."); }
    finally { setBusy(false); }
  };

  const pageTitle = nav.find((item) => item.id === page)?.label || "Radar";
  return <div className="app-shell">
    <aside className="app-sidebar"><a className="brand" href="#radar"><span>U</span><b>UniDash</b></a><nav aria-label="Main navigation">{nav.map((item) => <a key={item.id} className={page === item.id ? "active" : ""} href={`#${item.id}`}><i>{item.icon}</i>{item.label}</a>)}</nav><div className="sidebar-note"><span className={extension === "connected" ? "live-dot" : "muted-dot"} />Edge extension {extension === "connected" ? "paired" : "not paired"}</div></aside>
    <main className="app-main"><header className="app-topbar"><div><small>YOUR ACADEMIC RADAR</small><h1>{pageTitle}</h1></div><div className="user-chip"><span>{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><div>{user?.name || "Loading account"}<small>{user?.email || ""}</small></div><button onClick={() => { void fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).finally(() => router.push("/login")); }}>Sign out</button></div></header>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="toolbar"><span className="live-dot" /> Data is loaded from your UniDash account and saved portal scans <button onClick={() => void refresh()} disabled={busy}>Refresh</button></div>
      {page === "radar" && <><section className="metric-grid"><Metric label="Upcoming items" value={upcoming.length} detail="Saved events and deadlines"/><Metric label="Unread updates" value={unread.length} detail="From your saved feed"/><Metric label="Attendance courses" value={attendance.length} detail="Real saved attendance only"/><Metric label="Projects" value={projects.length} detail="Stored in your account"/></section><section className="content-grid"><Panel title="Academic radar" action={<a href="#calendar">Open calendar →</a>}><div className="radar-visual" role="img" aria-label={`Radar overview with ${upcoming.length} saved upcoming items`}><div className="radar-sweep"/><div className="radar-center">U</div>{upcoming.slice(0, 8).map((event, index) => <span key={event.id} className="radar-point" style={{ left: `${18 + ((index * 31) % 68)}%`, top: `${17 + ((index * 47) % 66)}%` }} title={event.title}/>)}</div><p className="muted">Radar plots your saved upcoming items. It does not invent or estimate events.</p></Panel><Panel title="Coming up" action={<a href="#deadlines">All deadlines →</a>}>{upcoming.length ? upcoming.slice(0, 6).map((event) => <EventRow key={event.id} event={event}/>) : <Empty>No upcoming events saved yet. Scan a portal or add an event below.</Empty>}</Panel></section><section className="content-grid"><Panel title="Needs attention" action={<a href="#attendance">Attendance →</a>}>{attendance.filter((row) => row.percentage < 75).length ? attendance.filter((row) => row.percentage < 75).map((row) => <div className="feed-row" key={row.subjectId}><b>{row.subjectName}</b><p>{row.percentage.toFixed(1)}% attendance · below your 75% threshold</p></div>) : <Empty>No saved attendance warnings.</Empty>}</Panel><Panel title="Latest updates" action={<a href="#more">More →</a>}>{feed.length ? feed.slice(0, 5).map((item) => <div className="feed-row" key={item.id}><b>{item.title}</b><p>{item.body || item.kind}</p><small>{dateLabel(item.createdAt)}</small></div>) : <Empty>No saved updates yet.</Empty>}</Panel></section><Panel title="Quick add"><form className="inline-form" onSubmit={addEvent}><input required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Quiz, assignment, or event"/><input required type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)}/><button className="primary" disabled={busy}>Save reminder</button></form><p className="muted">Saved events receive supported in-app reminders; the worker must be running for due notifications.</p></Panel></>}
      {page === "exams" && <Panel title="Exam Hub · saved assessments">{upcoming.filter((event) => /EXAM|QUIZ|VIVA|PRESENTATION/.test(event.kind)).length ? upcoming.filter((event) => /EXAM|QUIZ|VIVA|PRESENTATION/.test(event.kind)).map((event) => <EventRow key={event.id} event={event}/>) : <Empty>No saved exams or quizzes yet. Trusted dated quiz records from AMS/Moodle appear here after a scan.</Empty>}</Panel>}
      {page === "deadlines" && <><Panel title="Deadlines and tasks" action={<a href="#more">Scan portals →</a>}>{upcoming.filter((event) => event.kind === "ASSIGNMENT" || event.kind === "PROJECT_MILESTONE" || event.kind === "LAB_FILE_SUBMISSION" || event.kind === "NOTICE_DEADLINE" || event.kind === "QUIZ").length ? upcoming.filter((event) => ["ASSIGNMENT", "PROJECT_MILESTONE", "LAB_FILE_SUBMISSION", "NOTICE_DEADLINE", "QUIZ"].includes(event.kind)).map((event) => <EventRow key={event.id} event={event}/>) : <Empty>No saved deadlines yet. No sample deadlines are shown.</Empty>}</Panel><Panel title="Add a deadline"><form className="inline-form" onSubmit={addEvent}><input required value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Assignment or deadline title"/><input required type="datetime-local" value={eventDate} onChange={(e) => setEventDate(e.target.value)}/><button className="primary" disabled={busy}>Save deadline</button></form></Panel></>}
      {page === "calendar" && <Panel title="Calendar · saved events">{events.length ? [...events].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map((event) => <EventRow key={event.id} event={event}/>) : <Empty>No real calendar entries are saved yet. Use More → scan enabled portals after pairing the extension.</Empty>}</Panel>}
      {page === "attendance" && <Panel title="Attendance from saved portal data">{attendance.length ? attendance.map((row) => <div className="attendance-row" key={row.subjectId}><div><b>{row.subjectCode ? `${row.subjectCode} · ` : ""}{row.subjectName}</b><small>{row.attended} of {row.total} classes · updated {dateLabel(row.asOf)}</small></div><strong>{row.percentage.toFixed(1)}%</strong><div className="meter"><span style={{ width: `${Math.max(0, Math.min(100, row.percentage))}%` }}/></div></div>) : scans.find((scan) => scan.source === "AMS")?.report.records.filter((record) => record.type === "attendance").map((record) => { const percentage = String(record.fields.Attendance || "").match(/[\d.]+/); return <div className="attendance-row" key={record.key}><div><b>{record.title}</b><small>{String(record.fields["Classes Attended"] || "Attendance from AMS")}</small></div><strong>{percentage ? `${percentage[0]}%` : "—"}</strong><div className="meter"><span style={{ width: `${Math.max(0, Math.min(100, Number(percentage?.[0] || 0)))}%` }}/></div></div>; }) || <Empty>No real AMS attendance data has been saved. Pair the Edge extension, sign in to AMS, and run a scan to see course attendance here.</Empty>}</Panel>}
      {page === "projects" && <><Panel title="Project storage"><p className="muted">Project folders and files stay in your Google Drive. HTML project files open in a new tab through the authenticated site preview.</p>{driveConnected ? <form className="inline-form" onSubmit={addProject}><input required value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} placeholder="Project title"/><button className="primary" disabled={busy}>Create project</button></form> : <a className="button-link" href="/api/v1/storage/drive/connect">Connect Google Drive</a>}</Panel><section className="project-grid">{projects.length ? projects.map((project) => <article className="panel project-card" key={project.id}><span className="badge">{project.status.replaceAll("_", " ")}</span><h2>{project.title}</h2><p>{project.description || "No description"}</p><small>{project.deadlineAt ? `Due ${dateLabel(project.deadlineAt)}` : "No deadline"} · {project.files.length} file(s)</small><div className="project-file-actions"><button type="button" disabled={busy || !driveConnected} onClick={() => { uploadProjectId.current = project.id; uploadInput.current?.click(); }}>Upload files</button><button type="button" disabled={busy || !driveConnected} onClick={() => { uploadProjectId.current = project.id; folderInput.current?.click(); }}>Upload folder</button></div>{project.files.map((file) => <div className="project-file" key={file.id}><span>{file.name}</span>{/\.html?$/i.test(file.name) && <button type="button" onClick={() => window.open(`/api/v1/projects/${project.id}/files/${file.id}/preview`, "_blank", "noopener,noreferrer")}>Open site ↗</button>}</div>)}</article>) : <Panel title="Your projects"><Empty>No projects are saved yet.</Empty></Panel>}</section><input ref={uploadInput} className="visually-hidden-input" type="file" multiple onChange={(e) => void uploadProjectFiles(uploadProjectId.current, e.currentTarget.files)}/><input ref={folderInput} className="visually-hidden-input" type="file" multiple onChange={(e) => void uploadProjectFiles(uploadProjectId.current, e.currentTarget.files)} {...({ webkitdirectory: "" } as Record<string, string>)}/></>}
      {page === "files" && <><Panel title="Files in Google Drive">{driveConnected ? <><button className="button-link" type="button" disabled={busy} onClick={() => generalUploadInput.current?.click()}>Upload files</button>{storedFiles.length ? storedFiles.map((file) => <div className="project-file" key={file.id}><span>{file.name}<small>{Math.round(file.sizeBytes / 1024)} KB · {dateLabel(file.createdAt)}</small></span><a href={`/api/v1/storage/files/${file.id}`}>Download</a></div>) : <Empty>Your Drive-backed library has no files yet.</Empty>}</> : <><p className="muted">Files uploaded here are stored in your Google Drive.</p><a className="button-link" href="/api/v1/storage/drive/connect">Connect Google Drive</a></>}</Panel><input ref={generalUploadInput} className="visually-hidden-input" type="file" multiple onChange={(e) => void uploadDriveFiles(e.currentTarget.files)}/></>}
      {page === "more" && <><Panel title="AMS and Moodle integration"><p className="muted">Scans run when you request them using the paired Edge extension and your existing portal sessions. Portal passwords and tokens are not stored by UniDash.</p><div className="actions"><button className="primary" onClick={() => void runScan()} disabled={busy}>{busy ? "Starting…" : "Scan enabled portals"}</button><button onClick={() => { setExtension("checking"); window.postMessage({ unidash: "request", id: `ping_${Date.now()}`, type: "PING" }, location.origin); setTimeout(() => setExtension((value) => value === "checking" ? "offline" : value), 1500); }}>Check extension</button><a href="#reminders">Reminders →</a></div>{scanState && <div className="notice" role="status">{scanState}</div>}</Panel><section className="integration-grid">{["AMS", "MOODLE"].map((kind) => { const status = integrations.find((item) => item.kind === kind); const latest = scans.find((scan) => scan.source === kind); return <article className="panel integration-card" key={kind}><div className="split"><h2>{kind === "AMS" ? "Academic Management System" : "Moodle"}</h2><span className={`badge ${status?.connected ? "good" : ""}`}>{status?.connected ? "Connected" : status?.status || "Not scanned"}</span></div><p>{latest ? `${latest.trusted ? "Trusted scan" : "Needs review"} · ${latest.report.recordCount} records · ${dateLabel(latest.finishedAt)}` : "No browser scan saved yet."}</p>{status?.lastErrorMessage && <p className="warn">{status.lastErrorMessage}</p>}</article>; })}</section>{scans.length > 0 && <Panel title="Latest real portal scan reports">{scans.slice(0, 2).map((scan) => <div className="scan-source" key={`${scan.source}:${scan.scanId}`}><div className="split"><h3>{scan.source === "AMS" ? "AMS" : "Moodle"} · {scan.report.label}</h3><span className={`badge ${scan.trusted ? "good" : "warn-badge"}`}>{scan.trusted ? "Trusted scan" : "Review needed"}</span></div><p className="muted">{scan.report.baseline ? "Baseline scan" : `+${scan.report.addedCount} added · ${scan.report.changedCount} changed · ${scan.report.removedCount} removed · ${scan.report.unchangedCount ?? 0} unchanged`} · {scan.report.recordCount} records · {dateLabel(scan.finishedAt)}</p>{scan.report.warnings.map((warning) => <p className="warn" key={warning}>{warning}</p>)}{scan.report.records.length > 0 ? <div className="record-list">{scan.report.records.slice(0, 30).map((record) => <RecordRow record={record} key={record.key}/>)}</div> : <Empty>No record details were returned for this scan.</Empty>}</div>)}</Panel>}<Panel title="Reminders"><p className="muted">Scheduled reminders are based on events saved to your account. The worker sends in-app notifications.</p><a href="#reminders">Review reminders →</a></Panel><Panel title="Account"><p>{user?.name} · {user?.email}</p><button onClick={() => { void fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" }).finally(() => router.push("/login")); }}>Sign out</button></Panel></>}
      {page === "more" && <Panel title="Your reminders"><p className="muted">{reminders.length} pending reminders saved for your account.</p>{reminders.length ? reminders.map((item) => <article className="event-row" key={item.id}><span className="event-date">Remind {dateLabel(item.remindAt)}</span><div><b>{item.title}</b><small>{item.offsetLabel || item.kind} · Event {dateLabel(item.startsAt)} · {item.state.toLowerCase()}</small></div></article>) : <Empty>No scheduled reminders yet.</Empty>}{feed.length > 0 && <><h3 className="subheading">Recent notifications</h3>{feed.slice(0, 8).map((item) => <div className="feed-row" key={item.id}><b>{item.title}</b><p>{item.body || item.kind}</p><small>{dateLabel(item.createdAt)}</small></div>)}</>}</Panel>}
      <footer className="app-footer">Personal dashboard · Your imported records are scoped to this account.</footer>
    </main>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) { return <article className="panel metric"><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>; }
function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="panel section-panel"><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>; }
function Empty({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
function EventRow({ event }: { event: EventItem }) { return <article className="event-row"><span className="event-date">{dateLabel(event.startsAt)}</span><div><b>{event.title}</b><small>{event.subjectCode ? `${event.subjectCode} · ` : ""}{event.kind.replaceAll("_", " ")} · {event.source}</small></div></article>; }
function RecordRow({ record }: { record: PortalRecord }) { return <details className="record-row"><summary><span>{record.title || "Untitled record"}</span><small>{record.section} · {record.type}</small></summary><dl>{Object.entries(record.fields || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value ?? "")}</dd></div>)}</dl></details>; }
