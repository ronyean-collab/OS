import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { extractAssistantHistory } from "../electron/main/services/ai-life-service";

describe("assistant history", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("includes assistant created and capability milestones", () => {
    const db = session();
    const ws = createWorkspace(db, "Assistant History WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: Assistant Identity Layer implemented for all providers.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Provider Independence adopted for ContinuityOS chat runtime.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Continuity Intelligence Added as operational continuity layer.",
    });

    const history = extractAssistantHistory(db, ws.id);
    expect(history.some((h) => h.eventTitle === "Assistant Created")).toBe(true);
    expect(history.some((h) => /Identity Layer|Provider Independence|Continuity Intelligence/i.test(h.eventTitle))).toBe(
      true,
    );
    for (let i = 1; i < history.length; i += 1) {
      expect(history[i].occurredAt.localeCompare(history[i - 1].occurredAt)).toBeGreaterThanOrEqual(0);
    }
  });
});
