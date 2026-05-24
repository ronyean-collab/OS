import { describe, expect, it } from "vitest";
import {
  assembleProviderContext,
  assembleThreadContext,
  DEFAULT_CONTEXT_MESSAGE_LIMIT,
  estimateTokensPlaceholder,
} from "../electron/main/services/context-assembly";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import {
  DEFAULT_MESSAGE_PAGE_SIZE,
  listMessages,
} from "../electron/main/services/message-service";
import type { Message } from "../src/shared/types";

function msg(
  id: string,
  role: Message["role"],
  content: string,
  createdAt: string,
): Message {
  return {
    id,
    threadId: "th-1",
    role,
    content,
    provider: null,
    model: null,
    rawProviderPayload: null,
    createdAt,
  };
}

describe("context assembly", () => {
  it("preserves role ordering chronologically", () => {
    const messages = [
      msg("1", "user", "First", "2026-01-01T00:00:00.000Z"),
      msg("2", "assistant", "Reply", "2026-01-01T00:01:00.000Z"),
      msg("3", "user", "Second", "2026-01-01T00:02:00.000Z"),
    ];
    const { messages: ctx } = assembleThreadContext(messages);
    expect(ctx.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(ctx[2].content).toBe("Second");
  });

  it("limits to recent messages", () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      msg(String(i), "user", `m${i}`, `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`),
    );
    const { messages: ctx } = assembleThreadContext(messages, { maxMessages: 10 });
    expect(ctx).toHaveLength(10);
    expect(ctx[0].content).toBe("m40");
  });

  it("estimates tokens with placeholder", () => {
    const tokens = estimateTokensPlaceholder([{ role: "user", content: "12345678" }]);
    expect(tokens).toBe(2);
  });

  it("assembleProviderContext keeps recent message limit with summary", () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      msg(String(i), "user", `m${i}`, `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`),
    );
    const { messages: ctx } = assembleProviderContext({
      workspaceName: "Cap",
      continuitySummary: "Notes",
      messages,
      maxMessages: 10,
    });
    expect(ctx[0].role).toBe("system");
    expect(ctx.filter((m) => m.role === "user")).toHaveLength(10);
    expect(ctx[ctx.length - 1].content).toBe("m49");
  });

  it("listMessages does not load unbounded history for large threads", () => {
    const s = openTestDatabase();
    try {
      const ws = createWorkspace(s.db, "Context cap");
      const thread = createThread(s.db, ws.id, "T");
      const total = DEFAULT_MESSAGE_PAGE_SIZE + 25;
      for (let i = 0; i < total; i++) {
        const ts = new Date(Date.UTC(2026, 5, 1, 10, 0, i)).toISOString();
        s.db
          .prepare(
            `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, message_status, created_at)
             VALUES (?, ?, 'user', ?, NULL, NULL, NULL, 'completed', ?)`,
          )
          .run(`cap-${i}`, thread.id, `m${i}`, ts);
      }
      const loaded = listMessages(s.db, thread.id);
      expect(loaded.length).toBeLessThanOrEqual(DEFAULT_MESSAGE_PAGE_SIZE * 2);
      expect(loaded.length).toBeGreaterThanOrEqual(DEFAULT_CONTEXT_MESSAGE_LIMIT);
      expect(loaded[loaded.length - 1].content).toBe(`m${total - 1}`);
    } finally {
      s.cleanup();
    }
  });
});
