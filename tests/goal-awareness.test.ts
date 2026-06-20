import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildConversationAwarenessContext,
  determineRelevantGoals,
} from "../electron/main/services/continuity-awareness-service";
import { analyzeAiLife } from "../electron/main/services/ai-life-service";

describe("goal awareness", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("surfaces goals only when message is relevant", () => {
    const db = session();
    const ws = createWorkspace(db, "Goals");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "My goal is to build ContinuityOS and launch CS2Coach.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Long-term goal: improve fitness with a simple tracking workflow.",
    });
    analyzeAiLife(db, ws.id);

    const relevant = determineRelevantGoals(
      db,
      ws.id,
      thread.id,
      "Where are we on the ContinuityOS launch goal?",
    );
    expect(relevant.length).toBeGreaterThan(0);
    expect(relevant.some((entry) => /continuity/i.test(entry.item.goal))).toBe(true);
  });

  it("does not force goals into unrelated conversation", () => {
    const db = session();
    const ws = createWorkspace(db, "Goals");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "My goal is to build ContinuityOS.",
    });
    analyzeAiLife(db, ws.id);

    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "What is the capital of France?",
      recentMessages: [],
    });
    expect(result.relevantGoals).toHaveLength(0);
    expect(result.awarenessBlock).not.toContain("ContinuityOS");
  });
});
