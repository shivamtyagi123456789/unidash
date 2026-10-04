/* =========================================================================
   UniDash — demo data (FAKE data only, per SPEC §1.4 "seed creates fake data")
   Mirrors the canonical vocabulary of SPEC §3.2 so the real build can swap
   this file for API calls (GET /api/v1/...) without touching the UI.
   ========================================================================= */

const H = 3600e3, D = 24 * H;
const DAY0 = new Date('2026-10-02T00:00:00+05:30').getTime(); // Fri 2 Oct 2026, IST midnight
/** at(dayOffset, hour, minute) → Date in IST */
export const at = (d, h = 0, m = 0) => new Date(DAY0 + d * D + h * H + m * 6e4);

/** Demo clock: frozen at 09:40 IST on load, then ticks in real time. */
export const DEMO_START = at(0, 9, 40).getTime();
export const now = () => new Date();

export const user = {
  name: 'Aarav',
  programme: 'B.Tech CSE · Sem 5 · Section 3B',
  threshold: 75,
  lastVisit: at(-1, 22, 15),
};

export const subjects = [
  { id: 'CS301', code: 'CS-301', name: 'Design & Analysis of Algorithms', short: 'Algorithms', faculty: 'Dr. Meera Iyer', color: '#ffb000', credits: 4 },
  { id: 'CS302', code: 'CS-302', name: 'Database Systems', short: 'DBMS', faculty: 'Prof. R. Sharma', color: '#3ec7ff', credits: 4 },
  { id: 'CS303', code: 'CS-303', name: 'Operating Systems', short: 'OS', faculty: 'Dr. Kavya Nair', color: '#c8ff4d', credits: 4 },
  { id: 'CS304', code: 'CS-304', name: 'Computer Networks', short: 'Networks', faculty: 'Dr. Arjun Bose', color: '#ff6fb5', credits: 3 },
  { id: 'MA301', code: 'MA-301', name: 'Discrete Mathematics', short: 'Discrete', faculty: 'Dr. S. Kulkarni', color: '#a78bfa', credits: 3 },
  { id: 'HS301', code: 'HS-301', name: 'Professional Communication', short: 'ProfComm', faculty: 'Ms. Tara Dsouza', color: '#e8d5b0', credits: 2 },
];

/* SPEC §14.3 — colour, Lucide icon and exam-strip shape per EventKind */
export const kinds = {
  CLASS:               { label: 'Class',        color: '#6ea8ff', icon: 'graduation-cap',   base: 5 },
  LAB_SESSION:         { label: 'Lab',          color: '#5ee08a', icon: 'flask-conical',    base: 5 },
  ASSIGNMENT:          { label: 'Assignment',   color: '#ff9a3c', icon: 'file-text',        base: 15 },
  QUIZ:                { label: 'Quiz',         color: '#ff6b8b', icon: 'circle-help',      base: 20 },
  MINOR_EXAM:          { label: 'Minor exam',   color: '#ff5a4e', icon: 'clipboard-list',   base: 30, shape: 'diamond' },
  MAJOR_EXAM:          { label: 'Major exam',   color: '#ff2e3b', icon: 'clipboard-check',  base: 40, shape: 'square' },
  PRACTICAL_EXAM:      { label: 'Practical',    color: '#3ddc84', icon: 'microscope',       base: 25, shape: 'circle' },
  VIVA:                { label: 'Viva',         color: '#2dd4bf', icon: 'messages-square',  base: 25, shape: 'triangle' },
  PRESENTATION:        { label: 'Presentation', color: '#b18cff', icon: 'presentation',     base: 25 },
  PROJECT_MILESTONE:   { label: 'Milestone',    color: '#818cf8', icon: 'flag',             base: 15 },
  LAB_FILE_SUBMISSION: { label: 'Lab file',     color: '#a3e635', icon: 'book-open-check',  base: 15 },
  HOLIDAY:             { label: 'Holiday',      color: '#facc15', icon: 'party-popper',     base: 5 },
  FEE_DUE:             { label: 'Fee due',      color: '#f59e0b', icon: 'indian-rupee',     base: 5 },
  NOTICE_DEADLINE:     { label: 'Notice',       color: '#94a3b8', icon: 'megaphone',        base: 5 },
  PERSONAL:            { label: 'Personal',     color: '#a1a1aa', icon: 'pin',              base: 5 },
  OTHER:               { label: 'Other',        color: '#a1a1aa', icon: 'circle',           base: 5 },
};

