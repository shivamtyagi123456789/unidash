# UniDash handoff

## Current continuation — supplied frontend integration (2026-10-04)

- `frontend/` is now the signed-in visual dashboard source. The Next.js home page redirects to `/index.html`; the auth proxy protects the page and its JS/CSS assets. `pnpm build` syncs this folder into `apps/web/public` before building.
- The supplied demo seed records were removed. The dashboard loads user-scoped settings, events (with pagination), attendance, subjects, projects, activity, integration states, and Drive file metadata. Progress, reminders, project task completion, and feed read-state actions call the existing APIs.
- AMS/Moodle scanning is exposed through the existing paired browser extension. Trusted dated AMS quiz/calendar items and Moodle deadlines are imported through the authenticated APIs. Scan reports remain local to the browser extension; they are not uploaded as scan history by this frontend.
- The supplied shell does not yet have controls for event/project creation, Drive file upload, an ICS feed, or WhatsApp. Those records are not replaced with sample content. Database/OAuth/Drive/worker setup and real signed-in portal scans still need the environment-specific verification described below.
- Verification for this change: frontend JavaScript syntax, workspace typecheck, lint (warnings only), and production build. No live signed-in session was used.

## Earlier continuation — React app, extension scans, and reminders (2026-10-04)

Historical status; the supplied frontend integration above supersedes UI claims in this section.

