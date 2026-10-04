# UniDash v2 — Master Build Prompt

> **Tagline:** *One dashboard for your whole academic life.*
> Exams (majors and minors), quizzes, assignments, presentations, projects, files, attendance and grades — auto-synced from the college **AMS**, **Moodle** and **selected WhatsApp chats**, with smart alerts so nothing is ever missed.

| | |
|---|---|
| **Version** | 2.1 (complete: Sections 0–21 and Appendices A–C; replaces the v1 spec) |
| **Date** | 2 October 2026 |
| **Audience** | An AI coding assistant, and the student who owns and operates the app |
| **Wording** | MUST / SHOULD / MAY follow RFC 2119: MUST = mandatory, SHOULD = strong default, MAY = optional |

---

## How to use this document

1. Fill in **Section 0**. Anything left blank uses the stated default.
2. Paste this whole document as the first message to your AI coding assistant, or save it as `docs/SPEC.md` in an empty repository and say: *"Read docs/SPEC.md completely, then follow Section 21."*
3. The assistant MUST follow **Section 1** at all times and MUST NOT write application code before finishing the kickoff in **Section 21**.
4. Build in the order given in **Section 20**. Phase 0 comes first: it proves the risky parts (college login, Moodle access, WhatsApp) work *before* any screen is built.
5. At the start of each phase say: *"Re-read Sections X, Y, Z of docs/SPEC.md, then start Phase N."*

**Reading map**

| Working on | Read sections |
|---|---|
| Any task | 0, 1, 2, 3 |
| Architecture, database | 4, 5, 6 |
| AMS connector | 7, 4.5, 4.6, Appendix A |
| Moodle connector | 8, 4.5, 4.6, Appendix A |
| WhatsApp | 9, Appendix B |
| Screens and UX | 10, 14 |
| Alerts and reminders | 11 |
| Security | 12 |
| Testing, jobs, deployment | 13, 16, 18, 19 |
| API | 15 |
| Repository layout, environment, CI | 17 |
| Operations, incidents, risks, policy | 19 |
| Build order, kickoff, reusable prompts | 20, 21, Appendix C |

---

## The Student's Brief (why this app exists)

In the student's own words, summarised. It does not override any rule below; it explains the priorities.

1. **Biggest pain:** too many files, projects, presentations and schedules: exam dates (**majors and minors**), presentation dates, quizzes, assignments, all spread over several systems.
2. The website must **connect directly to the college AMS and the college Moodle** and tell the student about **anything new** that happens there.
3. It must **access one particular WhatsApp group** and show information **only from particular people** in that chat.
4. This prompt must be **highly detailed**, covering everything from big decisions to minor details. The student will answer any questions the assistant asks.

| Pain | Where it is solved |
|---|---|
| Too many dates (majors, minors, quizzes, presentations) | Exam Hub 10.2, Deadlines board 10.3, Calendar 10.4, reminders 11.4 |
| Too many files | Files 10.7, Subject Hub 10.5, Moodle auto-download 8.6 |
| Projects and presentations | 10.6, tables 6.5 |
| "Tell me when anything new happens" | Change-detection engine 4.5, notification engine 11, schedules 16 |
| Direct connection to AMS and Moodle | Sections 7 and 8, Phase 0 feasibility test (Section 20) |
| Specific people in a WhatsApp group | Section 9 (tracked people, proposals), Appendix B |

---

## 0. Project Configuration Sheet (fill in — defaults apply if blank)

> The assistant MUST list every default it relies on during kickoff (Section 21) and ask the student to confirm or correct them.

### A. College systems

| # | Question | Your answer | Default if blank |
|---|---|---|---|
| A1 | College / university name | | — |
| A2 | AMS login-page URL | | — (Phase 0 cannot start without it) |
| A3 | How do you log in to AMS? (Google / college Gmail, username + password, other) | | Google sign-in |
| A4 | Anything extra at AMS login? (OTP, CAPTCHA, "approve on phone") | | Assume yes, so login is human-assisted |
| A5 | Does AMS open on mobile data (off campus)? | | Unknown, tested in Phase 0 |
| A6 | Moodle URL | | — |
| A7 | How do you log in to Moodle? | | Same as AMS |
| A8 | Does the official Moodle mobile app work for your college? How does it log in (browser window, or username + password)? | | Unknown, tested in Phase 0 |
| A9 | Does the college have an AMS / ERP mobile app? (Such apps often use an easy JSON API.) | | Unknown |
| A10 | College e-mail domain | | none (an invite-only allow-list is used anyway) |

### B. Academic structure

| # | Question | Your answer | Default if blank |
|---|---|---|---|
| B1 | Programme, branch, semester, section / lab batch | | learned from AMS profile |
| B2 | Subjects: code, name, faculty, theory or lab, credits | | auto-imported from AMS and Moodle during onboarding |
| B3 | Exam names your college uses and what each is worth (e.g. Minor-1 15, Minor-2 15, Major 50, Practical 20) | | Minor-1, Minor-2, Major (End-Sem), Practical, Viva |
| B4 | Minimum attendance % and any condonation rule | | 75 % |
| B5 | Semester start / end and approximate exam windows | | learned from AMS |
| B6 | Kinds of projects and presentations you get (mini-project, seminar, lab file, group presentation …) | | all of them |

### C. WhatsApp

| # | Question | Your answer | Default if blank |
|---|---|---|---|
| C1 | Group name(s) to monitor | | — |
| C2 | People to track (label, role, number if known), e.g. "Rahul — CR", "Prof. Sharma" | | picked in the app from the group's member list |
| C3 | Also track one-to-one chats with those people? | | No |
| C4 | Listener account: your main number, or a spare number / SIM that joins the group? | | Spare number recommended; main number allowed, strictly read-only |
| C5 | Languages used in the group (English, Hinglish, Hindi in Devanagari) | | English + Hinglish |
| C6 | Also surface keyword alerts from *anyone* in the group (not only tracked people)? | | No |
| C7 | How long to keep stored messages | | 90 days |

### D. Users, hosting, money

| # | Question | Your answer | Default if blank |
|---|---|---|---|
| D1 | Who uses it at launch? (names and Google e-mails; may be college or personal Gmail) | | only the owner; friends added later |
| D2 | Who owns and operates the server? | | the owner |
| D3 | Where can the always-on background worker run? (own laptop / PC, always-on PC or Raspberry Pi in hostel or home, rented VPS, free cloud tier) | | decided after the Phase 0 network test |
| D4 | Monthly budget in ₹ | | 0 (up to ₹500 only if clearly needed) |
| D5 | Custom domain? | | no, free subdomain |

### E. Preferences and environment

| # | Question | Your answer | Default if blank |
|---|---|---|---|
| E1 | Alert channels: in-app, phone push, Telegram, e-mail, WhatsApp message | | in-app + phone push |
| E2 | Daily digest time and quiet hours | | 07:30 IST; quiet 23:00–06:30 |
| E3 | Theme and clock | | dark default with toggle; 12-hour clock |
| E4 | Your computer OS, and the editor / AI tool you use | | — |
| E5 | Coding comfort: beginner / some / experienced | | beginner (extra-clear explanations) |

---

## 1. Role and Working Agreement (rules for the AI builder)

### 1.1 Your role
You are, at once, a senior full-stack TypeScript engineer, a security reviewer and a product-minded UX designer, mentoring a student who may be new to professional software practice. You are building UniDash for a real person with real college accounts, so correctness, safety and calm behaviour matter more than feature count.

### 1.2 Prime directives (non-negotiable)
1. **Read-only toward the outside world.** UniDash never submits, edits, deletes, marks or sends anything on AMS, Moodle or WhatsApp. Moodle calls go through a hard-coded allow-list of read functions (Section 8.10). WhatsApp sending functions are never imported.
2. **Never guess external structure.** If you need an AMS page layout, endpoint, field name or Moodle behaviour you have not seen, stop and ask for a sample (Appendix A). Never invent selectors or response shapes.
3. **Secrets are sacred.** No secret in code, git history, logs, error messages, URLs, client bundles or screenshots. Secrets live only in environment variables or the vault module (Section 12).
4. **Vertical slices.** Deliver thin end-to-end increments that run (migration + backend + UI + tests + how to verify), not horizontal layers.
5. **Explain simply.** For every step: what, why, the exact command, the expected output, and what to do if it fails. Define jargon at first use.
6. **Verify, don't assume.** Before installing a library or using an API, check its latest stable version and current documentation. Do not trust version numbers or API shapes from this document or from memory. Pin exact versions via the lockfile.
7. **Fail safe.** A failed, partial or malformed fetch MUST NEVER overwrite good data or trigger notifications. Pipeline: fetch → validate → compare → commit in one transaction.
8. **Idempotent everywhere.** Re-running any job, event or sync MUST NOT create duplicate rows, files or notifications (use natural keys and `dedupe_key`s).
9. **No silent failures.** Every integration always shows: status, last successful sync time, and a human-readable reason when unhealthy.
10. **Isolate what changes.** Everything specific to the college portal lives in one adapter folder (selectors, mappers, fixtures) so a layout change is a small fix.
11. **Calm product.** Notify only when it matters; batch noise. The student's trust in alerts *is* the product.
12. **Leave a trail.** Maintain `README.md`, `docs/SPEC.md`, `docs/FEASIBILITY.md`, `docs/DECISIONS.md` (short ADRs), `docs/PROGRESS.md` (done / next / blocked) and `docs/RUNBOOK.md` (how to operate and fix things).

### 1.3 Communication protocol
- **Start of every phase:** a plan of at most 10 lines, plus a list of anything you need from the student (samples, URLs, decisions).
- **End of every slice:** what was built, how to run it, how to test it, known limitations, proposed next step.
- **If blocked or the spec conflicts with reality** (e.g. the portal forbids something): stop, explain, and offer 2–3 options with trade-offs. Never deviate silently.
- **When the student is unsure** about a technical choice, recommend one option and say why; don't dump a menu.

### 1.4 Coding standards
- TypeScript `strict`; ESLint + Prettier; a single package manager with workspaces (pnpm preferred).
- Validate every boundary with Zod: environment variables at startup (fail fast), HTTP input, scraped payloads, queue payloads.
- Time: store UTC `timestamptz`; display `Asia/Kolkata` (IST, UTC+05:30, no daylight saving). Never parse college dates with `new Date("dd/mm/yyyy")`; use an explicit day-first parser.
- Structured logging (pino) with the redaction list from Section 12.6. No `console.log` in committed code.
- Database changes only through migrations. The seed script creates **fake** data only.
- Typed error classes with stable string codes (Section 7.8). No swallowed exceptions.
- Feature flags for risky features (WhatsApp, LLM-assisted extraction, WhatsApp-message alerts).
- `.gitignore` MUST cover `.env*`, session / auth directories, scraper artifacts, local storage folders.
- Tests ship with code: fixture-based parser tests, unit tests for pure logic, at least one end-to-end happy path per phase.

### 1.5 Definition of Done (every slice)
1. Works end-to-end locally with real or fixture data.
2. Type-check, lint and tests pass in CI.
3. Migration and seed updated; the app starts from a clean checkout using documented commands.
4. Loading, empty and error states exist.
5. No new secret or personal data in the repo; logs are redacted.
6. Docs updated (README, PROGRESS, DECISIONS).
7. The student has been told exactly how to verify it and what is still limited.

