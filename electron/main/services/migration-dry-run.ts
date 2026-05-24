import fs from "fs";
import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import {
  getAppliedVersion,
  MIGRATIONS,
} from "../database/migrations";
import { evaluateStartupCompatibility } from "./compatibility";
import { appendAuditEvent } from "./reliability-audit";
import { getAppVersionInfo } from "../../../src/shared/app-version";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";

export type MigrationDryRunReport = {
  currentSchemaVersion: number;
  targetSchemaVersion: number;
  appliedMigrationVersion: number;
  pendingMigrationVersions: number[];
  pendingCount: number;
  wouldCreateRecoverySnapshot: boolean;
  compatibilityOk: boolean;
  warnings: string[];
  errors: string[];
  recommendations: string[];
  releaseChannel: string;
  appVersion: string;
};

export function dryRunMigrations(
  db: Database.Database,
  dbPath: string,
): MigrationDryRunReport {
  const applied = getAppliedVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > applied);
  const startup = evaluateStartupCompatibility(db, applied);
  const version = getAppVersionInfo();
  const channel = getReleaseChannelInfo();

  const warnings = [...startup.warnings];
  const errors = [...startup.errors];
  const recommendations: string[] = [];

  const wouldCreateRecoverySnapshot =
    pending.length > 0 && fs.existsSync(dbPath);

  if (pending.length > 0) {
    recommendations.push(
      "Restart the app to apply pending migrations. A recovery snapshot will be created first.",
    );
  } else {
    recommendations.push("Schema is up to date — no migrations needed.");
  }

  if (startup.downgradeDetected) {
    recommendations.push("Do not migrate until app version matches database expectations.");
  }

  appendAuditEvent({
    type: "migration_dry_run",
    message: `Migration dry-run: ${pending.length} pending`,
    details: {
      current: applied,
      target: SCHEMA_VERSION,
      pending: pending.map((m) => m.version),
      wouldCreateRecoverySnapshot,
    },
  });

  return {
    currentSchemaVersion: applied,
    targetSchemaVersion: SCHEMA_VERSION,
    appliedMigrationVersion: applied,
    pendingMigrationVersions: pending.map((m) => m.version),
    pendingCount: pending.length,
    wouldCreateRecoverySnapshot,
    compatibilityOk: startup.ok,
    warnings,
    errors,
    recommendations,
    releaseChannel: channel.releaseChannel,
    appVersion: version.appVersion,
  };
}