- `apps/web/app/dashboard.tsx` is the active React dashboard. It reads authenticated user-scoped APIs for events, attendance, feed, reminders, projects, files/Drive, integrations, and portal scan history. Database-empty screens do not invent academic demo data.
- The retired static prototype is not copied into the Next.js public output; `scripts/sync-frontend.mjs` removes stale prototype assets. The app is built and served by Next.js.
- AMS/Moodle are scanned only on demand by UniDash Portal Bridge in the user's Edge session. No Moodle web-service token flow or server-side portal connector is used. Moodle extraction still reads normal authenticated Moodle pages through page AJAX; AMS scans visible dashboard quizzes/calendar, courses and attendance. The unreliable AMS class schedule stays excluded.
- The extension sends normalized reports to authenticated, CSRF-protected `/api/v1/integrations/scan`. Trusted Moodle deadlines and dated AMS quiz/calendar events are imported into saved events; default in-app reminders are created/rescheduled. Extension package is version 1.3.5 at `output/unidash-portal-bridge-v1.3.5.zip`.
- `/api/v1/reminders` returns the signed-in user's pending/snoozed in-app reminders. The worker dispatches only IN_APP reminders and records sent status; keep one worker process running. Email, push, and Telegram delivery are not configured.
- Migration `0024_free_victor_mancha.sql` adds persistent user-scoped scan reports and removes legacy Moodle token-secret storage. It was applied successfully to the configured local database. `pnpm db:generate` reported no schema drift.
- Final checks on 2026-10-04: `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. The build includes React UI and current API routes, with no old Moodle token-verification route. Local signed-out smoke checks returned 401 for protected scan/reminder APIs and 404 for the removed Moodle token endpoint.
- Remaining verification before production sign-off: reload extension 1.3.5 in Edge, pair with the deployed dashboard origin, complete real signed-in Moodle and AMS scans, verify trusted records/events/reminders appear for the owner, and observe the worker deliver a reminder. This workspace cannot attest to the user's live browser session.
- Production must use HTTPS `APP_URL`/`AUTH_URL`, trusted-host configuration at the ingress, production OAuth callback/origin values, migrated PostgreSQL, secret-manager values, and a running reminder worker. Do not deploy using local `.env` settings.

## Latest continuation — AMS dashboard quiz/calendar scan (2026-10-04)

- The owner asked the website's AMS scan to include upcoming quizzes and other dashboard information, not only attendance.
- Inspected the owner-provided, signed-in MITS AMS site read-only. Confirmed dashboard controls for an Upcoming & Active Quizzes panel and My Class Schedule, plus `/student/academic-calendar` and `/student/courses`. The quiz view exposes title, course, schedule, deadline, duration, question count, and marks; calendar has dated events.
- Portal Bridge v1.3.0 initially scanned dashboard summary, quizzes, weekly schedule, academic-calendar event dates, and attendance. The owner corrected that AMS's class schedule is inaccurate; v1.3.1 removes schedule extraction and no longer opens that panel. Current scans cover summary, quizzes, academic-calendar event dates, and attendance. Existing page settings are preserved and missing built-in pages are added at scan time. Each section can separately flag parsing failures; reports stay browser-local and manually initiated.
- v1.3.1 excluded AMS class schedule after the owner reported its values are wrong. v1.3.2 adds MITS-specific detection for an already-signed-in student session; it should remove repeated manual “I'm signed in to AMS” clicks. v1.3.3 adds IST-normalized dates and imports only complete trusted AMS quiz/calendar records to user-scoped events, where they appear in Calendar and Deadlines. AMS attendance/summary remain in the local browser report. If AMS presents a genuine login page, the owner signs in; automatic tab cleanup follows the existing enabled-by-default setting. Current package: `output/unidash-portal-bridge-v1.3.3.zip`; live end-to-end import remains to be verified with the owner's browser scan.

## Latest continuation — real-site portal scan bridge (2026-10-03)

- Integrated the separate UniDash Portal Bridge MV3 extension package into `extension/portal-bridge` in the actual app workspace.
- Added the Integrations panel scan status, paired-extension handshake, manual scan action, progress, user-driven signed-in override, restored last report, change details, per-section warnings, and pending-baseline acceptance.
- Scans remain user initiated and local to the browser profile. The page displays the extension's report but does not send portal data to the backend; the existing demo attendance and event values are not replaced by scan results.
- Added installation and setup instructions in `extension/portal-bridge/SETUP.md`. The extension defaults to disabled portals; enable the ones wanted and grant their exact host access in Options. AMS requires its actual attendance page path/table config; this was not discoverable from repository data.
- Still requires owner browser setup: load unpacked in Edge, pair `http://localhost:3000`, configure/enable portal sources, and verify actual MITS portal extraction. Moodle and AMS live data results are not verified. No server-side import or background/hourly sync is included.
- Verification: `node --check` passed for the maintained frontend and every extension JavaScript file; frontend sync and `pnpm build` passed. Started the real app dev server on `http://127.0.0.1:3000`; checked app and updated frontend JavaScript return HTTP 200 and include the scan/report UI. No tests added or run.
- Follow-up from owner scan screenshots: Moodle scan produced a trusted 26-record baseline; AMS scanner still had an empty page list and only supported HTML tables, whereas the owner-confirmed `/student/courses` page shows attendance cards. Updated Portal Bridge to v1.1.0: empty old page configs now default to `/student/courses`, and the extractor uses the live DOM when on that route and reads per-course attendance cards. Packaged `output/unidash-portal-bridge-v1.1.0.zip`. JavaScript syntax and production build passed. Owner must replace/reload the already-installed unpacked extension before testing this fix; it has not yet been live-verified.
- Follow-up scan still returned zero AMS records, indicating the extension may have inspected the route before client-side hydration or parsed an early HTTP response. Portal Bridge v1.2.0 now navigates the scan tab to `/student/courses`, waits up to 15 seconds for rendered `Attendance:` and `Classes Attended:` card labels, then extracts. Packaged `output/unidash-portal-bridge-v1.2.0.zip`. Extension/frontend syntax checks and `pnpm build` passed. The new version still needs a live scan to confirm parsing against the portal's rendered DOM.
- Follow-up scan still returned zero AMS records, indicating the extension may have inspected the route before client-side hydration or parsed an early HTTP response. Portal Bridge v1.2.0 now navigates the scan tab to `/student/courses`, waits up to 15 seconds for rendered `Attendance:` and `Classes Attended:` card labels, then extracts. Packaged `output/unidash-portal-bridge-v1.2.0.zip`. Extension/frontend syntax checks and `pnpm build` passed. The new version still needs a live scan to confirm parsing against the portal's rendered DOM.
- Follow-up from owner scan screenshots: Moodle scan produced a trusted 26-record baseline; AMS scanner still had an empty page list and only supported HTML tables, whereas the owner-confirmed `/student/courses` page shows attendance cards. Updated Portal Bridge to v1.1.0: empty old page configs now default to `/student/courses`, and the extractor uses the live DOM when on that route and reads per-course attendance cards. Packaged `output/unidash-portal-bridge-v1.1.0.zip`. JavaScript syntax and production build passed. Owner must replace/reload the already-installed unpacked extension before testing this fix; it has not yet been live-verified.

## Latest continuation — sign-in portal prompt (2026-10-03)

- Added a post-sign-in prompt when the integrations status endpoint loads and AMS or Moodle is not connected. “Open portals” opens only the MITS login pages still needing setup and routes UniDash to `#more`; “Later” dismisses it for the current app page. It appears again on a fresh app load while setup remains incomplete.
- Added a permanent **Integrations** link to the desktop left rail. The AMS/Moodle status chips now open that page instead of showing a misleading toast.
- Updated integration copy to explain that signing into an external portal does not enable UniDash scanning. No password capture or browser-cookie reuse was added.
- **Still not implemented:** Moodle calendar/web-service data import, a manual scan endpoint/action, and any AMS scanning/import. Moodle remains blocked on an approved token or a secure calendar-feed connection; AMS remains blocked on a verified supported read-only access method. Do not describe the prompt or external login as a completed scan.
- Synchronized maintained frontend files into `apps/web/public` with `node scripts/sync-frontend.mjs`; `node --check js/app.js` and `pnpm build` passed. No tests were added or run, and the new signed-in prompt was not browser-smoke-tested.

