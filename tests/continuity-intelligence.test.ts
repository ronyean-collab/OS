import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  analyzeConversation,
  calculateContinuityHealthMetrics,
  calculateContinuityScore,
  extractContinuitySignals,
  scoreContinuityItem,
} from "../electron/main/services/continuity-intelligence-service";

describe("continuity intelligence service", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("scores low importance for casual preferences and high for architecture decisions", () => {
    const pizza = scoreContinuityItem({ kind: "preference", content: "User likes pizza." });
    const auth = scoreContinuityItem({
      kind: "decision",
      content: "Authentication strategy changed to local-first secure storage.",
    });
    expect(pizza.importanceTier).toBe("low");
    expect(auth.importanceScore).toBeGreaterThan(pizza.importanceScore);
    expect(auth.importanceTier).toMatch(/high|very_high|critical/);
  });

  it("extracts continuity signals from conversation", () => {
    const db = session();
    const ws = createWorkspace(db, "Signals WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "We decided to adopt Provider Independence as the architecture strategy.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Open question: should continuity snapshots include health metrics?",
    });

    const signals = extractContinuitySignals(db, { workspaceId: ws.id, threadId: thread.id });
    expect(signals.some((s) => s.kind === "decision")).toBe(true);
    expect(signals.some((s) => s.kind === "open_question")).toBe(true);
  });

  it("analyzeConversation returns decisions, open questions, and health metrics", () => {
    const db = session();
    const ws = createWorkspace(db, "Analysis WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Decision: Conversation history is the source of truth for continuity rebuild.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Still need to decide whether web search runs before every provider call?",
    });

    const analysis = analyzeConversation(db, ws.id, thread.id);
    expect(analysis.decisions.length).toBeGreaterThan(0);
    expect(analysis.openQuestions.length).toBeGreaterThan(0);
    expect(analysis.continuityScore).toBeGreaterThan(0.2);
    expect(analysis.health.continuityCoverage).toBeGreaterThan(0);
    expect(analysis.health.rebuildConfidence).toBeGreaterThan(0);
  });

  it("persists health metrics internally", () => {
    const db = session();
    const ws = createWorkspace(db, "Health WS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Milestone: Continuity Intelligence Engine added to the runtime.",
    });
    calculateContinuityHealthMetrics(db, ws.id, thread.id);
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM continuity_health_metrics WHERE workspace_id = ?")
      .get(ws.id) as { c: number };
    expect(row.c).toBe(0);
    analyzeConversation(db, ws.id, thread.id);
    const after = db
      .prepare("SELECT COUNT(*) AS c FROM continuity_health_metrics WHERE workspace_id = ?")
      .get(ws.id) as { c: number };
    expect(after.c).toBeGreaterThan(0);
  });

  it("calculateContinuityScore increases with substantive project content", () => {
    const db = session();
    const ws = createWorkspace(db, "Score WS");
    const thread = createThread(db, ws.id, "Main");
    const emptyScore = calculateContinuityScore(db, ws.id, thread.id);
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Major product decision: Provider Independence adopted for all chat engines.",
    });
    const filledScore = calculateContinuityScore(db, ws.id, thread.id);
    expect(filledScore).toBeGreaterThanOrEqual(emptyScore);
  });
});
