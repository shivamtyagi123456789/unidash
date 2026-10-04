# UniDash build progress

## Current UI — 2026-10-04

The user-supplied interface in `frontend/` is the active signed-in dashboard. It reads real account data from the existing APIs; demo seed records were removed from this frontend. `pnpm build` syncs it to Next.js public assets. Portal scans run through the paired extension and trusted dated records are imported into events. Creation/upload/ICS controls and live-session verification remain outstanding.

## Current status — 2026-10-04

The supplied frontend integration described above supersedes this React UI status; the older implementation notes below are historical.

- The active site is a Next.js React dashboard backed by authenticated user-scoped APIs. It displays saved records and empty states; the static prototype/demo records are not shipped in the app.
- AMS and Moodle use the Edge Portal Bridge extension for manual scans under the user's existing portal session. There is no Moodle web-service token verification or server-side portal connector. AMS schedule data is excluded; trusted quiz/calendar and Moodle deadline records can populate events and in-app reminders.
- Scan reports are persisted by user/source/scan ID. Reminder rows are served by the API and delivered by the separate worker as in-app feed notifications. Other channels are not configured.
- Database migration 0024 was applied locally. Workspace typecheck, lint, and production build passed on 2026-10-04; unauthenticated protected-route smoke checks and removed-token-endpoint 404 check passed.
- A live signed-in extension-to-deployed-app scan has not been independently verified. Before production sign-off: reload extension v1.3.5 in Edge, pair to the real HTTPS site, scan AMS and Moodle, verify saved events/reminders, and verify worker delivery. Set production OAuth, HTTPS host, database, and worker secrets/configuration.

## Continuation — real-site portal scan bridge (2026-10-03)

### AMS dashboard scan expansion (2026-10-04)

- Added manual read-only scanning of MITS AMS dashboard summary counters, the Upcoming & Active Quizzes panel, the weekly Class Schedule panel, academic-calendar event ranges, and course attendance.
- The extension navigates among the confirmed AMS routes and opens dashboard panels locally in the signed-in tab. It records each item with stable keys so later scans can report quiz/calendar/schedule changes. Older saved extension page lists are upgraded at scan time without losing user-defined pages.
- Individual unreadable sections now retain a scan issue, rather than appearing as a successful empty result. Results and baselines remain in browser-local extension storage; nothing was added to server imports or automatic polling.
- Packaged as Portal Bridge v1.3.0. JavaScript syntax, extension package contents, and production build verified. This code has not yet been tested against a fresh live AMS scan; selector/rendering differences will be reported as review issues instead of trusted data.

### AMS class schedule exclusion (2026-10-04)

- Owner reports the AMS class schedule is inaccurate. Removed its extraction and UI interaction; v1.3.1 scans quizzes, dashboard summary, academic calendar, and course attendance only.
- Repackaged `output/unidash-portal-bridge-v1.3.1.zip`. Syntax checks and production build passed. Fresh live AMS verification is still pending.

### AMS session auto-detection (2026-10-04)

- Owner reported repeatedly needing to press the manual “I'm signed in to AMS” confirmation. Added an AMS-specific probe for the verified student routes and page labels, so an already-authenticated session continues automatically and an actual login page still waits for the owner to sign in.
- This preserves the existing scan tab cleanup setting (enabled by default). Packaged v1.3.2; live scan confirmation remains pending.

### Import trusted AMS dates into UniDash (2026-10-04)

- Added IST-normalized start/end timestamps for AMS quiz schedules and academic-calendar events. Unparseable event dates make the relevant section untrusted and block import.
- Added authenticated, CSRF-protected `POST /api/v1/integrations/ams/import`. It accepts only a trusted bounded batch of AMS quiz/calendar records, scopes writes to the signed-in user, deduplicates by source ref, updates changed source-owned fields, appends event history, and refreshes pending in-app reminders when a quiz time changes.
- After a complete trusted browser scan, UniDash sends only dated quizzes/calendar entries to the import API and reloads saved events; they then appear in Calendar and quiz entries also appear in Deadlines. Attendance and dashboard summaries remain local scan-report data. No hourly scan was added.
- Portal Bridge v1.3.3 adds the required normalized date fields. Syntax checks, typecheck, lint, and production build are the verification target; live end-to-end import remains to be confirmed after the user reloads the extension and runs a scan.

