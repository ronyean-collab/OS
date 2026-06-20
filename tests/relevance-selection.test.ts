import { afterEach, describe, expect, it } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { createThread, createWorkspace } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  RELEVANCE_SURFACE_THRESHOLD,
  buildConversationAwarenessContext,
} from "../electron/main/services/continuity-awareness-service";
import { analyzeAiLife } from "../electron/main/services/ai-life-service";
import { analyzeConversation } from "../electron/main/services/continuity-intelligence-service";

describe("relevance selection", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const opened = openTestDatabase();
    cleanups.push(opened.cleanup);
    return opened.db;
  }

  it("uses relevance threshold to filter low-scoring continuity", () => {
    const db = session();
    const ws = createWorkspace(db, "Relevance");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "We decided to adopt provider independence for ContinuityOS.",
    });
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS provider adapters.",
    });
    analyzeConversation(db, ws.id);
    analyzeAiLife(db, ws.id);

    const providerResult = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "Continue provider adapter work.",
      recentMessages: [],
    });
    expect(providerResult.relevanceScore).toBeGreaterThanOrEqual(RELEVANCE_SURFACE_THRESHOLD);

    const offTopicResult = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "How do I cook rice?",
      recentMessages: [],
    });
    expect(offTopicResult.relevantProjects).toHaveLength(0);
    expect(offTopicResult.relevantContinuity.decisions).toHaveLength(0);
  });

  it("returns scored outputs for awareness and confidence", () => {
    const db = session();
    const ws = createWorkspace(db, "Scores");
    const thread = createThread(db, ws.id, "Main");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Working on ContinuityOS provider milestones.",
    });
    analyzeAiLife(db, ws.id);

    const result = buildConversationAwarenessContext(db, {
      workspaceId: ws.id,
      threadId: thread.id,
      currentMessage: "Status on ContinuityOS provider milestones?",
      recentMessages: [],
    });
    expect(result.awarenessScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidence.awarenessConfidence).toBeGreaterThanOrEqual(0);
  });
});
