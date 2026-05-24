import { describe, expect, it } from "vitest";
import {
  assembleThreadContext,
  estimateTokensPlaceholder,
} from "../electron/main/services/context-assembly";
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
});
