import { describe, expect, it, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";
import { buildVerifiedBackupBundle } from "../electron/main/services/workspace-export";
import {
  encryptBackupBundle,
  decryptBackupBundle,
} from "../electron/main/services/encrypted-export";
import {
  previewEncryptedImport,
  executeEncryptedImport,
} from "../electron/main/services/encrypted-import";
import { buildRestorePreview } from "../electron/main/services/restore-preview";
import { dryRunMigrations } from "../electron/main/services/migration-dry-run";
import {
  getBackupReminderStatus,
  recordBackupReminderShown,
  dismissBackupReminder,
  BACKUP_REMINDER_SNOOZE_MS,
} from "../electron/main/services/backup-reminder";
import { buildDiagnosticsReport } from "../electron/main/services/diagnostics-service";
import {
  appendAuditEvent,
  readAuditEvents,
  setAuditDirForTests,
  clearAuditLogForTests,
} from "../electron/main/services/reliability-audit";
import { getAppliedVersion } from "../electron/main/database/migrations";
import { SCHEMA_VERSION } from "../electron/main/database/schema";

describe("v1.2 restore lane", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function session() {
    const s = openTestDatabase();
    const dir = path.join(os.tmpdir(), `v12-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setAuditDirForTests(dir);
    cleanups.push(() => {
      s.cleanup();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return s;
  }

  it("encrypted import preview succeeds and wrong password fails calmly", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Enc import");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Secret" });
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const enc = encryptBackupBundle(bundle, "correct-password-99");
    expect(enc.ok).toBe(true);

    const preview = previewEncryptedImport(enc.json!, "correct-password-99");
    expect(preview.ok).toBe(true);
    expect(preview.preview?.valid).toBe(true);
    expect(preview.preview?.encrypted).toBe(true);

    const bad = previewEncryptedImport(enc.json!, "wrong-password-99");
    expect(bad.ok).toBe(false);
    expect(bad.wrongPassword).toBe(true);
    expect(bad.preview).toBeNull();
  });

  it("encrypted import roundtrip does not partially import on failure", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Partial");
    const before = db.prepare("SELECT COUNT(*) AS c FROM workspaces").get() as {
      c: number;
    };

    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const enc = encryptBackupBundle(bundle, "import-pass-12345");
    const fail = executeEncryptedImport(db, enc.json!, "wrong");
    expect(fail.ok).toBe(false);

    const after = db.prepare("SELECT COUNT(*) AS c FROM workspaces").get() as { c: number };
    expect(after.c).toBe(before.c);

    const ok = executeEncryptedImport(db, enc.json!, "import-pass-12345");
    expect(ok.ok).toBe(true);
    expect(ok.workspaceId).toBeTruthy();
  });

  it("decrypted payload validation rejects corrupt bundle", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Corrupt");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "tamper-me" });
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const enc = encryptBackupBundle(bundle, "valid-pass-12345");
    const decrypted = decryptBackupBundle(enc.json!, "valid-pass-12345");
    expect(decrypted.ok).toBe(true);
    decrypted.bundle!.payload.messages = [];
    const tampered = encryptBackupBundle(decrypted.bundle!, "valid-pass-12345");
    const preview = previewEncryptedImport(tampered.json!, "valid-pass-12345");
    expect(preview.ok).toBe(false);
  });

  it("builds restore preview with estimates and replay status", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Restore preview");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Before" });
    const snap = createManualSnapshot(db, ws.id, { label: "Point-in-time" });
    insertMessage(db, { threadId: thread.id, role: "user", content: "After" });

    const preview = buildRestorePreview(db, snap.id, ws.id);
    expect(preview.snapshotId).toBe(snap.id);
    expect(preview.label).toBe("Point-in-time");
    expect(preview.affectedThreadCount).toBeGreaterThan(0);
    expect(preview.affectedMessageCount).toBeGreaterThan(0);
    expect(preview.messagesRemovedEstimate).toBeGreaterThan(0);
    expect(["verified", "unknown", "mismatch", "not_available"]).toContain(
      preview.replayHashStatus,
    );
  });

  it("migration dry-run does not mutate database", () => {
    const s = session();
    const before = getAppliedVersion(s.db);
    const migrationRowsBefore = (
      s.db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }
    ).c;

    const report = dryRunMigrations(s.db, s.dbPath);
    expect(report.targetSchemaVersion).toBe(SCHEMA_VERSION);
    expect(report.currentSchemaVersion).toBe(before);
    expect(report.pendingCount).toBe(0);

    const migrationRowsAfter = (
      s.db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get() as { c: number }
    ).c;
    expect(migrationRowsAfter).toBe(migrationRowsBefore);
  });

  it("backup reminder respects cooldown after shown", () => {
    const db = session().db;
    db.prepare(
      "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_export_at', ?)",
    ).run("1970-01-01T00:00:00.000Z");

    recordBackupReminderShown(db);
    const status = getBackupReminderStatus(db);
    expect(status.shouldShow).toBe(false);

    dismissBackupReminder(db, 1);
    const dismissed = getBackupReminderStatus(db);
    expect(dismissed.shouldShow).toBe(false);
    expect(dismissed.dismissedUntil).toBeTruthy();
  });

  it("diagnostics includes update readiness without secrets", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Diag v12");
    const report = buildDiagnosticsReport(db, ws.id);
    expect(report.updateReadiness).toBeTruthy();
    expect(report.updateReadiness.autoUpdateEnabled).toBe(false);
    expect(report.updateReadiness.releaseChannel).toBeTruthy();
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9_-]{12,}/);
  });

  it("writes audit entries for encrypted import and migration dry-run", () => {
    const db = session().db;
    appendAuditEvent({ type: "migration_dry_run", message: "test dry run" });
    appendAuditEvent({ type: "encrypted_import_attempt", message: "test enc" });
    appendAuditEvent({ type: "backup_reminder_shown", message: "test reminder" });

    const events = readAuditEvents(20);
    const types = events.map((e) => e.type);
    expect(types).toContain("migration_dry_run");
    expect(types).toContain("encrypted_import_attempt");
    expect(types).toContain("backup_reminder_shown");
  });
});
