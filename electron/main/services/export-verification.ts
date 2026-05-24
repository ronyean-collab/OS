import type Database from "better-sqlite3";
import {
  assembleWorkspaceExportPackage,
  validateWorkspaceForExport,
} from "./workspace-export";
import { validateWorkspaceReplay } from "./replay-validator";
import { listSnapshots, validateSnapshotMetadata } from "./snapshot-service";
import {
  computeDeterministicReplayHash,
  fnv1a64Hex,
  messagesToReplayHashInput,
} from "./replay-hash";
import { getAppliedVersion } from "../database/migrations";

export type ExportVerificationSummary = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  replayHash: string;
  replayValidationOk: boolean;
  checksumPlaceholder: string;
  snapshotIssues: number;
  orphanMessageCount: number;
};

export function verifyWorkspaceExport(
  db: Database.Database,
  workspaceId: string,
): ExportVerificationSummary {
  const errors: string[] = [];
  const warnings: string[] = [];

  const base = validateWorkspaceForExport(db, workspaceId);
  errors.push(...base.errors);

  const replay = validateWorkspaceReplay(db, workspaceId);
  if (!replay.ok) {
    errors.push(...replay.errors);
  }
  warnings.push(...replay.warnings);

  const applied = getAppliedVersion(db);
  if (applied < 1) {
    errors.push("migration-not-initialized");
  }

  let snapshotIssues = 0;
  for (const snap of listSnapshots(db, workspaceId)) {
    const meta = validateSnapshotMetadata(snap);
    if (!meta.valid) {
      snapshotIssues++;
      warnings.push(`snapshot-metadata:${snap.id}`);
    }
  }

  let pkg;
  try {
    pkg = assembleWorkspaceExportPackage(db, workspaceId);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "export-build-failed");
    return {
      ok: false,
      errors,
      warnings,
      replayHash: "",
      replayValidationOk: false,
      checksumPlaceholder: "",
      snapshotIssues,
      orphanMessageCount: base.errors.filter((e) =>
        e.startsWith("orphaned-messages"),
      ).length,
    };
  }

  const replayHash = computeDeterministicReplayHash(
    messagesToReplayHashInput(pkg.messages),
  );
  const serialized = JSON.stringify(pkg);
  const checksumPlaceholder = `export-${fnv1a64Hex(serialized)}`;

  const seenMsg = new Set<string>();
  for (const m of pkg.messages) {
    if (seenMsg.has(m.id)) {
      errors.push(`export-duplicate-message:${m.id}`);
    }
    seenMsg.add(m.id);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    replayHash,
    replayValidationOk: replay.ok,
    checksumPlaceholder,
    snapshotIssues,
    orphanMessageCount: base.errors.filter((e) => e.startsWith("orphaned-messages"))
      .length,
  };
}