- Brought the Portal Bridge extension into `extension/portal-bridge` in this actual project. More → Integrations now pairs with the extension, starts manual scans, shows progress and the local change report, supports user sign-in confirmation, and allows acceptance of a flagged baseline.
- Scan data remains in the Edge/Chrome extension's local storage. It is not sent to the app backend and does not overwrite demo attendance/event data. No hourly polling was introduced.
- Added extension installation and portal setup steps in `extension/portal-bridge/SETUP.md`.
- Owner must load the unpacked extension, pair the local origin, enable portals, and grant site permissions. AMS still needs its real attendance path/table mapping. Live MITS extraction has not been validated; treat reports as unverified until each section is reviewed.
- `node --check` passed for frontend and extension JavaScript; frontend sync and `pnpm build` passed. Started the actual Next dev server at `http://127.0.0.1:3000`; `/` and `/js/app.js` returned HTTP 200 and the served script contains the scan/report UI. No automated tests added or run.
- Follow-up owner screenshot showed the MITS `/student/courses` route renders per-course attendance cards while the configured page list remained empty. Portal Bridge v1.1.0 now defaults the empty AMS config to that owner-provided route, parses cards as well as tables, and uses the live DOM when the scan is already on that page. Packaged `output/unidash-portal-bridge-v1.1.0.zip`. Build and extension syntax checks passed; no live test of the new extractor yet.
- Latest scan returned 0 AMS rows, so v1.2.0 now navigates the extension tab to `/student/courses`, waits up to 15 seconds for the hydrated attendance cards, then reads the live DOM. Packaged `output/unidash-portal-bridge-v1.2.0.zip`; syntax checks and production build passed; live verification pending.

## Continuation — Moodle connection foundation (2026-10-03)

- Added a MITS-host-pinned Moodle token verification endpoint with CSRF protection and same-user scoping. It checks the token using Moodle's `core_webservice_get_site_info` function and stores only an AES-256-GCM encrypted token; no token is logged or returned to the browser after submit.
- Added Moodle connect/disconnect controls to More > Integrations. The UI distinguishes verified token connection from actual content synchronization.
- Added `integrations.secret_ciphertext` and `integrations.secret_key_version`; migration `0022_cuddly_reavers.sql` must be applied if not already current.
- AMS connector/import remains blocked on a verified, supported read-only interface and sanitized portal evidence. Moodle content import likewise waits until the MITS account/service confirms permitted functions. No attendance values are fabricated.
- Owner confirms CSE Section B and lab B3; this corrects old unknown/section-A-vs-B notes.
- Typecheck/lint/build running; no automated tests run.

## Portal inspection — signed-in Edge (2026-10-03)

- Confirmed the Edge browser extension is connected to this chat; owner already had AMS and Moodle signed in. Read-only inspection found dated, course-level attendance records in AMS UI, but no API docs on AMS Developer page and no files in AMS Downloads. No integration path through AMS was established.
- Moodle Dashboard displays course-linked events. Moodle Calendar export offers a dynamic feed URL (updates reflected for calendar subscribers) and scopes for all events, courses, groups, or personal events. Moodle Preferences has no Security keys item. A generated feed URL could support calendar import without a web-service token, but URL generation was left untouched because it may create a persistent private access link; obtain the owner's explicit action-time confirmation and never ask them to send the link in chat.
- Project notes updated in `HANDOFF.md` and `docs/FEASIBILITY.md`. No secrets/session IDs/other student details stored.

## Continuation — project persistence and Drive-backed project files (2026-10-03)

