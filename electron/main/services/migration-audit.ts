import fs from "fs";
import path from "path";
import { app } from "electron";
import { getReleaseChannelInfo } from "../../../src/shared/release-channel";
import { APP_VERSION, SCHEMA_VERSION } from "../../../src/shared/app-version";

export type MigrationAuditEntry = {
  id: string;
  appliedAt: string;
  migrationVersion: number;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  snapshotPath: string | null;
  pendingCount: number;
};

let auditDirOverride: string | null = null;

export function setMigrationAuditDirForTests(dir: string | null): void {
  auditDirOverride = dir;
}

function auditLogPath(): string {
  const root =
    auditDirOverride ??
    (() => {
      try {
        return app.getPath("userData");
      } catch {
        return path.join(process.cwd(), ".continuity-test");
      }
    })();
  return path.join(root, "migration-audit.jsonl");
}

export function logMigrationAudit(entry: Omit<MigrationAuditEntry, "id" | "appliedAt">): void {
  const channel = getReleaseChannelInfo();
  const record: MigrationAuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    appliedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    buildNumber: channel.buildNumber,
    releaseChannel: channel.releaseChannel,
    ...entry,
  };

  const logPath = auditLogPath();
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
}

export function readMigrationAuditEntries(limit = 50): MigrationAuditEntry[] {
  const logPath = auditLogPath();
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  const entries: MigrationAuditEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as MigrationAuditEntry);
    } catch {
      /* skip */
    }
  }
  entries.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  return entries.slice(0, limit);
}

export function clearMigrationAuditForTests(): void {
  const logPath = auditLogPath();
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
}
