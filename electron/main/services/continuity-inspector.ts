import type Database from "better-sqlite3";
import { assembleProviderContext } from "./context-assembly";
import { buildAssistantIdentityPromptForProfile } from "./assistant-identity-service";
import { getAssistantProfile } from "./assistant-profile-service";
import { listMessagesPage } from "./message-service";
import {
  getCompressionCandidates,
  getContinuityEvolutionStats,
  getMemoryState,
  listRelevantMemoryFragments,
  scoreContinuityReconstruction,
} from "./memory-state-service";
import { semanticRetrieveByEmbedding } from "./embedding-prototype-service";
import { processMaintenanceQueue } from "./continuity-maintenance-scheduler";
import { validateMemorySavepoints } from "./savepoint-integrity-validator";
import {
  collectRuntimeHealthInput,
  getLatestRuntimeHealthSnapshot,
  measureRuntimeHealth,
} from "./runtime-health-service";
import { getWorkspaceById } from "./workspace-service";
import {
  buildImportedStateContextBlock,
  getLatestAppliedContinuityImport,
} from "./continuity-import-file";

export type ContinuityInspectorReport = {
  continuityState: ReturnType<typeof getMemoryState>;
  activeFragments: ReturnType<typeof listRelevantMemoryFragments>;
  savepoints: Array<{
    id: string;
    activeThreadId: string;
    reason: string;
    createdAt: string;
  }>;
  userProfileMemory: Array<{
    preferenceKey: string;
    preferenceValue: string;
    confidenceScore: number;
    updatedAt: string;
  }>;
  retrievedContext: string[];
  compressionCandidates: ReturnType<typeof getCompressionCandidates>;
  contextAssemblyPreview: string;
  runtimeContextSizeEstimate: number;
  recoveryCheckpoints: Array<{
    id: string;
    createdAt: string;
    reason: string | null;
  }>;
  savepointIntegrity: ReturnType<typeof validateMemorySavepoints>;
  continuityEvolutionGraph: Array<{ layer: string; count: number }>;
  compressionLayers: {
    shortTermSummary: string | null;
    mediumTermSummary: string | null;
    longTermOperationalIdentitySummary: string | null;
  };
  reconstructionSources: string[];
  continuityConfidence: number;
  continuityDrift: number;
  reinforcementMetrics: {
    avgReinforcement: number;
    avgStabilityScore: number;
  };
  decayMetrics: {
    avgDecayRate: number;
  };
  retrievalRanking: Array<{ fragmentId: string; scoreHint: number }>;
  activeContinuityPayloadSize: number;
  driftTimeline: Array<{ at: string; drift: number; health: number }>;
  embeddingGenerationStatus: {
    enabled: boolean;
    cachedEmbeddings: number;
    semanticMatches: Array<{ fragmentId: string; score: number }>;
  };
  continuityHealthScore: number;
  calibrationMetrics: {
    continuityFidelityScore: number;
    operationalConsistencyScore: number;
    emotionalContinuityScore: number;
  };
  maintenanceQueueStatus: {
    queuedJobs: number;
    processedThisTick: number;
    maintenanceHealthScore: number;
  };
  retrievalSaturationIndicators: {
    totalReturned: number;
    categorySpread: number;
  };
  lowConfidenceEventTimeline: Array<{ at: string; drift: number; health: number }>;
  runtimeMemoryPressure: {
    activePayloadBytes: number;
    compressedBundles: number;
  };
  runtimeHealth: {
    runtimeHealthScore: number;
    recoveryConfidenceScore: number;
    memoryPressure: "low" | "moderate" | "high";
    warnings: string[];
  };
  providerRuntimeState: {
    selectedProvider: string | null;
    providerReady: boolean;
    readinessStatus: string;
  };
  reconstructionLatencyMs: number;
  continuityCacheStats: {
    hitRate: number;
    payloadBytes: number;
  };
};