/* Events (deadlines, exams, presentations…) — SPEC §6 events table, simplified */
export const events = [
  { id: 'e12', kind: 'ASSIGNMENT', subject: 'MA301', title: 'Problem Set 5 — Recurrences', start: at(-1, 23, 59), source: 'MOODLE', status: 'CONFIRMED', weight: 5, progress: 'IN_PROGRESS', submission: 'NOT_SUBMITTED' },
  { id: 'e3',  kind: 'CLASS', subject: 'CS302', title: 'DBMS Lecture · Normalisation', start: at(0, 10), end: at(0, 11), venue: 'Room 204', source: 'AMS', status: 'CONFIRMED' },
  { id: 'e4',  kind: 'LAB_SESSION', subject: 'CS303', title: 'OS Lab · Scheduling sim', start: at(0, 11, 30), end: at(0, 13, 30), venue: 'Lab 3', source: 'AMS', status: 'CONFIRMED' },
  { id: 'e2',  kind: 'QUIZ', subject: 'CS301', title: 'Quiz 4 · Graph Algorithms', start: at(0, 14), end: at(0, 14, 30), venue: 'Moodle (online)', source: 'MOODLE', status: 'CONFIRMED', weight: 5, progress: 'NOT_STARTED' },
  { id: 'e1',  kind: 'ASSIGNMENT', subject: 'CS301', title: 'Assignment 3 — Greedy & DP', start: at(0, 15), source: 'MOODLE', status: 'CONFIRMED', weight: 10, progress: 'NOT_STARTED', submission: 'NOT_SUBMITTED' },
  { id: 'e9',  kind: 'QUIZ', subject: 'CS304', title: 'CN Quiz · Unit 3 (from CR)', start: at(1, 9), venue: 'Room 112', source: 'WHATSAPP', status: 'TENTATIVE', weight: 5, progress: 'NOT_STARTED' },
  { id: 'e19', kind: 'ASSIGNMENT', subject: 'CS304', title: 'Socket Programming Lab Report', start: at(2, 23, 59), source: 'MOODLE', status: 'CONFIRMED', weight: 8, progress: 'IN_PROGRESS', submission: 'NOT_SUBMITTED' },
  { id: 'e10', kind: 'LAB_FILE_SUBMISSION', subject: 'CS303', title: 'OS Lab Record — Expts 1–6', start: at(3, 17), source: 'AMS', status: 'CONFIRMED', progress: 'IN_PROGRESS' },
  { id: 'e8',  kind: 'PRESENTATION', subject: 'HS301', title: 'Group Presentation · Ethics in AI', start: at(4, 11), end: at(4, 11, 15), venue: 'Seminar Hall B', source: 'MANUAL', status: 'CONFIRMED', weight: 10, progress: 'IN_PROGRESS' },
  { id: 'e21', kind: 'QUIZ', subject: 'MA301', title: 'Quiz 3 · Graph Theory', start: at(5, 12), source: 'MOODLE', status: 'CONFIRMED', weight: 5, progress: 'NOT_STARTED' },
  { id: 'e11', kind: 'PROJECT_MILESTONE', subject: 'CS302', title: 'Mini-project · ER diagram review', start: at(6, 16), source: 'MANUAL', status: 'CONFIRMED', progress: 'IN_PROGRESS' },
  { id: 'e17', kind: 'FEE_DUE', subject: null, title: 'Semester fee · Instalment 2', start: at(9, 17), source: 'AMS', status: 'CONFIRMED', progress: 'NOT_STARTED' },
  { id: 'e5',  kind: 'MINOR_EXAM', label: 'Minor-2', subject: 'CS302', title: 'Minor-2 · Database Systems', start: at(12, 14), end: at(12, 16), venue: 'Room 204', source: 'AMS', status: 'CONFIRMED', weight: 15, movedFrom: at(10, 10), syllabus: 'Units 3–4', files: 5, prep: [true, true, false, false, false] },
  { id: 'e6',  kind: 'MINOR_EXAM', label: 'Minor-2', subject: 'CS301', title: 'Minor-2 · Algorithms', start: at(13, 10), end: at(13, 12), venue: 'LT-1', source: 'AMS', status: 'CONFIRMED', weight: 15, syllabus: 'Units 3–4', files: 7, prep: [true, false, false, false] },
  { id: 'e7',  kind: 'MINOR_EXAM', label: 'Minor-2', subject: 'CS303', title: 'Minor-2 · Operating Systems', start: at(14, 10), end: at(14, 12), venue: 'LT-2', source: 'AMS', status: 'CONFIRMED', weight: 15, syllabus: 'Units 3–5', files: 4, prep: [false, false, false] },
  { id: 'e20', kind: 'MINOR_EXAM', label: 'Minor-2', subject: 'CS304', title: 'Minor-2 · Computer Networks', start: at(15, 14), end: at(15, 16), venue: 'Room 112', source: 'AMS', status: 'CONFIRMED', weight: 15, syllabus: 'Units 3–4', files: 3, prep: [false, false, false, false] },
  { id: 'e23', kind: 'MINOR_EXAM', label: 'Minor-2', subject: 'MA301', title: 'Minor-2 · Discrete Mathematics', start: at(17, 10), end: at(17, 12), venue: 'LT-1', source: 'AMS', status: 'CONFIRMED', weight: 15, syllabus: 'Units 3–4', files: 6, prep: [true, true, true, false] },
  { id: 'e18', kind: 'HOLIDAY', subject: null, title: 'Dussehra — college closed', start: at(18, 0), source: 'AMS', status: 'CONFIRMED' },
  { id: 'e15', kind: 'PRACTICAL_EXAM', subject: 'CS303', title: 'OS Practical Exam', start: at(40, 9), end: at(40, 12), venue: 'Lab 3', source: 'AMS', status: 'CONFIRMED', weight: 20, syllabus: 'All experiments', files: 2, prep: [false, false] },
  { id: 'e16', kind: 'VIVA', subject: 'CS304', title: 'Networks Lab Viva', start: at(42, 14), venue: 'Lab 5', source: 'AMS', status: 'TENTATIVE', weight: 10, syllabus: 'Lab manual', files: 1, prep: [false] },
  { id: 'e13', kind: 'MAJOR_EXAM', label: 'Major', subject: 'CS301', title: 'Major (End-Sem) · Algorithms', start: at(47, 10), end: at(47, 13), venue: 'Exam Block A', source: 'AMS', status: 'CONFIRMED', weight: 50, syllabus: 'Full syllabus', files: 12, prep: [false, false, false, false, false] },
  { id: 'e14', kind: 'MAJOR_EXAM', label: 'Major', subject: 'CS302', title: 'Major (End-Sem) · Database Systems', start: at(49, 10), end: at(49, 13), venue: 'Exam Block A', source: 'AMS', status: 'CONFIRMED', weight: 50, syllabus: 'Full syllabus', files: 9, prep: [false, false, false, false] },
  { id: 'e22', kind: 'MAJOR_EXAM', label: 'Major', subject: 'CS303', title: 'Major (End-Sem) · Operating Systems', start: at(51, 10), end: at(51, 13), venue: 'Exam Block B', source: 'AMS', status: 'CONFIRMED', weight: 50, syllabus: 'Full syllabus', files: 8, prep: [false, false, false] },
  { id: 'e24', kind: 'MAJOR_EXAM', label: 'Major', subject: 'CS304', title: 'Major (End-Sem) · Computer Networks', start: at(53, 10), end: at(53, 13), venue: 'Exam Block B', source: 'AMS', status: 'CONFIRMED', weight: 50, syllabus: 'Full syllabus', files: 6, prep: [false, false, false] },
];

