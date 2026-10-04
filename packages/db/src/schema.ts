import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type UserRole = "OWNER" | "MEMBER";
export type IntegrationKind = "AMS" | "MOODLE";
export type IntegrationStatus = "NOT_CONNECTED" | "READY" | "SYNCING" | "NEEDS_REAUTH" | "PAUSED" | "ERROR";
export type EventKind =
  | "CLASS" | "LAB_SESSION" | "ASSIGNMENT" | "QUIZ" | "MINOR_EXAM" | "MAJOR_EXAM" | "PRACTICAL_EXAM" | "VIVA"
  | "PRESENTATION" | "PROJECT_MILESTONE" | "LAB_FILE_SUBMISSION" | "HOLIDAY" | "FEE_DUE" | "NOTICE_DEADLINE"
  | "PERSONAL" | "OTHER";
export type EventSource = "AMS" | "MOODLE" | "WHATSAPP" | "SYSTEM" | "MANUAL";
export type EventStatus = "TENTATIVE" | "CONFIRMED" | "CANCELLED";
export type EventProgress = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "SKIPPED";
export type SubmissionState = "UNKNOWN" | "NOT_SUBMITTED" | "SUBMITTED" | "GRADED";
export type FeedKind =
  | "ATTENDANCE_CHANGED" | "ATTENDANCE_RISK" | "GRADE_POSTED" | "GRADE_CHANGED" | "NOTICE_POSTED"
  | "EXAM_SCHEDULED" | "EXAM_RESCHEDULED" | "EXAM_CANCELLED" | "EXAM_CLASH"
  | "ASSIGNMENT_POSTED" | "ASSIGNMENT_DUE_CHANGED" | "QUIZ_POSTED" | "QUIZ_WINDOW_CHANGED"
  | "SUBMISSION_STATUS_CHANGED" | "RESOURCE_ADDED" | "RESOURCE_UPDATED" | "FORUM_ANNOUNCEMENT"
  | "TIMETABLE_CHANGED" | "CLASS_CANCELLED" | "FEE_DUE"
  | "WA_TRACKED_MESSAGE" | "WA_KEYWORD_ALERT" | "WA_FILE_SHARED" | "EVENT_PROPOSED"
  | "REMINDER" | "DIGEST" | "CRUNCH_WARNING" | "INTEGRATION_ATTENTION" | "INITIAL_IMPORT";
export type StorageProvider = "GOOGLE_DRIVE";
export type StorageFileSource = "MANUAL" | "WHATSAPP" | "MOODLE" | "AMS";
export type StorageFileKind = "NOTE" | "SLIDE" | "PDF" | "ASSIGNMENT" | "LAB" | "PAPER" | "IMAGE" | "VIDEO" | "OTHER";
export type ProjectKind = "PROJECT" | "PRESENTATION" | "LAB_FILE" | "SEMINAR" | "RESEARCH" | "OTHER";
export type ProjectStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "SUBMITTED" | "DONE";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").$type<UserRole>().notNull().default("MEMBER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("users_role_ck", sql`${table.role} IN ('OWNER', 'MEMBER')`),
    uniqueIndex("users_email_uq").on(table.email),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accountId: text("provider_account_id").notNull(),
    providerId: text("provider").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_provider_account_uq").on(table.providerId, table.accountId),
    index("accounts_user_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("session_token").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sessions_token_uq").on(table.token), index("sessions_user_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const allowedEmails = pgTable(
  "allowed_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    role: text("role").$type<UserRole>().notNull().default("MEMBER"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check("allowed_emails_role_ck", sql`${table.role} IN ('OWNER', 'MEMBER')`),
    uniqueIndex("allowed_emails_email_uq").on(table.email),
  ],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  attendanceThreshold: integer("attendance_threshold").notNull().default(75),
  quietHoursStart: text("quiet_hours_start").notNull().default("23:00"),
  quietHoursEnd: text("quiet_hours_end").notNull().default("06:30"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("user_settings_threshold_ck", sql`${table.attendanceThreshold} BETWEEN 0 AND 100`)]);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IntegrationKind>().notNull(),
    status: text("status").$type<IntegrationStatus>().notNull().default("NOT_CONNECTED"),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    metadata: jsonb("metadata").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("integrations_kind_ck", sql`${table.kind} IN ('AMS', 'MOODLE')`),
    check("integrations_status_ck", sql`${table.status} IN ('NOT_CONNECTED', 'READY', 'SYNCING', 'NEEDS_REAUTH', 'PAUSED', 'ERROR')`),
    uniqueIndex("integrations_user_kind_uq").on(table.userId, table.kind),
    index("integrations_user_idx").on(table.userId),
  ],
);

