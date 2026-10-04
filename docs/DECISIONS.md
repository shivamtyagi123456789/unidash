# UniDash architecture decisions

## 2026-10-02 — Keep the current frontend; add the backend around it

- **Decision:** Keep the existing HTML/CSS/JS UI as the canonical frontend source. Serve a synchronized copy from the Next.js web/API application so the current screens stay intact while the project gains server routes.
- **Why:** The user asked to build the backend first and keep the existing frontend. Rewriting the working UI into React before its API is known would add risk without helping the first backend slice.
- **Web/API:** Next.js App Router route handlers, matching the project specification.
- **Database:** PostgreSQL with Drizzle ORM and SQL migrations.
- **Worker:** Separate long-running Node process using pg-boss/PostgreSQL; it is not deployed as a Vercel/Netlify function.
- **Deployment:** Not selected. Goal is to host the whole project. Vercel/Netlify can be evaluated for web/API; worker and database require compatible services.
- **External integrations:** AMS/Moodle connectors remain disabled until access is verified. No passwords or portal tokens are collected in chat or committed.

## 2026-10-03 — Persist app identity and event progress; keep portal access separate

- **Decision:** Use Better Auth with database-backed sessions and invite-only Google sign-in. Persist no Google access, refresh, or ID token. Google identity only establishes the UniDash session; it does not connect to AMS or Moodle.
- **Event boundary:** Read event fields from the current user's database scope, and persist progress changes with CSRF and `If-Match` checks. Do not expose the event JSON payload in list responses.
- **Frontend:** Load saved events and settings when available. Retain the prototype's other sample panels only with a visible preview notice until their own APIs are connected.
- **Unverified:** Database migrations and live OAuth/API behavior still need a configured PostgreSQL service and OAuth client; portal connector behavior remains unverified.
