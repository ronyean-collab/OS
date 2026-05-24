import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import { APP_VERSION } from "../../../src/shared/app-version";
import {
  checkReleaseCompatibility,
  getReleaseChannelInfo,
  resolveReleaseChannel,
  type ReleaseCompatibilityResult,
} from "../../../src/shared/release-channel";

export type SchemaCompatibilityEntry = {
  schemaVersion: number;
  minAppVersion: string;
  maxAppVersion?: string;
  notes: string;
};

/** Registry for updater / migration safety — extend when schema bumps. */
export const SCHEMA_COMPATIBILITY_REGISTRY: SchemaCompatibilityEntry[] = [
  { schemaVersion: 1, minAppVersion: "0.1.0", notes: "Initial foundation" },
  { schemaVersion: 2, minAppVersion: "0.1.0", notes: "Recovery hardening" },
  { schemaVersion: 3, minAppVersion: "0.1.0", notes: "Timeline version columns" },
  { schemaVersion: 4, minAppVersion: "0.1.0", notes: "Performance + replay hash" },
  { schemaVersion: 5, minAppVersion: "0.1.0", notes: "Thread management + backup bundle" },
];

export type StartupCompatibilityReport = {
  ok: boolean;
  downgradeDetected: boolean;
  schemaMismatch: boolean;
  release: ReleaseCompatibilityResult;
  warnings: string[];
  errors: string[];
  recommendations: string[];
};

function readMeta(db: Database.Database, key: string): string | null {
  try {
    const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export function writeStartupVersionMarkers(db: Database.Database): void {
  const channel = getReleaseChannelInfo();
  const now = new Date().toISOString();
  const pairs: Array<[string, string]> = [
    ["last_startup_app_version", APP_VERSION],
    ["last_startup_schema_version", String(SCHEMA_VERSION)],
    ["last_startup_release_channel", channel.releaseChannel],
    ["last_startup_at", now],
  ];
  for (const [key, value] of pairs) {
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
      key,
      value,
    );
  }
}

export function evaluateStartupCompatibility(
  db: Database.Database,
  appliedMigrationVersion: number,
): StartupCompatibilityReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const recommendations: string[] = [];

  const storedSchema = readMeta(db, "last_startup_schema_version");
  const storedApp = readMeta(db, "last_startup_app_version");
  const storedChannel = readMeta(db, "last_startup_release_channel");
  const channel = resolveReleaseChannel();

  const release = checkReleaseCompatibility({
    currentAppVersion: APP_VERSION,
    currentSchemaVersion: SCHEMA_VERSION,
    currentChannel: channel,
    storedAppVersion: storedApp,
    storedSchemaVersion: storedSchema ? Number(storedSchema) : null,
    storedChannel,
  });

  warnings.push(...release.warnings);
  errors.push(...release.errors);

  const registryEntry = SCHEMA_COMPATIBILITY_REGISTRY.find(
    (e) => e.schemaVersion === SCHEMA_VERSION,
  );
  if (!registryEntry) {
    warnings.push("schema-not-in-compatibility-registry");
  }

  if (appliedMigrationVersion > SCHEMA_VERSION) {
    errors.push("database-newer-than-app");
  }

  const downgradeDetected =
    release.errors.includes("schema-downgrade-detected") ||
    release.errors.includes("app-downgrade-detected") ||
    appliedMigrationVersion > SCHEMA_VERSION;

  /** Pending migrations only — not registry metadata or channel warnings. */
  const schemaMismatch =
    appliedMigrationVersion < SCHEMA_VERSION && !downgradeDetected;

  if (downgradeDetected) {
    recommendations.push(
      "Install the same or newer app version before opening this database.",
    );
  }
  if (schemaMismatch) {
    recommendations.push("Allow migrations to complete on startup.");
  }

  return {
    ok: errors.length === 0,
    downgradeDetected,
    schemaMismatch,
    release,
    warnings,
    errors,
    recommendations,
  };
}