### 1.6 Never do
- Bypass or auto-solve CAPTCHA, OTP or 2-factor prompts.
- Ask for, accept or store the student's **Google password**.
- Send, forward, react to, edit or delete a WhatsApp message; join or leave groups; mark chats as read; broadcast online presence.
- Write anything to AMS or Moodle.
- Access any account other than the signed-in user's own.
- Put real names, roll numbers, phone numbers, messages, cookies or tokens into fixtures, tests, commits, issue text or prompts.
- Store WhatsApp messages from groups or people the student has not explicitly selected.
- Run scrapers more often than Section 16 allows, or keep retrying after repeated authentication failures (this can lock the student's account).
- Put passwords in URLs or query strings (the v1 spec's Moodle token example did; fix it: use POST over HTTPS).

---


## 2. Problem, Vision, Priorities and User Stories

### 2.1 The problem
Everything a student must track is scattered:

| Where it lives | What is in it | Pain |
|---|---|---|
| **AMS** (college ERP) | attendance, timetable, exam date-sheet, marks, notices, fees | Many logins and clicks; a new date-sheet or a rescheduled exam is easy to miss |
| **Moodle** | assignments, quizzes, lecture files, announcements, submission status | Deadlines buried across courses; downloaded files pile up un-organised |
| **WhatsApp groups** | last-minute changes, "quiz tomorrow", presentation slots, files from CR and faculty | Hundreds of messages; the one that matters (from one particular person) is lost |
| **Personal** | projects, presentations, lab files, notes | No single place, no deadlines attached, files scattered over phone, laptop and chats |

Result: missed deadlines, surprise quizzes, confusion about *which* exam (minor or major) is when, and lost files.

### 2.2 Vision and measurable success criteria
UniDash is a calm, mobile-first **academic radar**. Opening it answers three questions in under 10 seconds: *What is due or coming up? What changed since I last looked? Am I safe on attendance?*

| Goal | Target |
|---|---|
| New Moodle assignment / quiz / file appears and alerts | ≤ 30 min (API tier), ≤ 60 min (session tiers) |
| Exam date or notice change on AMS is detected | ≤ 2 h normally, ≤ 1 h in exam season, flagged "rescheduled" with old → new |
| Message from a tracked person in a monitored WhatsApp group appears | ≤ 30 s while the listener is online |
| Date-bearing WhatsApp message becomes a proposed calendar entry | ≤ 1 min |
| Duplicate notifications for the same underlying change | zero (tested) |
| Manual data entry for anything that exists in AMS or Moodle | zero |
| Moodle files auto-filed into the right subject folder | ≥ 95 % once course mapping is confirmed |
| Write requests sent to AMS or Moodle | zero (verified by a request-log test) |
| Home screen usable on a mid-range phone over 4G | < 2.5 s |

### 2.3 Non-goals
Not a replacement for AMS or Moodle; no submitting of assignments; no marking attendance; no sending WhatsApp messages; no public sign-up or paid SaaS; no tools for cheating; no collection of other students' private data.

### 2.4 Priority tiers

| Tier | Meaning | Items |
|---|---|---|
| **P0** | Needed in v1; they solve the stated pain | Unified **Deadlines and Exams radar** (majors, minors, quizzes, assignments, presentations, projects, labs, vivas); **Moodle sync**; **AMS sync**; **change detection + alerts + reminders**; **WhatsApp tracked-people feed + proposed events**; calendar (day / week / month / agenda / semester timeline) + `.ics` feed; **Subject Hub** + auto-organised files (Moodle auto-download); **projects and presentations tracker** with tasks and milestones; invite-only sign-in; encrypted credential vault; integration health and re-login flows; mobile-first installable PWA; dark and light themes |
| **P1** | Strongly wanted next | Attendance "can I skip?" calculator and simulator; global search; daily and weekly digests; file inbox with routing rules, versions, tags, bulk ZIP, previews, text search; Telegram and e-mail channels; grade summaries and "marks needed" calculator; natural-language quick-add; shared project workspaces between UniDash users |
| **P2** | Nice to have | PWA share-target (send files from phone to UniDash); WhatsApp chat-export import (fallback); study planner; OCR for photographed notices; Office-document preview by conversion; read-only Gmail connector; optional LLM-assisted extraction |
| **Later** | Ideas | Class-wide shared sync pool; voice-note transcription; home-screen widgets |

### 2.5 Users
- **Owner** — the student who runs the app; sees the admin / health page; holds the server and keys.
- **Member** — a friend with their own invite and their own integrations. Members never see each other's data, credentials or messages (except explicitly shared project workspaces, P1).

### 2.6 Key user stories
1. I open the app and instantly see what is overdue, what is due in the next 24 hours, and the next exam, on one screen.
2. I see every **Minor** and **Major** exam per subject with countdown, venue, syllabus, and a warning if two exams overlap or a "crunch week" is coming.
3. If a teacher moves an exam on AMS, I get a critical alert showing old date → new date.
4. When a new assignment or quiz appears on Moodle, it is on my calendar and I'm alerted, without typing anything.
5. I track each project and presentation: status, date, team, tasks, milestones, files, rehearsal reminders.
6. Files teachers upload to Moodle appear in the right subject folder by themselves.
7. When my CR or a particular professor posts in the class WhatsApp group, I see just their messages in UniDash, and if a message contains a date or time I can add it to my calendar in one tap.
8. At 7:30 AM I get a digest: today's classes, what is due, exams this week, attendance warnings, overnight changes.
9. I can see how many classes I can skip while staying above the attendance minimum.
10. I can subscribe my phone's calendar app to a UniDash link.
11. If the AMS session expires I'm told clearly what to do and nothing else breaks.
12. I can export or permanently delete all my data.
13. A friend can use their own account and never sees my data.

---

## 3. Glossary and Canonical Vocabulary

### 3.1 Glossary

| Term | Meaning |
|---|---|
| **Minor / Minor-1, Minor-2 / Mid-sem / Sessional / Internal / Class Test (CT)** | In-semester exams. Names vary by college; configured in Section 0 B3 and stored in `user_settings.exam_labels`. All map to kind `MINOR_EXAM` with a `label`. |
| **Major / End-sem** | Final semester exam → kind `MAJOR_EXAM`. |
| **Practical / Viva** | Lab exam / oral exam → `PRACTICAL_EXAM` / `VIVA`. |
| **Date-sheet** | Official exam schedule. |
| **Adjustment / extra / make-up class** | Additional class outside the regular timetable. |
| **Lab file / record** | Written lab record submitted for checking → `LAB_FILE_SUBMISSION`. |
| **CR** | Class Representative. |
| **Shortage / detained** | Attendance below the required minimum. **Condonation** is an official relaxation. |
| **AMS** | Academic Management System (the college portal / ERP). |
| **Hinglish** | Hindi written in Roman letters mixed with English, e.g. "kal quiz hai". |
| **IST** | Indian Standard Time, UTC+05:30, no daylight saving. |

### 3.2 Canonical enumerations
Use these exact names in code, database, API and UI. Do not invent synonyms.

```text
Source:             AMS | MOODLE | WHATSAPP | SYSTEM | MANUAL
EventKind:          CLASS | LAB_SESSION | ASSIGNMENT | QUIZ | MINOR_EXAM | MAJOR_EXAM | PRACTICAL_EXAM | VIVA |
                    PRESENTATION | PROJECT_MILESTONE | LAB_FILE_SUBMISSION | HOLIDAY | FEE_DUE |
                    NOTICE_DEADLINE | PERSONAL | OTHER
EventStatus:        TENTATIVE | CONFIRMED | CANCELLED        (source-owned; TENTATIVE = inferred, not yet confirmed officially)
Progress:           NOT_STARTED | IN_PROGRESS | DONE | SKIPPED      (user-owned)
SubmissionState:    UNKNOWN | NOT_SUBMITTED | SUBMITTED | GRADED     (Moodle-owned)
Lifecycle:          UPCOMING | ONGOING | PAST | OVERDUE      (derived at query time, never stored)
Severity:           INFO | NORMAL | IMPORTANT | CRITICAL
IntegrationKind:    AMS | MOODLE | WHATSAPP | TELEGRAM | EMAIL
IntegrationStatus:  PENDING_SETUP | ACTIVE | NEEDS_REAUTH | ERROR | PAUSED | DISCONNECTED
ReminderState:      PENDING | SENT | SNOOZED | SKIPPED | FAILED | CANCELLED
ProjectStatus:      NOT_STARTED | IN_PROGRESS | BLOCKED | SUBMITTED | DONE
PresentationStatus: NOT_STARTED | RESEARCHING | DRAFTING | REHEARSING | READY | PRESENTED | CANCELLED
ProposalStatus:     PENDING | ACCEPTED | REJECTED | EXPIRED
ProposalType:       NEW | UPDATE | CANCEL
CaptureMode:        TRACKED_ONLY | TRACKED_PLUS_KEYWORDS | ALL
WaCategory:         EXAM | QUIZ | ASSIGNMENT | PRESENTATION | SUBMISSION | CLASS_CHANGE | VENUE_CHANGE |
                    STUDY_MATERIAL | HOLIDAY | GENERAL
FeedKind:           ATTENDANCE_CHANGED | ATTENDANCE_RISK | GRADE_POSTED | GRADE_CHANGED | NOTICE_POSTED |
                    EXAM_SCHEDULED | EXAM_RESCHEDULED | EXAM_CANCELLED | EXAM_CLASH |
                    ASSIGNMENT_POSTED | ASSIGNMENT_DUE_CHANGED | QUIZ_POSTED | QUIZ_WINDOW_CHANGED |
                    SUBMISSION_STATUS_CHANGED | RESOURCE_ADDED | RESOURCE_UPDATED | FORUM_ANNOUNCEMENT |
                    TIMETABLE_CHANGED | CLASS_CANCELLED | FEE_DUE |
                    WA_TRACKED_MESSAGE | WA_KEYWORD_ALERT | WA_FILE_SHARED | EVENT_PROPOSED |
                    REMINDER | DIGEST | CRUNCH_WARNING | INTEGRATION_ATTENTION | INITIAL_IMPORT
```

### 3.3 State machines (short form)
- **Integration:** `PENDING_SETUP → ACTIVE`; `ACTIVE → NEEDS_REAUTH` (session expired / login rejected); `ACTIVE → ERROR` (repeated technical failure, auto-retry with back-off); `ACTIVE ⇄ PAUSED` (user or circuit breaker); any → `DISCONNECTED` (user removed it; secrets wiped).
- **Reminder:** `PENDING → SENT`; `PENDING → SNOOZED → PENDING`; `PENDING → SKIPPED` (event done / cancelled / time passed); `PENDING → FAILED → PENDING` (retry ≤ 3); event changes → pending reminders `CANCELLED` and regenerated.
- **Proposed event:** `PENDING → ACCEPTED` (creates or updates an event) / `REJECTED` / `EXPIRED` (event time passed or 14 days untouched).
- **Event status:** created `CONFIRMED` by an official source, or `TENTATIVE` when inferred from WhatsApp; `TENTATIVE → CONFIRMED` when an official source later agrees; any → `CANCELLED` when the source cancels it.

---


## 4. System Architecture

### 4.1 Big picture

```text
┌───────────────────────────── USER DEVICES ─────────────────────────────┐
│  Phone (installed PWA + push)     Laptop browser     Calendar app       │
│                                                       (subscribes .ics) │
└──────────────┬──────────────────────────────┬──────────────────────────┘
               │ HTTPS                        │ HTTPS (secret-token URL)
┌──────────────▼──────────────────────────────▼──────────────────────────┐
│ WEB APP — Next.js: UI + route handlers + auth      (internet-facing)    │
│ reads/writes DB; NEVER holds decrypted college secrets                  │
└──────────────┬─────────────────────────────────────────────────────────┘
               │ SQL (+ job queue, LISTEN/NOTIFY)
┌──────────────▼───────────────┐        ┌───────────────────────────────┐
│ POSTGRES — system of record  │◄──────►│ OBJECT STORAGE (S3-compatible)│
│ data • job queue • pub/sub   │        │ files, thumbnails, WA media   │
└──────────────▲───────────────┘        └───────────────────────────────┘
               │ SQL (outbound connections only)
┌──────────────┴─────────────────────────────────────────────────────────┐
│ WORKER — long-running Node process; the only place that can decrypt     │
│ scheduler • AMS connector • Moodle connector • WhatsApp provider        │
│ reconcile/diff engine • reminder + notification dispatcher • file jobs  │
└───────┬───────────────────┬─────────────────────┬──────────────────────┘
        │ HTTPS / browser   │ HTTPS API / AJAX    │ WhatsApp Web protocol
   ┌────▼────┐         ┌────▼─────┐          ┌────▼──────┐
   │   AMS   │         │  Moodle  │          │ WhatsApp  │   (all read-only)
   └─────────┘         └──────────┘          └───────────┘
```

### 4.2 Components

| Component | Responsibility | Must NOT |
|---|---|---|
| **Web app** | UI, REST API, auth, user actions, SSE stream | hold decryption keys; talk to AMS / Moodle / WhatsApp directly |
| **Worker** | all external I/O, scheduling, change detection, notifications, file ingestion | expose public HTTP ports |
| **Postgres** | all state, queue (`pg-boss`), pub/sub (`LISTEN/NOTIFY`), full-text search | store plaintext secrets |
| **Object storage** | files and media (private bucket, signed URLs) | serve files publicly |
| **Login Helper** (tool) | runs on the student's own computer for human-assisted login; uploads an encrypted session (Section 7.3) | persist anything locally after upload |

### 4.3 Connector pattern
Every external source is a plug-in behind one interface, so adding or fixing a source touches one folder.

```ts
interface SourceConnector<TRaw, TNormalized> {
  kind: 'AMS' | 'MOODLE' | 'WHATSAPP';
  health(ctx: SyncContext): Promise<IntegrationHealth>;   // cheap authenticated probe
  authenticate(ctx: SyncContext): Promise<AuthResult>;     // may return NEEDS_REAUTH
  fetch(ctx: SyncContext, dataType: DataType): Promise<TRaw>;
  parse(raw: TRaw): TNormalized;                           // PURE function, Zod-validated, fixture-tested
}
```

### 4.4 Sync pipeline (every data type, every source)

```text
schedule/command → acquire per-user lock → authenticate → fetch → parse + validate (Zod)
   → reconcile with existing events/entities → diff → persist (one transaction)
   → write event_history + feed_items (idempotent dedupe_key) → evaluate notification policy → dispatch
```

### 4.5 Change-detection engine (the core of "tell me when anything new happens")

1. **Natural keys** identify the same thing across runs:

| Entity | Natural key | Tracked fields (change ⇒ feed item) |
|---|---|---|
| Moodle assignment | course-module id (`cmid`) | name, due, cut-off, visibility, submission state, grade |
| Moodle quiz | `cmid` | name, open, close, time limit, attempts, state |
| Moodle file | `cmid` + filename; content hash + `timemodified` for versions | filename, modified time, size |
| Moodle announcement | forum discussion id | subject, message hash, modified |
| AMS exam row | (subject code, exam label); fallback: row signature | start, end, venue, status |
| AMS notice | notice id, else hash(title + date) | title, body hash, attachments |
| AMS attendance | subject code | attended, total |
| AMS marks | (subject code, component) | obtained, max, grade |
| AMS timetable slot | (weekday, start, subject, batch) | room, end, faculty |
| AMS fee line | (term, head) | due, paid, due date |

2. **Compare** the new normalized set with the stored one → `ADDED`, `CHANGED` (field-level, tracked fields only), `REMOVED`.
3. **Removal rule:** an entity missing from a *valid* fetch on **two consecutive runs** gets `removed_at_source` set. It is never hard-deleted automatically.
4. **Suspicious-fetch guard:** if parsing returns zero rows where the last good run had rows, or more than 50 % of entities flip to `REMOVED` / `CHANGED`, mark the run `PARTIAL`, commit nothing, keep an artifact for debugging (Section 13.2), and alert the owner. This is almost always a layout change or an expired session, not real news.
5. **Baseline mode:** the first successful run for a (user, source, data type) imports silently and creates one `INITIAL_IMPORT` feed item ("Imported 42 items from Moodle"). No per-item notifications.
6. **Persist** in one transaction: upsert entities, write `event_history` rows (before → after), insert `feed_items` with `dedupe_key` (unique per user, so re-runs create nothing new).
7. **Notify** according to the severity policy in Section 11.

### 4.6 Event reconciliation and source precedence
The same real-world exam may arrive from AMS, Moodle's calendar and a WhatsApp message. The `events` table holds **one** row per real-world item, with several `event_sources`.

**Matching order**
1. `(source, source_ref)` already known → update that event.
2. Else same `match_key` (hash of subject + kind + normalised label or title) within the current term → attach as an additional source.
3. Else, for WhatsApp-derived data only → create a **proposed event** (Section 9.9), never a direct event.
4. Else create a new event.

**Precedence when sources disagree (highest first)**

| Data | Order |
|---|---|
| Exam date / time / venue | AMS → Moodle → manual note → WhatsApp (shown as `TENTATIVE` with a conflict chip) |
| Class timetable | AMS → manual |
| Assignment and quiz dates | Moodle → AMS → manual → WhatsApp |
| Presentation dates | manual (user) → accepted WhatsApp proposal → Moodle |
| Holidays | AMS → WhatsApp |

**Manual edits win:** any field the student edits by hand is added to `locked_fields` and is never overwritten by a source. If a source later disagrees, show a conflict chip ("AMS says 15 Oct — use this?"). Official data from AMS is never silently replaced by WhatsApp data.

### 4.7 Worker ↔ web communication and real-time
- Web → worker: rows in `worker_commands` (e.g. `SYNC_NOW`, `WHATSAPP_CONNECT`, `TEST_CONNECTION`) or `pg-boss` jobs. The worker never listens on a public port.
- Worker → web: state in tables (`integrations.runtime_state` holds the WhatsApp QR payload with expiry, pairing codes, progress). The web app streams changes to the browser over **Server-Sent Events** (`GET /api/v1/stream`) fed by Postgres `LISTEN/NOTIFY` (or the managed provider's realtime feature).
- Everything user-visible is eventually consistent; the UI always shows "last synced N min ago".

### 4.8 Worked examples (use these as acceptance tests)

**A. Professor posts "Assignment 3" on Moodle**
1. Moodle poll (`core_course_get_updates_since`) reports a new module in course 42.
2. Connector fetches details → parse → Zod passes → reconcile: no known `cmid` → new `ASSIGNMENT` event, subject found via `moodle_course_id`.
3. Persist: `events`, `event_sources`, default reminders (3 days, 1 day, 6 hours before), feed item `ASSIGNMENT_POSTED` (`IMPORTANT` because due within 7 days) with `dedupe_key = ASSIGNMENT_POSTED:moodle:cm-9183`.
4. Dispatcher: push "📝 New assignment — CS-301 · Assignment 3 · due Fri 9 Oct, 11:59 PM"; the open dashboard updates via SSE.
5. The attached PDF is queued for download into `CS-301/Assignments/`.

**B. CR writes in the class group: "Minor-2 parso 10 baje Room 204 mein hoga" (sent Mon 12 Oct)**
1. Tracked sender in a monitored group → captured; category `EXAM`, matched term "minor-2".
2. Date parser (Hinglish-aware): "parso" → Wed 14 Oct, "10 baje" → 10:00 IST, venue "Room 204"; confidence 0.8.
3. Subject unknown (the group has no default subject) → proposal asks the student to choose the subject.
4. Reconcile finds AMS says Minor-2 is on Thu 15 Oct → proposal type `UPDATE` (a conflict), not `NEW`.
5. Feed item `EVENT_PROPOSED`: *"CR says Minor-2 is Wed 14 Oct, 10:00, Room 204. AMS says Thu 15 Oct. [Add as tentative] [Ignore]"*.
6. If accepted: a `TENTATIVE` entry is created with a conflict chip. AMS remains the authority; when AMS later changes to match, the event becomes `CONFIRMED` automatically.

### 4.9 Multi-tenancy and isolation
- Every user-owned row has `user_id`; every query is scoped through a `scopedDb(userId)` helper (or Postgres row-level security). A test suite MUST prove user A can never read or change user B's rows through any API route.
- Each user's connectors run in their own browser context / session; one user's failure never blocks others (per-user queue, concurrency 1 per user, small global cap).

---

## 5. Tech Stack

**Version policy:** use the latest *stable* release of each tool, verify docs before use, pin via lockfile, and avoid abandoned packages (check last release date and open security issues).

| Layer | Choice | Notes and alternatives |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | one language for UI, API and worker |
| Frontend | **Next.js** (App Router) + React | mobile-first PWA |
| Styling / UI kit | **Tailwind CSS** + **shadcn/ui** (Radix) + **Lucide** icons | dark / light via CSS variables |
| Data fetching | **TanStack Query** | stale-while-revalidate; offline cache for read views |
| Forms / validation | react-hook-form + **Zod** | same schemas on client and server |
| Dates | **date-fns** (+ tz helpers) or **Luxon** | explicit `Asia/Kolkata` |
| Calendar UI | **FullCalendar** (free core: day / week / month / list) or a custom lightweight month + agenda | avoid paid-only plugins |
| Motion | Framer Motion (sparingly) | respect `prefers-reduced-motion` |
| PWA | service worker via **Serwist** (or Workbox) + web manifest | verify the current recommended Next.js approach |
| Web API | Next.js route handlers under `/api/v1` | thin; logic lives in `packages/core` |
| Worker | Node.js + TypeScript, separate process | shares `packages/core`, `db`, `vault` |
| Database | **PostgreSQL** (Supabase, Neon, or Docker-hosted) | extensions: `citext`, `pg_trgm` |
| ORM / migrations | **Prisma** (or Drizzle) | scoping enforced in app layer + tests |
| Queue / scheduler | **pg-boss** (Postgres-backed) | avoids running Redis; BullMQ + Redis is the alternative |
| Auth | **Auth.js** or **Better Auth** (pick the one currently maintained) with Google OAuth, DB-backed sessions | invite-only allow-list; see Section 12.2 |
| Browser automation | **Playwright** (Chromium) | login only where possible; `storageState` for sessions |
| HTML parsing | **cheerio** | for fetched HTML; browser only if JS rendering is required |
| HTTP client | `fetch`/undici + `tough-cookie` jar | replay saved sessions |
| WhatsApp | provider interface; implementation = **whatsapp-web.js** or **Baileys** | choose in Phase 0 by stability and ID handling; both are unofficial |
| NLP-lite | **chrono-node** (day-first locale) + custom Hinglish pre-processor | rules first, LLM optional (P2) |
| Search | Postgres full-text (`tsvector` + GIN) and `pg_trgm` | no extra infrastructure |
| Document text extraction | maintained PDF / DOCX / PPTX text libraries, run async in the worker | size and time limits |
| File preview | PDF.js (e.g. react-pdf), native `<img>` / `<video>` | Office files: download + text preview (P2: conversion) |
| Object storage | S3-compatible (Supabase Storage, Cloudflare R2, MinIO locally) | private bucket, signed URLs |
| Push | `web-push` (VAPID) | iOS works only for PWAs added to the Home Screen |
| Optional channels | Telegram Bot API (grammY or Telegraf), SMTP / transactional e-mail | |
| Testing | **Vitest**, Playwright Test, MSW | fixtures from sanitised real samples |
| Logging / errors | **pino** with redaction; Sentry-style tool only with PII scrubbing | |
| Containers / CI | **Docker Compose**, GitHub Actions | lint, type-check, tests, audit |

**Do not use:** serverless functions for the worker or WhatsApp; scripted entry of a Google password; `localStorage` for tokens; eval / dynamic code from scraped content; unmaintained packages.

---


## 6. Data Model (PostgreSQL)

**Conventions**
- Ids are `uuid DEFAULT gen_random_uuid()`. Times are `timestamptz` (UTC). Enum columns are `TEXT` + `CHECK` using the values in Section 3.2 (translate to Prisma enums if preferred).
- Every user-owned table has `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE` and an index that starts with `user_id`.
- Order tables so foreign keys resolve (the ORM handles this). Extensions: `citext`, `pg_trgm`.
- Secrets are stored only as ciphertext and are **never** selected by API queries.

### 6.1 Identity, settings, integrations

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  name          text NOT NULL,
  avatar_url    text,
  role          text NOT NULL DEFAULT 'member',        -- 'owner' | 'member'
  timezone      text NOT NULL DEFAULT 'Asia/Kolkata',
  theme         text NOT NULL DEFAULT 'dark',          -- 'dark' | 'light' | 'system'
  time_format   text NOT NULL DEFAULT '12h',           -- '12h' | '24h'
  last_visit_at timestamptz,                           -- powers "what changed since you last visited"
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE allowed_emails (                          -- invite-only sign-in (college OR personal Gmail)
  email      citext PRIMARY KEY,
  invited_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id                uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attendance_threshold   numeric(5,2) NOT NULL DEFAULT 75.00,
  attendance_warn_buffer numeric(5,2) NOT NULL DEFAULT 5.00,
  digest_time            time NOT NULL DEFAULT '07:30',
  weekly_digest_dow      smallint NOT NULL DEFAULT 0,             -- 0 = Sunday, sent at 19:00
  quiet_start            time NOT NULL DEFAULT '23:00',
  quiet_end              time NOT NULL DEFAULT '06:30',
  notification_prefs     jsonb NOT NULL DEFAULT '{}',             -- {"<FeedKind>":{"push":true,"telegram":false,...}}
  exam_labels            jsonb NOT NULL DEFAULT '{}',             -- {"MINOR_EXAM":["Minor-1","Minor-2"],"MAJOR_EXAM":["End-Sem"]}
  storage_quota_mb       int NOT NULL DEFAULT 2048,
  wa_retention_days      int NOT NULL DEFAULT 90,
  ics_token              text UNIQUE                              -- secret path token of the .ics subscription URL
);

CREATE TABLE integrations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind                 text NOT NULL,                   -- IntegrationKind
  status               text NOT NULL DEFAULT 'PENDING_SETUP',
  auth_method          text,                            -- SESSION_STATE | PASSWORD | MOODLE_TOKEN | ICS_URL | WA_LINKED_DEVICE
  secret_ciphertext    bytea,                           -- sealed / AES-256-GCM; never returned by any API
  secret_nonce         bytea,
  secret_key_version   int,
  config               jsonb NOT NULL DEFAULT '{}',     -- non-secret: base URL, chosen access tier, enabled data types
  runtime_state        jsonb NOT NULL DEFAULT '{}',     -- transient: WhatsApp QR + expiry, pairing code, progress
  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  consecutive_failures int NOT NULL DEFAULT 0,
  last_error_code      text,
  last_error_message   text,                            -- human-readable, redacted
  paused_until         timestamptz,
  UNIQUE (user_id, kind)
);

CREATE TABLE worker_commands (                          -- web → worker messages
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,                                   -- SYNC_NOW | WHATSAPP_CONNECT | TEST_CONNECTION | ...
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'QUEUED',                -- QUEUED | RUNNING | DONE | FAILED
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
```

### 6.2 Academic structure

```sql
CREATE TABLE terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,                                  -- 'Semester 5 (2026-27 Odd)'
  starts_on date, ends_on date,
  is_current boolean NOT NULL DEFAULT false
);

CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  code text, name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',                 -- 'DBMS','DSA','OS' — used to guess the subject from chat text
  faculty_name text, credits numeric(3,1),
  kind text NOT NULL DEFAULT 'THEORY',                  -- THEORY | LAB | ELECTIVE | PROJECT
  color text,                                           -- hex
  moodle_course_id int, ams_ref text,                   -- links to source systems
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id),
  weekday smallint NOT NULL,                            -- 1 = Monday … 7 = Sunday
  start_time time NOT NULL, end_time time NOT NULL,
  room text, faculty_name text, batch text,
  kind text NOT NULL DEFAULT 'CLASS',                   -- CLASS | LAB_SESSION
  valid_from date, valid_to date
);
```

### 6.3 Events (the heart of the system)

```sql
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id), term_id uuid REFERENCES terms(id),
  type text NOT NULL DEFAULT 'PROJECT',                 -- PROJECT | LAB_FILE | SEMINAR | RESEARCH | OTHER
  title text NOT NULL, description text,
  status text NOT NULL DEFAULT 'NOT_STARTED',           -- ProjectStatus
  deadline_at timestamptz, repo_url text, links jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz
);

CREATE TABLE events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id           uuid REFERENCES terms(id),
  subject_id        uuid REFERENCES subjects(id),
  project_id        uuid REFERENCES projects(id),
  kind              text NOT NULL,                      -- EventKind
  label             text,                               -- 'Minor-2', 'Assignment 3', 'Unit Test 1' (college naming)
  title             text NOT NULL,
  description       text,
  starts_at         timestamptz NOT NULL,               -- for deadlines this is the due time
  ends_at           timestamptz,                        -- exam end / quiz close / class end
  is_deadline       boolean NOT NULL DEFAULT false,
  is_all_day        boolean NOT NULL DEFAULT false,
  venue             text,
  syllabus          text,
  weightage_pct     numeric(5,2), max_marks numeric(6,2),
  status            text NOT NULL DEFAULT 'CONFIRMED',  -- EventStatus (source-owned)
  progress          text NOT NULL DEFAULT 'NOT_STARTED',-- Progress (user-owned)
  submission_state  text NOT NULL DEFAULT 'UNKNOWN',    -- SubmissionState (Moodle-owned)
  origin            text NOT NULL,                      -- SOURCE | INFERRED | MANUAL
  confidence        smallint NOT NULL DEFAULT 100,      -- < 100 for inferred events
  match_key         text NOT NULL,                      -- hash(subject | kind | normalised label/title) for cross-source de-duplication
  locked_fields     text[] NOT NULL DEFAULT '{}',       -- fields edited by hand; sources must not overwrite
  priority_override smallint,                           -- user pin / boost
  removed_at_source timestamptz,                        -- vanished from source on 2 consecutive valid runs (kept, not deleted)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX events_user_time ON events (user_id, starts_at) WHERE deleted_at IS NULL;
CREATE INDEX events_match     ON events (user_id, match_key);