- Replaced the sample-only Projects screen with saved user-owned project records, creation form, editable task completion, Drive attachment upload/download, and archive behavior.
- Added project schema and migration `0021_loving_may_parker.sql`; applied successfully to the configured database. Database contains project details and file metadata only; project file bytes are uploaded directly into per-project folders in connected Google Drive.
- Added user-scoped `GET/POST /api/v1/projects`, `PATCH/DELETE /api/v1/projects/:id`, and `projectId` support to storage file listing/upload. Drive folders are created under the app-owned root; archive keeps the Drive folder and its files.
- Project uploader accepts multiple files and complete folders, recreates folder-relative paths in Drive, and caps each file at 20 MB. Recognized file signatures are checked; project attachments in other formats are stored with generic download MIME so arbitrary source/assets can be uploaded. The general Files screen keeps its narrower supported-type validation.
- Initial HTML/HTM preview endpoint loaded one file from Drive in a new tab under a restrictive sandboxed CSP; sibling-resource support was added in the continuation below.
- Verified frontend sync, JS syntax, `pnpm typecheck`, `pnpm lint`, `pnpm db:generate` (no schema drift), and `pnpm build`. No tests added or run. The owner confirmed existing Google Drive works, but should smoke-check creating a project and uploading a file in their signed-in browser.
- Outstanding owner-specific work remains AMS read-only access/evidence.

## Continuation — static project site assets (2026-10-04)

- Project uploads now retain a sanitized project-relative path in `stored_files`, with migration `0023_project_relative_paths.sql`; the configured database is at migration 0022 and 0023 has been applied.
- Added an authenticated project asset route that serves uploaded sibling/nested files from Google Drive by project-relative path. HTML previews set a project asset base and rebase root-relative HTML/CSS resources into that route.
- Kept site execution in an opaque-origin CSP sandbox: project scripts can load uploaded project assets, but network connections, forms, objects, frames, and access to UniDash APIs remain blocked.
- New folder uploads can render linked CSS, JavaScript, images, fonts, media, and nested HTML pages. Existing project files were backfilled by basename because their old folder-relative paths were not saved; re-upload an older folder site to restore nested asset paths exactly.
- Verified `pnpm typecheck` and `pnpm --filter @unidash/web build`. No tests or end-to-end Drive upload/preview smoke test were run.

## Continuation — React dashboard entry and iterative verification (2026-10-04)

- Added a React dashboard entry at `/`. It mounts the maintained dashboard template, loads its styles and existing feature modules in source order, and shows a recoverable loading/error screen if startup fails.
- Google sign-in now returns to `/`. Existing `/index.html#...` bookmarks redirect to the React entry while preserving their hash route.
- Kept existing feature screens and their hash router running inside the React-owned root to avoid regressing project, Drive, and portal bridge behavior during migration. The individual screens are not yet rewritten as React components.
- Repeated verification after fixing the lint issue: `pnpm typecheck`, `pnpm lint`, and production `pnpm --filter @unidash/web build` pass. Edge smoke check confirmed `/index.html#projects` lands at `/#projects` and loads the Projects view.
- The first visit still shows the existing portal setup prompt when the dashboard determines an integration needs setup; no portal connection or scan was initiated during this smoke check.

## Continuation — Google Drive storage backend (2026-10-03)

- Added storage_connections, file_folders, and stored_files schema. Migrations 0018_empty_legion.sql and 0019_blue_big_bertha.sql have been generated and are unapplied. The latter adds the Drive folder ID to the newly introduced folder table.
- Implemented a separate signed-in-user-bound Google OAuth consent/callback for drive.file; it does not reuse persisted sign-in tokens. Added AES-256-GCM encrypted access/refresh token storage, user/connection-specific HKDF-SHA256 key derivation from VAULT_MASTER_KEY, and on-demand access-token refresh.
- Added connection status/disconnect, Drive-backed folder create/list/delete, file list/upload/download/delete, and file-to-event/subject association routes. Upload accepts signature-checked PDF/JPEG/PNG/GIF/MP4/ZIP up to 20 MB. Downloads are forced to attachment/octet-stream; deletion moves Drive objects to trash.
- Updated event detail to return user-owned file metadata. Added private setup instructions to .env.example and docs/RUNBOOK.md.
- Replaced the Files preview with a Drive-backed interface for connect/disconnect, folders, upload, download, and trashing files. Connection outcomes return to the app with a status message.
- Owner supplied Google One screenshot confirming Google AI Pro, 5 TB total with 7.79 GB used.
- Still owner setup: OAuth redirect URI, private 32-byte base64 vault key, PostgreSQL setup/migration, sign-in, and Drive consent. The live Google flow is not testable until those are configured.
- Fixed the shared DB client's schema import to resolve correctly in both Next/Turbopack and the NodeNext worker.
- Latest checks: node --check js/app.js, node scripts/sync-frontend.mjs, pnpm typecheck, pnpm lint, pnpm db:generate (no drift), and pnpm build passed. No tests/live DB/OAuth checks have run. Current migrations are through 0019 and none are applied.