export const portalScans = pgTable("portal_scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").$type<IntegrationKind>().notNull(),
  scanId: text("scan_id").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  trusted: boolean("trusted").notNull(),
  report: jsonb("report").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("portal_scans_source_ck", sql`${table.source} IN ('AMS', 'MOODLE')`),
  uniqueIndex("portal_scans_user_source_scan_uq").on(table.userId, table.source, table.scanId),
  index("portal_scans_user_source_latest_idx").on(table.userId, table.source, table.finishedAt),
]);

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label"),
    title: text("title").notNull(),
    description: text("description"),
    kind: text("kind").$type<EventKind>().notNull(),
    subjectCode: text("subject_code"),
    source: text("source").$type<EventSource>().notNull(),
    sourceRef: text("source_ref"),
    status: text("status").$type<EventStatus>().notNull().default("CONFIRMED"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isDeadline: boolean("is_deadline").notNull().default(false),
    isAllDay: boolean("is_all_day").notNull().default(false),
    venue: text("venue"),
    syllabus: text("syllabus"),
    weightagePct: numeric("weightage_pct", { precision: 5, scale: 2, mode: "number" }),
    maxMarks: numeric("max_marks", { precision: 6, scale: 2, mode: "number" }),
    progress: text("progress").$type<EventProgress>().notNull().default("NOT_STARTED"),
    submissionState: text("submission_state").$type<SubmissionState>().notNull().default("UNKNOWN"),
    origin: text("origin").notNull().default("MANUAL"),
    confidence: integer("confidence").notNull().default(100),
    naturalKey: text("natural_key"),
    lockedFields: jsonb("locked_fields").notNull().default([]),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  },
  (table) => [
    check("events_kind_ck", sql`${table.kind} IN ('CLASS', 'LAB_SESSION', 'ASSIGNMENT', 'QUIZ', 'MINOR_EXAM', 'MAJOR_EXAM', 'PRACTICAL_EXAM', 'VIVA', 'PRESENTATION', 'PROJECT_MILESTONE', 'LAB_FILE_SUBMISSION', 'HOLIDAY', 'FEE_DUE', 'NOTICE_DEADLINE', 'PERSONAL', 'OTHER')`),
    check("events_source_ck", sql`${table.source} IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM', 'MANUAL')`),
    check("events_status_ck", sql`${table.status} IN ('TENTATIVE', 'CONFIRMED', 'CANCELLED')`),
    check("events_progress_ck", sql`${table.progress} IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'SKIPPED')`),
    check("events_submission_state_ck", sql`${table.submissionState} IN ('UNKNOWN', 'NOT_SUBMITTED', 'SUBMITTED', 'GRADED')`),
    check("events_origin_ck", sql`${table.origin} IN ('SOURCE', 'INFERRED', 'MANUAL')`),
    check("events_confidence_ck", sql`${table.confidence} BETWEEN 0 AND 100`),
    index("events_user_start_idx").on(table.userId, table.startsAt),
    index("events_user_kind_idx").on(table.userId, table.kind),
    uniqueIndex("events_user_id_uq").on(table.userId, table.id),
    uniqueIndex("events_user_source_ref_uq").on(table.userId, table.source, table.sourceRef),
  ],
);

export const eventHistory = pgTable(
  "event_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(),
    field: text("field").notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    summary: text("summary"),
  },
  (table) => [index("event_history_event_changed_idx").on(table.eventId, table.changedAt)],
);

