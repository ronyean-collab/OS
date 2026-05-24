import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import {
  EXPORT_FORMAT_VERSION,
  type WorkspaceExportPackage,
} from "./workspace-export";
import {
  normalizeWorkspaceExportPackage,
  unwrapWorkspaceExportPayload,
} from "./export-manifest";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";
import {
  validateImportPackageStructure,
  type CheckpointValidationReport,
} from "./checkpoint-validator";
import { appendAuditEvent } from "./reliability-audit";
import type {
  Message,
  MessageStatus,
  Thread,
  TimelineEvent,
  Workspace,
} from "../../../src/shared/types";
import { getVersionStamp } from "../../../src/shared/app-version";
import { setMeta } from "./workspace-service";

const IMPORT_DEV_LOGGING =
  process.env.CONTINUITY_IMPORT_DEBUG === "1" ||
  process.env.NODE_ENV === "development";

function logImportStep(step: string, detail?: string): void {
  if (IMPORT_DEV_LOGGING) {
    console.info(`[continuity-import] ${step}${detail ? `: ${detail}` : ""}`);
  }
}

/** Wraps a transactional import step; labels failures for debugging. */
function runImportStep(step: string, fn: () => void): void {
  logImportStep(step, "start");
  try {
    fn();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logImportStep(step, `failed — ${detail}`);
    throw new Error(`${step}: ${detail}`);
  }
  logImportStep(step, "ok");
}

function resolveRemappedThreadId(
  originalThreadId: string | null | undefined,
  threadIdMap: Record<string, string>,
  context: string,
): string | null {
  if (!originalThreadId) return null;
  const mapped = threadIdMap[originalThreadId];
  if (!mapped) {
    throw new Error(
      `${context} references unknown thread ${originalThreadId} — import aborted.`,
    );
  }
  return mapped;
}

export type ImportPreview = {
  valid: boolean;
  workspaceName: string;
  threadCount: number;
  messageCount: number;
  snapshotCount: number;
  exportVersion: number;
  exportedAt: string;
  schemaVersion: number;
  appVersion: string;
  warnings: string[];
  errors: string[];
  /** Set when preview originates from an encrypted backup file. */
  encrypted?: boolean;
};

export type ImportOriginMetadata = {
  originalWorkspaceId: string;
  exportedAt: string;
  importedAt: string;
  threadIdMap: Record<string, string>;
  messageIdMap: Record<string, string>;
  timelineEventIdMap: Record<string, string>;
};

export type ImportExecutionResult = {
  ok: boolean;
  message: string;
  workspaceId?: string;
  workspace?: Workspace;
  /** Machine-readable validation codes for tests/diagnostics (no secrets). */
  validationErrors?: string[];
  validationWarnings?: string[];
};

export function parseImportJson(json: string): unknown {
  return JSON.parse(json) as unknown;
}

