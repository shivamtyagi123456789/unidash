type Offset = { milliseconds: number; label: string };

const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;
const offsetsByKind: Record<string, Offset[]> = {
  MAJOR_EXAM: [
    { milliseconds: 14 * day, label: "14d" }, { milliseconds: 7 * day, label: "7d" },
    { milliseconds: 3 * day, label: "3d" }, { milliseconds: day, label: "1d" }, { milliseconds: 3 * hour, label: "3h" },
  ],
  MINOR_EXAM: [
    { milliseconds: 7 * day, label: "7d" }, { milliseconds: 3 * day, label: "3d" },
    { milliseconds: day, label: "1d" }, { milliseconds: 3 * hour, label: "3h" },
  ],
  PRACTICAL_EXAM: [
    { milliseconds: 7 * day, label: "7d" }, { milliseconds: 2 * day, label: "2d" },
    { milliseconds: day, label: "1d" }, { milliseconds: 2 * hour, label: "2h" },
  ],
  VIVA: [
    { milliseconds: 7 * day, label: "7d" }, { milliseconds: 2 * day, label: "2d" },
    { milliseconds: day, label: "1d" }, { milliseconds: 2 * hour, label: "2h" },
  ],
  QUIZ: [
    { milliseconds: day, label: "1d" }, { milliseconds: 3 * hour, label: "3h" }, { milliseconds: hour, label: "1h" },
  ],
  ASSIGNMENT: [
    { milliseconds: 3 * day, label: "3d" }, { milliseconds: day, label: "1d" }, { milliseconds: 6 * hour, label: "6h" },
  ],
  PRESENTATION: [
    { milliseconds: 7 * day, label: "7d" }, { milliseconds: 3 * day, label: "3d" },
    { milliseconds: 2 * day, label: "2d rehearsal" }, { milliseconds: day, label: "1d" }, { milliseconds: 3 * hour, label: "3h" },
  ],
  LAB_FILE_SUBMISSION: [
    { milliseconds: 2 * day, label: "2d" }, { milliseconds: day, label: "1d" }, { milliseconds: 3 * hour, label: "3h" },
  ],
  PROJECT_MILESTONE: [
    { milliseconds: 3 * day, label: "3d" }, { milliseconds: day, label: "1d" },
  ],
  FEE_DUE: [
    { milliseconds: 7 * day, label: "7d" }, { milliseconds: 2 * day, label: "2d" },
  ],
};

export function buildDefaultReminders(kind: string, startsAt: Date, weightagePct: number | null | undefined, now = new Date()) {
  const offsets = [...(offsetsByKind[kind] ?? [])];
  if (kind === "ASSIGNMENT" && (weightagePct ?? 0) >= 10) offsets.push({ milliseconds: hour, label: "1h" });
  return offsets
    .map(({ milliseconds, label }) => ({ remindAt: new Date(startsAt.getTime() - milliseconds), offsetLabel: label }))
    .filter(({ remindAt }) => remindAt > now);
}
