import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import { getAppliedVersion } from "../database/migrations";
import { isRecoveryMode, getRecoveryMessage, getReliabilityState } from "../database/connection";
import { evaluateStartupCompatibility } from "./compatibility";
import { getProviderConfig } from "./provider-service";
import {
  collectRuntimeHealthInput,
  getLatestRuntimeHealthSnapshot,
  measureRuntimeHealth,
} from "./runtime-health-service";
import { getActiveThreadId, getActiveWorkspaceId } from "./workspace-service";

export type HealthStatus = "healthy" | "attention" | "unhealthy";

export type HealthDimension = {
  status: HealthStatus;
  label: string;
  detail: string;
};

export type SystemHealthSnapshot = {
  runtimeHealth: HealthDimension & { score: number | null };
  recoveryHealth: HealthDimension & { interruptedRecovered: number };
  providerHealth: HealthDimension & { provider: string | null };
  startupHealth: HealthDimension;
  migrationHealth: HealthDimension & { appliedVersion: number; expectedVersion: number };
};

function statusFromScore(score: number | null, healthyAt = 0.7, attentionAt = 0.5): HealthStatus {
  if (score == null) return "attention";
  if (score >= healthyAt) return "healthy";
  if (score >= attentionAt) return "attention";
  return "unhealthy";
}

export function buildSystemHealthSnapshot(
  db: Database.Database,
  workspaceId?: string | null,
): SystemHealthSnapshot {
  const wsId = workspaceId ?? getActiveWorkspaceId(db);
  const threadId = wsId ? getActiveThreadId(db) : null;
  const applied = getAppliedVersion(db);
  const startup = evaluateStartupCompatibility(db, applied);
  const reliability = getReliabilityState();

  let runtimeScore: number | null = null;
  if (wsId && threadId) {
    const latest = getLatestRuntimeHealthSnapshot(db, wsId, threadId);
    if (latest) {
      runtimeScore = latest.runtimeHealthScore;
    } else {
      const input = collectRuntimeHealthInput(db, {
        workspaceId: wsId,
        threadId,
        activePayloadBytes: 0,
      });
      runtimeScore = measureRuntimeHealth(input).runtimeHealthScore;
    }
  }

  const migrationOk = applied >= SCHEMA_VERSION;
  const migrationStatus: HealthStatus = migrationOk
    ? "healthy"
    : applied > 0
      ? "attention"
      : "unhealthy";

  let providerLabel = "not configured";
  let providerStatus: HealthStatus = "attention";
  let providerId: string | null = null;
  if (wsId) {
    const config = getProviderConfig(db, wsId);
    providerId = config?.provider ?? null;
    if (config?.enabled && config.provider === "ollama") {
      providerLabel = config.model ? `Ollama · ${config.model}` : "Ollama";
      providerStatus = "healthy";
    } else if (config?.enabled) {
      providerLabel = `${config.displayName ?? config.provider} (Manual Mode)`;
      providerStatus = "healthy";
    } else {
      providerLabel = "Manual Mode only";
      providerStatus = "healthy";
    }
  }

  const recoveryStatus: HealthStatus = isRecoveryMode()
    ? "unhealthy"
    : reliability.interruptedResponsesRecovered > 0
      ? "attention"
      : "healthy";

  const startupStatus: HealthStatus = startup.ok
    ? startup.downgradeDetected
      ? "attention"
      : "healthy"
    : "unhealthy";

  return {
    runtimeHealth: {
      status: statusFromScore(runtimeScore),
      label: "Runtime",
      detail:
        runtimeScore != null
          ? `Health score ${Math.round(runtimeScore * 100)}%`
          : "No active thread metrics yet",
      score: runtimeScore,
    },
    recoveryHealth: {
      status: recoveryStatus,
      label: "Recovery",
      detail: isRecoveryMode()
        ? getRecoveryMessage() ?? "Recovery mode active"
        : reliability.interruptedResponsesRecovered > 0
          ? `${reliability.interruptedResponsesRecovered} interrupted stream(s) recovered`
          : "No active recovery issues",
      interruptedRecovered: reliability.interruptedResponsesRecovered,
    },
    providerHealth: {
      status: providerStatus,
      label: "Provider",
      detail: providerLabel,
      provider: providerId,
    },
    startupHealth: {
      status: startupStatus,
      label: "Startup",
      detail: startup.ok
        ? startup.warnings.length > 0
          ? `${startup.warnings.length} startup warning(s)`
          : "Startup checks passed"
        : startup.errors.join("; ") || "Startup compatibility issue",
    },
    migrationHealth: {
      status: migrationStatus,
      label: "Migrations",
      detail: migrationOk
        ? `Schema v${applied} current`
        : `Applied v${applied}, expected v${SCHEMA_VERSION}`,
      appliedVersion: applied,
      expectedVersion: SCHEMA_VERSION,
    },
  };
}