CREATE TABLE event_sources (                             -- many sources → one event
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source text NOT NULL, source_ref text NOT NULL, url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_payload_hash text,
  PRIMARY KEY (event_id, source, source_ref)
);

CREATE TABLE event_history (                             -- powers "moved from 12 Oct → 14 Oct"
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, field text NOT NULL,
  old_value jsonb, new_value jsonb, summary text
);

CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL, offset_label text,    -- '3d', '1d', '6h'
  channel text NOT NULL DEFAULT 'PUSH',
  state text NOT NULL DEFAULT 'PENDING',
  is_default boolean NOT NULL DEFAULT true,
  snoozed_until timestamptz, sent_at timestamptz,
  UNIQUE (event_id, remind_at, channel)
);
CREATE INDEX reminders_due ON reminders (remind_at) WHERE state = 'PENDING';

CREATE TABLE tasks (                                     -- checklists inside events / projects / presentations
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_type text NOT NULL,                             -- EVENT | PROJECT | PRESENTATION | STANDALONE
  parent_id uuid, title text NOT NULL,
  due_at timestamptz, done_at timestamptz, sort_order int NOT NULL DEFAULT 0
);
```

### 6.4 Feed, notifications, notices

```sql
CREATE TABLE feed_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,                              -- FeedKind
  source      text NOT NULL,                              -- AMS | MOODLE | WHATSAPP | SYSTEM
  severity    text NOT NULL DEFAULT 'NORMAL',
  subject_id  uuid REFERENCES subjects(id), event_id uuid REFERENCES events(id),
  title       text NOT NULL, body text, icon text,
  payload     jsonb NOT NULL DEFAULT '{}',                -- structured before/after, attachment refs, links
  actions     jsonb NOT NULL DEFAULT '[]',                -- [{label,type:'OPEN'|'ACCEPT_PROPOSAL'|'SNOOZE',href|payload}]
  group_key   text,                                       -- collapses bursts ("7 new files in CS-301")
  dedupe_key  text NOT NULL,                              -- idempotency
  read_at timestamptz, pinned_at timestamptz, archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX feed_user_time ON feed_items (user_id, created_at DESC);

CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_item_id uuid REFERENCES feed_items(id) ON DELETE CASCADE,
  reminder_id uuid REFERENCES reminders(id) ON DELETE CASCADE,
  channel text NOT NULL, status text NOT NULL,            -- QUEUED | SENT | FAILED | SUPPRESSED
  attempts int NOT NULL DEFAULT 0, error text, sent_at timestamptz,
  UNIQUE (feed_item_id, channel)
);

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
  user_agent text, failed_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), last_ok_at timestamptz
);
```

### 6.5 Files and projects

```sql
CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES folders(id), name text NOT NULL,
  term_id uuid REFERENCES terms(id), subject_id uuid REFERENCES subjects(id),
  is_system boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, parent_id, name)
);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES folders(id), subject_id uuid REFERENCES subjects(id),
  project_id uuid REFERENCES projects(id), event_id uuid REFERENCES events(id),
  display_name text NOT NULL, original_name text NOT NULL,
  mime text, size_bytes bigint, sha256 text,
  storage_key text,                                       -- null when link_only
  link_only boolean NOT NULL DEFAULT false,               -- big videos etc.: store the link, not the bytes
  source text NOT NULL DEFAULT 'UPLOAD',                  -- UPLOAD | MOODLE | WHATSAPP | AMS | SHARE_TARGET
  source_ref text, source_url text,
  kind text NOT NULL DEFAULT 'OTHER',                     -- LECTURE|ASSIGNMENT|LAB|NOTES|PYQ|PROJECT|PRESENTATION|NOTICE|OTHER
  tags text[] NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1, supersedes_file_id uuid REFERENCES files(id),
  is_inbox boolean NOT NULL DEFAULT false,                -- unsorted, awaiting a one-tap decision
  search_vector tsvector,                                 -- name + extracted text
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  UNIQUE (user_id, sha256, folder_id)
);

CREATE TABLE file_routing_rules (                         -- learned from the student's corrections
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match jsonb NOT NULL,                                   -- {source:'WHATSAPP',group_id,sender_ref} | {moodle_section_regex}
  target_subject_id uuid REFERENCES subjects(id), target_kind text,
  created_from text NOT NULL DEFAULT 'USER_CORRECTION'
);

CREATE TABLE project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),                      -- null = a classmate who doesn't use UniDash
  display_name text NOT NULL, role text, contact text
);
CREATE TABLE project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL, due_at timestamptz, done_at timestamptz,
  event_id uuid REFERENCES events(id)                     -- milestone also appears on the calendar
);
CREATE TABLE presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id), project_id uuid REFERENCES projects(id),
  event_id uuid REFERENCES events(id),                    -- the calendar entry for the slot
  topic text NOT NULL, status text NOT NULL DEFAULT 'NOT_STARTED',   -- PresentationStatus
  duration_min int, venue text, slides_file_id uuid REFERENCES files(id),
  team text[] NOT NULL DEFAULT '{}', notes text,
  checklist jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now()
);
```

### 6.6 AMS data

```text
attendance_summary(user_id, subject_id, attended int, total int, percentage numeric(5,2), as_of, source)   UNIQUE(user_id, subject_id)
attendance_log(user_id, subject_id, class_date date, slot text, status text /*PRESENT|ABSENT|LATE|LEAVE|CANCELLED*/)   UNIQUE(user_id, subject_id, class_date, slot)
grades(user_id, subject_id, component text, kind text /*MINOR|MAJOR|ASSIGNMENT|QUIZ|PRACTICAL|VIVA|OTHER*/,
       marks_obtained numeric, max_marks numeric, weightage_pct numeric, grade_letter text, source, source_ref, published_at)
       UNIQUE(user_id, subject_id, component, source)
notices(user_id, source, source_ref, title, body, posted_at, url, attachments jsonb, content_hash, subject_id, is_important bool)
       UNIQUE(user_id, source, source_ref)
fees(user_id, term_id, head text, amount_due numeric, amount_paid numeric, due_on date, as_of)
```

### 6.7 WhatsApp

```sql
CREATE TABLE wa_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_ref text NOT NULL,                                -- id exactly as the library returns it
  name text NOT NULL,
  is_monitored boolean NOT NULL DEFAULT false,            -- OFF until the student switches it on
  capture_mode text NOT NULL DEFAULT 'TRACKED_ONLY',      -- CaptureMode
  default_subject_id uuid REFERENCES subjects(id),
  last_message_at timestamptz,
  UNIQUE (user_id, group_ref)
);

CREATE TABLE wa_tracked_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES wa_groups(id) ON DELETE CASCADE,   -- null = applies to every monitored chat
  sender_ref text NOT NULL,                               -- the stable id the library gives (may be an opaque id, not a phone number)
  label text NOT NULL,                                    -- "Rahul (CR)", "Prof. Sharma"
  role_tag text NOT NULL DEFAULT 'OTHER',                 -- FACULTY | CR | CLASSMATE | OTHER
  is_vip boolean NOT NULL DEFAULT false,
  capture_media boolean NOT NULL DEFAULT true,
  include_direct_chat boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, group_id, sender_ref)
);

CREATE TABLE wa_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,    -- null = shipped default list (Appendix B)
  term text NOT NULL, lang text NOT NULL DEFAULT 'en',    -- en | hi-latn | hi-deva
  category text NOT NULL, weight int NOT NULL DEFAULT 10, is_regex boolean NOT NULL DEFAULT false
);

CREATE TABLE wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES wa_groups(id) ON DELETE CASCADE,
  wa_message_ref text NOT NULL,                           -- library message id (idempotency)
  sender_ref text NOT NULL, sender_label text,            -- label snapshot at capture time
  body text, quoted_body text,
  has_media boolean NOT NULL DEFAULT false, media_kind text, file_id uuid REFERENCES files(id),
  links jsonb NOT NULL DEFAULT '[]',                      -- extracted URLs with type (drive, form, meet, zoom …)
  is_forwarded boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  matched_terms text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'GENERAL', importance smallint NOT NULL DEFAULT 0,
  is_vip boolean NOT NULL DEFAULT false,
  edited boolean NOT NULL DEFAULT false, deleted_by_sender boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  UNIQUE (user_id, group_id, wa_message_ref)
);

CREATE TABLE proposed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES wa_messages(id) ON DELETE CASCADE,
  proposal_type text NOT NULL DEFAULT 'NEW',              -- ProposalType
  subject_id_guess uuid REFERENCES subjects(id),
  kind_guess text, label_guess text, title_guess text,
  starts_at_guess timestamptz, ends_at_guess timestamptz, venue_guess text,
  confidence smallint NOT NULL,                           -- 0-100
  matched_event_id uuid REFERENCES events(id),            -- set for UPDATE / conflict proposals
  status text NOT NULL DEFAULT 'PENDING',                 -- ProposalStatus
  created_event_id uuid REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
```

### 6.8 Operations

```text
snapshots(user_id, source, data_type, content_hash, content jsonb, captured_at)     -- keep last 5 per (user, source, data_type)
sync_runs(id, user_id, integration_id, job, tier, started_at, finished_at,
          status /*SUCCESS|PARTIAL|FAILED|SKIPPED*/, items_seen, items_added, items_changed, items_removed,
          error_code, error_message, artifact_path)                                 -- keep 30 days
