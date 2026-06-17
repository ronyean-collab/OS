import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import {
  computeRuntimeHealthReport,
  type RuntimeHealthInput,
  type RuntimeHealthReport,
} from "../../../src/shared/runtime-maturity";
import { scoreContinuityReconstruction } from "./memory-state-service";
import { processMaintenanceQueue } from "./continuity-maintenance-scheduler";
import { validateMemorySavepoints } from "./savepoint-integrity-validator";

export type RuntimeHealthSnapshot = RuntimeHealthReport & {
  id: string;
  workspaceId: string;
  threadId: string;
  createdAt: string;
};

export function measureRuntimeHealth(input: RuntimeHealthInput): RuntimeHealthReport {
  return computeRuntimeHealthReport(input);
}

export function collectRuntimeHealthInput(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    query?: string;
    contextAssemblyMs?: number;
    reconstructionMs?: number;
    savepointMs?: number;
    compressionMs?: number;
    activePayloadBytes?: number;
    maxPayloadBytes?: number;
  },
): RuntimeHealthInput {
  const reconstruction = scoreContinuityReconstruction(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query: input.query ?? "continuity runtime health",
  });
  const maintenance = processMaintenanceQueue(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    isChatActive: false,
    cpuBusy: false,
  });
  const savepointIntegrity = validateMemorySavepoints(db, input.workspaceId);
  const payloadBytes = input.activePayloadBytes ?? 0;
  const maxPayload = input.maxPayloadBytes ?? 96_000;
  const memoryPressureRatio = maxPayload > 0 ? payloadBytes / maxPayload : 0;
  const continuityHealthScore = Number(
    Math.max(
      0,
      Math.min(
        1,
        reconstruction.continuityReconstructionHealth * 0.65 +
          (savepointIntegrity.ok ? 0.2 : 0.05) +
          maintenance.maintenanceHealthScore * 0.15,
      ),
    ).toFixed(3),
  );

  return {
    continuityHealthScore,
    continuityDriftScore: reconstruction.continuityDriftScore,
    continuityConfidenceScore: reconstruction.continuityConfidenceScore,
    maintenanceHealthScore: maintenance.maintenanceHealthScore,
    memoryPressureRatio: Number(Math.min(1, memoryPressureRatio).toFixed(3)),
    contextAssemblyMs: input.contextAssemblyMs ?? 0,
    reconstructionMs: input.reconstructionMs ?? 0,
    savepointMs: input.savepointMs ?? 0,
    compressionMs: input.compressionMs ?? 0,
  };
}

export function persistRuntimeHealthSnapshot(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    health: RuntimeHealthReport;
  },
): RuntimeHealthSnapshot {
  const id = uuid();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO runtime_health_snapshots (
      id, workspace_id, thread_id, runtime_health_score, recovery_confidence_score,
      memory_pressure, context_assembly_ms, reconstruction_ms, savepoint_ms, compression_ms,
      warnings_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.threadId,
    input.health.runtimeHealthScore,
    input.health.recoveryConfidenceScore,
    input.health.memoryPressure,
    input.health.timings.contextAssemblyMs,
    input.health.timings.reconstructionMs,
    input.health.timings.savepointMs,
    input.health.timings.compressionMs,
    JSON.stringify(input.health.warnings),
    createdAt,
  );
  return { id, workspaceId: input.workspaceId, threadId: input.threadId, createdAt, ...input.health };
}

export function getLatestRuntimeHealthSnapshot(
  db: Database.Database,
  workspaceId: string,
  threadId: string,
): RuntimeHealthSnapshot | null {
  const row = db
    .prepare(
      `SELECT id, workspace_id, thread_id, runtime_health_score, recovery_confidence_score,
              memory_pressure, context_assembly_ms, reconstruction_ms, savepoint_ms, compression_ms,
              warnings_json, created_at
       FROM runtime_health_snapshots
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(workspaceId, threadId) as
    | {
        id: string;
        workspace_id: string;
        thread_id: string;
        runtime_health_score: number;
        recovery_confidence_score: number;
        memory_pressure: string;
        context_assembly_ms: number;
        reconstruction_ms: number;
        savepoint_ms: number;
        compression_ms: number;
        warnings_json: string;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  let warnings: string[] = [];
  try {
    warnings = JSON.parse(row.warnings_json) as string[];
  } catch {
    warnings = [];
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    threadId: row.thread_id,
    createdAt: row.created_at,
    runtimeHealthScore: row.runtime_health_score,
    recoveryConfidenceScore: row.recovery_confidence_score,
    memoryPressure: row.memory_pressure as RuntimeHealthReport["memoryPressure"],
    warnings,
    timings: {
      contextAssemblyMs: row.context_assembly_ms,
      reconstructionMs: row.reconstruction_ms,
      savepointMs: row.savepoint_ms,
      compressionMs: row.compression_ms,
    },
  };
}
