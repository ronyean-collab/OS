import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  extractLongTermGoals,
  rebuildAiLifeFromHistory,
} from "../electron/main/services/ai-life-service";

describe("goal detection", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("detects explicitly stated long-term goals", () => {
    const db = session();
    const ws = createWorkspace(db, "Goals WS");
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

    const goals = extractLongTermGoals(db, ws.id, thread.id);
    expect(goals.length).toBeGreaterThan(0);
    expect(goals[0].confidenceScore).toBeGreaterThan(0.5);
    expect(goals[0].lastReferencedAt).toBeTruthy();
    expect(["active", "paused", "completed", "archived"]).toContain(goals[0].status);
  });

  it("rebuilds goals from conversation history alone", () => {
    const db = session();
    const ws = createWorkspace(db, "Rebuild Goals WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Objective is to reduce debt over the next year.",
    });
    db.prepare("DELETE FROM ai_life_goals WHERE workspace_id = ?").run(ws.id);
    const rebuilt = rebuildAiLifeFromHistory(db, ws.id);
    expect(rebuilt.rebuiltGoals).toBeGreaterThan(0);
  });
});
