import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import {
  DEFAULT_MESSAGE_PAGE_SIZE,
  insertMessage,
  listMessagesPage,
} from "../electron/main/services/message-service";
import { verifyWorkspaceExport } from "../electron/main/services/export-verification";
import { scanWorkspaceHealth } from "../electron/main/services/workspace-health";
import { computeDeterministicReplayHash, messagesToReplayHashInput } from "../electron/main/services/replay-hash";
import { reconstructThreadMessages } from "../electron/main/services/thread-reconstruction";
import { insertOrphanMessageRow } from "./helpers/corrupt-db";

describe("workspace health and pagination", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  it("paginates large threads newest-first internally with chronological display", () => {
    const db = session();
    const ws = createWorkspace(db, "Large thread");
    const thread = createThread(db, ws.id, "Big");

    const total = DEFAULT_MESSAGE_PAGE_SIZE + 15;
    for (let i = 0; i < total; i++) {
      const ts = new Date(Date.UTC(2026, 4, 18, 12, 0, i)).toISOString();
      db.prepare(
        `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, message_status, created_at)
         VALUES (?, ?, 'user', ?, NULL, NULL, NULL, 'completed', ?)`,
      ).run(`msg-${i}`, thread.id, `Message ${i}`, ts);
    }

    const firstPage = listMessagesPage(db, thread.id);
    expect(firstPage.totalCount).toBe(total);
    expect(firstPage.messages).toHaveLength(DEFAULT_MESSAGE_PAGE_SIZE);
    expect(firstPage.hasMoreOlder).toBe(true);

    for (let i = 1; i < firstPage.messages.length; i++) {
      expect(
        firstPage.messages[i].createdAt.localeCompare(
          firstPage.messages[i - 1].createdAt,
        ),
      ).toBeGreaterThanOrEqual(0);
    }

    const newest = firstPage.messages[firstPage.messages.length - 1];
    expect(newest.content).toBe(`Message ${total - 1}`);

    const secondPage = listMessagesPage(db, thread.id, {
      beforeCreatedAt: firstPage.oldestLoadedCreatedAt,
      beforeId: firstPage.oldestLoadedId,
    });
    expect(secondPage.messages.length).toBe(15);
    expect(secondPage.hasMoreOlder).toBe(false);

    const merged = [...secondPage.messages, ...firstPage.messages];
    const ids = merged.map((m) => m.id);
    expect(new Set(ids).size).toBe(total);
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i].createdAt.localeCompare(merged[i - 1].createdAt)).toBeGreaterThanOrEqual(
        0,
      );
    }
  });

  it("export verification blocks malformed workspace data", () => {
    const db = session();
    const ws = createWorkspace(db, "Export verify");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "OK" });

    const ok = verifyWorkspaceExport(db, ws.id);
    expect(ok.ok).toBe(true);
    expect(ok.replayHash).toMatch(/^replay-/);
    expect(ok.checksumPlaceholder).toMatch(/^export-/);

    insertOrphanMessageRow(db, {
      id: "orphan-msg",
      threadId: "missing-thread",
      content: "orphan",
    });

    const bad = verifyWorkspaceExport(db, ws.id);
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((e) => e.startsWith("orphaned-messages"))).toBe(true);
  });

  it("scanWorkspaceHealth reports replay integrity and export status", () => {
    const db = session();
    const ws = createWorkspace(db, "Health scan");
    const thread = createThread(db, ws.id, "T");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Ping" });

    const report = scanWorkspaceHealth(db, ws.id);
    const messages = reconstructThreadMessages(db, thread.id).messages;
    const expectedHash = computeDeterministicReplayHash(
      messagesToReplayHashInput(messages),
    );

    expect(report.replayIntegrityOk).toBe(true);
    expect(report.replayHash).toBe(expectedHash);
    expect(report.exportValidationOk).toBe(true);
    expect(["healthy", "attention"]).toContain(report.status);
  });
});
