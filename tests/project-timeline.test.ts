import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { generateProjectTimeline } from "../electron/main/services/continuity-intelligence-service";

describe("project timeline generation", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("includes project created and chronological continuity events", () => {
    const db = session();
    const ws = createWorkspace(db, "Timeline WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Continuity Intelligence Added as the next major layer.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Provider Independence Completed for all supported engines.",
    });

    const timeline = generateProjectTimeline(db, ws.id);
    expect(timeline.some((event) => event.title === "Project Created")).toBe(true);
    expect(timeline.length).toBeGreaterThan(2);
    for (let i = 1; i < timeline.length; i += 1) {
      expect(timeline[i].occurredAt.localeCompare(timeline[i - 1].occurredAt)).toBeGreaterThanOrEqual(
        0,
      );
    }
  });

  it("timeline is reconstructable after intelligence tables are cleared", () => {
    const db = session();
    const ws = createWorkspace(db, "Timeline Rebuild WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: Assistant Identity Layer implemented for all providers.",
    });

    const before = generateProjectTimeline(db, ws.id);
    db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(ws.id);
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: Assistant Identity Layer implemented for all providers.",
    });
    const after = generateProjectTimeline(db, ws.id);
    expect(after.length).toBeGreaterThanOrEqual(before.length - 1);
  });
});