/* Weekly timetable (Mon=1 … Fri=5) used to paint the calendar week grid */
export const timetable = [
  { dow: 1, h: 9, len: 1, subject: 'CS301', kind: 'CLASS', venue: 'LT-1' },
  { dow: 1, h: 10, len: 1, subject: 'CS302', kind: 'CLASS', venue: 'Room 204' },
  { dow: 1, h: 14, len: 2, subject: 'CS304', kind: 'LAB_SESSION', venue: 'Lab 5' },
  { dow: 2, h: 9, len: 1, subject: 'MA301', kind: 'CLASS', venue: 'LT-1' },
  { dow: 2, h: 11, len: 1, subject: 'CS303', kind: 'CLASS', venue: 'LT-2' },
  { dow: 2, h: 15, len: 1, subject: 'HS301', kind: 'CLASS', venue: 'Room 310' },
  { dow: 3, h: 9, len: 1, subject: 'CS304', kind: 'CLASS', venue: 'Room 112' },
  { dow: 3, h: 10, len: 1, subject: 'CS301', kind: 'CLASS', venue: 'LT-1' },
  { dow: 3, h: 12, len: 1, subject: 'MA301', kind: 'CLASS', venue: 'LT-1' },
  { dow: 4, h: 9, len: 1, subject: 'CS303', kind: 'CLASS', venue: 'LT-2' },
  { dow: 4, h: 11, len: 2, subject: 'CS302', kind: 'LAB_SESSION', venue: 'Lab 2' },
  { dow: 4, h: 16, len: 1, subject: 'HS301', kind: 'CLASS', venue: 'Room 310' },
  { dow: 5, h: 10, len: 1, subject: 'CS302', kind: 'CLASS', venue: 'Room 204' },
  { dow: 5, h: 11.5, len: 2, subject: 'CS303', kind: 'LAB_SESSION', venue: 'Lab 3' },
  { dow: 5, h: 15, len: 1, subject: 'CS304', kind: 'CLASS', venue: 'Room 112' },
];

