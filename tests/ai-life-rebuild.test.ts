import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  rebuildAiLifeFromHistory,
  runAiLifeScaleSimulation,
  simulateAiLifeLossAndRebuild,
} from "../electron/main/services/ai-life-service";
import { generateProjectTimeline } from "../electron/main/services/continuity-intelligence-service";

describe("ai life rebuild", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("rebuilds AI Life from conversation and continuity records", () => {
    const db = session();
    const ws = createWorkspace(db, "Rebuild WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "My goal is to build ContinuityOS with Provider Independence.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS active project tracking.",
    });

    const result = simulateAiLifeLossAndRebuild(db, ws.id, thread.id);
    expect(result.goalsRecovered).toBeGreaterThan(0);
    expect(result.projectsRecovered).toBeGreaterThan(0);
    expect(result.rebuildSuccessful).toBe(true);
    expect(result.afterRebuildScore).toBeGreaterThanOrEqual(result.afterLossScore);
  });

  it("rebuildAiLifeFromHistory uses messages as truth", () => {
    const db = session();
    const ws = createWorkspace(db, "Truth WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Completed and shipped Continuity Intelligence milestone.",
    });
    db.prepare("DELETE FROM ai_life_goals WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM ai_life_projects WHERE workspace_id = ?").run(ws.id);
    db.prepare("DELETE FROM ai_life_achievements WHERE workspace_id = ?").run(ws.id);
    const rebuilt = rebuildAiLifeFromHistory(db, ws.id);
    expect(rebuilt.rebuiltAchievements + rebuilt.rebuiltProjects).toBeGreaterThan(0);
    const timeline = generateProjectTimeline(db, ws.id);
    expect(timeline.length).toBeGreaterThan(1);
  });
});

describe("ai life scale testing", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("handles 10k message AI Life scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 10k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAiLifeScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 10_000,
      label: "life-10k",
    });
    expect(result.messageCount).toBe(10_000);
    expect(result.rebuildSuccess).toBe(true);
    expect(result.goalsRetained).toBeGreaterThan(0);
    expect(result.projectsRetained).toBeGreaterThan(0);
    expect(result.timelineRetained).toBeGreaterThan(1);
  }, 180_000);

  it("handles 50k message AI Life scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 50k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAiLifeScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 50_000,
      label: "life-50k",
    });
    expect(result.rebuildSuccess).toBe(true);
    expect(result.goalsRetained).toBeGreaterThan(0);
  }, 600_000);

  it("handles 100k message AI Life scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Scale 100k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAiLifeScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 100_000,
      label: "life-100k",
    });
    expect(result.rebuildSuccess).toBe(true);
    expect(result.timelineRetained).toBeGreaterThan(1);
  }, 900_000);
});