export const eventSources = pgTable("event_sources", {
  eventId: uuid("event_id").notNull(),
  source: text("source").$type<EventSource>().notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceUrl: text("url"),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastPayloadHash: text("last_payload_hash"),
}, (table) => [
  check("event_sources_source_ck", sql`${table.source} IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM', 'MANUAL')`),
  foreignKey({ name: "event_sources_event_fk", columns: [table.eventId], foreignColumns: [events.id] }).onDelete("cascade"),
  uniqueIndex("event_sources_event_source_ref_uq").on(table.eventId, table.source, table.sourceRef),
]);

export const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  offsetLabel: text("offset_label"),
  channel: text("channel").notNull().default("PUSH"),
  state: text("state").notNull().default("PENDING"),
  isDefault: boolean("is_default").notNull().default(true),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  check("reminders_channel_ck", sql`${table.channel} IN ('PUSH', 'IN_APP', 'EMAIL', 'TELEGRAM')`),
  check("reminders_state_ck", sql`${table.state} IN ('PENDING', 'SNOOZED', 'SENT', 'SKIPPED', 'FAILED', 'CANCELLED')`),
  uniqueIndex("reminders_event_time_channel_uq").on(table.eventId, table.remindAt, table.channel),
  uniqueIndex("reminders_user_id_uq").on(table.userId, table.id),
  foreignKey({ name: "reminders_user_event_fk", columns: [table.userId, table.eventId], foreignColumns: [events.userId, events.id] }).onDelete("cascade"),
  index("reminders_due_idx").on(table.remindAt).where(sql`${table.state} = 'PENDING'`),
  index("reminders_user_event_idx").on(table.userId, table.eventId),
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentType: text("parent_type").notNull(),
  parentId: uuid("parent_id"),
  title: text("title").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  doneAt: timestamp("done_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  check("tasks_parent_type_ck", sql`${table.parentType} IN ('EVENT', 'PROJECT', 'PRESENTATION', 'STANDALONE')`),
  index("tasks_user_parent_idx").on(table.userId, table.parentType, table.parentId),
]);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").$type<Record<string, unknown> | null>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_user_key_uq").on(table.userId, table.key),
    index("idempotency_keys_expiry_idx").on(table.expiresAt),
  ],
);

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerId: text("worker_id").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  version: text("version").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
});

export const terms = pgTable("terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  startsOn: date("starts_on", { mode: "string" }),
  endsOn: date("ends_on", { mode: "string" }),
  isCurrent: boolean("is_current").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  index("terms_user_idx").on(table.userId),
  uniqueIndex("terms_user_id_uq").on(table.userId, table.id),
  uniqueIndex("terms_one_current_per_user_uq").on(table.userId).where(sql`${table.isCurrent}`),
]);