/* Attendance — attended / total per subject (SPEC §10.8) */
export const attendance = [
  { subject: 'CS301', a: 38, t: 46, trend: [80, 82, 81, 83, 84, 82.6] },
  { subject: 'CS302', a: 33, t: 42, trend: [81, 80, 79, 80, 78, 78.6] },
  { subject: 'CS303', a: 29, t: 38, trend: [82, 80, 79, 78, 77, 76.3] },
  { subject: 'CS304', a: 26, t: 36, trend: [79, 77, 76, 74, 73, 72.2] },
  { subject: 'MA301', a: 40, t: 44, trend: [88, 90, 91, 90, 91, 90.9] },
  { subject: 'HS301', a: 18, t: 22, trend: [85, 83, 80, 82, 81, 81.8] },
];

/* Change feed since last visit (SPEC §3.2 FeedKind) */
export const feed = [
  { id: 'f1', kind: 'EXAM_RESCHEDULED', severity: 'CRITICAL', source: 'AMS', subject: 'CS302', title: 'Minor-2 · DBMS was rescheduled', before: 'Mon 12 Oct · 10:00 AM', after: 'Wed 14 Oct · 2:00 PM', time: at(0, 7, 12), event: 'e5' },
  { id: 'f2', kind: 'WA_TRACKED_MESSAGE', severity: 'IMPORTANT', source: 'WHATSAPP', subject: 'CS304', title: 'Rahul — CR: "kal CN ka quiz hai 9 baje, unit 3 se"', body: 'Date detected → proposed as tentative quiz, Sat 3 Oct 9:00 AM', time: at(0, 8, 51), event: 'e9' },
  { id: 'f3', kind: 'ASSIGNMENT_POSTED', severity: 'NORMAL', source: 'MOODLE', subject: 'CS301', title: 'New assignment: Assignment 3 — Greedy & DP', body: 'Due today 3:00 PM · weight 10 %', time: at(-1, 23, 4), event: 'e1' },
  { id: 'f4', kind: 'RESOURCE_ADDED', severity: 'INFO', source: 'MOODLE', subject: 'CS303', title: 'Unit-4 Deadlocks slides.pdf', body: 'Auto-filed → Sem 5 / OS / Lectures', time: at(0, 6, 30) },
  { id: 'f5', kind: 'GRADE_POSTED', severity: 'NORMAL', source: 'MOODLE', subject: 'CS301', title: 'Quiz 3 graded: 8.5 / 10', body: 'Class median 6.9', time: at(0, 5, 2) },
  { id: 'f6', kind: 'ATTENDANCE_RISK', severity: 'IMPORTANT', source: 'AMS', subject: 'CS304', title: 'Networks attendance 72.2 % — below 75 %', body: 'Attend the next 4 classes in a row to get back to 75 %', time: at(0, 7, 12) },
];

