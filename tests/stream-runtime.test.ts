import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { MockProviderAdapter } from "../electron/main/providers/mock-adapter";
import {
  getProviderAdapter,
  registerProviderAdapter,
  resetProviderAdapters,
} from "../electron/main/providers";
import {
  cancelStream,
  startAssistantStream,
} from "../electron/main/services/stream-runtime";
import { MemorySecureStorageStub } from "../electron/main/secure-storage/memory-stub";
import { __setSecureStorageForTests } from "../electron/main/secure-storage";
import { listMessages, insertMessage } from "../electron/main/services/message-service";
import {
  createThread,
  createWorkspace,
  updateContinuitySummary,
} from "../electron/main/services/workspace-service";
import { DEFAULT_CONTEXT_MESSAGE_LIMIT } from "../electron/main/services/context-assembly";

const mockSender = {
  isDestroyed: () => false,
  send: vi.fn(),
} as unknown as import("electron").WebContents;

describe("stream runtime", () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    resetProviderAdapters();
    const mock = new MockProviderAdapter();
    mock.chunks = ["Partial", " ", "response"];
    registerProviderAdapter("openai", mock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetProviderAdapters();
    __setSecureStorageForTests(null);
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s.db;
  }

  function setupProvider(db: ReturnType<typeof session>) {
    const stub = new MemorySecureStorageStub();
    __setSecureStorageForTests(stub);
    const ws = createWorkspace(db, "Stream WS");
    const thread = createThread(db, ws.id, "Chat");
    const ref = stub.buildRef(ws.id, "openai");
    const stored = stub.setKey(ref, "sk-test");
    expect(stored.ok).toBe(true);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO provider_configs (id, workspace_id, provider, model, enabled, secure_key_ref, created_at, updated_at)
       VALUES ('pc1', ?, 'openai', 'gpt-4o-mini', 1, ?, ?, ?)`,
    ).run(ws.id, ref, now, now);
    return { ws, thread };
  }

  it("persists user message then streams assistant without duplicate rows", async () => {
    const db = session();
    const { thread } = setupProvider(db);

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Hello stream",
    });

    expect(result.streamId).toBeTruthy();
    expect(result.userMessage.content).toBe("Hello stream");

    await new Promise((r) => setTimeout(r, 50));

    const messages = listMessages(db, thread.id);
    expect(messages).toHaveLength(2);
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Partial response");
    expect(assistant?.messageStatus).toBe("completed");
    expect(assistant?.rawProviderPayload).toContain("mock");
  });

  it("preserves partial content on cancellation", async () => {
    const db = session();
    const { thread } = setupProvider(db);
    const mock = getProviderAdapter("openai") as MockProviderAdapter;
    mock.chunks = ["One", " Two", " Three"];
    mock.delayMs = 30;

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Cancel me",
    });

    await new Promise((r) => setTimeout(r, 20));
    cancelStream(db, result.streamId!, mockSender);
    await new Promise((r) => setTimeout(r, 80));

    const assistant = listMessages(db, thread.id).find((m) => m.role === "assistant");
    expect(assistant?.content.length).toBeGreaterThan(0);
    expect(assistant?.messageStatus).toBe("cancelled");

    const cancelled = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE event_type = 'assistant_response_cancelled'",
      )
      .get() as { c: number };
    expect(cancelled.c).toBeGreaterThan(0);
  });

  it("passes continuity summary into provider context without mutating messages", async () => {
    const db = session();
    const { ws, thread } = setupProvider(db);
    updateContinuitySummary(db, ws.id, "Prefer strict TypeScript and local SQLite.");

    for (let i = 0; i < DEFAULT_CONTEXT_MESSAGE_LIMIT + 5; i++) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: `history-${i}`,
      });
    }

    const mock = getProviderAdapter("openai") as MockProviderAdapter;
    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Latest user turn",
    });

    expect(result.streamId).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));

    expect(mock.lastStreamRequest).toBeTruthy();
    const ctx = mock.lastStreamRequest!.messages;
    const system = ctx.find((m) => m.role === "system");
    expect(system?.content).toContain("Prefer strict TypeScript and local SQLite.");
    expect(system?.content).toContain("Project: Stream WS");
    expect(ctx[ctx.length - 1].content).toBe("Latest user turn");

    const userTurns = ctx.filter((m) => m.role === "user");
    expect(userTurns.length).toBeLessThanOrEqual(DEFAULT_CONTEXT_MESSAGE_LIMIT + 1);

    const persisted = listMessages(db, thread.id);
    expect(persisted.some((m) => m.content === "history-0")).toBe(true);
    expect(persisted.some((m) => m.content === "Latest user turn")).toBe(true);
    expect(persisted.filter((m) => m.role === "user").length).toBe(
      DEFAULT_CONTEXT_MESSAGE_LIMIT + 6,
    );
  });

  it("returns calm error when no provider is configured", async () => {
    const db = session();
    const ws = createWorkspace(db, "No provider");
    const thread = createThread(db, ws.id, "Chat");

    const result = await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Hello",
    });

    expect(result.userMessage?.content).toBe("Hello");
    expect(result.assistantMessage).toBeNull();
    expect(result.error).toMatch(/Choose an AI provider/i);
    expect(listMessages(db, thread.id)).toHaveLength(1);
    expect(listMessages(db, thread.id)[0].content).toBe("Hello");
  });

  it("records failure timeline event on stream error", async () => {
    const db = session();
    const { thread } = setupProvider(db);
    const mock = getProviderAdapter("openai") as MockProviderAdapter;
    mock.shouldFail = true;

    await startAssistantStream(db, mockSender, {
      threadId: thread.id,
      content: "Fail please",
    });

    await new Promise((r) => setTimeout(r, 30));

    const failed = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE event_type = 'assistant_response_failed'",
      )
      .get() as { c: number };
    expect(failed.c).toBeGreaterThan(0);

    const messages = listMessages(db, thread.id);
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1);
    expect(messages.some((message) => message.content === "Fail please")).toBe(true);
  });
});
