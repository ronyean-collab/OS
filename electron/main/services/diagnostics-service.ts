import type Database from "better-sqlite3";
import { getDbPath, isRecoveryMode, getRecoveryMessage } from "../database/connection";
import { getAppliedVersion } from "../database/migrations";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";
import { evaluateStartupCompatibility } from "./compatibility";
import { getUpdateReadiness, type UpdateReadinessReport } from "./update-readiness";
import { getLastSuccessfulPersistence } from "./reliability-metrics";
import { getLastSnapshotTime } from "./snapshot-service";

/** Match likely credential material — not generic words in safe copy. */
const SECRET_PATTERNS = [/sk-[a-zA-Z0-9_-]{12,}/i, /Bearer\s+[a-zA-Z0-9._-]{20,}/i];

export type DiagnosticsReport = {
  appName: string;
  appVersion: string;
  buildNumber: string;
  releaseChannel: string;
  releaseBadge: string;
  releaseBadgeTone: "dev" | "beta" | "stable";
  buildDate: string;
  schemaVersion: number;
  appliedMigrationVersion: number;
  databasePath: string;
  recoveryMode: boolean;
  recoveryMessage: string | null;
  lastSnapshotAt: string | null;
  lastSuccessfulPersistenceAt: string | null;
  lastExportAt: string | null;
  lastExportAppVersion: string | null;
  startupWarnings: string[];
  downgradeDetected: boolean;
  updateReadiness: UpdateReadinessReport;
};

function readMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function buildDiagnosticsReport(
  db: Database.Database,
  workspaceId: string | null,
): DiagnosticsReport {
  const version = getAppVersionInfo();
  const channel = getReleaseChannelInfo();
  const startup = evaluateStartupCompatibility(db, getAppliedVersion(db));

  return {
    appName: version.appName,
    appVersion: version.appVersion,
    buildNumber: version.buildNumber,
    releaseChannel: channel.releaseChannel,
    releaseBadge: channel.badgeLabel,
    releaseBadgeTone: channel.badgeTone,
    buildDate: version.buildDate,
    schemaVersion: version.schemaVersion,
    appliedMigrationVersion: getAppliedVersion(db),
    databasePath: getDbPath(),
    recoveryMode: isRecoveryMode(),
    recoveryMessage: getRecoveryMessage(),
    lastSnapshotAt: workspaceId ? getLastSnapshotTime(db, workspaceId) : null,
    lastSuccessfulPersistenceAt: getLastSuccessfulPersistence(db),
    lastExportAt: readMeta(db, "last_export_at"),
    lastExportAppVersion: readMeta(db, "last_export_app_version"),
    startupWarnings: startup.warnings,
    downgradeDetected: startup.downgradeDetected,
    updateReadiness: getUpdateReadiness(db),
  };
}

export function formatDiagnosticsForCopy(report: DiagnosticsReport): string {
  const lines = [
    `${report.appName} Diagnostics`,
    `App version: ${report.appVersion}`,
    `Build: ${report.buildNumber}`,
    `Channel: ${report.releaseChannel} (${report.releaseBadge})`,
    `Build date: ${report.buildDate}`,
    `Schema version: ${report.schemaVersion}`,
    `Applied migration: ${report.appliedMigrationVersion}`,
    `Database: ${report.databasePath}`,
    `Recovery mode: ${report.recoveryMode ? "yes" : "no"}`,
  ];
  if (report.recoveryMessage) {
    lines.push(`Recovery message: ${report.recoveryMessage}`);
  }
  if (report.lastSnapshotAt) {
    lines.push(`Last snapshot: ${report.lastSnapshotAt}`);
  }
  if (report.lastSuccessfulPersistenceAt) {
    lines.push(`Last persistence: ${report.lastSuccessfulPersistenceAt}`);
  }
  if (report.lastExportAt) {
    lines.push(
      `Last export: ${report.lastExportAt}${report.lastExportAppVersion ? ` (${report.lastExportAppVersion})` : ""}`,
    );
  }
  lines.push(`Update readiness: ${report.updateReadiness.status}`);
  lines.push(report.updateReadiness.summary);
  if (report.updateReadiness.migrationSafetyWarning) {
    lines.push(report.updateReadiness.migrationSafetyWarning);
  }
  const text = lines.join("\n");
  assertNoSecretsInDiagnostics(text);
  return text;
}

export function assertNoSecretsInDiagnostics(text: string): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error("Diagnostics output must not contain secret patterns.");
    }
  }
}

export function recordExportMetadata(db: Database.Database): void {
  const version = getAppVersionInfo();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_export_at', ?)",
  ).run(now);
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_export_app_version', ?)",
  ).run(version.appVersion);
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_export_build_number', ?)",
  ).run(version.buildNumber);
}
