import { describe, expect, it } from "vitest";
import {
  checkReleaseCompatibility,
  getReleaseChannelInfo,
  resolveReleaseChannel,
  validateReleaseMetadata,
} from "../src/shared/release-channel";
import {
  evaluateStartupCompatibility,
  SCHEMA_COMPATIBILITY_REGISTRY,
} from "../electron/main/services/compatibility";
import { openTestDatabase } from "../electron/main/database/test-db";
import { getAppliedVersion } from "../electron/main/database/migrations";
import { SCHEMA_VERSION } from "../electron/main/database/schema";
import {
  logMigrationAudit,
  readMigrationAuditEntries,
  setMigrationAuditDirForTests,
  clearMigrationAuditForTests,
} from "../electron/main/services/migration-audit";
import fs from "fs";
import path from "path";
import os from "os";

describe("release runtime", () => {
  it("normalizes and validates release channels", () => {
    expect(resolveReleaseChannel("BETA")).toBe("beta");
    expect(resolveReleaseChannel("production")).toBe("dev");

    const meta = validateReleaseMetadata({
      releaseChannel: "stable",
      appVersion: "0.1.0",
      schemaVersion: 4,
      buildNumber: "100",
      buildDate: "2026-05-18",
    });
    expect(meta.ok).toBe(true);

    const info = getReleaseChannelInfo({
      releaseChannel: "beta",
      appVersion: "0.1.0",
      schemaVersion: 4,
      buildNumber: "100",
      buildDate: "2026-05-18",
    });
    expect(info.badgeLabel).toBe("Beta");
    expect(info.badgeTone).toBe("beta");
  });

  it("detects app and schema downgrade", () => {
    const result = checkReleaseCompatibility({
      currentAppVersion: "0.1.0",
      currentSchemaVersion: 4,
      currentChannel: "dev",
      storedAppVersion: "9.0.0",
      storedSchemaVersion: 5,
      storedChannel: "stable",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("schema-downgrade-detected");
    expect(result.errors).toContain("app-downgrade-detected");
    expect(result.warnings).toContain("release-channel-downgrade");
  });

  it("logs migration audit with release metadata", () => {
    const dir = path.join(os.tmpdir(), `migration-audit-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setMigrationAuditDirForTests(dir);

    logMigrationAudit({
      migrationVersion: 4,
      snapshotPath: "/tmp/test.bak",
      pendingCount: 1,
    });

    const entries = readMigrationAuditEntries(5);
    expect(entries.length).toBe(1);
    expect(entries[0].migrationVersion).toBe(4);
    expect(entries[0].releaseChannel).toBeTruthy();

    clearMigrationAuditForTests();
    setMigrationAuditDirForTests(null);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("evaluates startup compatibility against registry", () => {
    const s = openTestDatabase();
    try {
      const applied = getAppliedVersion(s.db);
      const report = evaluateStartupCompatibility(s.db, applied);
      expect(
        SCHEMA_COMPATIBILITY_REGISTRY.some((e) => e.schemaVersion === SCHEMA_VERSION),
      ).toBe(true);
      expect(applied).toBe(SCHEMA_VERSION);
      expect(report.schemaMismatch).toBe(false);
    } finally {
      s.cleanup();
    }
  });
});