## Latest continuation — Moodle connection foundation (2026-10-03)

- Added Moodle connect/disconnect endpoints at `/api/v1/integrations/moodle`. Connect targets only the known MITS host (`https://moodle.mitsweb.in`), validates the supplied web-service token by POSTing `core_webservice_get_site_info`, and stores the token only after the API confirms it. Tokens are AES-256-GCM encrypted with a purpose-specific HKDF key derived from `VAULT_MASTER_KEY`, bound to the owner and integration row. Tokens are never returned or logged. Disconnect clears only the Moodle integration, not AMS.
- Added migration `0022_cuddly_reavers.sql` for nullable encrypted-secret and key-version columns on integrations. Applied successfully to the configured database with `pnpm db:migrate`.
- The More > Integrations panel now offers Moodle token verification and disconnect. It explains that token verification is not yet course/assignment/resource sync. AMS remains disconnected; no AMS credentials are requested or scraped.
- Moodle's token page may not be visible because an administrator must grant the `moodle/webservice:createtoken` capability, and the read-only service/function also must be enabled for that token. Official Moodle docs describe that capability and service setup; site-specific availability is not verified. If unavailable, the owner must ask MITS Moodle support/admin to enable a limited read-only token/service.
- New signed-in Edge inspection: AMS course detail UI exposes dated attendance records and per-course summaries; AMS Downloads displayed no downloads and its Developer page did not document an API. Moodle Dashboard shows course-linked upcoming events, and Calendar → Import or export calendars → Export calendar offers a dynamic URL that reflects source changes and can be scoped to all events/courses/groups/personal events. Moodle Preferences still has no Security keys item.
- Do not click Moodle's **Get calendar URL** yet: this may create/reveal a private bearer-style feed link and is a security-sensitive persistent access action. Ask owner at action time first; never put the URL in chat. If approved, adapt integration to accept it directly in UniDash and encrypt it, then implement a strict-host ICS importer. No calendar feed has been generated or imported.
- No AMS authenticated API or export surfaced in inspected pages. Keep attendance import blocked on institute-approved data access; do not use the user's browser cookies/session as a backend connector. Inspection was read-only; no secrets or other students' details were recorded.
- Still not implemented: importing Moodle courses/assignments/resources, AMS attendance import, or scheduled sync. Do not present connection READY as data sync complete. Moodle functions enabled on the MITS instance and sanitized AMS access evidence are prerequisites for selecting/importing records without assumptions.
- Owner identity/context correction: CSE Section **B**, lab group **B3** (owner-provided; overrides older feasibility text that says section unknown). Attendance remains AMS source of truth.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `node --check js/app.js`, and `pnpm db:generate` passed; migration `0022` applied successfully. No automated tests added or run. Live Moodle token connection was not attempted because no token was provided in chat or pasted into the app.

## Latest continuation — Projects backend + Drive uploads (2026-10-03)

The owner asked to complete project creation/uploads and keep project files in Google Drive.

- Added authenticated, user-scoped `GET/POST /api/v1/projects` and `PATCH/DELETE /api/v1/projects/:id`. Create, update, task completion, and archive require CSRF. Updates use `If-Match` when provided. Delete archives the project and deliberately leaves its Drive folder/files intact.
- Added the `projects` Drizzle table with project type/status, optional subject/deadline/description, team, task and milestone JSON, archive timestamp, and Drive folder ID. `stored_files.project_id` links uploaded file metadata to its project with a composite same-user FK.
- Project creation creates a dedicated folder below the user's UniDash Drive root, then stores project data in PostgreSQL. If the DB insert fails after Drive folder creation, the route attempts to trash the orphan folder.
- Project attachments are uploaded directly into the selected project's Drive folder. Users can select multiple files or a complete folder; folder-relative paths are recreated as subfolders in Drive. Per-file size remains capped at 20 MB. Common PDF/image/video/archive types are signature checked; project files in other formats are stored as `application/octet-stream` and downloads are forced as attachments. PostgreSQL stores only project/file metadata and Drive IDs; file bytes are not persisted to local disk or PostgreSQL. Drive upload rollback trashes a Drive object if file-metadata persistence fails.
- Project `.html`/`.htm` files get an **Open site** link that opens a new tab. The authenticated preview route reads the HTML from Drive and serves it with a restrictive CSP sandbox (opaque origin, no app session access, no external network/forms/base/object sources) while allowing inline scripts/styles for a functional local preview. Linked external or sibling assets are currently blocked; bundle needed styling/scripts inline for this version.
- Replaced the Projects demo-only button/cards with live project data, a create form (multiple optional initial files or a folder), task completion persistence, additional multi-file/folder Drive upload and download links, and project archive. The project API is called when the Projects panel opens; no demo projects are presented as saved data.
- Generated `0021_loving_may_parker.sql` and applied migrations successfully through `0021` to the configured Supabase database. Do not reapply manually; use `pnpm db:generate` to confirm schema drift and `pnpm db:migrate` for future migrations.
- Verified `pnpm typecheck`, `pnpm lint`, `node --check js/app.js`, `pnpm db:generate` (no drift), and production `pnpm build`. No automated tests were added/run. The owner has previously confirmed the Drive connection works; the new project create/upload flow itself still needs a real browser smoke check in their signed-in session.
- Next owner-facing step: open Projects, create a small project, upload multiple files or a folder, confirm the folder structure/files appear in Google Drive, open an HTML file via **Open site**, and verify task completion persists after refresh. AMS remains an owner-dependent/read-only evidence task; do not invent attendance.

