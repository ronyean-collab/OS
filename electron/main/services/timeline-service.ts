import type Database from "better-sqlite3";
import type { TimelineEvent, TimelineEventType } from "../../../src/shared/types";

const HUMAN_LABELS: Record<TimelineEventType, string> = {
  workspace_created: "Workspace created",
  thread_created: "Thread created",
  thread_renamed: "Thread renamed",
  thread_reordered: "Thread reordered",
  thread_archived: "Thread archived",
  thread_unarchived: "Thread unarchived",
  thread_deleted: "Thread deleted",
  thread_restored: "Thread restored",
  message_added: "Message added",
  provider_configured: "Provider configured",
  snapshot_created: "Snapshot saved",
  assistant_response_started: "Assistant responding",
  assistant_response_completed: "Assistant response completed",
  assistant_response_cancelled: "Response cancelled",
  assistant_response_failed: "Response failed",
  assistant_response_interrupted: "Interrupted response recovered",
  recovery_mode_entered: "Recovery mode entered",
  recovery_snapshot_created: "Recovery snapshot saved",
  sqlite_integrity_failed: "Database check needed",
  sqlite_integrity_restored: "Continuity restored",
  snapshot_restore_started: "Restore started",
  snapshot_restore_completed: "Restore completed",
  snapshot_restore_failed: "Restore failed",
  workspace_import_started: "Import started",
  workspace_import_completed: "Import completed",
  workspace_import_failed: "Import failed",
};

export type TimelineGroup = {
  label: string;
  events: TimelineEventView[];
};

export type TimelineEventView = TimelineEvent & {
  humanLabel: string;
  relativeTime: string;
};

function mapRow(row: Record<string, unknown>): TimelineEvent {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    type: row.event_type as TimelineEventType,
    title: String(row.title),
    description: String(row.description),
    source: (row.source != null ? String(row.source) : "system") as TimelineEvent["source"],
    createdAt: String(row.created_at),
    appVersion: row.app_version != null ? String(row.app_version) : null,
    schemaVersion:
      row.schema_version != null ? Number(row.schema_version) : null,
    buildNumber: row.build_number != null ? String(row.build_number) : null,
  };
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Unknown time";
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

export function toTimelineEventView(
  event: TimelineEvent,
  now = Date.now(),
): TimelineEventView {
  return {
    ...event,
    humanLabel: HUMAN_LABELS[event.type] ?? event.title,
    relativeTime: formatRelativeTime(event.createdAt, now),
  };
}

export function listTimelineEvents(
  db: Database.Database,
  workspaceId: string,
  limit = 80,
): TimelineEvent[] {
  const rows = db
    .prepare(
      `SELECT * FROM timeline_events WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(workspaceId, limit) as Record<string, unknown>[];
  return rows.map(mapRow);
}

export function groupTimelineEvents(events: TimelineEvent[]): TimelineGroup[] {
  const views = events.map((e) => toTimelineEventView(e));
  const groups = new Map<string, TimelineEventView[]>();

  for (const event of views) {
    const day = new Date(event.createdAt).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    const key = Number.isNaN(new Date(event.createdAt).getTime()) ? "Earlier" : day;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }

  return Array.from(groups.entries()).map(([label, groupEvents]) => ({
    label,
    events: groupEvents,
  }));
}
