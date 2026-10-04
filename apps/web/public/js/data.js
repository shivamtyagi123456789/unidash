/* UniDash runtime catalog. Account data is loaded from the authenticated API. */
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const midnightIST = new Date(`${istDate}T00:00:00+05:30`).getTime();

export const at = (offset, h = 0, m = 0) => new Date(midnightIST + offset * day + h * hour + m * 60_000);
export const now = () => new Date();
export const user = { name: '', programme: '', threshold: 75, lastVisit: new Date(Date.now() - day) };
export const subjects = [];
export const kinds = {
  CLASS: { label: 'Class', color: '#6ea8ff', icon: 'graduation-cap', base: 5 },
  LAB_SESSION: { label: 'Lab', color: '#5ee08a', icon: 'flask-conical', base: 5 },
  ASSIGNMENT: { label: 'Assignment', color: '#ff9a3c', icon: 'file-text', base: 15 },
  QUIZ: { label: 'Quiz', color: '#ff6b8b', icon: 'circle-help', base: 20 },
  MINOR_EXAM: { label: 'Minor exam', color: '#ff5a4e', icon: 'clipboard-list', base: 30, shape: 'diamond' },
  MAJOR_EXAM: { label: 'Major exam', color: '#ff2e3b', icon: 'clipboard-check', base: 40, shape: 'square' },
  PRACTICAL_EXAM: { label: 'Practical', color: '#3ddc84', icon: 'microscope', base: 25, shape: 'circle' },
  VIVA: { label: 'Viva', color: '#2dd4bf', icon: 'messages-square', base: 25, shape: 'triangle' },
  PRESENTATION: { label: 'Presentation', color: '#b18cff', icon: 'presentation', base: 20, shape: 'torus' },
  PROJECT_MILESTONE: { label: 'Milestone', color: '#a78bfa', icon: 'flag', base: 15 },
  LAB_FILE_SUBMISSION: { label: 'Lab submission', color: '#3ec7ff', icon: 'file-up', base: 15 },
  HOLIDAY: { label: 'Holiday', color: '#8b95a7', icon: 'sun', base: 1 },
  FEE_DUE: { label: 'Fee due', color: '#ffb000', icon: 'wallet', base: 10 },
  NOTICE_DEADLINE: { label: 'Notice', color: '#ff9a3c', icon: 'bell', base: 10 },
  PERSONAL: { label: 'Personal', color: '#a78bfa', icon: 'user', base: 5 },
  OTHER: { label: 'Other', color: '#8b95a7', icon: 'circle', base: 5 },
};
export const events = [];
export const attendance = [];
export const feed = [];
export const files = [];
export const inbox = [];
export const folders = [];
export const projects = [];
export const presentationSteps = ['NOT_STARTED', 'RESEARCHING', 'DRAFTING', 'REHEARSING', 'READY', 'PRESENTED'];
export const waPeople = [];
export const waMessages = [];
export const waGroup = { name: '', members: 0, listener: '' };
export const integrations = [];
export const timetable = [];