### Current state

- Local `.env` and the user's Supabase/Google setup were confirmed in the live continuation, and Supabase migrations through `0021` now apply. Never print or paste credential values.
- Project data is in Supabase; project file contents are in the user's connected Google Drive. No local persistent file storage was introduced.
- Existing user context: B.Tech CSE semester 1, MITS Gwalior, Section B, lab B3. AMS attendance integration still needs source/permission evidence.

## Latest continuation — storage backend (2026-10-03)

The owner authorized autonomous continuation and asked to leave steps requiring their account/setup until they return. Continue from this section.

- Storage backend implemented (code ready, not live-configured): migrations 0018_empty_legion.sql and 0019_blue_big_bertha.sql add Google Drive connection metadata, encrypted token fields, Drive folder mapping, and per-user file metadata. No database is configured, so migrations 0000–0019 have not been applied.
- Added separate Drive OAuth consent at /api/v1/storage/drive/connect and callback /api/v1/storage/drive/callback. It requests drive.file plus email identity, binds signed OAuth state to the currently signed-in UniDash user, creates/reuses an app-owned UniDash Drive folder, and stores access/refresh tokens encrypted with AES-256-GCM; the key is derived with HKDF-SHA256 from VAULT_MASTER_KEY and bound to user + connection ID. Refresh tokens stay encrypted at rest and access tokens are refreshed on demand. Existing sign-in token stripping remains unchanged.
- Added GET/DELETE /api/v1/storage/drive for connection status/disconnect. Disconnect revokes the grant when Google is reachable, removes stored credentials, and leaves files in Google Drive.
- Added GET/POST /api/v1/storage/folders and empty-folder DELETE /api/v1/storage/folders/:id. Folders are real Google Drive subfolders below the app-owned root, with user-scoped PostgreSQL associations.
- Added GET/POST /api/v1/storage/files, GET /api/v1/storage/files/:id as forced-download content, and DELETE /api/v1/storage/files/:id (moves the Drive object to trash). Upload cap is 20 MB; accepted file signatures are PDF, JPEG, PNG, GIF, MP4, and ZIP. HTML/SVG are rejected; served content uses application/octet-stream and nosniff. Upload can associate a file with an owned folder, event, or subject. Event detail now returns its real, safe file metadata.
- Storage errors are generic and do not log credentials. API queries are user-scoped; mutating operations require CSRF. Drive content is never served inline. Upload failure attempts to trash an orphaned Drive object.
- Owner's Google One screenshot confirms Google AI Pro with 5 TB total, 7.79 GB used (user-provided screenshot, 2026-10-03). Google Drive remains the recommended storage backend because it uses the owner's existing allowance; app-side cloud-storage charges are not introduced. The Files screen is now wired for Drive connect/disconnect, folder creation/navigation/deletion, upload, download, and file deletion. Private setup still needed: add http://localhost:3000/api/v1/storage/drive/callback to the Google OAuth web client alongside the sign-in callback, privately configure VAULT_MASTER_KEY as a base64-encoded random 32-byte key in .env/hosting secret manager, apply migrations, and sign in. Never send OAuth credentials or the vault key in chat. Production must use the deployment's exact HTTPS callback URL too.
- Remaining owner-dependent integration: AMS read-only access and sanitized portal evidence are still required before attendance import. Section B / lab B3 is documented. Do not fabricate AMS attendance.
- Files UI now replaces demo file cards with real Drive-backed files and provides connect, disconnect, create/open folder, upload, download, and trash actions. It shows an empty/unconnected state instead of misrepresenting samples as saved files. OAuth callback status is surfaced as an app toast.
- Fixed the shared DB client's schema import from schema.js to schema.ts and enabled TypeScript extension imports in web/worker tsconfigs so both Turbopack production build and worker typecheck resolve the workspace source.
- Latest checks: node --check js/app.js, node scripts/sync-frontend.mjs, pnpm typecheck, pnpm lint, pnpm db:generate (no drift), and pnpm build pass. No tests were added/run, no database is available, no OAuth/live Drive flow has been exercised; migrations 0000–0019 remain unapplied.

