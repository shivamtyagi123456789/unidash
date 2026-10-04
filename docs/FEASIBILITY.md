# UniDash integration feasibility

This document records observed evidence only. Unknown behavior stays marked unknown until tested; no portal URL, login flow, endpoint, or response shape is assumed.

## Environment checked

| Item | Observed | Status |
|---|---|---|
| Node.js | `v24.19.0` | Available |
| pnpm | `11.19.0` | Available |
| Docker | `docker` command not found on PATH | Not available in this shell; confirm whether Docker Desktop is installed |
| Backend implementation | Authenticated API, Supabase/PostgreSQL schema, Drive storage, project persistence, and Moodle token-verification foundation exist | In progress; live data imports remain incomplete |

## Portal access

| Source | Base URL | Sign-in method | Off-campus access | Feasibility |
|---|---|---|---|---|
| College AMS | `https://ams.mitsgwalior.in/login` | User reports college Google sign-in works | User reports access from any location; not independently tested | Sign-in/reachability reported; connector/API feasibility not assessed |
| Moodle | `https://moodle.mitsweb.in/login/index.php` | User reports college Google sign-in works; public page also shows username/password and a “MITS-DU email id” option | User reports access from any location; not independently tested | Sign-in/reachability reported; web-service/API availability not assessed |

The owner reports that the official Moodle mobile app works for their account and offers both username/password and Google sign-in. The owner reports there is no Security keys link for their account. Moodle administrator support may be needed to enable a supported read-only web-service route; this remains unconfirmed.

No credentials, cookies, tokens, or personal records belong in this repository. Never send passwords here.

## Owner's current academic context (provided 2026-10-03)

- The owner says they are currently in 1st semester of B.Tech Computer Science and Engineering at Madhav Institute of Technology & Science (MITS), Gwalior, Madhya Pradesh.
- The owner confirms CSE Section B and lab batch/group B3.
- The owner says attendance and other student records are on the MITS AMS. Treat AMS as the future source of truth for attendance; do not create or infer attendance values from the timetable.
- The supplied CSE/CSD master timetable is for the July–December 2026 session and says it is effective from 27 July 2026. It lists separate 1st-semester CSE Section A and Section B schedules; the owner confirms they are in Section B, lab group B3.
- Page 1's 1st-semester CSE course catalog lists: 15261101 Emerging Technologies in Computer Science; 15261102 Computer Programming; 15261103 Digital Electronics; 15261104 Cyber World and Security Concern; 15261105 Engineering Mathematics-I; 15261106 Computer Programming Lab; 15261107 CS Foundation Lab (Digital Electronics Lab); 15261108 Semester Proficiency; 15261109 Micro Project-I; 15261110 Language Lab; 15261111 Mandatory Workshop on Report Writing at Department Level; 15261112 Induction Programme of three weeks.
- The supplied Madhya Pradesh 2026 calendar is a state-government holiday calendar, not a MITS academic calendar. Do not derive the semester start/end dates or assume institute closure dates from it.
- Still needed before creating personalized term/subject records: obtain the official semester end/date range if the app needs exact term boundaries. No AMS login was attempted and no authenticated AMS records/API have been inspected.

## Hosting and scope

- Initial run location: local development accepted by owner.
- Deployment goal: host the whole project; Vercel/Netlify may serve the web/API layer, but the continuous worker and PostgreSQL still need compatible hosting. No production host is selected.
- v1 connector scope: AMS and Moodle, consistent with the current frontend preview.
- WhatsApp: deferred; no WhatsApp connector or message access is part of this feasibility pass.
- No external service has been contacted and no live integration has been claimed.
- Owner preference: use the same college Google account to sign in to UniDash. This authenticates the UniDash user only; AMS and Moodle still need their own read-only connection method.

## Next evidence needed

1. Determine whether Moodle administration can enable the required read-only web-service token/functions if no Security keys link is available.
2. Inspect sanitized AMS portal data/network paths before selecting a connector (never headers, cookies, session ids, or tokens).
3. Decide production hosting topology; Vercel/Netlify are under consideration for the web layer.

## Findings

Public login-page checks: the AMS URL opened, but its login page was not readable by the page-text viewer; its login options are recorded from the screenshot supplied by the owner. The Moodle login page opened and exposed the options recorded above. The owner reports Google login and off-campus access work for both systems. No account was selected, no login was attempted by the assistant, and no authenticated portal content or API was accessed.

Moodle's official developer documentation says Security keys availability depends on the user's `moodle/webservice:createtoken` capability. This means an absent link may be a permission setting, not proof that the site has no Web Services. Moodle's Web Services framework is used by its mobile app, and its docs describe a site's API function documentation; neither generic capability nor mobile app sign-in proves this institution has enabled a token or required functions for this student.

No connector or authenticated integration tests have been run. This section will be updated only with reproducible observations and sanitized evidence.

## Integration implementation update (2026-10-03)

- A Moodle connection endpoint now targets only `https://moodle.mitsweb.in`, verifies a submitted token using `core_webservice_get_site_info`, and encrypts it at rest only after successful validation. The token is not returned to the client or logged. Migration `0022_cuddly_reavers.sql` adds encrypted-secret storage and was applied to the configured database.
- Token verification does not import courses, assignments, grades, resources, or attendance. Those require confirming which read-only functions are enabled on the MITS service and sampling sanitized responses first.
- Moodle docs state that the Security keys/token page requires `moodle/webservice:createtoken`; the institute must also permit REST Web Services and the relevant read-only functions. The owner reports this token option is not currently visible, so this remains an administrator-dependent setup item.
- AMS remains unconnected. Its attendance data is the source of truth; do not infer attendance from schedules. Await approved read-only API/documentation or sanitized browser/network evidence before choosing an import design. Do not request/share passwords, cookies, session IDs, or tokens in chat.

## Signed-in portal inspection (2026-10-03)

- With the owner's Edge extension connected and the owner already signed in, read-only UI inspection confirmed the AMS dashboard/course pages expose course-wise attendance summaries and dated attendance records with status, session description, and marker. The AMS Downloads page displayed no downloads; the AMS Developer page showed developer/contact information, not API docs. No official API/export surfaced in these inspected pages. Do not rely on browser-session scraping for a backend sync.
- The Moodle dashboard exposes course-linked upcoming events and a calendar. Its **Import or export calendars → Export calendar** page explicitly distinguishes a dynamic calendar URL (source changes reflected in subscribers) from a one-time export; it can select all events, courses, groups, or personal events. This is a promising supported route for importing Moodle calendar events if the resulting URL can be safely kept private and fetched server-side.
- The Moodle Preferences page has no Security keys entry. The calendar **Get calendar URL** action was not clicked because it may create/reveal a private bearer-style feed link; obtain the owner's explicit approval before generating one. Never paste that URL into chat. The backend currently implements Moodle Web Services token verification only; calendar-feed ingestion is not implemented.
- Inspection was read-only. No tokens, cookies, session identifiers, other students' details, or exact personal attendance values were copied into project docs.
