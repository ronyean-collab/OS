import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  rebuildIntelligenceFromHistory,
  runScaleSimulation,
  simulateIntelligenceLossAndRebuild,
} from "../electron/main/services/continuity-intelligence-service";

describe("continuity rebuild", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("rebuilds continuity from conversation history after memory loss", () => {
    const db = session();
    const ws = createWorkspace(db, "Rebuild WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: Provider Independence adopted.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Open question: how should continuity snapshots be versioned?",
    });

    const result = simulateIntelligenceLossAndRebuild(db, ws.id, thread.id);
    expect(result.decisionsRecovered).toBeGreaterThan(0);
    expect(result.openQuestionsRecovered).toBeGreaterThan(0);
    expect(result.rebuildSuccessful).toBe(true);
    expect(result.afterRebuildScore).toBeGreaterThanOrEqual(result.afterCorruptionScore);
  });

  it("survives partial corruption of derived intelligence tables", () => {
    const db = session();
    const ws = createWorkspace(db, "Partial Corruption WS");
    const thread = createThread(db, ws.id, "Main");
    for (let i = 0; i < 12; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Decision ${i}: continuity rebuild must preserve canonical messages.`,
      });
    }
    db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(ws.id);
    const rebuilt = rebuildIntelligenceFromHistory(db, ws.id);
    expect(rebuilt.rebuiltDecisions).toBeGreaterThan(0);
    expect(rebuilt.continuityScore).toBeGreaterThan(0.2);
  });
});

describe("continuity intelligence scale testing", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("handles 10k message scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 10k");
    const thread = createThread(db, ws.id, "Main");
    const result = runScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 10_000,
      label: "scale-10k",
    });
    expect(result.messageCount).toBe(10_000);
    expect(result.rebuildSuccess).toBe(true);
    expect(result.timelineEvents).toBeGreaterThan(1);
    expect(result.decisionsExtracted).toBeGreaterThan(0);
    expect(result.continuityScore).toBeGreaterThan(0.2);
    expect(result.memoryDrift).toBeLessThanOrEqual(1);
  }, 120_000);

  it("handles 50k message scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 50k");
    const thread = createThread(db, ws.id, "Main");
    const result = runScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 50_000,
      label: "scale-50k",
    });
    expect(result.messageCount).toBe(50_000);
    expect(result.rebuildSuccess).toBe(true);
    expect(result.decisionsExtracted).toBeGreaterThan(0);
  }, 300_000);

  it("handles 100k message scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 100k");
    const thread = createThread(db, ws.id, "Main");
    const result = runScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 100_000,
      label: "scale-100k",
    });
    expect(result.messageCount).toBe(100_000);
    expect(result.rebuildSuccess).toBe(true);
    expect(result.timelineEvents).toBeGreaterThan(1);
  }, 600_000);
});