function normalizeImportPreviewInput(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function buildImportPreview(raw: unknown): ImportPreview {
  const normalized = normalizeImportPreviewInput(raw);
  const validation = validateImportPackageStructure(normalized);
  const pkg =
    unwrapWorkspaceExportPayload(normalized) ?? ({} as Partial<WorkspaceExportPackage>);

  const workspaceName =
    pkg.workspace?.name != null ? String(pkg.workspace.name) : "Unknown workspace";

  return {
    valid: validation.valid,
    workspaceName,
    threadCount: Array.isArray(pkg.threads) ? pkg.threads.length : 0,
    messageCount: Array.isArray(pkg.messages) ? pkg.messages.length : 0,
    snapshotCount: Array.isArray(pkg.snapshots) ? pkg.snapshots.length : 0,
    exportVersion: Number(pkg.exportFormatVersion ?? 0),
    exportedAt: String(pkg.exportedAt ?? "Unknown"),
    schemaVersion: Number(pkg.schemaVersion ?? 0),
    appVersion: String(pkg.appVersion ?? "Unknown"),
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

function normalizePackage(raw: unknown): WorkspaceExportPackage {
  const validation = validateImportPackageStructure(raw);
  if (!validation.valid) {
    throw new Error(`Invalid import package: ${validation.errors.join(", ")}`);
  }
  const pkg = unwrapWorkspaceExportPayload(raw);
  if (!pkg) {
    throw new Error("Invalid import package: unrecognized backup structure.");
  }
  return normalizeWorkspaceExportPackage(pkg);
}

function normalizeStatus(status: unknown): MessageStatus {
  const s = String(status ?? "completed");
  if (
    s === "streaming" ||
    s === "completed" ||
    s === "interrupted" ||
    s === "cancelled" ||
    s === "failed"
  ) {
    return s;
  }
  return "completed";
}

function insertImportedTimelineEvents(
  db: Database.Database,
  events: TimelineEvent[],
  newWorkspaceId: string,
  threadIdMap: Record<string, string>,
  timelineEventIdMap: Record<string, string>,
): void {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const version = getVersionStamp();

  for (const evt of sorted) {
    const newEventId = uuid();
    timelineEventIdMap[evt.id] = newEventId;
    const threadId = resolveRemappedThreadId(
      evt.threadId,
      threadIdMap,
      `Timeline event ${evt.id}`,
    );

    db.prepare(
      `INSERT INTO timeline_events (id, workspace_id, thread_id, event_type, title, description, created_at, source, app_version, schema_version, build_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newEventId,
      newWorkspaceId,
      threadId,
      evt.type,
      evt.title,
      evt.description,
      evt.createdAt,
      evt.source ?? "import",
      evt.appVersion ?? version.appVersion,
      evt.schemaVersion ?? version.schemaVersion,
      evt.buildNumber ?? version.buildNumber,
    );
  }
}

export function executeWorkspaceImport(
  db: Database.Database,
  json: string,
): ImportExecutionResult {
  let pkg: WorkspaceExportPackage;
  try {
    pkg = normalizePackage(parseImportJson(json));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid import file";
    appendAuditEvent({
      type: "import_failed",
      message: msg,
      details: { phase: "parse" },
    });
    return { ok: false, message: msg };
  }

  if (
    pkg.exportFormatVersion !== EXPORT_FORMAT_VERSION &&
    pkg.exportFormatVersion !== 1
  ) {
    const msg = "Unsupported export format version.";
    appendAuditEvent({ type: "import_failed", message: msg });
    return { ok: false, message: msg };
  }

  const newWorkspaceId = uuid();
  const importedAt = new Date().toISOString();
  const threadIdMap: Record<string, string> = {};
  const messageIdMap: Record<string, string> = {};
  const timelineEventIdMap: Record<string, string> = {};

  appendAuditEvent({
    type: "import_attempt",
    message: `Import started for ${pkg.workspace.name}`,
    details: { originalWorkspaceId: pkg.workspace.id },
  });

  try {
    const workspace = runInTransaction(db, () => {
      const wsNow = importedAt;
      const importName = `${pkg.workspace.name} (imported)`;
      const sortedThreads = [...pkg.threads].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const sortedMessages = [...pkg.messages].sort((a, b) => {
        const t = a.createdAt.localeCompare(b.createdAt);
        return t !== 0 ? t : a.id.localeCompare(b.id);
      });
      const timelineEvents = pkg.timelineEvents;
      const snapshots = pkg.snapshots;

      runImportStep("workspace insert", () => {
        db.prepare(
          `INSERT INTO workspaces (id, user_id, name, created_at, updated_at, last_opened_at)
           VALUES (?, NULL, ?, ?, ?, ?)`,
        ).run(
          newWorkspaceId,
          importName,
          pkg.workspace.createdAt,
          pkg.workspace.updatedAt,
          wsNow,
        );
      });

      runImportStep("import audit timeline (started)", () => {
        appendTimelineEvent(db, {
          workspaceId: newWorkspaceId,
          type: "workspace_import_started",
          title: "Import started",
          description: `Importing “${pkg.workspace.name}”.`,
          source: "import",
        });
      });

      runImportStep("threads insert", () => {
        for (const thread of sortedThreads) {
          const newThreadId = uuid();
          threadIdMap[thread.id] = newThreadId;
          db.prepare(
            `INSERT INTO threads (id, workspace_id, title, created_at, updated_at, sort_order, archived_at, deleted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            newThreadId,
            newWorkspaceId,
            thread.title,
            thread.createdAt,
            thread.updatedAt,
            thread.sortOrder ?? null,
            thread.archivedAt ?? null,
            thread.deletedAt ?? null,
          );
        }
      });

      runImportStep("messages insert", () => {
        for (const msg of sortedMessages) {
          const newThreadId = resolveRemappedThreadId(
            msg.threadId,
            threadIdMap,
            `Message ${msg.id}`,
          );
          if (!newThreadId) {
            throw new Error(`Message ${msg.id} is missing thread_id — import aborted.`);
          }
          const newMessageId = uuid();
          messageIdMap[msg.id] = newMessageId;

          db.prepare(
            `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at, message_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            newMessageId,
            newThreadId,
            msg.role,
            msg.content,
            msg.provider,
            msg.model,
            msg.rawProviderPayload,
            msg.createdAt,
            normalizeStatus(msg.messageStatus),
          );
        }
      });

      runImportStep("timeline_events insert", () => {
        insertImportedTimelineEvents(
          db,
          timelineEvents,
          newWorkspaceId,
          threadIdMap,
          timelineEventIdMap,
        );
      });

      runImportStep("snapshots insert", () => {
        for (const snap of snapshots) {
          const snapId = uuid();
          const remappedThreadId = resolveRemappedThreadId(
            snap.threadId,
            threadIdMap,
            `Snapshot ${snap.id}`,
          );
          db.prepare(
            `INSERT INTO snapshots (id, workspace_id, thread_id, label, payload_json, created_at, snapshot_reason, app_version, schema_version)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            snapId,
            newWorkspaceId,
            remappedThreadId,
            snap.label,
            JSON.stringify({
              imported: true,
              originalSnapshotId: snap.id,
              originalPayload: snap.payloadJson,
              importedAt,
            }),
            snap.createdAt,
            snap.reason ?? "imported",
            snap.appVersion ?? getVersionStamp().appVersion,
            snap.schemaVersion ?? getVersionStamp().schemaVersion,
          );
        }
      });

      runImportStep("import metadata", () => {
        const origin: ImportOriginMetadata = {
          originalWorkspaceId: pkg.workspace.id,
          exportedAt: pkg.exportedAt,
          importedAt,
          threadIdMap,
          messageIdMap,
          timelineEventIdMap,
        };
        setMeta(db, `workspace_import_origin_${newWorkspaceId}`, JSON.stringify(origin));
      });

      runImportStep("import audit timeline (completed)", () => {
        appendTimelineEvent(db, {
          workspaceId: newWorkspaceId,
          type: "workspace_import_completed",
          title: "Import completed",
          description: `Imported ${sortedThreads.length} threads, ${sortedMessages.length} messages, ${timelineEvents.length} timeline events, and ${snapshots.length} snapshots.`,
          source: "import",
        });
      });

      recordSuccessfulPersistence(db);

      return {
        id: newWorkspaceId,
        name: importName,
        createdAt: pkg.workspace.createdAt,
        updatedAt: pkg.workspace.updatedAt,
        lastOpenedAt: wsNow,
      } satisfies Workspace;
    });

    appendAuditEvent({
      type: "import_completed",
      workspaceId: workspace.id,
      message: "Workspace import completed",
      details: { originalWorkspaceId: pkg.workspace.id },
    });

    return {
      ok: true,
      message: "Workspace imported successfully.",
      workspaceId: workspace.id,
      workspace,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    appendAuditEvent({
      type: "import_failed",
      message: msg,
      details: { originalWorkspaceId: pkg.workspace.id },
    });
    return { ok: false, message: msg };
  }
}

export function validateImportJson(json: string): CheckpointValidationReport {
  try {
    return validateImportPackageStructure(parseImportJson(json));
  } catch {
    return {
      valid: false,
      warnings: [],
      errors: ["invalid-json"],
      repairRecommendations: ["File must be valid JSON."],
    };
  }
}