## Owner academic context

- Owner reports they are in B.Tech CSE semester 1 at MITS Gwalior and that attendance/other student records are on AMS. AMS must remain source of truth for attendance; no values have been imported.
- Supplied timetable identifies July–December 2026 session, effective 27 July, and Section A/B schedules. Owner confirms CSE Section B and lab group B3. CSE first-semester course mapping is in `docs/FEASIBILITY.md`.
- Supplied MP state holiday calendar is not MITS's academic calendar. Official term end date and institute closure dates remain unknown.

## Continuation — in-app reminder dispatch

- Worker now polls every 30 seconds for all due reminders. Processing locks the event first and then its reminder, matches API locking order, and writes an in-app feed item plus `IN_APP` notification log transactionally. In-app channel reminders become `SENT`; external-channel reminders stay pending after their feed entry is created. Dedupe key includes the scheduled instant, preventing retry duplicates while allowing snoozed reminders to surface again.
- Manual event creation uses the documented Section 11.4 default offsets for supported exam/deadline kinds, skips offsets in the past, adds assignment 1h reminder at >=10% weightage, and includes presentation rehearsal at 2d. These reminders use `IN_APP`. Changing event time/kind/weightage rebuilds defaults; custom offsets are preserved when still valid and cancelled when invalid.
- Deleted, hidden, cancelled, done, skipped, or already-started events cause due reminders to be marked `SKIPPED`. PUSH/email/Telegram dispatch is not implemented; no external alert provider is configured.
- Worker now imports the shared DB client through `@unidash/db`; corrected its NodeNext import path and made `WORKER_DATABASE_URL` effective for that pool.
- Storage direction selected: Google Drive for file contents using the owner's personal Drive account and narrow `drive.file` scope; metadata/Drive IDs stay in PostgreSQL. Implementation waits on a separate secure Drive consent/link flow and private owner setup. R2 is the fallback if Drive is blocked.
- `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate` passed. No live DB runtime check or migration application was possible, and no tests were added/run. Migrations through `0017` are unapplied.

## Continuation — feed backend

- Added persistent `feed_items` and `notification_log` schema with per-user dedupe, feed enum checks, same-user resource links, and notification target ownership constraints. Generated migrations `0015`–`0017`; migration `0016` was ordered so referenced composite unique indexes precede the new foreign keys.
- Added authenticated `GET /api/v1/feed` filters (source, kind, subject, unread, pinned), archived-item exclusion, and cursor pagination. Added CSRF-protected `PATCH /api/v1/feed/:id` read/pin/archive state and `POST /api/v1/feed/mark-all-read`.
- `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate` passed; repeat generation reports no schema changes. No tests/live DB checks or migrations were applied.
- Worker-generated reminder feed entries are implemented in the later continuation above. Connector-generated feed entries and external notification channels remain unconfigured.

## Current phase: Phase 1 — foundation (portal feasibility still incomplete)

### Done

