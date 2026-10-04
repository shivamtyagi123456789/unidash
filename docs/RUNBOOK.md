# UniDash runbook

This is the local operator guide for the React app, extension-based AMS/Moodle scans, Google Drive project storage, and in-app reminder worker.

## Start locally

1. Install Node.js and pnpm, then install the workspace dependencies:

   ```powershell
   pnpm install
   Copy-Item .env.example .env
   ```

2. Set `DATABASE_URL` and `WORKER_DATABASE_URL` in `.env` to a reachable PostgreSQL database. Keep `.env` private and out of source control. The app cannot create sessions or invites without this database.
3. In Google Cloud Console, create an OAuth client with application type **Web application**. Add `http://localhost:3000` as an authorized JavaScript origin, and add both `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/v1/storage/drive/callback` as authorized redirect URIs. In `.env`, set `APP_URL` and `AUTH_URL` to `http://localhost:3000`, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a randomly generated `AUTH_SECRET` (at least 32 characters). Generate a separate random 32-byte `VAULT_MASTER_KEY` and base64-encode it; keep it private and back it up securely because losing it makes stored Drive tokens unrecoverable. Never put a Gmail password here.
4. Set `OWNER_EMAIL` to the exact verified Google address that may sign in. This app is invite-only; the address must be invited after migrations run.
5. Apply database migrations and invite the owner:

   ```powershell
   pnpm db:migrate
   pnpm invite-owner
   ```

6. Restart the web app after changing `.env`, then start it:

   ```powershell
   pnpm dev
   ```

   Open `http://localhost:3000`. In a second terminal, start `pnpm worker`; scheduled in-app reminders are only dispatched while this worker process is running.

Use the same host consistently: if `APP_URL` is `http://localhost:3000`, open that exact URL (not `127.0.0.1`). OAuth origins, callback URLs, and browser cookies are host-specific.

## Verify the current slice

- `GET /health` returns `200` and `{ "status": "ok" }`; this checks web-process liveness only.
- Signed out, `GET /api/v1/auth/me` and `GET /api/v1/integrations` return `401 AUTH_REQUIRED`.
- Signed out, `GET /api/v1/settings` and `GET /api/v1/events` return `401 AUTH_REQUIRED`. With a signed-in owner and migrated database, these routes return only that user's settings and events.
- `GET /api/v1/settings` also issues a CSRF token in its JSON response and a matching HttpOnly cookie. Send both the cookie and `X-CSRF-Token` on same-origin settings PATCH requests.
- The event list loads from `GET /api/v1/events`; a banner identifies whether saved events or preview data are on screen. Event progress updates use `PATCH /api/v1/events/:id/progress` with the CSRF token and event `updatedAt` as `If-Match`.
- Manual event creation uses Quick add on the Deadlines board and `POST /api/v1/events`. It requires a signed-in session, the CSRF token from `GET /api/v1/settings`, and a fresh `Idempotency-Key`; identical retries replay the original saved event for 24 hours.
- Editing a persisted event uses `PATCH /api/v1/events/:id` with the CSRF token and current `updatedAt` in `If-Match`. A stale version returns `409 CONFLICT`; only fields that changed are added to `locked_fields` so a future source reconciliation can preserve the student's edit.
- Deleting a manual event uses `DELETE /api/v1/events/:id` with the CSRF token and current `updatedAt` in `If-Match`; deletion is soft. The API rejects deletion of AMS/Moodle/other source events.
- Apply migration `0005` before event writes. It fixes the event version timestamp precision used by optimistic concurrency checks.
- Source events can be hidden/restored with `PATCH /api/v1/events/:id/visibility` and `{ "hidden": true|false }`; send the current `updatedAt` in `If-Match`. `GET /api/v1/events?visibility=hidden` lists only hidden source events; the default list excludes them. Apply migration `0006` first.
- In the UI, open a persisted source event and choose **Hide source event**. Open **Hidden events** at the bottom of Deadlines to restore it. Manual events use **Delete event** instead.
- Signed out, opening `/` or `/index.html` redirects to `/login`.
- A signed-in allow-listed Google account receives its user record from `/api/v1/auth/me` and only its own AMS/Moodle rows from `/api/v1/integrations`.
- A Google account absent from `allowed_emails`, or whose invite has `revoked_at`, must not sign in.

## Troubleshooting sign-in

- **Redirect URI mismatch:** compare the callback URI in Google Cloud Console with the exact app host and `/api/auth/callback/google` path.
- **Google button is disabled:** configure `DATABASE_URL`, both Google client variables, `AUTH_SECRET`, and `OWNER_EMAIL` in `.env`, restart `pnpm dev`, apply migrations, and invite the owner email. The sign-in screen identifies this as setup-incomplete state.
- **Google returns an origin or redirect error:** use the same host everywhere and compare the authorized JavaScript origin and callback URI above character-for-character.
- **Account is refused:** check that `OWNER_EMAIL` is the verified Google address, then rerun `pnpm invite-owner` after the database is reachable.
- **Database connection error:** verify `DATABASE_URL`, network access, and that `pnpm db:migrate` completed. Do not paste the connection string into chat or logs.
- **Production host validation:** set `AUTH_TRUST_HOST=true` only when the app is behind a trusted HTTPS ingress, and set `APP_URL` / `AUTH_URL` to the public HTTPS origin.

## Integration boundary

AMS and Moodle are read from the student's existing Edge sign-in using the UniDash Portal Bridge extension. Pair the extension with the exact dashboard origin, enable only the needed portals in its Options page, and use **Scan enabled portals**. The dashboard stores the extension's validated, user-scoped scan reports in PostgreSQL; it does not store portal passwords, cookies, session keys, or source URLs. Trusted AMS quiz/calendar items and Moodle deadlines are imported as events with in-app reminders. AMS class schedule data remains excluded. An untrusted/partial scan is saved for review but does not replace the last trusted connection status.

No Moodle web-service token is accepted or stored, and the server does not connect to AMS or Moodle. Apply database migrations before starting web and worker processes. Run exactly one reminder worker per database deployment; additional replicas are safe for reminder dispatch because event and reminder rows are locked transactionally. The current worker delivers only in-app feed notifications. Push, email, and Telegram are not configured.

The `/api/v1/integrations/scan` route is an authenticated, CSRF-protected receiver for reports from the paired extension; it is not a portal connector. `/api/v1/integrations/moodle/import` accepts only normalized deadlines from trusted extension scans. The old `/api/v1/integrations/moodle` token-verification endpoint has been removed.

The website is served by the Next/React app. The old static prototype and its sample data are no longer copied into `apps/web/public` or used by the app. Empty database tables produce empty states instead of fabricated academic records.

Never ask the owner for a Google password. Google credentials and database URLs belong only in the local or deployment secret manager.