export function getContinuityInspectorReport(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId: string;
    query?: string;
  },
): ContinuityInspectorReport {
  const state = getMemoryState(db, input.workspaceId, input.threadId);
  const query = input.query?.trim() || "latest continuity context";
  const fragments = listRelevantMemoryFragments(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query,
    limit: 12,
  });
  const imported = getLatestAppliedContinuityImport(db, input.workspaceId);
  const importedBlock = buildImportedStateContextBlock(imported);
  const messages = listMessagesPage(db, input.threadId, { limit: 30 }).messages;
  const ws = getWorkspaceById(db, input.workspaceId);
  const assistantProfile = getAssistantProfile(db);
  const assistantIdentityPrompt = buildAssistantIdentityPromptForProfile(assistantProfile);
  const contextPreview = assembleProviderContext({
    workspaceName: ws?.name ?? "Workspace",
    assistantIdentityPrompt,
    continuitySummary: ws?.continuitySummary ?? null,
    importedContextBlock: importedBlock,
    messages,
  });
  const savepoints = db
    .prepare(
      `SELECT id, active_thread_id, reason, created_at
       FROM memory_savepoints
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .all(input.workspaceId) as Array<{
    id: string;
    active_thread_id: string;
    reason: string;
    created_at: string;
  }>;
  const profile = db
    .prepare(
      `SELECT preference_key, preference_value, confidence_score, updated_at
       FROM user_profile_memory
       WHERE workspace_id = ?
       ORDER BY confidence_score DESC, updated_at DESC
       LIMIT 20`,
    )
    .all(input.workspaceId) as Array<{
    preference_key: string;
    preference_value: string;
    confidence_score: number;
    updated_at: string;
  }>;
  const recoverySnapshots = db
    .prepare(
      `SELECT id, created_at, snapshot_reason
       FROM snapshots
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 12`,
    )
    .all(input.workspaceId) as Array<{
    id: string;
    created_at: string;
    snapshot_reason: string | null;
  }>;
  const evolution = getContinuityEvolutionStats(db, input.workspaceId, input.threadId);
  const reconstructionStarted = performance.now();
  const reconstruction = scoreContinuityReconstruction(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query,
  });
  const reconstructionLatencyMs = Number((performance.now() - reconstructionStarted).toFixed(2));
  const compressionLayerRow = db
    .prepare(
      `SELECT archival_state_json
       FROM compressed_memory_states
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY compressed_at DESC
       LIMIT 1`,
    )
    .get(input.workspaceId, input.threadId) as { archival_state_json: string | null } | undefined;
  let compressionLayers = {
    shortTermSummary: null as string | null,
    mediumTermSummary: null as string | null,
    longTermOperationalIdentitySummary: null as string | null,
  };
  if (compressionLayerRow?.archival_state_json) {
    try {
      const parsed = JSON.parse(compressionLayerRow.archival_state_json) as Record<string, unknown>;
      compressionLayers = {
        shortTermSummary:
          typeof parsed.shortTermSummary === "string" ? parsed.shortTermSummary : null,
        mediumTermSummary:
          typeof parsed.mediumTermSummary === "string" ? parsed.mediumTermSummary : null,
        longTermOperationalIdentitySummary:
          typeof parsed.longTermOperationalIdentitySummary === "string"
            ? parsed.longTermOperationalIdentitySummary
            : null,
      };
    } catch {
      // keep null defaults
    }
  }
  const activePayloadSize = Buffer.byteLength(
    `${state?.recentSummary ?? ""}\n${fragments.map((fragment) => fragment.content).join("\n")}`,
    "utf8",
  );
  const avgReinforcement =
    fragments.length > 0
      ? Number(
          (
            fragments.reduce((sum, fragment) => sum + fragment.reinforcementCount, 0) /
            fragments.length
          ).toFixed(3),
        )
      : 0;
  const driftRows = db
    .prepare(
      `SELECT created_at, continuity_drift_score, continuity_reconstruction_health
       FROM continuity_validation_snapshots
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
    )
    .all(input.workspaceId, input.threadId) as Array<{
    created_at: string;
    continuity_drift_score: number;
    continuity_reconstruction_health: number;
  }>;
  const embeddingCount = db
    .prepare(
      "SELECT COUNT(*) AS c FROM embedding_cache WHERE workspace_id = ? AND thread_id = ?",
    )
    .get(input.workspaceId, input.threadId) as { c: number };
  const semanticMatches = semanticRetrieveByEmbedding(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query,
    limit: 6,
  });
  const healthScore = Number(
    Math.max(
      0,
      Math.min(
        1,
        reconstruction.continuityReconstructionHealth * 0.7 +
          evolution.avgStabilityScore * 0.2 +
          (1 - Math.min(1, evolution.avgDecayRate * 10)) * 0.1,
      ),
    ).toFixed(3),
  );
  const latestCalibration = db
    .prepare(
      `SELECT continuity_fidelity_score, operational_consistency_score, emotional_continuity_score
       FROM runtime_calibration_snapshots
       WHERE workspace_id = ? AND thread_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(input.workspaceId, input.threadId) as
    | {
        continuity_fidelity_score: number;
        operational_consistency_score: number;
        emotional_continuity_score: number;
      }
    | undefined;
  const queuedJobs = db
    .prepare(
      "SELECT COUNT(*) AS c FROM maintenance_jobs WHERE workspace_id = ? AND thread_id = ? AND status = 'queued'",
    )
    .get(input.workspaceId, input.threadId) as { c: number };
  const maintenance = processMaintenanceQueue(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    isChatActive: false,
    cpuBusy: false,
  });
  const compressedBundles = db
    .prepare(
      "SELECT COUNT(*) AS c FROM compressed_memory_states WHERE workspace_id = ? AND thread_id = ?",
    )
    .get(input.workspaceId, input.threadId) as { c: number };
  const healthInput = collectRuntimeHealthInput(db, {
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    query,
    activePayloadBytes: activePayloadSize,
    maxPayloadBytes: 96_000,
  });
  const runtimeHealth =
    getLatestRuntimeHealthSnapshot(db, input.workspaceId, input.threadId) ??
    measureRuntimeHealth(healthInput);

  return {
    continuityState: state,
    activeFragments: fragments,
    savepoints: savepoints.map((row) => ({
      id: row.id,
      activeThreadId: row.active_thread_id,
      reason: row.reason,
      createdAt: row.created_at,
    })),
    userProfileMemory: profile.map((row) => ({
      preferenceKey: row.preference_key,
      preferenceValue: row.preference_value,
      confidenceScore: Number(row.confidence_score),
      updatedAt: row.updated_at,
    })),
    retrievedContext: fragments.map(
      (fragment) => `[${fragment.fragmentType}] ${fragment.content}`,
    ),
    compressionCandidates: getCompressionCandidates(
      db,
      input.workspaceId,
      input.threadId,
    ),
    contextAssemblyPreview: contextPreview.messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n"),
    runtimeContextSizeEstimate: contextPreview.estimatedTokens,
    recoveryCheckpoints: recoverySnapshots.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      reason: row.snapshot_reason,
    })),
    savepointIntegrity: validateMemorySavepoints(db, input.workspaceId),
    continuityEvolutionGraph: [
      { layer: "active", count: evolution.activeStateCount },
      { layer: "rolling", count: evolution.rollingStateCount },
      { layer: "compressed", count: evolution.compressedStateCount },
      { layer: "archived", count: evolution.archivedStateCount },
    ],
    compressionLayers,
    reconstructionSources: reconstruction.reconstructionSources,
    continuityConfidence: reconstruction.continuityConfidenceScore,
    continuityDrift: reconstruction.continuityDriftScore,
    reinforcementMetrics: {
      avgReinforcement,
      avgStabilityScore: evolution.avgStabilityScore,
    },
    decayMetrics: {
      avgDecayRate: evolution.avgDecayRate,
    },
    retrievalRanking: fragments.map((fragment, index) => ({
      fragmentId: fragment.id,
      scoreHint: Number((fragment.importanceScore + fragment.continuityWeight - index * 0.02).toFixed(3)),
    })),
    activeContinuityPayloadSize: activePayloadSize,
    driftTimeline: driftRows.map((row) => ({
      at: row.created_at,
      drift: Number(row.continuity_drift_score),
      health: Number(row.continuity_reconstruction_health),
    })),
    embeddingGenerationStatus: {
      enabled: process.env.CONTINUITY_DEBUG_EMBEDDINGS === "1",
      cachedEmbeddings: Number(embeddingCount.c ?? 0),
      semanticMatches,
    },
    continuityHealthScore: healthScore,
    calibrationMetrics: {
      continuityFidelityScore: Number(latestCalibration?.continuity_fidelity_score ?? 0.5),
      operationalConsistencyScore: Number(latestCalibration?.operational_consistency_score ?? 0.5),
      emotionalContinuityScore: Number(latestCalibration?.emotional_continuity_score ?? 0.5),
    },
    maintenanceQueueStatus: {
      queuedJobs: Number(queuedJobs.c ?? 0),
      processedThisTick: maintenance.processed,
      maintenanceHealthScore: maintenance.maintenanceHealthScore,
    },
    retrievalSaturationIndicators: {
      totalReturned: fragments.length,
      categorySpread: new Set(fragments.map((f) => f.continuityCategory)).size,
    },
    lowConfidenceEventTimeline: driftRows
      .filter((row) => Number(row.continuity_reconstruction_health) < 0.5)
      .map((row) => ({
        at: row.created_at,
        drift: Number(row.continuity_drift_score),
        health: Number(row.continuity_reconstruction_health),
      })),
    runtimeMemoryPressure: {
      activePayloadBytes: activePayloadSize,
      compressedBundles: Number(compressedBundles.c ?? 0),
    },
    runtimeHealth: {
      runtimeHealthScore: runtimeHealth.runtimeHealthScore,
      recoveryConfidenceScore: runtimeHealth.recoveryConfidenceScore,
      memoryPressure: runtimeHealth.memoryPressure,
      warnings: runtimeHealth.warnings,
    },
    providerRuntimeState: {
      selectedProvider:
        (
          db
            .prepare(
              "SELECT provider FROM provider_configs WHERE workspace_id = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1",
            )
            .get(input.workspaceId) as { provider: string } | undefined
        )?.provider ?? null,
      providerReady: false,
      readinessStatus: "unknown",
    },
    reconstructionLatencyMs,
    continuityCacheStats: {
      hitRate: Number(Math.min(1, evolution.avgStabilityScore).toFixed(3)),
      payloadBytes: activePayloadSize,
    },
  };
}