## Continuation update — 2026-10-03 (in-app reminder worker)

The owner authorized autonomous continuation. Preserve the external setup and portal-access boundaries described below.

- **Academic context now supplied:** owner is currently in B.Tech CSE semester 1 at MITS Gwalior, CSE Section B, lab group B3; attendance and other student records are on AMS. Uploaded master timetable covers July–December 2026 and is effective from 27 July; first-semester CSE subject-code/name mapping is in `docs/FEASIBILITY.md`. Official term end date is unknown. A separate MP government holiday calendar does not establish MITS term dates or closures. Do not invent attendance records; use AMS as source of truth after supported read-only access is verified.
- **File storage recommendation adopted:** use Google Drive for file bytes, using the owner's existing personal Google account and storage allowance; keep file metadata and Drive file IDs in PostgreSQL. Start with the narrow `drive.file` OAuth scope and an app-owned UniDash folder; do not request broad access to the user's entire Drive. The user must privately connect the Drive account and verify their exact Google One allowance. Existing Google sign-in does not give UniDash Drive access: this project strips Google login tokens and needs a separate Drive consent/link flow plus encrypted refresh-token storage. Do not implement uploads until that secure flow is ready. Cloudflare R2 is the fallback if Drive account/OAuth policy blocks the design.
- The worker checks all due reminders every 30 seconds. In one transaction it locks the event before its reminder (matching API mutation order), skips reminders for deleted/hidden/cancelled/completed/past events, and otherwise inserts one `REMINDER` feed item plus an `IN_APP` `notification_log` entry. The idempotency key includes reminder ID and scheduled instant, so retries do not duplicate feed items and a snoozed reminder can surface again. For reminders whose selected channel is `IN_APP`, it marks the reminder `SENT`; for external channels it leaves the reminder `PENDING` after recording the always-on in-app feed delivery.
- Manual event creation now generates the Section 11.4 default offsets for supported exam/deadline kinds, skipping offsets already in the past. Assignment events with weightage >= 10 get the additional one-hour reminder; presentations include the two-day rehearsal reminder. These generated reminders use `IN_APP`, the configured always-on channel. Event time/kind/weightage changes rebuild defaults; still-valid custom reminders remain, while custom reminders that are no longer future/pre-event are cancelled. Old feed cards are kept as history.
- The reminder idempotency key includes reminder ID, scheduled instant, and event start, so retries do not duplicate feed items and a snoozed/rescheduled reminder can surface again. In-app selected-channel reminders become `SENT`; external channel reminders stay `PENDING` after their feed entry is created.
- No push provider, connector, or private database is configured. `PUSH`, `EMAIL`, and `TELEGRAM` delivery are not implemented and must not be described as delivered.
- Worker now declares `@unidash/db` as a workspace dependency and uses `WORKER_DATABASE_URL` for the shared DB pool when configured. Fixed the shared DB client's internal `.js` import so it typechecks in the worker's NodeNext mode.
- Feed API/schema from the prior continuation remains. Current generated migrations are `0000`–`0017`; `0016_mature_lockheed.sql` was manually reordered so referenced composite unique indexes precede foreign keys. `0017_organic_molecule_man.sql` aligns feed timestamps to millisecond precision for stable cursors.
- Verification: `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate` pass; final migration generation reports no changes. No tests were added/run, no live database runtime check was possible, and no migrations were applied.

### Remaining owner-dependent work

1. Private PostgreSQL/OAuth setup and applying/reviewing migrations (never request secrets in chat).
2. Privately connect the selected personal Google Drive account, confirm the available quota, and complete Drive OAuth configuration before file upload/metadata APIs.
3. Confirm the owner's CSE section (A/B) and official term date range when available. Supply sanitized AMS/Moodle samples, confirm permitted supported read-only access, and provide college policy evidence before connector work.
4. Configure any external notification provider before implementing or enabling PUSH/email/Telegram delivery. Do not claim those channels are operational.
5. Continue independent backend work and update this handoff after each substantial slice. Do not add/run tests unless requested; typecheck/lint/schema generation are okay.

## Continuation update — 2026-10-03 (feed backend)

The project owner authorized autonomous, reversible backend work and asked for a fresh handoff. Read this update before older sections.

- Added `feed_items` and `notification_log` to the Drizzle schema, including feed kind/source/severity checks, per-user dedupe keys, millisecond timestamps, and same-user composite foreign keys for attached subjects/events and notification targets. Migrations `0015_lush_nicolaos.sql` and `0016_mature_lockheed.sql` add the tables/constraints; `0017_organic_molecule_man.sql` aligns feed timestamp precision. Migration `0016` was manually reordered so unique indexes exist before their composite foreign keys are added.
- Added authenticated `GET /api/v1/feed` with user scoping, source/kind/subject/unread/pinned filters, archived-item exclusion, and descending keyset pagination. Added CSRF-protected `PATCH /api/v1/feed/:id` for read/pinned/archived state and `POST /api/v1/feed/mark-all-read`.
- Verified `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate`; the final generation check reports no schema changes. No automated tests were added or run, no live database exists/configured here, and migrations `0000`–`0017` remain unapplied.
- At the time this slice was completed, it added feed storage/API only. Reminder feed generation was implemented in the later worker continuation above. External delivery providers remain unconfigured; do not tell the user those alerts were delivered.

