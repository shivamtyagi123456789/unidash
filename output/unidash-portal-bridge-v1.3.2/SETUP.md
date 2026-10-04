# UniDash Portal Bridge setup

This desktop Edge/Chrome extension lets the signed-in UniDash page request a scan of Moodle and AMS. It opens the portal tabs and reads pages using the browser's existing signed-in session. You sign in yourself; the extension does not read or save passwords.

## Install in Microsoft Edge

1. Start UniDash and open `http://localhost:3000/#more` in Edge.
2. Open `edge://extensions` in another tab and turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/portal-bridge` folder.
4. Return to UniDash. Open the Extensions menu, open **UniDash Portal Bridge**, and click **Pair with this dashboard**. Pairing is limited to the current site origin.
5. In the extension popup choose **Portal settings**. Enable Moodle and/or AMS, verify the portal URL, then choose **Save & grant access**. The browser asks for access to the configured portal sites.
6. The MITS AMS defaults scan the verified dashboard (`/student/dashboard`) for summary counters and upcoming quizzes, the academic calendar (`/student/academic-calendar`) for dated events, and `/student/courses` for course attendance. The AMS class schedule is excluded because its displayed data may be inaccurate. Existing older extension settings are upgraded at scan time to include the dashboard and calendar pages.
7. Return to **More → Integrations** in UniDash and choose **Scan enabled portals**. The extension detects an existing AMS student session and proceeds; if AMS shows its login page, sign in there and the scan continues when the student page loads. The manual **I'm signed in to …** button remains a fallback only if the portal's page cannot be recognized.

## Report and privacy

- First scan creates a baseline; later scans show additions, edits, and removals. Incomplete or suspicious scans are marked **Review needed** and do not replace the trusted baseline unless explicitly accepted.
- Reports and baselines stay in `chrome.storage.local` on this browser profile. They are not sent to the UniDash server and do not populate the app's demo attendance/events. Clearing extension data removes those local reports.
- Scans happen only after clicking the scan button. There is no hourly job or background monitoring.
- Use your institute account on each portal where supported. UniDash Google sign-in does not automatically authenticate you to Moodle or AMS.

## Limitations

The Moodle extractor calls Moodle's page AJAX services and can be blocked by site policy or version changes. AMS scanning reads the dashboard's visible quiz panel, dated academic-calendar events, and per-course attendance cards. It opens the quiz panel to reveal read-only content and navigates among verified AMS pages. The AMS class schedule is intentionally not scanned. A section that cannot be read is reported as a scan issue; verify its records before relying on them. This does not import records into server-backed attendance/events.