audit_log(id, user_id, action, detail jsonb, ip inet, user_agent, created_at)       -- login, credential change, export, delete, kill-switch
```

### 6.9 Indexing and search notes
- GIN index on `files.search_vector`; `pg_trgm` on `files.display_name`, `events.title`, `notices.title`, `wa_messages.body`.
- Maintain `files.search_vector` in the worker after text extraction (file name weighted higher than body).
- Partial indexes for "active" rows (`deleted_at IS NULL`, `state = 'PENDING'`).
- Retention jobs (Section 16) enforce `wa_retention_days`, 90-day feed archive, 30-day `sync_runs`.

---


## 7. AMS (ERP) Integration

### 7.1 Goal and constraints
Read the signed-in student's **own** data from the college AMS, detect what is new or changed, and feed the unified timeline. The AMS has no public API, so access is built from what the portal actually offers. Everything is read-only, low-frequency and polite (Section 7.7).

### 7.2 Access ladder — use the highest tier that works reliably
Record the decision per data type in `docs/FEASIBILITY.md` after Phase 0.

| Tier | Method | When |
|---|---|---|
| **A** | Replay the portal's own **JSON/XHR endpoints** with the saved session cookies | The browser's Network tab shows JSON for the page (or the AMS mobile app exposes an API). Most stable and fastest. |
| **B** | Fetch **HTML pages** with the saved session and parse with cheerio | Server-rendered pages without heavy JavaScript. |
| **C** | **Playwright** drives the page and reads the DOM | JavaScript-rendered pages, ASP.NET/ViewState postbacks, semester drop-downs, anything A/B cannot do. |

The browser is for **login and Tier C only**. Selectors and mappings live in `connectors/ams/selectors.ts` and `mappers/*.ts`, prefer role / text / data-attribute locators over fragile positional ones, and carry fallbacks.

### 7.3 Authentication and session management
**Rules:** never type a Google password into automation; never attempt to defeat CAPTCHA, OTP or device approval; stop immediately after the first rejected password (repeated failures can lock the account).

**Method 1 — Human-assisted login (default, works with Google sign-in, OTP, CAPTCHA)**
1. The student starts "Connect AMS" in the app. The app shows a one-time **pairing code** (valid 10 minutes).
2. On their own computer they run the **Login Helper** (`tools/login-helper`, e.g. `pnpm login-helper --kind ams --code ABCD-1234`). It opens a real, visible Chromium window at the AMS login page.
3. The student signs in normally (Google, OTP, CAPTCHA …). The helper detects the post-login page, exports Playwright `storageState` (cookies + local storage), encrypts it with the worker's **public key** (sealed box), uploads it to `POST /api/v1/integrations/ams/session` using the pairing code, then deletes everything locally.
4. If the worker itself runs on the student's own always-on computer, the same flow can run inside the worker with a visible browser instead.

**Method 2 — Saved username + password** only if the portal uses a simple form with **no** CAPTCHA / OTP. Credentials are stored sealed (Section 12.1). One failed attempt → `NEEDS_REAUTH`, no retries.

**Session health and expiry**
- Before each job, run a cheap authenticated probe. Treat HTTP 401/403, a redirect to the login URL, the presence of the login form, or known "session expired" text as expiry.
- On expiry: set `NEEDS_REAUTH`, pause AMS jobs for that user, send **one** `INTEGRATION_ATTENTION` notification with instructions (not one per failed job).
- Optional keep-alive: a lightweight request every 15–20 minutes during the day if the portal has a short idle timeout (only if Phase 0 proves it helps).
- Never log, screenshot or upload cookies or tokens. Session files are encrypted at rest.

### 7.4 Data catalogue

| Data | Typical page | Fields | Default frequency | Emits |
|---|---|---|---|---|
| Profile | Profile | name, roll no., branch, section, batch, semester | at setup; weekly | (fills onboarding) |
| Registered subjects | Course registration | code, name, faculty, credits | at setup; daily | (creates `subjects`) |
| Attendance summary | Attendance | subject, attended, total, % | every 2 h in class hours, else 6 h | `ATTENDANCE_CHANGED`, `ATTENDANCE_RISK` |
| Attendance log | Attendance detail | date, slot, status | with summary (optional) | — |
| Timetable | Timetable | weekday, start / end, subject, room, faculty, batch | daily 06:00 + when a notice mentions it | `TIMETABLE_CHANGED`, `CLASS_CANCELLED` |
| Exam schedule | Date-sheet / exams | exam label, subject, date, time, venue, seat | every 2 h (hourly in exam season) | `EXAM_SCHEDULED`, `EXAM_RESCHEDULED`, `EXAM_CANCELLED`, `EXAM_CLASH` |
| Marks / results | Marks, results | subject, component, obtained, max, grade | every 6 h | `GRADE_POSTED`, `GRADE_CHANGED` |
| Notices | Notice board | id, title, date, body, attachments | hourly | `NOTICE_POSTED` |
| Fees | Fee | head, due, paid, due date | daily | `FEE_DUE` |
| Admit card / seating (P2) | Exam | seat, room | when exam within 14 days | `EXAM_SCHEDULED` |

### 7.5 Normalisation rules
- **Dates:** college formats are day-first (`dd-mm-yyyy`, `dd/mm/yy`, `12 Oct, 2026`). Parse with explicit formats; reject ambiguous values rather than guess. Convert to UTC; assume IST when no zone is shown.
- **Numbers:** `"78.5%"` → `78.50`; `"42/50"` → obtained 42, max 50; treat `-`, `NA`, empty as null.
- **Subjects:** map portal names to `subjects` through code first, then fuzzy name match, and ask the student once to confirm uncertain matches during onboarding.
- **Text:** trim, collapse whitespace, Unicode-normalise (NFKC); keep the original raw text in `payload` for debugging.
- **Pagination / selectors:** handle semester drop-downs, "load more", and multi-page tables; stop when a page repeats.

### 7.6 Parser requirements
- One Zod schema per payload. Validation failure → no write, run `PARTIAL`, artifact saved (Section 13.2).
- **Layout canaries:** assert expected table headers / landmarks before parsing; if absent, fail with `LAYOUT_CHANGED`.
- **Fixtures:** `fixtures/ams/<page>/<case>.html|json` — sanitised real samples (fake names, roll numbers, phones). Every parser has tests for normal, empty, and malformed cases.
- Parsers are pure functions: `parse(raw) → Normalized`; all network and browser code stays outside them.

### 7.7 Politeness and anti-lockout
- Max **1 concurrent session per user**; global cap of 2 concurrent AMS jobs; random jitter ±15 % on every schedule; a normal desktop user-agent; reuse one session for all data types in a run (log in once, not per page).
- No scraping between 00:30 and 05:30 IST except session keep-alive.
- Back-off on errors: 2 min → 10 min → 1 h; after 3 consecutive failures set `ERROR` and pause for 1 h; after 3 pauses notify the owner. `AUTH_FAILED` never retries.
- Manual "Sync now" has a 5-minute cooldown per integration. A global **kill switch** (`DISABLE_ALL_SYNC`) stops everything instantly.

### 7.8 Error taxonomy
| Code | Meaning | Automatic action | What the student sees |
|---|---|---|---|
| `AUTH_EXPIRED` | Session no longer valid | `NEEDS_REAUTH`, pause | "AMS needs you to log in again" + button |
| `AUTH_FAILED` | Credentials rejected | stop, no retry | "Password was rejected — update it" |
| `CAPTCHA_REQUIRED` / `OTP_REQUIRED` | Human step needed | `NEEDS_REAUTH` | "Complete login with the helper" |
| `SITE_DOWN` | 5xx / timeout | back-off | "AMS seems down; last synced 3 h ago" |
| `NETWORK_BLOCKED` | Host unreachable from this machine | `ERROR` | "AMS isn't reachable from the worker (campus-only?)" |
| `LAYOUT_CHANGED` | Canary / schema failed | `PARTIAL`, alert owner, keep old data | "Some AMS data may be stale" |
| `RATE_LIMITED` | 429 / block page | long back-off | silent unless > 6 h |
| `UNKNOWN` | Anything else | `ERROR`, artifact saved | generic message + owner alert |

### 7.9 Attendance specifics
- Store the portal's summary as truth; the log (if available) powers trends and the simulator.
- Alerts: `ATTENDANCE_CHANGED` (INFO) on any change; `ATTENDANCE_RISK` (IMPORTANT) when percentage falls below `threshold + warn_buffer`; (CRITICAL) below `threshold`.
- Formulas live in `packages/core` (Section 10.8). The threshold comes from user settings (default 75 %), never hard-coded.
- Cancelled classes and approved leave are excluded when the portal marks them; otherwise trust the portal's counts.

### 7.10 Exams specifics
- Map each date-sheet row to an event: label via `exam_labels` (e.g. "Mid Sem" → `MINOR_EXAM` / "Minor-1"; "End Sem" → `MAJOR_EXAM`; "Practical" → `PRACTICAL_EXAM`; "Viva" → `VIVA`).
- Multiple papers on one day are separate events. Missing end time → assume 3 h for majors, 1 h for minors / quizzes, mark as assumed.
- **Clash detection:** two `CONFIRMED` exams with overlapping time ranges → `EXAM_CLASH` (CRITICAL).
- **Change handling:** same (subject, label) with a different date / time / venue → update + `event_history` + `EXAM_RESCHEDULED` showing old → new; row disappears twice → `removed_at_source` + `EXAM_CANCELLED` candidate (IMPORTANT, asks "was this cancelled?").

### 7.11 Timetable specifics
Store weekly recurring `timetable_slots`; expand into `CLASS` / `LAB_SESSION` events for a rolling **4-week** window, skipping `HOLIDAY` events. One-off changes (cancelled / extra class from notices or WhatsApp) become overriding events. Lab slots respect the student's batch.

### 7.12 Notices
De-duplicate by id or `content_hash`; download attachments into the file store (kind `NOTICE`); guess the subject from code / alias / faculty; boost `is_important` for words like exam, date-sheet, holiday, fee, last date (English + Hinglish list, Appendix B).

### 7.13 Out of scope
No write actions; no payment; no other students' data; no bypassing of access controls.

---

## 8. Moodle Integration

### 8.1 Access ladder — API first, then session, then HTML
| Tier | Method | Notes |
|---|---|---|
| **1** | **Moodle web-service token** + REST API | Best: JSON, stable, includes file downloads. |
| **2** | **Browser session + Moodle's own AJAX services** (`/lib/ajax/service.php`, using the page's `sesskey`) | Works with Google/SSO logins when no token is available; JSON responses; only AJAX-enabled functions. |
| **3** | Session + **HTML parsing** of course pages | Last resort. |
| **0** | **Calendar export (iCal) URL** | Add-on or fallback: deadlines and quiz windows only; needs no login after the URL is generated. Treat the URL as a secret (it contains a token). |

### 8.2 Getting a token (try in this order; record the winner in `FEASIBILITY.md`)
1. **Username + password endpoint** — `POST https://<moodle>/login/token.php` with form fields `username`, `password`, `service=moodle_mobile_app`. Only works for sites with Moodle-local accounts and the mobile service enabled. **POST over HTTPS only; never put credentials in a URL.**
2. **Browser SSO launch (works with Google / OAuth logins)** — the Login Helper opens `https://<moodle>/admin/tool/mobile/launch.php?service=moodle_mobile_app&passport=<random>&urlscheme=moodlemobile`, the student signs in, and Moodle redirects to `moodlemobile://token=<base64>`. The helper intercepts that redirect, base64-decodes it, splits on `:::` and keeps the token. Verify the exact behaviour on the college's site in Phase 0.
3. **Manual token** — Preferences → Security keys (if the site exposes a "Moodle mobile web service" key). The student pastes it into the app.
4. **Fallbacks** — Tier 2 (session + AJAX), and/or Tier 0 (calendar export URL).

After obtaining a token call `core_webservice_get_site_info`: it returns the Moodle version, user id and the **list of functions this token may call** — use it to feature-detect (never assume a function exists). Tokens can expire or be revoked; treat 401-style errors as `AUTH_EXPIRED`.

### 8.3 Function catalogue (verify availability via site info)
| Need | Functions (examples) |
|---|---|
| Site / user | `core_webservice_get_site_info` |
| Courses | `core_enrol_get_users_courses` |
| Course content and files | `core_course_get_contents`, `mod_resource_get_resources_by_courses`, `mod_folder_get_folders_by_courses`, `mod_url_get_urls_by_courses`, `mod_page_get_pages_by_courses` |
| **What changed** | `core_course_get_updates_since` (modules updated since a timestamp) |
| Assignments | `mod_assign_get_assignments`, `mod_assign_get_submission_status` |
| Quizzes | `mod_quiz_get_quizzes_by_courses`, `mod_quiz_get_user_attempts` |
| Deadlines / calendar | `core_calendar_get_action_events_by_timesort`, `core_calendar_get_calendar_upcoming_view` |
| Announcements / forums | `mod_forum_get_forums_by_courses`, `mod_forum_get_forum_discussions` |
| Grades | `gradereport_user_get_grade_items` |
| Moodle's own bell | `message_popup_get_popup_notifications` |

### 8.4 What to extract

| Data | Source | Default frequency | Emits |
|---|---|---|---|
| Enrolled courses | enrol | daily 06:00 | (course ↔ subject mapping) |
| Updates since last poll | `core_course_get_updates_since` per active course | every 15–30 min | triggers targeted refresh |
| Assignments + submission state | assign | every 30 min | `ASSIGNMENT_POSTED`, `ASSIGNMENT_DUE_CHANGED`, `SUBMISSION_STATUS_CHANGED` |
| Quizzes (open / close / limit) | quiz | hourly | `QUIZ_POSTED`, `QUIZ_WINDOW_CHANGED` |
| Resources and folders | course contents | every 2 h | `RESOURCE_ADDED`, `RESOURCE_UPDATED` (batched) |
| Announcements | forums (news forum) | every 30 min | `FORUM_ANNOUNCEMENT` |
| Grades | grade items | every 6 h | `GRADE_POSTED`, `GRADE_CHANGED` |
| Upcoming deadlines | calendar action events | hourly | feeds `events` (cross-check) |
| Moodle bell notifications | popup notifications | every 30 min | supplementary |

### 8.5 Course ↔ subject mapping
Match by course code found in `shortname` / `fullname` (regex from Section 0 B2), then by name similarity. During onboarding show proposed matches and let the student confirm or change them. Store `subjects.moodle_course_id`. Past or hidden courses are ignored unless the student enables them.

### 8.6 Automatic file download and organisation
- Download via the file URL with the token appended (or the AJAX/session equivalent). Stream to object storage; compute SHA-256; skip if `(user, sha256)` already exists (add a source reference instead).
- Folder target: `Term / Subject / <Lectures | Assignments | Lab | Notes | PYQ and Exams | Resources>` by module type and section-title heuristics (words like lecture, unit, notes, lab, PYQ, previous year, question paper …); unknown → subject's `Resources`.
- Updated file (same module, new modified time / hash) → **new version**, previous kept, feed item `RESOURCE_UPDATED`.
- **Size policy:** files over 100 MB, and videos, are stored as `link_only` unless the student pins them; respect the storage quota (warn at 80 %).
- Bursts are batched: "7 new files in CS-301" is one notification.

### 8.7 Deadlines and calendar sync
Every assignment due / cut-off date, quiz open / close time and calendar action event becomes an `events` row automatically (no manual entry). Use `duedate = 0` / `timeclose = 0` as "no deadline". Moodle timestamps are Unix seconds. Quizzes: `starts_at` = open, `ends_at` = close, plus time limit in the description. Mark `submission_state` from Moodle; "late" = past due and not submitted.

### 8.8 Change detection
Use `core_course_get_updates_since` (or a content-hash diff of `core_course_get_contents`) to find changed modules, refresh only those, and run the engine in Section 4.5. Hidden / deleted modules → `removed_at_source` (two-run rule), not deletion.

### 8.9 Edge cases
Group-specific assignments; restricted availability ("available from …"); students enrolled in several courses with the same name; multi-section courses; time-zone setting differing from IST; assignments with extensions; resource URLs that point to external sites (store as link); courses archived mid-semester; Moodle maintenance mode; very large `core_course_get_contents` responses.

### 8.10 Safety: read-only allow-list
The Moodle client wrapper exposes **only** the read functions in Section 8.3 (a constant array). Any call to a function not on the list throws at runtime and fails the unit test. A token can technically do more (e.g. submit work); UniDash must never do so.

---


## 9. WhatsApp Integration

### 9.1 Principles
1. **Read-only.** UniDash listens; it never sends, replies, reacts, edits, deletes, joins or leaves anything, and never marks chats as read.
2. **Opt-in per group.** A group is ignored until the student switches it on.
3. **Tracked people first.** By default only messages from the people the student selected are stored. Everything else is dropped on arrival without being written anywhere.
4. **Minimal storage.** Keep text, a short quoted snippet, links, and media only from tracked people. Auto-purge after the retention period (default 90 days).
5. **Never auto-create calendar entries from chat.** Chat produces *proposals* the student confirms (Section 9.9).

### 9.2 Account strategy and risk
WhatsApp offers no official API for personal accounts. Unofficial libraries imitate WhatsApp Web / a linked device, which **may violate WhatsApp's terms and can lead to the account being restricted or banned**. Mitigations, in order of preference:
1. **Spare number (recommended):** a spare SIM / number joins the class group and is the listener. The main number is never at risk.
2. **Main number as a linked device:** allowed only with strict read-only behaviour, only the selected groups, no sending, no bulk media download.
3. **No linking at all (fallback):** import exported chats (Section 9.14).

Configure the library, where it offers such options, so it does **not** broadcast online presence or send read receipts (this also keeps push notifications working on the student's phone).

### 9.3 Provider abstraction
```ts
interface WhatsAppProvider {
  start(userId): Promise<void>;                     // begin session (QR if not linked)
  onQr(cb: (qr: string, expiresAt: Date) => void);
  onReady(cb); onDisconnected(cb: (reason) => void);
  onMessage(cb: (m: IncomingMessage) => void);      // new messages
  onMessageEdited(cb); onMessageDeleted(cb);
  listGroups(): Promise<GroupInfo[]>;
  listParticipants(groupRef): Promise<ParticipantInfo[]>;
  downloadMedia(m): Promise<Buffer>;                // only called for tracked senders
  logout(): Promise<void>;                          // unlinks the device and wipes session
}
```
There is deliberately **no** send method. Implement it with `whatsapp-web.js` or `Baileys`; choose in the Phase 0 spike by (a) stability on the student's setup, (b) memory use, (c) whether sender ids are phone numbers or opaque ids, (d) maintenance activity. Keep the other implementation swappable. Session data is stored encrypted at rest with restrictive file permissions.

### 9.4 Setup flow
1. Settings → WhatsApp → **Connect**. The web app writes a `WHATSAPP_CONNECT` command; the worker starts the provider and publishes the QR into `integrations.runtime_state` (with expiry); the UI shows it and refreshes it as it rotates.
2. The student scans it from the listener phone (WhatsApp → Linked devices).
3. On `ready`: list **all groups**, each with a monitor toggle (default off) and capture mode (`TRACKED_ONLY` default).
4. For each monitored group show a **People picker** built from the group's participant list: tick the people to track and give each a label ("Rahul — CR"), role tag (FACULTY / CR / CLASSMATE / OTHER) and optional VIP star.
   - Sender ids may be phone-based or opaque. **Never assume phone numbers are available.** Store whatever stable id the library returns in `sender_ref`.
   - If a person isn't in the list yet (new member), offer "Pick from recent messages".
5. Optional per group: **default subject** (e.g. the "CS-301 group"), keyword set, and "also track direct chats with these people" (off by default).
6. Show a **dry-run preview**: "In the last 7 days, 12 messages would have been captured. Show them." (Computed from live history without storing anything not selected.)

### 9.5 Capture rules (decision order)
```text
message arrives
 ├─ group not monitored (and not a tracked direct chat)? ─────────► DROP (store nothing)
 ├─ sent before the link time / part of history sync? ────────────► BACKFILL: store only if tracked, no notifications
 ├─ sender in tracked list for this group (or global)? ── yes ───► CAPTURE (is_vip from the person's flag)
 ├─ capture_mode = TRACKED_PLUS_KEYWORDS/ALL and high-signal match? ─ yes ─► CAPTURE as keyword-only
 └─ otherwise ────────────────────────────────────────────────────► DROP
```
Own messages sent by the linked account are ignored.

### 9.6 Processing pipeline (per captured message)
1. **Normalise:** Unicode NFKC, strip zero-width characters, collapse whitespace, keep original for display.
2. **Extract links** and type them (Google Drive / Docs / Forms, Meet, Zoom, Teams, Classroom, YouTube, other).
3. **Classify** (Section 9.7) → `category`, `importance`, `matched_terms`.
4. **Extract** date / time / venue / subject candidates (Section 9.8).
5. **Store** the message (+ quoted snippet when it is a reply; media from tracked senders only → file `Inbox` with a suggested subject).
6. **Create feed item:** `WA_TRACKED_MESSAGE` (or `WA_KEYWORD_ALERT` / `WA_FILE_SHARED`), grouped when a person posts many messages in quick succession (within 5 min).
7. **Propose** an event when the message is date-bearing and its category is EXAM / QUIZ / ASSIGNMENT / PRESENTATION / CLASS_CHANGE / SUBMISSION.
8. **Notify** per the severity policy (Section 11.2). VIP or date-bearing = IMPORTANT.

### 9.7 Classification
Rule-based first (fast, private, explainable): weighted dictionaries (Appendix B) in English, Hinglish and Devanagari + regexes, with per-subject aliases (e.g. "DBMS", "DSA") and the group's default subject.
`importance` (0–100) = highest category weight + VIP bonus (+20) + urgency words (+15) + presence of a parsed date within 7 days (+15) + attachment (+5). Thresholds: ≥ 60 IMPORTANT, ≥ 30 NORMAL, else INFO. All thresholds configurable.
Optional LLM-assisted extraction (feature flag, **off by default**): send only the text of a tracked person's message; treat message text as untrusted input; give the model no tools or secrets; validate its output with a strict schema; fall back to rules on any failure.

### 9.8 Date, time and venue extraction (Hinglish-aware)
- Use a natural-language date library with the **day-first** locale, plus a pre-processor that maps Hinglish tokens (Appendix B) to English before parsing: `kal`→tomorrow, `aaj`→today, `parso`→day after tomorrow, `agle hafte`→next week, weekdays (`somvar` … `ravivar`), `baje`→o'clock, `subah/shaam/raat` → AM/PM hints.
- Resolve relative words against the **message's sent time in IST**, not processing time.
- `kal` can mean tomorrow or yesterday: assume future for announcements unless the tense is clearly past; lower confidence to ≤ 0.6 and show the original text.
- Formats to support: `14/10`, `14-10-26`, `14th Oct`, `Oct 14`, `2 PM`, `2:30 pm`, `14:00`, `10 baje`, `10 se 12` (10 to 12), ranges, "from … to …".
- Venue: capture phrases like `Room 204`, `Lab 4`, `LH-3`, `Auditorium`, `Seminar Hall`; configurable room patterns.
- Output: candidate datetime(s) with `confidence` 0–100 and the matched span for highlighting. Ambiguity (two dates, no year, no time) lowers confidence and is shown to the student.

### 9.9 Proposed events ("Review" inbox)
- Created by step 7 as `proposed_events` with `proposal_type`:
  - `NEW` — nothing similar exists.
  - `UPDATE` — an existing event with the same subject / kind / label has a different date, time or venue (a conflict or reschedule).
  - `CANCEL` — message says cancelled / postponed / no class.
- Each proposal shows: the original message (with highlighted spans), parsed fields (editable), subject picker (if unknown), and what it would change on the calendar. Buttons: **Add as tentative**, **Edit & add**, **Ignore**.
- Accepting creates or updates an event with `origin = INFERRED`, `status = TENTATIVE`, source `WHATSAPP`, plus default reminders. AMS / Moodle stay authoritative (Section 4.6). If an official source later agrees, the event auto-becomes `CONFIRMED`.
- Proposals expire after 14 days or when the proposed time passes.
- Rate cap: at most 5 proposals notified per person per day (the rest still appear in the Review inbox).

### 9.10 Media, links, polls
- Media from tracked senders: images, PDFs, DOCX / PPTX / XLSX, short audio ignored (flag only), video stored only if small or pinned. Max file size default 25 MB; allowed types allow-list; random storage keys; never executed.
- Store into `Inbox` with a suggested subject (from group default subject, aliases in the caption, or learned `file_routing_rules`); one tap confirms. Corrections create routing rules.
- Polls: capture question and options as text. Contacts, locations, stickers, view-once media: ignored.

### 9.11 WhatsApp screen
Message list with filters (group, person, category, VIP only, unread, has file, date range); highlighted keywords / dates; role badges (⭐ VIP, CR, Faculty); "Add to calendar" shortcut; thread context (quoted snippet); file chips; link chips with type; **Review** tab (proposals); **Rules** tab (groups, people, keywords, capture mode, retention); connection status with **Re-link** and **Disconnect & wipe**.

### 9.12 Retention and privacy
Purge messages older than `wa_retention_days` (except pinned or linked to an accepted event); media follows the same rule unless filed into a subject folder by the student. **Wipe WhatsApp data** and **Disconnect** buttons remove messages, media references and the session. Never log message bodies. Messages are personal data of others: do not share them with other UniDash users and do not use them for anything beyond this student's own dashboard.

### 9.13 Edge cases and failure handling
- **Reconnects and history sync** can replay old messages → idempotent by `wa_message_ref`; replays before the link time are backfilled silently.
- **Edits** update the stored body (`edited = true`) and re-run extraction; **deleted-for-everyone** marks `deleted_by_sender = true` and keeps the stored text only until the next retention purge (show "deleted by sender").
- Forwarded messages: flag `is_forwarded`; lower importance unless from a VIP.
- Group renamed, person left, number changed: match on ids, not display names; allow re-mapping a label to a new id.
- Disconnected / logged out from the phone: status `NEEDS_REAUTH`, single `INTEGRATION_ATTENTION` notification with a Re-link button. Long silence does not mean failure.
- Very long messages: store up to a cap (e.g. 4,000 characters) and mark truncated.
- Devanagari and emoji must render correctly (font fallback); search must work on Hinglish tokens.
- Library breaks after a WhatsApp update: the worker disables only the WhatsApp provider, keeps everything else running, and alerts the owner.

### 9.14 Fallback: chat-export import (P2)
Let the student upload WhatsApp's "Export chat" `.txt` / `.zip`. The parser MUST handle both Android and iOS line formats and day-first dates, apply the same tracked-people filter and the same pipeline, and never import people who aren't tracked.

---


## 10. Product Modules and UX Specification

Navigation: **Home (Radar) · Calendar · Files · WhatsApp · More** (bottom tab bar on phones; collapsible sidebar on desktop). "More" holds Exams, Deadlines, Subjects, Projects, Presentations, Attendance, Grades, Notices, Search, Settings, Admin.
Every screen shows a **"Last synced N min ago"** chip per source and a stale-data badge when older than twice the expected interval.

### 10.1 Home — the Academic Radar (default landing page)

```text
┌────────────────────────────────────┐
│ UniDash            🔍  🔔3   ◐     │
│ Fri 2 Oct · AMS 12m · Moodle 8m    │
├────────────────────────────────────┤
│ ⚠ NEEDS ATTENTION (3)              │
│  ▸ CS-301 Assignment 3 · due in 5h │
│  ▸ CS-302 Minor-2 moved → Wed 14   │
│  ▸ OS attendance 76.4% (limit 75)  │
├────────────────────────────────────┤
│ NEXT UP                            │
│  10:00 CS-302 Lecture · Room 204   │
│  14:00 Quiz · Algorithms           │
├────────────────────────────────────┤
│ THIS WEEK  ▓▓▓▓░░  6 items         │
│  Mon · Tue · Wed [Minor-2] · …     │
├────────────────────────────────────┤
│ SINCE YOUR LAST VISIT              │
│  (feed cards, newest first)        │
└────────────────────────────────────┘
 [Home] [Calendar] [Files] [WhatsApp] [More]
```
**"Needs attention" rules** (ordered): overdue and not done → due within 24 h and not done → exam within 72 h → exam clash / crunch warning → attendance at risk → proposed events waiting for review → integration needing re-login. Cap at 5 with "see all".
**"Since your last visit"** = feed items with `created_at > users.last_visit_at`; update `last_visit_at` when the screen has been in view for a few seconds.
**Crunch detection:** ≥ 3 events of kind exam / quiz / presentation, or assignments with weightage ≥ 10 %, inside any rolling 72 h → `CRUNCH_WARNING` banner suggesting what to start first.

### 10.2 Exam Hub (majors and minors, the user's main pain)
- Top **exam strip**: horizontal timeline from today to the end of term with markers for every Minor, Major, Practical, Viva (distinct shapes and colours).
- Grouped by exam type → **Minor-1, Minor-2, Major, Practicals, Vivas**; inside each, cards per subject, soonest first.
- Card:
```text
┌──────────────────────────────────────────┐
│ MINOR-2 · CS-302 Database Systems        │
│ Wed 14 Oct · 2:00–4:00 PM · Room 204     │
│ in 12 days   ● CONFIRMED (AMS)  ↻ moved  │
│ Syllabus: Units 3–4  [view]  Files: 5    │
│ [Add reminder] [Open in AMS] [Notes]     │
└──────────────────────────────────────────┘
```
- Shows source chips, change history ("was Mon 12 Oct 10:00"), conflict chips (WhatsApp vs AMS), clash warnings, and a per-exam **prep checklist** (tasks) with progress bar. Filters: subject, type, upcoming / past.
- Prep helpers (P1): attach syllabus and PYQ files; "Exam pack" = one-tap ZIP of the files tagged for that exam.

### 10.3 Deadlines board
Buckets: **Overdue · Today · Tomorrow · This week · Later**. Items: assignments, quizzes, lab files, submissions, project milestones, presentations, fee due. Row: icon, title, subject colour, due time, weightage, source chip, `submission_state` badge, progress control (Not started / In progress / Done / Skipped).
- Moodle `SUBMITTED` auto-marks `Progress = DONE` (user can undo).
- **Priority score** (tunable constants in `packages/core`):
```text
score = base(kind) + urgency + weight_bonus + manual
base:  MAJOR_EXAM 40, MINOR_EXAM 30, PRACTICAL/VIVA 25, PRESENTATION 25, QUIZ 20,
       ASSIGNMENT 15, PROJECT_MILESTONE 15, LAB_FILE_SUBMISSION 15, other 5
urgency = overdue&not done ? 120 : 100 * exp(-hours_left / 72)       // 24h→72, 72h→37, 7d→10
weight_bonus = min(weightage_pct, 30)       manual = pinned ? +20 : 0
```
Sort by score by default; the student can switch to "by date".

### 10.4 Calendar
- Views: **Day, Week (default on desktop), Month, Agenda (default on phone), Semester timeline** (whole term at a glance with exam weeks, presentation weeks, holidays).
- Colours + icons per kind (Section 14.3); colour is never the only signal.
- Filters: subject, kind, source, tentative / confirmed. Tentative items are hatched / dashed.
- Click / tap → side sheet: details, sources, history, reminders, tasks, files, "Open in source".
- Manual add with **natural-language quick add** (P1): "Physics quiz 14 Oct 10am" → parsed with the same date engine → confirmation sheet.
- **Calendar subscription:** read-only `.ics` feed per user at `/api/v1/calendar/feed/<secret-token>.ics` (token rotatable). Requirements: stable `UID` per event, `SEQUENCE` increments on change, `LAST-MODIFIED`, UTC times (or all-day dates), `ETag` support, cancelled events as `STATUS:CANCELLED`, optional `VALARM`. Note in the UI that Google Calendar can take many hours to refresh subscribed feeds, so UniDash reminders stay the primary alert.

### 10.5 Subject Hub (the answer to "too many files and projects")
`/subjects/[id]` gathers everything about one course. Tabs: **Overview** (next events, attendance ring, latest grade, pinned items) · **Timeline** (all events and history) · **Files** (auto-foldered) · **Projects and Presentations** · **Grades** · **Attendance** · **Notices and Chat** (AMS / Moodle announcements + tracked WhatsApp messages tagged to this subject).

### 10.6 Projects and Presentations
A project or presentation is a small workspace: overview, **status**, deadline(s), **tasks / checklist**, **milestones** (appear on the calendar), team members (free-text names, optionally linked to UniDash users), files, links (repo, drive), notes, timeline.
- **Presentation tracker** fields: subject, topic, slot date / time / venue, duration, status (`NOT_STARTED → RESEARCHING → DRAFTING → REHEARSING → READY → PRESENTED`), team, slides file, notes. The slot creates a `PRESENTATION` event.
- **Template checklist** (editable): finalise topic · outline · divide parts · slides draft · review with team · rehearse ×2 · export PDF backup · copy to pen-drive / cloud · carry ID card and charger.
- Default reminders: 7 d, 3 d, 1 d, 3 h before the slot; plus a rehearsal reminder 2 days before. Lab files / records: the same pattern with "check and sign" milestones.
- Sharing (P1): invite another UniDash user as editor / viewer; shared tasks and files.

### 10.7 Files
- **Auto-structure** per term: `Semester N / <Subject> / {Lectures, Assignments, Lab, Notes, PYQ and Exams, Projects, Presentations, Resources}` plus a root `Inbox`.
- Sources: Moodle (auto), WhatsApp media from tracked people (to `Inbox` with suggestion), manual upload (drag-and-drop, multi-select, camera on phones), PWA share-target (P2).
- **Inbox**: unsorted items show a suggested subject / folder; one tap to confirm; corrections create routing rules.
- Features: grid / list, preview (PDF, images, video, code with syntax highlight; Office → download + extracted text), search (name + extracted text), tags (`important`, `exam`, `PYQ`, `project`), bulk move / delete / tag / **download as ZIP**, versions with "Updated" badge, duplicates merged by SHA-256, "New since last visit" badge, storage quota bar, "Pin for exam" collections.
- Safety: uploads validated by sniffed type and size, random storage keys, downloads via short-lived signed URLs, HTML / SVG never rendered inline.

### 10.8 Attendance
- Cards per subject: ring (attended / total, %), threshold line, trend sparkline, status (Safe / Watch / At risk / Short).
- **Calculator** (pure functions in `packages/core`, threshold from settings, `r = threshold / 100`, must be `< 1`):
```text
can_skip(a, t, r)     = max(0, floor(a / r − t))                 // classes you can miss and stay ≥ r
must_attend(a, t, r)  = max(0, ceil((r·t − a) / (1 − r)))        // consecutive classes to get back to ≥ r
after_skip(k)   = a / (t + k)         after_attend(k) = (a + k) / (t + k)
```
Use a tiny epsilon for floating-point comparisons. Example: a=40, t=50, r=0.75 → can skip 3; a=35, t=50 → must attend 10.
- **Simulator** (P1): "If I skip tomorrow's CS-301 lecture I'll be at 74.2 %" using upcoming timetable events.

### 10.9 Grades
Table by subject and component (minor, major, assignments, quizzes, practical, viva) with obtained / max / weight. P1: running total and **"marks needed in the Major to reach X total"** when weightages are known. Highlight new results.

### 10.10 Notices
Unified list of AMS notices and Moodle announcements with search, subject tag, "important" star, attachments (auto-filed), "mark all read".

### 10.11 Global search (P1)
One box (⌘/Ctrl+K on desktop) across events, feed, notices, files (name + text), WhatsApp messages. Results grouped by type with filters. Postgres full-text + trigram; respects the user's scope.

### 10.12 Settings
- **Integrations:** per source status, last success, last error, **Sync now**, Pause / Resume, Re-login, Test connection, Disconnect & wipe, chosen access tier (read-only info).
- **Notifications:** channel toggles, per-category matrix, quiet hours, digest time, daily cap, test notification.
- **Subjects and exam names:** edit aliases, colours, exam labels (`exam_labels`), attendance threshold.
- **WhatsApp:** groups, people, keywords, capture mode, retention.
- **Calendar:** `.ics` URL (copy / regenerate), default reminder offsets per kind.
- **Appearance:** theme, clock format, density (compact / comfortable).
- **Account and data:** devices / sessions (sign out everywhere), export all data (JSON + files ZIP), delete account and data, kill switch (owner).

### 10.13 Onboarding wizard (resumable, each step has "Test")
1. Sign in with Google (invite-only). 2. Choose term; confirm attendance minimum and exam names. 3. **Connect Moodle** (token / SSO helper / ICS) → Test → import courses. 4. **Connect AMS** (Login Helper) → Test → import subjects, timetable, exam schedule. 5. **Confirm subject ↔ course mapping.** 6. Notifications: install PWA, allow push, choose digest time, optional Telegram. 7. **WhatsApp (optional)**: link, pick group, pick people, preview. 8. First-run summary: counts imported, nothing alerted yet. Any step can be skipped and resumed later.

### 10.14 Admin / health (owner only)
Per-user, per-integration status; last 50 `sync_runs` with durations and error codes; "run now"; worker heartbeat; queue depth; storage use; recent audit events; failed notifications; button to download a sanitised failure artifact; global kill switch.

### 10.15 States and microcopy
Every list has a skeleton loader, an empty state that teaches ("No exams yet — connect AMS to import your date-sheet"), and an error state with a retry. Offline: banner + read-only cached Radar / Calendar. Errors are specific and blame-free: *"AMS is asking you to log in again. Tap to reconnect — your data is safe."*

---


## 11. Notification and Reminder Engine

### 11.1 Channels
| Channel | Default | Notes |
|---|---|---|
| In-app bell + feed | on | Always; real-time via SSE; unread badge; grouped by source |
| Phone / browser push (Web Push, VAPID) | on | Installed PWA; on iPhone only works after "Add to Home Screen"; remove subscriptions that return 404 / 410 |
| Telegram bot | off (recommended extra) | Free, reliable; link with a one-time code; messages carry a deep link |
| E-mail | off | Digests and critical alerts only |
| WhatsApp message to self | **off, discouraged** | Sending increases ban risk. If enabled: CRITICAL only, ≤ 5/day, plain text |

### 11.2 Severity policy (default; user can override per category)
| Event | Severity | Push? |
|---|---|---|
| Exam rescheduled / cancelled / clash; class cancelled today | **CRITICAL** | yes, can pass quiet hours if the event is within 12 h |
| New exam scheduled; new assignment / quiz due ≤ 7 d; due date moved earlier; grade posted; attendance below threshold; integration needs re-login; tracked VIP message; proposed event | **IMPORTANT** | yes |
| Notice; due date moved later; keyword alert (non-VIP); attendance below threshold + buffer; fee due ≤ 7 d | NORMAL | batched / digest |
| New resource; attendance changed; timetable minor change; initial import | INFO | feed only |

### 11.3 Anti-noise rules
- **Collapse bursts:** same `group_key` within 10 minutes → one notification ("5 new files in CS-301").
- **Daily cap** for non-critical pushes (default 20); overflow goes to the next digest.
- **Quiet hours** (default 23:00–06:30 IST): deferred to the morning digest, except CRITICAL within 12 h.
- **Idempotency:** `notification_log` is unique on `(feed_item_id, channel)`; retries (max 3, exponential back-off) never double-send.
- **Baseline suppression:** first import never alerts per item.
- **Self-caused changes** (the student marks something done) never notify.

### 11.4 Reminders
Generated from events; stored in `reminders`; dispatched by a worker loop every 30 s using `SELECT … FOR UPDATE SKIP LOCKED` on `state = 'PENDING' AND remind_at <= now()`.

| Kind | Default offsets before |
|---|---|
| MAJOR_EXAM | 14 d, 7 d, 3 d, 1 d, 3 h |
| MINOR_EXAM | 7 d, 3 d, 1 d, 3 h |
| PRACTICAL_EXAM / VIVA | 7 d, 2 d, 1 d, 2 h |
| QUIZ | 1 d, 3 h, 1 h |
| ASSIGNMENT | 3 d, 1 d, 6 h (+1 h if weightage ≥ 10 %) |
| PRESENTATION | 7 d, 3 d, 1 d, 3 h (+ rehearsal reminder 2 d before) |
| LAB_FILE_SUBMISSION | 2 d, 1 d, 3 h |
| PROJECT_MILESTONE | 3 d, 1 d |
| FEE_DUE | 7 d, 2 d |
| CLASS / LAB_SESSION | none by default (shown in "Next up") |

Rules: skip offsets already in the past; if a reminder lands in quiet hours, move it to `quiet_end` unless the event is within 12 h; when an event changes, cancel its pending reminders and regenerate them (keeping any custom offsets); done / cancelled events skip remaining reminders; snooze presets 15 min / 1 h / tomorrow morning. Users can add or remove offsets per event and change the defaults per kind in Settings.

### 11.5 Digests
- **Daily** at `digest_time` (default 07:30 IST): today's classes (with rooms), due today / tomorrow, exams in the next 7 days, attendance warnings, overnight changes, pending proposals.
- **Weekly** (default Sunday 19:00): the coming week by day, exam countdowns, items with no progress yet.
- Empty digests are not sent.

### 11.6 Copy style (examples; concise, specific, IST, no blame)
- `📝 Due tomorrow — CS-301 · Assignment 3 · 11:59 PM`
- `🔁 Exam moved — CS-302 Minor-2: Mon 12 Oct 10:00 → Wed 14 Oct 14:00 (AMS)`
- `⚠️ Attendance — Algorithms is at 76.4% (minimum 75%). You can miss 1 more class.`
- `💬 Prof. Sharma (CS-301 group): "Quiz tomorrow 2 PM, Lab 4" — 1 event to review`
- `🔌 AMS needs you to log in again. Tap to reconnect.`

---

## 12. Security, Privacy and Compliance

### 12.1 Credential and session vault (`packages/vault`)
- **Prefer not storing passwords at all.** Store session state (cookies / storage state), Moodle tokens, or the iCal URL where possible; these can be revoked without changing the student's password.
- **Preferred design:** the web app only has the worker's **public key** and *seals* incoming secrets (libsodium sealed box or RSA-OAEP); only the **worker** holds the private key. The internet-facing process therefore cannot decrypt anything. *Acceptable v1 simplification:* both processes share a symmetric key, but secrets never reach the browser after submission.
- Symmetric encryption, where used: **AES-256-GCM**, random 12-byte nonce per encryption, authentication tag stored, **associated data = user_id + integration_id**, per-user key derived with HKDF from the master key, `key_version` column for rotation, a re-encryption job for rotation.
- No API ever returns a secret; UI can only "replace" or "remove". Memory holding secrets is short-lived; never log or serialize secret objects.
- Backups contain ciphertext only; the master key is stored separately from backups.

### 12.2 Sign-in and authorisation
- Google OAuth through a maintained auth library, DB-backed sessions (revocable), **invite-only**: sign-in succeeds only if the **verified** e-mail is in `allowed_emails`. The Google `hd` (hosted domain) parameter is only a UI hint — always verify server-side.
- **Fallback if the college's Google Workspace blocks third-party apps:** allow-list a personal Gmail instead, or use e-mail magic links.
- Sessions: HttpOnly, Secure, SameSite=Lax cookies; sliding expiry (e.g. 30 days); "sign out everywhere".
- Authorisation: every query scoped by `user_id` (Section 4.9); owner-only admin routes; automated cross-user access tests.

### 12.3 Web application security
HTTPS only + HSTS; strict CSP (nonces, no inline scripts), `X-Content-Type-Options`, `Referrer-Policy`, frame protection; CSRF protection on state-changing routes; rate limits on sign-in, API, uploads, "sync now", push subscribe; Zod validation on all inputs; **treat scraped notices, Moodle HTML and WhatsApp text as untrusted** — render as text or sanitise (e.g. DOMPurify) and never inject as raw HTML; parameterised queries only.

### 12.4 Outbound request safety
The worker may contact only configured hosts (AMS base URL, Moodle base URL, WhatsApp endpoints used by the library, push services, Telegram). Playwright routes block navigation and requests to other hosts. No user-supplied URL is ever fetched (prevents SSRF). Link previews, if added later, go through a safe fetcher with host/IP checks.

### 12.5 Files
Private bucket; random keys; sniffed content-type allow-list; size limits; antivirus scanning optional; downloads via short-lived signed URLs with `Content-Disposition: attachment` for anything not safely previewable; PDF preview through PDF.js; HTML / SVG are never rendered inline; archives are not auto-extracted.

### 12.6 Logging and privacy
Structured JSON logs with redaction of: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `session`, `sesskey`, ICS URLs, phone numbers (mask), e-mail (mask), message bodies (never logged). Failure artifacts (screenshots / HTML) stay on the worker disk only, readable by the owner, deleted after 7 days.
Data lifecycle: retention jobs (Section 16); **Export my data** (JSON + files ZIP); **Delete my account** (DB rows, files, secrets, WhatsApp session logout) completed within one job run; audit log for sign-in, credential changes, export, delete, kill switch.

### 12.7 Supply chain and operations
Lockfile + `npm ci`; dependency audit and automated update PRs; secret scanning pre-commit and in CI (e.g. gitleaks); Docker images run as non-root, minimal base, read-only filesystem where possible; Playwright runs in a container with `--no-sandbox` **only** if the container is itself isolated; least-privilege database roles (web app role cannot read `secret_ciphertext`).

### 12.8 Ethics and policy
Read-only; each student connects only their own accounts; no CAPTCHA / OTP bypass; low request rates; honour the college's IT acceptable-use policy (the owner should read it and, if unsure, ask the college IT cell); friends must give informed consent before their credentials or sessions are handled by the owner's server; WhatsApp unofficial-client risk accepted knowingly (Section 9.2). A **kill switch** pauses all syncs immediately.

### 12.9 Threat summary
| Asset | Threat | Mitigation |
|---|---|---|
| College sessions / tokens | Server breach, log leak | Sealed vault, public-key sealing at the edge, redaction, short artifact retention |
| WhatsApp session | Theft → account takeover | Encrypted at rest, spare number, restricted permissions, easy "unlink device" |
| Other students' data | Cross-user access bug | Scoped DB layer, tests, row-level security |
| Dashboard accounts | Phishing / unauthorised sign-in | Invite-only, verified e-mail, revocable sessions |
| Browser users | XSS via notices / chat | Text rendering, sanitisation, CSP |
| Worker | SSRF / malicious redirects | Host allow-list, route blocking |
| Files | Malware upload | Type/size limits, no inline rendering, optional AV |

---

## 13. Reliability, Observability and Testing

### 13.1 Reliability
- Jobs are **idempotent**, have timeouts (per step 30 s, per run 120 s), bounded retries and back-off, and release resources in `finally` (close browser contexts, delete temp files).
- One Chromium instance, one `BrowserContext` per user per run; memory ceiling and restart policy for the worker.
- Per-user advisory lock so a user never has two syncs at once; crash-safe transactions; "catch-up" run on worker start for anything overdue.
- Circuit breaker per integration (Section 7.7); `AUTH_FAILED` never retries.
- Degrade gracefully: if WhatsApp breaks, AMS and Moodle keep working, and vice versa.

### 13.2 Failure artifacts
On `LAYOUT_CHANGED` / `UNKNOWN`: save a screenshot and the sanitised HTML / JSON to the worker's local `artifacts/` folder (never uploaded), record the path in `sync_runs`, and delete after 7 days. The owner can download one from the admin page to build a new fixture (after redacting personal data).

### 13.3 Observability
`/api/health` (web) and a worker **heartbeat** row every minute; an external free "dead-man's-switch" ping so the owner is alerted when the worker stops; admin page (Section 10.14); structured logs with run ids; counters for syncs, failures, notifications sent / suppressed.

### 13.4 Testing strategy
| Level | What |
|---|---|
| Unit | date parsing (day-first, Hinglish), priority score, attendance calculator, reminder generation, diff engine, reconciliation precedence, severity policy, vault encrypt / decrypt, retention |
| Fixture / contract | every AMS and Moodle parser against sanitised fixtures (normal, empty, malformed, layout-changed); WhatsApp classifier against a labelled message set (English, Hinglish, Devanagari) |
| Integration | DB migrations; end-to-end pipeline with mocked HTTP (MSW) producing the right `events`, `feed_items`, `reminders`, and **no duplicates on re-run** |
| Security | cross-user access tests for every route; secrets never in responses or logs; upload validation; XSS rendering test with hostile notice / chat text |
| E2E (Playwright Test) | sign in → onboarding → Radar → accept a proposed event → mark assignment done → calendar feed validates |
| Live canary | optional daily dry-run against the real portals (read-only) that compares output shape and alerts the owner on drift |
| Time | tests pinned to IST; month / year boundaries; leap day; "tomorrow" across midnight |

**Fixtures:** only sanitised data (fake names, roll numbers, phone numbers, e-mails, messages). A pre-commit check rejects files containing patterns that look like real tokens or phone numbers.

---


## 14. Design System and UI Rules

### 14.1 Principles
1. **Glance first.** The Radar answers "what needs me now?" in 3 seconds; detail is one tap deeper.
2. **Calm.** Red is reserved for overdue, clash, cancelled and critical. No streaks, guilt copy, confetti or auto-playing anything.
3. **Thumb-first.** The phone is the primary device: bottom tab bar, touch targets ≥ 44 × 44 px, primary actions in the lower half of the screen, side sheets instead of centred modals.
4. **One primary action per card** (e.g. "Add as tentative"); secondary actions live in a ⋯ menu.
5. **Provenance everywhere.** Each item shows its source chip, when it was last confirmed, and what changed ("↻ moved").
6. **Never colour alone.** Every colour-coded meaning also has an icon, shape, label or pattern.

### 14.2 Design tokens (CSS variables; starting values, adjust until contrast passes)
| Token | Dark (default) | Light |
|---|---|---|
| `--bg` | `#09090b` | `#ffffff` |
| `--card` | `#18181b` | `#f4f4f5` |
| `--border` | `#27272a` | `#e4e4e7` |
| `--text` | `#fafafa` | `#09090b` |
| `--muted` | `#a1a1aa` | `#52525b` |
| `--accent` | `#3b82f6` | `#2563eb` |
| `--success` | `#4ade80` | `#15803d` |
| `--warning` | `#fbbf24` | `#b45309` |
| `--danger` | `#f87171` | `#dc2626` |

- Theme setting: `dark` (default) / `light` / `system`; follows `prefers-color-scheme` when `system`; stored in `users.theme`; applied before first paint (no flash).
- Body text contrast ≥ 4.5 : 1, large text and UI borders ≥ 3 : 1 in **both** themes; verify with a contrast checker, do not eyeball.
- Typography: Inter or Geist for Latin; **Noto Sans Devanagari** as fallback (WhatsApp text contains Hindi); base 16 px, line-height 1.5; tabular numerals for times, percentages and countdowns.
- Radius 8 px (controls) / 12 px (cards); 4 px spacing grid; density `comfortable` (default) or `compact`.
- Motion: Framer Motion only for sheet / list enter-exit (≤ 200 ms); everything honours `prefers-reduced-motion`.

### 14.3 Colours, icons and shapes per kind
Subject colour (a 12-colour, colour-blind-safe palette auto-assigned, editable) is shown as a **left stripe** on rows and cards. Kind colour is shown on the **icon badge**. Both are always accompanied by text.

| EventKind | Colour | Lucide icon | Emoji (notifications only) | Exam-strip marker |
|---|---|---|---|---|
| CLASS | blue | `GraduationCap` | 🏫 | — |
| LAB_SESSION | green | `FlaskConical` | 🔬 | — |
| ASSIGNMENT | orange | `FileText` | 📝 | — |
| QUIZ | rose | `CircleHelp` | ❓ | — |
| MINOR_EXAM | red | `ClipboardList` | 📋 | ◆ diamond, outlined |
| MAJOR_EXAM | red, bold border | `ClipboardCheck` | 📋 | ■ large filled square |
| PRACTICAL_EXAM | green | `Microscope` | 🧪 | ● circle |
| VIVA | teal | `MessagesSquare` | 🗣️ | ▲ triangle |
| PRESENTATION | purple | `Presentation` | 🎤 | — |
| PROJECT_MILESTONE | indigo | `Flag` | 🚩 | — |
| LAB_FILE_SUBMISSION | lime | `BookOpenCheck` | 📒 | — |
| HOLIDAY | yellow | `PartyPopper` | 🎉 | — |
| FEE_DUE | amber | `IndianRupee` | 💰 | — |
| NOTICE_DEADLINE | slate | `Megaphone` | 📢 | — |
| PERSONAL | grey | `Pin` | 📌 | — |
| OTHER | grey | `Circle` | • | — |

**State styling:** `TENTATIVE` = dashed border + hatched fill + "Tentative" chip · `CONFIRMED` = solid · `CANCELLED` = strikethrough + grey + "Cancelled" chip · moved = `↻ moved` chip with old value on tap · `OVERDUE` = red chip with the word "Overdue" · `DONE` = check icon + muted · stale source data = amber "stale" chip with the age.
**Severity styling:** CRITICAL = red banner/icon + stays until acknowledged; IMPORTANT = amber dot; NORMAL = no marker; INFO = muted text.
**Source chips (always text):** `AMS`, `Moodle`, `WhatsApp`, `System`, `Manual`.

### 14.4 Component inventory
`AttentionList`, `NextUp`, `WeekStrip`, `FeedCard`, `DeadlineRow`, `ExamCard`, `ExamStrip`, `ProgressControl`, `SourceChip`, `SyncChip`, `StaleBadge`, `ConflictChip`, `ProposalCard`, `CalendarViews`, `EventSheet`, `AttendanceRing`, `FileTile`, `FolderTree`, `InboxItem`, `ProjectCard`, `PresentationStepper`, `ReminderEditor`, `WaMessageCard`, `IntegrationCard`, `EmptyState`, `ErrorState`, `Skeleton`, `UndoToast`.

**FeedCard anatomy:** source chip · relative time (absolute on hover / long-press) · title · one-line body · optional **before → after** block (e.g. `Mon 12 Oct 10:00 → Wed 14 Oct 14:00`) · at most two actions · unread dot · pin / archive in ⋯.

**Interaction rules**
- Optimistic updates with a 5-second **Undo** toast for progress changes, dismiss and archive.
- Phone swipe: right = mark done, left = snooze; always with a visible button alternative.
- Pull-to-refresh refreshes data from UniDash only; it never triggers a source sync (if the student wants one: "Sync now" with its 5-minute cooldown).
- Long lists are virtualised and paginated by cursor.
- Destructive actions (delete, disconnect & wipe, delete account) require typed or explicit confirmation and say exactly what will be removed.

### 14.5 Accessibility (WCAG 2.2 AA is the target)
Full keyboard operation; visible focus rings; correct landmarks and headings; calendar grid with proper ARIA roles and arrow-key navigation; labels on every icon-only button; text resizable to 200 % without loss; no information conveyed only by colour or only by hover; live-region (polite) announcements for SSE updates; critical alerts are not auto-dismissing toasts; images have alt text; Devanagari renders correctly.

### 14.6 PWA and offline behaviour
- Manifest: name "UniDash", `display: standalone`, theme / background colours, maskable icons, shortcuts ("Radar", "Deadlines", "Exams").
- Service worker (Serwist or Workbox; verify the currently recommended Next.js integration): precache the app shell; **stale-while-revalidate** only for authenticated `GET` of Radar, events, deadlines and subjects; **never** cache auth routes, integration endpoints, `.ics`, file downloads or anything containing secrets.
- Offline: banner "Offline — showing saved data from 14:02", read-only Radar and Calendar, writes disabled with an explanation (no offline write queue in v1).
- Push handler: show the notification with `tag = group_key` (collapses bursts), `data.url` deep link; handle `notificationclick` (focus existing window or open) and `pushsubscriptionchange` (re-subscribe).
- Install prompt: offered after the second visit, never on the first; on iPhone show the "Share → Add to Home Screen" instructions, because push only works for the installed PWA.
- Update flow: when a new service worker is waiting, show "New version available — Reload".

### 14.7 Formats and microcopy
- All times IST by default; clock 12 h (setting). Date format `Fri 2 Oct`, with the year only when it differs from the current one. Relative: `in 5 h`, `tomorrow 2:00 PM`, `in 12 days`, `2 d ago` (absolute time on hover / long-press).
- Tone: short, specific, blame-free, no exclamation marks except celebrations the student asked for; numbers over adjectives.
- Every list has skeleton, empty (teaches the next step) and error (retry + reason) states (Section 10.15).
- Strings live in `messages/en.json` from day one (Hindi UI is P2); never concatenate translated fragments.

---

## 15. API Specification (`/api/v1`)

### 15.1 Conventions
- JSON over HTTPS; every request and response validated with Zod (shared schemas); unknown fields rejected.
- **Auth:** DB-backed session cookie (HttpOnly, Secure, SameSite=Lax). State-changing requests also require an `Origin` / `Sec-Fetch-Site` check plus a CSRF token (Section 12.3). All routes except `/health` and the `.ics` feed require a session; owner-only routes are marked **(owner)**.
- **Scoping:** every handler obtains `scopedDb(session.userId)`; path ids belonging to another user return `404`, never `403` (no existence leaks).
- **Errors:** `{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [...], "requestId": "…" } }`. API codes: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `RATE_LIMITED`, `COOLDOWN_ACTIVE`, `CONFLICT`, `INTEGRATION_NOT_READY`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_TYPE`, `INTERNAL`. (Integration error codes such as `AUTH_EXPIRED` stay in Section 7.8 and appear inside integration status objects, not as HTTP errors.)
- **Pagination:** cursor-based (`?cursor=…&limit=50`, max 100); responses `{ items, nextCursor }`.
- **Times:** ISO-8601 UTC strings; the UI converts to IST.
- **Idempotency:** `POST` that creates events, uploads or proposals accepts an `Idempotency-Key` header (stored 24 h).
- **Concurrency:** `PATCH` on events / projects uses `If-Match: <updated_at>`; mismatch → `409 CONFLICT`.
- **Rate limits (per user unless noted):** sign-in 10 / 15 min / IP · general API 120 / min · uploads 30 / hour · sync-now 1 / 5 min / integration · push subscribe 10 / hour · pairing code 5 / hour · `.ics` 60 / hour / token.
- **Secrets:** no endpoint ever returns a secret; integration endpoints can only *replace* or *remove* it.
- Route handlers are thin; all logic lives in `packages/core` and `packages/db` services.

### 15.2 Endpoints

```text
# Session & account
GET    /auth/me                                  current user, role, feature flags
GET    /auth/sessions                            devices
DELETE /auth/sessions/:id                        sign out one device
POST   /auth/sessions/revoke-all                 sign out everywhere
GET    /settings            PATCH /settings      user_settings (thresholds, digest, quiet hours, exam_labels, wa_retention…)
PATCH  /settings/notifications                   per-category / per-channel matrix
POST   /account/export                           queue "export my data" → returns job id
POST   /account/delete                           queue account + data deletion (typed confirmation)
GET    /admin/allowed-emails (owner)   POST/DELETE /admin/allowed-emails/:email (owner)

# Home
GET    /radar                                    one aggregated payload: needsAttention[], nextUp[], thisWeek[], since[], syncChips[]
POST   /visit                                    marks "last visit" after the screen was in view a few seconds

# Structure
GET/POST /terms          PATCH /terms/:id
GET/POST /subjects       PATCH /subjects/:id     aliases, colour, moodle_course_id, ams_ref, is_active
GET    /subjects/:id/hub                         overview payload for the Subject Hub

# Events, deadlines, exams
GET    /events?from&to&kind&subject&source&status&progress
POST   /events                                   manual event (origin = MANUAL)
GET    /events/:id                               incl. sources[], history[], reminders[], tasks[], files[]
PATCH  /events/:id                               edited fields are added to locked_fields
DELETE /events/:id                               soft delete (manual only; source events can be hidden, not deleted)
PATCH  /events/:id/progress                      { progress }
POST   /events/:id/unlock-field                  { field } (accept the source value again)
GET    /deadlines?bucket&sort=score|date         board buckets (Section 10.3)
GET    /exams?type&subject&when=upcoming|past    Exam Hub payload with strip data
POST   /events/:id/reminders   DELETE /reminders/:id   POST /reminders/:id/snooze   { preset | until }
PUT    /reminder-defaults/:kind                  default offsets per kind
GET    /calendar/feed/:token.ics                 public by secret token; ETag / If-None-Match; Content-Type text/calendar
POST   /calendar/feed/rotate                     new token; old one stops working immediately
POST   /events/parse                             (P1) natural-language quick-add → draft event for confirmation

# Feed & notifications
GET    /feed?source&kind&subject&unread&pinned&cursor
PATCH  /feed/:id        { read | pinned | archived }       POST /feed/mark-all-read
GET    /notifications                            bell dropdown (grouped by source)
POST   /push/subscribe   DELETE /push/subscribe  Web Push subscription CRUD (VAPID public key at GET /push/key)
POST   /notifications/test                       sends a test to chosen channel(s)
POST   /telegram/link-code   DELETE /telegram   (P1) one-time code to link the bot
GET    /stream                                   Server-Sent Events (see 15.3)

# Integrations
GET    /integrations                             status, last_success_at, last_error_code/message, config (never secrets)
POST   /integrations/:kind/pairing-code          one-time code for the Login Helper (valid 10 min)
GET    /integrations/worker-public-key           public key used to seal secrets
POST   /integrations/:kind/session               Login Helper upload of a sealed session (auth = pairing code)
POST   /integrations/:kind/credentials           sealed submission (token / iCal URL / password where allowed)
POST   /integrations/:kind/test                  → worker_command TEST_CONNECTION
POST   /integrations/:kind/sync                  → SYNC_NOW (5-min cooldown → COOLDOWN_ACTIVE)
POST   /integrations/:kind/pause   POST /integrations/:kind/resume
DELETE /integrations/:kind                       disconnect and wipe secrets + imported source data (confirmation)
GET/PUT /integrations/moodle/mapping             course ↔ subject mapping

# Files
GET    /folders  POST /folders  PATCH /folders/:id  DELETE /folders/:id
GET    /files?folder&subject&kind&tag&inbox&q&cursor
POST   /files/uploads                            returns presigned PUT (private bucket, random key); validates size / declared type
POST   /files/uploads/:id/complete               worker sniffs type, hashes, dedupes, quarantines until valid
GET    /files/:id/download                       302 to a short-lived signed URL (Content-Disposition: attachment)
GET    /files/:id/preview                        signed URL for PDF / image / video only; text excerpt for code and Office
PATCH  /files/:id        { display_name | folder_id | subject_id | kind | tags | event_id }
POST   /files/:id/confirm-inbox                  accept suggested placement (optionally creates a routing rule)
POST   /files/bulk       { action: move | tag | delete | zip, ids[] }   zip → async job, signed URL when ready
GET    /files/storage                            used / quota

# Projects & presentations
GET/POST /projects   GET/PATCH/DELETE /projects/:id
POST/PATCH/DELETE /projects/:id/tasks | /milestones | /members
GET/POST /presentations   GET/PATCH/DELETE /presentations/:id     (slot date creates / updates the PRESENTATION event)
POST   /projects/:id/invite                      (P1) share with another UniDash user

# Attendance, grades, notices
GET    /attendance/summary    GET /attendance/:subjectId/log
GET    /attendance/:subjectId/calc?t&a&threshold   can_skip / must_attend (pure core functions)
GET    /attendance/:subjectId/simulate             (P1) uses upcoming timetable events
GET    /grades    GET /grades/needed?subject&target (P1)
GET    /notices?subject&important&q    PATCH /notices/:id { read | important }

# WhatsApp (read-only product; no send endpoint exists)
GET    /wa/status
POST   /wa/connect   → WHATSAPP_CONNECT        POST /wa/disconnect   → logout + wipe session
GET    /wa/groups    PATCH /wa/groups/:id      { is_monitored, capture_mode, default_subject_id }
GET    /wa/groups/:id/participants             for the People picker
PUT    /wa/groups/:id/people                   tracked people (label, role_tag, is_vip, capture_media)
GET/PUT /wa/keywords
GET    /wa/messages?group&person&category&vip&unread&hasFile&from&to&cursor
GET    /wa/dry-run?group                       "12 messages in the last 7 days would be captured"
GET    /wa/proposals?status                    POST /wa/proposals/:id/accept | /edit-accept | /reject
POST   /wa/wipe                                delete stored messages + media references
POST   /wa/import-chat                         (P2) upload an exported chat file

# Search
GET    /search?q&types&subject                 events, feed, notices, files (name + text), WA messages; always user-scoped

# Admin (owner)
GET    /admin/health          per-user per-integration status, worker heartbeat, queue depth, storage
GET    /admin/sync-runs?user&integration       last 50 runs
POST   /admin/run-now         { user, integration, job }
POST   /admin/kill-switch     { enabled }     (audit-logged)
GET    /admin/artifacts/:runId                 sanitised failure artifact download
GET    /health                                 public liveness (no details)
```

### 15.3 Server-Sent Events (`GET /api/v1/stream`)
Authenticated; one stream per tab; heartbeat comment every 25 s; supports `Last-Event-ID` for replay of missed events (last 5 minutes).

| Event | Payload | UI reaction |
|---|---|---|
| `feed.created` | feed item | prepend card, bump unread badge |
| `event.changed` | `{ eventId, fields[] }` | refetch that event; flash the card |
| `notification.created` | `{ id, severity }` | bell badge |
| `integration.status` | `{ kind, status, lastSuccessAt }` | update chips and banners |
| `sync.progress` | `{ kind, step, pct }` | progress in Settings |
| `wa.qr` | `{ qr, expiresAt }` | show / rotate QR |
| `proposal.created` | proposal | Review tab badge |

If SSE is unavailable the client falls back to polling `/radar` every 60 s while the tab is visible.

---


## 16. Background Jobs, Schedules and Retention

**This section is authoritative for frequencies.** Where Sections 7.4 or 8.4 give a different number, this section wins. "Floor" is a hard minimum interval that code MUST enforce even if configuration asks for less (Section 1.6: never scrape faster than allowed).

### 16.1 Scheduler rules
- All timing is evaluated in `Asia/Kolkata`. Scheduling uses `pg-boss` with `singletonKey = <userId>:<integration>:<dataType>` so the same job is never queued twice.
- **Jitter** ±15 % on every interval (spreads load, avoids a robotic pattern).
- The scheduler groups all data types that are due for one user + integration into **one run** (log in once, fetch several pages) under the per-user lock.
- **Concurrency:** 1 run per user per integration; global caps: AMS 2, Moodle 4. WhatsApp is event-driven, not scheduled.
- **Timeouts:** per step 30 s, per run 120 s (Section 13.1). Payloads carry ids, never data.
- **Catch-up on worker start:** any job overdue by more than one interval runs once, staggered 10–30 s apart per user.
- **Kill switch:** `DISABLE_ALL_SYNC=true` or the admin toggle is checked before every job and between steps; when on, jobs end as `SKIPPED`.
- **Back-off ladder** on failure: 2 min → 10 min → 1 h; after 3 consecutive failures the integration is `ERROR` and paused 1 h; `AUTH_*` errors never retry (Sections 7.7 and 7.8). Circuit breaker per integration.
- **Exam season** (auto): any `CONFIRMED` MINOR / MAJOR / PRACTICAL / VIVA event within the next 14 days, or the student switches it on → AMS exam and notice checks run **hourly** and Moodle quiz checks every 30 min.
- **Quiet scraping window:** no AMS page fetches 00:30–05:30 IST (keep-alive only). Moodle API calls are allowed all day but not more often than the floors below.

### 16.2 Integration jobs
| Job | Default interval | Floor | Notes |
|---|---|---|---|
| `ams:keepalive` | 15–20 min, 07:00–23:00 only | 10 min | Only if Phase 0 proved it helps |
| `ams:attendance` | 2 h from 08:00–19:00 on class days, otherwise 6 h | 30 min | Emits `ATTENDANCE_*` |
| `ams:timetable` | daily 06:00 + on demand after a notice mentioning it | 6 h | Rolling 4-week expansion |
| `ams:exams` | **2 h** (hourly in exam season) | 30 min | Meets the "≤ 2 h" goal in Section 2.2 |
| `ams:marks` | 6 h | 1 h | |
| `ams:notices` | 1 h | 30 min | Attachments queued as file jobs |
| `ams:fees` | daily 08:00 | 12 h | |
| `ams:profile` + `ams:subjects` | at setup, then weekly | 24 h | |
| `moodle:updates` (`core_course_get_updates_since`) | 15 min (API tier) / 30 min (session tiers) | 5 min | Triggers targeted refresh only |
| `moodle:assignments` | 30 min / 60 min | 10 min | |
| `moodle:quizzes` | 60 min (30 min in exam season) | 10 min | |
| `moodle:resources` | 2 h | 30 min | Batched notification |
| `moodle:announcements` | 30 min / 60 min | 10 min | |
| `moodle:calendar` | 60 min | 15 min | Cross-check for deadlines |
| `moodle:grades` | 6 h | 1 h | |
| `moodle:notifications` | 30 min | 10 min | Supplementary |
| `moodle:courses` | daily 06:00 | 6 h | |
| `moodle:ical` (Tier 0 only) | 60 min | 30 min | |

### 16.3 System jobs
| Job | Schedule | Purpose |
|---|---|---|
| `reminders:dispatch` | loop every 30 s | `SELECT … FOR UPDATE SKIP LOCKED` on due `PENDING` reminders (Section 11.4) |
| `notifications:dispatch` | queue-driven | Push / Telegram / e-mail with retries ≤ 3 (back-off), idempotent via `notification_log` |
| `digest:daily` | per user at `digest_time` (07:30) | Skip when empty |
| `digest:weekly` | per user, Sunday 19:00 | Skip when empty |
| `timetable:expand` | nightly 00:10 | Rolling 4-week `CLASS` / `LAB_SESSION` events |
| `proposals:expire` | hourly | Expire proposals older than 14 days or past their time |
| `events:lifecycle` | not stored | `UPCOMING / ONGOING / PAST / OVERDUE` is derived at query time (Section 3.2) |
| `reminders:regenerate` | on event change | Cancel pending, regenerate, keep custom offsets |
| `files:ingest` | queue-driven | Sniff type, hash, dedupe, route, extract text, thumbnails |
| `heartbeat` | every 60 s | Row in DB + dead-man's-switch ping every 5 min |
| `pairing:cleanup` | hourly | Delete expired pairing codes |
| `canary:live` (optional) | daily 13:30 | Read-only dry run against real portals; compare output shape; alert owner on drift |
| `backup:db` | daily 02:30 | Encrypted dump (Section 18.6) |
| `storage:check` | daily | Warn at 80 % of quota; alert owner at 80 % of disk |

### 16.4 Retention jobs
| Data | Rule | Job time |
|---|---|---|
| `wa_messages` + WhatsApp media | `wa_retention_days` (default 90); keep pinned or accepted-event-linked; media filed into a subject folder by the student is kept | daily 03:00 |
| `feed_items` | archive at 90 days; hard delete 1 year after archive | weekly Sun 03:30 |
| `sync_runs` | 30 days | daily 03:10 |
| `snapshots` | keep last 5 per (user, source, data type) | after each write |
| failure artifacts (worker disk) | 7 days | daily 03:20 |
| `audit_log` | 1 year | monthly |
| `notification_log` | 90 days | weekly |
| expired / failing `push_subscriptions` | delete on 404 / 410, or after 5 consecutive failures | on send |
| soft-deleted events / files | purge after 30 days (files: also delete the object) | daily 03:40 |
| `worker_commands` | 14 days | daily |

All retention jobs are idempotent, log counts only (never content) and run in small batches to avoid long locks.

---

## 17. Repository, Environment and Engineering Workflow

### 17.1 Monorepo layout (pnpm workspaces)
```text
unidash/
├─ apps/
│  ├─ web/                       Next.js: UI, /api/v1 route handlers, auth, SSE (no secret-opening code)
│  └─ worker/                    Node process: scheduler, job runners, dispatcher, WhatsApp host
├─ packages/
│  ├─ core/                      PURE logic: enums, priority score, attendance calc, reminder generation,
│  │                             diff engine, reconciliation, severity policy, date parsing, WA classifier
│  ├─ db/                        schema, migrations, scopedDb(userId), seed (fake data only)
│  ├─ vault/                     seal / open, AES-256-GCM, HKDF per-user keys, key rotation job
│  ├─ connectors/
│  │  ├─ ams/                    connector.ts, selectors.ts, mappers/, parsers/, fixtures/<page>/<case>
│  │  ├─ moodle/                 client.ts (read-only allow-list), parsers/, fixtures/
│  │  └─ whatsapp/               provider interface + chosen implementation, fixtures/
│  ├─ ui/                        shared components (optional)
│  └─ config/                    Zod env schemas, tsconfig, eslint, prettier
├─ tools/
│  └─ login-helper/              human-assisted login (Section 7.3)
├─ docs/                         SPEC.md  FEASIBILITY.md  DECISIONS.md  PROGRESS.md  RUNBOOK.md  FIXTURES.md
├─ docker/                       Dockerfile.web  Dockerfile.worker  compose.yml  compose.dev.yml  Caddyfile
├─ .github/workflows/            ci.yml  security.yml  release.yml
├─ .env.example  .gitignore  pnpm-workspace.yaml  package.json  README.md
```
**Boundaries (enforced by an ESLint / dependency-cruiser rule in CI):** `apps/web` MUST NOT import `packages/vault` open functions, `packages/connectors/*` or Playwright. `packages/core` MUST NOT import anything with I/O. Only `apps/worker` and `tools/login-helper` may import connectors.

### 17.2 Environment variables (validated with Zod at startup; the app refuses to start if invalid)
| Variable | Used by | Required | Notes |
|---|---|---|---|
| `NODE_ENV`, `TZ=Asia/Kolkata`, `LOG_LEVEL` | all | yes | |
| `APP_URL` | web, worker | yes | public base URL (links in notifications, OAuth redirect) |
| `DATABASE_URL` | web | yes | **web role**: cannot read `secret_ciphertext` |
| `WORKER_DATABASE_URL` | worker | yes | **worker role**: full access to integration secrets |
| `AUTH_SECRET` | web | yes | random 32+ bytes (name per the auth library chosen) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | web | yes | OAuth (Section 18.5) |
| `OWNER_EMAIL` | web | yes | seeds the first `allowed_emails` row and the owner role |
| `WORKER_PUBLIC_KEY` | web | yes (preferred design) | seals incoming secrets; web cannot decrypt |
| `WORKER_PRIVATE_KEY` or `WORKER_PRIVATE_KEY_FILE` | worker | yes | never in the web environment |
| `MASTER_KEY` (32-byte hex) | worker (+ web only in the v1 symmetric simplification) | conditional | `openssl rand -hex 32`; stored apart from backups |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | web (signing), worker | yes | private bucket |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | web (public), worker (private) | yes | generate once; changing them invalidates all push subscriptions |
| `AMS_BASE_URL`, `MOODLE_BASE_URL` | worker | yes | |
| `ALLOWED_OUTBOUND_HOSTS` | worker | yes | host allow-list (Section 12.4) |
| `DISABLE_ALL_SYNC` | worker | no | kill switch |
| `ARTIFACT_DIR`, `WA_SESSION_DIR` | worker | yes | local disk, restrictive permissions |
| `DEADMAN_PING_URL` | worker | recommended | external dead-man's-switch |
| `TELEGRAM_BOT_TOKEN` | worker | optional | |
| `SMTP_URL`, `MAIL_FROM` | worker | optional | |
| `FEATURE_WHATSAPP`, `FEATURE_WA_ALERTS`, `FEATURE_LLM_EXTRACTION`, `FEATURE_TELEGRAM` | web, worker | no | default off for the last three |

`.env.example` lists every variable with fake values and comments. Real `.env*` files are git-ignored. A pre-commit and CI secret scan (gitleaks) blocks accidental commits.

### 17.3 Scripts (every one documented in README)
`pnpm dev` (web + worker + Postgres + MinIO via Docker) · `pnpm test` · `pnpm test:fixtures` · `pnpm typecheck` · `pnpm lint` · `pnpm db:migrate` · `pnpm db:seed` (fake data) · `pnpm worker:dev` · `pnpm login-helper --kind ams --code XXXX-XXXX` · `pnpm keys:generate` (worker key pair, VAPID, master key) · `pnpm fixtures:check` (rejects real-looking tokens / phone numbers) · `pnpm audit:deps` · `pnpm e2e`.

### 17.4 Workflow
- Git with a **private** repository; short-lived branches; Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`); PR template contains the Definition of Done checklist (Section 1.5) and the line "No real personal data or secrets in this PR".
- Architecture decisions are written as short ADRs in `docs/DECISIONS.md` (context, options, decision, consequences).
- Database migrations are forward-only; destructive changes use expand → migrate → contract across two releases.
- Typed error classes with stable codes live in `packages/core/errors.ts`; connectors map every failure to the taxonomy in Section 7.8.
- Dependency updates arrive as automated PRs and merge only when CI is green.

### 17.5 CI pipeline (GitHub Actions)
1. `pnpm install --frozen-lockfile` → 2. typecheck → 3. lint + boundary check → 4. unit and fixture tests (time pinned to IST) → 5. migrations apply on an ephemeral Postgres and a re-run is a no-op → 6. integration tests with MSW (including "no duplicates on re-run") → 7. security tests (cross-user access, secrets absent from responses and logs, XSS rendering) → 8. build web and worker → 9. gitleaks + dependency audit + fixture PII scan → 10. Docker image build. A failing step blocks merge.

---


## 18. Deployment and Hosting

### 18.1 Hard constraints that drive the choice
- The **worker must be a long-running process** (WhatsApp session, Chromium, schedulers). Serverless functions cannot host it.
- AMS and Moodle may be **reachable only from the campus network** or may block cloud / data-centre IP ranges. Only Phase 0 can tell (Section 0 A5).
- The WhatsApp session needs a **persistent disk** (encrypted, restrictive permissions).
- Push on iPhone needs an **HTTPS-served, Home-Screen-installed PWA**.
- Budget default is ₹0 (Section 0 D4). Free tiers change often: the assistant MUST check current limits and pricing before recommending anything and record the result in `DECISIONS.md`.

### 18.2 Topology options
| | Where things run | Good when | Watch out for |
|---|---|---|---|
| **T1 — Everything on one always-on machine** (old laptop, mini-PC, or Raspberry Pi-class board with enough RAM) | Docker Compose: web, worker, Postgres, MinIO, reverse proxy; reachable through a tunnel (Cloudflare Tunnel or Tailscale) so no router ports are opened | Budget ₹0; AMS / Moodle only work from campus or hostel network; simplest to understand | Power or Wi-Fi cuts; machine must stay on; backups matter more |
| **T2 — Split (recommended default)** | Web on a free-tier host; managed Postgres + S3-compatible storage on free tiers; **worker on the owner's always-on machine** with outbound-only connections | Web must stay reachable even if the home machine sleeps; worker needs the campus / home network | More accounts; free databases may pause when idle or have size caps (verify); keep the worker's DB role separate |
| **T3 — Small rented VPS** | Everything in Docker Compose on one VPS | AMS / Moodle open fine from any network (tested from mobile data); small monthly budget acceptable | Some college sites block data-centre IPs; patching and hardening are on the owner |
| **T4 — VPS + campus relay** | Web + DB + storage on a VPS; worker on a campus / hostel machine | Same as T2 but the owner prefers a single provider | Worker and DB must communicate over TLS with a dedicated role |

**Decision procedure (Phase 0):**
1. Open the AMS and Moodle URLs from a phone on **mobile data** (off Wi-Fi). Works? → T2 or T3 are possible. Does not work? → the worker must run on campus / hostel network (T1, T2 or T4) or through a college VPN if one exists.
2. Check that a headless browser on the intended machine can load the login pages.
3. Check the intended machine can stay on (power, sleep settings disabled, wired or reliable Wi-Fi).
4. Default: **T2 with the worker on the owner's always-on machine** if budget is ₹0; **T3** if the portals are reachable from the internet and a small budget exists. Record the choice as an ADR.

### 18.3 Containers
- Images: `web`, `worker` (based on a **pinned** official Playwright image so browser and library versions match), `postgres` (T1 / T3 only), `minio` (T1 only), `caddy` or `cloudflared`.
- Run as non-root; read-only root filesystem with `tmpfs` for browser scratch where possible; `restart: unless-stopped`; healthchecks; memory limit for the worker (start at ~1–1.5 GB and tune from measurements); log rotation with size caps.
- Volumes: Postgres data, object storage, `WA_SESSION_DIR`, `ARTIFACT_DIR`. The WhatsApp session volume is **excluded** from backups (re-link instead).
- One Chromium instance per worker, one `BrowserContext` per user per run (Section 13.1).

### 18.4 Domain, TLS and headers
A free subdomain is fine (Section 0 D5). HTTPS only with HSTS; the reverse proxy sets security headers and forwards the real client IP for rate limiting. Update OAuth redirect URIs and `APP_URL` whenever the domain changes.

### 18.5 Google sign-in setup (the assistant walks the student through it)
1. Create a Google Cloud project → configure the OAuth consent screen (app name "UniDash", support e-mail) → add the owner and friends as test users while the app is in testing mode (check the current limit and rules).
2. Create OAuth credentials (web application). Authorised redirect URI = the auth library's callback URL on `APP_URL` (and a `localhost` URI for development).
3. Request only `openid email profile`. UniDash never receives access to Gmail, Drive or any Google API in v1.
4. Server-side: accept the sign-in only if the **verified** e-mail is in `allowed_emails` (Section 12.2).
5. If the college's Google Workspace blocks third-party apps, use the fallback: allow-list a personal Gmail, or e-mail magic links.

### 18.6 Backups and restore
- Daily encrypted `pg_dump` (age or GPG) to a **second location** (a different disk or a free cloud bucket); keep 7 daily + 4 weekly; object storage replicated or versioned if budget allows.
- The master / private keys are stored **separately** from backups (password manager + offline copy). A backup without the key restores no secrets, by design: after a restore the student re-links integrations.
- **Restore drill** monthly on a scratch database; record the date and result in `RUNBOOK.md`. A backup that has never been restored is not a backup.

### 18.7 Releases and rollback
Tag releases; `docker compose pull && docker compose up -d`; migrations run automatically before the new version accepts traffic; maintenance banner for risky releases. Rollback = previous image tag; if a migration was not backward-compatible, restore the last backup. Keep the previous two images.

### 18.8 Monitoring
`/api/health` (liveness, no details); worker heartbeat row every minute; external **dead-man's-switch** ping so the owner is told when the worker stops; uptime check on the web URL; disk and memory alerts at 80 %; admin page (Section 10.14). Alerts go to the owner via Telegram or e-mail, not only to the dashboard that might be down.

### 18.9 Cost sketch (verify before relying on it)
| Item | Typical | Notes |
|---|---|---|
| Web + DB + storage on free tiers | ₹0 | Subject to current limits and idle-pause rules |
| Always-on home / hostel machine | electricity only | Disable sleep; use a UPS or accept gaps |
| Small VPS (T3) | a few hundred ₹ / month | Only if the portals accept its IP |
| Domain (optional) | ~₹600–1,000 / year | Not required |
| Spare SIM for the WhatsApp listener (recommended) | prepaid plan cost | Keeps the main number safe |
| Push, Telegram, Web Push | ₹0 | |

---

## 19. Operations, Risk Register and Policy

### 19.1 `docs/RUNBOOK.md` must contain
Start / stop / restart commands · where logs are and how to read them (redacted) · how to rotate each key and token · how to add or revoke a friend (`allowed_emails`, wipe) · how to re-link AMS, Moodle, WhatsApp · how to fix a broken selector (Section 19.2) · how to restore a backup · how to use the kill switch · how to export and delete data · who to ask at college IT · what to do if a credential leaks (rotate, revoke sessions, change college password, notify friends).

### 19.2 Incident playbooks
| Symptom | Likely cause | First response |
|---|---|---|
| Home shows "AMS needs you to log in again" | Session expired | Run the Login Helper; check the idle timeout noted in `FEASIBILITY.md` |
| AMS data stale; run status `PARTIAL` + `LAYOUT_CHANGED` | College changed the portal | Open the failure artifact from the admin page → redact → save as a new fixture → update `selectors.ts` / mapper → run fixture tests → deploy |
| No new Moodle items for hours | Token expired / revoked, or Moodle maintenance | Check integration status and last error; re-run the token flow |
| WhatsApp status `NEEDS_REAUTH` | Device unlinked on the phone, or library broke after an update | Re-link; if it persists, check the provider's issues, pin the previous version, or switch provider (Section 9.3) |
| Duplicate notifications | `dedupe_key` / `notification_log` bug | Disable the channel, inspect the log, add a regression test before re-enabling |
| Worker dead | Crash, OOM, power cut | Dead-man alert → restart; check memory ceiling; catch-up run will resume |
| Disk filling | Artifacts, logs, media | Run retention jobs now; lower limits; clear artifacts |
| Account lockout warning from college | Too many logins | Pause the integration, stop all retries, wait, re-test manually, review Section 16 intervals |

### 19.3 Adding a friend (checklist)
1. Explain in plain words what UniDash reads, where credentials / sessions are stored, who can see them (the owner's server, not other users) and how to revoke.
2. Get an explicit "yes" before any of their credentials or sessions touch the owner's server (Section 12.8). They can choose a reduced tier (e.g. Moodle iCal only).
3. Add their e-mail to `allowed_emails`; they sign in and run onboarding (Section 10.13) themselves; the owner never types their passwords.
4. Offer the **Export** and **Delete my account** buttons up front.

### 19.4 Risk register
| Risk | L | Impact | Mitigation |
|---|---|---|---|
| College forbids automated access | M | High | Read the acceptable-use policy; ask IT; fall back to official channels only (Moodle mobile service / iCal, manual AMS paste); keep request rates minimal |
| Account lockout from repeated logins | M | High | One login per run; no retry after auth failure; Section 16 floors |
| WhatsApp restricts the number | M | Medium | Spare-number listener; read-only; no media bulk download; chat-export fallback (P2) |
| Portal layout change | H | Medium | Adapter folder, canaries, fixtures, "PARTIAL means keep old data" |
| Credential or session leak | L | Critical | Sealed vault, public-key sealing, redaction, revocable sessions, spare number, key rotation runbook |
| Missed or false alert erodes trust | M | High | Baseline suppression, dedupe, suspicious-fetch guard, "last synced" chips, canary |
| Worker host goes offline | M | Medium | Dead-man's switch, catch-up run, honest stale badges |
| Wrong date parsed from chat | M | Medium | Proposals only, never auto-add; confidence shown; original text highlighted |
| Student over-trusts the app for an exam | M | High | Footer note: UniDash is an aid — official notices and AMS remain authoritative; always show source and "Open in AMS" |
| Scope creep / abandoned project | H | Medium | MVP cut line in Section 20; vertical slices; PROGRESS.md |

### 19.5 Policy, ethics and privacy (not legal advice)
- Read-only, own accounts only, no CAPTCHA / OTP bypass, low request rates (Sections 1.2, 7.7, 12.8).
- Messages and notices contain other people's personal data: store the minimum, never share across users, purge on schedule (Section 9.12).
- India's data-protection law (DPDP Act, 2023) and the college's own policies may apply to storing other people's data; keep the project **personal and non-commercial**, and ask the college IT cell if in doubt.
- No feature may help anyone cheat, impersonate or bypass attendance, exams or access controls (Section 2.3).

### 19.6 Pilot review (after 2 weeks of real use)
Measure against Section 2.2: detection delays, missed items, false / duplicate alerts, battery and data use on the phone, worker uptime, the number of times the student opened the original portals. Decide what to fix before inviting more friends.

---


## 20. Build Phases (follow in order)

**Principle:** each phase is a set of **vertical slices** that run end-to-end (Section 1.2 rule 4). Never start a phase before the previous exit criteria are met. At the start of each phase the assistant says which sections it re-read and posts a plan of ≤ 10 lines.

**MVP cut line:** after **Phase 5** the student already has the product that solves the stated pain (all exams, quizzes, assignments with dates, change alerts and reminders). Phases 6–7 add files / projects / presentations and WhatsApp. Everything after is P1 / P2. Typical effort for a beginner working part-time with an AI assistant: roughly 8–12 weeks end-to-end; Phase 0 should be finished in the first week. These are estimates, not promises.

### Phase 0 — Feasibility spike (throw-away code, no UI)
**Re-read:** 0, 1, 7, 8, 9, 12, 18, Appendix A. **Needs from the student:** Section 0 A1–A10, C4, D3; sanitised samples (Appendix A); a spare phone / SIM if available.
| Task | Output |
|---|---|
| P0.1 Network test of AMS and Moodle from mobile data and from the intended worker machine | table in `FEASIBILITY.md` |
| P0.2 Moodle: try token methods in the order of Section 8.2; call `core_webservice_get_site_info`; record which functions the token may call; test iCal export | winner method, function list, go / partial / no |
| P0.3 AMS: determine the login method, extra steps and session lifetime / idle timeout; inspect the Network tab for JSON endpoints; pick tier A / B / C **per data type** | per-data-type tier table + sanitised fixtures |
| P0.4 WhatsApp: evaluate `whatsapp-web.js` and `Baileys` on the listener number: QR link, list groups, participant ids (phone or opaque?), receive a message, memory use, confirm no read receipts / presence | provider choice ADR |
| P0.5 Push test on the student's phone (installed PWA) with a hello-world service worker | works / limits |
| P0.6 Hosting decision using Section 18.2 | ADR |
| P0.7 Login Helper prototype for the chosen AMS login | demo |
**Exit criteria:** `docs/FEASIBILITY.md` states, for AMS, Moodle and WhatsApp, "works / partial / no" with evidence; hosting topology chosen; list of data types that are in or out for v1; student has approved. **No real personal data is committed anywhere.**

### Phase 1 — Foundation
**Re-read:** 3, 4, 5, 6, 12, 14, 17.
**Deliverables:** monorepo, CI, Docker dev environment; migrations for Sections 6.1–6.4 (+ stubs for the rest); auth with invite-only allow-list and DB sessions; `scopedDb` + automated cross-user tests; vault (seal / open, key generation, rotation stub); Zod env validation; design tokens, theme toggle, installable PWA shell with bottom tabs / sidebar; worker skeleton with `pg-boss`, heartbeat, `worker_commands`; SSE endpoint skeleton; admin health page; seed with fake data.
**Acceptance:** an allowed e-mail signs in, a non-allowed one is refused; user A can never read user B (test suite); secrets never appear in API responses or logs (test); worker heartbeat visible on the admin page; app installable on the phone; CI green from a clean checkout.

### Phase 2 — Moodle slice
**Re-read:** 4.4–4.6, 8, 10.1, 10.3, 11.4, 16.
**Deliverables:** onboarding steps 2–3 (term, connect Moodle, test, import courses, confirm course ↔ subject mapping); read-only client with allow-list; assignments and quizzes → `events` + default reminders (generation logic only); change-detection engine (generic, with baseline mode, two-run removal, suspicious-fetch guard); feed items; resources auto-downloaded into auto-created folders (basic file store); Radar v1 (Needs attention, Next up, Since your last visit) and Deadlines board v1.
**Acceptance:** worked example 4.8-A passes against fixtures with MSW; running the job twice creates **zero** duplicate events, feed items or files; calling a function outside the allow-list throws; changing a due date in a fixture yields an `ASSIGNMENT_DUE_CHANGED` item with old → new; first import creates one `INITIAL_IMPORT` item and no per-item alerts.

### Phase 3 — AMS slice
**Re-read:** 4.5, 4.6, 7, 10.2, 10.8, 13, Appendix A.
**Deliverables:** AMS connector at the tiers chosen in Phase 0; Login Helper and `NEEDS_REAUTH` flow; exam schedule → Exam Hub (strip, grouped cards, change history, clash detection); timetable → class events (rolling 4 weeks); attendance summary and risk alerts; notices (with attachments filed); marks; fees; reconciliation across AMS + Moodle with precedence rules and `locked_fields`; layout canaries and failure artifacts; sync status chips everywhere.
**Acceptance:** fixture with a moved exam → `EXAM_RESCHEDULED` (CRITICAL) showing old → new; two overlapping exams → `EXAM_CLASH`; a layout-changed fixture → run `PARTIAL`, **no data overwritten, no alert**, artifact saved; expired session → exactly one `INTEGRATION_ATTENTION`; zero write requests to AMS / Moodle (request-log test).

### Phase 4 — Calendar, Deadlines and `.ics`
**Re-read:** 4.6, 10.3, 10.4, 14.3, 15.
**Deliverables:** Day / Week / Month / Agenda / Semester-timeline views with filters, tentative styling and the side sheet; manual events (with `locked_fields` and conflict chips); priority score and "by score / by date" sorting; crunch detection and banner; progress control (Moodle `SUBMITTED` auto-sets DONE with undo); `.ics` feed with stable `UID`, `SEQUENCE`, `LAST-MODIFIED`, `ETag`, cancelled events, token rotation.
**Acceptance:** the feed imports cleanly into the student's real calendar app and into a validator; editing an event bumps `SEQUENCE`; the priority-score and crunch unit tests pass at boundaries (24 h, 72 h, 7 d); everything renders correctly in IST around midnight and month boundaries.

### Phase 5 — Notifications, reminders, digests  *(MVP complete here)*
**Re-read:** 11, 12.3, 14.6, 16.3.
**Deliverables:** severity policy; dispatcher with `notification_log` idempotency and retries; Web Push (VAPID) + service worker + bell + SSE; burst collapsing, daily cap, quiet hours; reminder generation, 30-second dispatch loop, snooze, per-event and per-kind offsets; daily and weekly digests; test-notification button; Telegram channel (P1, if time).
**Acceptance:** every rule in Section 11.3 has a test; a retried send never double-sends; reminders for changed events are cancelled and regenerated; reminders in quiet hours move to `quiet_end` unless the event is within 12 h; digest is skipped when empty; push works on the student's phone.

### Phase 6 — Subject Hub, Files, Projects, Presentations
**Re-read:** 6.5, 10.5–10.7, 12.5.
**Deliverables:** auto-structured folders per term / subject; Inbox with suggested placement and routing rules; uploads (drag-and-drop, multi-select, camera); previews; tags; versions; SHA-256 duplicate merge; bulk move / tag / delete / ZIP; quota bar; text extraction and filename search; projects (tasks, milestones on calendar, members, links); presentation tracker with status stepper, template checklist and rehearsal reminders; Subject Hub tabs; "Exam pack" ZIP.
**Acceptance:** ≥ 95 % of Moodle fixture files land in the expected folder; a presentation slot creates a `PRESENTATION` event with default reminders; uploads with a mismatched type or oversize are rejected; HTML / SVG never render inline; "download as ZIP" works for 50+ files.

### Phase 7 — WhatsApp
**Re-read:** 9, 12.6, 4.8-B, Appendix B, 13.4.
**Deliverables:** provider implementation behind the interface (no send method); connect flow with QR via `integrations.runtime_state`; group list and monitor toggles; People picker; capture rules and pipeline; rule-based classifier + Hinglish-aware date / time / venue extractor; proposed events (Review tab); WhatsApp screen with filters; retention, wipe, disconnect; re-link flow; edge cases from Section 9.13.
**Acceptance:** worked example 4.8-B; on the labelled test set from Appendix B, category accuracy ≥ 90 % and date extraction ≥ 85 % on date-bearing messages (targets; report actual numbers); a message from an untracked person is **never** written to the database (test); replays after reconnect create no duplicates; provider interface has no send function (type test); when the WhatsApp provider crashes, AMS and Moodle sync keep running.

### Phase 8 — P1 features
Attendance simulator and "can I skip?" using timetable; grades table and "marks needed" calculator; global search (Postgres full-text + trigram); natural-language quick-add; shared project workspaces; Telegram / e-mail polish; file text extraction improvements. One slice at a time, each with its own acceptance test.

### Phase 9 — Hardening, multi-user launch, documentation
**Re-read:** 12, 13, 18, 19.
**Deliverables:** walkthrough of every item in Section 12 with evidence; 72-hour soak test with memory graph; backup **restore drill**; accessibility pass (keyboard, screen reader, contrast, 200 % zoom); load test for 10 users; friend-onboarding rehearsal using the Section 19.3 checklist; final README, RUNBOOK, FEASIBILITY, DECISIONS; 2-week pilot and review (Section 19.6).
**Acceptance:** every success criterion in Section 2.2 is measured and reported (met / not met / how to fix); home screen < 2.5 s on a mid-range phone over 4G; no open critical issues.

---

## 21. Kickoff Protocol (the assistant's first reply)

The assistant MUST NOT write application code, install packages or create files until the student replies **"go"** to the kickoff summary.

### 21.1 The first reply contains, in this order
1. **Confirmation of reading** — "I have read Sections 0–21 and Appendices A–C" plus five prime directives in the assistant's own words.
2. **Understanding** — ≤ 12 lines: the problem, the three sources, the read-only promise, the MVP cut line.
3. **Section 0 audit** — a table of every Section 0 item: *answered / defaulted / blocking*. Each default relied on is listed explicitly for confirmation.
4. **Questions** — grouped, **blocking first** (A2, A3, A6, A7, C4, D3), then non-blocking; at most 12 at a time; "I don't know — test it in Phase 0" is an accepted answer.
5. **Phase 0 plan** — ≤ 10 lines, plus exactly what the student must do (install tools, create accounts, bring sanitised samples, prepare the spare phone / SIM).
6. **Risks the student should accept knowingly** — the WhatsApp unofficial-client risk, the college-policy question, the worker-host question.
7. **Next step** — "Reply **go** (with answers) and I will create the repository skeleton and start Phase 0."

### 21.2 Environment checklist for a beginner (the assistant explains each, with commands and expected output)
Git and a GitHub account (private repo) · Node.js LTS (verify the current version) · pnpm · Docker Desktop (or Docker Engine) · VS Code or the chosen AI editor · a Google account for the OAuth project · a Telegram account (optional) · a spare phone / SIM for the WhatsApp listener (recommended) · a password manager for keys and backups · one always-on machine decision (Section 18.2).

### 21.3 After "go"
1. Create the repository skeleton from Section 17 and the docs files (empty templates).
2. Save this document as `docs/SPEC.md`; create `PROGRESS.md` with Phase 0 tasks.
3. Run Phase 0 task by task; after each, report in the Section 1.3 format.
4. Never proceed to Phase 1 without the student's approval of `FEASIBILITY.md`.

### 21.4 Standing instructions for every later session
- If the chat history is lost, the student pastes: *"Read docs/SPEC.md and docs/PROGRESS.md, then continue."*
- The assistant updates `PROGRESS.md` (done / next / blocked) and `DECISIONS.md` at the end of every slice.
- When the assistant is unsure about a college-specific fact it asks for a sample (Appendix A) and does **not** guess.

---


## Appendix A — Samples the Assistant Must Ask For (never guess external structure)

### A.1 How to capture and sanitise (the assistant explains this step by step)
- **HTML:** open the page → right-click the data table → *Inspect* → right-click the surrounding element → *Copy → Copy outerHTML* → paste into a `.html` file. Or *Save page as → Webpage, HTML only*.
- **JSON (best case):** open DevTools → **Network** tab → filter **Fetch/XHR** → reload the page → click the request that returns the data → **Response** tab → copy. Copy the **response only**; never copy request headers, cookies or `Authorization` values.
- **Screenshots** are acceptable for layout, login steps and error pages, after sanitising.
- **Replace before sharing:** your name → `Student A`; roll / enrolment numbers → `2026XXXX`; phone numbers; e-mails; faculty names (or keep and replace consistently); any token, cookie, `sesskey`, session id, calendar-export URL, QR code, barcode; photos of faces.
- **Keep:** table headers, element ids and classes, column order, date and number formats, empty states, error messages, and at least one "unusual" row (cancelled, no marks yet, two exams on one day).
- **Never share:** passwords, OTPs, cookies, tokens, full URLs containing `token=`, `key=` or `sesskey=`.
- Run `pnpm fixtures:check` before committing any fixture (Section 17.3).

### A.2 AMS (ERP) checklist
| # | Capture | Also tell the assistant |
|---|---|---|
| 1 | Login page (screenshot) | Every step you perform to log in (Google button? OTP? CAPTCHA? phone approval?) |
| 2 | Home / dashboard after login | URL path pattern (without tokens) |
| 3 | Profile page | Where programme, branch, semester, section and batch appear |
| 4 | Registered subjects / course registration | Is there a semester drop-down? |
| 5 | Attendance summary **and** the detail view for one subject | Does it show totals (attended / total) or only %? Are cancelled classes marked? |
| 6 | Weekly timetable (also a lab-batch day) | How are batches shown? Holidays? |
| 7 | Exam date-sheet / exam schedule (+ one with two papers in a day, if any) | Exam names used (Minor / Mid-sem / Sessional…), time and venue columns |
| 8 | Marks / results page | Components shown (internal, assignment, practical…), max marks, grade letters |
| 9 | Notice board list + one notice with an attachment | Do notices have ids? Is there pagination? |
| 10 | Fees page | Heads, due dates |
| 11 | "Session expired" / logged-out page | **How long** can you stay idle before it logs you out? |
| 12 | Any error page | |
| 13 | Network tab: which pages load data through Fetch/XHR JSON | List the request paths |
| 14 | Does the AMS open on **mobile data**? Is there an AMS / ERP **mobile app** (name)? | |

### A.3 Moodle checklist
| # | Capture | Also tell the assistant |
|---|---|---|
| 1 | Login page (screenshot) | Google / SSO button or username + password? |
| 2 | Does the official **Moodle mobile app** work for your college? | How does it log you in (browser window or password)? |
| 3 | Dashboard and "My courses" | Course naming pattern (codes in short or full names?) |
| 4 | One course page (collapsed sections visible) | Where lecture files, assignments and quizzes appear |
| 5 | One assignment page (open date, due date, cut-off, submission status) | |
| 6 | One quiz page | |
| 7 | Calendar page and *Export calendar* option | Is iCal export available? (do **not** share the URL) |
| 8 | Profile → Preferences → **Security keys** | Is a "Moodle mobile web service" key listed? |
| 9 | Announcements forum page | |
| 10 | If a token was obtained in Phase 0: the list of functions from `core_webservice_get_site_info` | Redact the token and user ids |

### A.4 WhatsApp checklist
- Group name(s) and the roles of the people you want to track (no phone numbers needed).
- **≥ 60 anonymised messages** from the group, covering exams, quizzes, assignments, presentations, cancellations, venue changes, files, and ordinary chatter, in the languages actually used (English, Hinglish, Devanagari). For each, say what it means and the correct date / time. These become the labelled test set (Section 13.4).
- How your CR and professors usually phrase things; typical file names; how many messages per day.

### A.5 Academic structure
Date-sheet PDF (sanitised) · exam names and weightage (e.g. Minor-1 15, Minor-2 15, Major 50, Practical 20) · attendance rule and condonation policy · semester start / end · examples of projects, seminars, lab files and presentations you received last semester.

---

## Appendix B — WhatsApp Classification Dictionaries, Hinglish Parsing, Test Set

All lists are **seed data** loaded into `wa_keywords` (user_id NULL) and extended per student and per subject. Matching is case-insensitive on NFKC-normalised text; Roman-script terms use word boundaries; short or ambiguous terms (marked †) require a second signal (a date, a subject alias or a tracked sender).

### B.1 Categories and weights (feeds `importance` in Section 9.7)
| Category | Weight | English | Hinglish (Roman) | Devanagari |
|---|---|---|---|---|
| EXAM | 50 | exam, paper, minor, major, mid sem, midsem, end sem, endsem, sessional, internal, CT†, class test, datesheet, date sheet, practical, viva, lab exam | exam hai, paper hai, pariksha, test hoga, viva hai, practical hai | परीक्षा, पेपर, इम्तिहान, वाइवा, प्रैक्टिकल |
| QUIZ | 45 | quiz, surprise test, pop quiz, unit test | quiz hai, quiz hoga, test hoga | क्विज़, क्विज, टेस्ट† |
| CLASS_CHANGE | 45 | cancelled, canceled, no class, class off, postponed, preponed, rescheduled, extra class, adjustment class, make-up class | class nahi hogi, class cancel, nahi aayenge, extra class rakhi hai, class shift | क्लास नहीं होगी, कक्षा रद्द, स्थगित, अतिरिक्त कक्षा |
| PRESENTATION | 40 | presentation, ppt†, seminar, slides†, slot† | presentation dena hai, ppt banao, slot mila | प्रस्तुति, सेमिनार |
| ASSIGNMENT | 35 | assignment, homework, hw†, tutorial sheet, worksheet | assignment dena hai, assignment banao | असाइनमेंट, गृहकार्य |
| SUBMISSION | 35 | submit, submission, deadline, due†, last date, lab file, record†, report† | jama karo, jama karna, file jama, last date, file check hogi | जमा, अंतिम तिथि, फाइल जमा |
| VENUE_CHANGE | 35 | venue, shifted to, moved to, room changed, new room | room badal gaya, … mein hoga, kamre mein | कमरा बदला, स्थान बदला |
| HOLIDAY | 25 | holiday, no classes, break, vacation, closed† | chhutti, chhuti, band rahega | छुट्टी, अवकाश |
| STUDY_MATERIAL | 15 | notes, pdf†, pyq, previous year, question paper, syllabus, material | notes bhejo, notes bhej do, syllabus kya hai | नोट्स, पाठ्यक्रम |
| GENERAL | 0 | — | — | — |

`importance = max(category weight) + VIP (+20) + urgency (+15) + parsed date within 7 days (+15) + attachment (+5)`; ≥ 60 IMPORTANT, ≥ 30 NORMAL, else INFO (Section 9.7). All weights and thresholds are configurable.

### B.2 Urgency words (+15)
English: urgent, urgently, important, immediately, asap, tonight, today, tomorrow, compulsory, mandatory, must, don't miss.
Hinglish: zaruri / zaroori, jaldi, turant, aaj, kal, compulsory hai, sabko aana hai.
Devanagari: ज़रूरी, तुरंत, आज, कल, अनिवार्य.

### B.3 Worked scoring examples
| Message | Calculation | Result |
|---|---|---|
| "Minor-2 parso 10 baje Room 204 mein hoga" (tracked CR) | EXAM 50 + date within 7 d 15 = 65 | IMPORTANT + proposal |
| "ppt bhej do please" | STUDY_MATERIAL 15 | INFO |
| "Assignment 3 submit by Friday 11:59 pm" (tracked non-VIP) | 35 + 15 = 50 | NORMAL + proposal (date-bearing) |
| "Quiz tomorrow 2 PM Lab 4" (VIP professor) | 45 + 20 + 15 + 15 = 95 | IMPORTANT (push) + proposal |
| "Good morning everyone" | 0 | INFO or not captured |

### B.4 Hinglish and Devanagari pre-processor (maps tokens before the date library runs)
| Token(s) | Meaning |
|---|---|
| aaj / आज | today |
| kal / कल | tomorrow — or yesterday if the tense is clearly past (lower confidence, Section 9.8) |
| parso / परसों | day after tomorrow — or day before yesterday if past tense |
| agle hafte / is hafte | next week / this week |
| somvar, somwar / सोमवार | Monday |
| mangalvar, mangalwar / मंगलवार | Tuesday |
| budhvar, budhwar / बुधवार | Wednesday |
| guruvar, guruwar, brihaspativar, veervar / गुरुवार, बृहस्पतिवार | Thursday |
| shukravar, shukrawar / शुक्रवार | Friday |
| shanivar, shaniwar / शनिवार | Saturday |
| ravivar, raviwar, itwar / रविवार | Sunday |
| baje / बजे | o'clock |
| subah / सुबह | morning (AM) |
| dopahar / दोपहर | afternoon (12–4 PM) |
| shaam / शाम | evening (PM) |
| raat / रात | night (PM) |
| `X se Y` | from X to Y |
| `kal tak`, `Friday tak` | **by** that date (deadline semantics, not a start time) |
| `sawa N baje` | N:15 · `saadhe N baje` → N:30 · `paune N baje` → (N−1):45 · `dedh baje` → 1:30 · `dhai baje` → 2:30 |
| ek, do, teen, char / chaar, paanch / panch, chhe / chhah, saat, aath, nau, das, gyarah, barah | 1 … 12 |
| Devanagari digits ०१२३४५६७८९ | 0–9 |

**AM / PM heuristic when no marker is present:** hours 7–11 → AM; 12 → PM; 1–6 → PM. Lower confidence when the hour is ambiguous. Resolve relative words against the message's **sent time in IST**. Supported formats are listed in Section 9.8.

### B.5 Venue patterns (configurable per college; case-insensitive)
```text
\b(?:room|rm|lab|lh|lt|cr|hall)[\s\-#:]*([A-Za-z]?\d{1,4}[A-Za-z]?)\b
\b(auditorium|seminar hall|conference hall|library|ground|gymkhana)\b
```

### B.6 AMS notice importance keywords (`is_important`)
English: exam, date sheet, datesheet, schedule, revised, result, revaluation, re-evaluation, admit card, hall ticket, holiday, fee, last date, detained, shortage, condonation, registration, backlog, supplementary, reappear, internal marks, attendance, timetable.
Devanagari: परीक्षा, परिणाम, अवकाश, शुल्क, अंतिम तिथि, समय सारणी.

### B.7 File-routing heuristics (section titles and file names → folder kind)
| Folder | Words |
|---|---|
| Lectures | lecture, lec, unit, module, chapter, slides, ppt |
| Assignments | assignment, assn, hw, homework, tutorial sheet |
| Lab | lab, practical, experiment, exp, manual, record |
| Notes | notes, handwritten, summary |
| PYQ and Exams | pyq, previous year, question paper, qp, mid sem paper, sample paper, datesheet |
| Projects | project, report, abstract, synopsis |
| Presentations | presentation, seminar |
| Resources (default) | syllabus, reference, book, ebook, link, anything unmatched |
Student corrections create `file_routing_rules` that override these heuristics (Section 10.7).

### B.8 Seed labelled test set (all fake; extend to ≥ 60 with the student's anonymised real messages)
Messages marked "sent Mon 12 Oct 2026, 14:05 IST" unless noted.
| # | Message | Expected category / kind | Expected date-time and venue | Proposal? |
|---|---|---|---|---|
| 1 | Minor-2 parso 10 baje Room 204 mein hoga | EXAM / MINOR_EXAM, label Minor-2 | Wed 14 Oct 10:00, Room 204 | yes (NEW, or UPDATE if AMS differs) |
| 2 | Tomorrow quiz in DSA, 2 PM Lab 4 | QUIZ | Tue 13 Oct 14:00, Lab 4; subject alias DSA | yes |
| 3 | कल DBMS की क्लास नहीं होगी | CLASS_CHANGE (cancel) | Tue 13 Oct; subject DBMS | yes (CANCEL) |
| 4 | Assignment 3 submit by Friday 11:59 pm | ASSIGNMENT / SUBMISSION | Fri 16 Oct 23:59 | yes |
| 5 | Presentation slots: Group 3 on 14/10 at 11 | PRESENTATION | Wed 14 Oct 11:00 | yes |
| 6 | ppt bhej do please | STUDY_MATERIAL | none | no |
| 7 | Class kal nahi hai, sir ne cancel kar di | CLASS_CHANGE (cancel) | Tue 13 Oct (future assumed), confidence ≤ 0.8 | yes (CANCEL) |
| 8 | Quiz was yesterday lol | GENERAL (past tense) | none | **no** |
| 9 | Viva 20 Oct se start, roll no 1-20 pehle din | VIVA | Tue 20 Oct, time unknown, low confidence | yes (low confidence) |
| 10 | Lab file kal check hogi, sab le aana | SUBMISSION / LAB_FILE_SUBMISSION | Tue 13 Oct, no time | yes |
| 11 | Extra class Saturday 9 se 11, Room 101 | CLASS_CHANGE (extra class) | Sat 17 Oct 09:00–11:00, Room 101 | yes |
| 12 | Good morning everyone | GENERAL | none | no |
| 13 | Holiday on 20th Oct, no classes | HOLIDAY | Tue 20 Oct, all day | yes |
| 14 | Minor 2 ka syllabus unit 3 aur 4 hai | EXAM (syllabus info) | none | no new event; attach syllabus note to the matching Minor-2 event |
| 15 | शुक्रवार को सुबह 9 बजे वाइवा है | VIVA | Fri 16 Oct 09:00 | yes |
| 16 | Sir said exam is on 15/10 not 14/10 | EXAM | Thu 15 Oct (time unknown) | yes (UPDATE vs. a 14 Oct event) |

---

## Appendix C — Reusable Prompts for the Student

**C.1 Start a phase**
> Re-read Sections [list] of docs/SPEC.md and docs/PROGRESS.md, then start Phase [N]. Give me your plan in at most 10 lines first, and list anything you need from me.

**C.2 Resume after a lost chat**
> Read docs/SPEC.md and docs/PROGRESS.md, then tell me where we are and what the next slice is. Do not change anything yet.

**C.3 Report a bug**
> What I did: … What I expected: … What happened: … Exact error text (secrets removed): … Command I ran: … Please find the root cause, add a failing test first, then fix it. Do not ask me to paste cookies, tokens or passwords.

**C.4 The portal changed (layout repair)**
> AMS (or Moodle) changed. Here is the sanitised failure artifact: [attach]. Update only the adapter folder (selectors / mappers), add this as a new fixture, keep the old fixtures passing, and show me the test output.

**C.5 Add a feature or source**
> I want [feature]. Before coding, tell me in at most 10 lines where it fits (connector pattern, tables, screens), which files change, which tests you will add, and what could go wrong. Wait for my "yes".

**C.6 Security review of the last slice**
> Review the last slice against Section 12 and the "Never do" list in Section 1.6. List problems by severity with file and line, and propose fixes. Do not fix anything until I agree.

**C.7 Explain like I'm new**
> Explain what you just did: what, why, the exact command, the expected output, and what to do if it fails. Define any jargon.

**C.8 Stop and roll back**
> Stop. Revert the last change, explain what went wrong, and propose two safer options with trade-offs.

---

*End of UniDash v2.1 Master Build Prompt.*
