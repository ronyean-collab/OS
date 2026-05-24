import type Database from "better-sqlite3";
import { getAppliedVersion } from "../database/migrations";
import { validateWorkspaceReplay } from "./replay-validator";
import { validateAllThreadIds } from "./thread-reconstruction";
import { listSnapshots, validateSnapshotMetadata } from "./snapshot-service";
import { verifyWorkspaceExport } from "./export-verification";
import { getAutosaveStatus } from "./autosave-scheduler";
import { getLastSnapshotTime } from "./snapshot-service";
import { getReliabilityState } from "../database/connection";
import {
  computeDeterministicReplayHash,
  messagesToReplayHashInput,
  validateReplayHashMatch,
} from "./replay-hash";
import { reconstructThreadMessages } from "./thread-reconstruction";

export type WorkspaceHealthReport = {
  status: "healthy" | "attention" | "unhealthy";
  replayIntegrityOk: boolean;
  replayHash: string | null;
  replayHashStatus: "verified" | "unknown" | "mismatch";
  lastSnapshotAt: string | null;
  exportValidationOk: boolean | null;
  exportWarnings: string[];
  interruptedResponsesRecovered: number;
  integrityWarnings: string[];
  lastRecoverySnapshotPath: string | null;
  autosaveCooldownActive: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
};

function readMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function scanWorkspaceHealth(
  db: Database.Database,
  workspaceId: string,
): WorkspaceHealthReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const reliability = getReliabilityState();

  const replay = validateWorkspaceReplay(db, workspaceId);
  if (!replay.ok) {
    errors.push(...replay.errors);
  }
  warnings.push(...replay.warnings);

  const orphans = validateAllThreadIds(db).filter((o) =>
    o.startsWith("orphaned-message"),
  );
  for (const o of orphans) {
    warnings.push(o);
  }

  let snapshotMetaIssues = 0;
  let latestReplayHash: string | null = null;
  const snaps = listSnapshots(db, workspaceId);
  for (const snap of snaps) {
    const meta = validateSnapshotMetadata(snap);
    if (!meta.valid) snapshotMetaIssues++;
    if (snap.replayHash) latestReplayHash = snap.replayHash;
  }
  if (snapshotMetaIssues > 0) {
    warnings.push(`snapshot-metadata-issues:${snapshotMetaIssues}`);
  }

  const allMessages = [];
  const threads = db
    .prepare("SELECT id FROM threads WHERE workspace_id = ?")
    .all(workspaceId) as Array<{ id: string }>;
  for (const { id } of threads) {
    allMessages.push(...reconstructThreadMessages(db, id).messages);
  }
  const currentReplayHash = computeDeterministicReplayHash(
    messagesToReplayHashInput(allMessages),
  );
  const hashCheck = validateReplayHashMatch(latestReplayHash, currentReplayHash);

  let exportValidationOk: boolean | null = null;
  let exportWarnings: string[] = [];
  try {
    const exportVerify = verifyWorkspaceExport(db, workspaceId);
    exportValidationOk = exportVerify.ok;
    exportWarnings = [...exportVerify.warnings, ...exportVerify.errors];
    if (!exportVerify.ok) {
      errors.push(...exportVerify.errors);
    }
  } catch (err) {
    exportValidationOk = false;
    errors.push(err instanceof Error ? err.message : "export-verify-failed");
  }

  const applied = getAppliedVersion(db);
  if (applied < 1) {
    errors.push("migration-inconsistent");
    recommendations.push("Run database migrations before trusting continuity.");
  }

  const autosave = getAutosaveStatus(db);

  if (errors.length > 0) {
    recommendations.push("Export workspace before any manual repair.");
  } else if (warnings.length > 0) {
    recommendations.push("Review warnings; continuity is readable.");
  }

  let status: WorkspaceHealthReport["status"] = "healthy";
  if (errors.length > 0) status = "unhealthy";
  else if (warnings.length > 0 || !replay.ok) status = "attention";

  return {
    status,
    replayIntegrityOk: replay.ok,
    replayHash: currentReplayHash,
    replayHashStatus: latestReplayHash
      ? hashCheck.matches
        ? "verified"
        : "mismatch"
      : "unknown",
    lastSnapshotAt: getLastSnapshotTime(db, workspaceId),
    exportValidationOk,
    exportWarnings,
    interruptedResponsesRecovered: reliability.interruptedResponsesRecovered,
    integrityWarnings: warnings.filter((w) => w.includes("integrity")),
    lastRecoverySnapshotPath: readMeta(db, "last_migration_snapshot"),
    autosaveCooldownActive: autosave.cooldownActive,
    errors,
    warnings,
    recommendations,
  };
}
