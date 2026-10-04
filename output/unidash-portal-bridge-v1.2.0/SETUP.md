# UniDash Portal Bridge setup

This desktop Edge/Chrome extension lets the signed-in UniDash page request a scan of Moodle and AMS. It opens the portal tabs and reads pages using the browser's existing signed-in session. You sign in yourself; the extension does not read or save passwords.

## Install in Microsoft Edge

1. Start UniDash and open `http://localhost:3000/#more` in Edge.
2. Open `edge://extensions` in another tab and turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension/portal-bridge` folder.
4. Return to UniDash. Open the Extensions menu, open **UniDash Portal Bridge**, and click **Pair with this dashboard**. Pairing is limited to the current site origin.
5. In the extension popup choose **Portal settings**. Enable Moodle and/or AMS, verify the portal URL, then choose **Save & grant access**. The browser asks for access to the configured portal sites.
6. The MITS AMS default scans course attendance cards at `/student/courses`; the user may keep the default AMS pages list. Other AMS pages can be added with JSON like `[ {"name":"Attendance","path":"/YOUR/REAL/PATH","tableSelector":"table","keyColumns":[0]} ]`. Replace the example with the real page path; do not guess it.
7. Return to **More → Integrations** in UniDash and choose **Scan enabled portals**. Sign in in any portal tab that opens. If automatic detection waits, return to the dashboard and click **I'm signed in to …**.

## Report and privacy

- First scan creates a baseline; later scans show additions, edits, and removals. Incomplete or suspicious scans are marked **Review needed** and do not replace the trusted baseline unless explicitly accepted.
- Reports and baselines stay in `chrome.storage.local` on this browser profile. They are not sent to the UniDash server and do not populate the app's demo attendance/events. Clearing extension data removes those local reports.
- Scans happen only after clicking the scan button. There is no hourly job or background monitoring.
- Use your institute account on each portal where supported. UniDash Google sign-in does not automatically authenticate you to Moodle or AMS.

## Limitations

The Moodle extractor calls Moodle's page AJAX services and can be blocked by site policy or version changes. AMS scanning reads the MITS course attendance cards on `/student/courses` and configured HTML tables; it cannot read charts or other JavaScript-only grids. A failed/empty extraction is reported as a scan issue. Verify each displayed section and records before relying on them. This does not import attendance into the server-backed attendance view.
