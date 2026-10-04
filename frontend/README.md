# UniDash — 3D Frontend

> *One dashboard for your whole academic life.*

This is the supplied UniDash interface, wired to the authenticated APIs in the parent project. It loads saved events, attendance, projects, activity, integrations, and Drive file metadata for the signed-in account. The source list below now starts empty; it does not seed sample academic records. AMS/Moodle sync is user initiated through the paired browser extension and WhatsApp is not available.

## Design concept — "instrument panel", not a SaaS template
- **Academic Radar (3D, Three.js):** the home screen works like an air-traffic radar. The centre is *now*. Distance from the centre is time remaining (log scale, with rings at 24 h, 72 h, 7 d, 30 d and 60 d). Each sector is a subject. Height is the SPEC §10.3 priority score. The shape shows the kind of event (octahedron = Minor, cube = Major, sphere = Practical, cone = Viva, torus = Presentation, tetrahedron = Quiz). Tentative items are wireframes. A sweep beam makes each item flare as it passes, and overdue items pulse red. You can drag to orbit, scroll to zoom, and switch between ORBIT, TOP and SIDE camera views. Hover to see details; click to open the side sheet.
- **Exam corridor:** a 3D perspective floor with glowing pillars for every Minor, Major, Practical and Viva. Pillar height shows weightage; scroll sideways to move through the term. Exam cards tilt in 3D when you hover them.
- Typography: Instrument Serif headlines, Geist body text and Geist Mono for data labels. Background is graphite with a hairline grid and film grain; the accent colour is phosphor amber. A "drafting paper" light theme is also included.
- A short boot sequence plays on first load (skippable, honours `prefers-reduced-motion`).

## Screens (hash routes)
| Route | What |
|---|---|
| `#radar` (default) | 3D radar, greeting + stats, Needs-attention list, crunch banner, Next-up timeline, week load strip, "Since your last visit" feed with before → after |
| `#exams` | 3D exam corridor + exam cards (countdown, confirmed/tentative, ↻ moved, prep progress), subject filter |
| `#deadlines` | Overdue / Today / Tomorrow / This week / Later board; sort by priority or date; progress control with Undo |
| `#calendar` | Week grid (timetable + deadlines + hatched tentative items + now-line), week nav, semester timeline |
| `#projects` | Presentation stepper, milestones track, clickable checklists, team |
| `#attendance` | Rings with threshold tick, trend sparkline, can-skip / must-attend (SPEC formulas), skip/attend simulator |
| `#files` | Auto-filed folder tree, Inbox with suggested folder + "File it", 3D-tilt file tiles, NEW / version badges |
| `#whatsapp` | Tracked people (toggle), Hinglish messages with highlighted date words, "Add as tentative" proposals |
| `#more` | Mobile "More" menu + integration health |

Also: **⌘K / Ctrl+K or `/`** opens the command-palette search; **Esc** closes it. There is a side sheet for event detail (bottom sheet on phones), Undo toasts, a theme toggle, live IST clock and sync chips. `?noboot` skips the intro.

## Files
- `index.html` — app shell
- `css/style.css` — design system and all screens (responsive; mobile tab bar under 760 px)
- `js/data.js` — fake data using the SPEC §3.2 vocabulary (EventKind, Source, Status…)
- `js/radar3d.js` — Three.js radar scene
- `js/app.js` — router, views, interactions
- `docs/SPEC.md` — the full master build prompt

## Storage and deployment
The deployable app uses the parent project's PostgreSQL APIs and account controls. Theme preference remains local to the browser. Run `pnpm sync:frontend` from the parent project before building; Next.js serves this frontend after sign-in.

## Current UI limits
Some screens have API data but not all corresponding controls have been added to this visual shell yet. The app reports empty account data as empty; it does not display the old demo records. Portal scanning still needs an installed, paired extension and a user-started scan.

## Next steps
1. Confirm you like the visual direction, then follow SPEC §21 kickoff and Phase 0.
2. Port these screens into Next.js components (names already match SPEC §14.4: `ExamStrip`, `AttentionList`, `AttendanceRing`, …).
3. Replace `js/data.js` with `/api/v1/*` calls.

To publish this prototype, use the **Publish tab**.