/* WhatsApp — tracked people only (SPEC §9) */
export const waGroup = { name: 'CSE-3B Official 2026', members: 71, listener: 'Spare number · read-only', status: 'ACTIVE' };
export const waPeople = [
  { id: 'p1', label: 'Rahul', role: 'CR', color: '#ffb000', initials: 'RK' },
  { id: 'p2', label: 'Prof. Sharma', role: 'Faculty · DBMS', color: '#3ec7ff', initials: 'RS' },
  { id: 'p3', label: 'Ananya', role: 'LR', color: '#ff6fb5', initials: 'AM' },
];
export const waMessages = [
  { id: 'w1', person: 'p1', time: at(0, 8, 51), text: 'kal CN ka quiz hai 9 baje, unit 3 se. Room 112 👍', category: 'QUIZ', subject: 'CS304', extracted: 'Sat 3 Oct · 9:00 AM', proposal: { type: 'NEW', status: 'PENDING', kind: 'QUIZ', event: 'e9' } },
  { id: 'w2', person: 'p2', time: at(0, 7, 40), text: 'Minor-2 for DBMS is shifted to Wednesday 14th Oct, 2 PM. Syllabus remains Units 3 and 4. Updated date-sheet is on AMS.', category: 'EXAM', subject: 'CS302', extracted: 'Wed 14 Oct · 2:00 PM', proposal: { type: 'UPDATE', status: 'MATCHED', note: 'Matches AMS — already updated' } },
  { id: 'w3', person: 'p3', time: at(-1, 21, 18), text: 'Presentation slots for ProfComm are out. Group 4 (us) → Tue 6 Oct 11:00, Seminar Hall B. 12 min + 3 min Q&A', category: 'PRESENTATION', subject: 'HS301', extracted: 'Tue 6 Oct · 11:00 AM', proposal: { type: 'NEW', status: 'ACCEPTED', event: 'e8' } },
  { id: 'w4', person: 'p1', time: at(-1, 18, 2), text: '📎 OS_Lab_Manual_v2.pdf', category: 'STUDY_MATERIAL', subject: 'CS303', file: { name: 'OS_Lab_Manual_v2.pdf', size: '2.4 MB' } },
  { id: 'w5', person: 'p2', time: at(-2, 16, 30), text: 'Mini-project teams: please submit your ER diagrams by Thursday 8th, 4 PM for review.', category: 'SUBMISSION', subject: 'CS302', extracted: 'Thu 8 Oct · 4:00 PM', proposal: { type: 'NEW', status: 'ACCEPTED', event: 'e11' } },
  { id: 'w6', person: 'p1', time: at(-2, 10, 5), text: 'Tomorrow 3rd period free, Kulkarni sir is on leave. Adjustment class on Saturday maybe — will confirm.', category: 'CLASS_CHANGE', subject: 'MA301', extracted: 'Sat · time unknown', proposal: { type: 'NEW', status: 'PENDING', kind: 'CLASS', tentative: true } },
];

/* Files (SPEC §10.7) */
export const folders = ['Lectures', 'Assignments', 'Lab', 'Notes', 'PYQ & Exams', 'Projects', 'Presentations', 'Resources'];
export const files = [
  { id: 'fl1', name: 'Unit-4 Deadlocks slides.pdf', type: 'pdf', size: '3.1 MB', subject: 'CS303', folder: 'Lectures', source: 'MOODLE', added: at(0, 6, 30), isNew: true, tags: ['exam'] },
  { id: 'fl2', name: 'Assignment-3 brief.pdf', type: 'pdf', size: '420 KB', subject: 'CS301', folder: 'Assignments', source: 'MOODLE', added: at(-1, 23, 4), isNew: true, tags: [] },
  { id: 'fl3', name: 'Normalisation worked examples.pdf', type: 'pdf', size: '1.8 MB', subject: 'CS302', folder: 'Lectures', source: 'MOODLE', added: at(-2, 12), tags: ['exam'], version: 2 },
  { id: 'fl4', name: 'Minor-2 2025 paper.pdf', type: 'pdf', size: '640 KB', subject: 'CS302', folder: 'PYQ & Exams', source: 'MANUAL', added: at(-5, 19), tags: ['PYQ', 'exam'] },
  { id: 'fl5', name: 'Ethics-in-AI deck v3.pptx', type: 'ppt', size: '8.2 MB', subject: 'HS301', folder: 'Presentations', source: 'MANUAL', added: at(-1, 23, 50), tags: ['project'] },
  { id: 'fl6', name: 'mess_mgmt_schema.sql', type: 'code', size: '12 KB', subject: 'CS302', folder: 'Projects', source: 'MANUAL', added: at(-3, 22), tags: ['project'] },
  { id: 'fl7', name: 'Dijkstra proof sketch.jpg', type: 'img', size: '1.1 MB', subject: 'CS301', folder: 'Notes', source: 'MANUAL', added: at(-4, 20), tags: [] },
  { id: 'fl8', name: 'Socket lab starter.zip', type: 'zip', size: '96 KB', subject: 'CS304', folder: 'Lab', source: 'MOODLE', added: at(-6, 11), tags: [] },
  { id: 'fl9', name: 'Graph theory notes.pdf', type: 'pdf', size: '2.2 MB', subject: 'MA301', folder: 'Notes', source: 'MOODLE', added: at(-3, 9), tags: ['exam'] },
  { id: 'fl10', name: 'Paging & TLB.pdf', type: 'pdf', size: '2.9 MB', subject: 'CS303', folder: 'Lectures', source: 'MOODLE', added: at(-7, 10), tags: [] },
];
export const inbox = [
  { id: 'in1', name: 'OS_Lab_Manual_v2.pdf', size: '2.4 MB', source: 'WHATSAPP', from: 'Rahul — CR', suggest: { subject: 'CS303', folder: 'Lab' }, confidence: 0.93 },
  { id: 'in2', name: 'IMG_20261001_1712.jpg', size: '3.6 MB', source: 'MANUAL', from: 'Phone camera', suggest: { subject: 'CS304', folder: 'Notes' }, confidence: 0.61 },
  { id: 'in3', name: 'CN_unit3_important_Qs.pdf', size: '310 KB', source: 'WHATSAPP', from: 'Ananya — LR', suggest: { subject: 'CS304', folder: 'PYQ & Exams' }, confidence: 0.88 },
];