- Read the project specification and mapped its integration and API constraints.
- Confirmed the existing frontend is a static demo with no backend/API.
- Checked local tools: Node.js `v24.19.0`, pnpm `11.19.0`; Docker is not found on PATH.
- Created `FEASIBILITY.md` with unknowns kept explicit.
- Began a Next.js web/API workspace, PostgreSQL/Drizzle schema, shared environment validation, and separate pg-boss worker shell.
- Kept the existing frontend source at the repository root and added a build/dev sync into the web app's public assets.
- Added a public liveness route; it reports process liveness only and does not imply a working database or integration.
- Generated the first PostgreSQL migration with text/check-constrained roles and integration states; no migration has been applied.
- Added Better Auth Google OAuth with invite-only email checks, Google-token-free account persistence, database sessions, a sign-in screen, protected dashboard entry, and `GET /api/v1/auth/me`.
- Added a one-time `pnpm invite-owner` command that uses `OWNER_EMAIL` from the local environment; no owner address is committed.
- New sign-ins now create default settings and AMS/Moodle status rows atomically. Added user-scoped `GET /api/v1/integrations`; the existing dashboard chips read their status from this API rather than implying that demo connectors are active.
- Added user-scoped `GET` and `PATCH /api/v1/settings` for the settings currently represented in the schema (time zone, attendance threshold, and quiet hours). PATCH validates strict JSON and requires same-origin plus a double-submit CSRF token.
- Added user-scoped `GET /api/v1/events` with canonical filters, time-range validation, soft-delete exclusion, and keyset pagination. The handler only selects event fields needed for the response; event payload JSON is not exposed.
- Expanded the event schema and response to include the spec's label, description, deadline/all-day flags, venue, syllabus, assessment values, progress, submission state, origin, and confidence fields. Generated `0003` to add these columns and constrain the canonical event enums; migration is still unapplied.
- Integrated persisted events into the existing dashboard: it loads the current user's saved settings and all event pages without dropping events outside a hard-coded date range, uses the live event list when the API succeeds, and explicitly marks preview data when it cannot. Event progress changes now have a user-scoped, CSRF-protected, optimistic-concurrency API route.
- Added idempotent user-scoped manual event creation (`POST /api/v1/events`) with strict payload validation and a 24-hour replay key; generated migration `0004` for the key store. Replaced the Deadlines demo Quick add with an IST-aware event dialog that calls the API and preserves input on errors.
- Added user-scoped event editing with same-origin CSRF validation, `If-Match` optimistic concurrency, strict patch validation, and only changed fields recorded in `locked_fields`; the existing event sheet can open the edit form for persisted events.
- Added user-scoped soft-delete for manual events only, with CSRF, `If-Match`, and owner scoping; the UI only offers Delete on manual events. Added a separate source-event hide/restore endpoint and hidden-events drawer with user scoping, CSRF, optimistic concurrency, and an explicit hidden query mode.
- Aligned event version timestamps to PostgreSQL millisecond precision in migration `0005`; event edits, progress changes, deletes, and visibility changes advance the timestamp monotonically to avoid precision truncation and same-millisecond lost updates. Migration `0006` adds `hidden_at` for source-event visibility.
- Clarified the sign-in page and runbook when Google OAuth is not configured. Current local environment has no OAuth or database variables, so live sign-in remains disabled pending operator setup.
- Previous event create/edit/delete slice passed workspace type-check, frontend syntax, ESLint, and static delivery checks. New source-event visibility changes and migration `0006` are still being verified. A production build has not been rerun after recent event API changes.
- Added the authenticated, user-scoped `GET /api/v1/events/:id` detail endpoint. It returns canonical event fields, source reference, the latest 100 history entries, and empty reminders/tasks/files arrays until those resource schemas are implemented.
- Added `event_history` and generated migration `0007`; event edits, progress changes, and source-event hide/restore append manual change entries in the same transaction as their primary update.
- Added term and subject storage plus authenticated term/subject list and create APIs. Subject creation checks ownership of its term. Academic-specific term/subject records have not been populated; wait for the owner to supply or confirm them.
- Added attendance summary and per-subject log storage, plus authenticated read APIs with user/subject scoping. No attendance source/import or API write path exists yet; keep attendance panels in preview until verified AMS data is available.
- Generated migration `0008` for terms, subjects, attendance summary, and attendance log. `0007`/`0008` are unapplied. Workspace typecheck passed after these changes; lint was run and completed without reported diagnostics. No automated tests or database runtime checks were run.
- Added user-scoped, CSRF-protected `PATCH /api/v1/terms/:id` and `PATCH /api/v1/subjects/:id` with `If-Match` conflict handling and ownership validation. Terms/subjects have millisecond `updated_at`; migration `0009` generated and unapplied.
- Added authenticated `GET /api/v1/attendance/:subjectId/calc` using validated attended/total counts and the user's saved attendance threshold (75% fallback); optional threshold override supports previews. It returns percentage, `canSkip`, and `mustAttend` guidance.
- Enforced at most one current term per user with a partial unique index; migration `0010` generated and unapplied.
- Added normalized event source links, reminders, and event checklist tasks; migration `0011` backfills source refs from existing event rows. Event detail now returns persisted sources/history/reminders/tasks (files remain empty pending storage design).
- Added user-scoped event task create/update/delete and reminder create/delete/snooze endpoints. Reminder snooze supports 15 minutes, 1 hour, tomorrow morning in the user's timezone, and an explicit time.
- Added authenticated `/api/v1/subjects/:id/hub`, returning the user's subject, attendance summary/threshold when present, and next ten visible events matched by subject code.
- Corrected reminders `is_default` default to true to match the spec; migration `0012` generated and unapplied. Manually created reminders explicitly set `is_default=false`.
- Reminder dispatch remains unimplemented: the worker is a queue shell and delivery channels are not configured. Do not present pending reminder records as notifications already sent.
- At that point in the work, `pnpm db:generate`, `pnpm typecheck`, and `pnpm lint` passed. No tests or database runtime checks were run; migrations `0007`–`0012` were unapplied.
- Bug audit fixed reminder lifecycle gaps: completed/skipped events skip reminders, event-time edits and manual deletes cancel them, creation/snoozing serialize against event changes, and reminders must remain before the event. Hidden/cancelled/completed events reject reminder creation/snooze.
- Changed term and attendance calendar values to PostgreSQL `date`; made attendance `slot` non-null to enforce duplicate prevention. Migration `0013` generated.
- Added same-user composite foreign keys for subjects/terms, attendance/subjects, reminders/events, and a 0–100 attendance percentage constraint. Migration `0014` generated with referenced unique indexes intentionally ordered before composite FKs.
- Final `pnpm typecheck`, `pnpm lint`, and `pnpm db:generate` completed successfully; Drizzle reports no schema changes. No tests or database runtime checks have been run; migrations `0007`–`0014` remain unapplied.

