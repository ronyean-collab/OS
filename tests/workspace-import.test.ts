import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildWorkspaceExportPackage,
  buildVerifiedBackupBundle,
  parseExportPackageJson,
  serializeExportPackage,
} from "../electron/main/services/workspace-export";
import { encryptBackupBundle } from "../electron/main/services/encrypted-export";
import { executeEncryptedImport } from "../electron/main/services/encrypted-import";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";
import {
  buildImportPreview,
  executeWorkspaceImport,
  validateImportJson,
} from "../electron/main/services/workspace-import";
import {
  clearAuditLogForTests,
  setAuditDirForTests,
} from "../electron/main/services/reliability-audit";
import fs from "fs";
import path from "path";
import os from "os";

describe("workspace import", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function session() {
    const s = openTestDatabase();
    const auditDir = path.join(os.tmpdir(), `import-audit-${Date.now()}`);
    fs.mkdirSync(auditDir, { recursive: true });
    setAuditDirForTests(auditDir);
    cleanups.push(() => {
      s.cleanup();
      fs.rmSync(auditDir, { recursive: true, force: true });
    });
    return s.db;
  }

  it("rejects malformed import JSON", () => {
    const report = validateImportJson("{ not valid json");
    expect(report.valid).toBe(false);
  });

  it("builds import preview from export package", () => {
    const db = session();
    const ws = createWorkspace(db, "Preview WS");
    const thread = createThread(db, ws.id, "T1");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Hi" });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));

    const preview = buildImportPreview(JSON.parse(json));
    expect(preview.valid).toBe(true);
    expect(preview.threadCount).toBe(1);
    expect(preview.messageCount).toBeGreaterThan(0);
  });

  it("imports with remapped IDs and preserves message timestamps", () => {
    const db = session();
    const ws = createWorkspace(db, "Source");
    const thread = createThread(db, ws.id, "Chat");
    const msg = insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Imported content",
    });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));

    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);
    expect(result.workspaceId).not.toBe(ws.id);

    const importedMsg = db
      .prepare("SELECT content, created_at FROM messages WHERE content = ?")
      .get("Imported content") as { content: string; created_at: string };
    expect(importedMsg.created_at).toBe(msg.createdAt);

    const origin = db
      .prepare("SELECT value FROM app_meta WHERE key LIKE 'workspace_import_origin_%'")
      .get() as { value: string };
    const meta = JSON.parse(origin.value) as {
      originalWorkspaceId: string;
      messageIdMap: Record<string, string>;
    };
    expect(meta.originalWorkspaceId).toBe(ws.id);
    expect(meta.messageIdMap[msg.id]).toBeTruthy();
    expect(meta.messageIdMap[msg.id]).not.toBe(msg.id);
  });

  it("imports in deterministic order", () => {
    const db = session();
    const ws = createWorkspace(db, "Order");
    const t1 = createThread(db, ws.id, "A");
    const t2 = createThread(db, ws.id, "B");
    insertMessage(db, { threadId: t1.id, role: "user", content: "m1" });
    insertMessage(db, { threadId: t2.id, role: "user", content: "m2" });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));

    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);

    const threads = db
      .prepare(
        "SELECT title FROM threads WHERE workspace_id = ? ORDER BY created_at ASC",
      )
      .all(result.workspaceId!) as Array<{ title: string }>;
    expect(threads.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("imports threads, messages, timeline events, and snapshots without FK failures", () => {
    const db = session();
    const ws = createWorkspace(db, "Full package");
    const thread = createThread(db, ws.id, "Timeline thread");
    insertMessage(db, { threadId: thread.id, role: "user", content: "timeline-msg" });
    createManualSnapshot(db, ws.id, {
      label: "Pre-import snap",
      threadId: thread.id,
    });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const pkg = parseExportPackageJson(json);
    expect(pkg.timelineEvents.length).toBeGreaterThan(0);
    expect(pkg.snapshots.length).toBeGreaterThan(0);

    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);

    const importedWsId = result.workspaceId!;
    expect(importedWsId).not.toBe(ws.id);

    const threadRow = db
      .prepare("SELECT workspace_id FROM threads WHERE workspace_id = ?")
      .get(importedWsId) as { workspace_id: string };
    expect(threadRow.workspace_id).toBe(importedWsId);

    const orphanTimeline = db
      .prepare(
        `SELECT COUNT(*) AS c FROM timeline_events te
         LEFT JOIN threads t ON t.id = te.thread_id
         WHERE te.workspace_id = ? AND te.thread_id IS NOT NULL AND t.id IS NULL`,
      )
      .get(importedWsId) as { c: number };
    expect(orphanTimeline.c).toBe(0);

    const importedMessages = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages m
         JOIN threads t ON t.id = m.thread_id
         WHERE t.workspace_id = ?`,
      )
      .get(importedWsId) as { c: number };
    expect(importedMessages.c).toBeGreaterThan(0);

    const origin = JSON.parse(
      (
        db
          .prepare("SELECT value FROM app_meta WHERE key = ?")
          .get(`workspace_import_origin_${importedWsId}`) as { value: string }
      ).value,
    ) as {
      originalWorkspaceId: string;
      threadIdMap: Record<string, string>;
      timelineEventIdMap: Record<string, string>;
    };
    expect(origin.originalWorkspaceId).toBe(ws.id);
    expect(origin.threadIdMap[thread.id]).not.toBe(thread.id);
    for (const evt of pkg.timelineEvents) {
      expect(origin.timelineEventIdMap[evt.id]).toBeTruthy();
      expect(origin.timelineEventIdMap[evt.id]).not.toBe(evt.id);
    }
  });

  it("rolls back entire import when a message references an unknown thread", () => {
    const db = session();
    const ws = createWorkspace(db, "Rollback");
    const thread = createThread(db, ws.id, "Only");
    insertMessage(db, { threadId: thread.id, role: "user", content: "ok" });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const pkg = parseExportPackageJson(json);
    pkg.messages.push({
      id: "orphan-msg",
      threadId: "missing-thread-id",
      role: "user",
      content: "bad",
      createdAt: new Date().toISOString(),
      messageStatus: "completed",
    } as (typeof pkg.messages)[number]);

    const before = db.prepare("SELECT COUNT(*) AS c FROM workspaces").get() as {
      c: number;
    };
    const result = executeWorkspaceImport(db, JSON.stringify(pkg));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/messages insert/i);

    const after = db.prepare("SELECT COUNT(*) AS c FROM workspaces").get() as { c: number };
    expect(after.c).toBe(before.c);

    const leaked = db
      .prepare("SELECT id FROM workspaces WHERE name LIKE ?")
      .get("Rollback (imported)") as { id: string } | undefined;
    expect(leaked).toBeUndefined();
  });

  it("encrypted import roundtrip preserves data with remapped foreign keys", () => {
    const db = session();
    const ws = createWorkspace(db, "Encrypted FK");
    const thread = createThread(db, ws.id, "Enc thread");
    insertMessage(db, { threadId: thread.id, role: "assistant", content: "enc-body" });
    createManualSnapshot(db, ws.id, { label: "Enc snap", threadId: thread.id });
    const bundle = buildVerifiedBackupBundle(db, ws.id);
    const enc = encryptBackupBundle(bundle, "encrypted-fk-pass-99");
    expect(enc.ok).toBe(true);

    const result = executeEncryptedImport(db, enc.json!, "encrypted-fk-pass-99");
    expect(result.ok).toBe(true);
    expect(result.workspaceId).not.toBe(ws.id);

    const importedWsId = result.workspaceId!;
    const msg = db
      .prepare(
        `SELECT m.id, t.workspace_id FROM messages m
         JOIN threads t ON t.id = m.thread_id
         WHERE m.content = ? AND t.workspace_id = ?`,
      )
      .get("enc-body", importedWsId) as { id: string; workspace_id: string } | undefined;
    expect(msg).toBeTruthy();
    expect(msg!.workspace_id).toBe(importedWsId);
    expect(msg!.workspace_id).not.toBe(ws.id);

    const leakedThread = db
      .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
      .get(ws.id) as { c: number };
    expect(leakedThread.c).toBeGreaterThan(0);

    const importedThread = db
      .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
      .get(importedWsId) as { c: number };
    expect(importedThread.c).toBeGreaterThan(0);
  });

  it("export package includes empty arrays when workspace has no messages", () => {
    const db = session();
    const ws = createWorkspace(db, "Empty export");
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const pkg = parseExportPackageJson(json);
    expect(Array.isArray(pkg.messages)).toBe(true);
    expect(Array.isArray(pkg.threads)).toBe(true);
    expect(Array.isArray(pkg.timelineEvents)).toBe(true);
    expect(Array.isArray(pkg.snapshots)).toBe(true);
    expect(pkg.messages).toHaveLength(0);
  });

  it("import remaps all foreign keys away from original workspace id", () => {
    const db = session();
    const ws = createWorkspace(db, "FK remap");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "fk-test" });
    createManualSnapshot(db, ws.id, { label: "snap", threadId: thread.id });
    const json = serializeExportPackage(buildWorkspaceExportPackage(db, ws.id));
    const result = executeWorkspaceImport(db, json);
    expect(result.ok).toBe(true);
    const newId = result.workspaceId!;

    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
          .get(newId) as { c: number }
      ).c,
    ).toBeGreaterThan(0);

    expect(
      (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM timeline_events WHERE workspace_id = ?",
          )
          .get(newId) as { c: number }
      ).c,
    ).toBeGreaterThan(0);

    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM snapshots WHERE workspace_id = ?")
          .get(newId) as { c: number }
      ).c,
    ).toBeGreaterThan(0);

    const importedCopy = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages m
         JOIN threads t ON t.id = m.thread_id
         WHERE m.content = ? AND t.workspace_id = ?`,
      )
      .get("fk-test", newId) as { c: number };
    expect(importedCopy.c).toBe(1);

    const originalCopy = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages m
         JOIN threads t ON t.id = m.thread_id
         WHERE m.content = ? AND t.workspace_id = ?`,
      )
      .get("fk-test", ws.id) as { c: number };
    expect(originalCopy.c).toBe(1);

    const importedRowsUseNewWorkspace = db
      .prepare(
        `SELECT COUNT(*) AS c FROM threads t
         INNER JOIN messages m ON m.thread_id = t.id
         WHERE m.content = ? AND t.workspace_id = ?`,
      )
      .get("fk-test", newId) as { c: number };
    expect(importedRowsUseNewWorkspace.c).toBe(1);

    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
          .get(newId) as { c: number }
      ).c,
    ).toBe(1);
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
          .get(ws.id) as { c: number }
      ).c,
    ).toBe(1);

    const orphanTimeline = db
      .prepare(
        `SELECT COUNT(*) AS c FROM timeline_events te
         LEFT JOIN threads t ON t.id = te.thread_id
         WHERE te.workspace_id = ? AND te.thread_id IS NOT NULL AND t.id IS NULL`,
      )
      .get(newId) as { c: number };
    expect(orphanTimeline.c).toBe(0);

    const origin = JSON.parse(
      (
        db
          .prepare("SELECT value FROM app_meta WHERE key = ?")
          .get(`workspace_import_origin_${newId}`) as { value: string }
      ).value,
    ) as { originalWorkspaceId: string; threadIdMap: Record<string, string> };
    expect(origin.originalWorkspaceId).toBe(ws.id);
    expect(origin.threadIdMap[thread.id]).not.toBe(thread.id);
  });
});
