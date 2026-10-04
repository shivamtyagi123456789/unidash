# UniDash

> **Current implementation (2026-10-04):** The deployable interface is the supplied 3D frontend in `frontend/`, served by Next.js after sign-in and connected to user-scoped APIs. Run `pnpm sync:frontend` before building. AMS and Moodle scans use the paired browser extension and the user's signed-in browser session. See `HANDOFF.md` and `docs/PROGRESS.md` for the remaining deployment requirements.

UniDash is a private academic dashboard for exams, deadlines, timetable, attendance, files, projects, and presentations. The existing HTML/CSS/JavaScript frontend is being kept intact while a PostgreSQL-backed web/API and background worker are added.

## Current state

- The current screens still use clearly labeled sample data. No AMS or Moodle account data is connected.
- `apps/web` is a Next.js App Router web/API shell. It serves the existing frontend, has invite-only Google sign-in through Better Auth, and exposes user-scoped event list/create/edit/progress/delete/hide/restore flows with CSRF and concurrency checks. The dashboard loads saved events when available and clearly labels the remaining sample-data panels.
- `packages/db` contains PostgreSQL/Drizzle schema and migrations for users, allow-list invites, accounts, revocable database sessions, events, and event-create idempotency. Migrations need a PostgreSQL connection before they can be applied.
- `apps/worker` is a separate pg-boss process. It requires PostgreSQL and currently has no connector jobs enabled.
- Google sign-in code is in place but needs a PostgreSQL database, an OAuth web client, and the owner's allow-list entry before it can be used. Other owner-scoped data APIs and portal sync are not implemented yet.
- Quick Add and the event detail Edit/Delete actions use the authenticated API. Delete is offered only for manually added events; source events are never deleted by UniDash. Apply all migrations before using these actions; the form sends event times as UTC after interpreting inputs in Asia/Kolkata. Edited fields are recorded in `locked_fields` for future source reconciliation.
- WhatsApp is deferred; no WhatsApp connector or message access is being built in this slice.

## Local development

Requirements: Node.js 20.9+ (Node 24 is installed here), pnpm, and a PostgreSQL database. Docker is not currently available in the development environment.

```powershell
pnpm install
Copy-Item .env.example .env
# Set DATABASE_URL and WORKER_DATABASE_URL in .env to your PostgreSQL connection.
# Create a Google OAuth web client and fill in AUTH_SECRET, GOOGLE_CLIENT_ID,
# GOOGLE_CLIENT_SECRET, and OWNER_EMAIL in .env. Do not paste these into chat.
# For local OAuth, authorize http://localhost:3000/api/auth/callback/google.
pnpm db:generate
pnpm db:migrate
pnpm invite-owner
pnpm dev
```

Generate an auth secret in PowerShell with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Open `http://localhost:3000`. Sign-in is restricted to the address in the allow-list. After sign-in, the existing dashboard is still sample-only until source data APIs are connected. In a separate terminal, run `pnpm worker` after configuring the worker database URL.

The static preview alone can still be run from the repository root with `python -m http.server 8765`; that mode does not run the API or worker.

## Deployment shape

The web/API and static frontend can be deployed together to a Next.js-capable host. The long-running worker and PostgreSQL need their own compatible services. Vercel or Netlify alone are not the complete deployment target for the worker. See `docs/DECISIONS.md` and `docs/FEASIBILITY.md` before selecting production hosting.

## Repository layout

- `frontend/` — supplied frontend source used by the deployable app
- `index.html`, `css/`, `js/` — retained earlier static implementation
- `apps/web/` — Next.js web/API shell
- `apps/worker/` — separate background worker process
- `packages/config/` — Zod environment validation
- `packages/db/` — PostgreSQL schema and Drizzle migrations
- `scripts/sync-frontend.mjs` — syncs `frontend/` into the Next.js public directory
- `docs/SPEC.md` — complete product and implementation requirements
- `docs/FEASIBILITY.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` — findings and current status
- `docs/RUNBOOK.md` — local setup and operator checks

## Safety boundary

Never put Gmail passwords, OTPs, portal cookies, session IDs, Moodle tokens, or real database connection strings in chat or source control. Portal connectors remain disabled until supported read-only access is verified. See `docs/SPEC.md` for the full security and data-handling rules.
