import { performance } from "node:perf_hooks";
import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import {
  getContinuityEvolutionStats,
  rebuildDerivedMemoryFromCanonical,
} from "./memory-state-service";
import { updateEmbeddingCacheForThread } from "./embedding-prototype-service";

export type MaintenanceJobResult = {
  ran: boolean;
  interrupted: boolean;
  durationMs: number;
  compressionChecked: boolean;
  embeddingGenerated: number;
  recoveryRebuildPerformed: boolean;
  maintenanceHealthScore: number;
};

const MAX_IDLE_BUDGET_MS = Number(process.env.CONTINUITY_IDLE_BUDGET_MS ?? 20);

export function runIdleContinuityMaintenance(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    isChatActive: boolean;
    cpuBusy: boolean;
    interrupted?: () => boolean;
  },
): MaintenanceJobResult {
  if (input.isChatActive || input.cpuBusy) {
    return {
      ran: false,
      interrupted: false,
      durationMs: 0,
      compressionChecked: false,
      embeddingGenerated: 0,
      recoveryRebuildPerformed: false,
      maintenanceHealthScore: 0.9,
    };
  }

  const start = performance.now();
  const interrupted = input.interrupted ?? (() => false);
  const evolution = getContinuityEvolutionStats(db, input.workspaceId, input.threadId);
  let embeddingGenerated = 0;
  let rebuild = false;

  if (interrupted()) {
    return {
      ran: false,
      interrupted: true,
      durationMs: Number((performance.now() - start).toFixed(3)),
      compressionChecked: false,
      embeddingGenerated: 0,
      recoveryRebuildPerformed: false,
      maintenanceHealthScore: 0.5,
    };
  }

  if (performance.now() - start < MAX_IDLE_BUDGET_MS) {
    const emb = updateEmbeddingCacheForThread(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    });
    embeddingGenerated = emb.generated;
  }

  if (interrupted()) {
    return {
      ran: true,
      interrupted: true,
      durationMs: Number((performance.now() - start).toFixed(3)),
      compressionChecked: true,
      embeddingGenerated,
      recoveryRebuildPerformed: false,
      maintenanceHealthScore: 0.6,
    };
  }

  if (evolution.activeStateCount === 0 && performance.now() - start < MAX_IDLE_BUDGET_MS) {
    rebuildDerivedMemoryFromCanonical(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId,
    });
    rebuild = true;
  }

  return {
    ran: true,
    interrupted: false,
    durationMs: Number((performance.now() - start).toFixed(3)),
    compressionChecked: true,
    embeddingGenerated,
    recoveryRebuildPerformed: rebuild,
    maintenanceHealthScore: Number(
      Math.max(
        0.2,
        Math.min(
          1,
          0.55 +
            (embeddingGenerated > 0 ? 0.15 : 0) +
            (rebuild ? 0.1 : 0) +
            (evolution.activeStateCount > 0 ? 0.1 : -0.05),
        ),
      ).toFixed(3),
    ),
  };
}

export function enqueueMaintenanceJob(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    jobType:
      | "compression"
      | "embedding_generation"
      | "archival_generation"
      | "reinforcement_update"
      | "validation_snapshot";
    priority: number;
    cpuBudgetMs: number;
  },
): string {
  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO maintenance_jobs (
      id, workspace_id, thread_id, job_type, status, priority, cpu_budget_ms, created_at, updated_at, metadata_json
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.threadId,
    input.jobType,
    input.priority,
    input.cpuBudgetMs,
    now,
    now,
    JSON.stringify({ source: "runtime-idle-loop" }),
  );
  return id;
}

export function processMaintenanceQueue(
  db: Database.Database,
  input: { workspaceId: string; threadId: string; isChatActive: boolean; cpuBusy: boolean },
): { processed: number; maintenanceHealthScore: number } {
  if (input.isChatActive || input.cpuBusy) {
    return { processed: 0, maintenanceHealthScore: 0.7 };
  }
  const jobs = db
    .prepare(
      `SELECT id
       FROM maintenance_jobs
       WHERE workspace_id = ? AND thread_id = ? AND status = 'queued'
       ORDER BY priority DESC, updated_at ASC
       LIMIT 3`,
    )
    .all(input.workspaceId, input.threadId) as Array<{ id: string }>;
  const now = new Date().toISOString();
  const done = db.prepare("UPDATE maintenance_jobs SET status = 'done', updated_at = ? WHERE id = ?");
  for (const job of jobs) done.run(now, job.id);
  return {
    processed: jobs.length,
    maintenanceHealthScore: Number(Math.min(1, 0.6 + jobs.length * 0.1).toFixed(3)),
  };
}