### Next autonomous work

1. Review generated SQL migrations and API ownership/security behavior before any migration is applied; no database credentials should be requested in chat.
2. Connector imports still need to call the same default reminder generator when they create/update events; ensure reconciliation does not create duplicate reminder schedules. External push/email/Telegram dispatch remains blocked on channel setup and explicit provider configuration.
3. Ask the owner for sanitized portal samples, confirmation of supported read-only access, storage-provider choice, and private PostgreSQL/OAuth setup only when the corresponding work is ready. Do not block unrelated work on those decisions.
4. No tests unless the owner asks. Typecheck/lint/schema generation are acceptable routine verification.

## Continuation update — 2026-10-03

Continue from this section first; the earlier handoff below documents the prior state and safety context. User has authorized autonomous project decisions and asks that steps requiring their personal input be left until they return. Use safe, reversible defaults, keep portal access read-only, and do not ask for secrets. They specifically asked for a fresh handoff for the next AI.

### Work completed in this continuation

- Implemented authenticated `GET /api/v1/events/:id` in `apps/web/app/api/v1/events/[id]/route.ts`. It scopes by the signed-in user, excludes soft-deleted events, and returns event fields, `lockedFields`, source refs, up to 100 history rows, reminders, and checklist tasks. Files remain an empty array until file metadata/storage is implemented.
- Added `event_history` to the Drizzle schema and migration `packages/db/migrations/0007_fresh_gressill.sql`. Manual edits, progress changes, and source-event hide/restore append history rows.
- Event history inserts for edit/progress/visibility are atomic with their event update. `event_sources` is now normalized; the migration backfills inline source refs. Raw source URLs are never included in event detail responses.
- Added terms, subjects, attendance summaries, and attendance logs to `packages/db/src/schema.ts`, with migration `packages/db/migrations/0008_fine_mad_thinker.sql`.
- Added authenticated term GET/POST routes at `/api/v1/terms`, subject GET/POST at `/api/v1/subjects`, attendance summary GET at `/api/v1/attendance/summary`, and subject attendance log GET at `/api/v1/attendance/:subjectId/log`. Mutations require CSRF; database reads are user-scoped. A subject's term ownership is checked at creation.
- Attendance ingestion and live connector data remain unimplemented. No personal term/subject records were invented. The front-end remains preview for attendance until verified source data exists.
- `pnpm db:generate` created migrations through `0014`. No tests were added/run and no database runtime checks or migration application occurred. There is no Git repository in this transferred folder.

### Follow-up update — 2026-10-03

- Made event edit, progress, and visibility updates plus their `event_history` insert run in one database transaction. Their concurrent version check remains in the transaction and update predicate.
- Added user-scoped `PATCH /api/v1/terms/:id` and `PATCH /api/v1/subjects/:id`. Both require CSRF and `If-Match` with the current `updatedAt`, and return 404 for a record outside the user's scope. Term current-selection clearing is transactional; date order is checked against existing and changed values. Subject term ownership is checked before reassignment.
- Added millisecond `updated_at` columns to terms/subjects and generated migration `0009_exotic_klaw.sql`.
- Added authenticated `GET /api/v1/attendance/:subjectId/calc?t=...&a=...&threshold=...`. It validates subject ownership and inputs; uses the saved setting threshold unless overridden; returns percentage, maximum safe skips, and consecutive classes needed. `canSkip` is `null` when threshold is zero (no attendance constraint); `mustAttend` is `null` when threshold 100 cannot be reached from the current record.
- Added a partial unique index enforcing at most one current term per user; migration `0010_wise_lake.sql` generated.
- Added `event_sources`, `reminders`, and event checklist `tasks` in migration `0011_safe_war_machine.sql`; migration backfills legacy event source refs.
- Added authenticated event task create/update/delete and reminder create/delete/snooze APIs. Records are user/event scoped; snooze supports 15 minutes, 1 hour, tomorrow morning in the saved timezone, or a specified future time.
- Added authenticated `/api/v1/subjects/:id/hub`, returning the scoped subject, attendance summary/threshold when available, and up to ten upcoming visible events matched by subject code.
- Migration `0012_fixed_king_bedlam.sql` corrects the reminders `is_default` DB default to true; manually created reminders set it false.
- **Reminder delivery is not implemented.** The API stores pending reminders, but the worker remains a pg-boss shell; no push/email/Telegram provider is configured. Do not describe these as delivered alerts.
- Fixed reminder lifecycle bugs: terminal event progress skips pending reminders; event time edits cancel pending reminders; manual event deletion cancels pending reminders; reminder creation and snooze serialize on the event row; reminders must stay before the event and cannot be added/snoozed on hidden, cancelled, or completed events.
- Changed term/attendance calendar fields to PostgreSQL `date`; made attendance log `slot` non-null (empty string means unspecified) so the composite uniqueness check actually prevents duplicate rows. Migration `0013_polite_glorian.sql`.
- Added database-enforced same-user composite foreign keys for subject→term, attendance→subject, and reminder→event, plus attendance percentage bounds. Migration `0014_solid_kulan_gath.sql` creates the referenced composite unique indexes before adding the foreign keys; this statement order was manually corrected after reviewing PostgreSQL requirements.
- Final `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate` completed without reported diagnostics; Drizzle reported no schema changes after migration `0014`. No tests, DB runtime checks, or migrations have been applied.
- Current generated migrations are `0000`–`0014`; none applied. The earlier current-state lines below are superseded.

