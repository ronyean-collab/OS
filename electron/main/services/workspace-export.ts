import type Database from "better-sqlite3";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { reconstructThreadMessages } from "./thread-reconstruction";
import { listTimelineEvents } from "./timeline-service";
import { listSnapshots, type SnapshotRecord } from "./snapshot-service";
import type { ExportVerificationSummary } from "./export-verification";
import { verifyWorkspaceExport } from "./export-verification";
import { countOrphanedMessages } from "./orphan-repair";
import {
  buildWorkspaceBackupBundle,
  normalizeWorkspaceExportPackage,
  serializeBackupBundle,
  unwrapWorkspaceExportPayload,
  type WorkspaceBackupBundle,
} from "./export-manifest";
import type { Message, Thread, TimelineEvent, Workspace } from "../../../src/shared/types";
import { mapThreadRow } from "./thread-management-service";

export const EXPORT_FORMAT_VERSION = 2;

export type WorkspaceExportPackage = {
  exportFormatVersion: number;
  schemaVersion: number;
  appVersion: string;
  buildNumber: string;
  releaseChannel: string;
  buildDate: string;
  exportedAt: string;
  workspace: Workspace;
  threads: Thread[];
  messages: Message[];
  timelineEvents: TimelineEvent[];
  snapshots: SnapshotRecord[];
  verification: ExportVerificationSummary;
};

export type ExportValidationResult = {
  ok: boolean;
  errors: string[];
};

function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastOpenedAt: String(row.last_opened_at),
    continuitySummary:
      row.continuity_summary != null && String(row.continuity_summary).length > 0
        ? String(row.continuity_summary)
        : null,
  };
}

function mapThread(row: Record<string, unknown>): Thread {
  return mapThreadRow(row);
}

export function validateWorkspaceForExport(
  db: Database.Database,
  workspaceId: string,
): ExportValidationResult {
  const errors: string[] = [];
  const ws = db
    .prepare("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string } | undefined;
  if (!ws) {
    errors.push("workspace-not-found");
    return { ok: false, errors };
  }

  const orphanCount = countOrphanedMessages(db);
  if (orphanCount > 0) {
    errors.push(`orphaned-messages:${orphanCount}`);
  }

  return { ok: errors.length === 0, errors };
}

/** Assembles export payload without pre-flight verification (used by verify + export). */
export function assembleWorkspaceExportPackage(
  db: Database.Database,
  workspaceId: string,
): Omit<WorkspaceExportPackage, "verification"> {
  const validation = validateWorkspaceForExport(db, workspaceId);
  if (!validation.ok) {
    throw new Error(
      `Export validation failed: ${validation.errors.join(", ")}`,
    );
  }

  const wsRow = db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(workspaceId) as Record<string, unknown>;

  const threadRows = db
    .prepare(
      `SELECT * FROM threads WHERE workspace_id = ?
       ORDER BY created_at ASC, id ASC`,
    )
    .all(workspaceId) as Record<string, unknown>[];

  const threads = threadRows.map(mapThread);

  const messages: Message[] = [];
  for (const thread of threads) {
    const report = reconstructThreadMessages(db, thread.id);
    messages.push(...report.messages);
  }

  messages.sort((a, b) => {
    const t = a.createdAt.localeCompare(b.createdAt);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  const timelineEvents = listTimelineEvents(db, workspaceId, 500).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const snapshots = listSnapshots(db, workspaceId).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const version = getAppVersionInfo();
  return {
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: version.schemaVersion,
    appVersion: version.appVersion,
    buildNumber: version.buildNumber,
    releaseChannel: version.releaseChannel,
    buildDate: version.buildDate,
    exportedAt: new Date().toISOString(),
    workspace: mapWorkspace(wsRow),
    threads,
    messages,
    timelineEvents,
    snapshots,
  };
}

export function buildWorkspaceExportPackage(
  db: Database.Database,
  workspaceId: string,
): WorkspaceExportPackage {
  const verification = verifyWorkspaceExport(db, workspaceId);
  if (!verification.ok) {
    throw new Error(
      `Export validation failed: ${verification.errors.join(", ")}`,
    );
  }
  const body = assembleWorkspaceExportPackage(db, workspaceId);
  return normalizeWorkspaceExportPackage({ ...body, verification });
}

/** Parse serialized export (flat v1/v2 or backup bundle wrapper) into a normalized package. */
export function parseExportPackageJson(json: string): WorkspaceExportPackage {
  const raw = JSON.parse(json) as unknown;
  const pkg = unwrapWorkspaceExportPayload(raw);
  if (!pkg) {
    throw new Error("Unrecognized export package structure.");
  }
  if (!raw || typeof raw !== "object") return pkg;
  const root = raw as Record<string, unknown>;
  const manifest =
    root.manifest && typeof root.manifest === "object"
      ? (root.manifest as Record<string, unknown>)
      : null;
  return {
    ...pkg,
    buildNumber:
      pkg.buildNumber ||
      (manifest?.buildNumber != null ? String(manifest.buildNumber) : pkg.buildNumber),
    buildDate:
      pkg.buildDate ||
      (manifest?.buildDate != null ? String(manifest.buildDate) : pkg.buildDate),
    appVersion:
      pkg.appVersion ||
      (manifest?.appVersion != null ? String(manifest.appVersion) : pkg.appVersion),
    schemaVersion:
      typeof pkg.schemaVersion === "number" && pkg.schemaVersion > 0
        ? pkg.schemaVersion
        : Number(manifest?.schemaVersion ?? pkg.schemaVersion ?? 0),
  };
}

export function buildVerifiedBackupBundle(
  db: Database.Database,
  workspaceId: string,
): WorkspaceBackupBundle {
  const pkg = buildWorkspaceExportPackage(db, workspaceId);
  return buildWorkspaceBackupBundle(pkg);
}

export function serializeExportPackage(
  pkg: WorkspaceExportPackage,
): string {
  return serializeBackupBundle(buildWorkspaceBackupBundle(pkg));
}

export function serializeBackupBundleExport(
  bundle: WorkspaceBackupBundle,
): string {
  return serializeBackupBundle(bundle);
}
