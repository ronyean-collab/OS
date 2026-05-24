import Database from "better-sqlite3";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { runMigrations } from "../electron/main/database/migrations";
import {
  createThread,
  createWorkspace,
  getActiveThreadId,
  getActiveWorkspaceId,
  listThreads,
} from "../electron/main/services/workspace-service";
import { listMessages, insertMessage } from "../electron/main/services/message-service";
import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";

describe("persistence services", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  it("persists workspace and restores active workspace id", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Persistence Lab");
    expect(ws.name).toBe("Persistence Lab");
    expect(getActiveWorkspaceId(db)).toBe(ws.id);
  });

  it("persists thread under workspace", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Thread WS");
    const thread = createThread(db, ws.id, "Main chat");
    const threads = listThreads(db, ws.id);
    expect(threads.some((t) => t.id === thread.id)).toBe(true);
    expect(getActiveThreadId(db)).toBe(thread.id);
  });

  it("persists messages with raw provider payload", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Message WS");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Hello continuity",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Ack",
      provider: "openai",
      model: "gpt-4o-mini",
      rawProviderPayload: { placeholder: true, tokens: 1 },
    });

    const messages = listMessages(db, thread.id);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Hello continuity");
    expect(messages[1].rawProviderPayload).toContain("placeholder");
  });

  it("records timeline events for workspace, thread, and message", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Timeline WS");
    const thread = createThread(db, ws.id, "T1");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Event test",
    });

    const events = db
      .prepare(
        "SELECT event_type FROM timeline_events WHERE workspace_id = ? ORDER BY created_at ASC",
      )
      .all(ws.id) as { event_type: string }[];

    const types = events.map((e) => e.event_type);
    expect(types).toContain("workspace_created");
    expect(types).toContain("thread_created");
    expect(types).toContain("message_added");
    expect(types.filter((t) => t === "snapshot_created").length).toBeGreaterThan(0);
  });

  it("stores provider secure ref in SQLite not plaintext API key", () => {
    const { db } = session();
    const stub = new MemorySecureStorageStub();
    const ws = createWorkspace(db, "Provider WS");
    const ref = stub.buildRef(ws.id, "openai");
    const stored = stub.setKey(ref, "sk-test-secret");
    expect(stored.ok).toBe(true);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO provider_configs (id, workspace_id, provider, model, enabled, secure_key_ref, created_at, updated_at)
       VALUES ('pc1', ?, 'openai', 'gpt-4o-mini', 1, ?, ?, ?)`,
    ).run(ws.id, ref, now, now);

    const row = db
      .prepare("SELECT secure_key_ref FROM provider_configs WHERE workspace_id = ?")
      .get(ws.id) as { secure_key_ref: string };

    expect(row.secure_key_ref).toBe(ref);
    expect(row.secure_key_ref).not.toContain("sk-test");
    expect(stub.getKey(ref)).toBe("sk-test-secret");
  });

  it("simulates app restart by reopening the same database file", () => {
    const first = openTestDatabase();
    const ws = createWorkspace(first.db, "Restart WS");
    const thread = createThread(first.db, ws.id, "After restart");
    insertMessage(first.db, {
      threadId: thread.id,
      role: "user",
      content: "Survives restart",
    });
    first.db.close();

    const reopened = new Database(first.dbPath);
    reopened.pragma("foreign_keys = ON");
    runMigrations(reopened, first.dbPath);

    expect(getActiveWorkspaceId(reopened)).toBe(ws.id);
    expect(getActiveThreadId(reopened)).toBe(thread.id);
    expect(listMessages(reopened, thread.id)[0].content).toBe("Survives restart");
    reopened.close();
    first.cleanup();
  });
});