export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  termId: uuid("term_id").notNull(),
  code: text("code"),
  name: text("name").notNull(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  facultyName: text("faculty_name"),
  credits: numeric("credits", { precision: 3, scale: 1, mode: "number" }),
  kind: text("kind").notNull().default("THEORY"),
  color: text("color"),
  moodleCourseId: integer("moodle_course_id"),
  amsRef: text("ams_ref"),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  index("subjects_user_term_idx").on(table.userId, table.termId),
  uniqueIndex("subjects_user_id_uq").on(table.userId, table.id),
  foreignKey({ name: "subjects_user_term_fk", columns: [table.userId, table.termId], foreignColumns: [terms.userId, terms.id] }).onDelete("cascade"),
]);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id"),
  type: text("type").$type<ProjectKind>().notNull().default("PROJECT"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").$type<ProjectStatus>().notNull().default("NOT_STARTED"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true, precision: 3 }),
  repoUrl: text("repo_url"),
  venue: text("venue"),
  duration: text("duration"),
  team: jsonb("team").$type<string[]>().notNull().default([]),
  tasks: jsonb("tasks").$type<{ title: string; done: boolean }[]>().notNull().default([]),
  milestones: jsonb("milestones").$type<{ title: string; dueAt: string | null; done: boolean }[]>().notNull().default([]),
  blockedBy: text("blocked_by"),
  driveFolderId: text("drive_folder_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  check("projects_type_ck", sql`${table.type} IN ('PROJECT', 'PRESENTATION', 'LAB_FILE', 'SEMINAR', 'RESEARCH', 'OTHER')`),
  check("projects_status_ck", sql`${table.status} IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'DONE')`),
  uniqueIndex("projects_user_id_uq").on(table.userId, table.id),
  uniqueIndex("projects_user_drive_folder_uq").on(table.userId, table.driveFolderId),
  foreignKey({ name: "projects_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }),
  index("projects_user_deadline_idx").on(table.userId, table.deadlineAt),
]);

export const storageConnections = pgTable("storage_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<StorageProvider>().notNull().default("GOOGLE_DRIVE"),
  accountEmail: text("account_email").notNull(),
  rootFolderId: text("root_folder_id"),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
  grantedScope: text("granted_scope").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("storage_connections_provider_ck", sql`${table.provider} = 'GOOGLE_DRIVE'`),
  uniqueIndex("storage_connections_user_uq").on(table.userId),
  index("storage_connections_user_idx").on(table.userId),
]);

export const fileFolders = pgTable("file_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  driveFolderId: text("drive_folder_id").notNull(),
  name: text("name").notNull(),
  termId: uuid("term_id"),
  subjectId: uuid("subject_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("file_folders_user_id_uq").on(table.userId, table.id),
  uniqueIndex("file_folders_user_root_name_uq").on(table.userId, table.name).where(sql`${table.parentId} IS NULL`),
  uniqueIndex("file_folders_user_parent_name_uq").on(table.userId, table.parentId, table.name).where(sql`${table.parentId} IS NOT NULL`),
  foreignKey({ name: "file_folders_user_parent_fk", columns: [table.userId, table.parentId], foreignColumns: [table.userId, table.id] }).onDelete("cascade"),
  foreignKey({ name: "file_folders_user_term_fk", columns: [table.userId, table.termId], foreignColumns: [terms.userId, terms.id] }),
  foreignKey({ name: "file_folders_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }),
  index("file_folders_user_parent_idx").on(table.userId, table.parentId),
]);

export const storedFiles = pgTable("stored_files", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id"),
  subjectId: uuid("subject_id"),
  eventId: uuid("event_id"),
  projectId: uuid("project_id"),
  projectRelativePath: text("project_relative_path"),
  driveFileId: text("drive_file_id").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256"),
  source: text("source").$type<StorageFileSource>().notNull().default("MANUAL"),
  kind: text("kind").$type<StorageFileKind>().notNull().default("OTHER"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  check("stored_files_size_ck", sql`${table.sizeBytes} >= 0`),
  check("stored_files_source_ck", sql`${table.source} IN ('MANUAL', 'WHATSAPP', 'MOODLE', 'AMS')`),
  check("stored_files_kind_ck", sql`${table.kind} IN ('NOTE', 'SLIDE', 'PDF', 'ASSIGNMENT', 'LAB', 'PAPER', 'IMAGE', 'VIDEO', 'OTHER')`),
  uniqueIndex("stored_files_user_id_uq").on(table.userId, table.id),
  uniqueIndex("stored_files_user_drive_id_uq").on(table.userId, table.driveFileId),
  foreignKey({ name: "stored_files_user_folder_fk", columns: [table.userId, table.folderId], foreignColumns: [fileFolders.userId, fileFolders.id] }),
  foreignKey({ name: "stored_files_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }),
  foreignKey({ name: "stored_files_user_event_fk", columns: [table.userId, table.eventId], foreignColumns: [events.userId, events.id] }),
  foreignKey({ name: "stored_files_user_project_fk", columns: [table.userId, table.projectId], foreignColumns: [projects.userId, projects.id] }),
  index("stored_files_user_folder_idx").on(table.userId, table.folderId, table.createdAt),
  index("stored_files_user_project_idx").on(table.userId, table.projectId, table.createdAt),
]);

export const attendanceSummary = pgTable("attendance_summary", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull(),
  attended: integer("attended").notNull(),
  total: integer("total").notNull(),
  percentage: numeric("percentage", { precision: 5, scale: 2, mode: "number" }).notNull(),
  asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull(),
}, (table) => [
  check("attendance_summary_counts_ck", sql`${table.attended} >= 0 AND ${table.total} >= ${table.attended}`),
  check("attendance_summary_percentage_ck", sql`${table.percentage} BETWEEN 0 AND 100`),
  foreignKey({ name: "attendance_summary_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }).onDelete("cascade"),
  uniqueIndex("attendance_summary_user_subject_uq").on(table.userId, table.subjectId),
]);

export const attendanceLog = pgTable("attendance_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subjectId: uuid("subject_id").notNull(),
  classDate: date("class_date", { mode: "string" }).notNull(),
  slot: text("slot").notNull().default(""),
  status: text("status").notNull(),
}, (table) => [
  check("attendance_log_status_ck", sql`${table.status} IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'CANCELLED')`),
  foreignKey({ name: "attendance_log_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }).onDelete("cascade"),
  uniqueIndex("attendance_log_user_subject_date_slot_uq").on(table.userId, table.subjectId, table.classDate, table.slot),
]);

export const feedItems = pgTable("feed_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<FeedKind>().notNull(),
  source: text("source").$type<Exclude<EventSource, "MANUAL">>().notNull(),
  severity: text("severity").notNull().default("NORMAL"),
  subjectId: uuid("subject_id"),
  eventId: uuid("event_id"),
  title: text("title").notNull(),
  body: text("body"),
  icon: text("icon"),
  payload: jsonb("payload").notNull().default({}),
  actions: jsonb("actions").notNull().default([]),
  groupKey: text("group_key"),
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
}, (table) => [
  check("feed_items_kind_ck", sql`${table.kind} IN ('ATTENDANCE_CHANGED', 'ATTENDANCE_RISK', 'GRADE_POSTED', 'GRADE_CHANGED', 'NOTICE_POSTED', 'EXAM_SCHEDULED', 'EXAM_RESCHEDULED', 'EXAM_CANCELLED', 'EXAM_CLASH', 'ASSIGNMENT_POSTED', 'ASSIGNMENT_DUE_CHANGED', 'QUIZ_POSTED', 'QUIZ_WINDOW_CHANGED', 'SUBMISSION_STATUS_CHANGED', 'RESOURCE_ADDED', 'RESOURCE_UPDATED', 'FORUM_ANNOUNCEMENT', 'TIMETABLE_CHANGED', 'CLASS_CANCELLED', 'FEE_DUE', 'WA_TRACKED_MESSAGE', 'WA_KEYWORD_ALERT', 'WA_FILE_SHARED', 'EVENT_PROPOSED', 'REMINDER', 'DIGEST', 'CRUNCH_WARNING', 'INTEGRATION_ATTENTION', 'INITIAL_IMPORT')`),
  check("feed_items_source_ck", sql`${table.source} IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM')`),
  check("feed_items_severity_ck", sql`${table.severity} IN ('INFO', 'NORMAL', 'IMPORTANT', 'CRITICAL')`),
  foreignKey({ name: "feed_items_user_subject_fk", columns: [table.userId, table.subjectId], foreignColumns: [subjects.userId, subjects.id] }).onDelete("cascade"),
  foreignKey({ name: "feed_items_user_event_fk", columns: [table.userId, table.eventId], foreignColumns: [events.userId, events.id] }).onDelete("cascade"),
  uniqueIndex("feed_items_user_dedupe_uq").on(table.userId, table.dedupeKey),
  uniqueIndex("feed_items_user_id_uq").on(table.userId, table.id),
  index("feed_items_user_time_idx").on(table.userId, table.createdAt),
]);

export const notificationLog = pgTable("notification_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  feedItemId: uuid("feed_item_id"),
  reminderId: uuid("reminder_id"),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  check("notification_log_status_ck", sql`${table.status} IN ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED')`),
  foreignKey({ name: "notification_log_user_feed_fk", columns: [table.userId, table.feedItemId], foreignColumns: [feedItems.userId, feedItems.id] }).onDelete("cascade"),
  foreignKey({ name: "notification_log_user_reminder_fk", columns: [table.userId, table.reminderId], foreignColumns: [reminders.userId, reminders.id] }).onDelete("cascade"),
  uniqueIndex("notification_log_feed_channel_uq").on(table.feedItemId, table.channel),
  index("notification_log_user_idx").on(table.userId),
]);

export const authSchema = {
  user: users,
  account: accounts,
  session: sessions,
  verification: verifications,
};