### Next work for the next AI

1. Re-read `docs/SPEC.md` sections 6, 12, 15; `docs/PROGRESS.md`; and this handoff.
2. Review migrations `0007`–`0014` for data integrity. Do **not** run `db:migrate` until a private `DATABASE_URL` is set and user setup is ready. Never request credentials in chat.
3. Remaining general work includes external reminder dispatch after channel configuration, files/folders after the Drive OAuth flow, and event unlock-field after source-owned values are stored. Attendance ingestion, Google OAuth/database setup, confirmed section/term boundaries, portal samples, and AMS/Moodle feasibility require user-specific setup/evidence; leave those for the user. Do not guess portal behavior, bypass OTP/CAPTCHA, or implement WhatsApp here.
4. Add tests only when the user requests them (current standing instruction says not to add/run tests unless requested). Typecheck/lint are acceptable routine checks.
5. Update `docs/PROGRESS.md` and this handoff after each substantial slice.

Workspace root remains the nested folder shown in the original handoff below. Most-recent migrations: `0000`–`0014`; none have been applied to a live database.

Prepared 2026-10-03 for continuing this project in another Codex account. This handoff summarizes the current workspace; transfer the complete project folder as well, because this Markdown file alone does not contain the source code.

## Project and goal

Workspace root:

```text
C:\Users\LENOVO\Downloads\code-sandbox-light-12d7c413-b872-4b60-805e-286d492e421f-main\code-sandbox-light-12d7c413-b872-4b60-805e-286d492e421f-main
```

The user wants the existing UniDash frontend completed and connected to a real backend, ultimately with verified read-only AMS and Moodle integrations. The user explicitly asked that uncertainties be surfaced instead of inventing portal behavior. Treat `docs/SPEC.md` as the product specification, but distinguish its requirements from the user's conversational instructions.

The workspace appears not to be a Git repository. Keep this file with the project when transferring it. Re-read `docs/SPEC.md` before changing architecture or integration behavior; especially Sections 1, 4–6, 12–15, 20–21 and relevant appendices.

## Important user and security context

- Do not ask for or accept a Gmail/Google password, OTP, OAuth secret, database URL, portal password, cookie, or access token in chat. The user previously offered a temporary Gmail password; it was correctly declined.
- Google sign-in for UniDash is separate from signing into AMS/Moodle. The Google OAuth flow only establishes the UniDash account.
- User says their college Gmail works from any network and the official Moodle app works. This does **not** establish an API, permission for automation, or the behavior of portal pages. Do not infer endpoints/selectors or bypass OTP/CAPTCHA.
- User provided portal URLs: `https://ams.mitsgwalior.in/login` and `https://moodle.mitsweb.in/login`, plus screenshots of their login pages/profile. Use those only as evidence of the visible login options. No authenticated portal data/API has been inspected.
- Keep portal work read-only. Never submit, mark, edit, delete, or send anything to AMS/Moodle. Do not connect WhatsApp in this phase.

## Current blocker: live UniDash Google sign-in

The current local workspace has **no `.env` file**. Checks found `DATABASE_URL`, `APP_URL`, `AUTH_URL`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OWNER_EMAIL` are not configured. Docker and PostgreSQL were not available when checked. The login page responds with HTTP 200 but intentionally disables sign-in and explains setup is incomplete. No live Google OAuth or database-backed request has been verified.

For local sign-in, the operator must configure a reachable PostgreSQL database, a Google OAuth web client, a random `AUTH_SECRET` (32+ characters), and the invited owner email in a private `.env`; apply migrations and run the invite command. For `http://localhost:3000`, the Google callback URI is:

```text
http://localhost:3000/api/auth/callback/google
```

