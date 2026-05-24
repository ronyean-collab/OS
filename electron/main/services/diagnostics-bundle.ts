import type Database from "better-sqlite3";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";
import { getAppliedVersion } from "../database/migrations";
import { isRecoveryMode, getRecoveryMessage } from "../database/connection";
import { validateWorkspaceReplay } from "./replay-validator";
import { scanWorkspaceHealth } from "./workspace-health";
import { readAuditEvents } from "./reliability-audit";
import { readCrashLogSummary } from "./crash-logger";
import { readMigrationAuditEntries } from "./migration-audit";
import { evaluateStartupCompatibility } from "./compatibility";
import { getUpdateReadiness } from "./update-readiness";
import { assertNoSecretsInDiagnostics } from "./diagnostics-service";

const SECRET_FIELD_PATTERN =
  /api[_-]?key|secret|token|password|bearer|sk-[a-zA-Z0-9]/i;

export type DiagnosticsBundle = {
  exportedAt: string;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  releaseBadge: string;
  buildDate: string;
  appliedMigrationVersion: number;
  recoveryMode: boolean;
  recoveryMessage: string | null;
  replayValidation: {
    ok: boolean;
    errorCount: number;
    warningCount: number;
  } | null;
  integrityScan: {
    status: string;
    warningCount: number;
    errorCount: number;
  } | null;
  auditSummary: {
    total: number;
    recentTypes: string[];
  };
  crashSummary: {
    recentCount: number;
    lastCrashAt: string | null;
    lastMessage: string | null;
  };
  migrationAuditSummary: {
    recentCount: number;
    lastAppliedVersion: number | null;
  };
  startupCompatibility: {
    ok: boolean;
    downgradeDetected: boolean;
    warningCount: number;
  };
  updateReadiness: {
    status: string;
    autoUpdateEnabled: boolean;
    pendingMigrationCount: number;
    summary: string;
  };
  workspaces: Array<{
    id: string;
    name: string;
    threadCount: number;
    messageCount: number;
    lastOpenedAt: string;
  }>;
};

function scrubValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (SECRET_FIELD_PATTERN.test(value)) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_FIELD_PATTERN.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = scrubValue(v);
      }
    }
    return out;
  }
  return value;
}

export function buildDiagnosticsBundle(
  db: Database.Database,
  workspaceId: string | null,
): DiagnosticsBundle {
  const version = getAppVersionInfo();
  const channel = getReleaseChannelInfo();
  const applied = getAppliedVersion(db);

  let replayValidation: DiagnosticsBundle["replayValidation"] = null;
  let integrityScan: DiagnosticsBundle["integrityScan"] = null;

  if (workspaceId) {
    const replay = validateWorkspaceReplay(db, workspaceId);
    replayValidation = {
      ok: replay.ok,
      errorCount: replay.errors.length,
      warningCount: replay.warnings.length,
    };
    const health = scanWorkspaceHealth(db, workspaceId);
    integrityScan = {
      status: health.status,
      warningCount: health.warnings.length,
      errorCount: health.errors.length,
    };
  }

  const audit = readAuditEvents(50);
  const crashes = readCrashLogSummary(10);
  const migrations = readMigrationAuditEntries(10);
  const startup = evaluateStartupCompatibility(db, applied);
  const updateReadiness = getUpdateReadiness(db);

  const workspaceRows = db
    .prepare(
      `SELECT w.id, w.name, w.last_opened_at,
        (SELECT COUNT(*) FROM threads t WHERE t.workspace_id = w.id) AS thread_count,
        (SELECT COUNT(*) FROM messages m
          JOIN threads t ON t.id = m.thread_id WHERE t.workspace_id = w.id) AS message_count
       FROM workspaces w ORDER BY w.last_opened_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    last_opened_at: string;
    thread_count: number;
    message_count: number;
  }>;

  const bundle: DiagnosticsBundle = {
    exportedAt: new Date().toISOString(),
    appVersion: version.appVersion,
    schemaVersion: version.schemaVersion,
    buildNumber: version.buildNumber,
    releaseChannel: channel.releaseChannel,
    releaseBadge: channel.badgeLabel,
    buildDate: version.buildDate,
    appliedMigrationVersion: applied,
    recoveryMode: isRecoveryMode(),
    recoveryMessage: getRecoveryMessage(),
    replayValidation,
    integrityScan,
    auditSummary: {
      total: audit.length,
      recentTypes: [...new Set(audit.slice(0, 10).map((e) => e.type))],
    },
    crashSummary: {
      recentCount: crashes.length,
      lastCrashAt: crashes[0]?.createdAt ?? null,
      lastMessage: crashes[0]?.message ?? null,
    },
    migrationAuditSummary: {
      recentCount: migrations.length,
      lastAppliedVersion: migrations[0]?.migrationVersion ?? null,
    },
    startupCompatibility: {
      ok: startup.ok,
      downgradeDetected: startup.downgradeDetected,
      warningCount: startup.warnings.length,
    },
    updateReadiness: {
      status: updateReadiness.status,
      autoUpdateEnabled: updateReadiness.autoUpdateEnabled,
      pendingMigrationCount: updateReadiness.pendingMigrationCount,
      summary: updateReadiness.summary,
    },
    workspaces: workspaceRows.map((w) => ({
      id: w.id,
      name: w.name,
      threadCount: w.thread_count,
      messageCount: w.message_count,
      lastOpenedAt: w.last_opened_at,
    })),
  };

  const scrubbed = scrubValue(bundle) as DiagnosticsBundle;
  const serialized = JSON.stringify(scrubbed);
  assertNoSecretsInDiagnostics(serialized);
  return scrubbed;
}

export function serializeDiagnosticsBundle(bundle: DiagnosticsBundle): string {
  const json = JSON.stringify(bundle, null, 2);
  assertNoSecretsInDiagnostics(json);
  return json;
}

export function formatDiagnosticsBundleForCopy(bundle: DiagnosticsBundle): string {
  const lines = [
    "ContinuityOS Diagnostics Export",
    `Exported: ${bundle.exportedAt}`,
    `App: ${bundle.appVersion} (${bundle.releaseBadge} / ${bundle.releaseChannel})`,
    `Schema: ${bundle.schemaVersion} (migration ${bundle.appliedMigrationVersion})`,
    `Build: ${bundle.buildNumber} · ${bundle.buildDate}`,
    `Recovery mode: ${bundle.recoveryMode ? "yes" : "no"}`,
  ];
  if (bundle.replayValidation) {
    lines.push(
      `Replay validation: ${bundle.replayValidation.ok ? "ok" : "issues"} (${bundle.replayValidation.errorCount} errors, ${bundle.replayValidation.warningCount} warnings)`,
    );
  }
  if (bundle.integrityScan) {
    lines.push(
      `Integrity scan: ${bundle.integrityScan.status} (${bundle.integrityScan.errorCount} errors, ${bundle.integrityScan.warningCount} warnings)`,
    );
  }
  lines.push(`Audit events (recent): ${bundle.auditSummary.total}`);
  lines.push(`Crash log entries (recent): ${bundle.crashSummary.recentCount}`);
  if (bundle.crashSummary.lastMessage) {
    lines.push(`Last crash: ${bundle.crashSummary.lastMessage}`);
  }
  lines.push(`Workspaces: ${bundle.workspaces.length}`);
  for (const w of bundle.workspaces.slice(0, 5)) {
    lines.push(`  · ${w.name} (${w.threadCount} threads, ${w.messageCount} messages)`);
  }
  const text = lines.join("\n");
  assertNoSecretsInDiagnostics(text);
  return text;
}
