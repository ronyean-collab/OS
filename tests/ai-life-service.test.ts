import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace, updateContinuitySummary } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  analyzeAiLife,
  calculateAiLifeHealth,
  extractRecurringInterests,
  generateAiLifeSummary,
} from "../electron/main/services/ai-life-service";

describe("ai life service", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("analyzeAiLife returns operational goals and projects without profiling", () => {
    const db = session();
    const ws = createWorkspace(db, "ContinuityOS");
    updateContinuitySummary(db, ws.id, "Build ContinuityOS as the continuity layer.");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "My goal is to launch CS2Coach after ContinuityOS ships.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "You seem like an introvert who might have anxiety.",
    });

    const analysis = analyzeAiLife(db, ws.id);
    expect(analysis.goals.some((g) => /ContinuityOS|CS2Coach|launch/i.test(g.goal))).toBe(true);
    expect(analysis.goals.some((g) => /introvert|anxiety/i.test(g.goal))).toBe(false);
    expect(analysis.activeProjects.length).toBeGreaterThan(0);
    expect(analysis.aiLifeScore).toBeGreaterThan(0);
  });

  it("generateAiLifeSummary produces snapshot sections", () => {
    const db = session();
    const ws = createWorkspace(db, "Life WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS Provider Independence milestone.",
    });
    const snapshot = generateAiLifeSummary(db, ws.id);
    expect(snapshot.markdown).toContain("# AI Life Snapshot");
    expect(snapshot.markdown).toContain("Current Goals");
    expect(snapshot.markdown).toContain("Assistant History");
  });

  it("calculateAiLifeHealth persists internal metrics", () => {
    const db = session();
    const ws = createWorkspace(db, "Health WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Goal: reduce debt and improve fitness tracking project.",
    });
    analyzeAiLife(db, ws.id);
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM ai_life_health_metrics WHERE workspace_id = ?")
      .get(ws.id) as { c: number };
    expect(row.c).toBeGreaterThan(0);
    const health = calculateAiLifeHealth(db, ws.id);
    expect(health.aiLifeCoverage).toBeGreaterThan(0);
    expect(health.rebuildConfidence).toBeGreaterThan(0);
  });

  it("extractRecurringInterests requires repeated operational mentions", () => {
    const db = session();
    const ws = createWorkspace(db, "Interests WS");
    const thread = createThread(db, ws.id, "Main");
    for (let i = 0; i < 3; i += 1) {
      insertMessage(db, {
        threadId: thread.id,
        role: "user",
        content: "Interested in local-first continuity architecture for desktop apps.",
      });
    }
    const interests = extractRecurringInterests(db, ws.id);
    expect(interests.length).toBeGreaterThan(0);
    expect(interests[0].mentionCount).toBeGreaterThanOrEqual(2);
  });
});
