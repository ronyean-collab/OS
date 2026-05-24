import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import { getAppliedVersion, MIGRATIONS } from "../database/migrations";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";
import { evaluateStartupCompatibility } from "./compatibility";
import { dryRunMigrations } from "./migration-dry-run";
import { getDbPath } from "../database/connection";

export type UpdateReadinessReport = {
  status: "ready" | "attention" | "blocked";
  autoUpdateEnabled: boolean;
  releaseChannel: string;
  releaseBadge: string;
  currentAppVersion: string;
  currentSchemaVersion: number;
  appliedMigrationVersion: number;
  pendingMigrationCount: number;
  downgradeDetected: boolean;
  migrationSafetyWarning: string | null;
  compatibilityOk: boolean;
  warnings: string[];
  errors: string[];
  summary: string;
};

/** Updater foundation — metadata only; no download or install. */
export function getUpdateReadiness(
  db: Database.Database,
  dbPath?: string,
): UpdateReadinessReport {
  const version = getAppVersionInfo();
  const channel = getReleaseChannelInfo();
  const applied = getAppliedVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > applied);
  const startup = evaluateStartupCompatibility(db, applied);
  const dryRun = dryRunMigrations(db, dbPath ?? getDbPath());

  const warnings = [...startup.warnings, ...dryRun.warnings];
  const errors = [...startup.errors, ...dryRun.errors];

  let migrationSafetyWarning: string | null = null;
  if (pending.length > 0) {
    migrationSafetyWarning = dryRun.wouldCreateRecoverySnapshot
      ? `${pending.length} migration(s) pending. A local recovery snapshot will be created before applying.`
      : `${pending.length} migration(s) pending on next startup.`;
  }

  let status: UpdateReadinessReport["status"] = "ready";
  if (errors.length > 0 || startup.downgradeDetected) {
    status = "blocked";
  } else if (warnings.length > 0 || pending.length > 0) {
    status = "attention";
  }

  const summary =
    status === "ready"
      ? "This build is ready for a future updater. Auto-update is not enabled yet."
      : status === "attention"
        ? "Review compatibility warnings before installing a future update."
        : "Update blocked — resolve database compatibility before updating.";

  return {
    status,
    autoUpdateEnabled: false,
    releaseChannel: channel.releaseChannel,
    releaseBadge: channel.badgeLabel,
    currentAppVersion: version.appVersion,
    currentSchemaVersion: SCHEMA_VERSION,
    appliedMigrationVersion: applied,
    pendingMigrationCount: pending.length,
    downgradeDetected: startup.downgradeDetected,
    migrationSafetyWarning,
    compatibilityOk: startup.ok && dryRun.compatibilityOk,
    warnings,
    errors,
    summary,
  };
}