/* Projects & Presentations (SPEC §10.6) */
export const presentationSteps = ['NOT_STARTED', 'RESEARCHING', 'DRAFTING', 'REHEARSING', 'READY', 'PRESENTED'];
export const projects = [
  {
    id: 'pr1', type: 'PRESENTATION', subject: 'HS301', title: 'Ethics in AI', status: 'DRAFTING', due: at(4, 11), venue: 'Seminar Hall B', duration: '12 + 3 min',
    team: ['Aarav', 'Ananya', 'Kabir', 'Zoya'],
    tasks: [
      { t: 'Finalise topic', done: true }, { t: 'Outline', done: true }, { t: 'Divide parts', done: true },
      { t: 'Slides draft', done: false }, { t: 'Review with team', done: false }, { t: 'Rehearse ×2', done: false },
      { t: 'Export PDF backup', done: false }, { t: 'Copy to pen-drive / cloud', done: false }, { t: 'Carry ID card & charger', done: false },
    ],
  },
  {
    id: 'pr2', type: 'PROJECT', subject: 'CS302', title: 'Hostel Mess Management System', status: 'IN_PROGRESS', due: at(38, 17), team: ['Aarav', 'Kabir', 'Ishaan'],
    milestones: [
      { t: 'Problem statement', d: at(-14, 16), done: true },
      { t: 'ER diagram review', d: at(6, 16), done: false },
      { t: 'Schema + seed data', d: at(17, 16), done: false },
      { t: 'Final demo', d: at(38, 17), done: false },
    ],
    tasks: [
      { t: 'Identify entities', done: true }, { t: 'Draw ER in draw.io', done: true }, { t: 'Normalise to 3NF', done: false },
      { t: 'Write DDL', done: false }, { t: 'Seed 50 sample rows', done: false },
    ],
  },
  {
    id: 'pr3', type: 'PROJECT', subject: 'CS303', title: 'Mini Shell in C (OS Lab)', status: 'BLOCKED', due: at(24, 17), team: ['Aarav'], blockedBy: 'Waiting for lab manual v2 pipe() section',
    milestones: [
      { t: 'Parser', d: at(-3, 17), done: true }, { t: 'fork/exec', d: at(8, 17), done: false }, { t: 'Pipes & redirection', d: at(24, 17), done: false },
    ],
    tasks: [{ t: 'Tokeniser', done: true }, { t: 'Built-ins: cd, exit', done: true }, { t: 'Pipes', done: false }],
  },
];

export const integrations = [
  { kind: 'AMS', status: 'ACTIVE', last: at(0, 9, 28), tier: 'Session (Login Helper)', every: 120 },
  { kind: 'MOODLE', status: 'ACTIVE', last: at(0, 9, 32), tier: 'Web-service token', every: 30 },
  { kind: 'WHATSAPP', status: 'ACTIVE', last: at(0, 9, 39), tier: 'Linked device · read-only', every: 1 },
];
