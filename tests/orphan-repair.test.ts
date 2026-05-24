import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import {
  insertMessage,
  assertMessageThreadContext,
} from "../electron/main/services/message-service";
import {
  buildOrphanRepairPreview,
  countOrphanedMessages,
  executeAttachOrphansToRecoveredThread,
  executeQuarantineOrphanedMessages,
  listOrphanedMessageRows,
  ORPHAN_QUARANTINE_META_KEY,
} from "../electron/main/services/orphan-repair";
import {
  buildWorkspaceExportPackage,
  validateWorkspaceForExport,
} from "../electron/main/services/workspace-export";
import { startAssistantStream } from "../electron/main/services/stream-runtime";
import { getMeta } from "../electron/main/services/workspace-service";
import { insertOrphanMessageRow } from "./helpers/corrupt-db";

describe("orphan messages", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  function insertOrphan(db: ReturnType<typeof session>, threadId: string, id: string) {
    insertOrphanMessageRow(db, { id, threadId, content: "orphan body" });
  }

  it("insertMessage rejects missing thread", () => {
    const db = session();
    expect(() =>
      insertMessage(db, {
        threadId: "missing-thread",
        role: "user",
        content: "nope",
      }),
    ).toThrow(/thread or workspace does not exist/i);
    expect(countOrphanedMessages(db)).toBe(0);
  });

  it("stream runtime rejects missing thread without creating messages", async () => {
    const db = session();
    const fakeSender = { isDestroyed: () => false, send: () => {} };
    const result = await startAssistantStream(
      db,
      fakeSender as import("electron").WebContents,
      {
        threadId: "ghost-thread",
        content: "hello",
      },
    );
    expect(result.error).toMatch(/thread or workspace/i);
    expect(result.userMessage).toBeNull();
    expect(result.assistantMessage).toBeNull();
    expect(countOrphanedMessages(db)).toBe(0);
  });

  it("export validation catches orphaned messages", () => {
    const db = session();
    const ws = createWorkspace(db, "Export block");
    insertOrphan(db, "deleted-thread", "orphan-1");
    const validation = validateWorkspaceForExport(db, ws.id);
    expect(validation.ok).toBe(false);
    expect(validation.errors.some((e) => e.startsWith("orphaned-messages:"))).toBe(
      true,
    );
  });

  it("attach repair recovers orphans and export passes", () => {
    const db = session();
    const ws = createWorkspace(db, "Repair attach");
    insertOrphan(db, "stale-thread-a", "orphan-a");
    insertOrphan(db, "stale-thread-b", "orphan-b");

    const preview = buildOrphanRepairPreview(db, ws.id);
    expect(preview.orphanCount).toBe(2);

    const repair = executeAttachOrphansToRecoveredThread(db, ws.id);
    expect(repair.ok).toBe(true);
    expect(repair.repairedCount).toBe(2);
    expect(countOrphanedMessages(db)).toBe(0);

    const validation = validateWorkspaceForExport(db, ws.id);
    expect(validation.ok).toBe(true);

    const pkg = buildWorkspaceExportPackage(db, ws.id);
    expect(pkg.messages.some((m) => m.content === "orphan body")).toBe(true);
  });

  it("quarantine moves orphans to metadata and clears messages table", () => {
    const db = session();
    const ws = createWorkspace(db, "Repair quarantine");
    insertOrphan(db, "gone-thread", "orphan-q");

    const repair = executeQuarantineOrphanedMessages(db, ws.id);
    expect(repair.ok).toBe(true);
    expect(repair.quarantinedCount).toBe(1);
    expect(countOrphanedMessages(db)).toBe(0);

    const raw = getMeta(db, ORPHAN_QUARANTINE_META_KEY);
    expect(raw).toBeTruthy();
    const records = JSON.parse(raw!) as Array<{ messageId: string }>;
    expect(records.some((r) => r.messageId === "orphan-q")).toBe(true);
  });

  it("attach repair rolls back on failure without partial workspace thread", () => {
    const db = session();
    const ws = createWorkspace(db, "Rollback");
    insertOrphan(db, "bad-thread", "orphan-r");
    const beforeThreads = (
      db.prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?").get(
        ws.id,
      ) as { c: number }
    ).c;

    expect(() =>
      executeAttachOrphansToRecoveredThread(db, "missing-workspace"),
    ).not.toThrow();

    const result = executeAttachOrphansToRecoveredThread(db, "missing-workspace");
    expect(result.ok).toBe(false);
    expect(countOrphanedMessages(db)).toBe(1);

    const afterThreads = (
      db.prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?").get(
        ws.id,
      ) as { c: number }
    ).c;
    expect(afterThreads).toBe(beforeThreads);
  });

  it("lists diagnostic orphan rows", () => {
    const db = session();
    insertOrphan(db, "x-thread", "diag-1");
    const rows = listOrphanedMessageRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("diag-1");
  });

  it("assertMessageThreadContext rejects wrong workspace", () => {
    const db = session();
    const wsA = createWorkspace(db, "A");
    const wsB = createWorkspace(db, "B");
    const thread = createThread(db, wsA.id, "Only A");
    expect(() => assertMessageThreadContext(db, thread.id, wsB.id)).toThrow(
      /does not belong/i,
    );
  });
});
