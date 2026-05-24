import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { TimelineEventType } from "../../../src/shared/types";
import { getVersionStamp } from "../../../src/shared/app-version";
import { maybeScheduleAutosave } from "./autosave-scheduler";

export type TimelineEventSource = "user" | "system" | "import" | "recovery";

const ALLOWED_TYPES = new Set<string>([
  "workspace_created",
  "thread_created",
  "thread_renamed",
  "thread_reordered",
  "thread_archived",
  "thread_unarchived",
  "thread_deleted",
  "thread_restored",
  "message_added",
  "provider_configured",
  "snapshot_created",
  "assistant_response_started",
  "assistant_response_completed",
  "assistant_response_cancelled",
  "assistant_response_failed",
  "assistant_response_interrupted",
  "recovery_mode_entered",
  "recovery_snapshot_created",
  "sqlite_integrity_failed",
  "sqlite_integrity_restored",
  "snapshot_restore_started",
  "snapshot_restore_completed",
  "snapshot_restore_failed",
  "workspace_import_started",
  "workspace_import_completed",
  "workspace_import_failed",
  "continuity_summary_updated",
]);

const ALLOWED_SOURCES = new Set<string>(["user", "system", "import", "recovery"]);

export type ValidatedTimelineInput = {
  workspaceId: string;
  threadId?: string | null;
  type: TimelineEventType;
  title: string;
  description: string;
  source?: TimelineEventSource;
};

export function validateTimelineEventInput(
  input: ValidatedTimelineInput,
): ValidatedTimelineInput | null {
  const workspaceId = input.workspaceId?.trim();
  const type = String(input.type).trim();
  const title = input.title?.trim();
  const description = typeof input.description === "string" ? input.description : "";
  const source = (input.source ?? "system").trim();

  if (!workspaceId || !type || !title) return null;
  if (!ALLOWED_TYPES.has(type)) return null;
  if (!ALLOWED_SOURCES.has(source)) return null;

  return {
    workspaceId,
    threadId: input.threadId ?? null,
    type: type as TimelineEventType,
    title,
    description,
    source: source as TimelineEventSource,
  };
}

export function appendTimelineEventValidated(
  db: Database.Database,
  input: ValidatedTimelineInput,
): string | null {
  const validated = validateTimelineEventInput(input);
  if (!validated) return null;

  const id = uuid();
  const createdAt = new Date().toISOString();
  const version = getVersionStamp();

  db.prepare(
    `INSERT INTO timeline_events (id, workspace_id, thread_id, event_type, title, description, created_at, source, app_version, schema_version, build_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    validated.workspaceId,
    validated.threadId ?? null,
    validated.type,
    validated.title,
    validated.description,
    createdAt,
    validated.source ?? "system",
    version.appVersion,
    version.schemaVersion,
    version.buildNumber,
  );

  maybeScheduleAutosave(db, {
    workspaceId: validated.workspaceId,
    threadId: validated.threadId,
    eventType: validated.type,
    reason: validated.title,
  });

  return id;
}

export function hasTimelineEventForMessage(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
  messageId: string,
  eventType: TimelineEventType,
): boolean {
  const pattern = `%${messageId}%`;
  const row = db
    .prepare(
      `SELECT id FROM timeline_events
       WHERE workspace_id = ? AND thread_id = ? AND event_type = ? AND description LIKE ?
       LIMIT 1`,
    )
    .get(workspaceId, threadId, eventType, pattern) as { id: string } | undefined;
  return Boolean(row);
}