The OAuth client should also allow the JavaScript origin `http://localhost:3000`. Use that exact hostname consistently; `localhost` and `127.0.0.1` are different cookie/OAuth origins. Detailed steps are in `docs/RUNBOOK.md` and `README.md`. Do not paste credentials into chat. The earlier assistant asked whether the user already has the OAuth client and PostgreSQL; no answer was received yet.

## Current implementation

- Monorepo: existing HTML/CSS/JavaScript frontend at the root, Next.js web/API in `apps/web`, worker shell in `apps/worker`, Drizzle/PostgreSQL in `packages/db`, Zod environment validation in `packages/config`.
- Better Auth Google OAuth is invite-only. Stored Google OAuth tokens are stripped. `/`, `/index.html` are protected. Login button requires database URL, OAuth ID/secret, auth secret, and owner email configuration.
- APIs include liveness, auth/me, integration status, settings GET/PATCH with CSRF, event list with cursor pagination, manual event create, event edit with `If-Match`/`locked_fields`, event progress update, manual-event soft delete, and source-event hide/restore with `If-Match`.
- Event create is idempotent for 24 hours. Event time inputs are explicitly Asia/Kolkata (IST) and sent as UTC.
- The dashboard loads every visible event page. `GET /api/v1/events?visibility=hidden` lists hidden source events; default visibility excludes hidden rows. Hidden events can be restored from the Deadlines page. Manual events use soft delete; source events are not deleted.
- Preview screens remain clearly marked as sample data when API data is unavailable. Attendance, subjects, projects/files, feeds, reminders/notifications, event history/details, and connector sync are incomplete/sample data.
- AMS/Moodle integrations remain unimplemented and disabled pending verification of supported read-only access. No portal structure or APIs have been guessed.

## Database migrations

Drizzle migrations currently run from `packages/db/migrations`:

- `0000` initial foundation schema
- `0001` auth/session adjustments
- `0002` event/user schema adjustments
- `0003` canonical event columns and enum checks
- `0004` per-user idempotency-key store
- `0005` event `updated_at` precision set to milliseconds for reliable `If-Match` concurrency
- `0006` `events.hidden_at` for hiding/restoring source events

**None have been applied to a live database.** Migration generation succeeded for `0004`–`0006`; applying requires PostgreSQL configuration.

## Frontend URLs / local processes

- `http://localhost:3000/login` is the Next.js web/API app. It was responding with HTTP 200. It currently cannot complete login without the setup above.
- `http://127.0.0.1:8765/` is the static preview served by `python -m http.server`; it is frontend preview only and has no backend/authenticated persistence.
- Do not open `index.html` with a `File C:/...` URL; JavaScript modules need HTTP.
- Previously observed processes: Next `start-server.js` on port 3000 and Python `http.server` on port 8765. Check current processes before build/restart. Avoid rebuilding over `.next` while the production server is serving it; a production build has not been rerun after recent changes.

## Verification state

- Frontend sync command: `node scripts/sync-frontend.mjs`.
- Syntax: `node --check js/app.js` passed after the latest source hide/restore UI change.
- `pnpm db:generate` reports no schema changes after generating migration `0006`.
- Latest verification completed successfully: `node scripts/sync-frontend.mjs`, `node --check js/app.js`, `pnpm db:generate`, `pnpm typecheck`, and `pnpm lint` all exited successfully.
- No test suite was added or run. No database-backed runtime test has been possible.
- No production build after the latest event API changes.

## Suggested next steps

1. In the new account, inspect this workspace and the current implementation, including the visibility endpoint, for complete user scoping, CSRF, and stale-version behavior.
2. Verify no `.env` or secrets were created. Ask the user whether they have a PostgreSQL service and Google OAuth client; if not, help them choose/set up these services without asking them to send credentials.
3. Once the user configures a database privately, review/apply migrations `0000`–`0006`, invite `OWNER_EMAIL`, and verify Google sign-in plus event CRUD/visibility against PostgreSQL.
4. Continue the required backend vertical slices (event detail/history, subjects, attendance, then remaining P0 features). Update this handoff and `docs/PROGRESS.md` as work progresses.
5. Before any AMS/Moodle implementation, complete Phase 0 feasibility from `docs/SPEC.md`; inspect only sanitized samples and the portal's supported read-only APIs. Ask when evidence is missing.

## Useful commands

From the workspace root:

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm invite-owner
pnpm dev
```

Do not run migration/invite commands until a real private `DATABASE_URL` is configured. Keep `.env` out of any transfer, screenshot, commit, or chat unless the user has explicitly secured a secret manager outside the shared workspace.

## Transfer checklist

- Transfer the entire project folder, preserving nested folders, including this `HANDOFF.md`.
- Do not transfer `.env`, browser profiles, cookies, OAuth credentials, passwords, or tokens. No `.env` exists in this workspace at handoff time.
- Open the transferred project folder in the new account and continue from this handoff. Reinstall packages with `pnpm install` if needed.
