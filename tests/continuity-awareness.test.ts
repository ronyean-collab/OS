import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  buildConversationAwarenessContext,
  calculateAwarenessConfidence,
  determineRelevantContinuity,
  runAwarenessScaleSimulation,
} from "../electron/main/services/continuity-awareness-service";
import {
  analyzeAiLife,
  extractActiveProjects,
  extractLongTermGoals,
} from "../electron/main/services/ai-life-service";
import { analyzeConversation } from "../electron/main/services/continuity-intelligence-service";

describe("continuity awareness service", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  function seedWorkspace(db: ReturnType<typeof session>) {
    const ws = createWorkspace(db, "ContinuityOS");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "My goal is to build ContinuityOS with Provider Independence.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "We decided to adopt multi-provider chat and prioritize provider continuity.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS provider layer — open question: which adapter ships first?",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Also building CS2Coach as a separate initiative for coaching workflows.",
    });
    analyzeConversation(db, ws.id);
    analyzeAiLife(db, ws.id);
    return { ws, thread };
  }

  it("filters unrelated continuity for general knowledge questions", () => {
    const db = session();
    const { ws, thread } = seedWorkspace(db);
    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "How do I cook rice?",
      recentMessages: [],
    });
    expect(result.relevantProjects).toHaveLength(0);
    expect(result.relevantGoals).toHaveLength(0);
    expect(result.relevantContinuity.decisions).toHaveLength(0);
    expect(result.suppressLegacyMemory).toBe(true);
    expect(result.awarenessBlock).toContain("unrelated to stored projects");
  });

  it("surfaces provider continuity when user continues provider work", () => {
    const db = session();
    const { ws, thread } = seedWorkspace(db);
    const goals = extractLongTermGoals(db, ws.id, thread.id);
    const projects = extractActiveProjects(db, ws.id, thread.id);
    const continuity = determineRelevantContinuity(
      db,
      ws.id,
      thread.id,
      "Continue the provider work and unresolved provider decisions.",
      projects,
      goals,
    );
    expect(continuity.decisions.length + continuity.openQuestions.length).toBeGreaterThan(0);

    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "Continue the provider work.",
      recentMessages: [],
    });
    expect(result.relevantProjects.length + result.relevantContinuity.decisions.length).toBeGreaterThan(0);
    expect(result.awarenessBlock).toContain("Never fabricate");
  });

  it("calculates internal awareness confidence metrics", () => {
    const db = session();
    const { ws, thread } = seedWorkspace(db);
    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "Continue the provider work.",
      recentMessages: [],
    });
    const metrics = calculateAwarenessConfidence({
      relevantGoals: result.relevantGoals,
      relevantProjects: result.relevantProjects,
      relevantContinuity: result.relevantContinuity,
      relevantHistory: result.relevantHistory,
      memoryConfidence: result.confidence.memoryConfidence,
      generalKnowledgeQuery: false,
    });
    expect(metrics.awarenessConfidence).toBeGreaterThan(0);
    expect(metrics.projectConfidence).toBeGreaterThanOrEqual(0);
    expect(metrics.goalConfidence).toBeGreaterThanOrEqual(0);
    expect(metrics.continuityConfidence).toBeGreaterThanOrEqual(0);
    expect(metrics.memoryConfidence).toBeGreaterThanOrEqual(0);
  });
});

describe("continuity awareness scale testing", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("handles 10k message awareness scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Awareness 10k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAwarenessScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 10_000,
      label: "aware-10k",
    });
    expect(result.messageCount).toBe(10_000);
    expect(result.rebuildSuccess).toBe(true);
    expect(result.awarenessConfidence).toBeGreaterThan(0);
  }, 180_000);

  it("handles 50k message awareness scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Awareness 50k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAwarenessScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 50_000,
      label: "aware-50k",
    });
    expect(result.messageCount).toBe(50_000);
    expect(result.rebuildSuccess).toBe(true);
  }, 300_000);

  it("handles 100k message awareness scale simulation", () => {
    const db = session();
    const ws = createWorkspace(db, "Awareness 100k");
    const thread = createThread(db, ws.id, "Main");
    const result = runAwarenessScaleSimulation(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      messageCount: 100_000,
      label: "aware-100k",
    });
    expect(result.messageCount).toBe(100_000);
    expect(result.rebuildSuccess).toBe(true);
  }, 600_000);
});
