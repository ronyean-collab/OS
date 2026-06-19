import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  extractProjectDecisions,
  rebuildIntelligenceFromHistory,
} from "../electron/main/services/continuity-intelligence-service";

describe("decision extraction", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("extracts structured decision records automatically", () => {
    const db = session();
    const ws = createWorkspace(db, "Decisions WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "2026-05: Provider Independence adopted for ContinuityOS chat runtime.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "assistant",
      content: "Decision: Conversation History declared source of truth for rebuild.",
    });

    const decisions = extractProjectDecisions(db, ws.id, thread.id);
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0].title.length).toBeGreaterThan(0);
    expect(decisions[0].scores.importanceScore).toBeGreaterThan(0.4);
    expect(decisions[0].decidedAt).toMatch(/^\d{4}-\d{2}$/);
  });

  it("deduplicates repeated decision mentions", () => {
    const db = session();
    const ws = createWorkspace(db, "Dedup WS");
    const thread = createThread(db, ws.id, "Main");
    for (let i = 0; i < 3; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: "We decided to move development workflow to Cursor for daily driver work.",
      });
    }
    const decisions = extractProjectDecisions(db, ws.id, thread.id);
    expect(decisions.length).toBe(1);
  });

  it("rebuilds decisions from conversation history alone", () => {
    const db = session();
    const ws = createWorkspace(db, "Rebuild Decisions WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Assistant Identity Layer implemented as canonical prompt foundation.",
    });
    db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(ws.id);
    const rebuilt = rebuildIntelligenceFromHistory(db, ws.id);
    expect(rebuilt.rebuiltDecisions).toBeGreaterThan(0);
    const stored = db
      .prepare("SELECT COUNT(*) AS c FROM continuity_decision_records WHERE workspace_id = ?")
      .get(ws.id) as { c: number };
    expect(stored.c).toBe(rebuilt.rebuiltDecisions);
  });
});