### Waiting for owner

- Determine whether Moodle administration can enable supported read-only web-service access; no Security keys link is visible for the owner.
- Inspect sanitized AMS portal data/network paths before choosing a connector.
- Decide production hosting topology; local development is accepted, and the whole project must be hosted. Vercel/Netlify are still being evaluated for the web/API layer.

### Next

- Finish foundation setup and make the local web/API shell runnable.
- Configure a PostgreSQL service, review and apply migrations `0001`–`0006`, configure Google OAuth and the owner allow-list, then verify allowed and denied sign-in and user-scoped event create/read/update/delete/hide/restore flows.
- Make event history writes transactional with their corresponding event writes; add event source-link table and real reminder/task/file relations before returning non-empty detail relations.
- Implement external reminder dispatch only when a delivery channel and worker runtime are configured; build file metadata/upload APIs after the selected Google Drive consent/link flow is secure; implement event unlock-field only after storing source-owned field values. Attendance ingestion waits for a verified read-only source. Leave portal feasibility and account-specific setup for the owner.
- Keep AMS/Moodle sync disabled until the permitted data access methods are confirmed.

### Not started

- Database migrations have not been applied; PostgreSQL and Docker are not installed in the current environment.
- Google OAuth credentials and an allow-list entry are not configured; AMS and Moodle connectors are not implemented.
- No live access to authenticated AMS or Moodle data has been tested.
